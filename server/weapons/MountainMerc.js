import { v4 as uuidv4 } from 'uuid';
import * as THREE from 'three';

export class MountainMercWeapon {
    constructor(projectileManager) {
        this.projectileManager = projectileManager;
        this.id = uuidv4();
        this.weaponCode = 'MM01';
        
        // Weapon configuration
        this.childCount = 7;
        this.spreadAngle = 0.5;  // Spread in radians
        this.upwardAngle = Math.PI / 6;  // 60 degrees upward
        this.childPowerMultiplier = 0.9;  // Children move slower than parent
        
        // Register impact handler
        this.projectileManager.registerWeaponHandler(this.id, (impactData) => {
            this.handleImpact(impactData);
        });
    }

    fire(tank, playerId) {
        const projectileData = [{
            startPos: tank.getBarrelTip(),
            direction: tank.getFireDirection(),
            power: tank.power,
            isFinalProjectile: false,
            explosionType: 'normal',
            explosionSize: 0.1,
            projectileScale: 3,
            projectileStyle: 'missile',
            craterSize: 1,
        }];

        this.projectileManager.spawnProjectiles(playerId, projectileData, this.id, this.weaponCode);
    }

    handleImpact(impactData) {
        const childProjectiles = this.createChildProjectiles(
            impactData.position,
            impactData.playerId,
            impactData.power || 180  // Default power if not provided
        );
        
        this.projectileManager.spawnProjectiles(
            impactData.playerId, 
            childProjectiles,
            // don't include the weapon id or weapon code so child projectiles don't trigger the impact handler and cause a loop.
        );
    }

    createChildProjectiles(position, playerId, parentPower) {
        const childProjectiles = [];
        const baseDirection = new THREE.Vector3(0, 1, 0);

        for (let i = 0; i < this.childCount; i++) {
            // Create spread around the base direction
            const spreadDirection = baseDirection.clone();
            
            // Apply random rotation around Y axis for circular spread
            const rotationAngle = (Math.random() - 0.5) * this.spreadAngle;
            spreadDirection.applyAxisAngle(
                new THREE.Vector3(0, 1, 0),
                rotationAngle
            );
            
            // Apply some random tilt
            const xTiltAngle = (Math.random() - 0.5) * this.spreadAngle;
            spreadDirection.applyAxisAngle(
                new THREE.Vector3(1, 0, 0),
                xTiltAngle
            );
            // Apply some random tilt
            const zTiltAngle = (Math.random() - 0.5) * this.spreadAngle;
            spreadDirection.applyAxisAngle(
                new THREE.Vector3(0, 0, 1),
                zTiltAngle
            );

            childProjectiles.push({
                startPos: new THREE.Vector3(
                    position.x,
                    position.y + 5,
                    position.z
                ),
                direction: spreadDirection.normalize(),
                power: parentPower * this.childPowerMultiplier * (0.5 + Math.random()),
                isFinalProjectile: (i === this.childCount - 1),
                explosionType: 'normal',
                explosionSize: 3.0,
                projectileScale: 0.7 * (0.5 + Math.random()),
                projectileStyle: 'bomblet',
                craterSize: 80,
            });
        }

        return childProjectiles;
    }

    destroy() {
        this.projectileManager.weaponHandlers.delete(this.id);
    }
}