import { AEQUALL_CONFIG } from "../config.mjs";

export class AequallActor extends Actor {
    /** @override */
    prepareDerivedData() {
        super.prepareDerivedData();
        const data = this.system;
        
        // Ces calculs ne s'appliquent qu'aux Personnages (pas aux PNJ/Monstres de base)
        if (this.type !== 'character') return;

        // --- 1. BONUS RACIAUX (Logique V2.3) ---
        const race = data.details.race?.value || "";
        let rb = { cur: 0, pru: 0, avi: 0, env: 0 };
        
        // Détection automatique basée sur le nom de la race
        if (race.includes("Elfe")) { rb.pru = 1; rb.cur = 1; }
        else if (race.includes("Humain")) { rb.cur = 1; rb.env = 1; }
        else if (race.includes("Bestial")) { rb.env = 2; }
        else if (race.includes("Nain")) { rb.avi = 2; }
        else if (race.includes("Tieffelin")) { rb.pru = 1; rb.avi = 1; }

        // --- 2. CALCUL DES ATTRIBUTS ---
        // Total = Valeur brute + Maîtrise (+2) + Bonus Racial
        for (let [key, attr] of Object.entries(data.attributes)) {
            if (['cur', 'pru', 'avi', 'env'].includes(key)) {
                let val = Number(attr.value) || 0;
                let maitrise = attr.maitrise === true ? 2 : 0; 
                let bonus = Number(rb[key]) || 0;
                
                attr.total = val + maitrise + bonus;
            }
        }

        // --- 3. INITIATIVE ---
        // Base = Envie Totale
        let initValue = Number(data.attributes.env.total);
        
        // Bonus Vocation : Franc-Tireur ajoute sa Prudence
        if (data.details.vocation?.value === "Franc-Tireur") {
            initValue += Number(data.attributes.pru.total);
        }
        
        // Bonus Qualité : Sixième Sens (+2)
        const q1 = data.attributes.qualite1?.value;
        const q2 = data.attributes.qualite2?.value;
        if (q1 === "sixieme" || q2 === "sixieme") {
            initValue += 2;
        }
        
        data.attributes.init.value = initValue;

        // --- 4. DÉFENSE (Classe d'Armure) ---
        // Base = Prudence Totale
        let defenseTotal = Number(data.attributes.pru.total);
        
        // Bonus d'Armure (si un objet est équipé dans le slot 'armor')
        const armorId = data.equipment?.armor;
        if (armorId) {
            const item = this.items.get(armorId);
            if (item && item.type === 'armor') {
                defenseTotal += (Number(item.system.ac.value) || 0);
            }
        }
        
        data.attributes.defense.total = defenseTotal;
        
        // --- 5. ENCOMBREMENT (Calcul Poids) ---
        let totalWeight = 0;
        this.items.forEach(item => {
            const qty = Number(item.system.quantity?.value) || 1;
            const w = Number(item.system.weight?.value) || 0;
            totalWeight += (qty * w);
        });
        data.details.weight = Math.round(totalWeight * 100) / 100; // Arrondi 2 décimales
    }
}