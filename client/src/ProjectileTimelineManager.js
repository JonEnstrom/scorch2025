import { ClientProjectile } from "./Projectile";
import * as THREE from 'three';

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
            projectileScale: spawnEvent.projectileScale,
            explosionType: spawnEvent.explosionType,
            explosionSize: spawnEvent.explosionSize,
            craterSize: spawnEvent.craterSize,
            isFinalProjectile: spawnEvent.isFinalProjectile
        };
        
        // Create the projectile
        const projectile = new ClientProjectile(
            projectileData, 
            this.game.scene,
            this.game.gpuParticleManager,
            this.game.terrainRenderer
        );
        
        // Add trajectory data
        const trajectory = [
            { time: spawnEvent.time, position: new THREE.Vector3(spawnEvent.startPos.x, spawnEvent.startPos.y, spawnEvent.startPos.z) },
            ...moveEvents.map(evt => ({
                time: evt.time,
                position: new THREE.Vector3(evt.position.x, evt.position.y, evt.position.z)
            }))
        ];
        
        // If there's an impact event, add it as the final point
        if (impactEvent) {
            trajectory.push({
                time: impactEvent.time,
                position: new THREE.Vector3(impactEvent.position.x, impactEvent.position.y, impactEvent.position.z),
                isImpact: true
            });
        }
        
        // Sort by time just to be safe
        trajectory.sort((a, b) => a.time - b.time);
        
        // Set the complete trajectory on the projectile
        projectile.setTrajectory(trajectory);
        
        // Immediately update the projectile to the current time position
        // This handles the case where a projectile spawns "in the past" relative to current time
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
        
        if (this.events.length === 0) {
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
            case 'helicopterDamage':
                this.helicopterManager.handleHelicopterDamage(evt.helicopterId, evt.damage);
                break;
            case 'helicopterDestroyed':
                // Handle helicopter destruction
                break;
            // We still need to handle move events to build the trajectory,
            // but this happens in handleProjectileSpawn now
        }
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
        
        projectile.destroy();
        this.game.projectileMap.delete(evt.projectileId);
        this.game.projectiles = this.game.projectiles.filter(p => p !== projectile);
    }
}