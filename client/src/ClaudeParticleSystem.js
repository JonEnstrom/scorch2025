/**
 * CPU-based Particle System for Three.js
 * Features:
 * - Object pooling for performance
 * - Continuous emitters (trails)
 * - Burst emitters (explosions)
 * - Configurable particle properties
 * - Efficient updates via attribute modification
 */

import * as THREE from 'three';

/**
 * Individual particle class
 * Not exposed directly - managed by the pool and emitters
 */
class Particle {
  constructor() {
    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.acceleration = new THREE.Vector3();
    this.direction = new THREE.Vector3(0, 0, 1); // Store direction for scaling
    this.directionScaling = 1.0;                 // Scaling factor along direction
    this.color = new THREE.Color();
    this.startColor = new THREE.Color();
    this.endColor = new THREE.Color();
    this.size = 1.0;
    this.startSize = 1.0;
    this.endSize = 0.0;
    this.opacity = 1.0;
    this.startOpacity = 1.0;
    this.endOpacity = 0.0;
    this.rotation = 0;
    this.rotationSpeed = 0;
    this.life = 0;
    this.maxLife = 1;
    this.active = false;
    this.useDirectionalScaling = false; // Whether to use directional scaling
  }
  
  reset() {
    this.position.set(0, 0, 0);
    this.velocity.set(0, 0, 0);
    this.acceleration.set(0, 0, 0);
    this.direction.set(0, 0, 1);         // Reset direction
    this.directionScaling = 1.0;         // Reset directional scaling
    this.color.set(0xffffff);
    this.startColor.set(0xffffff);
    this.endColor.set(0xffffff);
    this.size = 1.0;
    this.startSize = 1.0;
    this.endSize = 0.0;
    this.opacity = 1.0;
    this.startOpacity = 1.0;
    this.endOpacity = 0.0;
    this.rotation = 0;
    this.rotationSpeed = 0;
    this.life = 0;
    this.maxLife = 1;
    this.active = false;
    this.useDirectionalScaling = false;  // Reset directional scaling flag
    return this;
  }

  update(deltaTime) {
    if (!this.active) return false;
    
    this.life += deltaTime;
    
    if (this.life >= this.maxLife) {
      this.active = false;
      return false;
    }
    
    // Normalize life for interpolation (0 to 1)
    const normalizedLife = this.life / this.maxLife;
    
    // Update velocity based on acceleration
    this.velocity.add(this.acceleration.clone().multiplyScalar(deltaTime));
    
    // Update position based on velocity
    this.position.add(this.velocity.clone().multiplyScalar(deltaTime));
    
    // Update size (linear interpolation)
    this.size = this.startSize + (this.endSize - this.startSize) * normalizedLife;
    
    // Update color (linear interpolation)
    this.color.copy(this.startColor).lerp(this.endColor, normalizedLife);
    
    // Update opacity (linear interpolation)
    this.opacity = this.startOpacity + (this.endOpacity - this.startOpacity) * normalizedLife;
    
    // Update rotation
    this.rotation += this.rotationSpeed * deltaTime;
    
    return true;
  }
}
/**
 * Manages a pool of particles for reuse
 */
class ParticlePool {
  constructor(maxParticles = 10000) {
    this.maxParticles = maxParticles;
    this.availableParticles = [];
    this.activeParticles = [];
    
    // Pre-create all particles
    for (let i = 0; i < maxParticles; i++) {
      this.availableParticles.push(new Particle());
    }
  }
  
  getParticle() {
    // If we have available particles, use one
    if (this.availableParticles.length > 0) {
      const particle = this.availableParticles.pop().reset();
      this.activeParticles.push(particle);
      return particle;
    }
    
    // If we don't have available particles but haven't reached max, create a new one
    if (this.activeParticles.length < this.maxParticles) {
      const particle = new Particle();
      this.activeParticles.push(particle);
      return particle;
    }
    
    // If we're at max capacity, return null
    return null;
  }
  
  releaseParticle(particle) {
    const index = this.activeParticles.indexOf(particle);
    if (index !== -1) {
      this.activeParticles.splice(index, 1);
      this.availableParticles.push(particle);
    }
  }
  
