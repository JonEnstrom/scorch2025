import * as THREE from 'three';
import { v4 as uuidv4 } from 'uuid';

export default class MultiShotWeapon {
  constructor(projectileManager) {
    this.projectileCount = 8;    // total shots
    this.spreadAngle = 0.15;     // random angle
    this.fireInterval = 500;     // ms between shots
    this.projectileManager = projectileManager;
    this.id = uuidv4();
    this.weaponCode = 'MS01';
  }

  /**
   * Fire method under the pre-calculated system:
   * 1) We have multiple projectiles (shots), each with a time offset.
   * 2) We add them all to the same timeline using simulateSubProjectile(...).
   * 3) The last shot is final => ends the turn.
   * 4) Then we broadcast the combined timeline and schedule turn end.
   */
  fire(tank, playerId, gameCore) {
    // We'll collect everything in a single timeline array
    const timeline = [];

    // For each shot, we create one projectile, 
    // offset in time by i * fireInterval
    for (let i = 0; i < this.projectileCount; i++) {
      const spawnTime = i * this.fireInterval;

      const baseDirection = tank.getFireDirection();
      const spawnPos = tank.getBarrelTip();
      const power = tank.power;

      // Slight random spread
      const randomSpread = new THREE.Vector3(
        (Math.random() - 0.5) * this.spreadAngle,
        (Math.random() - 0.5) * this.spreadAngle,
        (Math.random() - 0.5) * this.spreadAngle
      );

      const direction = baseDirection.clone().add(randomSpread).normalize();

      // Mark only the last shot as final
      const isFinal = (i === this.projectileCount - 1);

      const projectileData = {
        startPos: spawnPos.clone(),
        direction,
        power,
        isFinalProjectile: isFinal,
        projectileStyle: 'missile',
        craterSize: 30,
        baseDamage: 20,
        explosionSize: 1,
        weaponId: this.id,
        weaponCode: this.weaponCode
      };

      // Add each shot to the timeline with simulateSubProjectile
      this.projectileManager.simulateSubProjectile(
        projectileData,
        spawnTime,   // spawn offset
        timeline
      );
    }

    this._broadcastAndScheduleTurn(gameCore, timeline);
  }

  /**
   * Broadcast the final timeline, then schedule turn 
   * after the last event time + gameCore.turnChangeDelay.
   */
  _broadcastAndScheduleTurn(gameCore, timeline) {
    // Send to clients
    this.projectileManager.io
      .to(this.projectileManager.gameId)
      .emit('fullProjectileTimeline', timeline);
      this.projectileManager.scheduleTimeline(timeline, Date.now(), gameCore);


    // Find max event time
    const lastEventTime = timeline.length
      ? Math.max(...timeline.map(e => e.time))
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
    // If you register an onImpact handler in the future, remove it here:
    this.projectileManager.weaponHandlers.delete(this.id);
  }
}
