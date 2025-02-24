// Updated AirStrikeWeapon.js with time-based physics
import { v4 as uuidv4 } from 'uuid';
import * as THREE from 'three';

export default class AirStrikeWeapon {
  constructor(projectileManager) {
    this.projectileManager = projectileManager;
    this.id = uuidv4();
    this.weaponCode = 'RF01';

    // Set your config
    this.strikeCount = 20;
    this.strikeDelay = 300;     // ms between bombs
    this.initialDelay = 4000;   // ms before first bomb
    this.altitude = 0;          // how high from carrier
    this.spreadAngle = Math.PI / 3; // random horizontal spread ±30°
    this.selfDestructDelay = 1000; // ms after last bomblet to self-destruct
    
    
    this.carrierTimeFactor = 2.0; 
    this.bombletTimeFactor = 1.0; // Normal speed for bomblets
    
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
      projectileStyle: 'balloon',
      projectileScale: 4,
      baseDamage: 0, // The carrier itself can do minimal damage
      
      // Custom physics for the carrier missile
      timeFactor: this.carrierTimeFactor,
      gravity: -150 // low gravity
    }];
  
    // 1) Simulate the carrier
    const timeline = this.projectileManager.simulateProjectiles(
      playerId,
      carrierData,
      this.id,
      this.weaponCode
    );
  
    // 2) Insert bombs as sub-projectiles
    const carrierId = (timeline.find(
      ev => ev.type === 'projectileSpawn' && ev.weaponId === this.id
    )?.projectileId) || null;
  
    if (!carrierId) {
      console.warn('No carrier found for AirStrikeWeapon');
    } else {
      let bombsRemaining = this.strikeCount;
      let nextBombTime = this.initialDelay;
      let lastBombTime = null;
      let carrierImpactTime = null;
      
      // Find if/when the carrier impacts something
      const carrierImpactEvent = timeline.find(
        ev => ev.projectileId === carrierId && ev.type === 'projectileImpact'
      );
      
      if (carrierImpactEvent) {
        carrierImpactTime = carrierImpactEvent.time;
      }
  
      while (bombsRemaining > 0) {
        // If carrier has already collided at this time, stop dropping bomblets
        if (carrierImpactTime !== null && nextBombTime >= carrierImpactTime) {
          break;
        }
        
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
          preImpactBounces: 1,
          preImpactBouncePower: 50,
          weaponId: this.id,
          weaponCode: this.weaponCode + '_BOMBLET',
          startPos: bombSpawnPos,
          direction: bombDir,
          power: 150,
          isFinalProjectile: false, // bombs themselves are not final
          explosionSize: 3.0,
          projectileStyle: 'bomblet',
          craterSize: 75,
          aoeSize: 150,
          baseDamage: 50,
          
          // Standard speed for bomblets
          timeFactor: this.bombletTimeFactor,
          gravity: -200
        };
  
        this.projectileManager.simulateSubProjectile(
          bombData,
          nextBombTime,
          timeline
        );
  
        bombsRemaining--;
        lastBombTime = nextBombTime;
        nextBombTime += this.strikeDelay;
      }
      
      // Add carrier self-destruct one second after the last bomblet is dropped
      if (lastBombTime !== null && (carrierImpactTime === null || lastBombTime + this.selfDestructDelay < carrierImpactTime)) {
        // Find the position at the self-destruct time
        const selfDestructTime = lastBombTime + this.selfDestructDelay;
        const eventsBeforeSelfDestruct = timeline.filter(ev =>
          ev.projectileId === carrierId && 
          ev.type === 'projectileMove' && 
          ev.time <= selfDestructTime
        );
        
        if (eventsBeforeSelfDestruct.length) {
          const lastPos = eventsBeforeSelfDestruct[eventsBeforeSelfDestruct.length - 1].position;
          
          // Add a manual impact event to timeline
          const selfDestructEvent = {
            type: 'projectileImpact',
            time: selfDestructTime,
            position: new THREE.Vector3(lastPos.x, lastPos.y, lastPos.z),
            projectileId: carrierId,
            playerId: playerId,
            weaponId: this.id,
            weaponCode: this.weaponCode,
            explosionSize: 0.2,  // small explosion for carrier
            craterSize: 10,
            aoeSize: 100,
            baseDamage: 20,      // Minimal damage from carrier explosion
            impactType: 'self-destruct'
          };
          
          // Remove any carrier events after self-destruct
          const filteredTimeline = timeline.filter(ev => 
            !(ev.projectileId === carrierId && ev.time > selfDestructTime)
          );
          
          // Add our self-destruct event
          filteredTimeline.push(selfDestructEvent);
          
          // Sort the timeline by time
          filteredTimeline.sort((a, b) => a.time - b.time);
          
          // Replace the original timeline
          timeline.length = 0;
          timeline.push(...filteredTimeline);
        }
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
    // Handle carrier impact - we now have special handling for self-destruct impacts
    if (impactEvent.impactType === 'self-destruct') {
      // Custom handling for self-destruct event if needed
      console.log('Carrier self-destructed after dropping all bomblets');
    }
  }

  destroy() {
    this.projectileManager.weaponHandlers.delete(this.id);
  }
}