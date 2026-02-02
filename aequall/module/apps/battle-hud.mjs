const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class BattleHUDApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "aequall-battle-hud",
    tag: "div",
    window: { title: "HUD de Combat", resizable: true },
    // height doit être un nombre avec ApplicationV2 ("auto" peut casser setPosition)
    position: { width: 360, height: 520, top: 100, left: 20 }
  };

  static PARTS = { main: { template: "systems/aequall/template/apps/battle-hud.html" } };

  /** Garde une instance unique */
  static _instance = null;

  static renderOrUpdate() {
    if (this._instance && this._instance.rendered) {
      this._instance.render({ force: true });
    } else {
      this._instance = new BattleHUDApp();
      this._instance.render({ force: true });
    }
  }

  _onClose(options) {
    super._onClose?.(options);
    BattleHUDApp._instance = null;
  }

  async _prepareContext(options) {
    const actor = canvas.tokens.controlled[0]?.actor || game.user.character;
    if (!actor) return { hasActor: false };

    const combat = game.combat;
    const combatant = combat?.combatant;
    const myCombatant = combat?.combatants?.find(c => c.actorId === actor.id) || null;
    const isMyTurn = !!(combat && combatant && combatant.actorId === actor.id);

    // Etat de tour (action + déplacement)
    const turnState = (myCombatant && isMyTurn) ? (myCombatant.getFlag("aequall", "turnState") || {}) : {};
    const hasActed = !!turnState.actionUsed;
    const hasMoved = !!turnState.moveUsed;
    const remainingMove = Number.isFinite(turnState.moveRemaining) ? Math.max(0, turnState.moveRemaining) : 0;

    const hp = actor.system.attributes.hp;
    const flux = actor.system.attributes.flux;

    const targets = Array.from(game.user.targets);
    let targetData = null;
    if (targets.length > 0) {
      targetData = {
        name: targets[0].name,
        img: targets[0].document.texture.src,
        ac: targets[0].actor?.system?.attributes?.defense?.total ?? "?"
      };
    }

    const weapons = actor.items.filter(i => i.type === "weapon");
    const consumables = actor.items.filter(i => i.type === "item" && (i.system.quantity?.value ?? 0) > 0);

    // Accessoire "équipé" (si ton système en a un). On cherche un item avec system.equipped=true et type feature/item
    const equippedAccessory = actor.items.find(i => (i.system.equipped?.value ?? i.system.equipped) && (i.type === "feature" || i.type === "item")) || null;

    // Ordre des tours (affichage HUD)
    const turnOrder = combat ? combat.turns.map((t, idx) => ({
      name: t.name,
      img: t.img,
      active: idx === combat.turn,
      next: combat.turns[(idx + 1) % combat.turns.length]?.id === combatant?.id
    })) : [];

    const nextCombatant = combat && combat.turns.length ? combat.turns[(combat.turn + 1) % combat.turns.length] : null;

    return {
      hasActor: true,
      actor,
      hpVal: hp.value,
      hpMax: hp.max,
      hpPercent: hp.max ? (hp.value / hp.max) * 100 : 0,
      fluxVal: flux.value,
      fluxPercent: 100,
      target: targetData,
      weapons,
      consumables,
      equippedAccessory,
      combatActive: !!combat,
      isMyTurn,
      round: combat?.round ?? 0,
      turn: combat?.turn ?? 0,
      currentName: combatant?.name ?? null,
      nextName: nextCombatant?.name ?? null,
      turnOrder,
      hasActed,
      hasMoved,
      remainingMove,
      isLockedByGM: false,
      isDead: hp.value <= 0
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);
    const html = $(this.element);

    // Tooltip d'aide HUD
    html.find('.hud-info-icon').on('mouseenter', () => html.find('.hud-tooltip').show());
    html.find('.hud-info-icon').on('mouseleave', () => html.find('.hud-tooltip').hide());

    // Actions (arme)
    html.find('.action-btn').click(ev => {
      ev.preventDefault();
      const itemId = ev.currentTarget.dataset.itemId;
      this.executeAction(context.actor, itemId);
    });

    // Actions (consommable / accessoire)
    html.find('.use-item-btn').click(ev => {
      ev.preventDefault();
      const itemId = ev.currentTarget.dataset.itemId;
      this.executeAction(context.actor, itemId);
    });

    // Déplacement
    html.find('.move-btn').click(async ev => {
      ev.preventDefault();
      if (!game.combat) return ui.notifications.warn("Pas de combat en cours.");
      if (!context.isMyTurn) return ui.notifications.warn("Ce n'est pas ton tour.");
      const c = game.combat.combatant;
      if (!c) return;

      const state = c.getFlag("aequall", "turnState") || {};
      if (state.moveUsed) return ui.notifications.warn("Déplacement déjà utilisé ce tour.");

      ui.notifications.info("Déplacement autorisé : déplace ton token (limité par le HUD).");
      // Rien d'autre ici : la limitation est faite via le hook preUpdateToken (dans aequall.mjs)
    });

    // Fin de tour
    html.find('.end-turn-btn').click(async ev => {
      ev.preventDefault();
      if (game.combat) await game.combat.nextTurn();
    });

    // Sauvegarde contre la mort (si tu veux la garder manuelle)
    html.find('.death-save-btn').click(async () => {
      const roll = await new Roll("1d20").evaluate();
      roll.toMessage({ flavor: "Jet de Sauvegarde contre la Mort" });
      if (roll.total >= 10) ui.notifications.info("Succès !");
      else ui.notifications.error("Échec...");
    });
  }

  async executeAction(actor, itemId) {
    const item = actor.items.get(itemId);
    if (!item) return;

    const combat = game.combat;
    const combatant = combat?.combatant;

    // Bloque hors tour
    if (combat && combatant?.actorId !== actor.id) {
      return ui.notifications.warn("Ce n'est pas ton tour.");
    }

    // Etat de tour
    if (combatant) {
      const state = combatant.getFlag("aequall", "turnState") || {};
      if (state.actionUsed) return ui.notifications.warn("Action déjà utilisée ce tour.");

      // Marquer action utilisée (on le fait avant pour éviter double-clic)
      await combatant.setFlag("aequall", "turnState", {
        ...state,
        actionUsed: true
      });
    }

    if (item.type === "weapon") {
      const targets = Array.from(game.user.targets);
      if (targets.length === 0) return ui.notifications.warn("Ciblez un ennemi (Touche T) !");

      const target = targets[0].actor;
      const atk = actor.system.attributes?.avi?.total ?? 0;
      const def = target?.system?.attributes?.defense?.total ?? 10;

      const attackRoll = await new Roll(`1d20 + ${atk}`).evaluate();

      let message = `
        <div class="aequall-chat-card">
          <h3>${item.name}</h3>
          <div>Attaque : <b>${attackRoll.total}</b> (vs Défense ${def})</div>
      `;

      if (target && attackRoll.total >= def) {
        const dmgFormula = item.system.damage?.value ?? "1";
        const dmgRoll = await new Roll(dmgFormula, actor.getRollData()).evaluate();
        message += `<div style="color:green; font-weight:bold;">TOUCHÉ ! Dégâts : ${dmgRoll.total}</div>`;

        if (game.user.isGM || target.isOwner) {
          const newHp = (target.system.attributes.hp.value ?? 0) - dmgRoll.total;
          await target.update({ "system.attributes.hp.value": newHp });
        }
      } else {
        message += `<div style="color:red;">MANQUÉ !</div>`;
      }

      message += `</div>`;
      ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: message });
    }

    else if (item.type === "item") {
      const qty = item.system.quantity?.value ?? 0;
      if (qty <= 0) return ui.notifications.warn("Aucune charge restante.");

      await item.update({ "system.quantity.value": Math.max(0, qty - 1) });
      ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: `<div class="aequall-chat-card"><h3>${item.name}</h3><div>${actor.name} utilise ${item.name}.</div></div>`
      });
    }

    // Rafraîchit le HUD
    BattleHUDApp.renderOrUpdate();
  }
}
