import * as THREE from 'three';
import { v4 as uuidv4 } from 'uuid';

export default class ClusterWeapon {
    constructor(projectileManager) {
        this.projectileManager = projectileManager;
        this.id = uuidv4();
        this.weaponCode = 'CW01';
        
        this.clusterCount = 10;
        this.spreadAngle = 0.3; 
        this.clusterPowerMultiplier = 0.75;
        
        // Add tracking for velocity history
        this.velocityHistory = new Map();
        this.historyLength = 5; // Number of samples to keep
    }

    /**
     * Called when the tank fires this weapon.
     * @param {Object} tank - The tank or player data.
     * @param {string} playerId - The ID of the player firing.
     */
    fire(tank, playerId) {
        // Initial carrier projectile setup
        const baseDirection = tank.getFireDirection();
        const spawnPos = tank.getBarrelTip();
        const power = tank.power;

        const carrierData = [{
            startPos: spawnPos.clone(),
            direction: baseDirection.clone(),
            power,
            isFinalProjectile: true,
            projectileStyle: 'missile',
            explosionSize: 1,
            projectileScale: 2,
            craterSize: 5
        }];

        // Spawn the carrier projectile
        const carrierIds = this.projectileManager.spawnProjectiles(playerId, carrierData, this.id, this.weaponCode);
        
        if (!carrierIds || carrierIds.length === 0) {
            console.warn('Failed to spawn carrier projectile for ClusterWeapon.');
            return;
        }

        const carrierId = carrierIds[0];
        let hasSpawnedCluster = false;
        
        // Initialize velocity history for this projectile
        this.velocityHistory.set(carrierId, []);

        // Set up an interval to check for apex
        const checkInterval = setInterval(() => {
            const carrierProjectile = this.projectileManager.getProjectileById(carrierId);

            if (!carrierProjectile) {
                this.velocityHistory.delete(carrierId);
                clearInterval(checkInterval);
                return;
            }

            // Track velocity history
            const history = this.velocityHistory.get(carrierId);
            history.push(carrierProjectile.velocity.y);
            if (history.length > this.historyLength) {
                history.shift();
            }

            // Check if we've reached apex
            const isAtApex = this.isProjectileAtApex(carrierProjectile, carrierId);
            
            if (isAtApex && !hasSpawnedCluster) {
                hasSpawnedCluster = true;
                this.spawnClusterProjectiles(carrierProjectile, baseDirection, power, playerId);
                this.velocityHistory.delete(carrierId);
                clearInterval(checkInterval);
            }
        }, 50); // Check roughly every frame
    }

    /**
     * Determines if a projectile has reached its apex
     * @param {Object} projectile - The projectile to check
     * @param {string} projectileId - The ID of the projectile
     * @returns {boolean}
     */
    isProjectileAtApex(projectile, projectileId) {
        const history = this.velocityHistory.get(projectileId);
        
        // Don't trigger until we have enough history
        if (history.length < this.historyLength) {
            return false;
        }

        // Current vertical velocity should be low
        const currentVelocity = Math.abs(projectile.velocity.y);
        if (currentVelocity > 10) {
            return false;
        }

        // Check if we're past initial acceleration
        // Get average velocity from history
        const avgVelocity = history.reduce((sum, v) => sum + v, 0) / history.length;
        
        // Verify we're actually at apex by checking if:
        // 1. We're moving slowly vertically
        // 2. Previous velocities were higher (we were going up)
        // 3. We've been in the air long enough to pass initial acceleration
        const wasGoingUp = history[0] > history[history.length - 1];
        const hasGainedHeight = Math.abs(avgVelocity) > currentVelocity;
        
        return currentVelocity < 10 && wasGoingUp && hasGainedHeight;
    }
    
    /**
     * Spawns the cluster of child projectiles
     * @param {Object} carrierProjectile - The carrier projectile at apex
     * @param {THREE.Vector3} baseDirection - Original fire direction
     * @param {number} power - Original fire power
     * @param {string} playerId - ID of the firing player
     */
    spawnClusterProjectiles(carrierProjectile, baseDirection, power, playerId) {
        const clusterData = [];

        // Get carrier's current position and velocity
        const spawnPos = carrierProjectile.position.clone();
        const carrierVelocity = carrierProjectile.velocity.clone();

        // Use carrier's current trajectory for cluster direction
        const clusterBaseDirection = carrierVelocity.normalize();

        for (let i = 0; i < this.clusterCount; i++) {
            // Add spread to each cluster projectile
            const randomSpread = new THREE.Vector3(
                (Math.random() - 0.5) * this.spreadAngle,
                (Math.random() - 0.5) * this.spreadAngle,
                (Math.random() - 0.5) * this.spreadAngle
            );

            const direction = clusterBaseDirection.clone().add(randomSpread).normalize();

            clusterData.push({
                startPos: spawnPos.clone(),
                direction: direction,
                power: 200,
                isFinalProjectile: (i === this.clusterCount - 1),
                projectileStyle: 'missile',    
                explosionSize: 1,
                projectileScale: 1.0,
                craterSize: 25,
            });
        }

        // Spawn all cluster projectiles
        this.projectileManager.spawnProjectiles(playerId, clusterData, this.id, this.weaponCode);
    }
}