  update(deltaTime) {
    let i = this.activeParticles.length;
    
    while (i--) {
      const particle = this.activeParticles[i];
      const isAlive = particle.update(deltaTime);
      
      if (!isAlive) {
        this.activeParticles.splice(i, 1);
        this.availableParticles.push(particle);
      }
    }
  }
  
  getActiveCount() {
    return this.activeParticles.length;
  }
  
  getAvailableCount() {
    return this.availableParticles.length;
  }
}

/**
 * Base emitter class with common functionality
 */
class ParticleEmitter {
  constructor(options = {}) {
    this.position = new THREE.Vector3();
    this.rotation = new THREE.Euler();
    this.scale = new THREE.Vector3(1, 1, 1);
    
    // Default options
    this.options = {
      maxParticles: options.maxParticles || 5000,
      particleSize: options.particleSize || { min: 0.1, max: 0.5 },
      particleSizeEnd: options.particleSizeEnd || { min: 0, max: 0.1 },
      lifeTime: options.lifeTime || { min: 0.5, max: 2.0 },
      velocity: options.velocity || { min: new THREE.Vector3(-1, -1, -1), max: new THREE.Vector3(1, 1, 1) },
      acceleration: options.acceleration || new THREE.Vector3(0, -0.1, 0),
      rotationSpeed: options.rotationSpeed || { min: -Math.PI, max: Math.PI },
      color: options.color || new THREE.Color(0xffffff),
      colorEnd: options.colorEnd || new THREE.Color(0xffffff),
      opacity: options.opacity || { min: 1.0, max: 1.0 },
      opacityEnd: options.opacityEnd || { min: 0.0, max: 0.0 },
      blending: options.blending || THREE.AdditiveBlending,
      texture: options.texture || null,
      directionalScaling: options.directionalScaling || 1.0, // New option for trail scaling
      useDirectionalScaling: options.useDirectionalScaling || false // Whether to use directional scaling
    };

      this.active = false;
      this.pool = null; // Set by the ParticleSystem when added
      this.particleGeometry = options.particleGeometry || this._createDefaultGeometry();
      this.particleMaterial = options.particleMaterial || this._createDefaultMaterial();
      
      // Create the points object for rendering (done via instanced mesh in ParticleSystem)
      this.mesh = null; // Will be initialized when system is set
    }

  _createDefaultGeometry() {
    // Create a simple quad for each particle
    const geometry = new THREE.PlaneGeometry(1, 1, 1, 1);
    geometry.computeBoundingSphere();
    return geometry;
  }
  
  _createDefaultMaterial() {
    // Create a texture for the particles
    const texture = this.options.texture || this._createDefaultTexture();
    
    return new THREE.MeshBasicMaterial({
      map: texture,
      blending: this.options.blending,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      alphaTest: 0.5 // Helps with sorting transparent particles
    });
  }
  
  _createDefaultTexture() {
    // Create a default particle texture (a simple soft circle)
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    
    const context = canvas.getContext('2d');
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = canvas.width / 2 - 4;
    
    // Create radial gradient for a soft-edged particle
    const gradient = context.createRadialGradient(
      centerX, centerY, 0,
      centerX, centerY, radius
    );
    gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
    gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.8)');
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    
    // Draw the circle
    context.fillStyle = gradient;
    context.beginPath();
    context.arc(centerX, centerY, radius, 0, Math.PI * 2);
    context.fill();
    
