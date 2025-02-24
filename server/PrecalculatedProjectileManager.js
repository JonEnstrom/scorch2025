import * as THREE from 'three';
import { v4 as uuidv4 } from 'uuid';
import ArmorShieldManager from './ArmorShieldManager.js';

/**
 * Represents one projectile in the pre-calculated system.
 * Stores initial data plus any relevant weapon options.
 */
class SimulatedProjectile {
  constructor(data) {
    this.id = uuidv4();
    this.playerId = data.playerId;
    this.weaponId = data.weaponId;
    this.weaponCode = data.weaponCode || null;

    this.startPos = data.startPos.clone();
    this.direction = data.direction.clone().normalize();
    this.power = data.power;

    // Additional properties
    this.isFinal = data.isFinalProjectile || false;
    this.bounceCount = data.bounceCount || 0;
    this.doesCollide = data.doesCollide ?? true;
    this.craterSize = data.craterSize ?? 20;
    this.aoeSize = data.aoeSize ?? 50;
    this.baseDamage = data.baseDamage ?? 50;
    this.explosionSize = data.explosionSize ?? 1;
    this.explosionType = data.explosionType ?? 'normal';
    this.projectileStyle = data.projectileStyle ?? 'missile';
    this.projectileScale = data.projectileScale ?? 1;

    // Bounce behavior
    this.preImpactBounces = data.preImpactBounces ?? 0;
    this.currentBounces = 0;
    this.bounciness = data.bounciness ?? 0.8;
    this.upwardBias = data.upwardBias ?? 0.3;
    this.minVerticalVelocity = data.minVerticalVelocity ?? 0.2;
    this.bounceExplosion = data.bounceExplosion ?? false;
    this.bounceDamage = data.bounceDamage ?? 0;
    this.bounceCraterSize = data.bounceCraterSize ?? 0;
    
    // New parameter for controlling post-bounce power
    this.preImpactBouncePower = data.preImpactBouncePower ?? null;

    // Physics properties
    this.maxSpeed = this.power;
    this.currentSpeed = 0;
    this.acceleration = data.acceleration ?? 300;
    this.gravity = data.gravity ?? -300;

    // Adaptive simulation properties
    this.minTimeStep = data.minTimeStep ?? 1; // Minimum simulation step in ms
    this.maxTimeStep = data.maxTimeStep ?? 25; // Maximum simulation step in ms
    this.maxMovementPerStep = data.maxMovementPerStep ?? 2.0; // Maximum distance per step
    this.collisionRadius = data.collisionRadius ?? 0.5; // Radius for collision detection

    // Enhanced time control properties
    this.baseTimeFactor = data.timeFactor ?? 1.0;
    this.initialTimeFactor = data.initialTimeFactor ?? this.baseTimeFactor;
    this.timeFactorRate = data.timeFactorRate ?? 0;
    this.minTimeFactor = data.minTimeFactor ?? 0.1;
    this.maxTimeFactor = data.maxTimeFactor ?? 2.0;
    this.bounceSpeedMultiplier = data.bounceSpeedMultiplier ?? 1.0;

    // Initialize velocity vector
    this.velocity = new THREE.Vector3()
      .copy(this.direction)
      .multiplyScalar(this.currentSpeed);

    this.theme = data.theme || 'default';
  }
}

/**
 * Pre-calculates the entire flight of projectiles and returns a timeline of events.
 * Implements adaptive time stepping for accurate collision detection.
 */
export default class PrecalculatedProjectileManager {
  constructor(io, gameId, terrainManager, playerManager) {
    this.io = io;
    this.gameId = gameId;
    this.terrainManager = terrainManager;
    this.lastPathUpdateTime = Date.now();
    this.playerManager = playerManager;

    // Simulation constants
    this.NETWORK_UPDATE_INTERVAL = 25; // ms between network updates
    this.MAX_SIMULATION_TIME = 10000; // ms maximum simulation duration
    this.COLLISION_GRACE_PERIOD = 500; // ms grace period after bounces

    // Weapon handlers for custom impact effects
    this.weaponHandlers = new Map();
    this.onImpactCallback = null;

    // For cleanup
    this.scheduledTimeouts = [];
  }

  registerWeaponHandler(weaponId, callback) {
    this.weaponHandlers.set(weaponId, callback);
  }

  updatePathTime(newTime) {
    this.lastPathUpdateTime = newTime;
  }

