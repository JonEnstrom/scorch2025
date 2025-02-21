import Player from './Player.js';
import { Projectile } from './Projectile.js';
import * as THREE from 'three';

export default class CPUPlayer extends Player {
  constructor(x, y, z) {
    super(x, y, z);
    this.isCPU = true;
    this.isReady = true;
    this.minPower = 100;
    this.maxPower = 1000;
    this.minPitch = -90;
    this.maxPitch = 10;
    this.turnTimeouts = new Set(); // Track active timeouts
    this.hasFired = false; // Track if we've fired this turn
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
    
    const [targetId, targetPlayer] = validTargets[
      Math.floor(Math.random() * validTargets.length)
    ];
    
    return { targetId, targetPlayer };
  }

  simulateProjectile(startPos, direction, power, gameInstance) {
    const projectile = new Projectile(
      startPos,
      direction,
      power,
      'simulation',
      gameInstance.theme
    );

    let time = 0;
    const timeStep = 0.016;
    const maxTime = 10;
    
    while (time < maxTime) {
      const collision = projectile.update(
        timeStep, 
        gameInstance.terrainManager,
        gameInstance.playerManager.getPlayersObject()
      );
      
      if (collision) {
        return collision;
      }
      
      time += timeStep;
    }
    
    return null;
  }

  calculateFiringSolution(target, gameInstance) {
    const myPos = this.getPosition();
    const targetPos = target.getPosition();
    
    const numTests = 10;
    const solutions = [];
    
    for (let i = 0; i < numTests; i++) {
      const pitch = this.minPitch + (Math.random() * (this.maxPitch - this.minPitch));
      const power = this.minPower + (Math.random() * (this.maxPower - this.minPower));
      
      const dx = targetPos.x - myPos.x;
      const dz = targetPos.z - myPos.z;
      const yaw = (Math.atan2(dx, dz) * 180 / Math.PI + 360) % 360;
      
      const direction = new THREE.Vector3(0, 0, 1);
      const euler = new THREE.Euler(
        THREE.MathUtils.degToRad(pitch),
        THREE.MathUtils.degToRad(yaw),
        0,
        'YXZ'
      );
      direction.applyEuler(euler);
      
      const collision = this.simulateProjectile(
        this.getBarrelTip(),
        direction,
        power,
        gameInstance
      );
      
      if (collision) {
        const hitPos = new THREE.Vector3(
          collision.position.x,
          collision.position.y,
          collision.position.z
        );
        const distanceToTarget = hitPos.distanceTo(targetPos);
        
        solutions.push({
          pitch,
          yaw,
          power,
          distance: distanceToTarget,
          collision
        });
      }
    }
    
    if (solutions.length > 0) {
      solutions.sort((a, b) => a.distance - b.distance);
      return solutions[0];
    }
    
    return null;
  }

  getAvailableWeapons() {
    const weaponCodes = ['BW01', 'CW01', 'BB01', 'BR01', 'VW01', 'MM01', 'RF01', 'MS01'];
    return weaponCodes.filter(code => this.hasItem(code));
  }

  getAvailableItems() {
    const itemCodes = ['LA01', 'HA02', 'RK01', 'SB02', 'EF01'];
    return itemCodes.filter(code => this.hasItem(code));
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
        solution = {
          yaw: Math.random() * 360,
          pitch: this.minPitch + Math.random() * (this.maxPitch - this.minPitch),
          power: this.minPower + Math.random() * (this.maxPower - this.minPower)
        };
      } else {
        solution = this.calculateFiringSolution(target.targetPlayer, gameInstance);
        if (!solution) {
          solution = {
            yaw: Math.random() * 360,
            pitch: -45,
            power: 500
          };
        }
      }

      // Pre-select item if we're going to use one
      let selectedItem = null;
      const availableItems = this.getAvailableItems();
      if (availableItems.length > 0 && Math.random() < 0.3) {
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

      // Pre-select weapon
      const availableWeapons = this.getAvailableWeapons();
      let selectedWeapon = null;
      if (availableWeapons.length > 0) {
        selectedWeapon = availableWeapons[Math.floor(Math.random() * availableWeapons.length)];
      }

      // Select and notify about weapon choice first
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