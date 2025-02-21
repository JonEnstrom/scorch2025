import { v4 as uuidv4 } from 'uuid';
import * as THREE from 'three';

export class BouncingBettyWeapon {
    constructor(projectileManager) {
        this.projectileManager = projectileManager;
        this.id = uuidv4();
        this.weaponCode = 'BB01';
        
        // Weapon configuration
        this.maxBounces = 4;  // Number of times it will bounce
        this.bounceAngle = Math.PI / 2;  // 45 degree bounce angle
        this.spreadVariance = 0.4;  // Random spread applied to each bounce
        this.powerRetention = 0.8;  // Each bounce retains 80% of previous power
        this.baseFireDirection = null;
        
        // Register impact handler
        this.projectileManager.registerWeaponHandler(this.id, (impactData) => {
            this.handleImpact(impactData);
        });
    }

    fire(tank, playerId) {
        this.baseFireDirection = tank.getFireDirection();
        const projectileData = [{
            startPos: tank.getBarrelTip(),
            direction: this.baseFireDirection,
            power: tank.power,
            isFinal: false,
            explosionType: 'normal',
            explosionSize: 2,
            projectileScale: 1,
            projectileStyle: 'missile',
            bounceCount: 0,  // Track which bounce we're on
            craterSize: 50
        }];

        this.projectileManager.spawnProjectiles(playerId, projectileData, this.id, this.weaponCode);
    }

    handleImpact(impactData) {
        const currentBounce = impactData.bounceCount || 0;
        
        if (currentBounce < this.maxBounces) {
            const nextProjectile = this.createBounceProjectile(
                impactData.position,
                impactData.playerId,
                currentBounce + 1,
                impactData.power || 200
            );
            
            const weaponId = (currentBounce === this.maxBounces - 1) ? null : this.id;
            
            this.projectileManager.spawnProjectiles(
                impactData.playerId, 
                [nextProjectile], 
                weaponId,
                this.weaponCode            
            );
        }
    }

    createBounceProjectile(position, playerId, bounceCount, parentPower) {
        // Start with the original fire direction
        const bounceDirection = this.baseFireDirection.clone();
        
        // Add upward component
        const upwardComponent = Math.sin(this.bounceAngle);
        bounceDirection.y = upwardComponent;
    
        // Calculate right vector (perpendicular to fire direction)
        const rightVector = new THREE.Vector3(0, 1, 0).cross(bounceDirection).normalize();
        
        // Add random left/right component (-1 to 1 * spreadVariance)
        const sideVariance = (Math.random() - 0.5) * 2 * this.spreadVariance;
        bounceDirection.add(rightVector.multiplyScalar(sideVariance));
        
        // Apply random rotation around Y axis for varied bounce direction
        const rotationAngle = (Math.random() - 0.5) * this.spreadVariance;
        bounceDirection.applyAxisAngle(
            new THREE.Vector3(0, 1, 0),
            rotationAngle
        );
        
        // Calculate power for this bounce
        const bouncePower = parentPower * Math.pow(this.powerRetention, bounceCount);
    
        return {
            startPos: new THREE.Vector3(
                position.x,
                position.y + 0.1,
                position.z
            ),
            direction: bounceDirection.normalize(),
            power: bouncePower,
            isFinalProjectile: (bounceCount === this.maxBounces),
            explosionType: 'normal',
            explosionSize: 2,
            projectileScale: Math.max(1.0 - (bounceCount * 0.2), 0.25),
            projectileStyle: 'missile',
            bounceCount: bounceCount,
            craterSize: 50

        };
    }

    destroy() {
        this.projectileManager.weaponHandlers.delete(this.id);
    }
}