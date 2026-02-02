export class AequallMerchantSheet extends ActorSheet {

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["aequall", "sheet", "merchant"],
      template: "systems/aequall/templates/apps/merchant.html",
      width: 600,
      height: 700,
      tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "items" }]
    });
  }

  getData() {
    const context = super.getData();
    context.shopName = this.actor.name;
    context.shopGold = this.actor.system.currency?.gp || 0;
    context.shopSilver = this.actor.system.currency?.sp || 0;
    context.shopCopper = this.actor.system.currency?.cp || 0;

    context.shopItems = this.actor.items.map(i => {
      return {
        id: i.id, name: i.name, img: i.img,
        qty: i.system.quantity?.value || 1,
        displayPrice: `${i.system.price?.value || 0} PO`
      };
    });

    const buyer = game.user.character;
    if (buyer) {
      context.buyerGold = buyer.system.currency?.gp || 0;
      context.buyerSilver = buyer.system.currency?.sp || 0;
      context.buyerCopper = buyer.system.currency?.cp || 0;
    } else {
      context.buyerGold = 0;
    }
    context.isConfigMode = game.user.isGM && this.isEditable;
    return context;
  }

  activateListeners(html) {
    super.activateListeners(html);
    html.find('.buy-btn').click(this._onBuyItem.bind(this));
  }

  async _onBuyItem(event) {
    event.preventDefault();
    const itemId = event.currentTarget.dataset.itemId;
    const item = this.actor.items.get(itemId);
    const buyer = game.user.character;

    if (!buyer) return ui.notifications.warn("Pas de personnage assigné !");
    const price = item.system.price?.value || 0;
    const buyerGold = buyer.system.currency?.gp || 0;

    if (buyerGold < price) return ui.notifications.error("Pas assez d'or !");

    await buyer.update({"system.currency.gp": buyerGold - price});
    await this.actor.update({"system.currency.gp": (this.actor.system.currency?.gp || 0) + price});

    const itemData = item.toObject();
    itemData.system.quantity.value = 1;
    await buyer.createEmbeddedDocuments("Item", [itemData]);

    const newQty = (item.system.quantity?.value || 1) - 1;
    if (newQty <= 0) await item.delete();
    else await item.update({"system.quantity.value": newQty});

    ui.notifications.info(`Acheté: ${item.name}`);
  }
}