import { v4 as uuidv4 } from 'uuid';
import * as THREE from 'three';

export class JumpingBeanWeapon {
  constructor(projectileManager) {
    this.projectileManager = projectileManager;
    this.id = uuidv4();
    this.weaponCode = 'JB01';

    // Weapon configuration
    this.maxBounces = 15;  // Fewer bounces for more concentrated effect
    this.bounceRadius = 2; // Very small radius for tight grouping
    this.radiusVariance = 0.5;  // Minor variance for natural spread

    // Physics and scaling settings
    this.baseTimeFactor = 0.5; // Faster movement for rapid peppering
    this.timeFactorMultiplier = 0.9;
    this.baseScale = 1.2;   // Smaller projectiles
    this.scaleReduction = 0.98; // Minimal scale reduction

    // Register the weapon's impact handler
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
      isFinalProjectile: false,
      explosionType: 'normal',
      explosionSize: 1.2,
      projectileScale: this.baseScale,
      projectileStyle: 'missile',
      craterSize: 20,
      baseDamage: 25,
      timeFactor: 1.0,
      bounceCount: 0,
      doesCollide: true,
      weaponId: this.id,
      weaponCode: this.weaponCode
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

    // Simulate the next bounce with minimal delay
    const spawnTime = impactData.time - 5; // Reduced spawn time for rapid sequence
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

    direction.y += 2.5; // Increased upward bias for steeper drops
    direction.normalize();

    const newScale = this.baseScale * Math.pow(this.scaleReduction, currentBounce);
    const newTimeFactor = this.baseTimeFactor * Math.pow(this.timeFactorMultiplier, currentBounce);
    const isLastBounce = currentBounce === this.maxBounces - 1;

    return {
      startPos: nextPos,
      direction: direction,
      power: 300,   // Lower power for tighter grouping
      playerId: playerId,
      weaponId: this.id,
      weaponCode: this.weaponCode,
      isFinalProjectile: isLastBounce,
      explosionType: 'normal',
      explosionSize: 1.2,
      projectileScale: Math.max(newScale, 0.5),
      projectileStyle: 'missile',
      craterSize: 20, // Smaller craters
      baseDamage: 10, // Slightly reduced damage per hit
      bounceCount: currentBounce + 1,
      timeFactor: Math.max(newTimeFactor, 0.3),
      gravity: -800,
      doesCollide: true
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