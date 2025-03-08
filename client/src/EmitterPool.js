// EmitterPool.js
import * as THREE from 'three';

export class EmitterPool {
    constructor(particleSystem) {
        this.particleSystem = particleSystem;
        this.pools = {
            explosion: { available: [], inUse: new Map() },
            explosionFlash: { available: [], inUse: new Map() },
            smoke: { available: [], inUse: new Map() },
            trail: { available: [], inUse: new Map() },
            smallTrail: { available: [], inUse: new Map() },
            burnTrail: { available: [], inUse: new Map() },
        };
        
        // Initialize the pools with configured emitters
        this.initializePools();
    }
    
    initializePools() {
        // Initialize pool for explosion emitters
        this.initializePool('explosion', 100, {
            type: 'burst',
            particleCount: 16,
            particleSize: { min: 5, max: 8 },
            particleSizeEnd: { min: 2, max: 3 },
            lifeTime: { min: 1.0, max: 1.75 },
            color: new THREE.Color(0xff8800),
            colorEnd: new THREE.Color(0x666600),
            velocity: { 
                min: new THREE.Vector3(-7, 10, -7), 
                max: new THREE.Vector3(7, 0, 7) 
            },
            blending: THREE.NormalBlending,
            opacity: { min: 0.3, max: 0.3 },
            opacityEnd: { min: 0.0, max: 0.0 },
            rotationSpeed: { min: 0.0, max: 0.0 }
        });
        
        // Initialize pool for explosion flash emitters
        this.initializePool('explosionFlash', 100, {
            type: 'burst',
            particleCount: 50,
            particleSize: { min: 2, max: 4 },
            particleSizeEnd: { min: 0.2, max: 0.4 },
            lifeTime: { min: 0.2, max: 0.2 },
            color: new THREE.Color(0xff0000),
            colorEnd: new THREE.Color(0xffff00),
            blending: THREE.NormalBlending,
            opacity: { min: 0.3, max: 0.3 },
            opacityEnd: { min: 0.0, max: 0.0 },
            rotationSpeed: { min: 0.0, max: 0.0 }
        });
        
        // Initialize pool for smoke emitters
        this.initializePool('smoke', 100, {
            type: 'burst',
            particleCount: 1,
            particleSize: { min: 3, max: 5 },
            particleSizeEnd: { min: 20, max: 100 },
            lifeTime: { min: 10.0, max: 25.0 },
            color: new THREE.Color(0x333333),
            colorEnd: new THREE.Color(0x888888),
            velocity: { 
                min: new THREE.Vector3(0, 1, 0), 
                max: new THREE.Vector3(1, 5, 1) 
            },
            blending: THREE.NormalBlending,
            opacity: { min: 0.4, max: 0.4 },
            opacityEnd: { min: 0.0, max: 0.0 },
            rotationSpeed: { min: 0.0, max: 0.0 }
        });
        
        // Initialize pool for trail emitters
        this.initializePool('trail', 100, {
            type: 'continuous',
            emissionRate: 150, // Particles per second
            duration: -1,
            particleSize: { min: 0.2, max: 0.4 },
            particleSizeEnd: { min: 0.2, max: 0.4 },
            lifeTime: { min: 5, max: 8 },
            color: new THREE.Color(0xbbbbbb),
            colorEnd: new THREE.Color(0xffffff),
            blending: THREE.NormalBlending,
            rotationSpeed: { min: 0.0, max: 0.0 },
            velocity: { 
                min: new THREE.Vector3(-0.0, -0.0, -0.0), 
                max: new THREE.Vector3(0.0 , 0.0, 0.0) 
            },
            opacity: { min: 0.6, max: 0.8},
            opacityEnd: { min: 0.0, max: 0.0 },
            useDirectionalScaling: true,
            directionalScaling: 4.0
        });        
        
        this.initializePool('smallTrail', 100, {
            type: 'continuous',
            emissionRate: 150, // Particles per second
            duration: -1,
            particleSize: { min: 0.1, max: 0.2 },
            particleSizeEnd: { min: 0.1, max: 0.2 },
            lifeTime: { min: 1, max: 3 },
            color: new THREE.Color(0xbbbbbb),
            colorEnd: new THREE.Color(0xffffff),
            blending: THREE.NormalBlending,
            rotationSpeed: { min: 0.0, max: 0.0 },
            velocity: { 
                min: new THREE.Vector3(-0.0, -0.0, -0.0), 
                max: new THREE.Vector3(0.0 , 0.0, 0.0) 
            },
            opacity: { min: 0.6, max: 0.8},
            opacityEnd: { min: 0.0, max: 0.0 },
            useDirectionalScaling: true,
            directionalScaling: 2.0
        });



        
        // Initialize pool for burn trail emitters
        this.initializePool('burnTrail', 100, {
            type: 'continuous',
            texture: './particles/dirt_01.png',
            emissionRate: 40, // Particles per second
            duration: -1,
            particleSize: { min: 0.4, max: 0.4 },
            particleSizeEnd: { min: 0.3, max: 0.3 },
            lifeTime: { min: 0.3, max: 0.6 },
            color: new THREE.Color(0xb55c14),
            colorEnd: new THREE.Color(0xffff00),
            blending: THREE.AdditiveBlending,
            rotationSpeed: { min: 0.0, max: 0.0 },
            velocity: { 
                min: new THREE.Vector3(-0.0, -0.0, -0.0), 
                max: new THREE.Vector3(0.0, 0.0, 0.0) 
            },
            opacity: { min: 1.0, max: 1.0},
            opacityEnd: { min: 1.0, max: 1.0 },
            useDirectionalScaling: true,
            directionalScaling: 5.0
        });
    }
    
