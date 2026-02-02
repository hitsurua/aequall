const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class MerchantApp extends HandlebarsApplicationMixin(ApplicationV2) {
    static DEFAULT_OPTIONS = {
        id: "aequall-merchant",
        tag: "form",
        window: { title: "Le Bazar de l'Engrenage", resizable: true },
        position: { width: 550, height: 650 }
    };

    // CHEMIN CORRIGÉ : 'template' (singulier)
    static PARTS = { main: { template: "systems/aequall/template/apps/merchant.html" } };

    constructor(options = {}) {
        super(options);
        // Si aucune option n'est passée, on regarde si l'utilisateur est GM pour activer le mode config
        this.isConfigMode = options.isConfigMode !== undefined ? options.isConfigMode : game.user.isGM;
        this.shopActorId = options.shopActorId || null; 
        this.buyerActorId = options.buyerActorId || null;
        this.priceModifier = options.priceModifier || 0;

        // Sécurité : en mode joueur, seul le joueur propriétaire du buyerActor peut ouvrir
        this._denied = false;
        if (!this.isConfigMode) {
	            const buyer = this.buyerActorId ? game.actors.get(this.buyerActorId) : null;
	            if (!this.shopActorId || !this.buyerActorId) this._denied = true;
	            // Si l'acheteur n'existe pas ou n'est pas détenu par l'utilisateur courant => refus.
	            else if (!game.user.isGM && (!buyer || !buyer.isOwner)) this._denied = true;
        }
    }

    /**
     * Traitement côté MJ des transactions demandées via socket.
     * @param {object} payload
     */
    static async handleSocket(payload) {
        try {
            if (!payload || !payload.type) return;
            if (!game.user.isGM) return; // le MJ seul applique

            const user = game.users.get(payload.userId);
            const shopActor = game.actors.get(payload.shopActorId);
            const buyerActor = game.actors.get(payload.buyerActorId);
            if (!user || !shopActor || !buyerActor) return;

            // Vérifie que l'utilisateur qui demande est OWNER du buyer
            if (!buyerActor.testUserPermission(user, "OWNER")) return;

            const priceModifier = Number(payload.priceModifier) || 0;
            const priceMult = 1 + (priceModifier / 100);

            const toCP = (a) => {
                const gp = a.system.currency?.gp || 0;
                const sp = a.system.currency?.sp || 0;
                const cp = a.system.currency?.cp || 0;
                return (gp * 100) + (sp * 10) + cp;
            };
            const fromCP = (cp) => ({
                "system.currency.gp": Math.floor(cp / 100),
                "system.currency.sp": Math.floor((cp % 100) / 10),
                "system.currency.cp": cp % 10
            });

            if (payload.type === "merchant:buy") {
                const shopItem = shopActor.items.get(payload.itemId);
                if (!shopItem) return;

                const priceInGP = (shopItem.system.price?.value || 0) * priceMult;
                const priceInCP = Math.round(priceInGP * 100);

                const buyerCP = toCP(buyerActor);
                if (buyerCP < priceInCP) return;

                // Débit buyer / Crédit shop
                await buyerActor.update(fromCP(buyerCP - priceInCP));
                const shopCP = toCP(shopActor);
                await shopActor.update(fromCP(shopCP + priceInCP));

                // Donne 1 unité au buyer
                let newItemData = shopItem.toObject();
                if (newItemData.system?.quantity) newItemData.system.quantity.value = 1;
                await Item.create(newItemData, { parent: buyerActor });

                // Retire 1 unité du shop
                const currentQty = shopItem.system.quantity?.value || 1;
                if (currentQty > 1) await shopItem.update({ "system.quantity.value": currentQty - 1 });
                else await shopItem.delete();

                ChatMessage.create({
                    speaker: ChatMessage.getSpeaker({ actor: buyerActor }),
                    content: `<div style="background: rgba(16, 185, 129, 0.1); border: 1px solid #10b981; padding: 5px;">🛒 <b>${buyerActor.name}</b> a acheté <b>${shopItem.name}</b> !</div>`
                });
            }

            if (payload.type === "merchant:sell") {
                const playerItem = await fromUuid(payload.itemUuid);
                if (!playerItem || playerItem.parent?.id !== buyerActor.id) return;

                const basePriceGP = playerItem.system.price?.value || 0;
                if (basePriceGP <= 0) return;
                const sellPriceGP = basePriceGP * 0.5;
                const sellPriceCP = Math.round(sellPriceGP * 100);

                const merchantCP = toCP(shopActor);
                if (merchantCP < sellPriceCP) return;

                // Débit merchant / Crédit buyer
                await shopActor.update(fromCP(merchantCP - sellPriceCP));
                const buyerCP = toCP(buyerActor);
                await buyerActor.update(fromCP(buyerCP + sellPriceCP));

                // Transfert 1 unité au shop
                let itemData = playerItem.toObject();
                if (itemData.system?.quantity) itemData.system.quantity.value = 1;
                await Item.create(itemData, { parent: shopActor });

                // Retire 1 unité du buyer
                const playerQty = playerItem.system.quantity?.value || 1;
                if (playerQty > 1) await playerItem.update({ "system.quantity.value": playerQty - 1 });
                else await playerItem.delete();

                ChatMessage.create({
                    speaker: ChatMessage.getSpeaker({ actor: buyerActor }),
                    content: `<div style="background: rgba(217, 119, 6, 0.1); border: 1px solid #D97706; padding: 5px;">🤝 <b>${buyerActor.name}</b> a vendu <b>${playerItem.name}</b>.</div>`
                });
            }
        } catch (e) {
            console.error("Aequall | Merchant socket error", e);
        }
    }

    async _prepareContext(options) {
        const FOLDER_NAME = "Boutiques Aequall";
        
        // Récupère les NPCs (filtre par dossier si possible, sinon tous)
        // Utile pour la liste déroulante du mode Config
        const npcs = game.actors.filter(a => a.type === "npc" && (!a.folder || a.folder.name === FOLDER_NAME));
        const buyers = game.actors.filter(a => a.type === "character" && a.testUserPermission(game.user, "OWNER"));
        
        let data = { 
            isConfigMode: this.isConfigMode, 
            npcs: npcs.map(a => ({ id: a.id, name: a.name })), 
            buyers: buyers.map(a => ({ id: a.id, name: a.name })), 
            priceModifier: this.priceModifier 
        };

        // Si accès refusé
        if (this._denied) {
            return { denied: true, message: "Boutique non autorisée pour ce joueur." };
        }

        // Si le magasin est "ouvert" (Vendeur et Acheteur définis)
        if (this.shopActorId && this.buyerActorId) {
            const shopActor = game.actors.get(this.shopActorId);
            const buyerActor = game.actors.get(this.buyerActorId);
            
            if (shopActor && buyerActor) {
                data.shopName = shopActor.name;
                data.buyerName = buyerActor.name;
                
                // Monnaies
                data.shopGold = shopActor.system.currency?.gp || 0;
                data.shopSilver = shopActor.system.currency?.sp || 0;
                data.shopCopper = shopActor.system.currency?.cp || 0;
                
                data.buyerGold = buyerActor.system.currency?.gp || 0;
                data.buyerSilver = buyerActor.system.currency?.sp || 0;
                data.buyerCopper = buyerActor.system.currency?.cp || 0;
                
                const priceMult = 1 + (this.priceModifier / 100);
                
                // Inventaire du Marchand (Objets à vendre)
                data.shopItems = shopActor.items.filter(i => ["weapon", "armor", "item"].includes(i.type)).map(i => {
                    const basePrice = i.system.price?.value || 0;
                    const finalPrice = basePrice * priceMult;
                    let displayPrice = "";
                    
                    if (finalPrice >= 1) displayPrice = `${finalPrice.toFixed(1).replace(/\.0$/, '')} PO`;
                    else if (finalPrice >= 0.1) displayPrice = `${Math.round(finalPrice * 10)} PA`;
                    else displayPrice = `${Math.round(finalPrice * 100)} PC`;
                    
                    return { 
                        id: i.id, 
                        name: i.name, 
                        img: i.img, 
                        price: finalPrice, 
                        displayPrice: displayPrice, 
                        qty: i.system.quantity?.value || 1 
                    };
                });
            }
        }
        return data;
    }

    _onRender(context, options) {
        super._onRender(context, options);
        const html = $(this.element);

        if (context.denied) {
            ui.notifications.warn(context.message || "Accès refusé.");
            this.close();
            return;
        }

        if (this.isConfigMode) {
            // --- MODE CONFIGURATION (GM) ---
            html.find('#open-shop-for-players').click(ev => {
                ev.preventDefault();
                const shopId = html.find('#shop-actor-select').val();
                const buyerId = html.find('#buyer-select').val();
                const priceMod = Number(html.find('#price-modifier').val()) || 0;
                
                if (!shopId || !buyerId) return ui.notifications.warn("Sélectionnez un Marchand ET un Acheteur !");
                
                // Envoie un message dans le chat pour ouvrir la boutique pour le joueur
                ChatMessage.create({ 
                    user: game.user.id, 
                    content: `<div style="background: #1a1a1a; color: #fff; border: 1px solid #D97706; padding: 10px; text-align: center; border-radius: 5px;">
                        <h2 style="color: #D97706; margin: 0 0 5px 0;">Le Comptoir est ouvert !</h2>
                        ${priceMod !== 0 ? `<p style="font-size:11px; color:#aaa;">Ajustement : ${priceMod > 0 ? '+' : ''}${priceMod}%</p>` : ''}
                        <button class="join-shop-btn" style="background: #10b981; color: white; border: none; padding: 5px 10px; cursor: pointer; font-weight: bold;">🛒 ${game.actors.get(buyerId).name}, OUVRE LE MAGASIN !</button>
                    </div>`, 
                    flags: { aequall: { shopActorId: shopId, buyerActorId: buyerId, priceModifier: priceMod } } 
                });
                this.close();
            });
        } else {
            // --- MODE COMMERCE (JOUEUR) ---
            
            // 1. Vente via Drag & Drop
            html.find('.sell-drop-zone').on('drop', async (ev) => {
                ev.preventDefault();
                const data = TextEditor.getDragEventData(ev.originalEvent);
                
                if (data.type !== "Item") return;

                // En mode joueur, la transaction doit être appliquée par le MJ
                if (!game.user.isGM) {
                    game.socket.emit("system.aequall", {
                        type: "merchant:sell",
                        userId: game.user.id,
                        shopActorId: this.shopActorId,
                        buyerActorId: this.buyerActorId,
                        itemUuid: data.uuid,
                        priceModifier: this.priceModifier
                    });
                    ui.notifications.info("Vente demandée au MJ...");
                    return;
                }

                const playerItem = await fromUuid(data.uuid);
                if (!playerItem || playerItem.parent?.id !== this.buyerActorId) return ui.notifications.warn("Vous ne pouvez vendre que les objets de votre propre inventaire !");
                
                const shopActor = game.actors.get(this.shopActorId);
                const buyerActor = game.actors.get(this.buyerActorId);
                
                const basePriceGP = playerItem.system.price?.value || 0;
                if (basePriceGP <= 0) return ui.notifications.warn("Cet objet n'a aucune valeur marchande.");
                
                const sellPriceGP = basePriceGP * 0.5; // Rachat à 50%
                const sellPriceCP = Math.round(sellPriceGP * 100);
                
                let displayPrice = "";
                if (sellPriceGP >= 1) displayPrice = `${sellPriceGP} PO`;
                else if (sellPriceGP >= 0.1) displayPrice = `${Math.round(sellPriceGP * 10)} PA`;
                else displayPrice = `${sellPriceCP} PC`;
                
                // Vérifier fonds du marchand
                const mGP = shopActor.system.currency?.gp || 0;
                const mSP = shopActor.system.currency?.sp || 0;
                const mCP = shopActor.system.currency?.cp || 0;
                const totalMerchantCP = (mGP * 100) + (mSP * 10) + mCP;
                
                if (totalMerchantCP < sellPriceCP) return ui.notifications.error(`Le marchand n'a pas assez d'argent pour racheter ceci !`);
                
                // Confirmation
                const confirm = await Dialog.confirm({ title: "Vendre un objet", content: `<p>Voulez-vous vendre <b>${playerItem.name}</b> pour <b>${displayPrice}</b> ?</p>` });
                
                if (confirm) {
                    // Retirer argent Marchand
                    let remainingMerchantCP = totalMerchantCP - sellPriceCP;
                    await shopActor.update({ "system.currency.gp": Math.floor(remainingMerchantCP / 100), "system.currency.sp": Math.floor((remainingMerchantCP % 100) / 10), "system.currency.cp": remainingMerchantCP % 10 });
                    
                    // Ajouter argent Joueur
                    const pGP = buyerActor.system.currency?.gp || 0;
                    const pSP = buyerActor.system.currency?.sp || 0;
                    const pCP = buyerActor.system.currency?.cp || 0;
                    let totalPlayerCP = (pGP * 100) + (pSP * 10) + pCP + sellPriceCP;
                    await buyerActor.update({ "system.currency.gp": Math.floor(totalPlayerCP / 100), "system.currency.sp": Math.floor((totalPlayerCP % 100) / 10), "system.currency.cp": totalPlayerCP % 10 });
                    
                    // Transférer l'objet au marchand
                    let itemData = playerItem.toObject(); 
                    itemData.system.quantity.value = 1; 
                    await Item.create(itemData, {parent: shopActor});
                    
                    // Retirer du joueur
                    const playerQty = playerItem.system.quantity?.value || 1;
                    if (playerQty > 1) await playerItem.update({ "system.quantity.value": playerQty - 1 });
                    else await playerItem.delete();
                    
                    ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: buyerActor }), content: `<div style="background: rgba(217, 119, 6, 0.1); border: 1px solid #D97706; padding: 5px;">🤝 <b>${buyerActor.name}</b> a vendu <b>${playerItem.name}</b> pour ${displayPrice}.</div>` });
                    ui.notifications.info("Vente réussie !");
                    this.render({ force: true });
                }
            });

            // 2. Achat d'objet (Click bouton)
            html.find('.buy-btn').click(async ev => {
                ev.preventDefault();
                const btn = $(ev.currentTarget);
                btn.prop("disabled", true); // Anti double-click
                
                // En mode joueur, la transaction doit être appliquée par le MJ
                if (!game.user.isGM) {
                    game.socket.emit("system.aequall", {
                        type: "merchant:buy",
                        userId: game.user.id,
                        shopActorId: this.shopActorId,
                        buyerActorId: this.buyerActorId,
                        itemId: btn.data("item-id"),
                        priceModifier: this.priceModifier
                    });
                    ui.notifications.info("Achat demandé au MJ...");
                    // On réactive le bouton au prochain render (updates propagées)
                    setTimeout(() => this.render({ force: true }), 600);
                    return;
                }

                const buyer = game.actors.get(this.buyerActorId);
                const shopActor = game.actors.get(this.shopActorId);
                const itemId = btn.data("item-id");
                const shopItem = shopActor.items.get(itemId);
                
                if (!shopItem) return ui.notifications.error("Cet objet n'existe plus !");
                
                const priceMult = 1 + (this.priceModifier / 100);
                const priceInGP = (shopItem.system.price?.value || 0) * priceMult;
                const priceInCP = Math.round(priceInGP * 100);
                
                const gp = buyer.system.currency?.gp || 0;
                const sp = buyer.system.currency?.sp || 0;
                const cp = buyer.system.currency?.cp || 0;
                const totalBuyerCP = (gp * 100) + (sp * 10) + cp;
                
                if (totalBuyerCP < priceInCP) { btn.prop("disabled", false); return ui.notifications.error("Pas assez de pièces !"); }
                
                // Transaction
                let remainingCP = totalBuyerCP - priceInCP;
                await buyer.update({ "system.currency.gp": Math.floor(remainingCP / 100), "system.currency.sp": Math.floor((remainingCP % 100) / 10), "system.currency.cp": remainingCP % 10 });
                
                const shopGp = shopActor.system.currency?.gp || 0;
                const shopSp = shopActor.system.currency?.sp || 0;
                const shopCp = shopActor.system.currency?.cp || 0;
                let totalShopCP = (shopGp * 100) + (shopSp * 10) + shopCp + priceInCP;
                await shopActor.update({ "system.currency.gp": Math.floor(totalShopCP / 100), "system.currency.sp": Math.floor((totalShopCP % 100) / 10), "system.currency.cp": totalShopCP % 10 });
                
                // Créer l'objet chez le joueur
                let newItemData = shopItem.toObject(); 
                newItemData.system.quantity.value = 1;
                await Item.create(newItemData, {parent: buyer});
                
                // Retirer du stock marchand
                const currentQty = shopItem.system.quantity?.value || 1;
                if (currentQty > 1) await shopItem.update({ "system.quantity.value": currentQty - 1 });
                else await shopItem.delete();
                
                ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: buyer }), content: `<div style="background: rgba(16, 185, 129, 0.1); border: 1px solid #10b981; padding: 5px;">🛒 <b>${buyer.name}</b> a acheté <b>${shopItem.name}</b> !</div>` });
                this.render({ force: true });
            });
        }
    }
}