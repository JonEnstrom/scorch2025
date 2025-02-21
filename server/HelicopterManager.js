// server/HelicopterManager.js

import * as THREE from 'three';

class Helicopter {
  constructor(id, position) {
    this.id = id;
    this.position = position;
    this.rotation = { x: 0, y: 0, z: 0, order: 'YXZ' };
    this.forward = new THREE.Vector3(0, 0, 1);
    this.targetPosition = new THREE.Vector3();
    this.currentSpeed = 0;
    this.currentTurnRate = 0;
    this.currentBankAngle = 0;
    this.health = 100;
    this.boundingRadius = 100;

    this.maxSpeed = 100;
    this.acceleration = 10;
    this.deceleration = 15;
    this.maxTurnRate = Math.PI * 0.5;
    this.turnAcceleration = Math.PI * 0.2;
    this.maxBankAngle = Math.PI * 0.25;
    this.bankingSmoothness = 0.05;
    this.arrivalThreshold = 5;

    this.minHeightAboveTerrain = 75;
    this.heightLerpSpeed = 0.5;

    this.lastWaypointUpdate = Date.now();
    this.targetHeight = 200;
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
      position: this.position,
      rotation: this.rotation,
      health: this.health,
      targetPosition: this.targetPosition,
      timestamp: Date.now()
    };
  }

  takeDamage(amount) {
    this.health -= amount;
    return this.health <= 0;
  }
}

export default class HelicopterManager {
  constructor(io, gameId, terrainManager) {
    this.io = io;
    this.gameId = gameId;
    this.terrainManager = terrainManager;
    this.helicopters = new Map();

    this.maxHelicopters = 3;
    this.waypointInterval = 10000;
    this.updateInterval = 200;
    this.spawnInterval = 30000;
    this.lastSpawnTime = 0;
    this.lastUpdateTime = Date.now();

    this.updateTimer = setInterval(this.update.bind(this), this.updateInterval);
  }

  generateRandomWaypoint() {
    const x = (Math.random() * 1500) - 750;
    const y = Math.random() * 200 + 200;
    const z = (Math.random() * 1500) - 750;
    return new THREE.Vector3(x, y, z);
  }

