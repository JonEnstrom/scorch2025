import * as THREE from 'three';
import { v4 as uuidv4 } from 'uuid';

export default class ClusterWeapon {
  constructor(projectileManager) {
    this.projectileManager = projectileManager;
    this.id = uuidv4();
    this.weaponCode = 'CW01';

    // Configuration
    this.clusterCount = 10;
    this.spreadAngle = 0.3;
    this.clusterPowerMultiplier = 0.9; // Keep most of the momentum
    
    // Register weapon handler for any subsequent impacts
    this.projectileManager.registerWeaponHandler(
      this.id,
      (impactEvent, timeline, manager) => this.handleImpact(impactEvent, timeline, manager)
    );
  }

  /**
   * Fire method using the pre-calculated system.
   * 1) Simulate a single "carrier" projectile.
   * 2) Identify the apex in its timeline.
   * 3) At the apex, inject an impact event (so the carrier is removed)
   *    and spawn cluster sub-projectiles that maintain parent momentum.
   * 4) Broadcast the combined timeline and schedule turn change.
   */
  fire(tank, playerId, gameCore) {
    const baseDirection = tank.getFireDirection();
    const spawnPos = tank.getBarrelTip();
    const power = tank.power;

    // 1) Carrier projectile (not final yet)
    const carrierData = [{
      startPos: spawnPos.clone(),
      direction: baseDirection.clone(),
      power: power,
      isFinalProjectile: false, // not final, because we want to split mid-air
      projectileStyle: 'missile',
      explosionSize: 1,
      projectileScale: 2,
      craterSize: 5,
      baseDamage: 10 // Carrier does minimal damage
    }];

    // 2) Simulate entire flight
    const timeline = this.projectileManager.simulateProjectiles(
      playerId,
      carrierData,
      this.id,
      this.weaponCode
    );

    // Find the carrier projectileId from the timeline
    const carrierSpawnEvent = timeline.find(ev =>
      ev.type === 'projectileSpawn' && ev.weaponId === this.id
    );
    if (!carrierSpawnEvent) {
      this._broadcastAndScheduleTurn(gameCore, timeline);
      return;
    }
    const carrierId = carrierSpawnEvent.projectileId;

    // 3) Identify the apex (highest Y) and the carrier's velocity at that point
    const carrierMoves = timeline.filter(ev =>
      ev.type === 'projectileMove' && ev.projectileId === carrierId
    );
    if (!carrierMoves.length) {
      this._broadcastAndScheduleTurn(gameCore, timeline);
      return;
    }

    // Find apex and get carrier velocity
    let apexEvent = carrierMoves[0];
    let maxY = apexEvent.position.y;
    let apexIndex = 0;
    
    for (let i = 1; i < carrierMoves.length; i++) {
      const event = carrierMoves[i];
      if (event.position.y > maxY) {
        maxY = event.position.y;
        apexEvent = event;
        apexIndex = i;
      }
    }
    
    // Get velocity at apex by computing the direction from the previous and next positions
    let carrierVelocity = new THREE.Vector3(0, -1, 0); // Default downward
    
    if (apexIndex > 0 && apexIndex < carrierMoves.length - 1) {
      const prevPos = new THREE.Vector3(
        carrierMoves[apexIndex - 1].position.x,
        carrierMoves[apexIndex - 1].position.y,
        carrierMoves[apexIndex - 1].position.z
      );
      
      const nextPos = new THREE.Vector3(
        carrierMoves[apexIndex + 1].position.x,
        carrierMoves[apexIndex + 1].position.y,
        carrierMoves[apexIndex + 1].position.z
      );
      
      // Direction is approximated from surrounding points
      carrierVelocity = nextPos.clone().sub(prevPos).normalize();
    }

    // 4) At apex, remove future events for the carrier and add an impact event to remove it.
    const apexTime = apexEvent.time;
    const apexPos = new THREE.Vector3(
      apexEvent.position.x,
      apexEvent.position.y,
      apexEvent.position.z
    );
    // Remove any carrier events after apex
    for (let i = timeline.length - 1; i >= 0; i--) {
      const ev = timeline[i];
      if (ev.projectileId === carrierId && ev.time > apexTime) {
        timeline.splice(i, 1);
      }
    }
    // Inject an impact event at apex so the carrier is removed on the client.
    timeline.push({
      type: 'projectileImpact',
      time: apexTime,
      projectileId: carrierId,
      playerId: playerId,
      position: { x: apexPos.x, y: apexPos.y, z: apexPos.z },
      isFinalProjectile: false,
      craterSize: 0,
      aoeSize: 0,
      damage: 0,
      explosionSize: 1, // Small explosion for visual effect
      explosionType: 'normal',
      bounceCount: 0,
      isHelicopterHit: false,
      hitHelicopterId: null
    });

    // 5) Spawn cluster bombs at the apex that maintain parent's momentum with added spread
    const spawnTime = apexTime + 10;
    for (let i = 0; i < this.clusterCount; i++) {
      // Use the carrier's velocity as base direction for child projectiles
      const direction = this._getClusterDirection(carrierVelocity);
      const isFinal = (i === this.clusterCount - 1); // Mark last as final
      
      // Create cluster projectile with parent momentum plus spread
      const subData = {
        startPos: apexPos.clone(),
        direction: direction,
        power: power * this.clusterPowerMultiplier,
        isFinalProjectile: isFinal,
        projectileStyle: 'bomblet',
        explosionSize: 2,
        explosionType: 'normal',
        projectileScale: 0.8 + (Math.random() * 0.4),
        craterSize: 25,
        baseDamage: 40, // Ensure clusters cause significant damage
        weaponId: this.id, // Keep weaponId for proper damage handling
        weaponCode: this.weaponCode
      };
      this.projectileManager.simulateSubProjectile(subData, spawnTime, timeline);
    }

    // 6) Broadcast and schedule turn change
    this._broadcastAndScheduleTurn(gameCore, timeline);
  }

  /**
   * Handle an impact event - this is for any additional behavior
   * when child projectiles hit something.
   */
  handleImpact(impactEvent, timeline, manager) {
    // For now, no special behavior on impact of child projectiles
    // But we can add effects here if needed
  }

  /**
   * Generate a cluster direction based on parent velocity plus spread.
   */
  _getClusterDirection(baseVelocity) {
    // Start with the parent's velocity
    const direction = baseVelocity.clone();
    
    // Add random spread
    const spreadX = (Math.random() - 0.5) * this.spreadAngle;
    const spreadY = (Math.random() - 0.5) * this.spreadAngle;
    const spreadZ = (Math.random() - 0.5) * this.spreadAngle;
    
    direction.add(new THREE.Vector3(spreadX, spreadY, spreadZ));
    return direction.normalize();
  }

  /**
   * Broadcast the timeline and schedule the turn change.
   */
  _broadcastAndScheduleTurn(gameCore, timeline) {
    this.projectileManager.io
      .to(this.projectileManager.gameId)
      .emit('fullProjectileTimeline', timeline);
    this.projectileManager.scheduleTimeline(timeline, Date.now(), gameCore);

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
    this.projectileManager.weaponHandlers.delete(this.id);
  }
}