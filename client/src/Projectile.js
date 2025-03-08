// ClientProjectile.js
import * as THREE from 'three';
import { ProjectileWorkerPoolInstance } from './ProjectileWorkerPoolInstance.js';

export class ClientProjectile {
  constructor(projectileData, scene, terrainRenderer, particleSystem, model, emitterPool) {
    const {
      projectileId,
      playerId,
      startPos,
      direction,
      power,
      weaponId,
      weaponCode,
      projectileStyle,
      projectileScale,
      explosionType,
      explosionSize,
      craterSize,
      isFinalProjectile
    } = projectileData;

    this.projectileId = projectileId;
    this.playerId = playerId;
    this.weaponId = weaponId;
    this.weaponCode = weaponCode;
    this.particleSystem = particleSystem;
    this.emitterPool = emitterPool;
    
    // Position management
    this.position = new THREE.Vector3(startPos.x, startPos.y, startPos.z);
    this.currentPosition = new THREE.Vector3(startPos.x, startPos.y, startPos.z);
    this.direction = new THREE.Vector3(direction.x, direction.y, direction.z).normalize();

    // New trajectory-based properties
    this.trajectory = [];  // Will be populated with plain {time, position: {x,y,z}, isImpact?} points
    this.currentTrajectoryIndex = 0;
    this.impactTime = null;

    // Visual properties
    this.projectileStyle = projectileStyle;
    this.projectileScale = projectileScale || 1;
    this.explosionType = explosionType || 'normal';
    this.explosionSize = explosionSize || 1;
    this.craterSize = craterSize || 20;
    this.isFinalProjectile = isFinalProjectile || false;

    // Scene references
    this.scene = scene;
    this.terrainRenderer = terrainRenderer;

    this.isDestroyed = false;

    // For offloading trajectory calculations
    this.pendingTrajectoryUpdate = false;

    // Configure projectile style - must be called before setting up emitters
    this.configureProjectile();
    
    // Initialize emitters based on the configuration
    this.setupEmitters();
    
    // Set up the model - directly use the provided model
    this.mesh = model;
    if (this.mesh) {
      this.mesh.position.copy(this.position);
      this.scene.add(this.mesh);
      
      // Apply initial orientation
      if (this.rotationConfig && this.rotationConfig.type === 'velocity') {
        this.setOrientation(this.direction);
      }
    }
  }

  setupEmitters() {
    // Always borrow explosion-related emitters
    this.explosion = this.emitterPool.borrowEmitter('explosion', this.projectileId);
    this.explosionFlash = this.emitterPool.borrowEmitter('explosionFlash', this.projectileId);
    this.smoke = this.emitterPool.borrowEmitter('smoke', this.projectileId);
    
    // Only borrow trail emitters if the configuration requires them
    if (this.trailType !== 'none') {
      this.trail = this.emitterPool.borrowEmitter(this.trailType, this.projectileId);
      if (this.trail) {
        this.trail.activate();
      }
    }
    
    if (this.burnTrailType !== 'none') {
      this.burnTrail = this.emitterPool.borrowEmitter(this.burnTrailType, this.projectileId);
      if (this.burnTrail) {
        this.burnTrail.activate();
      }
    }
  }

  hide() {
    if (this.mesh) {
      this.mesh.visible = false;
    }
    
    // Also hide any active particle emitters
    if (this.trail) {
      this.trail.deactivate();
    }
    
    if (this.burnTrail) {
      this.burnTrail.deactivate();
    }
  }
  
  show() {
    if (this.mesh) {
      this.mesh.visible = true;
    }
    
    // Re-activate continuous emitters if they exist
    if (this.trail) {
      this.trail.activate();
    }
    
    if (this.burnTrail) {
      this.burnTrail.activate();
    }
  }

  // Set the complete trajectory data.
  setTrajectory(trajectoryPoints) {
    this.trajectory = trajectoryPoints.map(point => ({
      time: point.time,
      position: { x: point.position.x, y: point.position.y, z: point.position.z },
      isImpact: point.isImpact || false
    }));
    
    // Check if the last point is an impact point
    const lastPoint = this.trajectory[this.trajectory.length - 1];
    if (lastPoint.isImpact) {
      this.impactTime = lastPoint.time;
    }
  }

