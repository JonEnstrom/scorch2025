// HelicopterManager.js - Server-side class to manage helicopter spawning and flight paths

class HelicopterManager {
  constructor(io, gameId, terrainManager, options = {}) {
    this.io = io;
    this.gameId = gameId;
    this.terrainManager = terrainManager;
    this.helicopters = new Map(); // Store active helicopters
    
    // Default options
    this.options = {
      minHeight: 20, // Height above terrain in units
      maxSpeed: 20, // Forward speed in units per second
      minSpeed: 5,
      maxYawRate: Math.PI / 3, // Maximum rotation rate in radians per second
      timeStep: 0.1, // Simulation time step in seconds (keep at 0.1 for accuracy)
      clientDataReductionFactor: 2, // Reduce data points sent to client by this factor
      mapSize: 180, // Map size 
      raycastDistance: 30, // How far ahead to check for terrain
      maxHelicopters: 5, // Maximum number of helicopters in the world
      simAheadTime: 120, // How many seconds of flight path to pre-calculate
      baseHealth: 100, // Base health for helicopters
      spawnDistance: 100, // Distance outside map to spawn helicopters
      fixedHeight: 150, // Fixed height for spawn/exit points
      maxWaypoints: 8, // Maximum number of waypoints before forcing an exit
      maxFlightTime: 100, // Maximum flight time (in seconds) before forcing an exit
      ...options
    };
    
    this.nextHelicopterId = 1;
    this.spawnInterval = null;
    this.updateInterval = null;
    this._isDisposed = false;
  }
  
  // Start spawning helicopters and monitoring their status
  start(spawnInterval = 4000) {
    // Clear any existing intervals first to prevent duplicates
    this.stop();
    
    this.spawnInterval = setInterval(() => {
      if (this._isDisposed) {
        this.stop();
        return;
      }
      
      if (this.helicopters.size < this.options.maxHelicopters) {
        this.spawnHelicopter();
      }
    }, spawnInterval);
    
    // Add an update loop to check for helicopters that have reached their exit point
    this.updateInterval = setInterval(() => {
      if (this._isDisposed) {
        this.stop();
        return;
      }
      
      const currentTime = Date.now();
      
      for (const [helicopterId, helicopter] of this.helicopters.entries()) {
        // Check if helicopter has reached an exit point
        const position = this.getHelicopterPositionAtTime(helicopterId, currentTime);
        
        if (position && position.isExitPoint) {
          // Remove this helicopter and spawn a new one
          this.removeHelicopter(helicopterId);
          this.spawnHelicopter();
        }
      }
    }, 1000); // Check every second
  }
  
  // Stop spawning helicopters
  stop() {
    if (this.spawnInterval) {
      clearInterval(this.spawnInterval);
      this.spawnInterval = null;
    }
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }
  
  // Filter the flight path to reduce data points for client
  filterFlightPath(flightPath) {
    if (!flightPath || flightPath.length === 0) return [];
    
    const factor = this.options.clientDataReductionFactor;
    const filtered = [flightPath[0]]; // Always include the first point
    
    // Include every nth point, and always include exit points
    for (let i = 1; i < flightPath.length - 1; i++) {
      if (i % factor === 0 || flightPath[i].isExitPoint) {
        filtered.push(flightPath[i]);
      }
    }
    
    // Always include the last point
    if (flightPath.length > 1) {
      filtered.push(flightPath[flightPath.length - 1]);
    }
    
    return filtered;
  }
  
  // Spawn a new helicopter with pre-calculated flight path
  spawnHelicopter() {
    if (this._isDisposed) return null;
    
    const helicopterId = this.nextHelicopterId++;
    const spawnPoint = this.generateRandomSpawnPoint();
    
    // Calculate full flight path for accurate server-side calculations
    const flightPath = this.calculateFlightPath(
      spawnPoint, 
      this.options.simAheadTime
    );
    
    // Filter flight path for client transmission
    const filteredFlightPath = this.filterFlightPath(flightPath);
    
    const spawnTime = Date.now();
    
    // Store helicopter data with both full and filtered paths
    this.helicopters.set(helicopterId, {
      id: helicopterId,
      spawnTime: spawnTime,
      spawnPoint,
      flightPath, // Full path for server calculations
      filteredFlightPath, // Reduced path for clients
      health: this.options.baseHealth, // Initialize with full health
      damaged: false // Track if helicopter has been damaged
    });
    
    // Send spawn event to clients with filtered path
    this.io.to(this.gameId).emit('spawnHelicopter', {
      id: helicopterId,
      spawnTime: spawnTime,
      spawnPoint,
      flightPath: filteredFlightPath // Send reduced data to clients
    });
    
    return helicopterId;
  }
  
