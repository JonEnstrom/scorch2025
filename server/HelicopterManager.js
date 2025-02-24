// server/HelicopterManager.js

import * as THREE from 'three';

class Helicopter {
  constructor(id, position) {
    this.id = id;
    this.position = position.clone();
    this.rotation = { x: 0, y: 0, z: 0, order: 'YXZ' };
    this.forward = new THREE.Vector3(0, 0, 1);
    this.targetPosition = new THREE.Vector3();
    this.currentSpeed = 0;
    this.currentTurnRate = 0;
    this.currentBankAngle = 0;
    this.health = 100;
    this.boundingRadius = 100;

    // Movement parameters
    this.maxSpeed = 100;
    this.acceleration = 10;
    this.deceleration = 15;
    this.maxTurnRate = Math.PI * 0.5;
    this.turnAcceleration = Math.PI * 0.2;
    this.maxBankAngle = Math.PI * 0.25;
    this.bankingSmoothness = 0.05;
    this.arrivalThreshold = 5;

    // Terrain / altitude
    this.minHeightAboveTerrain = 75;
    this.heightLerpSpeed = 0.5;

    // Waypoint logic
    this.lastWaypointUpdate = 0;
    this.waypointInterval = 10000;
    this.targetPosition.copy(position);

    this.projectileManager = null;

    // This will store the precomputed states for a planned path.
    // Each point is of the form:
    // { time: <seconds>, position: Vector3, rotationY, bankAngle, speed }
    this.plannedPath = [];
  }

  getBoundingSphere() {
    return {
      center: this.position.clone(),
      radius: this.boundingRadius,
    };
  }

  getState() {
    return {
      id: this.id,
      position: this.position.clone(),
      rotation: { ...this.rotation },
      health: this.health,
      targetPosition: this.targetPosition.clone(),
      timestamp: Date.now()
    };
  }

  takeDamage(amount) {
    this.health -= amount;
    return this.health <= 0;
  }

