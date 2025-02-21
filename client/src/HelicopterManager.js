import { Helicopter } from './Helicopter.js';
import { GPUExplosionEffect } from './GpuExplosion.js';
import * as THREE from 'three';

export class HelicopterManager {
    constructor(scene, loader, terrainRenderer, gpuParticleManager, dmgManager) {
        this.scene = scene;
        this.loader = loader;
        this.dmgManager = dmgManager;
        this.gpuParticleManager = gpuParticleManager;
        this.terrainRenderer = terrainRenderer;
        this.helicopters = new Map();
        this.fallbackInterpolationDuration = 0.2;
        this.explosionIdCounter = 0; // to give unique id to explosions....
    }

    spawnHelicopter(data) {
        const { id, state } = data;

        // Don't spawn if already exists
        if (this.helicopters.has(id)) {
            return;
        }

        const helicopter = new Helicopter(
            this.scene,
            this.loader,
            this.terrainRenderer
        );

        // Initialize actual THREE object’s position and rotation
        helicopter.group.position.set(
            state.position.x,
            state.position.y,
            state.position.z
        );
        helicopter.group.rotation.order = state.rotation.order || 'YXZ';
        helicopter.group.rotation.set(
            state.rotation.x,
            state.rotation.y,
            state.rotation.z
        );

        // Disable autonomous movement on client
        helicopter.autonomous = false;

        // Initialize interpolation data
        const initialTime = state.timestamp || performance.now();
        helicopter.interp = {
            // Current state (start of interpolation)
            current: {
                position: helicopter.group.position.clone(),
                rotation: helicopter.group.rotation.clone(),
                timestamp: initialTime
            },
            // Target state (where we want to be in the future)
            target: {
                position: helicopter.group.position.clone(),
                rotation: helicopter.group.rotation.clone(),
                timestamp: initialTime
            },
            interpolationTime: 0,         // how long we've been interpolating
            interpolationDuration: 0.5    // default 0.5s, or any fallback
        };

        // If there's a target position (for AI or something else)
        if (state.targetPosition) {
            helicopter.targetPosition.set(
                state.targetPosition.x,
                state.targetPosition.y,
                state.targetPosition.z
            );
        }

        // Store helicopter
        this.helicopters.set(id, helicopter);
        return helicopter;
    }

    /**
     * Called whenever the server emits 'helicopterStates',
     * passing in an array of helicopter states.
     * Each state should include a `timestamp` property from the server.
     */
    updateHelicopters(states) {
        for (const state of states) {
            const helicopter = this.helicopters.get(state.id);
            if (!helicopter) continue;

            // 1. Move the old target into 'current'
            helicopter.interp.current.position.copy(helicopter.interp.target.position);
            helicopter.interp.current.rotation.copy(helicopter.interp.target.rotation);
            helicopter.interp.current.timestamp = helicopter.interp.target.timestamp;

            // 2. Set the new server state as 'target'
            helicopter.interp.target.position.set(
                state.position.x,
                state.position.y,
                state.position.z
            );
            helicopter.interp.target.rotation.order = state.rotation.order || 'YXZ';
            helicopter.interp.target.rotation.set(
                state.rotation.x,
                state.rotation.y,
                state.rotation.z
            );
            helicopter.interp.target.timestamp = state.timestamp || performance.now();

            // 3. Compute the interpolationDuration based on
            //    the difference in server timestamps (in seconds).
            const oldTs = helicopter.interp.current.timestamp;
            const newTs = helicopter.interp.target.timestamp;
            let durationMs = newTs - oldTs;

            // If there's no valid difference, or negative, fallback.
            if (durationMs < 1) {
                durationMs = this.fallbackInterpolationDuration * 1000;
            }

            helicopter.interp.interpolationDuration = durationMs / 1000;

            // 4. Reset the interpolation timer
            helicopter.interp.interpolationTime = 0;

            // Also update targetPosition if the server has one
            if (state.targetPosition) {
                helicopter.targetPosition.set(
                    state.targetPosition.x,
                    state.targetPosition.y,
                    state.targetPosition.z
                );
            }
        }
    }

    updateHelicopterWaypoint(data) {
        const { id, targetPosition } = data;
        const helicopter = this.helicopters.get(id);
        if (helicopter) {
            helicopter.targetPosition.set(
                targetPosition.x,
                targetPosition.y,
                targetPosition.z
            );
        }
    }

    handleHelicopterDamage(data) {
        const { id, damage, health } = data;
        const helicopter = this.helicopters.get(id);
        if (helicopter) {
            // You could add visual or audio effects here
            const pos = helicopter.getPosition();
            const explosionEffect = new GPUExplosionEffect(this.gpuParticleManager);
            this.explosionIdCounter++;
            explosionEffect.createBasicExplosion({
                position: pos,
                projectileId: id + this.explosionIdCounter, 
                explosionSize: this.explosionSize || 1,
                explosionType: this.explosionType || 'normal'
            });
            this.dmgManager.createDamageNumber(damage, pos, {
                initialVelocity: 80,
                drag: 0.98,
                lifetime: 5.0
            });
    

        }
    }

    removeHelicopter(id) {
        const helicopter = this.helicopters.get(id);
        if (helicopter) {
            helicopter.dispose();
            this.helicopters.delete(id);
        }
    }

    /**
     * Called every render frame or fixed tick (whichever your client uses).
     * deltaTime is in seconds.
     */
    update(deltaTime) {
        for (const helicopter of this.helicopters.values()) {
            const interpData = helicopter.interp;

            // Increase our local interpolation timer
            interpData.interpolationTime += deltaTime;

            // Calculate alpha: how far along we are
            // from old state to new state.
            const alpha = Math.min(
                interpData.interpolationTime / interpData.interpolationDuration,
                1.0
            );

            // Interpolate position
            helicopter.group.position.lerpVectors(
                interpData.current.position,
                interpData.target.position,
                alpha
            );

            // Interpolate rotation (component-wise)
            helicopter.group.rotation.x = THREE.MathUtils.lerp(
                interpData.current.rotation.x,
                interpData.target.rotation.x,
                alpha
            );
            helicopter.group.rotation.y = THREE.MathUtils.lerp(
                interpData.current.rotation.y,
                interpData.target.rotation.y,
                alpha
            );
            helicopter.group.rotation.z = THREE.MathUtils.lerp(
                interpData.current.rotation.z,
                interpData.target.rotation.z,
                alpha
            );
            helicopter.group.rotation.order = interpData.target.rotation.order;

            // Let the helicopter handle rotor animations, etc.
            helicopter.update(deltaTime);
        }
    }

    destroy() {
        for (const helicopter of this.helicopters.values()) {
            helicopter.dispose();
        }
        this.helicopters.clear();
    }
}