  spawnHelicopter() {
    if (this.helicopters.size >= this.maxHelicopters) return;
    const position = this.generateRandomWaypoint();
    const id = `heli_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const helicopter = new Helicopter(id, position);
    helicopter.targetPosition.copy(this.generateRandomWaypoint());
    this.helicopters.set(id, helicopter);

    this.io.to(this.gameId).emit('spawnHelicopter', {
      id: helicopter.id,
      state: helicopter.getState()
    });
  }

  calculateMovementSpeed(deltaTime, distanceToTarget, helicopter, speedReductionFactor = 1) {
    const shouldDecelerate = distanceToTarget <
      (helicopter.currentSpeed * helicopter.currentSpeed) / (2 * helicopter.deceleration);

    if (shouldDecelerate) {
      helicopter.currentSpeed = Math.max(
        0,
        helicopter.currentSpeed - helicopter.deceleration * deltaTime
      );
    } else {
      helicopter.currentSpeed = Math.min(
        helicopter.maxSpeed,
        helicopter.currentSpeed + helicopter.acceleration * deltaTime
      );
    }

    // Apply speed reduction factor
    helicopter.currentSpeed *= speedReductionFactor;

    return helicopter.currentSpeed;
  }

  updateRotation(deltaTime, helicopter, targetDirection) {
    const rotationEuler = new THREE.Euler(
      0,
      helicopter.rotation.y,
      0,
      helicopter.rotation.order
    );
    const currentForward = new THREE.Vector3(0, 0, 1).applyEuler(rotationEuler);
    const angle = currentForward.angleTo(targetDirection);
    const cross = new THREE.Vector3().crossVectors(currentForward, targetDirection);
    const turnDirection = Math.sign(cross.y);
    const desiredTurnRate = Math.min(helicopter.maxTurnRate, angle) * turnDirection;

    if (Math.abs(desiredTurnRate) > 0.01) {
      const turnSign = Math.sign(desiredTurnRate - helicopter.currentTurnRate);
      helicopter.currentTurnRate += turnSign * helicopter.turnAcceleration * deltaTime;
    } else {
      helicopter.currentTurnRate *= 0.95;
    }

    helicopter.currentTurnRate = THREE.MathUtils.clamp(
      helicopter.currentTurnRate,
      -helicopter.maxTurnRate,
      helicopter.maxTurnRate
    );

    const targetBankAngle = (helicopter.currentTurnRate / helicopter.maxTurnRate) *
      helicopter.maxBankAngle;
    helicopter.currentBankAngle += (targetBankAngle - helicopter.currentBankAngle) *
      helicopter.bankingSmoothness;

    helicopter.rotation.y += helicopter.currentTurnRate * deltaTime;
    helicopter.rotation.z = -helicopter.currentBankAngle;
  }

  updateHelicopter(helicopter, deltaTime) {
    const currentTime = Date.now();
    if (currentTime - helicopter.lastWaypointUpdate > this.waypointInterval) {
      helicopter.targetPosition.copy(this.generateRandomWaypoint());
      helicopter.lastWaypointUpdate = currentTime;
      this.io.to(this.gameId).emit('helicopterNewWaypoint', {
        id: helicopter.id,
        targetPosition: helicopter.targetPosition
      });
    }

    const toTarget = new THREE.Vector3()
      .subVectors(helicopter.targetPosition, helicopter.position)
      .normalize();

    this.updateRotation(deltaTime, helicopter, toTarget);
    const distanceToTarget = helicopter.position.distanceTo(helicopter.targetPosition);

    let speedReductionFactor = 1;

    if (distanceToTarget > helicopter.arrivalThreshold) {
      // Initialize speed reduction factor
      speedReductionFactor = 1;

      if (this.terrainManager.terrainData) {
        const forwardDistance = 50;
        const backwardDistance = 50;
        const forwardDir = new THREE.Vector3(0, 0, 1).applyEuler(
          new THREE.Euler(
            helicopter.rotation.x,
            helicopter.rotation.y,
            helicopter.rotation.z,
            helicopter.rotation.order
          )
        ).normalize();

        const forwardCheckPosition = helicopter.position.clone().addScaledVector(forwardDir, forwardDistance);
        const backwardCheckPosition = helicopter.position.clone().addScaledVector(forwardDir, -backwardDistance);

        const forwardTerrainHeight = this.terrainManager.getHeightAtPosition(
          forwardCheckPosition.x,
          forwardCheckPosition.z
        ) + helicopter.minHeightAboveTerrain;

        const backwardTerrainHeight = this.terrainManager.getHeightAtPosition(
          backwardCheckPosition.x,
          backwardCheckPosition.z
        ) + helicopter.minHeightAboveTerrain;

        const currentTerrainHeight = this.terrainManager.getHeightAtPosition(
          helicopter.position.x,
          helicopter.position.z
        ) + helicopter.minHeightAboveTerrain;

        const neededHeight = Math.max(
          forwardTerrainHeight,
          currentTerrainHeight,
          backwardTerrainHeight
        );

        if (neededHeight > helicopter.position.y + 45) { // Threshold to determine if height needs to increase
          speedReductionFactor = 0.6; // Reduce speed by 50%
        }

        helicopter.position.y = Math.max(50, THREE.MathUtils.lerp(
          helicopter.position.y,
          neededHeight,
          helicopter.heightLerpSpeed * deltaTime
        ));
      }

      const speed = this.calculateMovementSpeed(deltaTime, distanceToTarget, helicopter, speedReductionFactor);
      const movement = new THREE.Vector3(0, 0, speed * deltaTime)
        .applyEuler(new THREE.Euler(
          helicopter.rotation.x,
          helicopter.rotation.y,
          helicopter.rotation.z,
          helicopter.rotation.order
        ));
      helicopter.position.add(movement);
    } else {
      helicopter.currentSpeed = 0;
    }

    if (this.terrainManager.terrainData) {
      const forwardDistance = 75;
      const backwardDistance = 50;
      const forwardDir = new THREE.Vector3(0, 0, 1).applyEuler(
        new THREE.Euler(
          helicopter.rotation.x,
          helicopter.rotation.y,
          helicopter.rotation.z,
          helicopter.rotation.order
        )
      ).normalize();

      const forwardCheckPosition = helicopter.position.clone().addScaledVector(forwardDir, forwardDistance);
      const backwardCheckPosition = helicopter.position.clone().addScaledVector(forwardDir, -backwardDistance);

      const forwardTerrainHeight = this.terrainManager.getHeightAtPosition(
        forwardCheckPosition.x,
        forwardCheckPosition.z
      ) + helicopter.minHeightAboveTerrain;

      const backwardTerrainHeight = this.terrainManager.getHeightAtPosition(
        backwardCheckPosition.x,
        backwardCheckPosition.z
      ) + helicopter.minHeightAboveTerrain;

      const currentTerrainHeight = this.terrainManager.getHeightAtPosition(
        helicopter.position.x,
        helicopter.position.z
      ) + helicopter.minHeightAboveTerrain;

      const neededHeight = Math.max(
        forwardTerrainHeight,
        currentTerrainHeight,
        backwardTerrainHeight
      );

      helicopter.position.y = Math.max(50, THREE.MathUtils.lerp(
        helicopter.position.y,
        neededHeight,
        helicopter.heightLerpSpeed * deltaTime
      ));
    }
  }

  update() {
    const currentTime = Date.now();
    const deltaTime = (currentTime - (this.lastUpdateTime || currentTime)) / 1000;
    this.lastUpdateTime = currentTime;

    if (currentTime - this.lastSpawnTime > this.spawnInterval) {
      this.spawnHelicopter();
      this.lastSpawnTime = currentTime;
    }

    for (const helicopter of this.helicopters.values()) {
      this.updateHelicopter(helicopter, deltaTime);
    }

    if (this.helicopters.size > 0) {
      const states = Array.from(this.helicopters.values()).map(h => h.getState());
      this.io.to(this.gameId).emit('helicopterStates', states);
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
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
      this.updateTimer = null;
    }

    for (const helicopter of this.helicopters.values()) {
      this.io.to(this.gameId).emit('helicopterDestroyed', { id: helicopter.id });
    }

    this.helicopters.clear();
    this.io = null;
    this.terrainManager = null;
  }
}
