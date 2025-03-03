import { v4 as uuidv4 } from 'uuid';
import * as THREE from 'three';

export class JumpingBeanWeapon {
  constructor(projectileManager) {
    this.projectileManager = projectileManager;
    this.id = uuidv4();
    this.weaponCode = 'JB01';

    // Weapon configuration
    this.maxBounces = 15;
    this.bounceRadius = 10;      // Base radius for bounce spread
    this.radiusVariance = 0.5;  // Variance in bounce radius

    // Physics and timing settings
    this.baseTimeFactor = 0.8;      // Starting speed (slowest)
    this.minTimeFactor = 0.25;        // Minimum time factor (fastest)
    
    // Projectile appearance settings
    this.baseScale = 1.2;           // Starting size
    this.scaleReduction = 0.98;     // Size reduction per bounce
    this.minScale = 0.5;            // Minimum projectile size
    
    // Damage and impact settings
    this.baseDamage = 15;           // Initial projectile damage
    this.damageReduction = 0.9;     // Damage reduction per bounce
    this.minDamage = 5;            // Minimum damage per hit
    this.craterSize = 20;           // Size of terrain deformation
    
    // Trajectory settings
    this.basePower = 300;           // Initial projectile power
    this.verticalBias = 1.6;        // How much to bias upward bounces
    this.gravity = -1500;            // Stronger gravity for snappier arcs

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
      
      // Physics properties
      gravity: -300,
      timeFactor: this.baseTimeFactor,
      minTimeFactor: this.baseTimeFactor,
      
      // Visual properties
      explosionType: 'normal',
      explosionSize: 1.2,
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
    if (impactData.isHelicopterHit) {
      return;
    }

    const currentBounce = impactData.bounceCount || 0;

    if (currentBounce >= this.maxBounces) {
      return;
    }

    // Calculate next bounce parameters using the current impact position
    const nextBounceData = this.calculateNextBounce(
      impactData.position,
      impactData.playerId,
      currentBounce
    );

    const spawnTime = impactData.time;
    manager.simulateSubProjectile(nextBounceData, spawnTime, timeline);
  }

  calculateNextBounce(position, playerId, currentBounce) {
    // Calculate a tight spread from the current position
    const angle = Math.random() * Math.PI * 2; // Random direction
    const radius = this.bounceRadius + (Math.random() - 0.5) * this.radiusVariance;

    // Calculate next position with a small offset from current position
    const nextPos = new THREE.Vector3(
      position.x + Math.cos(angle) * radius,
      position.y + 3,   // Small upward offset
      position.z + Math.sin(angle) * radius
    );

    // Calculate a nearby target point for a steeper trajectory
    const targetPos = new THREE.Vector3(
      nextPos.x + (Math.random() - 0.5) * this.radiusVariance,
      position.y, // Target at ground level
      nextPos.z + (Math.random() - 0.5) * this.radiusVariance
    );

    // Create direction vector with emphasized vertical component
    const direction = new THREE.Vector3()
      .subVectors(targetPos, nextPos)
      .normalize();

    direction.y += this.verticalBias; // Add upward bias for steeper drops
    direction.normalize();

    // Calculate new scale and damage values with minimum limits
    const newScale = Math.max(
      this.baseScale * Math.pow(this.scaleReduction, currentBounce),
      this.minScale
    );
    
    const newDamage = Math.max(
      this.baseDamage * Math.pow(this.damageReduction, currentBounce),
      this.minDamage
    );

    // Calculate new time factor - halve it each bounce down to minTimeFactor
    const newTimeFactor = Math.max(
      this.baseTimeFactor / Math.pow(1.1, currentBounce),
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
      
      // Physics
      gravity: this.gravity,
      timeFactor: newTimeFactor,
      minTimeFactor: this.baseTimeFactor,
      
      // Visual
      explosionType: 'normal',
      explosionSize: 0.6,
      projectileScale: newScale,
      projectileStyle: 'spike_bomb',
      craterSize: this.craterSize,
      
      // Damage
      baseDamage: newDamage
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