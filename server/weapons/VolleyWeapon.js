import * as THREE from 'three';
import { v4 as uuidv4 } from 'uuid';

export default class VolleyWeapon {
  constructor(projectileManager) {
    this.projectileCount = 20;
    this.spreadAngle = 0.1;
    this.projectileManager = projectileManager;
    this.id = uuidv4();
    this.weaponCode = 'VW01';
    
    // Bounce configuration
    this.bounciness = 0.02;          // Coefficient of restitution
    this.upwardBias = 0.01;           // Upward bias after bounce
    this.minVerticalVelocity = 0.05; // Minimum vertical component after bounce
    
    // Gravity settings
    this.defaultGravity = -500;      // Default gravity for bouncing projectiles
    this.noBounceGravity = -300;     // Different gravity for non-bouncing projectiles
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
    
    // Calculate how many projectiles of each type
    const projectilesPerType = Math.floor(this.projectileCount / 3);
    const extraProjectiles = this.projectileCount % 3;
    
    // How many of each type to create
    const doubleBounceCount = projectilesPerType + (extraProjectiles > 0 ? 1 : 0);
    const singleBounceCount = projectilesPerType + (extraProjectiles > 1 ? 1 : 0);
    const noBounceCount = projectilesPerType;

    // Create double bounce projectiles
    for (let i = 0; i < doubleBounceCount; i++) {
      projectilesData.push(this._createProjectile(
        spawnPos.clone(),
        this._getSpreadDirection(baseDirection),
        power,
        2, // Double bounce
        (i === doubleBounceCount - 1 && singleBounceCount === 0 && noBounceCount === 0), // Is final
        'double_bounce'
      ));
    }

    // Create single bounce projectiles
    for (let i = 0; i < singleBounceCount; i++) {
      projectilesData.push(this._createProjectile(
        spawnPos.clone(),
        this._getSpreadDirection(baseDirection),
        power,
        1, // Single bounce
        (i === singleBounceCount - 1 && noBounceCount === 0), // Is final
        'single_bounce'
      ));
    }

    // Create no bounce projectiles
    for (let i = 0; i < noBounceCount; i++) {
      projectilesData.push(this._createProjectile(
        spawnPos.clone(),
        this._getSpreadDirection(baseDirection),
        power,
        0, // No bounce
        (i === noBounceCount - 1), // Is final
        'no_bounce'
      ));
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
  
  /**
   * Create a projectile with the specified bounce behavior
   */
  _createProjectile(startPos, direction, power, bounceCount, isFinal, projectileType) {
    // Choose slightly different appearances based on bounce behavior
    let projectileStyle, projectileScale, explosionSize, explosionColor;
    
    switch (projectileType) {
      case 'double_bounce':
        projectileStyle = 'spike_bomb';
        projectileScale = 0.7;
        explosionSize = 1.2;
        explosionColor = 'blue';
        break;
      case 'single_bounce':
        projectileStyle = 'missile';
        projectileScale = 0.9;
        explosionSize = 1.5;
        explosionColor = 'orange';
        break;
      case 'no_bounce':
        projectileStyle = 'missile';
        projectileScale = 1.0;
        explosionSize = 1.8;
        explosionColor = 'red';
        break;
      default:
        projectileStyle = 'missile';
        projectileScale = 1.0;
        explosionSize = 1.5;
        explosionColor = 'yellow';
    }
    
    // Adjust damage based on bounce type to balance the weapon
    // More bounces = less damage but more unpredictable
    let baseDamage;
    switch (bounceCount) {
      case 2: baseDamage = 20; break; // Double bounce - least damage
      case 1: baseDamage = 25; break; // Single bounce - medium damage
      case 0: baseDamage = 30; break; // No bounce - most damage
      default: baseDamage = 25;
    }
    
    // Apply different gravity based on bounce count
    const gravity = bounceCount === 0 ? this.noBounceGravity : this.defaultGravity;
    
    return {
      startPos: startPos,
      direction: direction,
      power: power,
      
      // Bounce settings
      preImpactBounces: bounceCount,
      preImpactBouncePower: 200,
      bounciness: this.bounciness,
      upwardBias: this.upwardBias,
      minVerticalVelocity: this.minVerticalVelocity,

      timeFactor: 0.8,
      gravity: gravity,  // Apply the appropriate gravity
      
      // Visual effects for bounces
      bounceExplosion: false,
      bounceDamage: 0, // No damage on bounce
      bounceCraterSize: 5, // Small crater on bounce
      
      // Visual properties
      isFinalProjectile: isFinal,
      projectileStyle: projectileStyle,
      projectileScale: projectileScale,
      explosionSize: explosionSize,
      explosionType: 'normal',
      explosionColor: explosionColor,
      
      // Impact properties
      craterSize: 25,
      baseDamage: baseDamage,
      aoeSize: 50
    };
  }
  
  /**
   * Generate a direction with random spread
   */
  _getSpreadDirection(baseDirection) {
    // Add random spread
    const randomSpread = new THREE.Vector3(
      (Math.random() - 0.2) * this.spreadAngle,
      (Math.random() - 0.2) * this.spreadAngle,
      (Math.random() - 0.2) * this.spreadAngle
    );

    return baseDirection.clone().add(randomSpread).normalize();
  }
}