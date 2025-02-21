import * as THREE from 'three';
import { v4 as uuidv4 } from 'uuid';

export default class AirStrikeWeapon {
    constructor(projectileManager) {
        this.projectileManager = projectileManager;
        this.id = uuidv4();
        this.weaponCode = 'RF01';
        // Maximum number of bombs to drop
        this.strikeCount = 40;

        // Time in ms between each bomb drop
        this.strikeDelay = 100;

        // How high bombs drop from (above the carrier projectile)
        this.altitude = 0;

        // Maximum angle deviation for bomb direction (in radians)
        this.spreadAngle = Math.PI / 3; // 60 degrees total spread (±30°)

        // Initial delay before starting to drop bomblets (in ms)
        this.initialDelay = 1000; // 1 second

        // Internal state to keep track of our carrier and bomb-dropping interval.
        this.carrierId = null;
        this.dropInterval = null;
        this.bombsRemaining = this.strikeCount;

        // Register an impact handler that will stop the bomb drops when the carrier impacts.
        // (Assumes impactData contains a projectileId property.)
        this.projectileManager.registerWeaponHandler(this.id, (impactData) => {
            if (impactData.projectileId === this.carrierId) {
                // Carrier projectile has impacted: stop further bomb drops.
                if (this.dropInterval) {
                    clearInterval(this.dropInterval);
                    this.dropInterval = null;
                }
            }
        });
    }

    /**
     * Called when the tank fires this weapon.
     * @param {Object} tank - The tank or player data.
     * @param {string} playerId - The ID of the player firing.
     */
    fire(tank, playerId) {
        // 1) Spawn the "carrier" projectile from the tank's barrel tip.
        const baseDirection = tank.getFireDirection();
        const spawnPos = tank.getBarrelTip();
        const power = tank.power;

        const carrierData = [{
            startPos: spawnPos.clone(),
            direction: baseDirection.clone(),
            power,
            isFinalProjectile: true, // Indicates this is the carrier.
            projectileStyle: 'missile',
            projectileScale: 4,
        }];

        const carrierIds = this.projectileManager.spawnProjectiles(playerId, carrierData, this.id, this.weaponCode);
        if (!carrierIds || carrierIds.length === 0) {
            console.warn('Failed to spawn carrier projectile for AirStrikeWeapon.');
            return;
        }

        // Save the carrier projectile's id so that we can later identify its impact.
        this.carrierId = carrierIds[0];
        this.bombsRemaining = this.strikeCount;

        // Start a timer that will begin dropping bombs after the initial delay.
        setTimeout(() => {
            this.dropInterval = setInterval(() => {
                // Stop dropping bombs if we have dropped them all.
                if (this.bombsRemaining <= 0) {
                    clearInterval(this.dropInterval);
                    this.dropInterval = null;
                    return;
                }

                // Get the current position of the carrier projectile.
                // (We still use this lookup so that bombs drop from its current location.)
                const carrierProjectile = this.projectileManager.getProjectileById(this.carrierId);
                if (!carrierProjectile) {
                    // Even if the carrier isn’t found, we rely on the impact event to stop dropping bombs.
                    return;
                }
                const carrierPos = carrierProjectile.position.clone();

                // Calculate the bomb spawn position (above the carrier).
                const bombSpawnPos = carrierPos.clone();
                bombSpawnPos.y += this.altitude;

                // Create a bomb direction based on the carrier's base direction,
                // then add a random horizontal deviation.
                const bombDirection = baseDirection.clone();
                const horizontalDeviation = (Math.random() - 0.5) * this.spreadAngle;
                const rotationMatrix = new THREE.Matrix4();
                rotationMatrix.makeRotationY(horizontalDeviation);
                bombDirection.applyMatrix4(rotationMatrix);

                const bombData = [{
                    startPos: bombSpawnPos,
                    direction: bombDirection,
                    power: 100, // Bomb power can be fixed or calculated as needed.
                    isFinalProjectile: false,
                    explosionSize: 3.0,
                    projectileStyle: 'bomblet',
                    craterSize: 75,
                    aoeSize: 150,
                }];

                // Spawn a bomb.
                this.projectileManager.spawnProjectiles(playerId, bombData, this.id, this.weaponCode + '_BOMBLET');
                this.bombsRemaining--;
            }, this.strikeDelay);
        }, this.initialDelay);
    }

    /**
     * Cleanup: clear timers and remove the impact handler registration.
     */
    destroy() {
        if (this.dropInterval) {
            clearInterval(this.dropInterval);
            this.dropInterval = null;
        }
        // Remove the impact handler (if your projectileManager stores weaponHandlers in a Map)
        this.projectileManager.weaponHandlers.delete(this.id);
    }
}
