// helicopterEmitters.js - Manages particle emitters for helicopter visual effects
import * as THREE from 'three';

class HelicopterEmitters {
  constructor(emitterPool) {
    this.emitterPool = emitterPool;
    this.debrisPieces = [];
  }

  // Method to attach trail emitters to helicopters
  attachHelicopterTrailEmitters(helicopter) {
    if (!this.emitterPool) return;
    
    // Create unique IDs for this helicopter's emitters
    const mainRotorTrailId = `helicopter_${helicopter.id}_mainRotor_trail`;
    const tailRotorTrailId = `helicopter_${helicopter.id}_tailRotor_trail`;
    const crashSmokeTrailId = `helicopter_${helicopter.id}_crashSmoke_trail`;
    
    // Get trail emitters from the pool for main rotor and tail rotor
    const mainRotorEmitter = this.emitterPool.borrowEmitter('trail', mainRotorTrailId);
    const tailRotorEmitter = this.emitterPool.borrowEmitter('trail', tailRotorTrailId);
    this.crashSmokeEmitter = this.emitterPool.borrowEmitter('heliTrail', crashSmokeTrailId);
    
    if (mainRotorEmitter) {
      // Position at main rotor tips
      const mainRotor = helicopter.model.getObjectByName('mainRotor');
      if (mainRotor) {
        // Get world position of main rotor
        const position = new THREE.Vector3();
        mainRotor.getWorldPosition(position);
        // Offset position to rotor tips
        position.y += 0.5; // Slight offset upwards
        
        mainRotorEmitter.setPosition(position);
       // mainRotorEmitter.activate();
      }
    }
    
    if (tailRotorEmitter) {
      // Position at tail rotor
      const tailRotor = helicopter.model.getObjectByName('tailRotor');
      if (tailRotor) {
        // Get world position of tail rotor
        const position = new THREE.Vector3();
        tailRotor.getWorldPosition(position);
        
        tailRotorEmitter.setPosition(position);
        //tailRotorEmitter.activate();
      }
    }
      
    // Store emitters with helicopter
    helicopter.trailEmitters = {
      mainRotor: { emitter: mainRotorEmitter, id: mainRotorTrailId },
      tailRotor: { emitter: tailRotorEmitter, id: tailRotorTrailId },
    };
  }

  // Method to create and attach smoke/burn trail emitters to debris
  attachDebrisTrailEmitters(debris, isBurning = false) {
    if (!this.emitterPool) return;
    
    // Create a unique ID for this debris
    const debrisTrailId = `debris_${debris.uuid}_${isBurning ? 'burn' : 'smoke'}`;
    
    // Get appropriate emitter from the pool
    const emitterType = isBurning ? 'burnTrail' : 'smoke';
    const trailEmitter = this.emitterPool.borrowEmitter(emitterType, debrisTrailId);
    
    if (trailEmitter) {
      // Position at debris center
      trailEmitter.setPosition(debris.position.x, debris.position.y, debris.position.z);
      trailEmitter.activate();
      
      // Store emitter with debris
      const emitterKey = isBurning ? 'burnTrailEmitter' : 'smokeTrailEmitter';
      debris.userData[emitterKey] = { emitter: trailEmitter, id: debrisTrailId };
    }
    
    return trailEmitter;
  }

  createHelicopterBodySmokeTrail(helibody) {
    const debrisTrailId = `helicopter_body_smoke_trail'}`;
    const trailEmitter = this.emitterPool.borrowEmitter('heliTrail', debrisTrailId);
    
    if (trailEmitter) {
      // Position at debris center
      trailEmitter.setPosition(helibody.position.x, helibody.position.y, helibody.position.z);
      trailEmitter.activate();
      
      // Store emitter with debris
      helibody.userData['smokeTrailEmitter'] = { emitter: trailEmitter, id: debrisTrailId };
    }
    
    return trailEmitter;
  }

  // Create explosion emitter for helicopter destruction
  createExplosionEmitters(position) {
    if (!this.emitterPool) return;
    
    // Create unique IDs for this explosion
    const explosionId = `explosion_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const flashId = `flash_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Get emitters from the pool
    const explosionEmitter = this.emitterPool.borrowEmitter('explosion', explosionId);
    const flashEmitter = this.emitterPool.borrowEmitter('explosionFlash', flashId);
    
    if (explosionEmitter) {
      explosionEmitter.setPosition(position.x, position.y, position.z);
      explosionEmitter.burst();
    }
    
    if (flashEmitter) {
      flashEmitter.setPosition(position.x, position.y, position.z);
      flashEmitter.burst();
    }
  }

