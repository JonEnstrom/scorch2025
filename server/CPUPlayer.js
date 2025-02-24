import Player from './Player.js';
import * as THREE from 'three';

export default class CPUPlayer extends Player {
  constructor(x, y, z) {
    super(x, y, z);
    this.isCPU = true;
    this.isReady = true;
    this.minPower = 100;
    this.maxPower = 700;
    this.minPitch = -90;
    this.maxPitch = 10;
    this.turnTimeouts = new Set(); // Track active timeouts
    this.hasFired = false; // Track if we've fired this turn
    
    // AI difficulty settings
    this.perfectAim = true; // Always hit target
    this.maxIterations = 20; // Increase iterations for better accuracy
  }

  // Clear all pending timeouts
  clearTurnTimeouts() {
    this.turnTimeouts.forEach(timeout => clearTimeout(timeout));
    this.turnTimeouts.clear();
    this.hasFired = false;
  }

  // Helper to safely add timeout
  addTimeout(callback, delay) {
    if (this.hasFired) return null; // Don't schedule new actions if we've already fired
    const timeout = setTimeout(() => {
      this.turnTimeouts.delete(timeout);
      callback();
    }, delay);
    this.turnTimeouts.add(timeout);
    return timeout;
  }

  autoReady(gameInstance, userId) {
    this.isReady = true;
    gameInstance.setPlayerReadyStatus(userId, true);
  }

  selectTarget(players, selfId) {
    const validTargets = Object.entries(players).filter(([id, player]) => 
      id !== selfId && 
      player.isAlive && 
      player.health > 0 && 
      !player.isSpectator
    );
    
    if (validTargets.length === 0) return null;
    
    // Instead of random selection, prioritize players with lower health
    validTargets.sort((a, b) => a[1].health - b[1].health);
    const [targetId, targetPlayer] = validTargets[0];
    
    return { targetId, targetPlayer };
  }

  simulateProjectile(startPos, direction, power, gameInstance) {
    // Construct the initial projectile data object.
    const projectilesData = [{
      startPos: startPos.clone(),
      direction: direction.clone(),
      power: power,
      isFinalProjectile: true,
      bounceCount: 0,
      doesCollide: true,
      craterSize: 20,
      aoeSize: 50,
      baseDamage: 50,
      explosionSize: 1,
      explosionType: 'normal',
      projectileStyle: 'missile',
      projectileScale: 1,
      theme: gameInstance.theme || 'default',
    }];
  
    // We'll assume "BW01" for basic weapon code, or whichever you're testing
    const weaponId = 'BasicWeapon';
    const weaponCode = 'BW01';
  
    // Pre-simulate the entire flight.  This returns an array of timeline events.
    const timelineEvents = gameInstance.projectileManager.simulateProjectiles(
      this.id,
      projectilesData,
      weaponId, 
      weaponCode
    );
  
    // Find the first impact event if it exists
    const impactEvent = timelineEvents.find(evt => evt.type === 'projectileImpact');
    if (!impactEvent) {
      return null;
    }
  
    // If we have an impact, we can see exactly where it hit terrain
    const impactPos = new THREE.Vector3(
      impactEvent.position.x,
      impactEvent.position.y,
      impactEvent.position.z
    );
  
    return {
      position: impactPos,
      time: impactEvent.time,
      isHelicopterHit: impactEvent.isHelicopterHit || false,
    };
  }
  
  calculateFiringSolution(target, gameInstance) {
    const myPos = this.getPosition();
    const targetPos = target.getPosition();
    
    // Base solution with direct line to target for yaw
    const dx = targetPos.x - myPos.x;
    const dz = targetPos.z - myPos.z;
    const yaw = (Math.atan2(dx, dz) * 180 / Math.PI + 360) % 360;
    
    // For perfect aim, we'll use a binary search approach to find the right pitch and power
    let minPitch = this.minPitch;
    let maxPitch = this.maxPitch;
    let minPower = this.minPower;
    let maxPower = this.maxPower;
    
    let bestSolution = null;
    let bestDistance = Infinity;
    
    // Try more iterations for better accuracy
    for (let iteration = 0; iteration < this.maxIterations; iteration++) {
      // Try combinations of pitch and power
      for (let i = 0; i < 5; i++) {
        // Use weighted random within current bounds to focus on promising areas
        let pitch, power;
        
        if (bestSolution) {
          // Focus search around the best solution found so far
          pitch = bestSolution.pitch + (Math.random() - 0.5) * (maxPitch - minPitch) * 0.5;
          power = bestSolution.power + (Math.random() - 0.5) * (maxPower - minPower) * 0.5;
          
          // Keep within bounds
          pitch = Math.max(minPitch, Math.min(maxPitch, pitch));
          power = Math.max(minPower, Math.min(maxPower, power));
        } else {
          // Initial wider search
          pitch = minPitch + Math.random() * (maxPitch - minPitch);
          power = minPower + Math.random() * (maxPower - minPower);
        }
        
        // Build direction Vector3
        const direction = new THREE.Vector3(0, 0, 1);
        const euler = new THREE.Euler(
          THREE.MathUtils.degToRad(pitch),
          THREE.MathUtils.degToRad(yaw),
          0,
          'YXZ'
        );
        direction.applyEuler(euler);
        
        // Simulate projectile
        const collision = this.simulateProjectile(
          this.getBarrelTip(),
          direction,
          power,
          gameInstance
        );
        
        // If we got an impact, measure how close it is to target
        if (collision && collision.position) {
          const hitPos = collision.position;
          const distanceToTarget = hitPos.distanceTo(targetPos);
          
          // If this is the best solution so far, save it
          if (distanceToTarget < bestDistance) {
            bestDistance = distanceToTarget;
            bestSolution = {
              pitch,
              yaw,
              power,
              distance: distanceToTarget,
              collision
            };
            
            // If we're aiming for perfect hit and this is close enough, return immediately
            if (this.perfectAim && distanceToTarget < 10) {
              return bestSolution;
            }
          }
        }
      }
      
      // Narrow the search range around the best solution
      if (bestSolution) {
        const rangeFactor = 0.5;
        minPitch = Math.max(this.minPitch, bestSolution.pitch - (maxPitch - minPitch) * rangeFactor);
        maxPitch = Math.min(this.maxPitch, bestSolution.pitch + (maxPitch - minPitch) * rangeFactor);
        minPower = Math.max(this.minPower, bestSolution.power - (maxPower - minPower) * rangeFactor);
        maxPower = Math.min(this.maxPower, bestSolution.power + (maxPower - minPower) * rangeFactor);
      }
    }
    
    // If we found a solution, return it
    if (bestSolution) {
      return bestSolution;
    }
    
    // If all else fails, use a direct shot
    return {
      yaw,
      pitch: -45,
      power: 500
    };
  }
  
