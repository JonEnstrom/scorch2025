// server/ItemManager.js

/**
 * Enum-like structure to keep item categories consistent.
 */
export const ITEM_CATEGORIES = {
  WEAPON: 'Weapon',
  ARMOR: 'Armor',
  CONSUMABLE: 'Consumable',
  MISC: 'Misc'
};

/**
 * Represents a single purchasable in-game item.
 * @typedef {Object} GameItem
 * @property {string} name - Unique identifier for the item.
 * @property {string} code - Short unique code for the item.
 * @property {string} category - Category of the item (Weapon, Armor, etc.).
 * @property {string} description - Short text describing the item.
 * @property {number} cost - Base cost of the item.
 * @property {string} icon - Path or identifier for the item's icon (sprite).
 */

/**
 * Manages all purchasable items, their metadata, and purchase handling.
 */
export default class ItemManager {
  constructor() {
    // ---------------------------------------------------------
    // Master list of all items in the game
    // ---------------------------------------------------------
    /** @type {GameItem[]} */
    this.items = [
      // -------------- WEAPONS ---------------
      {
        name: 'Poverty Shot',
        code: 'BW01',
        category: ITEM_CATEGORIES.WEAPON,
        description: 'Single shot projectile with a small explosion radius.',
        cost: 1,
        icon: 'icons/basic_shot.png'
      },
      {
        name: 'Pea Shooter',
        code: 'MS01',
        category: ITEM_CATEGORIES.WEAPON,
        description: 'Several consecutive shots but with medium deviation.',
        cost: 100,
        icon: 'icons/basic_shot.png'
      },
      {
        name: 'Bouncing Betty',
        code: 'BB01',
        category: ITEM_CATEGORIES.WEAPON,
        description: 'Boing! .. Boing! .. Boing! .. Boing!',
        cost: 300,
        icon: 'icons/basic_shot.png'
      },
      {
        name: 'Bouncing Rabbit',
        code: 'BR01',
        category: ITEM_CATEGORIES.WEAPON,
        description: 'Multiplies on impact!',
        cost: 500,
        icon: 'icons/basic_shot.png'
      },
      {
        name: 'Volley Weapon',
        code: 'VW01',
        category: ITEM_CATEGORIES.WEAPON,
        description: 'Shoots a volley of projectiles with medium spread.',
        cost: 950,
        icon: 'icons/triple_shot.png'
      },
      {
        name: 'Mountain Merc',
        code: 'MM01',
        category: ITEM_CATEGORIES.WEAPON,
        description: 'One thing leads to another...',
        cost: 900,
        icon: 'icons/quad_shot.png'
      },
      {
        name: 'Rain Of Fire',
        code: 'RF01',
        category: ITEM_CATEGORIES.WEAPON,
        description: 'Rain down up to 30 shots from the carrier projectile.',
        cost: 2300,
        icon: 'icons/airstrike.png'
      },
      {
        name: 'Cluster Weapon',
        code: 'CW01',
        category: ITEM_CATEGORIES.WEAPON,
        description: 'A carrier projectile splits into multiple projectiles at the apex of flight.',
        cost: 1250,
        icon: 'icons/cluster_shot.png'
      },
      {
        name: 'Jumping Bean',
        code: 'JB01',
        category: ITEM_CATEGORIES.WEAPON,
        description: 'Damn Mexicans!',
        cost: 1250,
        icon: 'icons/cluster_shot.png'
      },
      {
        name: 'Sprinkler',
        code: 'SP01',
        category: ITEM_CATEGORIES.WEAPON,
        description: 'My sprinkler goes psh psh psh psh psh psh...',
        cost: 1250,
        icon: 'icons/cluster_shot.png'
      },
      {
        name: 'Popcorn',
        code: 'PC01',
        category: ITEM_CATEGORIES.WEAPON,
        description: 'Pop pop pop!',
        cost: 1250,
        icon: 'icons/cluster_shot.png'
      },
      {
        name: 'Heli Killer',
        code: 'HK01',
        category: ITEM_CATEGORIES.WEAPON,
        description: 'Seek and ye shall find...',
        cost: 1250,
        icon: 'icons/cluster_shot.png'
      },
      {
        name: 'Multi Heli Killer',
        code: 'HK02',
        category: ITEM_CATEGORIES.WEAPON,
        description: 'BOP BOP BOP BOP BOP',
        cost: 1250,
        icon: 'icons/cluster_shot.png'
      },

      // -------------- ARMOR ---------------
      {
        name: 'Light Armor',
        code: 'LA01',
        category: ITEM_CATEGORIES.ARMOR,
        description: 'Minor damage reduction, minimal weight.',
        cost: 100,
        icon: 'icons/light_armor.png'
      },
      {
        name: 'Heavy Armor',
        code: 'HA02',
        category: ITEM_CATEGORIES.ARMOR,
        description: 'High damage reduction, but heavier weight.',
        cost: 200,
        icon: 'icons/heavy_armor.png'
      },

      // -------------- CONSUMABLES ---------------
      {
        name: 'Repair Kit',
        code: 'RK01',
        category: ITEM_CATEGORIES.CONSUMABLE,
        description: 'Restores a portion of health when used.',
        cost: 50,
        icon: 'icons/repair_kit.png'
      },
      {
        name: 'Shield Boost',
        code: 'SB02',
        category: ITEM_CATEGORIES.CONSUMABLE,
        description: 'Temporarily increases your maximum health/shield.',
        cost: 75,
        icon: 'icons/shield_boost.png'
      },

      // -------------- MISC ---------------
      {
        name: 'Extra Fuel',
        code: 'EF01',
        category: ITEM_CATEGORIES.MISC,
        description: 'Increases movement or jump distance for a round.',
        cost: 80,
        icon: 'icons/fuel_jug.png'
      }
    ];
  }

