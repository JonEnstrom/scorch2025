import { v4 as uuidv4 } from 'uuid';
import * as THREE from 'three';

export default class GuidedWeapon {
  constructor(projectileManager) {
    this.projectileManager = projectileManager;
    this.weaponCode = 'GW01';
    this.id = uuidv4();

    // Register custom impact handler
    projectileManager.registerWeaponHandler(this.id, (impactEvent, timeline, manager) => {
      // Any special effects on impact can be added here
    });
  }

  fire(tank, playerId, gameCore) {
    const direction = tank.getFireDirection();
    const spawnPos = tank.getBarrelTip();
    const power = tank.power;
    
    // Get all helicopters
    const allHelicopters = this.projectileManager.helicopterManager.getAllHelicopters();
    
    // Calculate future time 
    const currentTime = Date.now();
    const futureTime = currentTime + 8000; 
    
    // Filter helicopters to only target those that will be within -1200 to +1200 on both X and Y axes in 6 seconds
    const helicopters = allHelicopters.filter(helicopter => {
      // Get the predicted future position of the helicopter
      const futurePosition = this.projectileManager.helicopterManager.getHelicopterPositionAtTime(helicopter.id, futureTime);
      
      // If we couldn't get a future position, filter this helicopter out
      if (!futurePosition) return false;
      
      // Check if the future position is within our boundary
      return (
        futurePosition.position.x >= -1200 && 
        futurePosition.position.x <= 1200 && 
        futurePosition.position.y >= -1200 && 
        futurePosition.position.y <= 1200
      );
    });
    
    if (!helicopters || helicopters.length === 0) {
      // No helicopters will be within range to target, fall back to basic projectile
      this._fireUnguided(tank, playerId, gameCore, spawnPos, direction, power);
      return;
    }
    
    // Select a random helicopter as the target from those that will be in range
    const targetHelicopter = helicopters[Math.floor(Math.random() * helicopters.length)];
    
    console.log(`Guided missile targeting helicopter: ${targetHelicopter.id} that will be within range (-1200 to +1200 on X and Y axes) in 6 seconds`);
    
    const projectileData = [{
      startPos: spawnPos.clone(),
      direction: direction.normalize(),
      power: power * 0.8, // Initial speed factor
      isFinalProjectile: true,
      baseDamage: 40,
      craterSize: 25,
      explosionSize: 1.5,
      explosionType: 'guided',
      projectileStyle: 'missile',
      projectileScale: 1.5,
      
      // Guided missile specific properties
      isGuided: true,
      targetHelicopterId: targetHelicopter.id,
      maxTurnRate: 0.01,  // Radians per simulation step
      guidanceDelay: 2000, // ms before guidance kicks in
      acceleration: 350   // Faster acceleration than standard
    }];
    
    // Precompute the flight
    const timeline = this.projectileManager.simulateProjectiles(
      playerId,
      projectileData,
      this.id,
      this.weaponCode
    );
    
    // Log which helicopter was targeted with its future position
    const futurePosition = this.projectileManager.helicopterManager.getHelicopterPositionAtTime(targetHelicopter.id, futureTime);
    if (futurePosition) {
      console.log(`Target helicopter ${targetHelicopter.id} predicted future position: X=${futurePosition.position.x}, Y=${futurePosition.position.y}`);
    }
    
    // Broadcast it to clients
    this.projectileManager.io
      .to(this.projectileManager.gameId)
      .emit('fullProjectileTimeline', timeline);
    
    this.projectileManager.scheduleTimeline(timeline, Date.now(), gameCore);
    
    // Find the final time in the timeline
    const finalEventTime = timeline.length
      ? Math.max(...timeline.map(ev => ev.time))
      : 0;
    
    // Turn change after a delay
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
  
  _fireUnguided(tank, playerId, gameCore, spawnPos, direction, power) {
    // Fall back to basic projectile behavior when no helicopters available
    const projectileData = [{
      startPos: spawnPos.clone(),
      direction: direction.normalize(),
      power: power,
      isFinalProjectile: true,
      baseDamage: 30,
      craterSize: 25,
      projectileStyle: 'missile',
      projectileScale: 1.5,
      explosionType: 'guided',
      // Not guided - will follow normal physics
      isGuided: false
    }];
    
    console.log('No helicopters available within future boundary, firing unguided missile');
    
    // Same process as guided, but without targeting
    const timeline = this.projectileManager.simulateProjectiles(
      playerId,
      projectileData,
      this.id,
      this.weaponCode
    );
    
    this.projectileManager.io
      .to(this.projectileManager.gameId)
      .emit('fullProjectileTimeline', timeline);
    
    this.projectileManager.scheduleTimeline(timeline, Date.now(), gameCore);
    
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

  destroy() {
    this.projectileManager.weaponHandlers.delete(this.id);
  }
}