  // Generate a random spawn point 1000 units outside the map edge at fixed height
  generateRandomSpawnPoint() {
    const halfMapSize = this.options.mapSize / 2;
    const spawnDistance = this.options.spawnDistance;
    const fixedHeight = this.options.fixedHeight;
    let x, z;
    
    // Randomly choose which edge to spawn on
    const edge = Math.floor(Math.random() * 4);
    
    switch (edge) {
      case 0: // North edge
        x = Math.random() * this.options.mapSize - halfMapSize;
        z = -halfMapSize - spawnDistance;
        break;
      case 1: // East edge
        x = halfMapSize + spawnDistance;
        z = Math.random() * this.options.mapSize - halfMapSize;
        break;
      case 2: // South edge
        x = Math.random() * this.options.mapSize - halfMapSize;
        z = halfMapSize + spawnDistance;
        break;
      case 3: // West edge
        x = -halfMapSize - spawnDistance;
        z = Math.random() * this.options.mapSize - halfMapSize;
        break;
    }
    
    // Initial rotation - facing into the map
    let rotation;
    switch (edge) {
      case 0: rotation = Math.PI; break; // North edge, face south
      case 1: rotation = Math.PI * 1.5; break; // East edge, face west
      case 2: rotation = 0; break; // South edge, face north
      case 3: rotation = Math.PI * 0.5; break; // West edge, face east
    }
    
    return {
      position: { x, y: fixedHeight, z },
      rotation: { x: 0, y: rotation, z: 0 }
    };
  }
  
  // Generate an exit point 1000 units outside the map
  generateExitPoint() {
    const halfMapSize = this.options.mapSize / 2;
    const exitDistance = this.options.spawnDistance;
    const fixedHeight = this.options.fixedHeight;
    let x, z;
    
    // Randomly choose which edge to exit from
    const edge = Math.floor(Math.random() * 4);
    
    switch (edge) {
      case 0: // North edge
        x = Math.random() * this.options.mapSize - halfMapSize;
        z = -halfMapSize - exitDistance;
        break;
      case 1: // East edge
        x = halfMapSize + exitDistance;
        z = Math.random() * this.options.mapSize - halfMapSize;
        break;
      case 2: // South edge
        x = Math.random() * this.options.mapSize - halfMapSize;
        z = halfMapSize + exitDistance;
        break;
      case 3: // West edge
        x = -halfMapSize - exitDistance;
        z = Math.random() * this.options.mapSize - halfMapSize;
        break;
    }
    
    return { x, y: fixedHeight, z };
  }
  
  // Generate a random destination point within the map
  generateRandomDestination() {
    const halfMapSize = this.options.mapSize / 2;
    
    // Random position within map bounds
    const x = Math.random() * this.options.mapSize - halfMapSize;
    const z = Math.random() * this.options.mapSize - halfMapSize;
    
    // Get terrain height at destination point and add minimum height
    const terrainHeight = this.terrainManager.getHeightAtPosition(x, z);
    const y = terrainHeight + this.options.minHeight;
    
    return { x, y, z };
  }
  
  // Check if there's terrain ahead using a simulated raycast
  checkTerrainAhead(position, direction, distance) {
    const steps = 12; // Number of steps to check along the ray
    const stepSize = distance / steps;
    
    for (let i = 1; i <= steps; i++) {
      const checkDistance = stepSize * i;
      const checkX = position.x + direction.x * checkDistance;
      const checkZ = position.z + direction.z * checkDistance;
      
      // Make sure we're still within map bounds
      if (
        Math.abs(checkX) > this.options.mapSize / 2 ||
        Math.abs(checkZ) > this.options.mapSize / 2
      ) {
        continue;
      }
      
      const terrainHeight = this.terrainManager.getHeightAtPosition(checkX, checkZ);
      const projectedY = position.y - checkDistance * 0.1; // Slight downward projection
      
      // If our projected path would hit terrain
      if (projectedY < terrainHeight + this.options.minHeight * 0.5) {
        return {
          hit: true,
          distance: checkDistance,
          terrainHeight,
          position: { x: checkX, y: terrainHeight, z: checkZ }
        };
      }
    }
    
    return { hit: false };
  }
  
