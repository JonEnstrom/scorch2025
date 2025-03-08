import { ClientProjectile } from "./Projectile";
import * as THREE from 'three';
import { ParticleSystem } from './ClaudeParticleSystem.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { EmitterPool } from './EmitterPool.js';
import { ProjectileAudioSystem } from './ProjectileAudioSystem.js';

export class ProjectileTimelineManager {
    constructor(game, helicopterManager, terrainRenderer) {
        this.game = game;
        this.events = [];
        this.simulationStartTime = 0;
        this.playbackActive = false;
        this.helicopterManager = helicopterManager;
        this.cameraAdjustedThisTimeline = false;
        this.terrainRenderer = terrainRenderer;
        this.audioSystem = new ProjectileAudioSystem(game);
        
        // Timeline events grouped by projectile ID for easier access
        this.projectileEventMap = new Map();
        
        // Pre-created projectiles mapped by ID
        this.preCreatedProjectiles = new Map();

        this.particleSystem = new ParticleSystem({
            texture: './particles/smoke.png',
            maxParticles: 10000,
            camera: this.game.cameraManager.camera,
        });
        this.particleSystem.addToScene(this.game.scene, this.game.cameraManager.camera);
        
        // Create the emitter pool
        this.emitterPool = new EmitterPool(this.particleSystem);
        
        // A smaller pool of lights (10). We'll place them at the first ten impact points.
        this.lights = [];
        this.MAX_LIGHTS = 0;
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
            'parabomblet',
            'spike_bomb',
            'projectile_1'
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
    
    async queueTimeline(timelineData) {
        // Reset previous timeline state
        this.resetTimelineState();
        
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
        
        // Pre-create all projectiles before starting the timeline
        await this.preCreateAllProjectiles();
        
        // Reset or start the playback clock
        this.simulationStartTime = performance.now();
        this.playbackActive = true;
        
        // Reset camera flag
        this.cameraAdjustedThisTimeline = false;

        // Move lights to the first 10 impacts before the playback starts
        this.placeLightsForImpacts(timelineData);
    }
    
    resetTimelineState() {

        // Stop all active sounds
        this.game.projectiles.forEach(projectile => {
            if (projectile.projectileId) {
                this.audioSystem.stopProjectileSound(projectile.projectileId);
            }
        });
        // Clear previous projectiles and events
        this.projectileEventMap.clear();
        this.preCreatedProjectiles.clear();
        
        // Remove any existing projectiles from the scene
        this.game.projectiles.forEach(projectile => {
            projectile.destroy();
        });
        
        this.game.projectiles = [];
        this.game.projectileMap.clear();
        
        // Clear any remaining explosion spheres
        this.explosionSpheres.forEach(sphereData => {
            this.game.scene.remove(sphereData.mesh);
            sphereData.mesh.geometry.dispose();
            sphereData.mesh.material.dispose();
        });
        this.explosionSpheres = [];
    }
    
    async preCreateAllProjectiles() {
        const creationPromises = [];
        
        // Identify all unique projectile IDs that have spawn events
        const spawnEvents = this.events.filter(evt => evt.type === 'projectileSpawn');
        
        // Pre-create each projectile in advance
        for (const spawnEvent of spawnEvents) {
            const projectileId = spawnEvent.projectileId;
            
            // Get all events for this projectile
            const events = this.projectileEventMap.get(projectileId) || [];
            
            // Collect trajectory events
            const moveEvents = events.filter(evt => evt.type === 'projectileMove');
            const impactEvent = events.find(evt => 
                evt.type === 'projectileImpact' || 
                evt.type === 'projectileHelicopterImpact'
            );
            
            // Create the projectile with full trajectory data
            const creationPromise = this.preCreateProjectile(
                spawnEvent, 
                moveEvents, 
                impactEvent
            );
            
            creationPromises.push(creationPromise);
        }
        
        // Wait for all projectiles to be created
        await Promise.all(creationPromises);
        
        console.log(`Pre-created ${this.preCreatedProjectiles.size} projectiles for timeline`);
    }
    
    async preCreateProjectile(spawnEvent, moveEvents, impactEvent) {
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
            projectileModel = await this.loadModel(modelPath);
            projectileModel.scale.setScalar(projectileData.projectileScale / 10);
        } catch (error) {
            console.warn(`Failed to load model: ${modelPath}. Using default mesh.`, error);
            projectileModel = this.createDefaultMesh(
                spawnEvent.projectileStyle, 
                projectileData.projectileScale
            );
        }
        
        // Create the projectile with the model and emitter pool
        const projectile = new ClientProjectile(
            projectileData, 
            this.game.scene,
            this.game.terrainRenderer,
            this.particleSystem,
            projectileModel,
            this.emitterPool
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
        
        // Hide the projectile initially (will be shown at spawn time)
        projectile.hide();
        
        // Store in our pre-created map
        this.preCreatedProjectiles.set(spawnEvent.projectileId, {
            projectile,
            spawnEvent
        });
        
        return projectile;
    }

    update(deltaTime) {
        if (!this.playbackActive) return;
        
        const currentLocalTime = performance.now() - this.simulationStartTime;
        
        // Update all visible projectiles with the current time
        this.game.projectiles.forEach(projectile => {
            if (!projectile.isDestroyed) {
                projectile.updateTrajectoryPosition(currentLocalTime);
                
                // Update audio based on trajectory progress, speed and position
                if (projectile.trajectory && projectile.trajectory.length > 0) {
                    const firstTime = projectile.trajectory[0].time;
                    const lastTime = projectile.trajectory[projectile.trajectory.length - 1].time;
                    const totalDuration = lastTime - firstTime;
                    
                    if (totalDuration > 0) {
                        const progress = (currentLocalTime - firstTime) / totalDuration;
                        
                        // Pass the projectile and current time for more dynamic audio updates
                        this.audioSystem.updateProjectileSound(
                            projectile.projectileId, 
                            progress,
                            projectile,  // Pass the entire projectile object
                            currentLocalTime  // Pass the current time for trajectory calculations
                        );
                    }
                }
                
                projectile.updateVisual(deltaTime);
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
                break;
        }
    }
    
    handleProjectileSpawn(spawnEvent, currentTime) {
        // Get the pre-created projectile
        const preCreatedData = this.preCreatedProjectiles.get(spawnEvent.projectileId);
        
        if (!preCreatedData) {
            console.warn('No pre-created projectile found for spawn event:', spawnEvent);
            return;
        }
        
        const { projectile } = preCreatedData;
        
        // Show the projectile
        projectile.show();
        
        // Update position to current time
        projectile.updateTrajectoryPosition(currentTime);

        // Create sound for the projectile
        this.audioSystem.createProjectileSound(
            spawnEvent.projectileId,
            projectile,
            spawnEvent
        );
        
        // Add to game's active projectiles
        this.game.projectiles.push(projectile);
        this.game.projectileMap.set(spawnEvent.projectileId, projectile);
        
        // Adjust camera if needed
        if (!this.cameraAdjustedThisTimeline && this.game.cameraManager.spectatorMode === 'auto') {
            if (spawnEvent.weaponCode && spawnEvent.weaponCode.startsWith('RF01')) {
                this.game.cameraManager.setView('projectile');
                this.game.cameraManager.setProjectileTarget(projectile);
            } else {
                this.game.cameraManager.setView('chase');
            }
            this.cameraAdjustedThisTimeline = true;
        }
    }

    handleProjectileImpact(evt) {
        const projectile = this.game.projectileMap.get(evt.projectileId);
        if (!projectile) return;
        
        // Play impact sound
        this.audioSystem.handleProjectileImpact(evt.projectileId, evt);
        // The projectile should already be at the impact position due to trajectory interpolation
        projectile.triggerExplosion(evt);

        // Create a visual sphere at the explosion spot for 300 ms
        const currentLocalTime = performance.now() - this.simulationStartTime;
        const sphere = new THREE.Mesh(
            new THREE.SphereGeometry(1.2, 8, 8),
            new THREE.MeshBasicMaterial({ color: 0xffffdd })
        );
        const sphere2 = new THREE.Mesh(
            new THREE.SphereGeometry(1.2, 8, 8),
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

    // Helper method to handle common projectile destruction logic
    handleProjectileDestruction(projectile, evt) {
        // Trigger explosion effect
        projectile.triggerExplosion(evt);
        
        // Destroy and remove projectile
        projectile.destroy();
        this.game.projectileMap.delete(evt.projectileId);
        this.game.projectiles = this.game.projectiles.filter(p => p !== projectile);
    }
    
    dispose() {
        // Dispose of the emitter pool
        this.emitterPool.dispose();
        
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

        // Dispose of pre-created projectiles
        this.preCreatedProjectiles.forEach(({ projectile }) => {
            projectile.destroy();
        });
        this.preCreatedProjectiles.clear();

        // Clean up other resources
        this.particleSystem.dispose();
        this.audioSystem.dispose();
        this.events = [];
        this.projectileEventMap.clear();
    }
}