  /**
   * Precompute the helicopter's flight path into an array `this.plannedPath`.
   * @param {number} totalTime - Total plan duration in seconds (e.g. 20)
   * @param {number} step - Time step in seconds (e.g. 0.2)
   * @param {object} terrainManager - (Optional) for terrain adjustments
   */
  planPath(totalTime, step, terrainManager) {
    this.plannedPath = [];

    // Create a simulated state based on the current state.
    let simulatedState = {
      time: 0,
      position: this.position.clone(),
      rotationY: this.rotation.y,
      bankAngle: this.currentBankAngle,
      turnRate: this.currentTurnRate,
      speed: this.currentSpeed,
      lastWaypointUpdate: 0,
      targetPosition: this.targetPosition.clone()
    };

    // Helper: Simulate one time step.
    const simulateStep = (dt, state) => {
      // 1) Update waypoint if needed.
      state.lastWaypointUpdate += dt * 1000;
      if (state.lastWaypointUpdate > this.waypointInterval) {
        state.targetPosition.copy(this._generateRandomWaypoint());
        state.lastWaypointUpdate = 0;
      }

      // 2) Calculate direction toward the target.
      const toTarget = new THREE.Vector3().subVectors(state.targetPosition, state.position).normalize();

      // 3) Compute current forward vector and desired turn rate.
      const currentForward = new THREE.Vector3(0, 0, 1);
      currentForward.applyEuler(new THREE.Euler(0, state.rotationY, 0, 'YXZ'));
      const angle = currentForward.angleTo(toTarget);
      const cross = new THREE.Vector3().crossVectors(currentForward, toTarget);
      const turnDirection = Math.sign(cross.y);
      let desiredTurnRate = Math.min(this.maxTurnRate, angle) * turnDirection;

      // Accelerate or decelerate the turn rate.
      if (Math.abs(desiredTurnRate) > 0.01) {
        const turnSign = Math.sign(desiredTurnRate - state.turnRate);
        state.turnRate += turnSign * this.turnAcceleration * dt;
      } else {
        state.turnRate *= 0.95;
      }
      state.turnRate = THREE.MathUtils.clamp(state.turnRate, -this.maxTurnRate, this.maxTurnRate);

      // 4) Update banking.
      const targetBankAngle = (state.turnRate / this.maxTurnRate) * this.maxBankAngle;
      state.bankAngle += (targetBankAngle - state.bankAngle) * this.bankingSmoothness;

      // 5) Update heading.
      state.rotationY += state.turnRate * dt;

      // 6) Adjust speed based on distance to target.
      const distanceToTarget = state.position.distanceTo(state.targetPosition);
      let shouldDecelerate = distanceToTarget < (state.speed * state.speed) / (2 * this.deceleration);
      if (distanceToTarget < this.arrivalThreshold) {
        state.speed = 0;
      } else if (shouldDecelerate) {
        state.speed = Math.max(0, state.speed - this.deceleration * dt);
      } else {
        state.speed = Math.min(this.maxSpeed, state.speed + this.acceleration * dt);
      }

      // 7) Terrain checks and altitude adjustments.
      let speedReductionFactor = 1.0;
      if (terrainManager && terrainManager.terrainData) {
        const forwardDistance = 50;
        const backwardDistance = 50;
        const forwardDir = new THREE.Vector3(0, 0, 1).applyEuler(new THREE.Euler(0, state.rotationY, 0, 'YXZ')).normalize();
        const forwardCheckPosition = state.position.clone().addScaledVector(forwardDir, forwardDistance);
        const backwardCheckPosition = state.position.clone().addScaledVector(forwardDir, -backwardDistance);
        const forwardTerrainHeight = terrainManager.getHeightAtPosition(forwardCheckPosition.x, forwardCheckPosition.z) + this.minHeightAboveTerrain;
        const backwardTerrainHeight = terrainManager.getHeightAtPosition(backwardCheckPosition.x, backwardCheckPosition.z) + this.minHeightAboveTerrain;
        const currentTerrainHeight = terrainManager.getHeightAtPosition(state.position.x, state.position.z) + this.minHeightAboveTerrain;
        const neededHeight = Math.max(forwardTerrainHeight, currentTerrainHeight, backwardTerrainHeight);
        if (neededHeight > state.position.y + 45) {
          speedReductionFactor = 0.6;
        }
        const newY = THREE.MathUtils.lerp(state.position.y, neededHeight, this.heightLerpSpeed * dt);
        state.position.y = Math.max(50, newY);
      }
      state.speed *= speedReductionFactor;

      // 8) Move forward.
      if (state.speed > 0) {
        const movement = new THREE.Vector3(0, 0, state.speed * dt);
        movement.applyEuler(new THREE.Euler(0, state.rotationY, 0, 'YXZ'));
        state.position.add(movement);
      }

      return state;
    };

    // Main simulation loop.
    let currentTime = 0;
    while (currentTime <= totalTime) {
      this.plannedPath.push({
        time: currentTime, // Relative time in seconds (0 … totalTime)
        position: simulatedState.position.clone(),
        rotationY: simulatedState.rotationY,
        bankAngle: simulatedState.bankAngle,
        speed: simulatedState.speed
      });
      simulatedState = simulateStep(step, simulatedState);
      simulatedState.time += step;
      currentTime += step;
    }

    // Optionally update the helicopter's actual state.
    this.position.copy(simulatedState.position);
    this.rotation.y = simulatedState.rotationY;
    this.currentSpeed = simulatedState.speed;
    this.currentTurnRate = simulatedState.turnRate;
    this.currentBankAngle = simulatedState.bankAngle;
  }

  getFutureState(t) {
    if (!this.plannedPath || this.plannedPath.length === 0) {
      return this.getState();
    }
    if (t <= 0) return this._stateFromPathPoint(this.plannedPath[0]);
    if (t >= this.plannedPath[this.plannedPath.length - 1].time)
      return this._stateFromPathPoint(this.plannedPath[this.plannedPath.length - 1]);
    for (let i = 0; i < this.plannedPath.length - 1; i++) {
      const current = this.plannedPath[i];
      const next = this.plannedPath[i + 1];
      if (t >= current.time && t <= next.time) {
        const alpha = (t - current.time) / (next.time - current.time);
        return this._interpolateState(current, next, alpha);
      }
    }
    return this._stateFromPathPoint(this.plannedPath[this.plannedPath.length - 1]);
  }

  _stateFromPathPoint(pt) {
    return {
      id: this.id,
      position: pt.position.clone(),
      rotation: { x: 0, y: pt.rotationY, z: -pt.bankAngle, order: 'YXZ' },
      speed: pt.speed,
      time: pt.time,
      health: this.health
    };
  }

  _interpolateState(a, b, alpha) {
    const pos = a.position.clone().lerp(b.position, alpha);
    const rotY = THREE.MathUtils.lerp(a.rotationY, b.rotationY, alpha);
    const bank = THREE.MathUtils.lerp(a.bankAngle, b.bankAngle, alpha);
    const spd = THREE.MathUtils.lerp(a.speed, b.speed, alpha);
    return {
      id: this.id,
      position: pos,
      rotation: { x: 0, y: rotY, z: -bank, order: 'YXZ' },
      speed: spd,
      time: THREE.MathUtils.lerp(a.time, b.time, alpha),
      health: this.health
    };
  }