  // Calculate flight path for a given duration
  calculateFlightPath(startPoint, duration, options = {}) {
    if (this._isDisposed) return [];
    
    const path = [];
    let currentPosition = { ...startPoint.position };
    let currentRotation = { ...startPoint.rotation };
    let currentSpeed = this.options.maxSpeed;
    let targetDestination = this.generateRandomDestination(); // First waypoint inside map
    let currentTime = 0;
    let exitPointSet = false;
    let waypointCount = 0;
    
    // Get options from the constructor or override with passed values
    const maxWaypoints = options.maxWaypoints || 5; // Max waypoints before forcing exit
    const maxFlightTime = options.maxFlightTime || 45; // Max flight time before forcing exit
    const continueUntilExit = options.continueUntilExit || false; // Whether to continue until exit point is reached
    
    // Calculate initial distance to target
    let dirToTarget = {
      x: targetDestination.x - currentPosition.x,
      z: targetDestination.z - currentPosition.z
    };
    let distToTarget = Math.sqrt(
      dirToTarget.x * dirToTarget.x + dirToTarget.z * dirToTarget.z
    );
    
    // Calculate flight path at each time step
    while ((currentTime < duration || continueUntilExit) && (!exitPointSet || (exitPointSet && distToTarget > 50))) {
      // Direction to target
      const dirToTarget = {
        x: targetDestination.x - currentPosition.x,
        z: targetDestination.z - currentPosition.z
      };
      
      // Distance to target
      const distToTarget = Math.sqrt(
        dirToTarget.x * dirToTarget.x + dirToTarget.z * dirToTarget.z
      );
      
      // Normalize direction
      if (distToTarget > 0) {
        dirToTarget.x /= distToTarget;
        dirToTarget.z /= distToTarget;
      }
      
      // Calculate target rotation (yaw)
      const targetRotation = Math.atan2(dirToTarget.x, dirToTarget.z);
      
      // Adjust current rotation towards target rotation (with max yaw rate)
      let rotationDiff = targetRotation - currentRotation.y;
      
      // Fix rotation wraparound issues
      if (rotationDiff > Math.PI) rotationDiff -= Math.PI * 2;
      if (rotationDiff < -Math.PI) rotationDiff += Math.PI * 2;
      
      const rotationStep = Math.min(
        Math.abs(rotationDiff),
        this.options.maxYawRate * this.options.timeStep
      ) * Math.sign(rotationDiff);
      
      currentRotation.y += rotationStep;
      
      // Normalize rotation to [0, 2π]
      currentRotation.y = (currentRotation.y + Math.PI * 2) % (Math.PI * 2);
      
      // Calculate roll based on turning
      const targetRoll = -rotationStep * 4;
      const smoothingFactor = 0.1; // Adjust between 0 and 1 for smoothing speed
      currentRotation.z = currentRotation.z + (targetRoll - currentRotation.z) * smoothingFactor;
            
      // Calculate forward direction based on current rotation
      const forwardDir = {
        x: Math.sin(currentRotation.y),
        z: Math.cos(currentRotation.y)
      };
      
      // Check for terrain ahead
      const terrainCheck = this.checkTerrainAhead(
        currentPosition,
        forwardDir,
        this.options.raycastDistance
      );

      let targetHeight;

      // Adjust speed and height based on terrain check
      if (terrainCheck.hit) {
        // Reduce speed when obstacle detected
        currentSpeed *= 0.9;
        currentSpeed = Math.max(currentSpeed, this.options.minSpeed);
                
        // Set target height based on terrain hit plus minimum clearance
        targetHeight = terrainCheck.terrainHeight + this.options.minHeight * 1.5;
      } else {
        // Gradually return to normal speed
        currentSpeed = Math.min(
          currentSpeed + this.options.maxSpeed * 0.1 * this.options.timeStep,
          this.options.maxSpeed
        );
        
        // Set appropriate target height
        if (exitPointSet) {
          // If heading to exit, maintain fixed exit height
          targetHeight = this.options.fixedHeight;
        } else {
          // Otherwise, maintain minimum height above current terrain
          const terrainHeight = this.terrainManager.getHeightAtPosition(
            currentPosition.x,
            currentPosition.z
          );
          targetHeight = terrainHeight + this.options.minHeight;
        }
      }

      // Smooth lerp to target height regardless of case
      const heightLerpFactor = terrainCheck.hit ? 0.2 : 0.1; // Faster response when obstacle detected
      currentPosition.y += (targetHeight - currentPosition.y) * heightLerpFactor * this.options.timeStep;

      // Move forward
      currentPosition.x += forwardDir.x * currentSpeed * this.options.timeStep;
      currentPosition.z += forwardDir.z * currentSpeed * this.options.timeStep;

      // Check if we've reached our destination
      if (distToTarget < 30) {
        // If we've reached an exit point, we're done
        if (exitPointSet) {
          // Mark this as an exit point in the path
          path.push({
            time: currentTime,
            position: { ...currentPosition },
            rotation: { ...currentRotation },
            isExitPoint: true
          });
          break; // End the path calculation
        }
        
        // Increment waypoint counter
        waypointCount++;
        
        // Check multiple conditions for setting an exit point:
        // 1. Reached maximum number of waypoints
        // 2. Exceeded maximum flight time
        // 3. Less than N seconds left in simulation
        if (waypointCount >= maxWaypoints || 
            currentTime >= maxFlightTime || 
            duration - currentTime < 10) {
          // Set an exit point as the next destination
          targetDestination = this.generateExitPoint();
          exitPointSet = true;
        } else {
          // Set a new random destination within the map
          targetDestination = this.generateRandomDestination();
        }
      }
      
      // Add current state to path
      path.push({
        time: currentTime,
        position: { ...currentPosition },
        rotation: { ...currentRotation },
        isExitPoint: false
      });
      
      // Increment time
      currentTime += this.options.timeStep;
    }
    
    return path;
  }
  