  getStarterItems() {
      // e.g., return a simple array of { name, quantity }
      return [
       { name: 'Poverty Shot', quantity: 1000 },
       { name: 'Jumping Bean', quantity: 40 },
       { name: 'Popcorn', quantity: 40 },
       { name: 'Heli Killer', quantity: 40 },
       { name: 'Multi Heli Killer', quantity: 40 },
       { name: 'Sprinkler', quantity: 40 },    
        { name: 'Pea Shooter', quantity: 12 },
        { name: 'Bouncing Betty', quantity: 12 },
        { name: 'Bouncing Rabbit', quantity: 12 },
        { name: 'Volley Weapon', quantity: 102 },
        { name: 'Cluster Weapon', quantity: 12 },
        { name: 'Mountain Merc', quantity: 12 },
        { name: 'Rain Of Fire', quantity: 122 },
        { name: 'Light Armor', quantity: 1 },
        { name: 'Heavy Armor', quantity: 1 },
        { name: 'Shield Boost', quantity: 1 }
      ];
  }

  /**
   * Retrieve a list of all items in the game (e.g. for displaying shop).
   * @returns {GameItem[]} Array of all item definitions.
   */
  getAllItems() {
    return this.items;
  }

  /**
   * Looks up a particular item by its name.
   * @param {string} name - Item name.
   * @returns {GameItem | undefined} The item, or undefined if not found.
   */
  getItemByName(name) {
    return this.items.find(item => item.name === name);
  }

  /**
   * Looks up a particular item by its code.
   * @param {string} code - Item code.
   * @returns {GameItem | undefined} The item, or undefined if not found.
   */
  getItemByCode(code) {
    return this.items.find(item => item.code === code);
  }

  /**
   * Sends the full shop data to the requesting client.
   * @param {Socket} socket - The client's Socket.IO socket.
   */
  handleShopDataRequest(socket) {
    // We can send the entire list or a filtered subset if needed
    socket.emit('shopData', this.getAllItems());
  }

  /**
   * Cleans up all resources and references held by the ItemManager.
   * This includes:
   * - Clearing the items array
   * - Cleaning up any item resources
   */
  destroy() {
    // Clean up each item if they have cleanup requirements
    for (const item of this.items) {
        // Clear any item-specific resources
        if (item.cleanup) {
            item.cleanup();
        }
        
        // Clear any icon references
        if (item.icon) {
            item.icon = null;
        }
    }
    
    // Clear the items array
    this.items = [];
    
    // Clear the ITEM_CATEGORIES reference if needed
    // Note: Since ITEM_CATEGORIES is imported as a constant, 
    // we don't actually need to clear it as it will be garbage collected
  }

  /**
   * Handle a client's purchase request. Checks if the item exists,
   * verifies the player's funds, deducts cost, adds item to inventory, etc.
   * 
   * @param {Socket} socket - The requesting client socket.
   * @param {Object} player - The Player instance.
   * @param {string} itemName - The name of the item to purchase.
   * @param {number} quantity - Number of items to buy.
   * @param {Function} broadcastPlayerUpdate - A callback to broadcast updated player state if purchase is successful.
   * @param {string} gameState - Current game state, so we can ensure we only allow purchases in SHOPPING phases, etc.
   */
  handlePurchaseRequest(socket, player, itemName, quantity, broadcastPlayerUpdate, gameState) {
    try {
      // If we only allow purchasing in a specific phase
      if (gameState !== 'SHOPPING') {
        socket.emit('errorMessage', 'You can only purchase items during the SHOPPING phase.');
        return;
      }

      // Validate item
      const itemToPurchase = this.getItemByName(itemName);
      if (!itemToPurchase) {
        socket.emit('errorMessage', `Item "${itemName}" does not exist.`);
        return;
      }

      // Validate quantity
      const qty = parseInt(quantity, 10);
      if (isNaN(qty) || qty <= 0) {
        socket.emit('errorMessage', 'Invalid quantity specified.');
        return;
      }

      // Calculate total cost
      const totalCost = itemToPurchase.cost * qty;

      // Check player funds
      if (player.cash < totalCost) {
        socket.emit('errorMessage', 'Not enough funds to purchase this item.');
        return;
      }

      // Deduct funds from player
      player.cash -= totalCost;
      // Add item to player inventory
      player.addItem(itemToPurchase, qty);

      // Let the purchaser know it was successful
      socket.emit('purchaseSuccess', {
        itemName,
        quantity: qty,
        newCash: player.cash
      });

      // Let everyone (or at least the player) know the player state changed
      broadcastPlayerUpdate(player.id);

    } catch (error) {
      console.error('[ItemManager] Purchase error:', error);
      socket.emit('errorMessage', 'An error occurred during purchase.');
    }
  }
}