  /**
   * Calculate the optimal time step based on current velocity and constraints
   */
  _calculateAdaptiveTimeStep(projectile, currentVelocity) {
    const speed = currentVelocity.length();
    if (speed === 0) return projectile.maxTimeStep;

    // Calculate time step needed to move maxMovementPerStep units
    const timeForMaxMovement = (projectile.maxMovementPerStep / speed) * 1000;

    // Clamp between min and max time steps
    return Math.max(
      projectile.minTimeStep,
      Math.min(projectile.maxTimeStep, timeForMaxMovement)
    );
  }

  /**
   * Check if a movement between two points intersects with terrain
   */
  _checkTerrainIntersection(start, end, radius) {
    const direction = end.clone().sub(start);
    const distance = direction.length();
    const steps = Math.ceil(distance / radius);
    
    if (steps <= 1) {
      const groundHeight = this.terrainManager.generator.getHeightAtPositionBicubic(end.x, end.z);
      return {
        collision: end.y <= groundHeight,
        position: new THREE.Vector3(end.x, groundHeight, end.z)
      };
    }

    direction.normalize();
    const stepSize = distance / steps;

    for (let i = 0; i <= steps; i++) {
      const point = start.clone().add(direction.clone().multiplyScalar(i * stepSize));
      const groundHeight = this.terrainManager.generator.getHeightAtPositionBicubic(point.x, point.z);
      if (point.y <= groundHeight) {
        return {
          collision: true,
          position: new THREE.Vector3(point.x, groundHeight, point.z)
        };
      }
    }

    return { collision: false, position: null };
  }

