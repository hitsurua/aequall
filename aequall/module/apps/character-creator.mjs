const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
import { AEQUALL_CONFIG } from "../config.mjs";

export class CharacterCreatorApp extends HandlebarsApplicationMixin(ApplicationV2) {
    static DEFAULT_OPTIONS = {
        id: "character-creator",
        tag: "form",
        window: { 
            title: "Création de Personnage (Bible V2.3)", 
            icon: "fas fa-user-plus",
            resizable: true, 
            width: 600, 
            height: 750 
        },
        classes: ["aequall-creator-app"],
        position: { width: 600, height: 750 },
        actions: {
            next: CharacterCreatorApp.prototype._onNext,
            prev: CharacterCreatorApp.prototype._onPrev,
            inc: CharacterCreatorApp.prototype._onInc,
            dec: CharacterCreatorApp.prototype._onDec,
            rollSecret: CharacterCreatorApp.prototype._onRollSecret,
            submit: CharacterCreatorApp.prototype._onSubmit,
            openSheet: CharacterCreatorApp.prototype._onOpenSheet // AJOUT : Nouvelle action
        }
    };

    static PARTS = { 
        main: { template: "systems/aequall/template/apps/character-creator.html" } 
    };

    constructor(actor) {
        super();
        this.actor = actor;
        this.step = 1;
        
        this.data = {
            name: actor.name || "Nouvel Aventurier",
            concept: actor.system.details.biography?.value || "",
            race: "Humain (Académicien)",
            vocation: "Mercenaire",
            kingdom: "Uneuter",
            attributes: {
                cur: { label: "Curiosité", value: 0 },
                pru: { label: "Prudence", value: 0 },
                avi: { label: "Avidité", value: 0 },
                env: { label: "Envie", value: 0 }
            },
            q1: "sangfroid", q2: "bricoleur",
            d1: "klepto", d2: "tete"
        };
        
        this.pointsRemaining = 3; 
        this.hasRolledSecret = false;
        this.isConducteur = false;
        // Persistance : une fois validé, l'acteur garde l'état « créé »
        this.isCreated = !!actor.getFlag("aequall", "characterCreated");
    }

    async _prepareContext(options) {
        const derived = this._calculateDerived();
        const contextData = foundry.utils.deepClone(this.data);

        for (const [key, attr] of Object.entries(contextData.attributes)) {
            attr.displayTotal = derived.totals[key];
            attr.raceBonus = derived.raceBonus[key];
        }

        return {
            actor: this.actor,
            step: this.step,
            data: contextData,
            config: AEQUALL_CONFIG,
            pointsRemaining: this.pointsRemaining,
            derived: derived,
            hasRolledSecret: this.hasRolledSecret,
            isConducteur: this.isConducteur,
            isCreated: this.isCreated // AJOUT : Passé au template
        };
    }

    _calculateDerived() {
        const race = this.data.race;
        const voc = this.data.vocation;
        const attrs = this.data.attributes;

        let rb = { cur: 0, pru: 0, avi: 0, env: 0 };
        if (race.includes("Elfe")) { rb.pru = 1; rb.cur = 1; }
        else if (race.includes("Humain")) { rb.cur = 1; rb.env = 1; }
        else if (race.includes("Bestial")) { rb.env = 2; }
        else if (race.includes("Nain")) { rb.avi = 2; }
        else if (race.includes("Tieffelin")) { rb.pru = 1; rb.avi = 1; }

        const tot = {
            cur: attrs.cur.value + rb.cur,
            pru: attrs.pru.value + rb.pru,
            avi: attrs.avi.value + rb.avi,
            env: attrs.env.value + rb.env
        };

        const vocStats = AEQUALL_CONFIG.vocationStats?.[voc] || { hp: 16 };
        let baseHp = vocStats.hp;
        let hpStat = tot.avi; 
        
        if (voc === "Chirurgien") hpStat = tot.pru;
        else if (voc === "Franc-Tireur") hpStat = tot.env;
        else if (voc === "Conducteur") hpStat = tot.cur;
        
        const hp = baseHp + (hpStat * 2);

        return { hp, init: tot.env, def: tot.pru, raceBonus: rb, totals: tot };
    }

