import { AequallActor } from "./module/documents/actor.mjs";
import { AequallActorSheet } from "./module/sheets/actor-sheet.mjs";
import { AequallItemSheet } from "./module/sheets/item-sheet.mjs";
import { FractureGame } from "./module/apps/fracture.mjs";
import { BattleHUDApp } from "./module/apps/battle-hud.mjs";
import { CharacterCreatorApp } from "./module/apps/character-creator.mjs";
import { MerchantApp } from "./module/apps/merchant-app.mjs";
import { AEQUALL_CONFIG } from "./module/config.mjs";
import { ModuleManagerApp } from "./module/apps/module-manager.mjs";


Hooks.once("init", function() {
  console.log("Aequall V3.0 | Initialisation Finale");

  CONFIG.Actor.documentClass = AequallActor;
  CONFIG.AEQUALL = AEQUALL_CONFIG;

  Actors.unregisterSheet("core", ActorSheet);
  Actors.registerSheet("aequall", AequallActorSheet, { makeDefault: true });
  
  Items.unregisterSheet("core", ItemSheet);
  Items.registerSheet("aequall", AequallItemSheet, { makeDefault: true });

  // Helpers Handlebars indispensables
  Handlebars.registerHelper('eq', (a, b) => a === b);
  Handlebars.registerHelper('gt', (a, b) => a > b);
  Handlebars.registerHelper('lt', (a, b) => a < b);
  Handlebars.registerHelper('or', (a, b, c) => a || b || c);
  Handlebars.registerHelper('and', (a, b) => a && b);
  Handlebars.registerHelper('not', (a) => !a);
  Handlebars.registerHelper('localizeType', (val) => val ? val.toUpperCase() : "ITEM");

  // Initiative (évite les StringTerm undefined)
  CONFIG.Combat.initiative = CONFIG.Combat.initiative || {};
  CONFIG.Combat.initiative.formula = "1d20 + @attributes.env.total";

});


// --- Liaison automatique Token <-> Acteur (évite les acteurs non liés) ---
// 1) Nouveaux tokens : liés par défaut aux personnages
Hooks.on("preCreateToken", (tokenDoc, data, options, userId) => {
    try {
        const actor = tokenDoc.actor;
        if (!actor) return;
        if (actor.type !== "character") return;
        if (tokenDoc.actorLink) return;
        tokenDoc.updateSource({ actorLink: true });
    } catch (e) {
        console.warn(e);
    }
});

// 2) Scène active : convertit les tokens non liés (MJ uniquement)
Hooks.on("canvasReady", async () => {
    if (!game.user.isGM) return;
    const scene = canvas?.scene;
    if (!scene) return;

    const toLink = scene.tokens.filter(t => !t.actorLink && t.actor?.type === "character");
    if (!toLink.length) return;

    try {
        await scene.updateEmbeddedDocuments("Token", toLink.map(t => ({ _id: t.id, actorLink: true })));
        ui.notifications.info(`🔗 ${toLink.length} token(s) liés à leur acteur.`);
    } catch (e) {
        console.warn(e);
    }
});


Hooks.once("ready", () => {
    // --- EXPOSITION GLOBALE POUR MACROS ---
    // Indispensable pour que vos macros et modules externes (Monks) trouvent les fonctions
    game.aequall = {
        FractureGame: FractureGame,
        BattleHUD: BattleHUDApp,
        MerchantApp: MerchantApp,
        CharacterCreator: CharacterCreatorApp,
        ModuleManagerApp: ModuleManagerApp, // <--- AJOUT CRUCIAL ICI
        
        launchMerchantApp: () => new MerchantApp({isConfigMode: true}).render(true),
        launchScission: () => new FractureGame().render(true),
        launchBattleHUD: () => BattleHUDApp.renderOrUpdate(),
        launchModuleManager: () => new ModuleManagerApp().render(true), // Helper pratique
        // Ajout de la fonction invite pour le chat comme demandé
        inviteScission: () => FractureGame.invite()
    };

    // Rétro-compatibilité pour les anciennes macros
    window.launchScission = game.aequall.launchScission;
    window.launchMerchantApp = game.aequall.launchMerchantApp;
    window.launchBattleHUD = game.aequall.launchBattleHUD;
    

    // --- HUD COMBAT: reset action/move à chaque changement de tour + rafraîchissement ---
    Hooks.on("combatTurn", async (combat) => {
        const c = combat.combatant;
        if (!c) return;

        const moveDefault = 9; // mètres (limite par tour)
        const state = { actionUsed: false, moveUsed: false, moveRemaining: moveDefault };
        await c.setFlag("aequall", "turnState", state);

        if (c.actor?.isOwner) BattleHUDApp.renderOrUpdate();
    });

    Hooks.on("updateCombat", () => {
        if (BattleHUDApp._instance?.rendered) BattleHUDApp.renderOrUpdate();
    });

    // Rafraîchir le HUD quand la cible change (Touche T)
    Hooks.on("targetToken", () => {
        if (BattleHUDApp._instance?.rendered) BattleHUDApp.renderOrUpdate();
    });

    // --- Limitation du déplacement par tour ---
    Hooks.on("preUpdateToken", async (tokenDoc, change, options, userId) => {
        if (!game.combat) return;
        if (userId !== game.user.id) return;
        if (change.x === undefined && change.y === undefined) return;

        const c = game.combat.combatants.find(cb => cb.tokenId === tokenDoc.id);
        if (!c) return;
        if (game.combat.combatant?.id !== c.id) return;

        const state = c.getFlag("aequall", "turnState");
        if (!state) return;

        const from = { x: tokenDoc.x, y: tokenDoc.y };
        const to = { x: change.x ?? tokenDoc.x, y: change.y ?? tokenDoc.y };

        const dist = canvas?.grid?.measureDistance ? canvas.grid.measureDistance(from, to) : 0;
        // 1 déplacement par tour, limité à 9m
        if (state.moveUsed) {
            ui.notifications.warn("Déplacement déjà utilisé ce tour.");
            return false;
        }

        const moveMax = 9;
        if (dist > moveMax + 1e-6) {
            ui.notifications.warn(`Déplacement limité : max ${moveMax}m.`);
            return false;
        }

        await c.setFlag("aequall", "turnState", { ...state, moveRemaining: 0, moveUsed: true });

        if (BattleHUDApp._instance?.rendered) BattleHUDApp.renderOrUpdate();
    });


    console.log("Aequall | Macros chargées et prêtes.");

    // --- SOCKET SYSTEME (transactions marchand, etc.) ---
    // Les joueurs demandent, le MJ applique.
    game.socket.on("system.aequall", async (payload) => {
        if (!game.user.isGM) return;
        if (payload?.type?.startsWith("merchant:")) {
            await MerchantApp.handleSocket(payload);
            return;
        }
        if (payload?.type === "hp:adjust") {
            const user = game.users.get(payload.userId);
            if (!user) return;
            const sourceActor = payload.sourceActorUuid ? await fromUuid(payload.sourceActorUuid) : null;
            const targetActor = payload.targetActorUuid ? await fromUuid(payload.targetActorUuid) : null;
            if (!sourceActor || !targetActor) return;
            if (!sourceActor.testUserPermission(user, "OWNER")) return;

            const delta = Number(payload.delta ?? 0);
            if (!Number.isFinite(delta) || delta === 0) return;

            const hpPath = "system.attributes.hp.value";
            const curHP = Number(targetActor.system?.attributes?.hp?.value ?? 0);
            const maxHP = Number(targetActor.system?.attributes?.hp?.max ?? curHP);
            const clamp = foundry.utils?.clamp ?? ((n, min, max) => Math.min(max, Math.max(min, n)));
            const newHP = clamp(curHP + delta, 0, maxHP);
            await targetActor.update({ [hpPath]: newHP });
        }
    });
});