  /**
   * Simulate multiple projectiles and return a timeline of events
   */
  simulateProjectiles(playerId, projectilesData, weaponId, weaponCode) {
    const timelineEvents = [];

    projectilesData.forEach(data => {
      const projectile = new SimulatedProjectile({
        ...data,
        playerId,
        weaponId,
        weaponCode
      });
      this._simulateSingleProjectile(projectile, 0, timelineEvents);
    });

    timelineEvents.sort((a, b) => a.time - b.time);
    return timelineEvents;
  }

/**
 * Simulate a single projectile's complete trajectory
 */
_simulateSingleProjectile(projectile, startTime, timelineEvents) {
  let timeAccumulator = 0;
  let realTimeAccumulator = 0;
  let lastNetworkUpdateTime = 0;

  const position = projectile.startPos.clone();
  let currentSpeed = projectile.currentSpeed;
  const velocity = projectile.velocity.clone();
  const direction = projectile.direction.clone();
  
  // Add a flag to track if we're using fixed power from a recent bounce
  let usingFixedBounceSpeed = false;
  let skipAccelerationForOneFrame = false;

  // Record spawn event
  timelineEvents.push({
    type: 'projectileSpawn',
    time: startTime,
    projectileId: projectile.id,
    playerId: projectile.playerId,
    startPos: { x: position.x, y: position.y, z: position.z },
    direction: { x: direction.x, y: direction.y, z: direction.z },
    power: projectile.power,
    weaponId: projectile.weaponId,
    weaponCode: projectile.weaponCode,
    projectileStyle: projectile.projectileStyle,
    projectileScale: projectile.projectileScale,
    explosionType: projectile.explosionType,
    explosionSize: projectile.explosionSize,
    craterSize: projectile.craterSize,
    isFinalProjectile: projectile.isFinal,
    doesCollide: projectile.doesCollide,
    bounceCount: projectile.bounceCount
  });

  let isActive = true;
  const previousPosition = position.clone();

  while (isActive && timeAccumulator < this.MAX_SIMULATION_TIME) {
    // Calculate dynamic time factor
    let effectiveTimeFactor;
    if (projectile.timeFactorRate !== 0) {
      const elapsedSeconds = realTimeAccumulator / 1000;
      effectiveTimeFactor = projectile.initialTimeFactor + elapsedSeconds * projectile.timeFactorRate;
      
      // Apply bounce speed multiplier based on bounce count
      if (projectile.bounceSpeedMultiplier !== 1.0) {
        effectiveTimeFactor *= Math.pow(projectile.bounceSpeedMultiplier, projectile.bounceCount);
      }
      
      // Clamp to min/max values
      effectiveTimeFactor = Math.max(
        projectile.minTimeFactor,
        Math.min(projectile.maxTimeFactor, effectiveTimeFactor)
      );
    } else {
      effectiveTimeFactor = projectile.baseTimeFactor;
    }

    // Calculate base time step from adaptive system
    const baseTimeStep = this._calculateAdaptiveTimeStep(projectile, velocity);
    
    // Apply time factor to get actual simulation step
    const simulationTimeStep = baseTimeStep / effectiveTimeFactor;
    
    // Calculate how much real time this simulation step represents
    const realTimeStep = baseTimeStep;

    // Store previous position for collision checking
    previousPosition.copy(position);

    // Update physics using simulation time step
    // Only apply acceleration if we're not using a fixed bounce speed
    if (!skipAccelerationForOneFrame && currentSpeed < projectile.maxSpeed) {
      currentSpeed = Math.min(
        projectile.maxSpeed,
        currentSpeed + projectile.acceleration * (simulationTimeStep / 1000)
      );
      // Only update velocity magnitude if we're not using a fixed bounce speed
      if (!usingFixedBounceSpeed) {
        velocity.copy(direction).multiplyScalar(currentSpeed);
      }
    }
    
    // Reset the skip acceleration flag if it was set
    if (skipAccelerationForOneFrame) {
      skipAccelerationForOneFrame = false;
    }

    // Apply gravity
    velocity.y += projectile.gravity * (simulationTimeStep / 1000);

    // Update position
    position.add(velocity.clone().multiplyScalar(simulationTimeStep / 1000));

    // Check for terrain collision
    const hasCollisionGracePeriod = timeAccumulator < this.COLLISION_GRACE_PERIOD;
    if (!hasCollisionGracePeriod && projectile.doesCollide) {
      const intersection = this._checkTerrainIntersection(
        previousPosition,
        position,
        projectile.collisionRadius
      );

      if (intersection.collision) {
        // Check if we should process automatic bounce
        if (projectile.currentBounces < projectile.preImpactBounces) {
          // Handle automatic bounce
          const bounceResult = this._handleAutomaticBounce(
            projectile,
            intersection.position, 
            velocity.clone(),
            startTime + (realTimeAccumulator * effectiveTimeFactor),
            timelineEvents
          );
          
          // Update projectile state
          position.copy(bounceResult.newPosition);
          velocity.copy(bounceResult.newVelocity);
          direction.copy(bounceResult.newDirection);
          currentSpeed = bounceResult.newSpeed;
          
          // Set flags based on bounce result
          usingFixedBounceSpeed = bounceResult.isFixedPower;
          skipAccelerationForOneFrame = true;  // Skip acceleration for one frame after bounce
          
          // Increment bounce count
          projectile.currentBounces++;
          projectile.bounceCount++;
          
          // Add bounce event to timeline if needed
          if (bounceResult.bounceEvent) {
            timelineEvents.push(bounceResult.bounceEvent);
          }
        } else {
          // Normal impact handling when we've exhausted pre-impact bounces
          this._handleImpact(
            projectile,
            intersection.position,
            startTime + (realTimeAccumulator * effectiveTimeFactor),
            timelineEvents,
            velocity.clone() // Pass current velocity for reflection calculations
          );
          isActive = false;
        }
      }
    }

    // Update accumulators separately for simulation and real time
    timeAccumulator += simulationTimeStep;
    realTimeAccumulator += realTimeStep;

    // Send network updates at fixed intervals
    // Scale the event time by the time factor
    if (isActive && realTimeAccumulator - lastNetworkUpdateTime >= this.NETWORK_UPDATE_INTERVAL) {
      timelineEvents.push({
        type: 'projectileMove',
        time: startTime + (realTimeAccumulator * effectiveTimeFactor),
        projectileId: projectile.id,
        position: { x: position.x, y: position.y, z: position.z }
      });
      lastNetworkUpdateTime = realTimeAccumulator;
    }
  }
}

/**
 * Handle an automatic bounce without ending the projectile
 * @param {SimulatedProjectile} projectile - The projectile to bounce
 * @param {THREE.Vector3} impactPos - The impact position
 * @param {THREE.Vector3} velocity - Current velocity
 * @param {number} eventTime - Current simulation time
 * @param {Array} timelineEvents - Timeline to add events to
 * @returns {Object} Result containing new position, velocity, and optional bounce event
 */
_handleAutomaticBounce(projectile, impactPos, velocity, eventTime, timelineEvents) {
  // Calculate surface normal at impact point
  const surfaceNormal = this._calculateTerrainNormal(impactPos);
  
  // Calculate reflection direction
  const incomingDirection = velocity.clone().normalize();
  const newDirection = this._calculateReflectionDirection(
    incomingDirection, 
    surfaceNormal
  );
  
  // Apply upward bias to prevent sliding along terrain
  newDirection.y += projectile.upwardBias;
  
  // Ensure minimum vertical component for a good bounce
  if (newDirection.y < projectile.minVerticalVelocity) {
    newDirection.y = projectile.minVerticalVelocity;
    newDirection.normalize();
  }
  
  // Calculate new velocity based on direction and either preImpactBouncePower or reduced speed
  let newSpeed;
  let isFixedPower = false;
  
  if (projectile.preImpactBouncePower !== null) {
    // Use the preset bounce power if specified
    newSpeed = projectile.preImpactBouncePower;
    isFixedPower = true;
  } else {
    // Otherwise use the bounciness factor to determine the retained energy
    newSpeed = velocity.length() * projectile.bounciness;
  }
  
  const newVelocity = newDirection.clone().multiplyScalar(newSpeed);
  
  // Create new position slightly above terrain to prevent immediate re-collision
  const newPosition = new THREE.Vector3(
    impactPos.x,
    impactPos.y + 1.0, // Lift slightly off ground
    impactPos.z
  );
  
  let bounceEvent = null;
  
  // If this bounce should cause effects, create an event
  if (projectile.bounceExplosion) {
    bounceEvent = {
      type: 'projectileBounce',
      time: eventTime,
      projectileId: projectile.id,
      playerId: projectile.playerId,
      position: {
        x: impactPos.x,
        y: impactPos.y,
        z: impactPos.z
      },
      bounceCount: projectile.currentBounces,
      incomingDirection: {
        x: incomingDirection.x,
        y: incomingDirection.y,
        z: incomingDirection.z
      },
      outgoingDirection: {
        x: newDirection.x,
        y: newDirection.y,
        z: newDirection.z
      },
      surfaceNormal: {
        x: surfaceNormal.x,
        y: surfaceNormal.y,
        z: surfaceNormal.z
      },
      explosionType: 'bounce',
      explosionSize: projectile.explosionSize * 0.5,
      craterSize: projectile.bounceCraterSize,
      damage: projectile.bounceDamage
    };
  }
  
  return {
    newPosition,
    newVelocity,
    newDirection,
    bounceEvent,
    isFixedPower,  // Add this flag to indicate we're using a fixed power
    newSpeed       // Add the new speed for easier access
  };
}