    initializePool(emitterType, count, emitterConfig) {
        const pool = this.pools[emitterType];
        
        // Create emitters and add to available pool
        for (let i = 0; i < count; i++) {
            let emitter;
            if (emitterConfig.type === 'burst') {
                emitter = this.particleSystem.createBurstEmitter(emitterConfig);
            } else if (emitterConfig.type === 'continuous') {
                emitter = this.particleSystem.createContinuousEmitter(emitterConfig);
            }
            pool.available.push(emitter);
        }
    }
    
    borrowEmitter(emitterType, borrowerId) {
        const pool = this.pools[emitterType];
        
        if (!pool) {
            console.error(`No emitter pool of type ${emitterType} exists`);
            return null;
        }
        
        if (pool.available.length === 0) {
            console.warn(`Emitter pool of type ${emitterType} is exhausted, creating new emitter`);
            // Expand the pool with a new emitter - we could optimize this further
            // by creating a proper expansion mechanism
            return null;
        }
        
        const emitter = pool.available.pop();
        pool.inUse.set(borrowerId, emitter);
        
        return emitter;
    }
    
    returnEmitter(emitterType, borrowerId) {
        const pool = this.pools[emitterType];
        
        if (!pool) {
            console.error(`No emitter pool of type ${emitterType} exists`);
            return;
        }
        
        if (pool.inUse.has(borrowerId)) {
            const emitter = pool.inUse.get(borrowerId);
            pool.inUse.delete(borrowerId);
            pool.available.push(emitter);
        }
    }
    
    // Return all emitters borrowed by a specific borrower
    returnAllEmitters(borrowerId) {
        Object.keys(this.pools).forEach(emitterType => {
            const pool = this.pools[emitterType];
            if (pool.inUse.has(borrowerId)) {
                const emitter = pool.inUse.get(borrowerId);
                pool.inUse.delete(borrowerId);
                pool.available.push(emitter);
            }
        });
    }
    
    // Deactivate continuous emitter and then return it to the pool
    deactivateAndReturnEmitter(emitterType, borrowerId) {
        const pool = this.pools[emitterType];
        
        if (!pool) {
            console.error(`No emitter pool of type ${emitterType} exists`);
            return;
        }
        
        if (pool.inUse.has(borrowerId)) {
            const emitter = pool.inUse.get(borrowerId);
            emitter.deactivate();
            pool.inUse.delete(borrowerId);
            pool.available.push(emitter);
        }
    }
    
    // Dispose of all emitters in all pools
    dispose() {
        Object.keys(this.pools).forEach(type => {
            const pool = this.pools[type];
            
            // Deactivate all emitters
            [...pool.available, ...Array.from(pool.inUse.values())].forEach(emitter => {
                if (emitter.deactivate) {
                    emitter.deactivate();
                }
            });
            
            pool.available = [];
            pool.inUse.clear();
        });
    }
}