  getAvailableWeapons() {
    const weaponCodes = ['BW01', 'CW01', 'BB01', 'BR01', 'VW01', 'MM01', 'RF01', 'MS01', 'JB01', 'SP01'];
    return weaponCodes.filter(code => this.hasItem(code));
  }

  getAvailableItems() {
    const itemCodes = ['LA01', 'HA02', 'RK01', 'SB02', 'EF01'];
    return itemCodes.filter(code => this.hasItem(code));
  }

  // Random weapon selection
  selectRandomWeapon() {
    const availableWeapons = this.getAvailableWeapons();
    if (availableWeapons.length === 0) return null;
    
    // Simply return a random weapon from the available ones
    return availableWeapons[Math.floor(Math.random() * availableWeapons.length)];
  }

  simulateTurn(gameInstance, userId) {
    if (!gameInstance) {
      console.error('simulateTurn: gameInstance is undefined!');
      return;
    }

    // Clear any existing timeouts first
    this.clearTurnTimeouts();

    // Initial delay before starting turn
    this.addTimeout(() => {
      // Select target and calculate firing solution
      const target = this.selectTarget(
        gameInstance.playerManager.getPlayersObject(),
        userId
      );

      let solution;
      if (!target) {
        // No valid targets, just fire randomly
        solution = {
          yaw: Math.random() * 360,
          pitch: this.minPitch + Math.random() * (this.maxPitch - this.minPitch),
          power: this.minPower + Math.random() * (this.maxPower - this.minPower)
        };
      } else {
        // Calculate perfect firing solution
        solution = this.calculateFiringSolution(target.targetPlayer, gameInstance);
        if (!solution) {
          solution = {
            yaw: Math.random() * 360,
            pitch: -45,
            power: 500
          };
        }
      }

      // Use strategic items when appropriate
      let selectedItem = null;
      const availableItems = this.getAvailableItems();
      if (availableItems.length > 0 && Math.random() < 0.5) { // Increased chance to use items
        selectedItem = availableItems[Math.floor(Math.random() * availableItems.length)];
        
        // First notify about item selection
        this.addTimeout(() => {
          // Call processItemChange directly since we're on the server
          gameInstance.playerManager.processItemChange(userId, selectedItem);
          // Then broadcast to clients
          gameInstance.io.to(gameInstance.gameId).emit('itemSelected', userId, selectedItem);
        }, 1000);

        // Then use the item after a delay
        this.addTimeout(() => {
          gameInstance.processPlayerInput(userId, { 
            action: 'use', 
            itemCode: selectedItem 
          });
        }, 2000);
      }

      // Select a random weapon
      let selectedWeapon = this.selectRandomWeapon();

      // Select and notify about weapon choice
      this.addTimeout(() => {
        if (selectedWeapon) {
          // Call processWeaponChange directly since we're on the server
          gameInstance.playerManager.processWeaponChange(userId, selectedWeapon);
          // Then broadcast to clients
          gameInstance.io.to(gameInstance.gameId).emit('weaponSelected', userId, selectedWeapon);
        }
      }, 3000);

      // Set initial turret yaw
      this.addTimeout(() => {
        gameInstance.processPlayerInput(userId, { 
          action: 'setTurretYaw', 
          value: solution.yaw 
        });
      }, 4000);

      // Set turret pitch after a delay
      this.addTimeout(() => {
        gameInstance.processPlayerInput(userId, { 
          action: 'setTurretPitch', 
          value: solution.pitch 
        });
      }, 5000);

      // Set power after another delay
      this.addTimeout(() => {
        gameInstance.processPlayerInput(userId, { 
          action: 'setPower', 
          value: solution.power 
        });
      }, 6000);

      // Fire the weapon after all adjustments
      this.addTimeout(() => {
        if (this.hasFired) return; // Double check we haven't fired yet
        
        if (selectedWeapon) {
          this.hasFired = true; // Mark that we've fired
          gameInstance.processPlayerInput(userId, { 
            action: 'fire', 
            weaponCode: selectedWeapon 
          });
        }
      }, 7000);

    }, 1000 + (Math.random() * 1000)); // Initial random delay
  }
}