    const texture = new THREE.CanvasTexture(canvas);
    return texture;
  }
  
  setPosition(x, y, z) {
    if (x instanceof THREE.Vector3) {
      this.position.copy(x);
    } else {
      this.position.set(x, y, z);
    }
    return this;
  }
  
  setRotation(x, y, z) {
    if (x instanceof THREE.Euler) {
      this.rotation.copy(x);
    } else {
      this.rotation.set(x, y, z);
    }
    return this;
  }
  
  setPool(pool) {
    this.pool = pool;
    return this;
  }
  
  setSystem(system) {
    this.system = system;
    
    // Load texture if it's a string path
    if (typeof this.options.texture === 'string' && this.system && this.system.loadTexture) {
      this.options.texture = this.system.loadTexture(this.options.texture);
    }
    
    return this;
  }
  
  _initializeParticle(particle) {
    // Reset and activate particle
    particle.reset();
    particle.active = true;
    
    // Position
    particle.position.copy(this.position);
    
    // Random velocity within range, considering rotation
    const velocity = new THREE.Vector3(
      THREE.MathUtils.randFloat(this.options.velocity.min.x, this.options.velocity.max.x),
      THREE.MathUtils.randFloat(this.options.velocity.min.y, this.options.velocity.max.y),
      THREE.MathUtils.randFloat(this.options.velocity.min.z, this.options.velocity.max.z)
    );
    
    // Apply emitter rotation to the velocity
    velocity.applyEuler(this.rotation);
    particle.velocity.copy(velocity);
    
    // Acceleration
    particle.acceleration.copy(this.options.acceleration);
    
    // Life
    particle.maxLife = THREE.MathUtils.randFloat(
      this.options.lifeTime.min,
      this.options.lifeTime.max
    );
    
    // Size
    particle.startSize = THREE.MathUtils.randFloat(
      this.options.particleSize.min,
      this.options.particleSize.max
    );
    particle.endSize = THREE.MathUtils.randFloat(
      this.options.particleSizeEnd.min,
      this.options.particleSizeEnd.max
    );
    particle.size = particle.startSize;
    
    // Color
    particle.startColor.copy(this.options.color);
    particle.endColor.copy(this.options.colorEnd);
    particle.color.copy(particle.startColor);
    
    // Opacity
    particle.startOpacity = THREE.MathUtils.randFloat(
      this.options.opacity.min,
      this.options.opacity.max
    );
    particle.endOpacity = THREE.MathUtils.randFloat(
      this.options.opacityEnd.min,
      this.options.opacityEnd.max
    );
    particle.opacity = particle.startOpacity;
    
    // Rotation
    particle.rotationSpeed = THREE.MathUtils.randFloat(
      this.options.rotationSpeed.min,
      this.options.rotationSpeed.max
    );
    
    return particle;
  }
  
  update(deltaTime) {
    // Implemented by subclasses
  }
  
  activate() {
    this.active = true;
    return this;
  }
  
  deactivate() {
    this.active = false;
    return this;
  }
}

/**
 * Burst emitter for explosions
 */
class BurstEmitter extends ParticleEmitter {
  constructor(options = {}) {
    super(options);
    
    // Burst-specific options
    this.burstOptions = {
      particleCount: options.particleCount || 100,
      duration: options.duration || 0.2,
      repeatDelay: options.repeatDelay || 0,
      repeats: options.repeats || 0,
    };
    
    this.burstTimer = 0;
    this.repeatTimer = 0;
    this.repeatCount = 0;
    this.bursting = false;
  }
  
  burst() {
    if (!this.pool) return this;
    
    this.bursting = true;
    this.burstTimer = 0;
    this.activate();
    
    return this;
  }
  
  update(deltaTime) {
    if (!this.active) return;
    
    if (this.bursting) {
      this.burstTimer += deltaTime;
      
      const progress = Math.min(this.burstTimer / this.burstOptions.duration, 1.0);
      const prevProgress = Math.min((this.burstTimer - deltaTime) / this.burstOptions.duration, 1.0);
      
      const particlesToEmit = Math.floor(this.burstOptions.particleCount * progress)
                            - Math.floor(this.burstOptions.particleCount * prevProgress);
      
      for (let i = 0; i < particlesToEmit; i++) {
        const particle = this.pool.getParticle();
        if (particle) {
          this._initializeParticle(particle);
        }
      }
      
      if (progress >= 1.0) {
        this.bursting = false;
        
        if (this.burstOptions.repeats === -1 || this.repeatCount < this.burstOptions.repeats) {
          this.repeatTimer = this.burstOptions.repeatDelay;
          this.repeatCount++;
        } else {
          this.deactivate();
          this.repeatCount = 0;
        }
      }
    } else if (this.repeatTimer > 0) {
      this.repeatTimer -= deltaTime;
      
      if (this.repeatTimer <= 0) {
        this.burst();
      }
    }
  }
}

