import * as THREE from 'three';
import { v4 as uuidv4 } from 'uuid';

export default class MultiShotWeapon {
    constructor(projectileManager) {
        this.projectileCount = 8;
        this.spreadAngle = 0.15;
        this.projectileManager = projectileManager;
        this.isSequentialFiring = false;
        this.fireInterval = 500;
        this.id = uuidv4();
        this.weaponCode = 'MS01';
    }

    /**
     * Called when the tank fires this weapon.
     * @param {Object} tank - The tank or player data.
     * @param {string} playerId - The ID of the player firing.
     */
    fire(tank, playerId) {
        // Prevent firing if already in progress
        if (this.isSequentialFiring) return;
        
        this.isSequentialFiring = true;
        let shotsLeft = this.projectileCount;
        
        const fireNextShot = () => {
            // Get updated position and direction for each shot
            const baseDirection = tank.getFireDirection();
            const spawnPos = tank.getBarrelTip();
            const power = tank.power;

            // Add some random spread
            const randomSpread = new THREE.Vector3(
                (Math.random() - 0.5) * this.spreadAngle,
                (Math.random() - 0.5) * this.spreadAngle,
                (Math.random() - 0.5) * this.spreadAngle
            );

            const direction = baseDirection.clone().add(randomSpread).normalize();

            // Create single projectile data
            const projectileData = [{
                startPos: spawnPos.clone(),
                direction,
                power,
                isFinalProjectile: (shotsLeft === 1), // Last shot flag
                projectileStyle: 'missile',
                craterSize: 30,
                baseDamage: 20,
                explosionSize: 1
            }];

            // Spawn single projectile
            this.projectileManager.spawnProjectiles(playerId, projectileData, this.id, this.weaponCode);

            shotsLeft--;

            // Schedule next shot if there are shots remaining
            if (shotsLeft > 0) {
                setTimeout(fireNextShot, this.fireInterval);
            } else {
                this.isSequentialFiring = false;
            }
        };

        // Fire first shot immediately
        fireNextShot();
    }
}