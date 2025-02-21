import { v4 as uuidv4 } from 'uuid';
import * as THREE from 'three';

export class Projectile {
    /**
     * @param {THREE.Vector3} startPos
     * @param {THREE.Vector3} direction
     * @param {number} power
     * @param {string} playerId
     * @param {Object} options
     */
    constructor(startPos, direction, power, playerId, theme, options = {}) {
        // Required tracking IDs
        this.id = uuidv4();
        this.weaponId = options.weaponId;
        this.weaponCode = options.weaponCode || null;
        this.playerId = playerId;
        this.isAlive = true;
        this.theme = theme;

        // Position and motion setup
        this.position = startPos.clone();
        this.moveDirection = direction.clone().normalize();
        
        // Acceleration parameters
        this.maxSpeed = power * 1.0;
        this.currentSpeed = 0;
        this.acceleration = 305; // Units per second²
        
        // Initialize velocity based on direction and current speed (initially 0)
        this.velocity = new THREE.Vector3()
            .copy(direction)
            .normalize()
            .multiplyScalar(this.currentSpeed);
            
        this.gravity = -300;

        // Properties
        this.isFinalProjectile = options.isFinalProjectile || false;
        this.doesCollide = options.doesCollide || true;
        this.projectileStyle = options.projectileStyle || 'missile' // for client side
        this.projectileScale = options.projectileScale || 1; // for client side
        this.explosionType = options.explosionType || 'normal'; // for client side
        this.explosionSize = options.explosionSize || 1; // for client side
        this.craterSize = options.craterSize || 20;
        this.aoeSize = options.aoeSize || 50;
        this.baseDamage = options.baseDamage || 50;
        this.bounceCount = options.bounceCount || 0;
        this.boundingRadius = options.boundingRadius || 1; // Default radius
    }

    /**
     * @param {number} deltaTime
     * @param {TerrainManager} terrainManager
     * @param {Object} tanks
     * @returns {Object | null} Impact data if collision occurred, null otherwise
     */
    update(deltaTime, terrainManager, tanks) {
        if (!this.isAlive) return null;

        // Update speed with acceleration
        if (this.currentSpeed < this.maxSpeed) {
            this.currentSpeed = Math.min(
                this.maxSpeed,
                this.currentSpeed + (this.acceleration * deltaTime)
            );
            
            // Update velocity vector with new speed
            this.velocity.copy(this.moveDirection).multiplyScalar(this.currentSpeed);
        }

        // Update velocity due to gravity
        this.velocity.y += this.gravity * deltaTime;

        // Update position
        this.position.x += this.velocity.x * deltaTime;
        this.position.y += this.velocity.y * deltaTime;
        this.position.z += this.velocity.z * deltaTime;

        // Check ground collision
        const groundHeight = terrainManager.getHeightAtPosition(
            this.position.x, 
            this.position.z
        );

        if (this.position.y <= Math.max(groundHeight, this.theme === 'arctic' ? -1 : -Infinity)) {
            return {
                projectileId: this.id,
                playerId: this.playerId,
                position: {
                    x: this.position.x,
                    y: this.position.y,
                    z: this.position.z,
                },
                isFinalProjectile: this.isFinalProjectile,
                craterSize: this.craterSize,
                aoeSize: this.aoeSize,
                damage: this.baseDamage,
                explosionSize: this.explosionSize,
                explosionType: this.explosionType,
                bounceCount: this.bounceCount,
                hitTankId: null,
                affectedTanks: []
            };
        }

        return null;
    }
}