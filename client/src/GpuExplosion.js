import * as THREE from 'three';

export class GPUExplosionEffect {
    constructor(particleManager) {
        this.particleManager = particleManager;
        this.activeEmitters = new Map(); // Track emitter IDs and their removal timeouts
    }

    async createBasicExplosion(params) {
        const {
            position,
            projectileId,
            explosionSize = 1,
            explosionType = 'normal'
        } = params;

        const pos = position instanceof THREE.Vector3 ? position : 
            new THREE.Vector3(position.x, position.y, position.z);

        switch(explosionType) {
            case 'normal':
                await this._createBasicExplosion(pos, projectileId, explosionSize);
                break;
        }
    }

    scheduleEmitterRemoval(id, lifeSpan) {
        // Clear any existing timeout for this ID
        if (this.activeEmitters.has(id)) {
            clearTimeout(this.activeEmitters.get(id));
        }

        // Schedule removal
        const timeout = setTimeout(() => {
            this.particleManager.removeEmitter(id);
            this.activeEmitters.delete(id);
        }, lifeSpan * 1000); // Convert to milliseconds

        this.activeEmitters.set(id, timeout);
    }

    async _createBasicExplosion(position, projectileId, scale) {
        // Smoke effect
        await this.particleManager.createEmitter(projectileId, {
            position: position,
            particleCount: Math.floor(2 * scale),
            minSpeed: 5,
            maxSpeed: 20,
            spread: new THREE.Vector3(2 * scale, 2 * scale, 2 * scale),
            lifeSpan: 20,
            drag: 0.5,
            randomizeVelocityOnBurst: true,
            colorKeyframes: [
                { t: 0, value: new THREE.Color(0.6, 0.6, 0.6) },    
                { t: 0.5, value: new THREE.Color(0.4, 0.4, 0.4) },  
                { t: 1, value: new THREE.Color(0.2, 0.2, 0.2) }    
            ],
            scaleKeyframes: [
                { t: 0, value: 100 * scale },
                { t: 0.5, value: 2500 * scale },
                { t: 1, value: 5000 * scale }
            ],
            opacityKeyframes: [
                { t: 0, value: 0.2 },
                { t: 0.5, value: 0.1 },
                { t: 1, value: 0.0 }
            ]
        }, './particles/smoke.png');
        this.scheduleEmitterRemoval(projectileId, 20);

        // Fire effect
        const fireId = projectileId + 'fire';
        await this.particleManager.createEmitter(fireId, {
            position: position,
            particleCount: Math.floor(150 * scale),
            minSpeed: 50,
            maxSpeed: 100,
            spread: new THREE.Vector3(5 * scale, 5 * scale, 5 * scale),
            lifeSpan: 0.5,
            blending: 'additive',
            randomizeVelocityOnBurst: true,
            colorKeyframes: [
                { t: 0, value: new THREE.Color(1, 0.9, 0.3) },
                { t: 0.2, value: new THREE.Color(1, 0.5, 0) },
                { t: 0.6, value: new THREE.Color(0.7, 0.3, 0) },
                { t: 1, value: new THREE.Color(0.3, 0.3, 0.3) }
            ],
            scaleKeyframes: [
                { t: 0, value: 50 * scale },
                { t: 0.4, value: 100 * scale },
                { t: 0.7, value: 200 * scale },
                { t: 1, value: 50 * scale }
            ],
            opacityKeyframes: [
                { t: 0, value: 0.5 },
                { t: 0.1, value: 0.9 },
                { t: 0.8, value: 0.5 },
                { t: 1, value: 0.0 }
            ]
        }, './particles/fire_01.png');
        this.scheduleEmitterRemoval(fireId, 0.5);

        // Second fire effect
        const fire2Id = projectileId + 'fire2';
        await this.particleManager.createEmitter(fire2Id, {
            position: position,
            burstMode: true,
            particleCount: Math.floor(100 * scale),
            minSpeed: 25,
            maxSpeed: 100,
            spread: new THREE.Vector3(5 * scale, 5 * scale, 5 * scale),
            lifeSpan: 0.75,
            blending: 'additive',
            randomizeVelocityOnBurst: true,
            colorKeyframes: [
                { t: 0, value: new THREE.Color(1, 0.9, 0.3) },
                { t: 0.2, value: new THREE.Color(1, 0.5, 0) },
                { t: 0.6, value: new THREE.Color(0.7, 0.3, 0) },
                { t: 1, value: new THREE.Color(0.3, 0.3, 0.3) }
            ],
            scaleKeyframes: [
                { t: 0, value: 50 * scale },
                { t: 0.4, value: 100 * scale },
                { t: 0.7, value: 200 * scale },
                { t: 1, value: 50 * scale }
            ],
            opacityKeyframes: [
                { t: 0, value: 0.5 },
                { t: 0.1, value: 0.9 },
                { t: 0.8, value: 0.6 },
                { t: 1, value: 0.6 }
            ]
        }, './particles/fire_01.png');
        this.scheduleEmitterRemoval(fire2Id, 0.75);

        // Debris effect
        const debrisId = projectileId + 'debris';
        await this.particleManager.createEmitter(debrisId, {
            position: position,
            burstMode: true,
            particleCount: Math.floor(150 * scale),
            minVelocity: new THREE.Vector3(-150, 150, -150),
            maxVelocity: new THREE.Vector3(150, 120, 150),
            gravity: new THREE.Vector3(0, -200, 0),
            spread: new THREE.Vector3(5 * scale, 5 * scale, 5 * scale),
            lifeSpan: 3,
            blending: 'additive',

            drag: 0.05,
            colorKeyframes: [
                { t: 0, value: new THREE.Color(1, 1, 1) },
                { t: 1, value: new THREE.Color(0, 0, 0) }
            ],
            scaleKeyframes: [
                { t: 0, value: 5 * scale },
                { t: 1, value: 5 * scale }
            ],
            opacityKeyframes: [
                { t: 0, value: 0.7 },
                { t: 1, value: 0.3 }
            ]
        }, './particles/dirt_03.png');
        this.scheduleEmitterRemoval(debrisId, 3);
    }
}