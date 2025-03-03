import { v4 as uuidv4 } from 'uuid';
import * as THREE from 'three';

export class PopcornWeapon {
  constructor(projectileManager) {
    this.projectileManager = projectileManager;
    this.id = uuidv4();
    this.weaponCode = 'PC01';

    // Weapon configuration
    this.maxBounces = 5;                // Maximum bounces per child projectile
    this.numChildren = 2;               // Number of child projectiles to spawn per impact
    this.bounceRadius = 15;             // Base radius for bounce spread
    this.radiusVariance = 0.8;          // Variance in bounce radius

    // Physics and timing settings
    this.baseTimeFactor = 1.0;          // Starting speed (slowest)
    this.minTimeFactor = 0.8;          // Minimum time factor (fastest)
    this.timeFactorReduction = 1.15;    // Speed up factor per bounce
    
    // Projectile appearance settings
    this.baseScale = 1.5;               // Starting size
    this.childScale = 1.2;              // Initial child projectile size
    this.scaleReduction = 0.85;         // Size reduction per bounce
    this.minScale = 0.6;                // Minimum projectile size
    
    // Damage and impact settings
    this.baseDamage = 28;               // Initial projectile damage
    this.childDamage = 28;              // Initial child projectile damage
    this.damageReduction = 0.8;         // Damage reduction per bounce
    this.minDamage = 8;                 // Minimum damage per hit
    this.craterSize = 15;               // Size of terrain deformation
    
    // Trajectory settings
    this.basePower = 150;               // Initial projectile power
    this.verticalBias = 1.7;            // How much to bias upward bounces
    this.gravity = -800;               // Gravity for trajectories

    // Register weapon handler
    projectileManager.registerWeaponHandler(
      this.id,
      (impactData, timeline, manager) => this.handleImpact(impactData, timeline, manager)
    );
  }

  fire(tank, playerId, gameCore) {
    const projectileData = [{
      startPos: tank.getBarrelTip(),
      direction: tank.getFireDirection(),
      power: tank.power,
      
      // Weapon identification
      weaponId: this.id,
      weaponCode: this.weaponCode,
      playerId: playerId,
      
      // Projectile state
      isFinalProjectile: false,
      bounceCount: 0,
      doesCollide: true,
      isParentProjectile: true,  // Mark as parent projectile
      
      // Physics properties
      gravity: -300,
      timeFactor: this.baseTimeFactor,
      minTimeFactor: this.baseTimeFactor,
      
      // Visual properties
      explosionType: 'normal',
      explosionSize: 1.3,
      projectileScale: this.baseScale,
      projectileStyle: 'missile',
      craterSize: this.craterSize,
      
      // Damage properties
      baseDamage: this.baseDamage
    }];

    // Simulate the parent projectile
    const timeline = this.projectileManager.simulateProjectiles(
      playerId,
      projectileData,
      this.id,
      this.weaponCode
    );

    this._broadcastAndScheduleTurn(gameCore, timeline);
  }

  handleImpact(impactData, timeline, manager) {
    // Skip helicopter hits
    if (impactData.isHelicopterHit) {
      return;
    }

    const currentBounce = impactData.bounceCount || 0;

    // If we've reached max bounces, don't spawn more children
    if (currentBounce >= this.maxBounces) {
      return;
    }

    // The time when child projectiles should spawn
    const spawnTime = impactData.time;

    // Spawn child projectiles
    for (let i = 0; i < this.numChildren; i++) {
      // Calculate next bounce parameters using the current impact position
      const nextBounceData = this.calculateNextBounce(
        impactData.position,
        impactData.playerId,
        currentBounce,
        impactData.isParentProjectile
      );

      manager.simulateSubProjectile(nextBounceData, spawnTime, timeline);
    }
  }

  calculateNextBounce(position, playerId, currentBounce, isParent) {
    // Calculate a random direction from the current position
    const angle = Math.random() * Math.PI * 2; // Random angle in radians
    
    // Add some variance to the bounce radius
    const effectiveRadius = this.bounceRadius + 
      (Math.random() - 0.5) * this.radiusVariance * this.bounceRadius;

    // Calculate next position with offset from current position
    const nextPos = new THREE.Vector3(
      position.x + Math.cos(angle) * effectiveRadius,
      position.y + 3,   // Small upward offset to prevent immediate collision
      position.z + Math.sin(angle) * effectiveRadius
    );

    // Calculate a nearby target point for a steeper trajectory
    const targetPos = new THREE.Vector3(
      nextPos.x + (Math.random() - 0.5) * this.radiusVariance * 5,
      position.y, // Target at ground level
      nextPos.z + (Math.random() - 0.5) * this.radiusVariance * 5
    );

    // Create direction vector with emphasized vertical component
    const direction = new THREE.Vector3()
      .subVectors(targetPos, nextPos)
      .normalize();

    // Add upward bias for steeper, more visible arcs
    direction.y += this.verticalBias; 
    direction.normalize();

    // If this is a child of the parent, use child starting values
    // Otherwise continue with bounce progression
    const baseScale = isParent ? this.childScale : 
      Math.max(this.childScale * Math.pow(this.scaleReduction, currentBounce), this.minScale);
    
    const baseDamage = isParent ? this.childDamage : 
      Math.max(this.childDamage * Math.pow(this.damageReduction, currentBounce), this.minDamage);

    // Calculate new time factor - gets faster with each bounce down to minTimeFactor
    const newTimeFactor = Math.max(
      this.baseTimeFactor / Math.pow(this.timeFactorReduction, currentBounce),
      this.minTimeFactor
    );

    const isLastBounce = currentBounce === this.maxBounces - 1;

    return {
      startPos: nextPos,
      direction: direction,
      power: this.basePower,
      playerId: playerId,
      weaponId: this.id,
      weaponCode: this.weaponCode,
      
      // State
      isFinalProjectile: isLastBounce,
      bounceCount: currentBounce + 1,
      doesCollide: true,
      isParentProjectile: false,  // These are all children
      
      // Physics
      gravity: this.gravity,
      timeFactor: newTimeFactor,
      minTimeFactor: this.minTimeFactor,
      
      // Visual
      explosionType: 'normal',
      explosionSize: 1.0,
      projectileScale: baseScale,
      projectileStyle: 'spike_bomb',
      craterSize: this.craterSize * (1 - currentBounce * 0.2),  // Smaller craters with each bounce
      
      // Damage
      baseDamage: baseDamage
    };
  }

  _broadcastAndScheduleTurn(gameCore, timeline) {
    this.projectileManager.io
      .to(this.projectileManager.gameId)
      .emit('fullProjectileTimeline', timeline);

    this.projectileManager.scheduleTimeline(timeline, Date.now(), gameCore);

    const lastEventTime = timeline.length
      ? Math.max(...timeline.map(ev => ev.time))
      : 0;
    const totalDelay = lastEventTime + gameCore.turnChangeDelay;

    setTimeout(async () => {
      if (!(await gameCore.roundManager.checkRoundOver())) {
        gameCore.playerManager.advanceTurn();
        gameCore.playerManager.currentPlayer =
          gameCore.playerManager.turnManager.getCurrentPlayerId();
        gameCore.playerManager.currentPlayerHasFired = false;
      }
    }, totalDelay);
  }

  destroy() {
    this.projectileManager.weaponHandlers.delete(this.id);
  }
}