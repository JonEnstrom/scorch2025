import { v4 as uuidv4 } from 'uuid';
import * as THREE from 'three';

export default class MultiGuidedWeapon {
  constructor(projectileManager) {
    this.projectileManager = projectileManager;
    this.weaponCode = 'MGW01';  // New weapon code for the multi-guided weapon
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
    
    // Calculate future time (6 seconds ahead)
    const currentTime = Date.now();
    const futureTime = currentTime + 6000; // 6 seconds in milliseconds
    
    // Filter helicopters to only target those that will be within -1200 to +1200 on both X and Y axes in 6 seconds
    const helicopters = allHelicopters.filter(helicopter => {
      // Get the predicted future position of the helicopter
      const futurePosition = this.projectileManager.helicopterManager.getHelicopterPositionAtTime(helicopter.id, Date.now());
      console.log(futurePosition);
      
      // If we couldn't get a future position, filter this helicopter out
      if (!futurePosition) return false;
      
      // Check if the future position is within our boundary
      return (
        futurePosition.position.x >= -1200 && 
        futurePosition.position.x <= 1200 && 
        futurePosition.position.x >= -1200 && 
        futurePosition.position.x <= 1200
      );
    });
    
    if (!helicopters || helicopters.length === 0) {
      // No helicopters will be within range to target, fall back to basic projectile
      this._fireUnguided(tank, playerId, gameCore, spawnPos, direction, power);
      return;
    }
    
    console.log(`Firing ${helicopters.length} guided missiles, targeting helicopters that will be within range (-1200 to +1200 on X and Y axes) in 6 seconds`);
    
    // Create projectile data for each helicopter
    const projectileData = helicopters.map((helicopter, index) => {
      // Slightly vary the initial direction for visual effect
      const spreadFactor = 0.20;
      const spreadDirection = direction.clone();
      
      // Add a small random spread to missiles
      if (helicopters.length > 1) {
        spreadDirection.x += (Math.random() * 2 - 1) * spreadFactor;
        spreadDirection.y += (Math.random() * 2 - 1) * spreadFactor;
        spreadDirection.normalize();
      }
      
      return {
        startPos: spawnPos.clone(),
        direction: spreadDirection,
        power: power * 0.8, // Initial speed factor
        isFinalProjectile: index === helicopters.length - 1, // Only the last one is final
        baseDamage: 35, // Slightly reduced damage since there are multiple projectiles
        craterSize: 20,
        explosionSize: 1.2,
        explosionType: 'guided',
        projectileStyle: 'missile',
        projectileScale: 0.7,
        
        // Guided missile specific properties
        isGuided: true,
        targetHelicopterId: helicopter.id,
        maxTurnRate: 0.05,  // Radians per simulation step
        guidanceDelay: 2000 + (index * 300), // Stagger guidance activation for visual effect
        acceleration: 330   // Slightly slower than the original
      };
    });
    
    // Precompute the flight for all projectiles
    const timeline = this.projectileManager.simulateProjectiles(
      playerId,
      projectileData,
      this.id,
      this.weaponCode
    );
    
    // Log which helicopters were targeted
    helicopters.forEach(helicopter => {
      // Get the predicted position for logging
      const futurePosition = this.projectileManager.helicopterManager.getHelicopterPositionAtTime(helicopter.id, currentTime + 6000);
    });
    
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
    
    console.log('No helicopters available, firing unguided missile');
    
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