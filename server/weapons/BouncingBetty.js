// BouncingBettyWeapon.js
import { v4 as uuidv4 } from 'uuid';
import * as THREE from 'three';

export class BouncingBettyWeapon {
  constructor(projectileManager) {
    this.projectileManager = projectileManager;
    this.id = uuidv4();
    this.weaponCode = 'BB01';
    
    this.maxBounces = 4;
    this.bounceAngle = Math.PI / 2;
    this.spreadVariance = 0.4;
    this.powerRetention = 0.8;

    // The "carrier" direction is stored at fire time
    this.baseFireDirection = null;

    // Register the weapon's logic
    projectileManager.registerWeaponHandler(
      this.id,
      (impactData, timeline, manager) => this.handleImpact(impactData, timeline, manager)
    );
  }

  fire(tank, playerId, gameCore) {
    this.baseFireDirection = tank.getFireDirection();
    const projectileData = [{
      startPos: tank.getBarrelTip(),
      direction: this.baseFireDirection,
      power: tank.power,
      isFinalProjectile: false,
      explosionType: 'normal',
      explosionSize: 2,
      projectileScale: 1,
      projectileStyle: 'missile',
      bounceCount: 0,
      craterSize: 50
    }];
  
    // 1) Precompute the flight
    const timeline = this.projectileManager.simulateProjectiles(
      playerId,
      projectileData,
      this.id,
      this.weaponCode
    );
  
    // 2) Broadcast to clients
    this.projectileManager.io
      .to(this.projectileManager.gameId)
      .emit('fullProjectileTimeline', timeline);

      this.projectileManager.scheduleTimeline(timeline, Date.now(), gameCore);
  
    // 3) Find the last event time in the timeline
    const finalEventTime = timeline.length
      ? Math.max(...timeline.map(ev => ev.time))
      : 0;
  
    // 4) Add your usual turn-change delay
    const totalDelay = finalEventTime + gameCore.turnChangeDelay;
  
    // 5) Schedule the actual turn change
    setTimeout(async () => {
      // e.g. check if round is over, otherwise advance turn
      if (!(await gameCore.roundManager.checkRoundOver())) {
        gameCore.playerManager.advanceTurn();
        gameCore.playerManager.currentPlayer =
          gameCore.playerManager.turnManager.getCurrentPlayerId();
        gameCore.playerManager.currentPlayerHasFired = false;
      }
    }, totalDelay);
  }

  handleImpact(impactData, timeline, manager) {
    // If we already used up max bounces, or it was a direct helicopter hit, do nothing
    if (impactData.isHelicopterHit) return;
    
    const currentBounce = impactData.bounceCount || 0;
    if (currentBounce >= this.maxBounces) {
      return;
    }

    // Create next bounce projectile data
    const nextBounce = this.createBounceProjectile(
      impactData.position,
      impactData.playerId,
      currentBounce + 1,
      200  // or if you stored the parent's power in a custom field
    );
    
    // The bounce is triggered at the same impact time or slightly after
    const spawnTime = impactData.time + 30; // 30 ms after impact, for example

    // Let the manager do a sub-simulation and merge events
    manager.simulateSubProjectile(nextBounce, spawnTime, timeline);
  }

  createBounceProjectile(position, playerId, bounceCount, parentPower) {
    // Bounce logic
    const bounceDir = this.baseFireDirection.clone();
    const upwardComponent = Math.sin(this.bounceAngle);
    bounceDir.y = upwardComponent;

    // add random side variance
    const rightVector = new THREE.Vector3(0,1,0).cross(bounceDir).normalize();
    const sideVariance = (Math.random() - 0.5) * 2 * this.spreadVariance;
    bounceDir.add(rightVector.multiplyScalar(sideVariance));

    // small rotation
    const rotationAngle = (Math.random() - 0.5) * this.spreadVariance;
    bounceDir.applyAxisAngle(new THREE.Vector3(0,1,0), rotationAngle);

    const bouncePower = parentPower * Math.pow(this.powerRetention, bounceCount);
    console.log(bouncePower);

    return {
      playerId,
      weaponId: this.id,
      weaponCode: this.weaponCode,
      startPos: new THREE.Vector3(position.x, position.y + 0.1, position.z),
      direction: bounceDir.normalize(),
      power: bouncePower,
      isFinalProjectile: (bounceCount === this.maxBounces),
      explosionType: 'normal',
      explosionSize: 2,
      projectileScale: Math.max(1.0 - (bounceCount * 0.2), 0.25),
      projectileStyle: 'missile',
      bounceCount,
      craterSize: 50,
      baseDamage: 50, // or custom
    };
  }

  destroy() {
    this.projectileManager.weaponHandlers.delete(this.id);
  }
}