  // Get helicopter position at a specific time (for collision detection)
  getHelicopterPositionAtTime(helicopterId, time) {
    if (this._isDisposed) return null;
    
    const helicopter = this.helicopters.get(helicopterId);
    if (!helicopter) return null;
    
    const timeSinceSpawn = (time - helicopter.spawnTime) / 1000; // Convert to seconds

    if (timeSinceSpawn < 0) return null;
    
    // Find the appropriate path segment for the requested time
    const pathIndex = Math.floor(timeSinceSpawn / this.options.timeStep);
    
    if (pathIndex >= helicopter.flightPath.length) {
      // If we're requesting a time beyond what we've calculated,
      // we need to extend the flight path
      const lastPoint = helicopter.flightPath[helicopter.flightPath.length - 1];
      
      // If the last point was an exit point, return it with the flag
      if (lastPoint.isExitPoint) {
        return {
          position: { ...lastPoint.position },
          rotation: { ...lastPoint.rotation },
          isExitPoint: true
        };
      }
      
      const startPoint = {
        position: lastPoint.position,
        rotation: lastPoint.rotation
      };
      
      // Extend the path, but with the continueUntilExit flag set to true
      // This ensures the helicopter will continue until it reaches an exit point
      const pathExtension = this.calculateFlightPath(startPoint, this.options.simAheadTime / 2, {
        continueUntilExit: true
      });
      
      // Adjust the timestamps in the extension
      const lastTime = lastPoint.time;
      for (const point of pathExtension) {
        point.time += lastTime;
      }
      
      // Remove the duplicate first point
      pathExtension.shift();
      
      // Append the extension to the flight path
      helicopter.flightPath = helicopter.flightPath.concat(pathExtension);
      
      // Update the filtered flight path as well
      helicopter.filteredFlightPath = this.filterFlightPath(helicopter.flightPath);
      
      // Now we can try again
      return this.getHelicopterPositionAtTime(helicopterId, time);
    }
    
    // Interpolate between path points if necessary
    if (pathIndex < helicopter.flightPath.length - 1) {
      const point1 = helicopter.flightPath[pathIndex];
      const point2 = helicopter.flightPath[pathIndex + 1];
      
      const t = (timeSinceSpawn - point1.time) / (point2.time - point1.time);
      
      return {
        position: {
          x: point1.position.x + (point2.position.x - point1.position.x) * t,
          y: point1.position.y + (point2.position.y - point1.position.y) * t,
          z: point1.position.z + (point2.position.z - point1.position.z) * t
        },
        rotation: {
          x: point1.rotation.x + (point2.rotation.x - point1.rotation.x) * t,
          y: point1.rotation.y + (point2.rotation.y - point1.rotation.y) * t,
          z: point1.rotation.z + (point2.rotation.z - point1.rotation.z) * t
        },
        isExitPoint: point1.isExitPoint || point2.isExitPoint
      };
    }
    
    // Fall back to the last calculated point if we're at the end of the path
    const lastPoint = helicopter.flightPath[helicopter.flightPath.length - 1];
    return {
      position: { ...lastPoint.position },
      rotation: { ...lastPoint.rotation },
      isExitPoint: lastPoint.isExitPoint
    };
  }
  
