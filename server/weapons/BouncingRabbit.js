import { v4 as uuidv4 } from 'uuid';
import * as THREE from 'three';

export class BouncingRabbitWeapon {
    constructor(projectileManager) {
        this.projectileManager = projectileManager;
        this.id = uuidv4();
        this.weaponCode = 'BR01';
        
        this.maxBounces = 4;
        this.bounceAngle = Math.PI / 2;
        this.spreadVariance = 0.8;
        this.powerRetention = 0.8;
        this.baseFireDirection = null;
        this.maxTotalProjectiles = 27; // 3^3 splits
        this.currentProjectileCount = 0;
        
        this.projectileManager.registerWeaponHandler(this.id, (impactData) => {
            this.handleImpact(impactData);
        });
    }

    fire(tank, playerId) {
        this.currentProjectileCount = 1;
        this.baseFireDirection = tank.getFireDirection();
        const projectileData = [{
            startPos: tank.getBarrelTip(),
            direction: this.baseFireDirection,
            power: tank.power,
            isFinal: false,
            explosionType: 'normal',
            explosionSize: 1,
            projectileScale: 3,
            projectileStyle: 'missile',
            bounceCount: 0,
            craterSize: 30,
            baseDamage: 40,
        }];

        this.projectileManager.spawnProjectiles(playerId, projectileData, this.id, this.weaponCode);
    }

    handleImpact(impactData) {
        const currentBounce = impactData.bounceCount || 0;
        
        if (currentBounce < this.maxBounces) {
            const nextSplitCount = this.currentProjectileCount * 3;
            const isFinalSplit = nextSplitCount >= this.maxTotalProjectiles;
            
            const nextProjectiles = [
                this.createBounceProjectile(impactData.position, impactData.playerId, currentBounce + 1, impactData.power || 250, -0.4, false),
                this.createBounceProjectile(impactData.position, impactData.playerId, currentBounce + 1, impactData.power || 250, -0, false),
                this.createBounceProjectile(impactData.position, impactData.playerId, currentBounce + 1, impactData.power || 250, 0.4, isFinalSplit),
                this.createBounceProjectile(impactData.position, impactData.playerId, currentBounce + 1, impactData.power || 250, -0.8, false),
                this.createBounceProjectile(impactData.position, impactData.playerId, currentBounce + 1, impactData.power || 250, 0.8, isFinalSplit)
            ];
            
            this.currentProjectileCount = nextSplitCount;
            const weaponId = isFinalSplit ? null : this.id;
            
            this.projectileManager.spawnProjectiles(
                impactData.playerId, 
                nextProjectiles, 
                weaponId,
                this.weaponCode,
            );
        }
    }

    createBounceProjectile(position, playerId, bounceCount, parentPower, spreadDirection = 0, isFinal = false) {
        const bounceDirection = this.baseFireDirection.clone();
        
        const upwardComponent = Math.sin(this.bounceAngle);
        bounceDirection.y = upwardComponent;
    
        const rightVector = new THREE.Vector3(0, 1, 0).cross(bounceDirection).normalize();
        const sideVariance = spreadDirection * this.spreadVariance;
        bounceDirection.add(rightVector.multiplyScalar(sideVariance));
        
        const rotationAngle = (Math.random() - 0.5) * this.spreadVariance;
        bounceDirection.applyAxisAngle(
            new THREE.Vector3(0, 1, 0),
            rotationAngle
        );
        
        const bouncePower = parentPower * Math.pow(this.powerRetention, bounceCount);
    
        return {
            startPos: new THREE.Vector3(
                position.x,
                position.y + 0.1,
                position.z
            ),
            direction: bounceDirection.normalize(),
            power: bouncePower,
            isFinalProjectile: isFinal,
            explosionType: 'normal',
            explosionSize: bounceCount,
            projectileScale: Math.max(2.0 - (bounceCount * 0.2), 0.25),
            projectileStyle: 'missile',
            bounceCount: bounceCount,
            craterSize: 30,
            baseDamage: 20,
        };
    }

    destroy() {
        this.projectileManager.weaponHandlers.delete(this.id);
    }
}