// --- INTERACTION CHAT (COMPATIBILITÉ V13) ---
// Utilisation de renderChatMessageHTML au lieu de renderChatMessage (déprécié)
Hooks.on("renderChatMessageHTML", (message, html) => {
    const $html = $(html);

    // 1. Bouton "Rejoindre le Magasin"
    $html.find('.join-shop-btn').click(ev => {
        ev.preventDefault();
        const flags = message.flags?.aequall || {};

        if (!flags.shopActorId || !flags.buyerActorId) {
            return ui.notifications.warn("Données du magasin invalides ou expirées.");
        }

        const buyer = game.actors.get(flags.buyerActorId);
        if (!buyer) return ui.notifications.warn("Acheteur introuvable.");

        // Sécurité : seul le joueur propriétaire de l'acheteur (ou MJ) peut ouvrir
        if (!game.user.isGM && !buyer.isOwner) {
            return ui.notifications.warn("Ce magasin n'est pas pour vous.");
        }

        new MerchantApp({ 
            isConfigMode: false, 
            shopActorId: flags.shopActorId, 
            buyerActorId: flags.buyerActorId, 
            priceModifier: flags.priceModifier || 0 
        }).render(true);
    });

    // 2. Bouton "Rejoindre la Scission"
    $html.find('.join-scission-btn').click(ev => { 
        ev.preventDefault();
        new FractureGame().render(true); 
    });
    
    // 3. Boutons de dégâts MJ (Optionnel)
    $html.find('.gm-apply-damage-btn').click(async ev => {
        if (!game.user.isGM) return;
        ev.preventDefault();
        const btn = $(ev.currentTarget);
        const targetId = btn.data("target-id");
        const damage = btn.data("damage");
        const target = game.actors.get(targetId);
        
        if (target) {
            const currentHp = target.system.attributes.hp.value;
            await target.update({"system.attributes.hp.value": Math.max(0, currentHp - damage)});
            btn.replaceWith("<span style='color:#10b981; font-weight:bold;'>✅ Dégâts Appliqués</span>");
        }
    });
});

// --- VISUEL TOKEN (SANG & MORT) ---
Hooks.on("updateActor", (actor, data) => {
    if (foundry.utils.hasProperty(data, "system.attributes.hp.value")) {
        const hp = data.system.attributes.hp.value;
        const max = actor.system.attributes.hp.max;
        
        actor.getActiveTokens().forEach(token => {
            const t = token.object || token;
            // Icône Sang quand < 50% PV
            t.toggleEffect("icons/svg/blood.svg", { active: hp < (max / 2) && hp > 0 });
            // Icône Crâne quand 0 PV
            t.toggleEffect("icons/svg/skull.svg", { active: hp <= 0, overlay: true });
        });
        
        // Rafraîchir le HUD de combat s'il est ouvert
        Object.values(ui.windows).forEach(app => {
            if (app.id === "aequall-battle-hud") app.render();
        });
    }
});

// --- AUTO HUD COMBAT ---
Hooks.on("updateCombat", (combat, updateData) => {
    if (!updateData.round && !updateData.turn) return;
    const combatant = combat.combatant;
    // Ouvre / rafraîchit le HUD automatiquement au tour du joueur (singleton)
    if (combatant && combatant.actor && combatant.actor.isOwner && combatant.actor.type === "character") {
        BattleHUDApp.renderOrUpdate();
    }
});