  // Get information about all currently active helicopters
  getAllHelicopters() {
    if (this._isDisposed) return [];
    
    const currentTime = Date.now();
    const helicoptersData = [];
    
    for (const [helicopterId, helicopter] of this.helicopters.entries()) {
      const elapsedTimeMs = currentTime - helicopter.spawnTime;
      
      helicoptersData.push({
        id: helicopterId,
        spawnTime: helicopter.spawnTime,
        currentTime: currentTime,
        elapsedTime: elapsedTimeMs,
        spawnPoint: helicopter.spawnPoint,
        flightPath: helicopter.filteredFlightPath, // Send reduced data to clients
        health: helicopter.health,
        damaged: helicopter.damaged
      });
    }
    
    return helicoptersData;
  }
  
  // Send all active helicopter information to a specific client
  sendHelicoptersToClient(clientId) {
    if (this._isDisposed) return;
    
    const helicoptersData = this.getAllHelicopters();
    
    if (helicoptersData.length > 0) {
      this.io.to(this.gameId).emit('existingHelicopters', {
        serverTime: Date.now(),
        helicopters: helicoptersData
      });
    }
  }
  
  // Apply damage to a helicopter
  applyDamageToHelicopter(helicopterId, damage) {
    if (this._isDisposed) return null;
    
    const helicopter = this.helicopters.get(helicopterId);
    if (!helicopter) return null;
    
    helicopter.health = Math.max(0, helicopter.health - damage);
    helicopter.damaged = true;
    
    // Emit helicopter damaged event
    this.io.to(this.gameId).emit('helicopterDamaged', {
      id: helicopterId,
      health: helicopter.health
    });
    
    // Return the current health
    return {
      health: helicopter.health,
      isDestroyed: helicopter.health <= 0
    };
  }
  
  // Get the helicopter normal vector for bounce calculations (simplified approach)
  getHelicopterNormal(helicopterId, impactPos) {
    if (this._isDisposed) return { x: 0, y: 1, z: 0 };
    
    const helicopter = this.helicopters.get(helicopterId);
    if (!helicopter) return { x: 0, y: 1, z: 0 }; // Default up vector
    
    // Get helicopter position and orientation at current time
    const helicopterState = this.getHelicopterPositionAtTime(helicopterId, Date.now());
    if (!helicopterState) return { x: 0, y: 1, z: 0 };
    
    // Calculate a simple normal based on position relative to the helicopter center
    const dx = impactPos.x - helicopterState.position.x;
    const dy = impactPos.y - helicopterState.position.y;
    const dz = impactPos.z - helicopterState.position.z;
    
    // Normalize the vector
    const length = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (length === 0) return { x: 0, y: 1, z: 0 };
    
    return {
      x: dx / length,
      y: dy / length,
      z: dz / length
    };
  }
      
  // Remove a helicopter and clean up its resources
  removeHelicopter(helicopterId) {
    if (this._isDisposed) return;
    
    if (this.helicopters.has(helicopterId)) {
      // Get the helicopter data before deleting
      const helicopter = this.helicopters.get(helicopterId);
      
      // Clear flight path to release memory
      if (helicopter.flightPath) {
        helicopter.flightPath.length = 0;
      }
      
      if (helicopter.filteredFlightPath) {
        helicopter.filteredFlightPath.length = 0;
      }
      
      // Delete all object properties to help garbage collection
      for (const key in helicopter) {
        if (typeof helicopter[key] === 'object' && helicopter[key] !== null) {
          // Clear nested objects
          for (const nestedKey in helicopter[key]) {
            helicopter[key][nestedKey] = null;
          }
        }
        helicopter[key] = null;
      }
      
      // Remove from map
      this.helicopters.delete(helicopterId);
      
      // Notify clients
      this.io.to(this.gameId).emit('removeHelicopter', { id: helicopterId });
    }
  }
  
  // Clean up all resources
  dispose() {
    if (this._isDisposed) return;
    
    // Mark as disposed to prevent any new operations
    this._isDisposed = true;
    
    // Stop all timers
    this.stop();
    
    // Remove all helicopters
    for (const helicopterId of this.helicopters.keys()) {
      this.removeHelicopter(helicopterId);
    }
    
    // Clear the helicopters map
    this.helicopters.clear();
    
    // Notify clients that the manager is being disposed
    if (this.io && this.gameId) {
      this.io.to(this.gameId).emit('helicopterManagerDisposed', { gameId: this.gameId });
    }
    
    // Clear references to external objects
    this.io = null;
    this.terrainManager = null;
    this.gameId = null;
    this.options = null;
  }

}

export { HelicopterManager };
