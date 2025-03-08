import { v4 as uuidv4 } from 'uuid';
import * as THREE from 'three';

export class SprinklerWeapon {
  constructor(projectileManager) {
    this.projectileManager = projectileManager;
    this.id = uuidv4();
    this.weaponCode = 'SW01';

    // Weapon configuration
    this.circleSteps = 12;              // Total number of positions in the circle
    this.projectilesPerStep = 4;        // Number of projectiles per direction
    this.projectilePowers = [5, 10, 15, 20]; // Power settings for each projectile
    this.projectileDelay = 600;       
    this.verticalAngle = Math.PI / 3;   // 45 degrees upward angle for all projectiles
    
    // Bounce configuration
    this.bounciness = 0.6;              // Coefficient of restitution
    this.upwardBias = 0.4;              // Upward bias after bounce
    this.minVerticalVelocity = 0.3;     // Minimum vertical component after bounce
    
    // Projectile appearance settings
    this.baseScale = 0.8;               // Size of sprinkler projectiles
    this.scaleVariance = 0.2;           // Random variance in projectile size
    
    // Damage and impact settings
    this.initialDamage = 20;            // Damage of the initial projectile
    this.sprinklerDamage = 30;          // Damage of each sprinkler projectile
    this.craterSize = 15;               // Size of terrain deformation
    
    // Register weapon handler for initial projectile
    projectileManager.registerWeaponHandler(
      this.id,
      (impactData, timeline, manager) => this.handleImpact(impactData, timeline, manager)
    );
  }

  fire(tank, playerId, gameCore) {
    const projectileData = [{
      startPos: tank.getBarrelTip(),
      direction: tank.getFireDirection(),
      power: tank.power,
      
      // Weapon identification
      weaponId: this.id,
      weaponCode: this.weaponCode,
      playerId: playerId,
      
      // Projectile state
      isFinalProjectile: false,
      bounceCount: 0,
      doesCollide: true,
      isInitialProjectile: true,  // Mark as initial projectile
      
      // Physics properties
      gravity: -30,
      timeFactor: 1.0,
      
      // Visual properties
      explosionType: 'normal',
      explosionSize: 1.0,
      projectileScale: 1.5,
      projectileStyle: 'missile',
      craterSize: this.craterSize,
      
      // Damage properties
      baseDamage: this.initialDamage
    }];

    // Simulate the initial projectile
    const timeline = this.projectileManager.simulateProjectiles(
      playerId,
      projectileData,
      this.id,
      this.weaponCode
    );

    this._broadcastAndScheduleTurn(gameCore, timeline);
  }

  handleImpact(impactData, timeline, manager) {
    // Skip helicopter hits
    if (impactData.isHelicopterHit) {
      return;
    }
      
    // Create the sprinkler effect at the impact position
    this.createSprinklerProjectiles(
      impactData.position,
      impactData.playerId,
      impactData.time,
      timeline,
      manager
    );
  }

  createSprinklerProjectiles(position, playerId, startTime, timeline, manager) {
    const stepAngle = (Math.PI * 2) / this.circleSteps; // Angle between each step
    
    // Create an array of positions in the desired order
    // Two full clockwise circles, hitting odd positions in the first circle 
    // and then even positions in the second circle
    const positionOrder = [];
    
    // First circle: positions 1, 3, 5, 7, 9, 11 (odd positions, 0-indexed would be 0, 2, 4, 6, 8, 10)
    for (let i = 0; i < this.circleSteps; i += 2) {
      positionOrder.push(i);
    }
    
    // Second circle: positions 12, 2, 4, 6, 8, 10 (even positions, 0-indexed would be 11, 1, 3, 5, 7, 9)
    // We need to handle this a different way to ensure we go clockwise for both passes
    positionOrder.push(11); // Position 12 (index 11 in 0-indexed)
    for (let i = 1; i < this.circleSteps; i += 2) {
      positionOrder.push(i);
    }
    
    // For each position in our new order
    for (let i = 0; i < positionOrder.length; i++) {
      const step = positionOrder[i];
      const currentAngle = step * stepAngle;
      const spawnTime = startTime + (i * this.projectileDelay);
      
      // Create the horizontal direction vector based on current angle
      const horizontalDir = new THREE.Vector3(
        Math.cos(currentAngle),
        0,
        Math.sin(currentAngle)
      ).normalize();
      
      // For each projectile at this angle (with different power)
      for (let j = 0; j < this.projectilesPerStep; j++) {
        // Create direction vector with upward angle
        const direction = horizontalDir.clone();
        direction.y = Math.tan(this.verticalAngle); // Add upward component
        direction.normalize();
        
        // Calculate scale with some randomness
        const scale = this.baseScale + (Math.random() * this.scaleVariance);
        
        // Create the projectile data - now using automatic bounce
        const projectileData = {
          startPos: new THREE.Vector3(position.x, position.y + 3, position.z), // Slight elevation
          direction: direction,
          power: this.projectilePowers[j],
          playerId: playerId,
          
          weaponId: null, // No handler needed
          weaponCode: this.weaponCode,
          
          // State
          isFinalProjectile: true, // The last bounce will be final
          bounceCount: 0,
          doesCollide: true,
          
          // Auto-bounce settings
          preImpactBounces: 1, // Auto-bounce once
          preImpactBouncePower: 15,
          bounciness: this.bounciness,
          upwardBias: this.upwardBias,
          minVerticalVelocity: this.minVerticalVelocity,
          bounceExplosion: false, // No explosion on bounce
          bounceDamage: 0, // No damage on bounce
          bounceCraterSize: 0, // No crater on bounce
          
          // Physics
          gravity: -30,
          timeFactor: 0.9, // Slightly faster than normal
          
          // Visual
          explosionType: 'normal', // Normal explosion on final impact
          explosionSize: 1.0,
          projectileScale: scale,
          projectileStyle: 'spike_bomb',
          craterSize: this.craterSize, 
          
          // Damage (only applied on final impact)
          baseDamage: this.sprinklerDamage,
          aoeSize: 5 // Area of effect for damage
        };
        
        // Simulate this projectile
        manager.simulateSubProjectile(projectileData, spawnTime, timeline);
      }
    }
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