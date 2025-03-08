import { v4 as uuidv4 } from 'uuid';
import * as THREE from 'three';

export class MountainMercWeapon {
  constructor(projectileManager) {
    this.projectileManager = projectileManager;
    this.id = uuidv4();
    this.weaponCode = 'MM01';

    // Weapon configuration
    this.childCount = 7;
    this.spreadAngle = 0.25;          // Radians for random spread
    this.upwardAngle = Math.PI / 6;  // Possibly not used, but included
    this.childPowerMultiplier = 0.9; // Children move slower than parent

    // Dynamic time factor properties for children:
    this.childInitialTimeFactor = 0.3;  // Start at 0.3x time (3.33x speed)
    this.childTimeFactorRate = 1.0;     // Increase factor by 1.0 per second
    this.childMinTimeFactor = 0.3;      
    this.childMaxTimeFactor = 1.5;      

    // Register impact handler
    this.projectileManager.registerWeaponHandler(
      this.id,
      (impactEvent, timeline, manager) => this.handleImpact(impactEvent, timeline, manager)
    );
  }

  fire(tank, playerId, gameCore) {
    const projectileData = [{
      startPos: tank.getBarrelTip(),
      direction: tank.getFireDirection().clone(),
      power: tank.power,
      isFinalProjectile: false,       // parent spawns children on impact
      explosionType: 'normal',
      explosionSize: 0.5,
      projectileScale: 3,
      projectileStyle: 'projectile_1',
      craterSize: 1,
      baseDamage: 40,
      timeFactor: 1.0 // Parent projectile uses normal speed
    }];

    const timeline = this.projectileManager.simulateProjectiles(
      playerId,
      projectileData,
      this.id,
      this.weaponCode
    );

    this._broadcastAndScheduleTurn(gameCore, timeline);
  }

  handleImpact(impactEvent, timeline, manager) {
    if (impactEvent.isFinalProjectile || impactEvent.isHelicopterHit) {
      return;
    }

    const childProjectiles = this.createChildProjectiles(
      impactEvent.position,
      impactEvent.playerId,
      impactEvent.power || 20
    );

    const spawnTime = impactEvent.time;

    for (const childData of childProjectiles) {
      childData.weaponId = null;
      childData.weaponCode = null;
      manager.simulateSubProjectile(childData, spawnTime, timeline);
    }
  }

  createChildProjectiles(position, playerId, parentPower) {
    const childProjectiles = [];
    const baseDirection = new THREE.Vector3(0, 1, 0);

    for (let i = 0; i < this.childCount; i++) {
      // Random spread around baseDirection
      const spreadDirection = baseDirection.clone();

      // Y-axis random rotation
      const rotationAngle = (Math.random() - 0.5) * this.spreadAngle;
      spreadDirection.applyAxisAngle(new THREE.Vector3(0, 1, 0), rotationAngle);

      // X tilt
      const xTiltAngle = (Math.random() - 0.5) * this.spreadAngle;
      spreadDirection.applyAxisAngle(new THREE.Vector3(1, 0, 0), xTiltAngle);

      // Z tilt
      const zTiltAngle = (Math.random() - 0.5) * this.spreadAngle;
      spreadDirection.applyAxisAngle(new THREE.Vector3(0, 0, 1), zTiltAngle);

      const isFinal = (i === this.childCount - 1);

      childProjectiles.push({
        startPos: new THREE.Vector3(position.x, position.y + 5, position.z),
        direction: spreadDirection.normalize(),
        power: parentPower * this.childPowerMultiplier * (0.5 + Math.random()),
        isFinalProjectile: isFinal,
        explosionType: 'normal',
        explosionSize: 3.0,
        projectileScale: 0.7 * (0.5 + Math.random()),
        projectileStyle: 'bomblet',
        craterSize: 80,
        baseDamage: 50,
        preImpactBounces: 1,
        preImpactBouncePower: 10,
        // Time control configuration:
        initialTimeFactor: this.childInitialTimeFactor,  // Start fast (0.3x time)
        timeFactorRate: this.childTimeFactorRate,        // Increase by 1.0/sec
        minTimeFactor: this.childMinTimeFactor,         // Never faster than initial
        maxTimeFactor: this.childMaxTimeFactor          // Never slower than 2.0x
      });
    }

    return childProjectiles;
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