// server/ArmorShieldManager.js

export default class ArmorShieldManager {
    /**
     * Apply incoming damage to a player, taking into account shield and armor.
     *
     * Shields work first: they absorb damage 100% until depleted.
     * After shields are used up, armor and health share the remaining damage.
     *   - If the player's armor is at least half of the remaining damage,
     *     then half of the damage is subtracted from the armor and half from health.
     *   - Otherwise, the available armor is fully depleted and the rest goes to health.
     *
     * @param {Player} player - The player instance.
     * @param {number} damage - The incoming damage value.
     * @returns {Object} An object detailing the damage distribution.
     */
    static applyDamage(player, damage) {
      let remainingDamage = damage;
      let shieldDamage = 0;
      let armorDamage = 0;
      let healthDamage = 0;
  
      // Skip if player is already defeated
      if (!player.isAlive) {
          return {
              shieldDamage: 0,
              armorDamage: 0,
              healthDamage: 0,
              remainingShield: player.shield,
              remainingArmor: player.armor,
              remainingHealth: player.health,
          };
      }
  
      // Shields absorb damage first.
      if (player.shield > 0) {
          shieldDamage = Math.min(player.shield, remainingDamage);
          player.shield -= shieldDamage;
          remainingDamage -= shieldDamage;
      }
  
      // Apply remaining damage via armor mechanics.
      if (remainingDamage > 0) {
          if (player.armor >= remainingDamage / 2) {
              armorDamage = remainingDamage / 2;
              healthDamage = remainingDamage / 2;
          } else {
              armorDamage = player.armor;
              healthDamage = remainingDamage - player.armor;
          }
          player.armor = Math.max(0, player.armor - armorDamage);
          player.health = Math.max(0, player.health - healthDamage);
  
          // Check if player is defeated after damage
          if (player.health <= 0) {
              player.isAlive = false;
          }
      }
  
      return {
          shieldDamage,
          armorDamage,
          healthDamage,
          remainingShield: player.shield,
          remainingArmor: player.armor,
          remainingHealth: player.health,
      };
  }
    
    /**
     * Add a shield value to the player.
     *
     * @param {Player} player - The player instance.
     * @param {number} amount - Amount of shield to add.
     */
    static addShield(player, amount) {
      player.shield += amount;
      player.hasShield = true;
    }
  
    /**
     * Add an armor value to the player.
     *
     * @param {Player} player - The player instance.
     * @param {number} amount - Amount of armor to add.
     */
    static addArmor(player, amount) {
      player.armor += amount;
    }
  }
  