/**
 * Continuous emitter for trails
 */
class ContinuousEmitter extends ParticleEmitter {
  constructor(options = {}) {
    super(options);
    
    // Continuous-specific options
    this.continuousOptions = {
      emissionRate: options.emissionRate || 10, // particles per second
      duration: options.duration || -1, // -1 for infinite
    };
    
    this.emissionTimer = 0;
    this.durationTimer = 0;
    
    // Track previous position for path interpolation and direction
    this.previousPosition = new THREE.Vector3();
    this.previousPosition.copy(this.position);
    this.movementDirection = new THREE.Vector3(0, 0, 1); // Direction of movement
  }
  
  // Override setPosition to track changes and update direction
  setPosition(x, y, z) {
    // Store current position as previous before updating
    this.previousPosition.copy(this.position);
    
    // Call the parent implementation
    if (x instanceof THREE.Vector3) {
      this.position.copy(x);
    } else {
      this.position.set(x, y, z);
    }
    
    // Calculate movement direction
    this.movementDirection.subVectors(this.position, this.previousPosition);
    const length = this.movementDirection.length();
    if (length > 0.0001) {
      this.movementDirection.divideScalar(length); // Normalize
    }
    
    return this;
  }  
  update(deltaTime) {
    if (!this.active || !this.pool) return;
    
    // Check duration
    if (this.continuousOptions.duration > 0) {
      this.durationTimer += deltaTime;
      
      if (this.durationTimer >= this.continuousOptions.duration) {
        this.deactivate();
        this.durationTimer = 0;
        return;
      }
    }
    
    // Emit particles based on emission rate
    this.emissionTimer += deltaTime;
    const particlesToEmit = Math.floor(this.continuousOptions.emissionRate * this.emissionTimer);
    
    if (particlesToEmit > 0) {
      this.emissionTimer -= particlesToEmit / this.continuousOptions.emissionRate;
      
      // Calculate vector from previous to current position
      const direction = new THREE.Vector3().subVectors(this.position, this.previousPosition);
      const distance = direction.length();
      
      // Only spread particles if the emitter has moved a noticeable amount
      if (distance > 0.001) {
        // Normalize if there's significant movement
        direction.normalize();
        
        // Emit particles spread along the path
        for (let i = 0; i < particlesToEmit; i++) {
          const particle = this.pool.getParticle();
          if (particle) {
            // Calculate interpolated position based on particle index
            const t = i / particlesToEmit;
            const interpolatedPosition = new THREE.Vector3()
              .copy(this.previousPosition)
              .add(direction.clone().multiplyScalar(distance * t));
            
            // Initialize the particle at the interpolated position
            this._initializeParticleAtPosition(particle, interpolatedPosition, direction);
          }
        }
      } else {
        // If the emitter hasn't moved significantly, emit all from current position
        for (let i = 0; i < particlesToEmit; i++) {
          const particle = this.pool.getParticle();
          if (particle) {
            this._initializeParticle(particle);
          }
        }
      }
      
      // Update previous position for next frame
      this.previousPosition.copy(this.position);
    }
  }
  