    _onRender(context, options) {
        super._onRender(context, options);
        const html = $(this.element);

        // Désactive les inputs si le perso est créé
        if (this.isCreated) {
            html.find('input, select, textarea, button:not([data-action="openSheet"])').prop('disabled', true);
            return;
        }

        html.find('input[type="text"], textarea, select').change(ev => {
            const field = ev.target.name;
            const value = ev.target.value;
            if (this.data.hasOwnProperty(field)) this.data[field] = value;
            else if (field === "name") this.data.name = value;
            else if (field === "concept") this.data.concept = value;
            this.render(); 
        });
        
        html.find('input[type="radio"]').change(ev => {
             if (ev.target.name === "vocation") {
                 this.data.vocation = ev.target.value;
                 this.render();
             }
        });
    }

    _onNext() { if (this.step < 4) { this.step++; this.render(); } }
    _onPrev() { if (this.step > 1) { this.step--; this.render(); } }

    _onInc(event, target) {
        const key = target.dataset.key;
        if(this.pointsRemaining > 0 && this.data.attributes[key].value < 3) {
            this.data.attributes[key].value++;
            this.pointsRemaining--;
            this.render();
        }
    }

    _onDec(event, target) {
        const key = target.dataset.key;
        if(this.data.attributes[key].value > -1) { 
            this.data.attributes[key].value--;
            this.pointsRemaining++;
            this.render();
        }
    }

    async _onRollSecret() {
        const roll = await new Roll("1d100").evaluate();
        this.hasRolledSecret = true;
        this.isConducteur = (roll.total >= 99); 
        roll.toMessage({ flavor: `<strong>Test de Destinée (Secret de l'Âme)</strong><br>Personnage: ${this.data.name}` });
        this.render();
    }

    // AJOUT : Nouvelle action pour ouvrir la fiche
    _onOpenSheet() {
        this.actor.sheet.render(true);
        this.close();
    }

    async _onSubmit() {
        if (this.isCreated) return; // Sécurité anti-double clic

        if(this.pointsRemaining > 0) {
            return ui.notifications.warn(`Attention : Il vous reste ${this.pointsRemaining} points de caractéristiques à dépenser !`);
        }
        
        const d = this.data;
        const derived = this._calculateDerived();
        const vocData = AEQUALL_CONFIG.vocationStats?.[d.vocation] || { mastery: [] };
        
        await this.actor.update({
            "name": d.name,
            "system.details.race.value": d.race,
            "system.details.vocation.value": d.vocation,
            "system.details.kingdom.value": d.kingdom,
            "system.details.biography.value": d.concept,
            "system.attributes.cur.value": d.attributes.cur.value,
            "system.attributes.pru.value": d.attributes.pru.value,
            "system.attributes.avi.value": d.attributes.avi.value,
            "system.attributes.env.value": d.attributes.env.value,
            "system.attributes.cur.maitrise": vocData.mastery.includes("Cur"),
            "system.attributes.pru.maitrise": vocData.mastery.includes("Pru"),
            "system.attributes.avi.maitrise": vocData.mastery.includes("Avi"),
            "system.attributes.env.maitrise": vocData.mastery.includes("Env"),
            "system.attributes.qualite1.value": d.q1,
            "system.attributes.qualite2.value": d.q2,
            "system.attributes.defaut1.value": d.d1,
            "system.attributes.defaut2.value": d.d2,
            "system.attributes.hp.value": derived.hp,
            "system.attributes.hp.max": derived.hp,
            "system.details.isConducteur.value": this.isConducteur,
            "system.currency.gp": 10
        });

        // Flag persistant : permet à la fiche perso d'afficher « Voir le résumé »
        await this.actor.setFlag("aequall", "characterCreated", true);

        // Verrouille la fiche après création (retire si tu préfères laisser éditable)
        await this.actor.update({ "system.details.isLocked.value": true });
        
        ui.notifications.info(`Le personnage ${d.name} est né !`);
        
        // MODIFICATION : On ne ferme plus, on change d'état
        this.isCreated = true;
        this.render();
    }
}