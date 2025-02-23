// PrecalculatedProjectileManager.js
import * as THREE from 'three';
import { v4 as uuidv4 } from 'uuid';

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

    // Physics - Now customizable per projectile
    this.maxSpeed = this.power; // Keep max speed based on power
    this.currentSpeed = 0;
    this.acceleration = data.acceleration ?? 300;
    this.gravity = data.gravity ?? -300;

    // Time factor - static value for backwards compatibility.
    // For dynamic behavior, optional dynamic properties may be provided.
    this.timeFactor = data.timeFactor ?? 1.0;
    if (data.initialTimeFactor !== undefined) {
      this.initialTimeFactor = data.initialTimeFactor;
    }
    if (data.timeFactorRate !== undefined) {
      this.timeFactorRate = data.timeFactorRate;
    }

    // We track velocity separately
    this.velocity = new THREE.Vector3()
      .copy(this.direction)
      .multiplyScalar(this.currentSpeed);

    // For convenience, track a "theme" if needed
    this.theme = data.theme || 'default';
  }
}

/**
 * This class pre-calculates the entire flight of projectiles
 * and returns a timeline of events.
 */
export default class PrecalculatedProjectileManager {
  constructor(io, gameId, terrainManager, helicopterManager) {
    this.io = io;
    this.gameId = gameId;
    this.terrainManager = terrainManager;
    this.helicopterManager = helicopterManager;
    this.lastPathUpdateTime = Date.now();

    // Each weapon type can register a handler
    // that gets called on projectile impact
    this.weaponHandlers = new Map();

    // A callback to unify "impact" logic
    // (e.g. your handleProjectileImpact from GameCore)
    this.onImpactCallback = null;
  }

  /**
   * We no longer keep a big array of projectiles, because
   * everything is precomputed at the time of firing.
   */
  registerWeaponHandler(weaponId, callback) {
    this.weaponHandlers.set(weaponId, callback);
  }

  updatePathTime(newTime) {
    this.lastPathUpdateTime = newTime;
  }

  setImpactHandler(callback) {
    this.onImpactCallback = callback;
  }

  /**
   * The main function the server calls to simulate
   * the entire flight (or flights) of projectiles
   * from a particular weapon usage.
   *
   * @param {String} playerId
   * @param {Array<Object>} projectilesData - The initial set of projectiles to simulate
   * @param {String} weaponId
   * @param {String} weaponCode
   * @returns {Array<Object>} - A timeline of events that you can broadcast to clients.
   */
  simulateProjectiles(playerId, projectilesData, weaponId, weaponCode) {
    const timelineEvents = []; // all events in the simulation

    // For each "initial" projectile, we do a sub-simulation
    projectilesData.forEach(data => {
      const projectile = new SimulatedProjectile({
        ...data,
        playerId,
        weaponId,
        weaponCode
      });
      // Start simulation for this projectile
      this._simulateSingleProjectile(projectile, 0, timelineEvents);
    });

    // Sort events by ascending timestamp before returning
    timelineEvents.sort((a, b) => a.time - b.time);

    return timelineEvents;
  }