  _initializeParticleAtPosition(particle, position, direction) {
    // Reset and activate particle
    particle.reset();
    particle.active = true;
    
    // Position at the specified location
    particle.position.copy(position);
    
    // Apply directional scaling if enabled
    if (this.options.useDirectionalScaling) {
      particle.useDirectionalScaling = true;
      particle.direction.copy(direction || this.movementDirection);
      particle.directionScaling = this.options.directionalScaling;
    }
    
    // Rest of initialization (same as parent class)
    // Random velocity within range, considering rotation
    const velocity = new THREE.Vector3(
      THREE.MathUtils.randFloat(this.options.velocity.min.x, this.options.velocity.max.x),
      THREE.MathUtils.randFloat(this.options.velocity.min.y, this.options.velocity.max.y),
      THREE.MathUtils.randFloat(this.options.velocity.min.z, this.options.velocity.max.z)
    );
    
    // Apply emitter rotation to the velocity
    velocity.applyEuler(this.rotation);
    particle.velocity.copy(velocity);
    
    // Acceleration
    particle.acceleration.copy(this.options.acceleration);
    
    // Life
    particle.maxLife = THREE.MathUtils.randFloat(
      this.options.lifeTime.min,
      this.options.lifeTime.max
    );
    
    // Size
    particle.startSize = THREE.MathUtils.randFloat(
      this.options.particleSize.min,
      this.options.particleSize.max
    );
    particle.endSize = THREE.MathUtils.randFloat(
      this.options.particleSizeEnd.min,
      this.options.particleSizeEnd.max
    );
    particle.size = particle.startSize;
    
    // Color
    particle.startColor.copy(this.options.color);
    particle.endColor.copy(this.options.colorEnd);
    particle.color.copy(particle.startColor);
    
    // Opacity
    particle.startOpacity = THREE.MathUtils.randFloat(
      this.options.opacity.min,
      this.options.opacity.max
    );
    particle.endOpacity = THREE.MathUtils.randFloat(
      this.options.opacityEnd.min,
      this.options.opacityEnd.max
    );
    particle.opacity = particle.startOpacity;
    
    // Rotation
    particle.rotationSpeed = THREE.MathUtils.randFloat(
      this.options.rotationSpeed.min,
      this.options.rotationSpeed.max
    );
    
    return particle;
  }

}
/**
 * Main particle system to manage all emitters and rendering
 */
class ParticleSystem {
    constructor(options = {}) {
      this.maxParticles = options.maxParticles || 10000;
      this.pool = new ParticlePool(this.maxParticles);
      this.emitters = [];
      this.scene = null;
      this.camera = options.camera || null;
      this.textureLoader = new THREE.TextureLoader();
      this.textures = new Map(); // Cache for loaded textures
      
      // Number of opacity levels (materials)
      this.opacityLevels = options.opacityLevels || 100;
      
      // Create particle geometry
      this.particleGeometry = options.particleGeometry || new THREE.PlaneGeometry(2, 2);
      
      // Create materials for each opacity level
      this.materials = [];
      this.instancedMeshes = [];
      
      this._createMaterialsAndMeshes(options);
      
      // Create matrices and vectors for updating instances
      this.dummyMatrix = new THREE.Matrix4();
      this.dummyQuaternion = new THREE.Quaternion();
      this.dummyScale = new THREE.Vector3();
      this.dummyPosition = new THREE.Vector3();
    }
    
    /**
     * Create materials and instanced meshes for each opacity level
     */
    _createMaterialsAndMeshes(options) {
        // Clear any existing materials and meshes
        this.materials = [];
        this.instancedMeshes = [];
        
        // Base material options
        const baseMaterialOptions = {
          transparent: true,
          // For smoke, we usually want depthWrite false for most transparent materials
          depthWrite: false,
          blending: options.blending || THREE.NormalBlending,
          side: THREE.DoubleSide,
          alphaTest: 0.01
        };
        
        // Add texture if provided
        if (options.texture) {
          if (typeof options.texture === 'string') {
            baseMaterialOptions.map = this.loadTexture(options.texture);
          } else {
            baseMaterialOptions.map = options.texture;
          }
        }
        
        // Create materials and meshes for each opacity level
        for (let i = 0; i < this.opacityLevels; i++) {
          // Create a new material for this opacity level
          const material = new THREE.MeshBasicMaterial({...baseMaterialOptions});
          
          // Adjust opacity for this level (from 1/opacityLevels to 1.0)
          const opacity = (i + 1) / this.opacityLevels;
          material.opacity = opacity;
          
          // For higher opacity particles, we might want to enable depthWrite
          // This helps solid-looking smoke to interact properly with the scene
          if (opacity > 0.8 && options.enableDepthWriteForHighOpacity) {
            material.depthWrite = false;
          }
          
          this.materials.push(material);
          
          // Create instanced mesh for this opacity level
          const mesh = new THREE.InstancedMesh(
            this.particleGeometry,
            material,
            this.maxParticles
          );
          
          mesh.visible = true;
          mesh.count = 0;
          mesh.frustumCulled = options.frustumCulled !== undefined ? options.frustumCulled : false;
          
          // For smoke, we should render from back to front
          // Set renderOrder higher for more transparent particles (rendered later)
          mesh.renderOrder = i + 1; 
          
          this.instancedMeshes.push(mesh);
        }
      }
      
      
    /**
     * Load a texture from URL with caching
     */
    loadTexture(url) {
      // Check if texture is already loaded
      if (this.textures.has(url)) {
        return this.textures.get(url);
      }
      
      // Load the texture
      const texture = this.textureLoader.load(url);
      texture.premultiplyAlpha = true; // Important for proper alpha blending
      this.textures.set(url, texture);
      return texture;
    }
    
