// Updated BouncingBettyWeapon.js with time-based physics and more upward trajectory
import { v4 as uuidv4 } from 'uuid';
import * as THREE from 'three';

export class BouncingBettyWeapon {
  constructor(projectileManager) {
    this.projectileManager = projectileManager;
    this.id = uuidv4();
    this.weaponCode = 'BB01';
    
    this.maxBounces = 4;
    // Increased bounce angle for more upward trajectory (from PI/2 to 2PI/3)
    this.bounceAngle = (2 * Math.PI) / 3;
    this.spreadVariance = 0.4;
    this.powerRetention = 0.8;
    
    // Physics settings - faster projectile (0.5 = twice as fast)
    this.timeFactor = 0.9;
    this.bounceTimeFactor = 0.3; 
    
    // Minimum upward component to ensure strong upward trajectory
    this.minUpwardComponent = 0.7;

    // The "carrier" direction is stored at fire time
    this.baseFireDirection = null;

    // Register the weapon's logic
    projectileManager.registerWeaponHandler(
      this.id,
      (impactData, timeline, manager) => this.handleImpact(impactData, timeline, manager)
    );
  }

  fire(tank, playerId, gameCore) {
    this.baseFireDirection = tank.getFireDirection();
    const projectileData = [{
      startPos: tank.getBarrelTip(),
      direction: this.baseFireDirection,
      power: tank.power,
      isFinalProjectile: false,
      explosionType: 'normal',
      explosionSize: 2,
      projectileScale: 1,
      projectileStyle: 'missile',
      bounceCount: 0,
      craterSize: 50,
      
      // Faster travel time with same trajectory
      timeFactor: this.timeFactor,
      gravity: -300 // Standard gravity
    }];
  
    // 1) Precompute the flight
    const timeline = this.projectileManager.simulateProjectiles(
      playerId,
      projectileData,
      this.id,
      this.weaponCode
    );
  
    // 2) Broadcast to clients
    this.projectileManager.io
      .to(this.projectileManager.gameId)
      .emit('fullProjectileTimeline', timeline);

    this.projectileManager.scheduleTimeline(timeline, Date.now(), gameCore);
  
    // 3) Find the last event time in the timeline
    const finalEventTime = timeline.length
      ? Math.max(...timeline.map(ev => ev.time))
      : 0;
  
    // 4) Add your usual turn-change delay
    const totalDelay = finalEventTime + gameCore.turnChangeDelay;
  
    // 5) Schedule the actual turn change
    setTimeout(async () => {
      // e.g. check if round is over, otherwise advance turn
      if (!(await gameCore.roundManager.checkRoundOver())) {
        gameCore.playerManager.advanceTurn();
        gameCore.playerManager.currentPlayer =
          gameCore.playerManager.turnManager.getCurrentPlayerId();
        gameCore.playerManager.currentPlayerHasFired = false;
      }
    }, totalDelay);
  }

  handleImpact(impactData, timeline, manager) {
    // If we already used up max bounces, or it was a direct helicopter hit, do nothing
    if (impactData.isHelicopterHit) return;
    
    const currentBounce = impactData.bounceCount || 0;
    if (currentBounce >= this.maxBounces) {
      return;
    }

    // Create next bounce projectile data
    const nextBounce = this.createBounceProjectile(
      impactData.position,
      impactData.playerId,
      currentBounce + 1,
      200  // or if you stored the parent's power in a custom field
    );
    
    const spawnTime = impactData.time;

    // Let the manager do a sub-simulation and merge events
    manager.simulateSubProjectile(nextBounce, spawnTime, timeline);
  }

  createBounceProjectile(position, playerId, bounceCount, parentPower) {
    // Start with a new direction that has strong upward component
    const bounceDir = new THREE.Vector3();
    
    // Use horizontal component from original direction but reduced
    if (this.baseFireDirection) {
      // Copy x and z components (horizontal) from base direction, but scaled down
      bounceDir.x = this.baseFireDirection.x * 0.6; 
      bounceDir.z = this.baseFireDirection.z * 0.6;
    } else {
      // Generate a random horizontal direction if no base direction exists
      const randomAngle = Math.random() * Math.PI * 2;
      bounceDir.x = Math.cos(randomAngle) * 0.3; // Reduced horizontal component
      bounceDir.z = Math.sin(randomAngle) * 0.3;
    }

    // Set strong upward component - increases with each bounce
    const upwardComponent = Math.max(
      this.minUpwardComponent + (bounceCount * 0.05),  // Increase upward trajectory with each bounce
      Math.sin(this.bounceAngle)
    );
    bounceDir.y = upwardComponent;

    // Add random side variance
    const rightVector = new THREE.Vector3(0, 1, 0).cross(bounceDir).normalize();
    const sideVariance = (Math.random() - 0.5) * 2 * this.spreadVariance;
    bounceDir.add(rightVector.multiplyScalar(sideVariance));

    // Small rotation around vertical axis
    const rotationAngle = (Math.random() - 0.5) * this.spreadVariance;
    bounceDir.applyAxisAngle(new THREE.Vector3(0, 1, 0), rotationAngle);

    // Normalize direction vector
    bounceDir.normalize();

    // Increase power for higher bounces
    const powerMultiplier = 1 + (bounceCount * 0.1); // Power increases with each bounce
    const bouncePower = parentPower * Math.pow(this.powerRetention, bounceCount) * powerMultiplier;

    // Calculate a time factor that decreases with each bounce
    // But still keeps bounces faster than normal
    const bounceTimeFact = this.bounceTimeFactor * Math.pow(0.95, bounceCount);
    
    return {
      playerId,
      weaponId: this.id,
      weaponCode: this.weaponCode,
      startPos: new THREE.Vector3(position.x, position.y + 3.0, position.z), // Start much higher to clear recently deformed terrain
      direction: bounceDir,
      power: bouncePower,
      isFinalProjectile: (bounceCount === this.maxBounces),
      explosionType: 'normal',
      explosionSize: 2,
      projectileScale: Math.max(1.0 - (bounceCount * 0.2), 0.25),
      projectileStyle: 'missile',
      bounceCount,
      craterSize: 50,
      baseDamage: 50,
      
      // Custom physics for the bounce
      timeFactor: bounceTimeFact,
      gravity: -280 // Slightly reduced gravity for higher arcs
    };
  }

  destroy() {
    this.projectileManager.weaponHandlers.delete(this.id);
  }
}