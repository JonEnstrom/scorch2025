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
    
    // Physics
    this.maxSpeed = this.power;
    this.currentSpeed = 0;
    this.acceleration = 300;
    this.gravity = -300;
    
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
   * start to finish.  If it spawns sub-projectiles (e.g. bouncing, cluster),
   * we also simulate those in-line, appending to timelineEvents.
   *
   * @param {SimulatedProjectile} projectile
   * @param {number} startTime - The time offset (ms) at which this projectile is "spawned"
   * @param {Array} timelineEvents - Collector of all events
   */
  _simulateSingleProjectile(projectile, startTime, timelineEvents) {
    // Step-based simulation
    // (You can adjust timeStep to be smaller/larger for more or less detail.)
    const timeStep = 50; // ms
    let timeAccumulator = 0; // ms
    
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
      // additional display props
      projectileStyle: projectile.projectileStyle,
      projectileScale: projectile.projectileScale,
      explosionType: projectile.explosionType,
      explosionSize: projectile.explosionSize,
      craterSize: projectile.craterSize,
      isFinalProjectile: projectile.isFinal,
      doesCollide: projectile.doesCollide
    });

    // We'll simulate up to some max time or until it hits the ground, etc.
    const maxSimTime = 10000; // ms
    let isActive = true;

    while (isActive && timeAccumulator < maxSimTime) {
      timeAccumulator += timeStep;

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

      // 4) Check collision with terrain
      const groundHeight = this.terrainManager.getHeightAtPosition(position.x, position.z);
      
      if (position.y <= groundHeight) {
        // We have impact at time => (startTime + timeAccumulator)
        this._handleImpact(
          projectile,
          { x: position.x, y: groundHeight, z: position.z },
          startTime + timeAccumulator,
          timelineEvents
        );
        isActive = false;
      } else {
        // (Optional) If you want intermediate "position update" events 
        // so the client can smoothly animate, we can record them:
        timelineEvents.push({
          type: 'projectileMove',
          time: startTime + timeAccumulator,
          projectileId: projectile.id,
          position: { x: position.x, y: position.y, z: position.z }
        });
      }

      // 5) Optionally check collisions with helicopters, etc. 
      //    If you want mid-flight collisions with other objects:
      if (isActive && this.helicopterManager) {
        const helicopter = this._checkHelicopterCollision(
          projectile, 
          position,
          // bounding radius or something
          1
        );
        if (helicopter) {
          // Impact the helicopter
          this._handleHelicopterHit(
            projectile,
            helicopter,
            position,
            startTime + timeAccumulator,
            timelineEvents
          );
          isActive = false;
        }
      }
    }

    // If we exit the loop "naturally" (e.g. maxSimTime), the projectile just times out in the air
    if (isActive) {
      // Possibly record a final "out of range" or "expired" event
      timelineEvents.push({
        type: 'projectileExpired',
        time: startTime + timeAccumulator,
        projectileId: projectile.id
      });
    }
  }

  /**
   * Check collision with any helicopter in helicopterManager.
   * Returns the first helicopter that collides, or null if none do.
   */
  _checkHelicopterCollision(projectile, position, radius) {
    if (!this.helicopterManager?.helicopters) return null;
    for (const helicopter of this.helicopterManager.helicopters.values()) {
      // Simple distance check
      const dx = helicopter.position.x - position.x;
      const dy = helicopter.position.y - position.y;
      const dz = helicopter.position.z - position.z;
      const distSq = dx*dx + dy*dy + dz*dz;
      // Suppose helicopter has some bounding radius
      const helicopterRadius = helicopter.boundingRadius || 5;
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
    // Let's do damage
    const damage = projectile.baseDamage;
    const destroyed = helicopter.takeDamage(damage);

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

    // Tell global callback
    if (this.onImpactCallback) {
      this.onImpactCallback(impactEvent);
    }
    // Weapon-specific
    const weaponHandler = this.weaponHandlers.get(projectile.weaponId);
    if (weaponHandler) {
      weaponHandler(impactEvent, timelineEvents, this);
    }
    
    if (destroyed) {
      // Also record helicopter destroyed event
      timelineEvents.push({
        type: 'helicopterDestroyed',
        time: eventTime,
        helicopterId: helicopter.id
      });
      this.helicopterManager.helicopters.delete(helicopter.id);
    }
  }

  /**
 * Schedules all timeline events to happen in real-time.
 * 
 * @param {Array} timeline - The array of projectile events (already sorted by time).
 * @param {number} startAt - (Optional) An offset in ms to start playing these events 
 *                           in real time. Default = Date.now().
 * @param {object} gameCore - So we can call gameCore.handleProjectileImpact, etc.
 */
scheduleTimeline(timeline, startAt = Date.now(), gameCore) {
    // Keep references if you want to be able to cancel timeouts later
    if (!this.scheduledTimeouts) {
      this.scheduledTimeouts = [];
    }
  
    // The timeline events' `time` are in [0 ... ~10000] ms since we started simulating.
    // We’ll assume `time=0` means "immediate" from `startAt`.
    for (const event of timeline) {
      const delay = event.time; // e.g. 2000 means 2 seconds from the start.
  
      // If you want to offset them from *now*:
      // let realDelay = (startAt + delay) - Date.now();
  
      // But typically, if "time" is already how many ms from "now," 
      // we can just do:
      const realDelay = delay;
  
      // Don’t let negative or very small delays break anything
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
          // For example, pass it into GameCore’s handleProjectileImpact
          this.onImpactCallback(event);
        }
        break;
  
      case 'projectileSpawn':
        // Usually the client handles visuals, but server might want 
        // to keep track or do something special. 
        break;
  
      case 'projectileMove':
        // Typically we do nothing server-side except maybe track position 
        // for collision or statistics. 
        break;
  
      case 'projectileExpired':
        // Possibly do cleanup
        break;
  
      // You can add other event types like 'helicopterDestroyed'
      // if you want them to happen at a scheduled time, etc.
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
