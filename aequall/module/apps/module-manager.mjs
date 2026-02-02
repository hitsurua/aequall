const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class ModuleManagerApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "aequall-module-manager",
    tag: "form",
    window: { 
        title: "Gestionnaire de Modules Aequall", 
        icon: "fas fa-plug",
        resizable: true 
    },
    position: { width: 500, height: 650 }
  };

  static PARTS = {
    main: { template: "systems/aequall/template/apps/module-manager.html" }
  };

  async _prepareContext(options) {
    // Sécurité : Seul le GM peut voir ça
    if (!game.user.isGM) return { modules: [] };

    const modules = game.modules.map(m => ({
      id: m.id,
      title: m.title,
      active: m.active,
      version: m.version
    }));

    // Tri : Actifs d'abord, puis alphabétique
    modules.sort((a, b) => {
        if (a.active === b.active) return a.title.localeCompare(b.title);
        return b.active - a.active;
    });

    return { modules };
  }

  _onRender(context, options) {
    super._onRender(context, options);
    const html = $(this.element);

    // Moteur de recherche
    html.find('#mod-search').on('input', (ev) => {
        const term = ev.target.value.toLowerCase();
        html.find('.module-row').each((i, el) => {
            const text = $(el).text().toLowerCase();
            $(el).toggle(text.includes(term));
        });
    });

    // Style visuel checkbox
    html.find('input[type="checkbox"]').on('change', (ev) => {
        const label = $(ev.target).closest('.module-row').find('.mod-title');
        label.css('color', ev.target.checked ? '#e0e0e0' : '#888');
    });

    // Le bouton submit est géré automatiquement par le tag="form" et _onSubmitForm
  }

  // Soumission
  async _onSubmitForm(event, form, formData) {
    // On construit la configuration manuellement pour être sûr du format
    const newConfiguration = {};
    const checkboxes = this.element.querySelectorAll('input[type="checkbox"]');
    
    checkboxes.forEach(chk => {
        if (chk.checked) {
            newConfiguration[chk.name] = true;
        }
    });

    console.log("Aequall | Mise à jour des modules...", newConfiguration);
    await game.settings.set("core", "moduleConfiguration", newConfiguration);
    
    // Rechargement
    SettingsConfig.reloadConfirm({world: true});
  }
}