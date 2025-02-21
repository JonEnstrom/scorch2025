
import { ClientProjectile } from './Projectile.js'; // Adjust the import path as needed
import * as THREE from 'three';

export class ProjectileSimulator {
    /**
     * @param {ClientProjectile} projectile
     * @param {TerrainGenerator} terrain
     */
    constructor(projectile, terrain) {
        this.projectile = projectile;
        this.terrain = terrain;
        this.gravity = projectile.gravity;
    }

    /**
     * Solves for the collision time using binary search
     * @param {number} maxTime - Maximum simulation time
     * @param {number} precision - Desired precision for collision time
     * @returns {Object} Collision data or null if no collision within maxTime
     */
    computeCollision(maxTime = 10, precision = 0.001) {
        let tLow = 0;
        let tHigh = maxTime;
        let collision = null;

        while (tHigh - tLow > precision) {
            const tMid = (tLow + tHigh) / 2;
            const pos = this.getPositionAtTime(tMid);
            const terrainHeight = this.terrain.getHeightAtPosition(pos.x, pos.z);

            if (pos.y <= terrainHeight) {
                collision = {
                    time: tMid,
                    position: pos
                };
                tHigh = tMid; // Look for earlier collision
            } else {
                tLow = tMid; // Look for collision at a later time
            }
        }

        if (collision) {
            // Optionally, you can refine the collision data further
            return this.generateCollisionData(collision.time, collision.position);
        }

        return null; // No collision detected within maxTime
    }

    /**
     * Computes the projectile's position at a given time
     * @param {number} t
     * @returns {THREE.Vector3}
     */
    getPositionAtTime(t) {
        const pos = new THREE.Vector3();
        pos.x = this.projectile.position.x + this.projectile.velocity.x * t;
        pos.z = this.projectile.position.z + this.projectile.velocity.z * t;
        pos.y = this.projectile.position.y + this.projectile.velocity.y * t + 0.5 * this.gravity * t * t;
        return pos;
    }

    /**
     * Generates the collision data based on the collision time and position
     * @param {number} t
     * @param {THREE.Vector3} pos
     * @returns {Object}
     */
    generateCollisionData(t, pos) {
        return {
            projectileId: this.projectile.id,
            playerId: this.projectile.playerId,
            position: pos,
            isFinalProjectile: this.projectile.isFinalProjectile,
            craterSize: this.projectile.craterSize,
            aoeSize: this.projectile.aoeSize,
            damage: this.projectile.baseDamage,
            explosionSize: this.projectile.explosionSize,
            explosionType: this.projectile.explosionType,
            bounceCount: this.projectile.bounceCount,
            hitTankId: null, 
            affectedTanks: [],
            time: t,
        };
    }
}
