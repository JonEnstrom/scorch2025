import * as THREE from 'three';
import { v4 as uuidv4 } from 'uuid';

export default class VolleyWeapon {
  constructor(projectileManager) {
    this.projectileCount = 10;
    this.spreadAngle = 0.1;
    this.projectileManager = projectileManager;
    this.id = uuidv4();
    this.weaponCode = 'VW01';
  }

  /**
   * Fire method using the pre-calculated system.
   * @param {Object} tank - The tank or player data.
   * @param {string} playerId - The ID of the player firing.
   * @param {Object} gameCore - The game instance (for turn scheduling).
   */
  fire(tank, playerId, gameCore) {
    const projectilesData = [];

    // Get base firing data from the tank
    const baseDirection = tank.getFireDirection();
    const spawnPos = tank.getBarrelTip();
    const power = tank.power;

    // Build projectile data for each shot
    for (let i = 0; i < this.projectileCount; i++) {
      const isFinalProjectile = (i === this.projectileCount - 1);
      
      // Add random spread
      const randomSpread = new THREE.Vector3(
        (Math.random() - 0.2) * this.spreadAngle,
        (Math.random() - 0.2) * this.spreadAngle,
        (Math.random() - 0.2) * this.spreadAngle
      );

      const direction = baseDirection.clone().add(randomSpread).normalize();

      projectilesData.push({
        startPos: spawnPos.clone(),
        direction,
        power,
        isFinalProjectile,
        projectileStyle: 'missile',
        craterSize: 25,
        explosionSize: 1.5,
        baseDamage: 25
      });
    }

    // Precompute the entire flight for all projectiles
    const timeline = this.projectileManager.simulateProjectiles(
      playerId,
      projectilesData,
      this.id,
      this.weaponCode
    );

    // Broadcast the full timeline to clients
    this.projectileManager.io
      .to(this.projectileManager.gameId)
      .emit('fullProjectileTimeline', timeline);
      this.projectileManager.scheduleTimeline(timeline, Date.now(), gameCore);


    // Determine the final event time from the timeline
    const finalEventTime = timeline.length
      ? Math.max(...timeline.map(ev => ev.time))
      : 0;
    const totalDelay = finalEventTime + gameCore.turnChangeDelay;

    // Schedule the turn change after the timeline has finished
    setTimeout(async () => {
      if (!(await gameCore.roundManager.checkRoundOver())) {
        gameCore.playerManager.advanceTurn();
        gameCore.playerManager.currentPlayer =
          gameCore.playerManager.turnManager.getCurrentPlayerId();
        gameCore.playerManager.currentPlayerHasFired = false;
      }
    }, totalDelay);
  }
}
