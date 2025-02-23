// client/HelicopterManager.js

import { Helicopter } from './Helicopter.js';
import { GPUExplosionEffect } from './GpuExplosion.js';


export class HelicopterManager {
  constructor(scene, loader, terrainRenderer, gpuParticleManager, dmgManager, gameInstance) {
    this.scene = scene;
    this.loader = loader;
    this.terrainRenderer = terrainRenderer;
    this.gpuParticleManager = gpuParticleManager;
    this.dmgManager = dmgManager;
    this.helicopters = new Map();
    this.gameInstance = gameInstance;
  }

  spawnHelicopter(data) {
    const { id, state, plannedPath, planStartTime } = data;
    if (this.helicopters.has(id)) return;
    const heli = new Helicopter(this.scene, this.loader, this.terrainRenderer);
    if (plannedPath && plannedPath.length > 0) {
      heli.setPlannedPath(plannedPath, planStartTime);
    }
    if (state && state.position) {
      heli.group.position.set(state.position.x, state.position.y, state.position.z);
    }
    this.helicopters.set(id, heli);
    return heli;
  }

  updateHelicopterPlan(data) {
    const { id, plannedPath, planStartTime } = data;
    const helicopter = this.helicopters.get(id);
    if (!helicopter) return;
    if (plannedPath && plannedPath.length > 0) {
      helicopter.setPlannedPath(plannedPath, planStartTime);
    }
  }

  convertServerTimeToPerformanceTime(serverTime) {
    const currentPerformanceTime = performance.now();
    const currentServerTime = Date.now();
    const deltaFromNow = serverTime - currentServerTime;
    return currentPerformanceTime + deltaFromNow;
  }

  updateHelicopterPath(data) {
    const { id, plannedPath, planStartTime } = data;
    const helicopter = this.helicopters.get(id);
    if (!helicopter) return;
    helicopter.setPlannedPath(plannedPath, planStartTime);
  }

  handleHelicopterDamage(id, damage) {
    const helicopter = this.helicopters.get(id);
    if (helicopter) {
      const pos = helicopter.getPosition();
      const explosionEffect = new GPUExplosionEffect(this.gpuParticleManager);
      explosionEffect.createBasicExplosion({
          projectileId: Math.floor(Math.random() * 9000) + 1000,
          position: pos,
          explosionSize: 2,
          explosionType: 'normal'
      });
      this.gameInstance.dmgManager.createDamageNumber(damage, pos, {
        initialVelocity: 150,
        drag: 0.98,
        lifetime: 5.0
    });

  }
  }

  removeHelicopter(id) {
    console.log("ID: " + id);
    const helicopter = this.helicopters.get(id);
    if (helicopter) {
      helicopter.dispose();
      this.helicopters.delete(id);
    }
  }

  update(deltaTime) {
    const now = performance.now();
    for (const heli of this.helicopters.values()) {
      heli.update(deltaTime, now);
    }
  }

  destroy() {
    for (const heli of this.helicopters.values()) {
      heli.dispose();
    }
    this.helicopters.clear();
  }
}
