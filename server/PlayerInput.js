// processInput.js

import MultiShotWeapon from './weapons/MultiShotWeapon.js';
import VolleyWeapon from './weapons/VolleyWeapon.js';
import AirstrikeWeapon from './weapons/AirstrikeWeapon.js';
import { MountainMercWeapon } from './weapons/MountainMerc.js';
import ClusterWeapon from './weapons/ClusterWeapon.js';
import { BouncingBettyWeapon } from './weapons/BouncingBetty.js';
import BasicWeapon from './weapons/BasicWeapon.js';
import { BouncingRabbitWeapon } from './weapons/BouncingRabbit.js';
import { JumpingBeanWeapon } from './weapons/JumpingBean.js';
import { SprinklerWeapon } from './weapons/SprinklerWeapon.js';
import ArmorShieldManager from './ArmorShieldManager.js';
import { PopcornWeapon } from './weapons/PopcornWeapon.js';
import GuidedWeapon from './weapons/GuidedWeapon.js';
import MultiGuidedWeapon from './weapons/MultiGuidedWeapon.js';

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
    // Only process if it's the current player's turn and they haven't fired
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

        case 'fire': {
            gameInstance.playerManager.stopTurnTimer();

            const weaponCode = input.weaponCode;
            if (!weaponCode) {
                gameInstance.io.to(playerId).emit('errorMessage', 'No weapon specified.');
                return;
            }

            // Check player inventory
            const inventoryEntry = tank.getInventory()[weaponCode];
            if (!inventoryEntry || inventoryEntry.quantity <= 0) {
                gameInstance.io.to(playerId).emit('errorMessage', 'You don\'t have any of that weapon left!');
                return;
            }

            // Remove one usage from inventory
            tank.removeItem(weaponCode, 1);

            // Instantiate the correct weapon
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
                case 'RF01': // Airstrike
                    weaponInstance = new AirstrikeWeapon(gameInstance.projectileManager);
                    break;
                case 'BW01': // BasicWeapon
                    weaponInstance = new BasicWeapon(gameInstance.projectileManager);
                    break;
                    case 'MS01': // MultiShot
                    weaponInstance = new MultiShotWeapon(gameInstance.projectileManager);
                    break;
                case 'JB01': // Jumping Bean
                    weaponInstance = new JumpingBeanWeapon(gameInstance.projectileManager);
                    break;
                case 'SP01': // Sprinkler
                    weaponInstance = new SprinklerWeapon(gameInstance.projectileManager);
                    break;
                    case 'PC01': // Popcorn
                    weaponInstance = new PopcornWeapon(gameInstance.projectileManager);
                    break;
                    case 'HK01': // Heli Killer
                    weaponInstance = new GuidedWeapon(gameInstance.projectileManager);
                    break;
                    case 'HK02': // Multi Heli Killer
                    weaponInstance = new MultiGuidedWeapon(gameInstance.projectileManager);
                    break;
                default:
                    gameInstance.io.to(playerId).emit('errorMessage', `Unknown weapon code: ${weaponCode}`);
                    return;
            }

            // Mark that the current player has fired
            gameInstance.playerManager.currentPlayerHasFired = true;

            // --------------  NEW: Get timeline and schedule it  --------------
            // Fire the weapon, get its timeline of projectile events
            const timelineEvents = weaponInstance.fire(tank, playerId, gameInstance);
            if (Array.isArray(timelineEvents) && timelineEvents.length > 0) {
                // Schedule these events to occur at the correct times
                gameInstance.scheduleProjectileEvents(timelineEvents);
            }
            // -----------------------------------------------------------------

            break;
        }

        case 'use': {
            const itemCode = input.itemCode;
            if (!itemCode) {
                gameInstance.io.to(playerId).emit('errorMessage', 'No item specified.');
                return;
            }

            const itemEntry = tank.getInventory()[itemCode];
            if (!itemEntry || itemEntry.quantity <= 0) {
                gameInstance.io.to(playerId).emit('errorMessage', 'You don\'t have any of that item left!');
                return;
            }

            // Remove one instance of the item
            tank.removeItem(itemCode, 1);

            // Process the item
            switch (itemCode) {
                // -------------- ARMOR ---------------
                case 'LA01': // Light Armor
                {
                    const armorValue = 100;
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
                    const armorValue = 100;
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
                    // Example: tank.repairHealth(25);
                    gameInstance.io.to(playerId).emit('message', 'Repair Kit used.');
                    break;
                case 'SB02': // Shield Boost
                {
                    const shieldValue = 100;
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
                    // Example: tank.addFuel(10);
                    gameInstance.io.to(playerId).emit('message', 'Extra Fuel applied.');
                    break;

                default:
                    gameInstance.io.to(playerId).emit('errorMessage', `Unknown item code: ${itemCode}`);
                    return;
            }

            // Optionally broadcast updated player state
            gameInstance.playerManager.broadcastPlayerUpdate(playerId);
            break;
        }
    }
}