  /**
   * Calculate terrain normal at a given position
   * @param {THREE.Vector3} position - Impact position
   * @return {THREE.Vector3} Normalized surface normal
   */
  _calculateTerrainNormal(position) {
    // Sample points around the impact to determine terrain slope
    const sampleDist = 1.0; // Distance for sampling
    
    // Get heights at sample points
    const centerHeight = this.terrainManager.generator.getHeightAtPositionBicubic(position.x, position.z);
    const heightPX = this.terrainManager.generator.getHeightAtPositionBicubic(position.x + sampleDist, position.z);
    const heightNX = this.terrainManager.generator.getHeightAtPositionBicubic(position.x - sampleDist, position.z);
    const heightPZ = this.terrainManager.generator.getHeightAtPositionBicubic(position.x, position.z + sampleDist);
    const heightNZ = this.terrainManager.generator.getHeightAtPositionBicubic(position.x, position.z - sampleDist);
    
    // Calculate slope vectors
    const slopeX = new THREE.Vector3(2 * sampleDist, heightPX - heightNX, 0).normalize();
    const slopeZ = new THREE.Vector3(0, heightPZ - heightNZ, 2 * sampleDist).normalize();
    
    // Cross product gives the normal
    const normal = new THREE.Vector3().crossVectors(slopeZ, slopeX).normalize();
    
    // Ensure normal points upward (terrain shouldn't have overhangs)
    if (normal.y < 0) normal.negate();
    
    return normal;
  }

  /**
   * Calculate reflection direction based on impact
   * @param {THREE.Vector3} incomingDir - Normalized incoming direction
   * @param {THREE.Vector3} surfaceNormal - Normalized surface normal
   * @param {number} bounciness - Coefficient of restitution (0-1)
   * @return {THREE.Vector3} Reflection direction (normalized)
   */
  _calculateReflectionDirection(incomingDir, surfaceNormal) {
    // Reflection formula: R = V - 2(V·N)N where N is normalized
    const dot = incomingDir.dot(surfaceNormal);
    
    // Calculate reflection direction
    const reflectionDir = new THREE.Vector3().copy(incomingDir);
    reflectionDir.sub(surfaceNormal.clone().multiplyScalar(2 * dot));
    
    // Just normalize without applying bounciness here
    return reflectionDir.normalize();
  }


