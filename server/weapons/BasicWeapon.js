// BasicWeapon.js
import { v4 as uuidv4 } from 'uuid';
import * as THREE from 'three';

export default class BasicWeapon {
  constructor(projectileManager) {
    this.projectileManager = projectileManager;
    this.weaponCode = 'BW01';
    this.id = uuidv4();

    // Register optional custom logic for on-impact 
    // (If needed for special behaviors)
    projectileManager.registerWeaponHandler(this.id, (impactEvent, timeline, manager) => {
      // do nothing special for BasicWeapon
    });
  }

  fire(tank, playerId, gameCore) {
    const direction = tank.getFireDirection();
    const spawnPos = tank.getBarrelTip();
    const power = tank.power;
  
    const projectileData = [{
      startPos: spawnPos.clone(),
      direction: direction.normalize(),
      power,
      isFinalProjectile: true,
      baseDamage: 20,
      craterSize: 30,
      // etc
    }];
  
    // 1) Precompute the flight
    const timeline = this.projectileManager.simulateProjectiles(
      playerId,
      projectileData,
      this.id, // weaponId
      this.weaponCode
    );
  
    // 2) Broadcast it to clients
    this.projectileManager.io
      .to(this.projectileManager.gameId)
      .emit('fullProjectileTimeline', timeline);
      this.projectileManager.scheduleTimeline(timeline, Date.now(), gameCore);

  
    // 3) Find the final time in the timeline
    const finalEventTime = timeline.length
      ? Math.max(...timeline.map(ev => ev.time))
      : 0;
  
    // 4) Turn change after a delay
    const totalDelay = finalEventTime + gameCore.turnChangeDelay;
  
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