  /**
   * Recursively simulate a single projectile's flight from
   * start to finish. If it spawns sub-projectiles (e.g. bouncing, cluster),
   * we also simulate those in-line, appending to timelineEvents.
   *
   * @param {SimulatedProjectile} projectile
   * @param {number} startTime - The time offset (ms) at which this projectile is "spawned"
   * @param {Array} timelineEvents - Collector of all events
   */
  _simulateSingleProjectile(projectile, startTime, timelineEvents) {
    // **KEY CHANGES HERE**
    const internalTimeStep = 5; // ms
    const networkTimeStep = 25;  // ms 

    let timeAccumulator = 0; // ms of simulation time
    let realTimeAccumulator = 0; // ms of real world time
    let lastNetworkUpdateTime = 0; // Track when we last sent a 'projectileMove'

    // We'll keep a copy of the projectile's "live" position, velocity, etc.
    const position = projectile.startPos.clone();
    let currentSpeed = projectile.currentSpeed;
    const velocity = projectile.velocity.clone();
    const direction = projectile.direction.clone();

    // Record a "spawn" event
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
      bounceCount: projectile.bounceCount || 0
    });

    // We'll simulate up to some max time or until it hits the ground, etc.
    const maxSimTime = 10000; // ms
    let isActive = true;

    // Calculate a grace period for terrain collision based on bounceCount
    const collisionGracePeriod = projectile.bounceCount > 0 ? 500 : 500; // ms

    // Base time for absolute time calculations
    const simulationStartTime = this.lastPathUpdateTime;

    while (isActive && timeAccumulator < maxSimTime) {
      // Determine effective time factor
      let effectiveTimeFactor;
      if (
        projectile.hasOwnProperty('initialTimeFactor') &&
        projectile.hasOwnProperty('timeFactorRate')
      ) {
        const elapsedSeconds = realTimeAccumulator / 1000;
        effectiveTimeFactor = projectile.initialTimeFactor + elapsedSeconds * projectile.timeFactorRate;
      } else {
        effectiveTimeFactor = projectile.timeFactor;
      }

      // Adjust timeStep based on the effective time factor
      const timeStep = internalTimeStep / effectiveTimeFactor;  // Use internalTimeStep

      // Increment simulation time
      timeAccumulator += internalTimeStep; // Always increment by internalTimeStep

      // Increment real-world time (this is what gets reported in events)
      realTimeAccumulator += internalTimeStep;  // Also increment by internal step

      // Calculate current absolute time for helicopter collision checks
      const currentAbsoluteTime = simulationStartTime + realTimeAccumulator;

      // 1) Accelerate if needed
      if (currentSpeed < projectile.maxSpeed) {
        currentSpeed = Math.min(
          projectile.maxSpeed,
          currentSpeed + projectile.acceleration * (timeStep / 1000)
        );
        velocity.copy(direction).multiplyScalar(currentSpeed);
      }

      // 2) Gravity
      velocity.y += projectile.gravity * (timeStep / 1000);

      // 3) Update position
      position.x += velocity.x * (timeStep / 1000);
      position.y += velocity.y * (timeStep / 1000);
      position.z += velocity.z * (timeStep / 1000);

      // 4) Check collision with terrain, but include grace period for bounced projectiles
      const groundHeight = this.terrainManager.getHeightAtPosition(position.x, position.z);

      // Skip terrain collision during grace period
      const hasCollisionGracePeriod = timeAccumulator < collisionGracePeriod;

        // **CRITICAL CHANGE: Use more precise time for impacts**
      if (position.y <= groundHeight && !hasCollisionGracePeriod) {
          // We have impact at time => (startTime + realTimeAccumulator)
          this._handleImpact(
            projectile,
            { x: position.x, y: groundHeight, z: position.z },
            startTime + realTimeAccumulator, // Use the *actual* accumulated time
            timelineEvents
          );
          isActive = false;

      }  else {
          // **Network Update Logic**
          if (realTimeAccumulator - lastNetworkUpdateTime >= networkTimeStep) {
            // Record position updates with adjusted time
            timelineEvents.push({
              type: 'projectileMove',
              time: startTime + realTimeAccumulator,
              projectileId: projectile.id,
              position: { x: position.x, y: position.y, z: position.z }
            });
            lastNetworkUpdateTime = realTimeAccumulator; // Update last sent time
          }
      }

      // 5) Check collisions with helicopters (if still active)
      if (isActive && this.helicopterManager) {
        const helicopter = this._checkHelicopterCollision(
          projectile,
          position,
          1,
          currentAbsoluteTime
        );
        if (helicopter) {
            // **CRITICAL CHANGE: Use more precise time**
          this._handleHelicopterHit(
            projectile,
            helicopter,
            position,
            startTime + realTimeAccumulator,  // Use actual accumulated time
            timelineEvents
          );
          isActive = false;
        }
      }
    }

    // If we exit the loop "naturally"
    if (isActive) {
      timelineEvents.push({
        type: 'projectileExpired',
        time: startTime + realTimeAccumulator,
        projectileId: projectile.id
      });
    }
  }


  /**
  * Check collision with any helicopter in helicopterManager at a specific time.
  * Now uses the helicopter's planned path to determine its position.
  * @param {SimulatedProjectile} projectile
  * @param {THREE.Vector3} position - Projectile position
  * @param {number} radius - Collision check radius
  * @param {number} absoluteTime - The absolute time (in ms) to check collision at
  */
  _checkHelicopterCollision(projectile, position, radius, absoluteTime) {
    if (!this.helicopterManager?.helicopters) return null;

    // Convert absoluteTime to relative time for helicopter path lookup
    // We need to account for the most recent path update time
    const relativeTime = Math.max(0, (absoluteTime - this.lastPathUpdateTime) / 1000);

    for (const helicopter of this.helicopterManager.helicopters.values()) {
      // Get helicopter state at this exact time
      const helicopterState = helicopter.getFutureState(relativeTime);
      if (!helicopterState) continue;

      // Get helicopter position from its state
      const helicopterPos = helicopterState.position;

      // Simple distance check with the interpolated position
      const dx = helicopterPos.x - position.x;
      const dy = helicopterPos.y - position.y;
      const dz = helicopterPos.z - position.z;
      const distSq = dx * dx + dy * dy + dz * dz;

      // Use helicopter's actual bounding radius
      const helicopterRadius = helicopter.boundingRadius;
      if (distSq < (radius + helicopterRadius) ** 2) {
        return helicopter;
      }
    }
    return null;
  }

  /**
   * Called when a projectile collides with the ground (terrain).
   * We create an "impact" event, and we also call any "impact" callbacks
   * (including your handleProjectileImpact from GameCore).
   */
  _handleImpact(projectile, impactPos, eventTime, timelineEvents) {
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
      isHelicopterHit: false,
      hitHelicopterId: null
    };
    timelineEvents.push(impactEvent);

    // If we have a global or weapon-specific impact callback, call it
    // so that it can do terrain damage, player damage, spawn sub-projectiles, etc.
    const weaponHandler = this.weaponHandlers.get(projectile.weaponId);
    if (weaponHandler) {
      // The weapon can spawn additional projectiles or do extra logic
      // (In the new approach, you'd do "pre-simulation" of any spawns here.)
      weaponHandler(impactEvent, timelineEvents, this);
    }
  }

  /**
   * Called when a projectile hits a helicopter mid-air.
   */
  _handleHelicopterHit(projectile, helicopter, position, eventTime, timelineEvents) {
    // Calculate damage but don't apply it immediately
    const damage = projectile.baseDamage;

    // Create the impact event
    const impactEvent = {
      type: 'projectileImpact',
      time: eventTime,
      projectileId: projectile.id,
      playerId: projectile.playerId,
      position,
      isFinalProjectile: projectile.isFinal,
      craterSize: projectile.craterSize,
      aoeSize: projectile.aoeSize,
      damage: damage,
      explosionSize: projectile.explosionSize,
      explosionType: projectile.explosionType,
      bounceCount: projectile.bounceCount,
      isHelicopterHit: true,
      hitHelicopterId: helicopter.id
    };
    timelineEvents.push(impactEvent);

    // Push a separate helicopter damage event to the timeline
    // This will be processed at the scheduled time
    timelineEvents.push({
      type: 'helicopterDamage',
      time: eventTime,
      helicopterId: helicopter.id,
      damage: damage,
      projectileId: projectile.id,
      playerId: projectile.playerId
    });

    // Weapon-specific handler is still called during simulation
    // but it should only generate additional events, not apply effects immediately
    const weaponHandler = this.weaponHandlers.get(projectile.weaponId);
    if (weaponHandler) {
      weaponHandler(impactEvent, timelineEvents, this);
    }
  }

  scheduleTimeline(timeline, startAt = Date.now(), gameCore) {
    // Keep references if you want to be able to cancel timeouts later
    if (!this.scheduledTimeouts) {
      this.scheduledTimeouts = [];
    }

    // The timeline events' `time` are in [0 ... ~10000] ms since we started simulating.
    // We'll assume `time=0` means "immediate" from `startAt`.
    for (const event of timeline) {
      const delay = event.time; // e.g. 2000 means 2 seconds from the start.

      // If you want to offset them from *now*:
      // let realDelay = (startAt + delay) - Date.now();

      // But typically, if "time" is already how many ms from "now,"
      // we can just do:
      const realDelay = delay;

      // Don't let negative or very small delays break anything
      const clampedDelay = Math.max(realDelay, 0);

      const timeoutId = setTimeout(() => {
        this._processScheduledEvent(event, gameCore);
      }, clampedDelay);

      this.scheduledTimeouts.push(timeoutId);
    }
  }

  /**
   * Called for each event at the correct time (via setTimeout).
   * We decide how to handle each event type.
   * Usually, "projectileImpact" is the big one that modifies terrain + deals damage.
   */
  _processScheduledEvent(event, gameCore) {
    switch (event.type) {
      case 'projectileImpact':
        // Now we do the real game effect
        if (this.onImpactCallback) {
          // For example, pass it into GameCore's handleProjectileImpact
          this.onImpactCallback(event);
        }
        break;

      case 'helicopterDamage':
        // Apply the helicopter damage at the scheduled time
        if (this.helicopterManager && this.helicopterManager.helicopters.has(event.helicopterId)) {
          const helicopter = this.helicopterManager.helicopters.get(event.helicopterId);
          const destroyed = helicopter.takeDamage(event.damage);

          // If the helicopter was destroyed, broadcast that event
          if (destroyed) {
            // Notify clients about the destroyed helicopter
            this.io.to(this.gameId).emit('helicopterDestroyed', {
              helicopterId: helicopter.id,
              playerId: event.playerId
            });

            // Remove the helicopter from the manager
            this.helicopterManager.helicopters.delete(helicopter.id);
          }
        }
        break;

      case 'helicopterDestroyed':
        // This is now handled within helicopterDamage case
        // but we keep it for backward compatibility
        break;

      default:
        break;
    }
  }

  /**
   * Utility to create new projectiles from a weapon’s sub-spawn logic
   * (e.g. BouncingBetty spawns a new projectile after an impact).
   *
   * This will do a sub-simulation (recursively) and merge its events
   * into the existing timeline, starting at some offset time.
   *
   * @param {Object} spawnData - same structure as `projectilesData` in `simulateProjectiles`.
   * @param {Number} spawnTime - when the new projectile starts.
   * @param {Array} timelineEvents - collector array for all events.
   */
  simulateSubProjectile(spawnData, spawnTime, timelineEvents) {
    const projectile = new SimulatedProjectile(spawnData);
    this._simulateSingleProjectile(projectile, spawnTime, timelineEvents);
  }
}