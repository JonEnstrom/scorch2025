// Updated BouncingBettyWeapon.js with normal-based bouncing
import { v4 as uuidv4 } from 'uuid';
import * as THREE from 'three';

export class BouncingBettyWeapon {
  constructor(projectileManager) {
    this.projectileManager = projectileManager;
    this.id = uuidv4();
    this.weaponCode = 'BB01';
    
    this.maxBounces = 4;
    this.spreadVariance = 0.2; // Reduced for more predictable bounces
    this.powerRetention = 0.8;
    this.bounciness = 0.85; // Coefficient of restitution (0-1)
    
    // Physics settings
    this.timeFactor = 0.9;
    this.bounceTimeFactor = 0.8; 
    
    // Upward bias to ensure projectiles don't just roll along the ground
    this.upwardBias = 0.3; // Amount to bias the bounce upward
    
    // Minimum vertical velocity component after bounce
    this.minVerticalVelocity = 0.4;

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

    // Check if we have normal data, if not use default values
    const hasNormalData = impactData.surfaceNormal && impactData.incomingDirection;
    
    // Create default values if needed
    const incomingDirection = hasNormalData ? 
      impactData.incomingDirection : 
      { x: 0, y: -1, z: 0 }; // Default to straight down
      
    const surfaceNormal = hasNormalData ? 
      impactData.surfaceNormal : 
      { x: 0, y: 1, z: 0 };  // Default to straight up
    
    // Create next bounce projectile using surface normal
    const nextBounce = this.createBounceProjectile(
      impactData.position,
      impactData.playerId,
      currentBounce + 1,
      200,  // Base power
      incomingDirection,
      surfaceNormal
    );
    
    const spawnTime = impactData.time;

    // Let the manager do a sub-simulation and merge events
    manager.simulateSubProjectile(nextBounce, spawnTime, timeline);
  }

  createBounceProjectile(position, playerId, bounceCount, parentPower, incomingDir, surfaceNormal) {
    // Convert direction and normal to THREE.Vector3
    const incDir = new THREE.Vector3(incomingDir.x, incomingDir.y, incomingDir.z);
    const normal = new THREE.Vector3(surfaceNormal.x, surfaceNormal.y, surfaceNormal.z);
    
    // Calculate reflection using physics formula: R = V - 2(V·N)N
    const dot = incDir.dot(normal);
    const bounceDir = new THREE.Vector3().copy(incDir).sub(
      normal.clone().multiplyScalar(2 * dot)
    );
    
    // Apply bounciness (energy retention)
    bounceDir.normalize().multiplyScalar(this.bounciness);
    
    // Add upward bias to prevent rolling along the ground
    bounceDir.y += this.upwardBias * (1 + bounceCount * 0.1); // Increase upward bias with each bounce
    
    // Ensure minimum vertical component
    if (bounceDir.y < this.minVerticalVelocity) {
      bounceDir.y = this.minVerticalVelocity;
      bounceDir.normalize();
    }

    // Add random variance (reduced with each bounce for more predictable late bounces)
    const varianceFactor = Math.max(0, this.spreadVariance - (bounceCount * 0.05));
    
    // Add spread in random direction perpendicular to bounce
    const rightVector = new THREE.Vector3(0, 1, 0).cross(bounceDir).normalize();
    const upVector = new THREE.Vector3().crossVectors(bounceDir, rightVector).normalize();
    
    // Apply random spread in right and up directions
    const rightSpread = (Math.random() - 0.5) * 2 * varianceFactor;
    const upSpread = (Math.random() - 0.5) * 2 * varianceFactor;
    
    bounceDir.add(
      rightVector.multiplyScalar(rightSpread)
    ).add(
      upVector.multiplyScalar(upSpread)
    );
    
    // Normalize direction vector
    bounceDir.normalize();

    // Calculate power retention that decreases with each bounce
    const bouncePower = parentPower * Math.pow(this.powerRetention, bounceCount);

    // Calculate a time factor that decreases with each bounce
    const bounceTimeFact = this.bounceTimeFactor * Math.pow(0.95, bounceCount);
    
    return {
      playerId,
      weaponId: this.id,
      weaponCode: this.weaponCode,
      startPos: new THREE.Vector3(
        position.x, 
        position.y + 2.0, // Start slightly above impact to avoid immediate re-collision
        position.z
      ), 
      direction: bounceDir,
      power: bouncePower,
      isFinalProjectile: (bounceCount === this.maxBounces),
      explosionType: 'normal',
      explosionSize: 2,
      projectileScale: Math.max(1.0 - (bounceCount * 0.1), 0.25),
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