    /**
     * Add all instanced meshes to the scene
     */
    addToScene(scene, camera) {
      this.scene = scene;
      this.camera = camera || this.camera;
      
      // Add all meshes to scene
      for (const mesh of this.instancedMeshes) {
        scene.add(mesh);
      }
      
      return this;
    }
    
    /**
     * Remove all instanced meshes from the scene
     */
    removeFromScene() {
      if (this.scene) {
        for (const mesh of this.instancedMeshes) {
          if (mesh.parent) {
            this.scene.remove(mesh);
          }
        }
      }
      return this;
    }
    
    /**
     * Create a burst emitter
     */
    createBurstEmitter(options = {}) {
      const emitter = new BurstEmitter(options);
      emitter.setPool(this.pool);
      emitter.setSystem(this);
      this.emitters.push(emitter);
      return emitter;
    }
    
    /**
     * Create a continuous emitter
     */
    createContinuousEmitter(options = {}) {
      const emitter = new ContinuousEmitter(options);
      emitter.setPool(this.pool);
      emitter.setSystem(this);
      this.emitters.push(emitter);
      return emitter;
    }
    
    /**
     * Remove an emitter from the system
     */
    removeEmitter(emitter) {
      const index = this.emitters.indexOf(emitter);
      if (index !== -1) {
        this.emitters.splice(index, 1);
      }
      return this;
    }
    
    /**
     * Update the system
     */
    update(deltaTime, camera) {
      // Update camera reference if provided
      if (camera) {
        this.camera = camera;
      }
      
      // Update all emitters
      for (let i = 0; i < this.emitters.length; i++) {
        this.emitters[i].update(deltaTime);
      }
      
      // Update all particles
      this.pool.update(deltaTime);
      
      // Update instanced meshes
      this._updateInstancedMeshes();
    }
    
