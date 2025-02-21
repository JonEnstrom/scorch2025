// ProjectileManager.js
import { Projectile } from "./Projectile.js";
import { checkCollision } from "./Collision.js";
import HelicopterManager from "./HelicopterManager.js";

export class ProjectileManager {
    /**
     * @param {Object} io - Socket.IO server instance
     * @param {TerrainManager} terrainManager - Terrain manager instance
     * @param {string} gameId - Identifier for the game room
     * @param {HelicopterManager} helicopterManager - Helicopter manager instance
     */
    constructor(io, terrainManager, gameId, helicopterManager) {
        this.io = io;
        this.terrainManager = terrainManager;
        this.gameId = gameId;
        this.helicopterManager = helicopterManager; // New Dependency
        this.activeProjectiles = [];
        this.onImpactCallback = null;
        this.weaponHandlers = new Map();
    }

    registerWeaponHandler(weaponId, callback) {
        this.weaponHandlers.set(weaponId, callback);
    }

    setImpactHandler(callback) {
        this.onImpactCallback = callback;
    }

    /**
     * Spawns projectiles fired by a player.
     * @param {string} playerId - ID of the player firing the projectile
     * @param {Array<Object>} projectilesData - Array of projectile data objects
     * @param {string} weaponId - ID of the weapon used
     * @param {string} weaponCode - Code of the weapon used
     * @returns {Array<string>} Array of created projectile IDs
     */
    spawnProjectiles(playerId, projectilesData, weaponId, weaponCode) {
        const createdProjectileIds = [];
        for (const data of projectilesData) {
            const projectile = new Projectile(
                data.startPos,
                data.direction,
                data.power,
                playerId,
                this.terrainManager.theme,
                {
                    ...data,
                    weaponId: weaponId,
                    weaponCode: weaponCode,
                }
            );

            this.activeProjectiles.push(projectile);
            createdProjectileIds.push(projectile.id);

            // Emit the projectile creation event with all necessary IDs
            this.io.to(this.gameId).emit('projectileFired', {
                projectileId: projectile.id,
                playerId: playerId,
                startPos: data.startPos,
                direction: data.direction,
                power: data.power,
                weaponId: projectile.weaponId,
                weaponCode: projectile.weaponCode,
                isFinalProjectile: data.isFinal,
                doesCollide: data.doesCollide,
                projectileStyle: data.projectileStyle,
                projectileScale: data.projectileScale,
                explosionType: data.explosionType,
                explosionSize: data.explosionSize,
                craterSize: data.craterSize,
            });
        }

        return createdProjectileIds;
    }

    /**
     * Retrieves a projectile by its ID.
     * @param {string} id - Projectile ID
     * @returns {Projectile | null} - The projectile instance or null if not found
     */
    getProjectileById(id) {
        return this.activeProjectiles.find(projectile => projectile.id === id) || null;
    }

    /**
     * Updates all active projectiles, checking for collisions with terrain and helicopters.
     * @param {number} deltaTime - Time elapsed since last update (in seconds)
     * @param {Object} players - Current state of all players (if needed)
     * @returns {Array<Object> | null} - Array of impact events or null
     */
    update(deltaTime, players) {
        const impactEvents = [];
        const remainingProjectiles = [];

        for (const projectile of this.activeProjectiles) {
            const impactData = projectile.update(deltaTime, this.terrainManager, players);

            let collided = false;

            if (impactData) {
                // Collision with terrain
                impactEvents.push(impactData);
                if (this.onImpactCallback) {
                    this.onImpactCallback(impactData);
                }
                const weaponHandler = this.weaponHandlers.get(projectile.weaponId);
                if (weaponHandler) {
                    weaponHandler(impactData);
                }
                collided = true;
            }

            if (!collided) {
                // Check collision with helicopters
                const helicopters = this.helicopterManager.helicopters;
                for (const helicopter of helicopters.values()) {
                    if (checkCollision(projectile, helicopter)) {
                        const damage = projectile.baseDamage;
                        const destroyed = helicopter.takeDamage(damage);
                    
                        // Create impact event with helicopter hit flag
                        const helicopterImpactEvent = {
                            position: {
                                x: projectile.position.x,
                                y: projectile.position.y,
                                z: projectile.position.z
                            },
                            hitHelicopterId: helicopter.id,
                            damage: damage,
                            isHelicopterHit: true, // Add this flag
                            isFinalProjectile: projectile.isFinalProjectile,
                            aoeSize: projectile.aoeSize,
                            craterSize: projectile.craterSize
                        };
                    
                        // Emit damage event
                        this.io.to(this.gameId).emit('helicopterDamaged', {
                            id: helicopter.id,
                            damage: damage,
                            health: helicopter.health,
                        });
                    
                        if (destroyed) {
                            this.io.to(this.gameId).emit('helicopterDestroyed', { id: helicopter.id });
                            this.helicopterManager.helicopters.delete(helicopter.id);
                        }
                    
                        // Handle weapon-specific logic
                        if (this.onImpactCallback) {
                            this.onImpactCallback(helicopterImpactEvent);
                        }
                        const weaponHandler = this.weaponHandlers.get(projectile.weaponId);
                        if (weaponHandler) {
                            weaponHandler(helicopterImpactEvent);
                        }
                    
                        // Remove the projectile after collision
                        collided = true;
                        break;
                    }
               }
            }

            if (!collided) {
                // If no collision occurred, keep the projectile active
                remainingProjectiles.push(projectile);
            }
        }

        this.activeProjectiles = remainingProjectiles;
        return impactEvents.length > 0 ? impactEvents : null;
    }

    /**
     * Cleans up all active projectiles and listeners.
     */
    destroy() {
        if (this.activeProjectiles.length > 0) {
            this.io.to(this.gameId).emit('projectilesCleanup', {
                projectileIds: this.activeProjectiles.map(p => p.id)
            });
        }

        this.activeProjectiles = [];
        this.onImpactCallback = null;
        this.io = null;
        this.terrainManager = null;
        this.helicopterManager = null;
        this.weaponHandlers.clear();
    }
}
