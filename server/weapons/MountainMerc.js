import { v4 as uuidv4 } from 'uuid';
import * as THREE from 'three';

export class MountainMercWeapon {
  constructor(projectileManager) {
    this.projectileManager = projectileManager;
    this.id = uuidv4();
    this.weaponCode = 'MM01';

    // Weapon configuration
    this.childCount = 7;
    this.spreadAngle = 0.5;          // Radians for random spread
    this.upwardAngle = Math.PI / 6;  // Possibly not used, but included
    this.childPowerMultiplier = 0.9; // Children move slower than parent

    // Dynamic time factor properties:
    this.childTimeFactor = 0.33;     // initial speed factor (burst speed)
    this.childTimeFactorRate = 1.0;  // increases by 1.0 per second

    // Register an impact handler in the new format:
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
      projectileStyle: 'missile',
      craterSize: 1,
      baseDamage: 40, // or whatever minimal damage
      timeFactor: 1.0 // Parent projectile uses normal speed
    }];

    // 1) Simulate the "parent" projectile
    const timeline = this.projectileManager.simulateProjectiles(
      playerId,
      projectileData,
      this.id,
      this.weaponCode
    );

    // 2) Broadcast + schedule turn
    this._broadcastAndScheduleTurn(gameCore, timeline);
  }

  handleImpact(impactEvent, timeline, manager) {
    // If it was final or it hit a helicopter, do nothing
    if (impactEvent.isFinalProjectile || impactEvent.isHelicopterHit) {
      return;
    }

    // Create child projectiles
    const childProjectiles = this.createChildProjectiles(
      impactEvent.position,
      impactEvent.playerId,
      impactEvent.power || 200  // default power if not found
    );

    // We'll spawn them at the moment of impact minus a small offset
    const spawnTime = impactEvent.time - 30;

    // Insert them into the existing timeline
    for (const childData of childProjectiles) {
      // Prevent recursive triggering of impact handler
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

      // Mark last child as final so it ends the flight
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
        // Dynamic time factor:
        initialTimeFactor: this.childTimeFactor,  // starts at 0.33
        timeFactorRate: this.childTimeFactorRate   // increases by 1.0 per second
      });
    }

    return childProjectiles;
  }

  _broadcastAndScheduleTurn(gameCore, timeline) {
    // Broadcast
    this.projectileManager.io
      .to(this.projectileManager.gameId)
      .emit('fullProjectileTimeline', timeline);
    this.projectileManager.scheduleTimeline(timeline, Date.now(), gameCore);

    // Find the final time in the timeline
    const lastEventTime = timeline.length
      ? Math.max(...timeline.map(ev => ev.time))
      : 0;
    const totalDelay = lastEventTime + gameCore.turnChangeDelay;

    // Schedule the next turn
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
