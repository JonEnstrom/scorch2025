import { v4 as uuidv4 } from 'uuid';
import * as THREE from 'three';

export class BouncingRabbitWeapon {
  constructor(projectileManager) {
    this.projectileManager = projectileManager;
    this.id = uuidv4();
    this.weaponCode = 'BR01';
    
    this.maxBounces = 4;
    this.spreadVariance = 0.6; // Slightly reduced for more predictable bounces
    this.powerRetention = 0.8;
    this.bounciness = 0.85; // Coefficient of restitution (0-1)
    
    // Physics settings
    this.upwardBias = 0.4; // Amount to bias the bounce upward
    this.minVerticalVelocity = 0.5; // Minimum vertical component after bounce
    
    this.baseFireDirection = null;
    this.maxTotalProjectiles = 27; // 3^3 splits
    this.currentProjectileCount = 0;

    // Register a weapon handler that receives (impactEvent, timeline, manager)
    this.projectileManager.registerWeaponHandler(
      this.id,
      (impactEvent, timeline, manager) => {
        this.handleImpact(impactEvent, timeline, manager);
      }
    );
  }

  /**
   * Fire is now where we:
   * 1) Simulate the entire flight of the initial projectile(s).
   * 2) Broadcast timeline.
   * 3) Find last event time and schedule turn change.
   */
  fire(tank, playerId, gameCore) {
    this.currentProjectileCount = 1;
    this.baseFireDirection = tank.getFireDirection();

    const projectileData = [{
      startPos: tank.getBarrelTip(),
      direction: this.baseFireDirection.clone(),
      power: tank.power,
      isFinalProjectile: false,
      explosionType: 'normal',
      explosionSize: 1,
      projectileScale: 3,
      projectileStyle: 'missile',
      bounceCount: 0,
      craterSize: 30,
      baseDamage: 40
    }];

    // 1) Precompute the entire flight
    const timeline = this.projectileManager.simulateProjectiles(
      playerId,
      projectileData,
      this.id, 
      this.weaponCode
    );

    // 2) Broadcast the resulting timeline to all clients
    this.projectileManager.io
      .to(this.projectileManager.gameId)
      .emit('fullProjectileTimeline', timeline);
      this.projectileManager.scheduleTimeline(timeline, Date.now(), gameCore);


    // 3) Calculate the final event time and schedule the turn change
    const finalEventTime = timeline.length
      ? Math.max(...timeline.map(e => e.time))
      : 0;

    const totalDelay = finalEventTime + gameCore.turnChangeDelay;

    setTimeout(async () => {
      // After the real-time delay, see if the round ended
      if (!(await gameCore.roundManager.checkRoundOver())) {
        // Otherwise advance to the next turn
        gameCore.playerManager.advanceTurn();
        gameCore.playerManager.currentPlayer =
          gameCore.playerManager.turnManager.getCurrentPlayerId();
        gameCore.playerManager.currentPlayerHasFired = false;
      }
    }, totalDelay);
  }

  /**
   * Handle an impact event from the projectile manager.
   * We check the bounce count, split the projectile if needed,
   * and spawn new sub-projectiles.
   */
  handleImpact(impactEvent, timeline, manager) {
    // If it's final or a helicopter hit, do nothing
    if (impactEvent.isFinalProjectile || impactEvent.isHelicopterHit) {
      return;
    }

    const currentBounce = impactEvent.bounceCount || 0;
    if (currentBounce >= this.maxBounces) {
      return;
    }

    // Calculate how many total projectiles if we split again
    const nextSplitCount = this.currentProjectileCount * 3;
    const isFinalSplit = nextSplitCount >= this.maxTotalProjectiles;

    // We'll default to 250 if no power is found in the event
    const parentPower = impactEvent.power || 250;
    
    // Check if we have normal data, if not use default values
    const hasNormalData = impactEvent.surfaceNormal && impactEvent.incomingDirection;
    
    // Create default values if needed
    const incomingDirection = hasNormalData ? 
      impactEvent.incomingDirection : 
      { x: 0, y: -1, z: 0 }; // Default to straight down
      
    const surfaceNormal = hasNormalData ? 
      impactEvent.surfaceNormal : 
      { x: 0, y: 1, z: 0 };  // Default to straight up

    // Create multiple sub-projectiles (splits) using the surface normal
    const nextProjectiles = [
      this.createBounceProjectile(
        impactEvent.position,
        impactEvent.playerId,
        currentBounce + 1,
        parentPower,
        incomingDirection,
        surfaceNormal,
        0.0, // No additional spread for center projectile
        false
      ),
      this.createBounceProjectile(
        impactEvent.position,
        impactEvent.playerId,
        currentBounce + 1,
        parentPower,
        incomingDirection,
        surfaceNormal,
        -0.8, // Left spread
        false
      ),
      this.createBounceProjectile(
        impactEvent.position,
        impactEvent.playerId,
        currentBounce + 1,
        parentPower,
        incomingDirection,
        surfaceNormal,
        0.8, // Right spread
        isFinalSplit
      )
    ];

    this.currentProjectileCount = nextSplitCount;

    // We spawn them slightly after the impact
    const spawnTime = impactEvent.time;

    for (const p of nextProjectiles) {
      // If final, we effectively stop further bounces
      // by removing the recognized weaponId.
      p.weaponId = isFinalSplit ? null : this.id;
      p.weaponCode = this.weaponCode;

      manager.simulateSubProjectile(p, spawnTime, timeline);
    }
  }

  /**
   * Create a bounce projectile using physics-based reflection
   */
  createBounceProjectile(position, playerId, bounceCount, parentPower, incomingDir, surfaceNormal, spreadFactor = 0, isFinal = false) {
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
    // We increase this bias for later bounces to create a more interesting pattern
    bounceDir.y += this.upwardBias * (1 + bounceCount * 0.15);
    
    // Ensure minimum vertical component
    if (bounceDir.y < this.minVerticalVelocity) {
      bounceDir.y = this.minVerticalVelocity;
      bounceDir.normalize();
    }

    // Add spread perpendicular to bounce direction
    // This creates the split projectile effect
    if (spreadFactor !== 0) {
      // Find perpendicular vector (cross product with up vector)
      const rightVector = new THREE.Vector3(0, 1, 0).cross(bounceDir).normalize();
      bounceDir.add(rightVector.multiplyScalar(spreadFactor * this.spreadVariance));
      
      // Add slight random variation
      const randomAngle = (Math.random() - 0.5) * 0.3; // Small random angle
      bounceDir.applyAxisAngle(new THREE.Vector3(0, 1, 0), randomAngle);
    }
    
    // Normalize direction vector
    bounceDir.normalize();

    // Degrade power with each bounce
    const bouncePower = parentPower * Math.pow(this.powerRetention, bounceCount);

    return {
      startPos: new THREE.Vector3(
        position.x,
        position.y + 2.0, // Start slightly higher to prevent immediate re-collision
        position.z
      ),
      timeFactor: 0.8,
      direction: bounceDir,
      power: bouncePower,
      isFinalProjectile: isFinal,
      explosionType: 'normal',
      explosionSize: bounceCount,
      projectileScale: Math.max(2.0 - (bounceCount * 0.2), 0.25),
      projectileStyle: 'missile',
      bounceCount: bounceCount,
      craterSize: 30,
      baseDamage: 20
    };
  }

  destroy() {
    this.projectileManager.weaponHandlers.delete(this.id);
  }
}