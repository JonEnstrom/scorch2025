import MultiShotWeapon from './weapons/MultiShotWeapon.js';
import VolleyWeapon from './weapons/VolleyWeapon.js';
import AirstrikeWeapon from './weapons/AirstrikeWeapon.js';
import { MountainMercWeapon } from './weapons/MountainMerc.js';
import ClusterWeapon from './weapons/ClusterWeapon.js';
import { BouncingBettyWeapon } from './weapons/BouncingBetty.js';
import BasicWeapon from './weapons/BasicWeapon.js';
import { BouncingRabbitWeapon } from './weapons/BouncingRabbit.js';
import ArmorShieldManager from './ArmorShieldManager.js';
    
/**
 * Process incoming input from a player (movement, firing, using an item, etc.).
 * @param {string} playerId
 * @param {Object} input
 */
export function processInput(playerId, input, gameInstance) {
    if (gameInstance._isDestroyed || !gameInstance.io) {
        return;
    }
    // Only process if it's the correct game state
    if (gameInstance.gameState !== 'ROUND_IN_PROGRESS') {
        return; 
    }
    // Only process if it's gameInstance player's turn and they haven't fired
    if (
        playerId !== gameInstance.playerManager.turnManager.getCurrentPlayerId() ||
        gameInstance.playerManager.currentPlayerHasFired
    ) {
        console.log(playerId + ' trying input.');
        console.log('Current player is : ' + gameInstance.playerManager.currentPlayer);
        console.log('Current player has fired = ' + gameInstance.playerManager.currentPlayerHasFired);
        return;
    }

    const tank = gameInstance.playerManager.players[playerId];
    if (!tank) return;

    switch (input.action) {
        case 'rotateTurret':
            tank.setTurretYaw(input.delta);
            gameInstance.playerManager.broadcastPlayerUpdate(playerId);
            break;
        case 'setTurretYaw':
            tank.newTurretYaw(input.value);
            gameInstance.playerManager.broadcastPlayerUpdate(playerId);
            break;

        case 'pitchTurret':
            tank.deltaTurretPitch(input.delta);
            gameInstance.playerManager.broadcastPlayerUpdate(playerId);
            break;

        case 'setTurretPitch':
            tank.setTurretPitch(input.value);
            gameInstance.playerManager.broadcastPlayerUpdate(playerId);
            break;
                    
        case 'changePower':
            tank.adjustPower(input.delta);
            gameInstance.playerManager.broadcastPlayerUpdate(playerId);
            break;

        case 'setPower':
            tank.setPower(input.value);
            gameInstance.playerManager.broadcastPlayerUpdate(playerId);
            break;
        
        case 'fire':
            gameInstance.playerManager.stopTurnTimer();
            const weaponCode = input.weaponCode;
            if (!weaponCode) {
                gameInstance.io.to(playerId).emit('errorMessage', 'No weapon specified.');
                return;
            }
        
            // Get the full item data from player's inventory
            const inventoryEntry = tank.getInventory()[weaponCode];
            if (!inventoryEntry || inventoryEntry.quantity <= 0) {
                gameInstance.io.to(playerId).emit('errorMessage', 'You don\'t have any of that weapon left!');
                return;
            }
        
            // Remove one instance of the weapon
            tank.removeItem(weaponCode, 1);
        
            // Create the appropriate weapon instance based on the item code
            let weaponInstance;
            switch (weaponCode) {
                case 'CW01': // ClusterWeapon
                    weaponInstance = new ClusterWeapon(gameInstance.projectileManager);
                    break;
                case 'BB01': // Bouncing Betty
                    weaponInstance = new BouncingBettyWeapon(gameInstance.projectileManager);
                    break;
                case 'BR01': // Bouncing Rabbit
                    weaponInstance = new BouncingRabbitWeapon(gameInstance.projectileManager);
                    break;
                case 'VW01': // VolleyWeapon
                    weaponInstance = new VolleyWeapon(gameInstance.projectileManager);
                    break;
                case 'MM01': // Mountain Merc
                    weaponInstance = new MountainMercWeapon(gameInstance.projectileManager);
                    break;
                case 'RF01': // AirstrikeWeapon
                    weaponInstance = new AirstrikeWeapon(gameInstance.projectileManager);
                    break;
                case 'BW01': // BasicWeapon
                    weaponInstance = new BasicWeapon(gameInstance.projectileManager);
                    break;
                case 'MS01': // Multishot Weapon
                    weaponInstance = new MultiShotWeapon(gameInstance.projectileManager);
                    break;
                default:
                    gameInstance.io.to(playerId).emit('errorMessage', `Unknown weapon code: ${weaponCode}`);
                    return;
            }                
            gameInstance.playerManager.currentPlayerHasFired = true;
            weaponInstance.fire(tank, playerId);
            break;

        case 'use':
            // Handle a player "using" an item (like armor, consumables, or misc items)
            const itemCode = input.itemCode;
            if (!itemCode) {
                gameInstance.io.to(playerId).emit('errorMessage', 'No item specified.');
                return;
            }
            
            // Get the item from the player's inventory
            const itemEntry = tank.getInventory()[itemCode];
            if (!itemEntry || itemEntry.quantity <= 0) {
                gameInstance.io.to(playerId).emit('errorMessage', 'You don\'t have any of that item left!');
                return;
            }
            
            // Remove one instance of the item
            tank.removeItem(itemCode, 1);
            
            // Process the item based on its code
            switch (itemCode) {
                // -------------- ARMOR ---------------
                case 'LA01': // Light Armor
                {
                  const armorValue = 100; // using 100 for now
                  ArmorShieldManager.addArmor(tank, armorValue);
                  gameInstance.io.in(gameInstance.gameId).emit('armorAdded', {
                    playerId,
                    amount: armorValue,
                    totalArmor: tank.armor
                  });
                  gameInstance.io.in(gameInstance.gameId).emit('playerListUpdated', gameInstance.playerManager.getAllPlayers());
                }
                break;
                case 'HA02': // Heavy Armor
                {
                  const armorValue = 100; // using 100 for now
                  ArmorShieldManager.addArmor(tank, armorValue);
                  gameInstance.io.in(gameInstance.gameId).emit('armorAdded', {
                    playerId,
                    amount: armorValue,
                    totalArmor: tank.armor
                  });
                  gameInstance.io.in(gameInstance.gameId).emit('playerListUpdated', gameInstance.playerManager.getAllPlayers());
                }
                break;                
                // -------------- CONSUMABLES ---------------
                case 'RK01': // Repair Kit
                    // TODO: Implement the repair logic
                    // e.g., tank.repairHealth(25); // repairs 25 health points
                    gameInstance.io.to(playerId).emit('message', 'Repair Kit used.');
                    break;
                    case 'SB02': // Shield Boost
                    {
                      const shieldValue = 100; // using 100 for now
                      ArmorShieldManager.addShield(tank, shieldValue);
                      gameInstance.io.in(gameInstance.gameId).emit('shieldAdded', {
                        playerId,
                        amount: shieldValue,
                        totalShield: tank.shield
                      });
                      gameInstance.io.in(gameInstance.gameId).emit('playerListUpdated', gameInstance.playerManager.getAllPlayers());
                    }
                    break;                
                // -------------- MISC ---------------
                case 'EF01': // Extra Fuel
                    // TODO: Implement the extra fuel logic
                    // e.g., tank.addFuel(10); // adds extra fuel for improved movement
                    gameInstance.io.to(playerId).emit('message', 'Extra Fuel applied.');
                    break;
                
                default:
                    gameInstance.io.to(playerId).emit('errorMessage', `Unknown item code: ${itemCode}`);
                    return;
            }
            
            // Optionally, broadcast the updated player state after using the item
            gameInstance.playerManager.broadcastPlayerUpdate(playerId);
            break;
    }
}
