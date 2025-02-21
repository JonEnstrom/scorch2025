// AirStrikeWeapon.js
import { v4 as uuidv4 } from 'uuid';
import * as THREE from 'three';

export default class AirStrikeWeapon {
  constructor(projectileManager) {
    this.projectileManager = projectileManager;
    this.id = uuidv4();
    this.weaponCode = 'RF01';

    // Set your config
    this.strikeCount = 40;
    this.strikeDelay = 100;     // ms between bombs
    this.initialDelay = 1000;   // ms before first bomb
    this.altitude = 0;          // how high from carrier
    this.spreadAngle = Math.PI / 3; // random horizontal spread ±30°

    // Register the weapon logic
    projectileManager.registerWeaponHandler(
      this.id,
      (impactEvent, timeline, manager) => this.handleImpact(impactEvent, timeline, manager)
    );
  }

  fire(tank, playerId, gameCore) {
    this.baseDirection = tank.getFireDirection();
    const spawnPos = tank.getBarrelTip();
  
    const carrierData = [{
      startPos: spawnPos.clone(),
      direction: this.baseDirection.clone(),
      power: tank.power,
      isFinalProjectile: true,
      projectileStyle: 'missile',
      projectileScale: 4,
      baseDamage: 0 // The carrier itself can do minimal damage
    }];
  
    // 1) Simulate the carrier
    const timeline = this.projectileManager.simulateProjectiles(
      playerId,
      carrierData,
      this.id,
      this.weaponCode
    );
  
    // 2) Insert bombs as sub-projectiles (as you had before).
    const carrierId = (timeline.find(
      ev => ev.type === 'projectileSpawn' && ev.weaponId === this.id
    )?.projectileId) || null;
  
    if (!carrierId) {
      console.warn('No carrier found for AirStrikeWeapon');
    } else {
      let bombsRemaining = this.strikeCount;
      let nextBombTime = this.initialDelay;
  
      while (bombsRemaining > 0) {
        const relevantEvents = timeline.filter(ev =>
          ev.projectileId === carrierId && ev.type === 'projectileMove' && ev.time <= nextBombTime
        );
  
        if (!relevantEvents.length) {
          // Means the carrier impacted or no data
          break;
        }
  
        const lastMoveEvent = relevantEvents[relevantEvents.length - 1];
        const carrierPos = lastMoveEvent.position;
        const bombSpawnPos = new THREE.Vector3(
          carrierPos.x,
          carrierPos.y + this.altitude,
          carrierPos.z
        );
  
        // Random horizontal deviation
        const bombDir = this.baseDirection.clone();
        const horizontalDeviation = (Math.random() - 0.5) * this.spreadAngle;
        bombDir.applyAxisAngle(new THREE.Vector3(0, 1, 0), horizontalDeviation);
  
        const bombData = {
          playerId,
          weaponId: this.id,
          weaponCode: this.weaponCode + '_BOMBLET',
          startPos: bombSpawnPos,
          direction: bombDir,
          power: 100,
          isFinalProjectile: false, // bombs themselves are not final
          explosionSize: 3.0,
          projectileStyle: 'bomblet',
          craterSize: 75,
          aoeSize: 150,
          baseDamage: 50
        };
  
        this.projectileManager.simulateSubProjectile(
          bombData,
          nextBombTime,
          timeline
        );
  
        bombsRemaining--;
        nextBombTime += this.strikeDelay;
      }
    }
  
    // 3) Broadcast the combined timeline (carrier + bombs) to clients
    this.projectileManager.io
      .to(this.projectileManager.gameId)
      .emit('fullProjectileTimeline', timeline);
      this.projectileManager.scheduleTimeline(timeline, Date.now(), gameCore);

  
    // 4) Find the last event in the entire timeline and schedule turn change
    const finalEventTime = timeline.length
      ? Math.max(...timeline.map(ev => ev.time))
      : 0;
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

  handleImpact(impactEvent, timeline, manager) {
    // If the "carrier" projectile impacted, we do nothing special here,
    // since we handled the bombs by scanning the timeline. 
    // Or you could do some final effect, if you want.
  }

  destroy() {
    this.projectileManager.weaponHandlers.delete(this.id);
  }
}
