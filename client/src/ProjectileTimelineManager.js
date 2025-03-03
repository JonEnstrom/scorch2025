import { ClientProjectile } from "./Projectile";
import * as THREE from 'three';
import { ParticleSystem } from './ClaudeParticleSystem.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export class ProjectileTimelineManager {
    constructor(game, helicopterManager) {
        this.game = game;
        this.events = [];
        this.simulationStartTime = 0;
        this.playbackActive = false;
        this.helicopterManager = helicopterManager;
        this.cameraAdjustedThisTimeline = false;
        
        // Timeline events grouped by projectile ID for easier access
        this.projectileEventMap = new Map();

        this.particleSystem = new ParticleSystem({
            texture: './particles/fire_01.png',
            maxParticles: 10000,
            camera: this.game.cameraManager.camera,
        });
        this.particleSystem.addToScene(this.game.scene, this.game.cameraManager.camera);
        
        // A smaller pool of lights (10). We'll place them at the first ten impact points.
        this.lights = [];
        this.MAX_LIGHTS = 10;
        this.initLights();

        // We'll create a small ephemeral sphere at each explosion spot for 300ms.
        // We store them here so we can remove them after their time expires.
        this.explosionSpheres = [];

        // Model loading and caching system
        this.modelLoader = new GLTFLoader();
        this.modelCache = new Map();
        this.loadingPromises = new Map();
        
        // Preload common projectile models
        this.preloadProjectileModels();
    }
    
    async preloadProjectileModels() {
        // List of common projectile styles to preload
        const commonProjectileStyles = [
            'missile',
            'balloon',
            'bomblet',
            'spike_bomb'
        ];
        
        // Preload all common models
        await Promise.all(
            commonProjectileStyles.map(style => this.loadModel(`./models/${style}.glb`))
        );
    }
    
    loadModel(modelPath) {
        // Return cached model if available
        if (this.modelCache.has(modelPath)) {
            return this.modelCache.get(modelPath).clone();
        }
        
        // Return existing promise if model is currently loading
        if (this.loadingPromises.has(modelPath)) {
            const model = this.loadingPromises.get(modelPath);
            return model.clone();
        }
        
        // Start new load if model isn't cached or loading
        const loadPromise = this.modelLoader.loadAsync(modelPath)
            .then(gltf => {
                const model = gltf.scene;
                
                // Enhance the model materials
                this.enhanceModelMaterials(model);
                
                this.modelCache.set(modelPath, model);
                this.loadingPromises.delete(modelPath);
                return model.clone();
            })
            .catch(error => {
                console.error('Error loading model:', error);
                this.loadingPromises.delete(modelPath);
                throw error;
            });
        
        this.loadingPromises.set(modelPath, loadPromise);
        return loadPromise;
    }
    
    enhanceModelMaterials(model) {
        model.traverse((child) => {
            if (child.isMesh) {
                // For meshes with no material, provide a default one
                if (!child.material) {
                    child.material = new THREE.MeshStandardMaterial({
                        color: 0xcccccc,
                        metalness: 0.7,
                        roughness: 0.3
                    });
                } 
                // For existing materials, enhance them
                else if (child.material.isMeshStandardMaterial) {
                    if (child.material.metalness === undefined) child.material.metalness = 0.7;
                    if (child.material.roughness === undefined) child.material.roughness = 0.3;
                }
                
                // Make sure materials receive shadows
                if (child.material) {
                    child.material.needsUpdate = true;
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            }
        });
    }
    
    createDefaultMesh(style, scale = 1) {
        // Style configurations for default meshes when models fail to load
        const styleConfigs = {
            missile: { 
                color: 0xaaaaaa, 
                geometry: new THREE.ConeGeometry(2 * scale, 6 * scale, 16) 
            },
            balloon: { 
                color: 0xcc5555, 
                geometry: new THREE.SphereGeometry(2.5 * scale, 16, 16) 
            },
            bomblet: { 
                color: 0x666666, 
                geometry: new THREE.SphereGeometry(1.5 * scale, 8, 8) 
            },
            spike_bomb: { 
                color: 0x333333, 
                geometry: new THREE.DodecahedronGeometry(2 * scale, 0) 
            },
            default: { 
                color: 0xaaaaaa, 
                geometry: new THREE.SphereGeometry(1.5 * scale, 16, 16) 
            }
        };
        
        const config = styleConfigs[style] || styleConfigs.default;
        
        const material = new THREE.MeshStandardMaterial({
            color: config.color,
            metalness: 0.7,
            roughness: 0.3,
            emissive: config.color,
            emissiveIntensity: 0.5
        });
        
        const mesh = new THREE.Mesh(config.geometry, material);
        return mesh;
    }

    initLights() {
        // Create up to 10 point lights, place them off-screen initially, and add them to the scene
        // We'll move them to the first 10 impact points in queueTimeline(...)
        for (let i = 0; i < this.MAX_LIGHTS; i++) {
            // You can tweak color/intensity as desired
            const light = new THREE.PointLight(0xffffff, 1500, 1500);
            light.position.set(10000, 10000, 10000); 
            this.game.scene.add(light);
            this.lights.push(light);
        }
    }
    
    placeLightsForImpacts(timelineData) {
        // Find all impact events, sort by time, place up to 10 lights at those positions
        const impactEvents = timelineData
            .filter(evt => evt.type === 'projectileImpact')
            .sort((a, b) => a.time - b.time);
        
        for (let i = 0; i < this.lights.length; i++) {
            const light = this.lights[i];
            if (i < impactEvents.length) {
                const pos = impactEvents[i].position;
                light.position.set(pos.x, pos.y, pos.z);
            } else {
                // If no more impact events, move the remaining lights off scene
                light.position.set(10000, 10000, 10000);
            }
        }
    }
    

    queueTimeline(timelineData) {
        // Reset the event map for each new timeline
        this.projectileEventMap.clear();
        
        // Group events by projectile ID
        timelineData.forEach(event => {
            if (!this.projectileEventMap.has(event.projectileId)) {
                this.projectileEventMap.set(event.projectileId, []);
            }
            this.projectileEventMap.get(event.projectileId).push(event);
        });
        
        // Sort events by time for each projectile
        this.projectileEventMap.forEach(events => {
            events.sort((a, b) => a.time - b.time);
        });
        
        // Keep the main events array for handling in order
        this.events = [...timelineData];
        this.events.sort((a, b) => a.time - b.time);
        
        // Reset or start the playback clock
        this.simulationStartTime = performance.now();
        this.playbackActive = true;
        
        // Reset camera flag
        this.cameraAdjustedThisTimeline = false;

        // Move lights to the first 10 impacts before the playback starts
        this.placeLightsForImpacts(timelineData);
    }
    
    createProjectileWithTrajectory(spawnEvent, moveEvents, impactEvent, currentTime) {
        // Create projectile data object
        const projectileData = {
            projectileId: spawnEvent.projectileId,
            playerId: spawnEvent.playerId,
            startPos: spawnEvent.startPos,
            direction: spawnEvent.direction,
            power: spawnEvent.power,
            weaponId: spawnEvent.weaponId,
            weaponCode: spawnEvent.weaponCode,
            projectileStyle: spawnEvent.projectileStyle,
            projectileScale: spawnEvent.projectileScale || 1,
            explosionType: spawnEvent.explosionType,
            explosionSize: spawnEvent.explosionSize,
            craterSize: spawnEvent.craterSize,
            isFinalProjectile: spawnEvent.isFinalProjectile
        };
        
        // Load the projectile model
        const modelPath = `./models/${spawnEvent.projectileStyle}.glb`;
        let projectileModel;
        
        try {
            projectileModel = this.loadModel(modelPath);
            projectileModel.scale.setScalar(projectileData.projectileScale);
        } catch (error) {
            console.warn(`Failed to load model: ${modelPath}. Using default mesh.`, error);
            projectileModel = this.createDefaultMesh(
                spawnEvent.projectileStyle, 
                projectileData.projectileScale
            );
        }
        
        // Create the projectile with the model
        const projectile = new ClientProjectile(
            projectileData, 
            this.game.scene,
            this.game.terrainRenderer,
            this.particleSystem,
            projectileModel
        );
        
        // Add trajectory data
        const trajectory = [
            { 
                time: spawnEvent.time, 
                position: new THREE.Vector3(
                    spawnEvent.startPos.x, 
                    spawnEvent.startPos.y, 
                    spawnEvent.startPos.z
                ) 
            },
            ...moveEvents.map(evt => ({
                time: evt.time,
                position: new THREE.Vector3(evt.position.x, evt.position.y, evt.position.z)
            }))
        ];
        
        // If there's an impact event, add it as the final point
        if (impactEvent) {
            trajectory.push({
                time: impactEvent.time,
                position: new THREE.Vector3(
                    impactEvent.position.x, 
                    impactEvent.position.y, 
                    impactEvent.position.z
                ),
                isImpact: true
            });
        }
        
        // Sort by time just to be safe
        trajectory.sort((a, b) => a.time - b.time);
        
        // Set the complete trajectory on the projectile
        projectile.setTrajectory(trajectory);
        
        // Immediately update the projectile to the current time position
        projectile.updateTrajectoryPosition(currentTime);
        
        // Store it in the Game's arrays/maps
        this.game.projectiles.push(projectile);
        this.game.projectileMap.set(spawnEvent.projectileId, projectile);
        
        // Adjust camera if needed
        if (!this.cameraAdjustedThisTimeline) {
            if (spawnEvent.weaponCode && spawnEvent.weaponCode.startsWith('RF01')) {
                this.game.cameraManager.setView('projectile');
                this.game.cameraManager.setProjectileTarget(projectile);
            } else {
                this.game.cameraManager.setView('chase');
            }
            this.cameraAdjustedThisTimeline = true;
        }
    }

    update(dt) {
        if (!this.playbackActive) return;
        
        const currentLocalTime = performance.now() - this.simulationStartTime;
        
        // Update all projectiles with the current time
        this.game.projectiles.forEach(projectile => {
            if (!projectile.isDestroyed) {
                projectile.updateTrajectoryPosition(currentLocalTime);
            }
        });
        
        // Process events that need to be triggered at specific times
        while (this.events.length > 0 && this.events[0].time <= currentLocalTime) {
            const evt = this.events.shift();
            this.handleEvent(evt, currentLocalTime);
        }
        
        // Remove any explosion spheres that have expired
        const remainingSpheres = [];
        for (const sphereData of this.explosionSpheres) {
            if (currentLocalTime >= sphereData.expirationTime) {
                // Remove from scene
                this.game.scene.remove(sphereData.mesh);
                sphereData.mesh.geometry.dispose();
                sphereData.mesh.material.dispose();
            } else {
                remainingSpheres.push(sphereData);
            }
        }
        this.explosionSpheres = remainingSpheres;

        // If no more events and no more projectiles, end playback
// Instead of checking only projectiles, also check if there are no spheres left:
if (
    this.events.length === 0 &&
    this.game.projectiles.length === 0 &&
    this.explosionSpheres.length === 0
  ) {
    this.playbackActive = false;
  }
      }

    handleEvent(evt, currentTime) {
        switch (evt.type) {
            case 'projectileSpawn':
                this.handleProjectileSpawn(evt, currentTime);
                break;
            case 'projectileImpact':
                this.handleProjectileImpact(evt);
                break;
            case 'projectileHelicopterImpact':
                    this.handleProjectileImpact(evt);
                    break;
            case 'helicopterDamage':
                    this.helicopterManager.handleHelicopterDamage(evt.helicopterId, evt.damage);
                    break;
            case 'helicopterDestroyed':
                    this.helicopterManager.handleHelicopterDestroyed(evt.helicopterId, evt.position);
                    break;        }
    }
    
    handleProjectileSpawn(spawnEvent, currentTime) {
        // Check if we already have events for this projectile
        if (!this.projectileEventMap.has(spawnEvent.projectileId)) {
            console.warn('Received spawn event with no preloaded events:', spawnEvent);
            return;
        }
        
        // Get all events for this projectile
        const events = this.projectileEventMap.get(spawnEvent.projectileId);
        
        // Collect all move events for this projectile
        const moveEvents = events.filter(evt => evt.type === 'projectileMove');
        const impactEvent = events.find(evt => evt.type === 'projectileImpact');
        
        // Create the projectile with its full trajectory data
        this.createProjectileWithTrajectory(spawnEvent, moveEvents, impactEvent, currentTime);
        
        // Remove this projectile's events from the map to free memory
        this.projectileEventMap.delete(spawnEvent.projectileId);
    }

    handleProjectileImpact(evt) {
        const projectile = this.game.projectileMap.get(evt.projectileId);
        if (!projectile) return;
        
        // The projectile should already be at the impact position due to trajectory interpolation
        projectile.triggerExplosion(evt);

        // Create a visual sphere at the explosion spot for 300 ms
        const currentLocalTime = performance.now() - this.simulationStartTime;
        const sphere = new THREE.Mesh(
            new THREE.SphereGeometry(12, 8, 8),
            new THREE.MeshBasicMaterial({ color: 0xffffdd })
        );
        const sphere2 = new THREE.Mesh(
            new THREE.SphereGeometry(12, 8, 8),
            new THREE.MeshBasicMaterial({ color: 0xffffff })
        );

        // enable bloom on the spheres
        sphere.layers.enable(1);
        sphere2.layers.enable(1);
        
        if (projectile.mesh) {
            sphere.position.copy(projectile.mesh.position);
        } else {
            sphere.position.copy(projectile.position);
        }
        if (projectile.mesh) {
            sphere2.position.copy(projectile.mesh.position);
        } else {
            sphere2.position.copy(projectile.position);
        }
        
        this.game.scene.add(sphere);
        this.game.scene.add(sphere2);
        this.explosionSpheres.push({
            mesh: sphere,
            expirationTime: currentLocalTime + 200
        });
        this.explosionSpheres.push({
            mesh: sphere2,
            expirationTime: currentLocalTime + 100
        });
        
        projectile.destroy();
        this.game.projectileMap.delete(evt.projectileId);
        this.game.projectiles = this.game.projectiles.filter(p => p !== projectile);
    }

createExplosionEffect(evt, projectile) {
    const currentLocalTime = performance.now() - this.simulationStartTime;
    
    // Determine explosion color based on type
    let explosionColor = 0xffffdd; // Default color
    let flash2Color = 0xffffff;
    
    if (evt.explosionType === 'helicopter') {
        explosionColor = 0xffaa33; // Orange for helicopter impacts
        flash2Color = 0xff7700;
    }
    
    // Create primary explosion sphere
    const sphere = new THREE.Mesh(
        new THREE.SphereGeometry(evt.explosionSize * 1.5, 8, 8),
        new THREE.MeshBasicMaterial({ color: explosionColor, transparent: true, opacity: 0.7 })
    );
    
    // Create secondary flash
    const sphere2 = new THREE.Mesh(
        new THREE.SphereGeometry(evt.explosionSize, 8, 8),
        new THREE.MeshBasicMaterial({ color: flash2Color, transparent: true, opacity: 0.9 })
    );

    // Enable bloom on the spheres
    sphere.layers.enable(1);
    sphere2.layers.enable(1);
    
    // Position the explosion
    if (projectile.mesh) {
        sphere.position.copy(projectile.mesh.position);
        sphere2.position.copy(projectile.mesh.position);
    } else {
        sphere.position.copy(projectile.position);
        sphere2.position.copy(projectile.position);
    }
    
    // Add to scene
    this.game.scene.add(sphere);
    this.game.scene.add(sphere2);
    
    // Track for removal
    this.explosionSpheres.push({
        mesh: sphere,
        expirationTime: currentLocalTime + 300
    });
    this.explosionSpheres.push({
        mesh: sphere2,
        expirationTime: currentLocalTime + 150
    });
}

// Helper method to handle common projectile destruction logic
handleProjectileDestruction(projectile, evt) {
    // Trigger explosion effect
    projectile.triggerExplosion(evt);
    
    // Create visual effect at explosion spot
    this.createExplosionEffect(evt, projectile);
    
    // Destroy and remove projectile
    projectile.destroy();
    this.game.projectileMap.delete(evt.projectileId);
    this.game.projectiles = this.game.projectiles.filter(p => p !== projectile);
}

// Create specialized helicopter impact explosion
createHelicopterImpactExplosion(position, explosionSize, helicopterId) {
    // Create a visual indicator of the impact
    const impactFlash = new THREE.PointLight(0xffaa33, 2000, 1000);
    impactFlash.position.copy(position);
    this.game.scene.add(impactFlash);
    
    // Add to a list to remove after delay
    const currentLocalTime = performance.now() - this.simulationStartTime;
    const removeTime = currentLocalTime + 500; // 500ms flash
    
    // Track this light for removal
    this.explosionSpheres.push({
        mesh: impactFlash,
        expirationTime: removeTime,
        isLight: true
    });
    
    // Create particles for the impact
    this.particleSystem.createExplosion({
        position: position,
        count: Math.floor(explosionSize * 50),
        speed: explosionSize * 0.8,
        scale: explosionSize * 0.2,
        duration: 1500,
        color: 0xffaa33, // Orange-yellow for helicopter impacts
        dispersionRadius: explosionSize * 0.5
    });
    
    // Create debris particles
    this.particleSystem.createExplosion({
        position: position,
        count: Math.floor(explosionSize * 15),
        speed: explosionSize * 0.6,
        scale: explosionSize * 0.1,
        duration: 2000,
        color: 0x333333, // Dark grey for helicopter debris
        dispersionRadius: explosionSize * 0.3,
        gravity: 9.8,
        fadeOut: true
    });
}

    
    dispose() {
        // Dispose and clear the model cache
        this.modelCache.forEach((model) => {
            model.traverse((child) => {
                if (child.isMesh) {
                    if (child.geometry) child.geometry.dispose();
                    if (child.material) {
                        if (Array.isArray(child.material)) {
                            child.material.forEach(mat => mat.dispose());
                        } else {
                            child.material.dispose();
                        }
                    }
                }
            });
        });
        this.modelCache.clear();
        this.loadingPromises.clear();
        
        // Remove all lights from the scene
        this.lights.forEach(light => {
            this.game.scene.remove(light);
        });
        this.lights = [];

        // Clean up explosion spheres if any remain
        this.explosionSpheres.forEach(sphereData => {
            this.game.scene.remove(sphereData.mesh);
            sphereData.mesh.geometry.dispose();
            sphereData.mesh.material.dispose();
        });
        this.explosionSpheres = [];

        // Clean up other resources
        this.particleSystem.dispose();
        this.events = [];
        this.projectileEventMap.clear();
    }
}