  // Update positions of all trail emitters
  updateTrailEmitters(deltaTime, helicopters) {
    if (!this.emitterPool) return;
    
    // Update helicopter trail emitters
    helicopters.forEach(helicopter => {
      if (helicopter.trailEmitters) {
        // Get main rotor
        const mainRotor = helicopter.model.getObjectByName('mainRotor');
        if (mainRotor && helicopter.trailEmitters.mainRotor && helicopter.trailEmitters.mainRotor.emitter) {
          // Get world position of main rotor
          const position = new THREE.Vector3();
          mainRotor.getWorldPosition(position);
          
          // Apply slight offset based on rotation to create circular trail effect
          const tipOffset = 4.0; // Distance from center to tip
          const rotationY = mainRotor.rotation.y;
          
          // Create multiple trail points around the rotor for a more realistic effect
          for (let i = 0; i < 2; i++) {
            const angle = rotationY + (i * Math.PI);
            const trailPosition = new THREE.Vector3(
              position.x + Math.cos(angle) * tipOffset,
              position.y,
              position.z + Math.sin(angle) * tipOffset
            );
            helicopter.trailEmitters.mainRotor.emitter.setPosition(trailPosition);
          }
        }
        
        // Get tail rotor
        const tailRotor = helicopter.model.getObjectByName('tailRotor');
        if (tailRotor && helicopter.trailEmitters.tailRotor && helicopter.trailEmitters.tailRotor.emitter) {
          // Get world position of tail rotor
          const position = new THREE.Vector3();
          tailRotor.getWorldPosition(position);
          
          helicopter.trailEmitters.tailRotor.emitter.setPosition(position);
        }
      }
    });
    
    // Update debris trail emitters
    if (this.debrisPieces) {
      for (const debris of this.debrisPieces) {
        // Update smoke trail emitter
        if (debris.userData.smokeTrailEmitter && debris.userData.smokeTrailEmitter.emitter) {
          debris.userData.smokeTrailEmitter.emitter.setPosition(debris.position);
        }
        
        // Update burn trail emitter
        if (debris.userData.burnTrailEmitter && debris.userData.burnTrailEmitter.emitter) {
          debris.userData.burnTrailEmitter.emitter.setPosition(debris.position);
        }
      }
    }
  }

  // Clean up trail emitters for a helicopter
  cleanupHelicopterTrailEmitters(helicopter) {
    if (!this.emitterPool || !helicopter.trailEmitters) return;
    
    if (helicopter.trailEmitters.mainRotor) {
      this.emitterPool.deactivateAndReturnEmitter('trail', helicopter.trailEmitters.mainRotor.id);
    }
    
    if (helicopter.trailEmitters.tailRotor) {
      this.emitterPool.deactivateAndReturnEmitter('trail', helicopter.trailEmitters.tailRotor.id);
    }
    
    helicopter.trailEmitters = null;
  }

  // Clean up trail emitters for debris
  cleanupDebrisTrailEmitters(debris) {
    if (!this.emitterPool) return;
    
    // Clean up smoke trail emitter
    if (debris.userData.smokeTrailEmitter) {
      this.emitterPool.deactivateAndReturnEmitter('smoke', debris.userData.smokeTrailEmitter.id);
      debris.userData.smokeTrailEmitter = null;
    }
    
    // Clean up burn trail emitter
    if (debris.userData.burnTrailEmitter) {
      this.emitterPool.deactivateAndReturnEmitter('burnTrail', debris.userData.burnTrailEmitter.id);
      debris.userData.burnTrailEmitter = null;
    }
  }

  // Add a debris piece to be tracked for emitter updates
  addDebrisPiece(debris) {
    if (!this.debrisPieces) {
      this.debrisPieces = [];
    }
    this.debrisPieces.push(debris);
  }

  // Get the current debris pieces array
  getDebrisPieces() {
    return this.debrisPieces;
  }

  // Set the debris pieces array
  setDebrisPieces(pieces) {
    this.debrisPieces = pieces;
  }
}

export { HelicopterEmitters };