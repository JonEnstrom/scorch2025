// ClientProjectile.js
import * as THREE from 'three';
import { ProjectileWorkerPoolInstance } from './ProjectileWorkerPoolInstance.js';

export class ClientProjectile {
  constructor(projectileData, scene, terrainRenderer, particleSystem, model) {
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
    
    this.explosion = this.particleSystem.createBurstEmitter({
      particleCount: 16,
      particleSize: { min: 50, max: 80 },
      particleSizeEnd: { min: 20, max: 30 },
      lifeTime: { min: 1.0, max: 1.75 },
      color: new THREE.Color(0xff8800),
      colorEnd: new THREE.Color(0x666600),
      velocity: { 
        min: new THREE.Vector3(-70, 100, -70), 
        max: new THREE.Vector3(70, 0, 70) 
      },
      blending: THREE.NormalBlending,
      opacity: { min: 0.3, max: 0.3 },
      opacityEnd: { min: 0.0, max: 0.0 },
      rotationSpeed: { min: 0.0, max: 0.0 },
    });

    this.explosionFlash = this.particleSystem.createBurstEmitter({
      particleCount: 50,
      particleSize: { min: 20, max: 40 },
      particleSizeEnd: { min: 2, max: 4 },
      lifeTime: { min: 0.2, max: 0.2 },
      color: new THREE.Color(0xff0000),
      colorEnd: new THREE.Color(0xffff00),
      blending: THREE.NormalBlending,
      opacity: { min: 0.3, max: 0.3 },
      opacityEnd: { min: 0.0, max: 0.0 },
      rotationSpeed: { min: 0.0, max: 0.0 },
    });

    this.smoke = this.particleSystem.createBurstEmitter({
      texture: './particles/smoke.png',
      particleCount: 1,
      particleSize: { min: 50, max: 100 },
      particleSizeEnd: { min: 200, max: 1000 },
      lifeTime: { min: 10.0, max: 25.0 },
      color: new THREE.Color(0x333333),
      colorEnd: new THREE.Color(0x888888),
      velocity: { 
        min: new THREE.Vector3(0, 10, 0), 
        max: new THREE.Vector3(1, 50, 1) 
      },
      blending: THREE.NormalBlending,
      opacity: { min: 0.3, max: 0.3 },
      opacityEnd: { min: 0.0, max: 0.0 },
      rotationSpeed: { min: 0.0, max: 0.0 },
    });

    this.trail = this.particleSystem.createContinuousEmitter({
      emissionRate: 150, // Particles per second
      duration: -1,
      particleSize: { min: 2, max: 4 },
      particleSizeEnd: { min: 2, max: 4 },
      lifeTime: { min: 3, max: 5 },
      color: new THREE.Color(0x888899),
      colorEnd: new THREE.Color(0xaaaaaa),
      blending: THREE.NormalBlending,
      rotationSpeed: { min: 0.0, max: 0.0 },
      velocity: { 
        min: new THREE.Vector3(-0.2, -0.2, -0.2), 
        max: new THREE.Vector3(0.2, 0.2, 0.2) 
      },
      opacity: { min: 0.3, max: 0.5},
      opacityEnd: { min: 0.0, max: 0.0 },
      useDirectionalScaling: true,
      directionalScaling: 3.0
    });
    this.trail.activate();

    this.burnTrail = this.particleSystem.createContinuousEmitter({
      emissionRate: 40, // Particles per second
      duration: -1,
      particleSize: { min: 3, max: 3 },
      particleSizeEnd: { min: 2, max: 2 },
      lifeTime: { min: 0.05, max: 0.2 },
      color: new THREE.Color(0xff0000),
      colorEnd: new THREE.Color(0xffff00),
      blending: THREE.NormalBlending,
      rotationSpeed: { min: 0.0, max: 0.0 },
      velocity: { 
        min: new THREE.Vector3(-0.2, -0.2, -0.2), 
        max: new THREE.Vector3(0.2, 0.2, 0.2) 
      },
      opacity: { min: 1, max: 1},
      opacityEnd: { min: 0.5, max: 0.5 },
      useDirectionalScaling: true,
      directionalScaling: 3.0
    });
    this.burnTrail.activate();

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

    // Configure projectile style
    this.configureProjectile();
    
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

        let offsetDistance = 10;
        let offset = this.direction.clone().multiplyScalar(offsetDistance);
        this.trail.setPosition(this.position.clone().sub(offset));
        offsetDistance = 3;
        offset = this.direction.clone().multiplyScalar(offsetDistance);
        this.burnTrail.setPosition(this.position.clone().sub(offset));
        this.pendingTrajectoryUpdate = false;
      })
      .catch(err => {
        console.error("Trajectory update error: ", err);
        this.pendingTrajectoryUpdate = false;
      });

    this.pendingTrajectoryUpdate = true;
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
        trailConfig: {
          trailType: 'basic',
          trailSize: this.projectileScale,
          emitRate: 50
        },
        rotation: {
          type: 'velocity', 
          rotationAxis: null,
          rotationSpeed: 0
        }
      },
      balloon: {
        trailConfig: {
          trailType: 'none',
          trailSize: this.projectileScale,
          emitRate: 0
        },
        rotation: {
          type: 'constant', 
          rotationAxis: new THREE.Vector3(0, 1, 0).normalize(),
          rotationSpeed: 5
        }
      },
      bomblet: {
        trailConfig: {
          trailType: 'none',
          trailSize: 1,
          emitRate: 50
        },
        rotation: {
          type: 'constant',
          rotationAxis: new THREE.Vector3(0.3, 1, 0).normalize(),
          rotationSpeed: 200
        }
      },
      spike_bomb: {
        trailConfig: {
          trailType: 'basic',
          trailSize: 1,
          emitRate: 50
        },
        rotation: {
          type: 'constant',
          rotationAxis: new THREE.Vector3(0.3, 1, 0).normalize(),
          rotationSpeed: 50
        }
      },
      default: {
        trailConfig: {
          trailType: 'basic',
          trailSize: 1,
          emitRate: 30
        },
        rotation: {
          type: 'velocity',
          rotationAxis: null,
          rotationSpeed: 0
        }
      }
    };

    const config = styles[this.projectileStyle] || styles.default;
    this.trailConfig = {
      ...config.trailConfig,
      position: this.position,  // initial position
      trailId: `${this.projectileId}trail`
    };
    this.rotationConfig = config.rotation;
  }

  triggerExplosion(impactEvent) {
    this.explosion.setPosition(this.position);
    this.explosion.burst();
    this.explosionFlash.setPosition(this.position);
    this.explosionFlash.burst();
    this.smoke.setPosition(this.position);
    
    // Delay the smoke burst by 500ms (0.5 seconds)
    setTimeout(() => {
      this.smoke.burst();
    }, 500);
  
    this.trail.deactivate();
    this.burnTrail.deactivate();
  }
  
  getPosition() {
    return this.position;
  }

  destroy() {
    if (this.isDestroyed) return;
    this.isDestroyed = true;
    
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