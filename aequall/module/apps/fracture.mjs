const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class FractureGame extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "fracture-game",
    tag: "form",
    window: { title: "La Scission", resizable: true },
    position: { width: 680, height: "auto" }
  };
  
  static PARTS = { main: { template: "systems/aequall/template/apps/fracture.html" } };

  constructor(options) {
    super(options);
    this.gameState = "betting"; // betting | playing | finished
    this.rollCount = 0;
    this.betAmount = 5;
    
    // État initial des 4 dés
    this.dice = [
        {val: 1, kept: false}, 
        {val: 2, kept: false}, 
        {val: 3, kept: false}, 
        {val: 4, kept: false}
    ];

    // --- AUTO-REFRESH (Hooks) ---
    // Ces fonctions permettent de rafraîchir l'interface automatiquement
    this._onControlToken = () => { if (this.element) this.render(); };
    this._onUpdateActor = (actor) => { 
        if (this.element && this.actor && actor.id === this.actor.id) this.render(); 
    };

    Hooks.on("controlToken", this._onControlToken);
    Hooks.on("updateActor", this._onUpdateActor);
  }

  // Nettoyage des hooks lors de la fermeture pour éviter les fuites de mémoire
  async close(options) {
      Hooks.off("controlToken", this._onControlToken);
      Hooks.off("updateActor", this._onUpdateActor);
      return super.close(options);
  }

  // --- GETTER INTELLIGENT POUR L'ACTEUR ---
  // Cherche d'abord le token sélectionné (pratique MJ), puis le perso du joueur.
  get actor() {
      return canvas.tokens.controlled[0]?.actor || game.user.character || null;
  }

  // --- INVITATION CHAT ---
  static async invite() {
      const content = `
      <div style="background: #1a1a1a; border: 2px solid #D97706; padding: 15px; text-align: center; border-radius: 8px; color: #e0e0e0; font-family: 'Cinzel', serif;">
          <h3 style="color:#D97706; margin:0 0 10px 0; border-bottom: 1px solid #444; padding-bottom: 5px;">LA SCISSION</h3>
          <p style="font-style:italic; font-size:13px; margin-bottom:15px;">"Le hasard est un ennemi, mais la fortune sourit aux audacieux."</p>
          <div style="background: #000; padding: 5px; margin-bottom: 10px; border-radius: 4px;">Mise conseillée : <span style="color: #fbbf24;">5 PO</span></div>
          <button class="join-scission-btn" style="background:#D97706; color:black; border:none; padding:8px 15px; font-weight:bold; cursor:pointer; width: 100%;">
              <i class="fas fa-dice-d20"></i> REJOINDRE LA TABLE
          </button>
      </div>`;
      
      return ChatMessage.create({ 
          content: content,
          speaker: { alias: "Croupier d'Aequall" }
      });
  }

  // --- PRÉPARATION DES DONNÉES ---
  async _prepareContext(options) {
    const actor = this.actor;
    const currentGold = actor?.system?.currency?.gp ?? 0;
    
    let resultData = { handName: "", handDesc: "", totalGain: 0, resultClass: "" };
    
    if (this.gameState === "finished") {
        resultData = this._calculateResult();
    }

    return {
      gameState: this.gameState,
      dice: this.dice,
      rollCount: this.rollCount,
      betAmount: this.betAmount,
      currentGold: currentGold,
      hasActor: !!actor,
      canAfford: currentGold >= this.betAmount,
      canReroll: this.gameState === "playing" && this.rollCount < 3,
      ...resultData
    };
  }

  // --- MOTEUR DE RÈGLES (Mains Gagnantes) ---
  _calculateResult() {
      const values = this.dice.map(d => d.val).sort((a,b) => a - b);
      const counts = {};
      values.forEach(v => counts[v] = (counts[v] || 0) + 1);
      
      let name = "Rien";
      let desc = "La maison l'emporte.";
      let mult = -1; // -1 signifie perte de la mise initiale
      let cls = "loss";

      // 1. SURCHARGE (Trois '5' ou plus)
      if ((counts[5] || 0) >= 3) {
          return { handName: "SURCHARGE !", handDesc: "L'énergie du Flux explose !", totalGain: -(this.betAmount * 2), resultClass: "loss" };
      }

      // 2. HARMONIE (Quatre '6')
      if ((counts[6] || 0) === 4) { name = "Harmonie"; desc = "La perfection absolue."; mult = 5; cls = "win"; }
      // 3. PANTHÉON (4 Identiques)
      else if (Object.values(counts).includes(4)) { name = "Panthéon"; desc = "La faveur des dieux."; mult = 3; cls = "win"; }
      // 4. FRACTURE (Suite 1-2-3-4)
      else if (values.join('') === "1234") { name = "Fracture"; desc = "L'ordre dans le chaos."; mult = 2; cls = "win"; }
      // 5. TRIUMVIRAT (3 Identiques)
      else if (Object.values(counts).includes(3)) { name = "Triumvirat"; desc = "Une force unifiée."; mult = 1; cls = "win"; }

      const totalGain = mult > 0 ? this.betAmount * mult : -this.betAmount;
      return { handName: name, handDesc: desc, totalGain: totalGain, resultClass: cls };
  }

  // --- GESTION DES ÉVÉNEMENTS ---
  _onRender(context, options) {
    super._onRender(context, options);
    const html = $(this.element);
    
    // Permettre le changement de mise dynamique
    html.find('#bet-amount').on('input', ev => {
        const val = parseInt(ev.target.value);
        if (!isNaN(val) && val > 0) {
            this.betAmount = val;
            // On ne re-rend pas ici pour ne pas perdre le focus de l'input pendant la frappe,
            // mais on pourrait si on voulait rafraîchir le bouton JETER LES DÉS immédiatement.
            // Utilisons render() sur un léger délai ou seulement au changement de focus.
        }
    }).on('blur', () => this.render()); // Rafraîchit quand on sort de l'input pour valider l'argent.

    // Invitation au chat
    html.find('#invite-players').click(ev => {
        ev.preventDefault();
        FractureGame.invite();
    });

    // Démarrer (Payer et Jeter)
    html.find('#start-game').click(async ev => { 
        ev.preventDefault(); 
        const actor = this.actor;
        if (!actor) return ui.notifications.warn("Veuillez sélectionner un token ou un personnage.");
        
        const currentGold = actor.system?.currency?.gp ?? 0;
        if (currentGold < this.betAmount) return ui.notifications.error(`Or insuffisant (Requis: ${this.betAmount} PO).`);

        await actor.update({ "system.currency.gp": currentGold - this.betAmount });
        this.gameState = "playing"; 
        this._rollAllDice(); 
    });

    // Relance des dés
    html.find('#roll-dice').click(ev => { 
        ev.preventDefault(); 
        this._rollAllDice(); 
    });
    
    // Arrêter et calculer les gains
    html.find('#stop-roll').click(async ev => { 
        ev.preventDefault(); 
        this.gameState = "finished"; 
        
        const res = this._calculateResult();
        const actor = this.actor;
        if (actor) {
            const currentGold = actor.system.currency.gp || 0;
            if (res.totalGain > 0) {
                // Rembourse la mise (déjà payée) + ajoute le gain net
                await actor.update({ "system.currency.gp": currentGold + this.betAmount + res.totalGain });
                AudioHelper.play({src: "sounds/coins.wav", volume: 0.8}, false);
            } else if (res.handName === "SURCHARGE !") {
                // Pénalité supplémentaire
                await actor.update({ "system.currency.gp": Math.max(0, currentGold - this.betAmount) });
                AudioHelper.play({src: "sounds/lock.wav", volume: 0.8}, false);
            }
        }
        this.render(); 
    });

    // Recommencer
    html.find('#reset-game').click(ev => { 
        ev.preventDefault(); 
        this.gameState = "betting"; 
        this.rollCount = 0; 
        this.dice = [
            {val: 1, kept: false},
            {val: 2, kept: false},
            {val: 3, kept: false},
            {val: 4, kept: false}
        ];
        this.render(); 
    });
    
    // Verrouillage des dés :
    // - Les "5" (Flux 5) sont automatiquement verrouillés et ne peuvent jamais être déverrouillés.
    // - Les autres dés peuvent être (dé)sélectionnés pour corriger un miss-click.
    html.find('.die-visual').click(ev => {
        ev.preventDefault();
        if (this.gameState !== "playing") return;

        const index = parseInt(ev.currentTarget.dataset.index); 
        if (!isNaN(index)) {
            const die = this.dice[index];
            if (!die) return;
            // Les 5 restent verrouillés quoiqu'il arrive
            if (die.val === 5) {
              die.kept = true;
              this.render();
              return;
            }
            // Toggle autorisé pour les autres valeurs
            die.kept = !die.kept;
            this.render();
        }
    });
  }

  // --- LANCER SÉCURISÉ (Respecte 'kept') ---
  async _rollAllDice() {
    AudioHelper.play({src: "sounds/dice.wav", volume: 0.7}, false);
    
    // Les 5 sont toujours verrouillés
    this.dice.forEach(d => {
      if (d.val === 5) d.kept = true;
    });

    // On parcourt les dés et on ne modifie que ceux qui ne sont pas verrouillés
    for (let d of this.dice) {
        if (!d.kept) {
            const r = await new Roll("1d6").evaluate();
            d.val = r.total;
            // Si on obtient un 5, il devient verrouillé immédiatement
            if (d.val === 5) d.kept = true;
        }
    }
    
    this.rollCount++;
    this.render();
  }
}