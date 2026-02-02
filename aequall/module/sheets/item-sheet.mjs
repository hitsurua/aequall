export class AequallItemSheet extends ItemSheet {
  // Lecture pour les joueurs, édition uniquement MJ
  get isEditable() {
    return game.user.isGM && super.isEditable;
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["aequall", "sheet", "item"],
      // CHEMIN CORRIGÉ : 'template' (singulier)
      template: "systems/aequall/template/item/item-sheet.html",
      width: 550, 
      height: 500, 
      tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "description" }]
    });
  }

  getData() {
    const context = super.getData();
    context.system = context.item.system;
    context.flags = context.item.flags;
    
    // Traduction des types pour l'affichage
    const typeLabels = { 
        "weapon": "Arme", 
        "armor": "Armure", 
        "item": "Objet", 
        "spell": "Sort", 
        "feature": "Talent" 
    };
    context.localizeType = (type) => typeLabels[type] || type;
    
    return context;
  }
}