// weapons/VolleyWeapon.js
import * as THREE from 'three';
import { v4 as uuidv4 } from 'uuid';

export default class BasicWeapon {
    constructor(projectileManager) {
        this.projectileCount = 10;  // change to multiple if you like
        this.spreadAngle = 0.1;
        this.projectileManager = projectileManager;
        this.id = uuidv4();
        this.weaponCode = 'VW01';
    }

    /**
     * Called when the tank fires this weapon.
     * @param {Object} tank - The tank or player data.
     * @param {string} playerId - The ID of the player firing.
     */
    fire(tank, playerId) {  
        const projectilesData = [];

        // We get the base direction/power from the tank
        const baseDirection = tank.getFireDirection();
        const spawnPos = tank.getBarrelTip();
        const power = tank.power;

        for (let i = 0; i < this.projectileCount; i++) {
            // Flag the last one in the array as final
            const isFinalProjectile = (i === this.projectileCount - 1);

            // Add some random spread
            const randomSpread = new THREE.Vector3(
                (Math.random() - 0.2) * this.spreadAngle,
                (Math.random() - 0.2) * this.spreadAngle,
                (Math.random() - 0.2) * this.spreadAngle
            );

            const direction = baseDirection.clone().add(randomSpread).normalize();

            projectilesData.push({
                startPos: spawnPos.clone(),
                direction,
                power,
                isFinalProjectile,
                projectileStyle: 'missile',
                craterSize: 25,
                explosionSize: 1.5,
                baseDamage: 25
            });
        }

        // Spawn all projectiles in ProjectileManager
        this.projectileManager.spawnProjectiles(playerId, projectilesData, this.id, this.weaponCode);
    }
}