  // Offloaded trajectory update using web workers.
  updateTrajectoryPosition(currentTime) {
    if (!this.trajectory || this.trajectory.length < 2) return;
    if (this.pendingTrajectoryUpdate) return; // avoid multiple overlapping requests

    // Save current position to compute movement delta later.
    const prevPosition = { x: this.position.x, y: this.position.y, z: this.position.z };

    ProjectileWorkerPoolInstance.calculateTrajectoryPosition(this.trajectory, currentTime)
      .then(result => {
        const newPos = result.position;
        this.currentPosition.set(newPos.x, newPos.y, newPos.z);
        this.position.copy(this.currentPosition);

        // Calculate movement delta to update direction.
        const moveDelta = new THREE.Vector3(
          this.position.x - prevPosition.x,
          this.position.y - prevPosition.y,
          this.position.z - prevPosition.z
        );
        if (moveDelta.lengthSq() > 0.00001) {
          this.direction.copy(moveDelta).normalize();
          if (this.rotationConfig && this.rotationConfig.type === 'velocity') {
            this.setOrientation(this.direction);
          }
        }

        // Update mesh position.
        if (this.mesh) {
          this.mesh.position.copy(this.position);
        }

        // Update trail positions
        this.updateTrailPositions();
        
        this.pendingTrajectoryUpdate = false;
      })
      .catch(err => {
        console.error("Trajectory update error: ", err);
        this.pendingTrajectoryUpdate = false;
      });

    this.pendingTrajectoryUpdate = true;
  }
  
  updateTrailPositions() {
    if (this.trail) {
      let offsetDistance = 3;
      let offset = this.direction.clone().multiplyScalar(offsetDistance);
      this.trail.setPosition(this.position.clone().sub(offset));
    }
    
    if (this.burnTrail) {
      let offsetDistance = 0.5;
      let offset = this.direction.clone().multiplyScalar(offsetDistance);
      this.burnTrail.setPosition(this.position.clone().sub(offset));
    }
  }
  
  // Update visual elements (like rotation)
  updateVisual(deltaTime) {
    if (this.isDestroyed || !this.mesh) return;
    
    if (this.rotationConfig && this.rotationConfig.type === 'constant') {
      const rotationAmount = THREE.MathUtils.degToRad(
        this.rotationConfig.rotationSpeed
      ) * deltaTime;
      this.mesh.rotateOnAxis(this.rotationConfig.rotationAxis, rotationAmount);
    }
  }
  
  setOrientation(direction) {
    if (!this.mesh) return;
    
    const forward = new THREE.Vector3(direction.x, direction.y, direction.z).normalize();
    const up = new THREE.Vector3(0, 1, 0);
    const matrix = new THREE.Matrix4();
    matrix.lookAt(new THREE.Vector3(0, 0, 0), forward, up);
    const q = new THREE.Quaternion().setFromRotationMatrix(matrix);
    this.mesh.quaternion.copy(q);
  }

  configureProjectile() {
    const styles = {
      missile: {
        trailType: 'trail',
        burnTrailType: 'burnTrail',
        rotation: {
          type: 'velocity', 
          rotationAxis: null,
          rotationSpeed: 0
        }
      },
      balloon: {
        trailType: 'none',
        burnTrailType: 'none',
        rotation: {
          type: 'constant', 
          rotationAxis: new THREE.Vector3(0, 1, 0).normalize(),
          rotationSpeed: 5
        }
      },
      bomblet: {
        trailType: 'none',
        burnTrailType: 'smallTrail',
        rotation: {
          type: 'constant',
          rotationAxis: new THREE.Vector3(0.3, 1, 0).normalize(),
          rotationSpeed: 200
        }
      },
      parabomblet: {
        trailType: 'none',
        burnTrailType: 'smallTrail',
        rotation: {
          type: 'constant',
          rotationAxis: new THREE.Vector3(0.3, 1, 0).normalize(),
          rotationSpeed: 200
        }
      },
      spike_bomb: {
        trailType: 'smallTrail',
        burnTrailType: 'none',
        rotation: {
          type: 'constant',
          rotationAxis: new THREE.Vector3(0.3, 1, 0).normalize(),
          rotationSpeed: 50
        }
      },
      default: {
        trailType: 'trail',
        burnTrailType: 'burnTrail',
        rotation: {
          type: 'velocity',
          rotationAxis: null,
          rotationSpeed: 0
        }
      }
    };

    const config = styles[this.projectileStyle] || styles.default;
    this.trailType = config.trailType;
    this.burnTrailType = config.burnTrailType;
    this.rotationConfig = config.rotation;
  }

