import { ClientProjectile } from "./Projectile";
import * as THREE from 'three';

export class ProjectileTimelineManager {
    constructor(game) {
        this.game = game;              // a reference to the main Game
        this.events = [];              // sorted array of all scheduled events
        this.simulationStartTime = 0;  // time offset in ms
        this.playbackActive = false;

        // New flag to ensure camera is only adjusted once per timeline
        this.cameraAdjustedThisTimeline = false;
    }

    /**
     * Receives an array of events from the server (the "timeline").
     */
    queueTimeline(timelineData) {
        // Merge them into our master event list
        this.events.push(...timelineData);

        // Sort by time just in case
        this.events.sort((a, b) => a.time - b.time);

        // Reset or start the playback clock:
        this.simulationStartTime = performance.now();
        this.playbackActive = true;

        // Reset our camera flag every time we get a new timeline
        this.cameraAdjustedThisTimeline = false;
    }

    update(dt) {
        if (!this.playbackActive) return;

        const currentLocalTime = performance.now() - this.simulationStartTime;

        while (this.events.length > 0 && this.events[0].time <= currentLocalTime) {
            const evt = this.events.shift();
            this.handleEvent(evt);
        }

        if (this.events.length === 0) {
            this.playbackActive = false;
        }
    }

    handleEvent(evt) {
        switch (evt.type) {
            case 'projectileSpawn':
                this.handleProjectileSpawn(evt);
                break;
            case 'projectileMove':
                this.handleProjectileMove(evt);
                break;
            case 'projectileImpact':
                this.handleProjectileImpact(evt);
                break;
            case 'helicopterDestroyed':
                // Possibly show explosion or remove helicopter from scene
                break;
            case 'projectileExpired':
                // Maybe remove it from the scene
                break;
            default:
                console.warn('Unhandled timeline event:', evt.type, evt);
                break;
        }
    }

    handleProjectileSpawn(evt) {
        // Create a new ClientProjectile
        const projectileData = {
            projectileId: evt.projectileId,
            playerId: evt.playerId,
            startPos: evt.startPos,
            direction: evt.direction,
            power: evt.power,
            weaponId: evt.weaponId,
            weaponCode: evt.weaponCode,
            projectileStyle: evt.projectileStyle,
            projectileScale: evt.projectileScale,
            explosionType: evt.explosionType,
            explosionSize: evt.explosionSize,
            craterSize: evt.craterSize,
            isFinalProjectile: evt.isFinalProjectile
        };
        
        const projectile = new ClientProjectile(
            projectileData, 
            this.game.scene,
            this.game.gpuParticleManager,
            this.game.terrainRenderer
        );

        // Store it in the Game’s arrays/maps so we can reference it later
        this.game.projectiles.push(projectile);
        this.game.projectileMap.set(evt.projectileId, projectile);

        // ----------------------
        // Camera logic (NEW)
        // ----------------------
        // Only adjust the camera once per timeline. For instance, if weaponCode
        // is "RF01" we set the view to 'projectile'. Otherwise we set 'chase'.
        if (!this.cameraAdjustedThisTimeline) {
            if (evt.weaponCode && evt.weaponCode.startsWith('RF01')) {
                this.game.cameraManager.setView('projectile');
                this.game.cameraManager.setProjectileTarget(projectile);
            } else {
                this.game.cameraManager.setView('chase');
            }
            this.cameraAdjustedThisTimeline = true;
        }
    }

    handleProjectileMove(evt) {
        const projectile = this.game.projectileMap.get(evt.projectileId);
        if (!projectile) return;
        
        if (!projectile.lastPos) {
            projectile.lastPos = new THREE.Vector3(evt.position.x, evt.position.y, evt.position.z);
            projectile.setExactPosition(evt.position);
            return;
        }
        
        // Compute direction from lastPos to newPos
        const lastPos = projectile.lastPos;
        const newPos = new THREE.Vector3(evt.position.x, evt.position.y, evt.position.z);
        const dir = newPos.clone().sub(lastPos).normalize();
        
        // Update orientation
        projectile.setOrientation({ x: dir.x, y: dir.y, z: dir.z });
        
        // Update position
        projectile.setExactPosition(evt.position);
        
        // Store newPos for next time
        projectile.lastPos.copy(newPos);
    }

    handleProjectileImpact(evt) {
        const projectile = this.game.projectileMap.get(evt.projectileId);
        if (!projectile) return;

        // Trigger explosion visuals
        projectile.triggerExplosion(evt);

        // If final or we want to remove projectile:
        projectile.destroy();
        this.game.projectileMap.delete(evt.projectileId);
        this.game.projectiles = this.game.projectiles.filter(p => p !== projectile);
    }
}
