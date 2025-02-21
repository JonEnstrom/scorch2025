import * as THREE from 'three';
import { v4 as uuidv4 } from 'uuid';

export default class BasicWeapon {
    constructor(projectileManager) {
        this.projectileManager = projectileManager;
        this.weaponCode = 'BW01';
        this.id = uuidv4();
    }

    /**
     * Called when the tank fires this weapon.
     * @param {Object} tank - The tank or player data.
     * @param {string} playerId - The ID of the player firing.
     */
    fire(tank, playerId) {
        // Get the current position and direction
        const direction = tank.getFireDirection();
        const spawnPos = tank.getBarrelTip();
        const power = tank.power;

        // Create projectile data
        const projectileData = [{
            startPos: spawnPos.clone(),
            direction: direction.normalize(),
            power,
            isFinalProjectile: true,
            projectileStyle: 'missile',
            craterSize: 30,
            baseDamage: 20,
        }];

        // Spawn the projectile
        this.projectileManager.spawnProjectiles(playerId, projectileData, this.id, this.weaponCode);
    }
}