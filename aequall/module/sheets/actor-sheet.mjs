import { onRollFlux } from "../helpers/flux-handler.mjs";
import { CharacterCreatorApp } from "../apps/character-creator.mjs";
import { AEQUALL_CONFIG } from "../config.mjs";

export class AequallActorSheet extends ActorSheet {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["aequall", "sheet", "actor"],
      // CHEMIN CORRIGÉ : 'template' (singulier)
      template: "systems/aequall/template/actor/actor-sheet.html",
      width: 850, 
      height: 780, 
      tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "status" }]
    });
  }

  getData() {
    const context = super.getData();
    context.system = context.actor.system;

    // Utilitaire clamp (en v13, clamp est sous primitives.Math.clamp; évite la casse d'API)
    const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
    
    // SÉCURITÉ : Empêche le plantage si 'details' n'existe pas (ex: NPC basique)
    context.isLocked = context.system.details?.isLocked?.value || false;

    // État persistant : personnage validé dans le créateur
    context.isCreated = !!this.actor.getFlag("aequall", "characterCreated");

    // Permissions (tu voulais surtout des règles GM-only, pas juste isLocked)
    context.isGM = game.user.isGM;
    context.canEditIdentity = context.isGM;    // peuple / vocation
    context.canEditMastery = context.isGM;     // cases maîtrise
    context.canEditCurrency = context.isGM;    // monnaie
    context.canCreateOrEditItems = context.isGM; // create/edit items
    
    // Listes de configuration pour les menus déroulants
    context.qualitiesList = Object.entries(AEQUALL_CONFIG.qualities).map(([k, v]) => ({ key: k, label: v.label }));
    context.flawsList = Object.entries(AEQUALL_CONFIG.flaws).map(([k, v]) => ({ key: k, label: v.label }));
    // Descriptions Qualités / Défauts sélectionnés (affichage Biographie)
    const q1 = context.system.attributes?.qualite1?.value || "";
    const q2 = context.system.attributes?.qualite2?.value || "";
    const d1 = context.system.attributes?.defaut1?.value || "";
    const d2 = context.system.attributes?.defaut2?.value || "";
    context.q1Desc = q1 && AEQUALL_CONFIG.qualities?.[q1]?.effect ? AEQUALL_CONFIG.qualities[q1].effect : "Aucune qualité sélectionnée.";
    context.q2Desc = q2 && AEQUALL_CONFIG.qualities?.[q2]?.effect ? AEQUALL_CONFIG.qualities[q2].effect : "Aucune qualité sélectionnée.";
    context.d1Desc = d1 && AEQUALL_CONFIG.flaws?.[d1]?.effect ? AEQUALL_CONFIG.flaws[d1].effect : "Aucun défaut sélectionné.";
    context.d2Desc = d2 && AEQUALL_CONFIG.flaws?.[d2]?.effect ? AEQUALL_CONFIG.flaws[d2].effect : "Aucun défaut sélectionné.";

    context.races = AEQUALL_CONFIG.races;
    context.vocations = AEQUALL_CONFIG.vocations;
    
    // Données dérivées pour l'affichage (avec valeurs par défaut)
    context.derivedInit = context.system.attributes.init?.value ?? 0;
    context.derivedDefense = context.system.attributes.defense?.total ?? 0; 
    context.derivedMaxHp = context.system.attributes.hp?.max ?? 10;
    
    // Calcul pourcentage PV (Math.clamp n'existe pas en JS standard)
    const hpValue = context.system.attributes.hp?.value ?? 0;
    context.hpPercent = clamp((hpValue / context.derivedMaxHp) * 100, 0, 100);

    // Calcul des points de création restants (si en cours de création)
    // Logique : Somme des attributs vs Budget (Optionnel pour l'affichage)
    let totalAttr = 0;
    ['cur', 'pru', 'avi', 'env'].forEach(k => {
        totalAttr += (context.system.attributes[k]?.value || 0);
    });
    context.pointsAvailable = 3 - totalAttr; 

    // Gestion de l'équipement (slots)
    const eq = context.system.equipment || {};
    context.equipped = {
        weapon: eq.weapon ? context.actor.items.get(eq.weapon) : null,
        armor: eq.armor ? context.actor.items.get(eq.armor) : null,
        accessory: eq.accessory ? context.actor.items.get(eq.accessory) : null
    };

    // Calcul Encombrement
    context.totalWeight = context.system.details.weight || 0;
    // Capacité de port : Avidité + 5 (exemple de règle)
    const avi = context.system.attributes.avi?.total || 0;
    context.maxWeight = 5 + avi + (context.system.attributes.qualite1?.value === 'dos' ? 5 : 0); 
    context.weightPct = clamp((context.totalWeight / context.maxWeight) * 100, 0, 100);
    context.isOverencumbered = context.totalWeight > context.maxWeight;

    // Séparation de l'inventaire
    // IMPORTANT: on s'appuie sur this.actor.items (Documents) pour éviter les cas où context.items
    // ne contient pas ce que l'on attend selon le cycle de rendu.
    const ownedItems = this.actor.items.contents;
    context.gear = ownedItems.filter(i => ["item", "weapon", "armor"].includes(i.type));
    context.features = ownedItems.filter(i => i.type === 'feature');
    context.spells = ownedItems.filter(i => i.type === 'spell');

    // Descriptions dynamiques pour les tooltips
    context.raceDescription = AEQUALL_CONFIG.raceBonuses[context.system.details.race?.value] || "";

    return context;
  }

  activateListeners(html) {
    super.activateListeners(html);

    // Drag & drop (Foundry ne rend pas toujours les lignes draggable sur un template custom)
    html.find(".item").attr("draggable", true);
    html.find(".item").on("dragstart", this._onDragStart.bind(this));

    // 1. Ouvrir le Créateur de Personnage / Résumé
    html.find('button.create-char-btn').click(ev => {
      ev.preventDefault();
      new CharacterCreatorApp(this.actor).render(true);
    });

    html.find('button.summary-btn').click(ev => {
      ev.preventDefault();
      this._showCreationSummary();
    });

    // Icône "?" en haut : aide de la fiche (rappel des règles d'utilisation)
    html.find('.rules-btn').click(ev => {
      ev.preventDefault();
      this._showSheetHelp();
    });

    // 2. Drag & Drop Équipement (V13)
    // Important : il faut aussi empêcher le navigateur de traiter le drop (dragover).
    html.find('.equip-slot')
      .on('dragover', ev => {
        ev.preventDefault();
      })
      .on('drop', async ev => {
        ev.preventDefault();
        ev.stopPropagation();

        const slot = $(ev.currentTarget).data("slot");
        if (!slot) return;

        const data = TextEditor.getDragEventData(ev.originalEvent);
        if (data?.type !== "Item") return;

        // Compatible drag depuis l'acteur, le répertoire, un compendium
        const item = await Item.fromDropData(data);
        if (!item) return;

        // Slots : weapon / armor / accessory
        let owned = this.actor.items.get(item.id);

        // Si l'objet vient du répertoire (pas encore possédé), on l'ajoute d'abord au sac
        if (!owned) {
          if (!game.user.isGM) return ui.notifications.warn("Demandez au MJ d'ajouter cet objet à votre inventaire avant de l'équiper.");
          const created = await this.actor.createEmbeddedDocuments("Item", [item.toObject()]);
          owned = created?.[0] ? this.actor.items.get(created[0].id) : null;
        }
        if (!owned) return ui.notifications.error("Impossible d'équiper cet objet.");

        await this.actor.update({ [`system.equipment.${slot}`]: owned.id });
        this.render(false);
      });

    // 3. Déséquiper
    html.find('.unequip-btn').click(async ev => {
        ev.preventDefault();
        const slot = $(ev.currentTarget).data("slot");
        await this.actor.update({ [`system.equipment.${slot}`]: null });
        this.render(false);
    });

    // 4. Jets de dés (Attributs & Compétences)
    html.find('.rollable').click(this._onRoll.bind(this));
    
    // 5. Click sur un objet : fenêtre d'info + bouton Utiliser (arme, sort, objet...)
    html.find('.item-info').on('click', ev => {
      ev.preventDefault();
      ev.stopPropagation();
      const li = ev.currentTarget.closest('.item');
      const itemId = li?.dataset?.itemId || ev.currentTarget.dataset?.itemId;
      if (!itemId) return;
      const item = this.actor.items.get(itemId);
      if (item) this._showItemInfo(item);
    });

    // 6. Lancer le Flux (Magie)
    html.find('.flux-box').click(ev => { 
        ev.preventDefault(); 
        onRollFlux(this.actor); 
    });

    // 7. Bouton Repos (Reset Flux)
    html.find('.rest-btn').click(async ev => {
        ev.preventDefault();
        await this.actor.update({ "system.attributes.flux.value": 0 });
        ChatMessage.create({content: `${this.actor.name} se repose et dissipe son Flux.`});
    });
    
    // 8. Gestion items
    // - Joueurs : suppression OK, create/edit NON
    // - MJ : tout OK
    if (this.isEditable) {
      const isGM = game.user.isGM;

      html.find('.item-create').click(ev => {
        if (!isGM) return ui.notifications.warn("Seul le MJ peut créer des objets.");
        return this._onItemCreate(ev);
      });

      html.find('.item-edit').click(ev => {
        if (!isGM) return ui.notifications.warn("Seul le MJ peut modifier des objets.");
        const li = $(ev.currentTarget).parents('.item');
        const item = this.actor.items.get(li.data('itemId'));
        item?.sheet?.render(true);
      });

      // Delete autorisé pour tous les propriétaires
      html.find('.item-delete').click(ev => {
        const li = $(ev.currentTarget).parents('.item');
        const item = this.actor.items.get(li.data('itemId'));
        item?.delete();
      });

      // Verrouillage de la fiche (MJ-only conseillé)
      html.find('.lock-btn').click(async ev => {
        ev.preventDefault();
        if (!isGM) return ui.notifications.warn("Seul le MJ peut verrouiller/déverrouiller la fiche.");
        const current = this.actor.system.details.isLocked?.value || false;
        await this.actor.update({ 'system.details.isLocked.value': !current });
      });
    }
  }

  /**
   * Résumé de création (affiché par le bouton "Voir le résumé" et l'icône "?")
   */
  _showCreationSummary() {
    const s = this.actor.system;
    const race = s.details?.race?.value ?? '—';
    const voc = s.details?.vocation?.value ?? '—';
    const kingdom = s.details?.kingdom?.value ?? '—';
    const q1 = s.attributes?.qualite1?.value ?? '—';
    const q2 = s.attributes?.qualite2?.value ?? '—';
    const d1 = s.attributes?.defaut1?.value ?? '—';
    const d2 = s.attributes?.defaut2?.value ?? '—';
    const cur = s.attributes?.cur?.total ?? 0;
    const pru = s.attributes?.pru?.total ?? 0;
    const avi = s.attributes?.avi?.total ?? 0;
    const env = s.attributes?.env?.total ?? 0;
    const hp = s.attributes?.hp?.value ?? 0;
    const hpMax = s.attributes?.hp?.max ?? 0;

    const content = `
      <div style="line-height:1.5">
        <h2 style="margin:0 0 6px 0;">${this.actor.name}</h2>
        <b>Royaume :</b> ${kingdom}<br>
        <b>Peuple :</b> ${race}<br>
        <b>Vocation :</b> ${voc}<br>
        <b>Qualités :</b> ${q1}, ${q2}<br>
        <b>Défauts :</b> ${d1}, ${d2}<br>
        <hr>
        <b>Piliers :</b> Cur ${cur} / Pru ${pru} / Avi ${avi} / Env ${env}<br>
        <b>PV :</b> ${hp} / ${hpMax}
      </div>
    `;

    new Dialog({
      title: 'Résumé de création',
      content,
      buttons: { ok: { label: 'OK' } }
    }).render(true);
  }

  async _updateObject(event, formData) {
    // Anti-bidouille : même si un joueur modifie le HTML, on bloque côté serveur
    if (!game.user.isGM) {
      const blockedKeys = [
        'system.details.race.value',
        'system.details.vocation.value',
        'system.currency.gp',
        'system.currency.sp',
        'system.currency.cp',
        'system.attributes.cur.maitrise',
        'system.attributes.pru.maitrise',
        'system.attributes.avi.maitrise',
        'system.attributes.env.maitrise'
      ];
      for (const k of blockedKeys) delete formData[k];
    }
    return super._updateObject(event, formData);
  }

  async _onRoll(event) {
    event.preventDefault();
    const dataset = event.currentTarget.dataset;
    if (dataset.roll) {
      let roll = new Roll(dataset.roll, this.actor.getRollData());
      await roll.roll();
      roll.toMessage({ 
          speaker: ChatMessage.getSpeaker({ actor: this.actor }), 
          flavor: `<span style="color:#D97706; font-weight:bold;">${dataset.label || 'Action'}</span>` 
      });
    }
  }

  async _onItemCreate(event) {
    event.preventDefault();
    const type = event.currentTarget.dataset.type;
    await Item.create({name: `Nouveau ${type}`, type: type, img: "icons/svg/item-bag.svg"}, {parent: this.actor});
  }

  /**
   * Aide de la fiche (icône ?): rappelle les usages des piliers et champs.
   */
  _showSheetHelp() {
    const content = `
      <div class="aequall-help" style="line-height:1.5">
        <h2 style="margin:0 0 8px 0;">Aide — Fiche Personnage</h2>
        <p><b>Les 4 Piliers</b> (tests sur 1d20 + pilier) :</p>
        <ul>
          <li><b>Curiosité</b> : magie, savoir, fouille, artefacts.</li>
          <li><b>Prudence</b> : tactique, soins, précision (armes légères), défense.</li>
          <li><b>Avidité</b> : force brute, armes lourdes, intimidation, résistance physique.</li>
          <li><b>Envie</b> : charisme, bluff, tir à distance, agilité, réflexes.</li>
        </ul>
        <p><b>Maîtrise</b> : coche si ton personnage est particulièrement compétent sur ce pilier (selon règles du MJ).</p>
        <p><b>Flux</b> : nombre de d6 disponibles pour alimenter tes actions/effets.</p>
        <hr>
        <p style="color:#aaa; font-size:12px;">
          Astuce : clique sur un objet dans l'inventaire pour ouvrir sa description et le bouton <b>Utiliser</b>.
        </p>
      </div>
    `;
    new Dialog({ title: "Aide — Fiche", content, buttons: { ok: { label: "OK" } } }).render(true);
  }

  /**
   * Popup description objet + bouton Utiliser (consommables).
   */
  
  _looksLikeDiceFormula(str) {
    if (!str) return false;
    const s = String(str).trim();
    // Accepte: 2d6, 1d20+3, 2d6 + @mod, etc.
    return /[0-9]\s*d\s*[0-9]/i.test(s);
  }


  _normalizeFormula(raw) {
    if (raw === null || raw === undefined) return "";
    if (typeof raw === "string") return raw.trim();
    if (typeof raw === "number") return String(raw);
    if (typeof raw === "object") {
      // Schémas fréquents: {value:"1d6"} ou {formula:"1d6"}
      if (typeof raw.value === "string" || typeof raw.value === "number") return String(raw.value).trim();
      if (typeof raw.formula === "string") return raw.formula.trim();
      if (typeof raw.damage === "string") return raw.damage.trim();
    }
    const s = String(raw).trim();
    return s === "[object Object]" ? "" : s;
  }


  _getItemAction(item) {
    const macroName = item.getFlag("aequall", "macroName") || item.flags?.aequall?.macroName || "";
    const rawDesc = item.system?.description?.value || "";
    const textBlob = `${item.name} ${rawDesc}`.toLowerCase();

    // Formule prioritaire : system.action.formula > macroName (si ressemble à un jet) > weapon.damage.value
    const sysAction = item.system?.action || {};
    const rawFormula =
      sysAction.formula ||
      (this._looksLikeDiceFormula(macroName) ? macroName : "") ||
      item.system?.damage?.value ||
      item.system?.damage ||
      item.system?.formula ||
      "";
    const formula = this._normalizeFormula(rawFormula);

    // Type d'action
    let type = sysAction.type;
    if (!type) {
      if (item.type === "weapon" || item.type === "spell") type = "attack";
      else if (item.type === "item") {
        if (/potion|soin|bandage|elixir|élixir|rem[eè]de|injection|serum|s[ée]rum/.test(textBlob)) type = "heal";
        else type = formula ? "utility" : "utility";
      } else type = "utility";
    }

    // Pilier (selon ton mapping)
    let pillar = sysAction.pillar;
    if (!pillar) {
      if (item.type === "spell") pillar = "cur";
      else if (item.type === "weapon") {
        const range = Number(item.system?.range?.value ?? item.system?.range ?? 0);
        pillar = range > 0 ? "env" : "avi"; // arc/à distance => ENV, épée/mêlée => AVI
      } else pillar = "cur";
    }

    // Libellé bouton
    let label = "Utiliser";
    if (type === "attack") label = item.type === "spell" ? "Lancer" : "Attaquer";
    if (type === "heal") label = "Soigner";

    // Macro Foundry : seulement si macroName n'est pas une formule
    const macro = (!this._looksLikeDiceFormula(macroName) && macroName)
      ? game.macros?.find(m => m.name === macroName)
      : null;

    return { type, pillar, formula, macroName, macro, label };
  }

  async _useItem(item, action) {
    const actor = this.actor;

    // Normalise formule (évite [object Object])
    action.formula = this._normalizeFormula(action.formula);


    // Gestion cible
    const targets = [...game.user.targets];
    const targetToken = targets[0] || null;
    const targetActor = targetToken?.actor || null;

    if (action.type === "attack" && !targetActor) {
      ui.notifications.warn("Cible manquante : cible un ennemi (T) puis réessaie.");
      return;
    }

    // Exécution macro custom (si présente) : fallback
    if (action.macro && !action.formula) {
      try {
        await action.macro.execute();
      } catch (e) {
        console.error(e);
        ui.notifications.error("Erreur lors de l'exécution de la macro.");
      }
      // Consommation éventuelle
      await this._consumeItemIfNeeded(item, action);
      return;
    }

    // Attaque
    if (action.type === "attack") {
      const atkTotal = Number(actor.system?.attributes?.[action.pillar]?.total ?? 0);
      const mastery = !!actor.system?.attributes?.[action.pillar]?.maitrise;
      const masteryBonus = mastery ? 2 : 0;

      const atkRoll = await (new Roll(`1d20 + ${atkTotal} + ${masteryBonus}`)).evaluate();
      const def = Number(targetActor.system?.attributes?.defense?.total ?? 10);

      const hit = atkRoll.total >= def;

      let dmgRoll = null;
      let dmgTotal = 0;

      if (hit && action.formula) {
        dmgRoll = await (new Roll(action.formula, actor.getRollData())).evaluate();
        dmgTotal = Number(dmgRoll.total ?? 0);
      }

      // Message chat
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: `
          <div class="aequall-chat-card">
            <h3>${actor.name} — ${item.name}</h3>
            <div><b>Attaque (${action.pillar.toUpperCase()})</b> : ${atkRoll.total} vs Défense ${def} → ${hit ? "<span style='color:#10b981'><b>TOUCHÉ</b></span>" : "<span style='color:#ef4444'><b>ÉCHEC</b></span>"}</div>
            ${hit ? `<div><b>Dégâts</b> : ${dmgTotal}${dmgRoll ? ` <span style="color:#aaa">(${action.formula})</span>` : ""}</div>` : ""}
          </div>`
      });

      // Appliquer dégâts si possible
      if (hit && dmgTotal > 0) {
        try {
          const hpPath = "system.attributes.hp.value";
          const curHP = Number(targetActor.system?.attributes?.hp?.value ?? 0);
          const newHP = Math.max(0, curHP - dmgTotal);
          await targetActor.update({ [hpPath]: newHP });
        } catch (e) {
          console.warn(e);
          ui.notifications.warn("Impossible d'appliquer les dégâts automatiquement (permissions). MJ requis.");
        }
      }

      await this._consumeItemIfNeeded(item, action);
      return;
    }

    // Soin
    if (action.type === "heal") {
      const healTarget = targetActor || actor; // si pas de cible: soi-même
      if (!action.formula) {
        ui.notifications.warn("Aucune formule de soin définie (mets ex: 2d6 dans Macro/jet de l'objet).");
        return;
      }
      const healRoll = await (new Roll(action.formula, actor.getRollData())).evaluate();
      const healTotal = Number(healRoll.total ?? 0);

      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: `
          <div class="aequall-chat-card">
            <h3>${actor.name} utilise ${item.name}</h3>
            <div><b>Soin</b> : ${healTotal} <span style="color:#aaa">(${action.formula})</span> → <b>${healTarget.name}</b></div>
          </div>`
      });

      try {
        const hpPath = "system.attributes.hp.value";
        const curHP = Number(healTarget.system?.attributes?.hp?.value ?? 0);
        const maxHP = Number(healTarget.system?.attributes?.hp?.max ?? curHP + healTotal);
        const newHP = Math.min(maxHP, curHP + healTotal);
        await healTarget.update({ [hpPath]: newHP });
      } catch (e) {
        console.warn(e);
        ui.notifications.warn("Impossible d'appliquer le soin automatiquement (permissions). MJ requis.");
      }

      await this._consumeItemIfNeeded(item, action);
      return;
    }

    // Utilitaire
    if (!action.formula && action.macro) {
      try { await action.macro.execute(); } catch (e) { console.error(e); }
    } else if (action.formula) {
      const roll = await (new Roll(action.formula, actor.getRollData())).evaluate();
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: `<div class="aequall-chat-card"><h3>${actor.name} utilise ${item.name}</h3><div>Résultat : <b>${roll.total}</b> <span style="color:#aaa">(${action.formula})</span></div></div>`
      });
    } else {
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: `<div class="aequall-chat-card"><h3>${actor.name} utilise ${item.name}</h3><div>${actor.name} utilise ${item.name}.</div></div>`
      });
    }

    await this._consumeItemIfNeeded(item, action);
  }

  async _consumeItemIfNeeded(item, action) {
    // On consomme seulement les objets "item" qui ont une quantité
    const consumeFlag = item.system?.action?.consume;
    if (consumeFlag === false) return;

    const qtyObj = item.system?.quantity;
    const qty = (qtyObj && typeof qtyObj === "object") ? Number(qtyObj.value ?? 0) : Number(qtyObj ?? 0);
    if (!(item.type === "item" && qty > 0)) return;

    const newQty = Math.max(0, qty - 1);

    try {
      if (newQty <= 0) await item.delete();
      else if (qtyObj && typeof qtyObj === "object") await item.update({ "system.quantity.value": newQty });
      else await item.update({ "system.quantity": newQty });
    } catch (e) {
      console.warn(e);
    }
  }

  async _showItemInfo(item) {
    // Évite les doubles fenêtres si un autre handler déclenche un render
    if (this._itemInfoDialog?.rendered) this._itemInfoDialog.close();

    const desc = item.system?.description?.value || "<p><i>Aucune description.</i></p>";
    const TE = foundry?.applications?.ux?.TextEditor?.implementation || TextEditor;
    const enriched = await TE.enrichHTML(desc, { async: true });

    const qtyObj = item.system?.quantity;
    const qty = (qtyObj && typeof qtyObj === "object") ? Number(qtyObj.value ?? 0) : Number(qtyObj ?? 0);

    const action = this._getItemAction(item);

    const content = `
      <div style="display:flex; gap:10px; align-items:flex-start;">
        <img src="${item.img}" style="width:48px; height:48px; border:1px solid #444; border-radius:6px; object-fit:cover;">
        <div style="flex:1">
          <h2 style="margin:0 0 6px 0;">${item.name}</h2>
          ${enriched}
          ${item.type === "item" ? `<p style="margin-top:8px; color:#aaa; font-size:12px;">Quantité : <b>${qty}</b></p>` : ""}
          ${action.formula ? `<p style="margin-top:6px; color:#D97706; font-size:12px;">Jet : <b>${action.formula}</b> — Type : <b>${action.type}</b></p>` : ""}
        </div>
      </div>
    `;

    const buttons = {
      use: {
        label: action.label,
        callback: async () => this._useItem(item, action)
      },
      close: { label: "Fermer" }
    };

    this._itemInfoDialog = new Dialog({ title: item.name, content, buttons });
    this._itemInfoDialog.render(true);
  }


}