  triggerExplosion(impactEvent) {
    // Use the pooled emitters for explosions
    if (this.explosion) {
      const explosion = this.explosion; // Capture the reference
      explosion.setPosition(this.position);
      explosion.burst();
      
      // Return the explosion emitter to the pool after a delay
      setTimeout(() => {
        this.emitterPool.returnEmitter('explosion', this.projectileId);
        this.explosion = null;
      }, 2000); // After particles should be complete
    }
    
    if (this.explosionFlash) {
      const explosionFlash = this.explosionFlash; // Capture the reference
      explosionFlash.setPosition(this.position);
      explosionFlash.burst();
      
      // Return the flash emitter to the pool after a delay
      setTimeout(() => {
        this.emitterPool.returnEmitter('explosionFlash', this.projectileId);
        this.explosionFlash = null;
      }, 500); // After flash should be complete
    }
    
    if (this.smoke) {
      const smoke = this.smoke; // Capture the reference
      const projectileId = this.projectileId; // Capture the ID
      const emitterPool = this.emitterPool; // Capture the pool
      const position = this.position.clone(); // Clone the position
      
      smoke.setPosition(position);
      
      // Delay the smoke burst by 500ms
      setTimeout(() => {
        // Check if the smoke effect still exists (hasn't been returned to pool)
        smoke.burst();
        
        // Return the smoke emitter after a delay
        setTimeout(() => {
          emitterPool.returnEmitter('smoke', projectileId);
          // No need to set this.smoke = null here since we're using the local reference
          if (this.smoke === smoke) {
            this.smoke = null;
          }
        }, 10000); // After smoke should be complete
      }, 500);
    }
  
    // Deactivate and return trail emitters
    if (this.trail) {
      this.emitterPool.deactivateAndReturnEmitter(this.trailType, this.projectileId);
      this.trail = null;
    }
    
    if (this.burnTrail) {
      this.emitterPool.deactivateAndReturnEmitter(this.burnTrailType, this.projectileId);
      this.burnTrail = null;
    }
  }
  
  getPosition() {
    return this.position;
  }

  destroy() {
    if (this.isDestroyed) return;
    this.isDestroyed = true;
    
    // Return all emitters to the pool
    if (this.emitterPool) {
      if (this.trail) {
        this.emitterPool.deactivateAndReturnEmitter(this.trailType, this.projectileId);
        this.trail = null;
      }
      
      if (this.burnTrail) {
        this.emitterPool.deactivateAndReturnEmitter(this.burnTrailType, this.projectileId);
        this.burnTrail = null;
      }
      
      // For one-time emitters that might not have been used yet
      if (this.explosion) {
        this.emitterPool.returnEmitter('explosion', this.projectileId);
        this.explosion = null;
      }
      
      if (this.explosionFlash) {
        this.emitterPool.returnEmitter('explosionFlash', this.projectileId);
        this.explosionFlash = null;
      }
      
      if (this.smoke) {
        this.emitterPool.returnEmitter('smoke', this.projectileId);
        this.smoke = null;
      }
    }
    
    if (this.mesh) {
      this.scene.remove(this.mesh);
      this.mesh.traverse((child) => {
        if (child.isMesh) {
          if (child.geometry) child.geometry.dispose();
          if (child.material) {
            if (Array.isArray(child.material)) {
              child.material.forEach(mat => mat.dispose());
            } else {
              child.material.dispose();
            }
          }
        }
      });
      this.mesh = null;
    }
    
    this.trajectory = null;
    this.scene = null;
    this.terrainRenderer = null;
  }
}