  /**
   * Handle projectile impact with terrain
   */
  _handleImpact(projectile, impactPos, eventTime, timelineEvents, velocity) {
    // Calculate surface normal at impact point
    const surfaceNormal = this._calculateTerrainNormal(impactPos);
    
    // Create a default direction if velocity is not provided
    const incomingDirection = velocity ? 
      velocity.clone().normalize() : 
      new THREE.Vector3(0, -1, 0); // Default to straight down if no velocity provided
    
    const impactEvent = {
      type: 'projectileImpact',
      time: eventTime,
      projectileId: projectile.id,
      playerId: projectile.playerId,
      position: impactPos,
      isFinalProjectile: projectile.isFinal,
      craterSize: projectile.craterSize,
      aoeSize: projectile.aoeSize,
      damage: projectile.baseDamage,
      explosionSize: projectile.explosionSize,
      explosionType: projectile.explosionType,
      bounceCount: projectile.bounceCount,
      // Add these new properties
      incomingDirection: { 
        x: incomingDirection.x, 
        y: incomingDirection.y, 
        z: incomingDirection.z 
      },
      surfaceNormal: { 
        x: surfaceNormal.x, 
        y: surfaceNormal.y, 
        z: surfaceNormal.z 
      }
    };
    
    timelineEvents.push(impactEvent);
    
    /* NOT DOING THIS RIGHT NOW, NEED TO REFACTOR THE CODE FOR TERRAIN MODIFICATIONS.
    // Modify terrain
    const patch = this.terrainManager.generator.modifyTerrain(
      impactPos.x,
      impactPos.z,
      projectile.craterSize,
      'crater'
    );
*/

    // Handle weapon-specific effects
    const weaponHandler = this.weaponHandlers.get(projectile.weaponId);
    if (weaponHandler) {
      weaponHandler(impactEvent, timelineEvents, this);
    }

    // Call general impact callback
    if (this.onImpactCallback) {
      this.onImpactCallback(impactEvent);
    }
  }

  /**
   * Schedule timeline events for execution
   */
  scheduleTimeline(timeline, startAt = Date.now()) {
    for (const event of timeline) {
      const delay = Math.max(event.time, 0);
      const timeoutId = setTimeout(() => {
        this._processScheduledEvent(event);
      }, delay);
      this.scheduledTimeouts.push(timeoutId);
    }
  }

  /**
   * Process a scheduled timeline event
   */
  _processScheduledEvent(event) {
    // Handle both impact and bounce events for damage
    if (event.type === 'projectileImpact' || event.type === 'projectileBounce') {
      const allPlayers = this.playerManager.getPlayersObject();
      for (const [userId, player] of Object.entries(allPlayers)) {
        if (!player.isAlive) continue;
  
        const playerPos = player.getPosition();
        const dx = playerPos.x - event.position.x;
        const dz = playerPos.z - event.position.z;
        const distance = Math.sqrt(dx * dx + dz * dz);
  
        // Area-of-effect damage
        if (distance < event.aoeSize) {
          const falloffPercent = (distance / event.aoeSize) * 0.5;
          const damageMultiplier = 1 - falloffPercent;
          const damage = Math.round(event.damage * damageMultiplier);
  
          // Only apply damage if greater than zero
          if (damage > 0) {
            const damageResult = ArmorShieldManager.applyDamage(player, damage);
    
            this.io.to(this.gameId).emit('playerDamaged', {
              id: userId,
              damage: damage,
              damageDistribution: damageResult,
              currentHealth: player.getHealth()
            });
    
            if (player.getHealth() <= 0) {
              player.isAlive = false;
              this.io.to(this.gameId).emit('playerDefeated', { id: userId });
            }
            if (player.hasShield && player.getShield() <= 0) {
              this.io.to(this.gameId).emit('removeShield', { playerId: userId });
              player.hasShield = false;
            }
  
            this.io.to(this.gameId).emit('playerListUpdated', this.playerManager.getAllPlayers());
          }
        }
      }
      this.playerManager.adjustPositionsToTerrain();
    }
  }

  /**
   * Create and simulate a sub-projectile (e.g., for cluster weapons)
   */
  simulateSubProjectile(spawnData, spawnTime, timelineEvents) {
    const projectile = new SimulatedProjectile(spawnData);
    this._simulateSingleProjectile(projectile, spawnTime, timelineEvents);
  }
}