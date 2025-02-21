import { v4 as uuidv4 } from 'uuid';
import * as THREE from 'three';

export class BouncingRabbitWeapon {
  constructor(projectileManager) {
    this.projectileManager = projectileManager;
    this.id = uuidv4();
    this.weaponCode = 'BR01';
    
    this.maxBounces = 4;
    this.bounceAngle = Math.PI / 2;
    this.spreadVariance = 0.8;
    this.powerRetention = 0.8;
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

    // We’ll default to 250 if no power is found in the event
    const parentPower = impactEvent.power || 250;

    // Create multiple sub-projectiles (splits)
    // This example spawns 5 slightly different directions
    const nextProjectiles = [
      this.createBounceProjectile(
        impactEvent.position,
        impactEvent.playerId,
        currentBounce + 1,
        parentPower,
        -0.4,
        false
      ),
      this.createBounceProjectile(
        impactEvent.position,
        impactEvent.playerId,
        currentBounce + 1,
        parentPower,
        0.0,
        false
      ),
      this.createBounceProjectile(
        impactEvent.position,
        impactEvent.playerId,
        currentBounce + 1,
        parentPower,
        0.4,
        isFinalSplit
      ),
      this.createBounceProjectile(
        impactEvent.position,
        impactEvent.playerId,
        currentBounce + 1,
        parentPower,
        -0.8,
        false
      ),
      this.createBounceProjectile(
        impactEvent.position,
        impactEvent.playerId,
        currentBounce + 1,
        parentPower,
        0.8,
        isFinalSplit
      )
    ];

    this.currentProjectileCount = nextSplitCount;

    // We spawn them slightly after the impact
    const spawnTime = impactEvent.time + 30;

    for (const p of nextProjectiles) {
      // If final, we effectively stop further bounces
      // by removing the recognized weaponId.
      p.weaponId = isFinalSplit ? null : this.id;
      p.weaponCode = this.weaponCode;

      manager.simulateSubProjectile(p, spawnTime, timeline);
    }
  }

  /**
   * Utility to create a new bounce projectile
   */
  createBounceProjectile(position, playerId, bounceCount, parentPower, spreadDirection = 0, isFinal = false) {
    const bounceDirection = this.baseFireDirection.clone();

    // Force some upward bounce
    const upwardComponent = Math.sin(this.bounceAngle);
    bounceDirection.y = upwardComponent;

    // Add sideways variance
    const rightVector = new THREE.Vector3(0, 1, 0)
      .cross(bounceDirection)
      .normalize();
    const sideVariance = spreadDirection * this.spreadVariance;
    bounceDirection.add(rightVector.multiplyScalar(sideVariance));

    // Random small rotation
    const rotationAngle = (Math.random() - 0.5) * this.spreadVariance;
    bounceDirection.applyAxisAngle(new THREE.Vector3(0, 1, 0), rotationAngle);

    // Degrade power with each bounce
    const bouncePower = parentPower * Math.pow(this.powerRetention, bounceCount);

    return {
      startPos: new THREE.Vector3(
        position.x,
        position.y + 0.1,
        position.z
      ),
      direction: bounceDirection.normalize(),
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