    /**
     * Update the instanced meshes based on particle opacity
     */
    _updateInstancedMeshes() {
      const activeParticles = this.pool.activeParticles;
      
      // Group particles by opacity level
      const particlesByOpacity = new Array(this.opacityLevels).fill().map(() => []);
      
      // Make sure we have a camera reference
      if (!this.camera && this.scene && this.scene.camera) {
        this.camera = this.scene.camera;
      }
      
      // Get camera position in world space
      const cameraPosition = new THREE.Vector3().setFromMatrixPosition(this.camera.matrixWorld);
      
      // Distribute particles to opacity buckets
      for (const particle of activeParticles) {
        // Map particle opacity to material index
        const opacityIndex = Math.min(
          Math.floor(particle.opacity * this.opacityLevels),
          this.opacityLevels - 1
        );
        
        particle._distanceToCamera = particle.position.distanceTo(cameraPosition);
        particlesByOpacity[opacityIndex].push(particle);
      }
      
      // Sort particles within each opacity group
      for (let i = 0; i < this.opacityLevels; i++) {
        particlesByOpacity[i].sort((a, b) => b._distanceToCamera - a._distanceToCamera);
      }
      
      // Update each instanced mesh with its particles
      for (let i = 0; i < this.opacityLevels; i++) {
        const particles = particlesByOpacity[i];
        const mesh = this.instancedMeshes[i];
        
        mesh.count = particles.length;
        
        for (let j = 0; j < particles.length; j++) {
          const particle = particles[j];
          
          // Position
          this.dummyPosition.copy(particle.position);
          
          // Direction to camera for billboarding
          const toCamera = new THREE.Vector3().subVectors(cameraPosition, particle.position).normalize();
          
          // Set up rotation to face camera (billboard)
          this.dummyMatrix.lookAt(
            new THREE.Vector3(0, 0, 0),
            toCamera,
            new THREE.Vector3(0, 1, 0)
          );
          this.dummyQuaternion.setFromRotationMatrix(this.dummyMatrix);
          
          // Handle directional scaling
          if (particle.useDirectionalScaling && particle.directionScaling > 1.0) {
            // Modified approach: stretch along X-axis, then rotate to align with direction
            
            // Step 1: Base uniform scale
            this.dummyScale.set(
              particle.size,
              particle.size,
              1
            );
            
            // Step 2: Get the particle movement direction vector in world space
            const worldDirection = particle.direction.clone();
            
            // Step 3: Project this direction onto the camera plane
            // (remove component parallel to camera direction)
            const parallelComponent = toCamera.clone().multiplyScalar(worldDirection.dot(toCamera));
            const projectedDir = worldDirection.clone().sub(parallelComponent);
            
            // Normalize if not too small
            if (projectedDir.lengthSq() > 0.001) {
              projectedDir.normalize();
              
              // Step 4: Find the 2D angle in the camera plane between "up" vector and our direction
              // First, get the "up" direction in camera space
              const up = new THREE.Vector3(0, 1, 0);
              up.applyQuaternion(this.dummyQuaternion);
              
              // Calculate angle between up and projected direction
              const dot = Math.min(Math.max(up.dot(projectedDir), -1), 1);
              let angle = Math.acos(dot);
              angle += Math.PI / 2;
              
              // Determine rotation direction (clockwise/counterclockwise)
              const cross = new THREE.Vector3().crossVectors(up, projectedDir);
              if (cross.dot(toCamera) < 0) {
                angle = -angle;
              }
              
              // Apply rotation around camera viewing direction
              const rotationQ = new THREE.Quaternion().setFromAxisAngle(toCamera, angle);
              this.dummyQuaternion.premultiply(rotationQ);
              
              // Now apply the stretch along the X-axis
              this.dummyScale.x *= particle.directionScaling;
            }
          } else {
            // Regular non-directional particle
            this.dummyScale.set(particle.size, particle.size, 1);
          }
          
          // Apply particle's own rotation
          if (particle.rotation !== 0) {
            const particleRotation = new THREE.Quaternion().setFromAxisAngle(
              new THREE.Vector3(0, 0, 1),
              particle.rotation
            );
            this.dummyQuaternion.multiply(particleRotation);
          }
          
          // Compose final matrix
          this.dummyMatrix.compose(
            this.dummyPosition,
            this.dummyQuaternion,
            this.dummyScale
          );
          
          // Update instance
          mesh.setMatrixAt(j, this.dummyMatrix);
          mesh.setColorAt(j, particle.color);
        }
        
        if (particles.length > 0) {
          mesh.instanceMatrix.needsUpdate = true;
          if (mesh.instanceColor) {
            mesh.instanceColor.needsUpdate = true;
          }
        }
      }
    }
    
    
    /**
     * Get active particle count
     */
    getActiveParticleCount() {
      return this.pool.getActiveCount();
    }
    
    /**
     * Dispose of all resources
     */
    dispose() {
      // Clean up resources
      this.removeFromScene();
      
      // Dispose of geometries and materials
      this.particleGeometry.dispose();
      
      for (const material of this.materials) {
        material.dispose();
      }
      
      // Dispose of cached textures
      this.textures.forEach(texture => texture.dispose());
      this.textures.clear();
      
      // Clear emitters
      this.emitters.length = 0;
    }
  }

export { ParticleSystem, BurstEmitter, ContinuousEmitter };