  _generateRandomWaypoint() {
    const x = (Math.random() * 1500) - 750;
    const y = Math.random() * 200 + 200;
    const z = (Math.random() * 1500) - 750;
    return new THREE.Vector3(x, y, z);
  }
}

export default class HelicopterManager {
  constructor(io, gameId, terrainManager) {
    this.io = io;
    this.gameId = gameId;
    this.terrainManager = terrainManager;
    this.helicopters = new Map();
    this.maxHelicopters = 3;
    this.spawnInterval = 30000;
    this.lastSpawnTime = 0;
    this.currentPlanIndex = 0;

    this.spawnCheckInterval = setInterval(this.checkSpawn.bind(this), 1000);
    this.pathUpdateInterval = 20000;
    this.pathUpdateIntervalId = setInterval(this.updateAllHelicopterPaths.bind(this), this.pathUpdateInterval);

  }

  checkSpawn() {
    const currentTime = Date.now();
    if (currentTime - this.lastSpawnTime > this.spawnInterval) {
      this.spawnHelicopter();
      this.lastSpawnTime = currentTime;
    }
  }

  updateAllHelicopterPaths() {
    const currentServerTime = Date.now();
    // Increment the update index once per update cycle.
    this.currentPlanIndex = (this.currentPlanIndex || 0) + 1;
    
    for (const [id, helicopter] of this.helicopters.entries()) {
      helicopter.planPath(20, 0.2, this.terrainManager);
      this.io.to(this.gameId).emit('helicopterPathUpdate', {
        id: helicopter.id,
        plannedPath: helicopter.plannedPath,
        planStartTime: currentServerTime, // Absolute server timestamp (ms)
        updateIndex: this.currentPlanIndex   // The new update index
      });
    }

    if (this.projectileManager) {
      this.projectileManager.updatePathTime(currentServerTime);
    }
  }
  
  spawnHelicopter() {
    if (this.helicopters.size >= this.maxHelicopters) return;
    const position = this.generateRandomWaypoint();
    const id = `heli_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const helicopter = new Helicopter(id, position);
    helicopter.targetPosition.copy(this.generateRandomWaypoint());
    helicopter.planPath(20, 0.2, this.terrainManager);
    this.helicopters.set(id, helicopter);
    this.io.to(this.gameId).emit('spawnHelicopter', {
      id: helicopter.id,
      state: helicopter.getState(),
      plannedPath: helicopter.plannedPath,
      planStartTime: Date.now()
    });
  }

  generateRandomWaypoint() {
    const x = (Math.random() * 1500) - 750;
    const y = Math.random() * 200 + 200;
    const z = (Math.random() * 1500) - 750;
    return new THREE.Vector3(x, y, z);
  }

  getHelicopterStateAtTime(id, t) {
    const helicopter = this.helicopters.get(id);
    if (!helicopter) return null;
    return helicopter.getFutureState(t);
  }

  replanAllHelicopters() {
    for (const heli of this.helicopters.values()) {
      heli.planPath(20, 0.2, this.terrainManager);
    }
  }

  handleProjectileImpact(position, damage, aoeSize) {
    for (const [id, helicopter] of this.helicopters.entries()) {
      const dx = helicopter.position.x - position.x;
      const dy = helicopter.position.y - position.y;
      const dz = helicopter.position.z - position.z;
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (distance < aoeSize) {
        const falloffPercent = (distance / aoeSize) * 0.5;
        const damageMultiplier = 1 - falloffPercent;
        const actualDamage = Math.round(damage * damageMultiplier);
        const destroyed = helicopter.takeDamage(actualDamage);
        this.io.to(this.gameId).emit('helicopterDamaged', {
          id: helicopter.id,
          damage: actualDamage,
          health: helicopter.health
        });
        if (destroyed) {
          this.helicopters.delete(id);
          this.io.to(this.gameId).emit('helicopterDestroyed', { id: helicopter.id });
        }
      }
    }
  }

  destroy() {
    // Clear the intervals
    clearInterval(this.spawnCheckInterval);
    clearInterval(this.pathUpdateIntervalId);
    
    // Destroy all helicopters
    for (const helicopter of this.helicopters.values()) {
      this.io.to(this.gameId).emit('helicopterDestroyed', { id: helicopter.id });
    }
    this.helicopters.clear();
    this.io = null;
    this.terrainManager = null;
  }
}