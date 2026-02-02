export const AEQUALL_CONFIG = {
    // --- TRAITS (Qualités & Défauts) ---
    qualities: {
        "sangfroid": { label: "Sang-Froid", effect: "Immunisé à la peur." },
        "menteur": { label: "Menteur Né", effect: "Faveur sur les mensonges." },
        "sixieme": { label: "Sixième Sens", effect: "+2 Initiative. Ne peut être surpris." },
        "dos": { label: "Dos d'Acier", effect: "Portage x2. Compte comme taille sup." },
        "erudit": { label: "Encyclopédie", effect: "1 info gratuite/session." },
        "observateur": { label: "Observateur", effect: "Faveur Fouille." },
        "charisme": { label: "Charismatique", effect: "+1 Jets sociaux." },
        "bricoleur": { label: "Bricoleur", effect: "Faveur Réparation." },
        "robuste": { label: "Robuste", effect: "+1 PV max/niv." },
        "chanceux": { label: "Chanceux", effect: "Relance un '1' nat." }
    },
    flaws: {
        "klepto": { label: "Kleptomane", effect: "Voler objets brillants (Volonté DD12)." },
        "morbide": { label: "Curiosité Morbide", effect: "Doit toucher l'inconnu." },
        "honnete": { label: "Honnêteté Brutale", effect: "Défaveur mensonge." },
        "phobie": { label: "Phobie Tech", effect: "Défaveur machines." },
        "tete": { label: "Tête Brûlée", effect: "Charge toujours au combat." },
        "avare": { label: "Avare", effect: "Refuse de partager l'or." },
        "superstitieux": { label: "Superstitieux", effect: "Peur des présages." },
        "fragile": { label: "Fragile", effect: "-1 PV max/niv." },
        "distrait": { label: "Distrait", effect: "-2 Perception (Pru)." },
        "rancunier": { label: "Rancunier", effect: "N'aide pas ses rivaux." }
    },

    // --- ORIGINES ---
    races: { 
        "Elfe (Albâtre)": "Elfe d'Albâtre", 
        "Elfe (Obsidienne)": "Elfe d'Obsidienne", 
        "Humain (Académicien)": "Humain (Académicien)", 
        "Humain (Navigateur)": "Humain (Navigateur)", 
        "Bestial (Croc)": "Bestial (Croc)", 
        "Bestial (Écaille)": "Bestial (Écaille)", 
        "Bestial (Aile)": "Bestial (Aile)", 
        "Nain (Fournaise)": "Nain (Fournaise)", 
        "Nain (Coffre)": "Nain (Coffre)", 
        "Tieffelin (Sang-Pur)": "Tieffelin (Sang-Pur)", 
        "Tieffelin (Cendré)": "Tieffelin (Cendré)" 
    },
    
    kingdoms: { 
        "Allégia": "Allégia (Ordre)", 
        "Questiol": "Questiol (Savoir)", 
        "Envya": "Envya (Ambition)", 
        "Uneuter": "Uneuter (Neutre)", 
        "Avidia": "Avidia (Guerre)", 
        "Lotentia": "Lotentia (Magie)", 
        "Latentia": "Latentia (Ombre)" 
    },

    vocations: { 
        "Mercenaire": "Mercenaire", 
        "Ingénieur": "Ingénieur", 
        "Ombre": "Ombre", 
        "Chirurgien": "Chirurgien", 
        "Franc-Tireur": "Franc-Tireur", 
        "Gladiateur": "Gladiateur", 
        "Conducteur": "Conducteur" 
    },

    // --- RÈGLES BIBLE V2.3 ---
    raceBonuses: {
        "Elfe (Albâtre)": "+1 Pru, +1 Cur. Trait : Autorité Naturelle.",
        "Elfe (Obsidienne)": "+1 Pru, +1 Cur. Trait : Vision Nocturne.",
        "Humain (Académicien)": "+1 Cur, +1 Env. Trait : Mémoire Eidétique.",
        "Humain (Navigateur)": "+1 Cur, +1 Env. Trait : Pied Marin.",
        "Nain (Fournaise)": "+2 Avi. Trait : Ignifugé.",
        "Nain (Coffre)": "+2 Avi. Trait : Négociateur.",
        "Bestial (Croc)": "+2 Env. Trait : Prédateur.",
        "Bestial (Écaille)": "+2 Env. Trait : Sang Froid.",
        "Bestial (Aile)": "+2 Env. Trait : Chute Contrôlée.",
        "Tieffelin (Sang-Pur)": "+1 Pru, +1 Avi. Trait : Domination.",
        "Tieffelin (Cendré)": "+1 Pru, +1 Avi. Trait : Dos de Pierre."
    },

    vocationStats: {
        "Mercenaire": { hp: 24, mastery: ["Avi", "Pru"] },
        "Ingénieur": { hp: 16, mastery: ["Cur", "Avi"] },
        "Ombre": { hp: 16, mastery: ["Env", "Cur"] },
        "Chirurgien": { hp: 16, mastery: ["Pru", "Cur"] },
        "Franc-Tireur": { hp: 20, mastery: ["Env", "Pru"] },
        "Gladiateur": { hp: 20, mastery: ["Avi", "Env"] },
        "Conducteur": { hp: 16, mastery: ["Cur", "Pru"] }
    },

    vocationDesc: {
        "Mercenaire": "PV: 24+(Avi x2). Maîtrises: Avidité, Prudence.",
        "Ingénieur": "PV: 16+(Avi x2). Maîtrises: Curiosité, Avidité.",
        "Ombre": "PV: 16+(Avi x2). Maîtrises: Envie, Curiosité.",
        "Chirurgien": "PV: 16+(Pru x2). Maîtrises: Prudence, Curiosité.",
        "Franc-Tireur": "PV: 20+(Env x2). Maîtrises: Envie, Prudence.",
        "Gladiateur": "PV: 20+(Avi x2). Maîtrises: Avidité, Envie.",
        "Conducteur": "PV: 16+(Cur x2). Maîtrises: Curiosité, Prudence."
    },

    kingdomLore: {
        "Allégia": "Royaume de l'Ordre et de la Loi. Les gardes y sont stricts.",
        "Questiol": "Cité du Savoir. Les bibliothèques y sont infinies.",
        "Envya": "Terre des voleurs et des marchands. Tout s'achète.",
        "Uneuter": "Zone tampon. Le seul endroit où la paix existe encore.",
        "Avidia": "Forteresse de guerre. La force fait loi.",
        "Lotentia": "Terre de magie pure, instable et dangereuse.",
        "Latentia": "Royaume souterrain des exilés et des monstres."
    },

    vocationLore: {
        "Mercenaire": "Combattant polyvalent, louant son épée au plus offrant.",
        "Ingénieur": "Expert en machines et explosifs.",
        "Ombre": "Assassin silencieux et espion.",
        "Chirurgien": "Soigneur de terrain, capable de recoudre n'importe quoi.",
        "Franc-Tireur": "Expert du tir à distance.",
        "Gladiateur": "Combattant d'arène, cherchant la gloire.",
        "Conducteur": "Mage inné utilisant son propre sang comme catalyseur."
    }
};