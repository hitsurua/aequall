export async function onRollFlux(actor) {
  const DialogV1 = foundry?.applications?.v1?.Dialog || Dialog;

  new DialogV1({
    title: "Canaliser le Flux",
    content: `
      <form>
        <div class="form-group">
          <label>Cercle du Sort (Risque)</label>
          <select id="circle">
            <option value="1">Cercle 1 (1d6 Flux)</option>
            <option value="2">Cercle 2 (2d6 Flux)</option>
            <option value="3">Cercle 3 (3d6 Flux)</option>
          </select>
        </div>
        <div class="form-group">
          <label>Bonus de Caractéristique</label>
          <input type="text" value="${actor.system.abilities.cur.value}" disabled/>
        </div>
      </form>
    `,
    buttons: {
      cast: {
        label: "Lancer",
        callback: async (html) => {
          const circle = parseInt(html.find("#circle").val());
          const cur = actor.system.abilities.cur.value;
          
          const mainRoll = new Roll(`1d20 + ${cur}`);
          await mainRoll.evaluate();
          
          const fluxRoll = new Roll(`${circle}d6`);
          await fluxRoll.evaluate();

          const fluxDice = fluxRoll.terms[0].results;
          let surchargeCount = 0;
          let fluxDisplay = "";

          fluxDice.forEach(die => {
            if (die.result === 1) {
              surchargeCount++;
              fluxDisplay += `<span style="color:#ef4444; font-weight:bold;">[1]</span> `;
            } else {
              fluxDisplay += `<span style="color:#3b82f6;">[${die.result}]</span> `;
            }
          });

          let content = `
            <div class="aequall-roll">
              <h3>Canalisation (Cercle ${circle})</h3>
              <div>Test Curiosité: ${mainRoll.total}</div>
              <div>Flux: ${fluxDisplay}</div>
          `;

          if (surchargeCount > 0) {
            const dmg = circle * 3;
            content += `<div style="color:red; font-weight:bold; margin-top:5px;">⚡ SURCHARGE ! (-${dmg} PV)</div>`;
            if (game.modules.get("tokenmagic")?.active) {
                const token = actor.getActiveTokens()[0];
                if(token) TokenMagic.addFilters(token, "glow");
            }
          }
          content += `</div>`;

          ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: actor }), content });
        }
      }
    }
  }).render(true);
}