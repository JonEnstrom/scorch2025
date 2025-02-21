import * as THREE from 'three';
import GPUParticle from './GpuParticle.js';

/**
 * Manages multiple GPU-based particle systems, each created via GPUParticle.
 */
export class GPUParticleManager {
  constructor(renderer, scene, maxParticles = 10000) {
    this.renderer = renderer;
    this.scene = scene;

    // In case you want a global maximum; not strictly needed if each emitter has its own count
    this.maxParticles = maxParticles;

    /**
     * We store two Maps:
     *   - emitters:   ID -> { config, texture, particleCount, etc. }
     *   - particleSystems: ID -> GPUParticle instance
     */
    this.emitters = new Map();
    this.particleSystems = new Map();

    // For texture loading & caching
    this.loader = new THREE.TextureLoader();
    this.textureCache = new Map();
  }

  /**
   * Creates a new emitter & its corresponding GPUParticle system.
   * @param {string} id - unique string to identify this emitter
   * @param {Object} config - object with position, spread, keyframes, etc.
   * @param {string} textureURL - path/URL to the sprite
   */
  async createEmitter(id, config, textureURL) {
    if (this.emitters.has(id)) {
      throw new Error(`Emitter with ID "${id}" already exists`);
    }

    // Load texture (cached if already loaded)
    let texture = this.textureCache.get(textureURL);
    if (!texture) {
      texture = await new Promise((resolve, reject) => {
        this.loader.load(
          textureURL,
          (tex) => {
            // Adjust filters if desired
            tex.magFilter = THREE.NearestFilter;
            tex.minFilter = THREE.LinearMipMapLinearFilter;
            this.textureCache.set(textureURL, tex);
            resolve(tex);
          },
          undefined,
          (err) => reject(err)
        );
      });
    }

    // Build a standard config with defaults
    const emitter = {
      id,
      config: {
        position: config.position ?? new THREE.Vector3(0, 0, 0),
        spread: config.spread ?? new THREE.Vector3(0, 0, 0),
        velocityVector: new THREE.Vector3(0, 0, 0), // normalized direction
        minSpeed: config.minSpeed ?? 5,  // minimum magnitude
        maxSpeed: config.maxSpeed ?? 10,   // maximum magnitude
        gravity: config.gravity ?? new THREE.Vector3(0, 0, 0),
        drag: config.drag ?? 0,
        color: config.color ?? new THREE.Color(1, 1, 1),
        scale: config.scale ?? 1.0,
        opacity: config.opacity ?? 1.0,
        blending: config.blending ?? 'normal',
        spawnRate: config.spawnRate ?? 1000, // e.g. 1000 new particles/sec
        lifeSpan: config.lifeSpan ?? 2.0,
        emissionMode: config.emissionMode ?? 'burst',
        colorKeyframes: config.colorKeyframes ?? [{ t: 0, value: new THREE.Color(1, 1, 1) }],
        scaleKeyframes: config.scaleKeyframes ?? [{ t: 0, value: 1.0 }],
        opacityKeyframes: config.opacityKeyframes ?? [{ t: 0, value: 1.0 }],
        randomizeVelocityOnBurst: config.randomizeVelocityOnBurst ?? false
      },
      texture,
      // Default 10k if none specified; or clamp to this.maxParticles if desired
      particleCount: config.particleCount ?? 10000
    };

    // Create the GPUParticle instance
    const particleSystem = new GPUParticle(
      this.renderer,
      emitter.particleCount,
      emitter
    );

    // Add the THREE.Points to your scene
    this.scene.add(particleSystem.particles);

    // Track them internally
    this.emitters.set(id, emitter);
    this.particleSystems.set(id, particleSystem);

    return emitter;
  }

  clearAll() {
    for (const [id, _] of this.emitters) {
      this.removeEmitter(id);
    }
  }

  /**
   * Removes the emitter & cleans up GPU resources
   */
  removeEmitter(id) {
    const particleSystem = this.particleSystems.get(id);
    if (!particleSystem) return;

    this.scene.remove(particleSystem.particles);
    particleSystem.dispose();

    this.particleSystems.delete(id);
    this.emitters.delete(id);
  }

  updateEmitterPosition(id, newPosition) {
    const emitter = this.emitters.get(id);
    const particleSystem = this.particleSystems.get(id);
    if (!emitter || !particleSystem) return false;
  
    // 1) Update the CPU config
    emitter.config.position.copy(newPosition);
  
    // 2) ALSO update the GPU uniform
    particleSystem.positionUniforms.emitterPosition.value.copy(newPosition);
  
    return true;
  }
  
  /**
   * Update various emitter parameters on-the-fly
   */
  updateEmitter(id, updates) {
    const emitter = this.emitters.get(id);
    const particleSystem = this.particleSystems.get(id);

    if (!emitter || !particleSystem) return false;

    // Update position
    if (updates.position) {
      emitter.config.position.copy(updates.position);
    }

    // Update spread
    if (updates.spread) {
      emitter.config.spread.copy(updates.spread);
    }

  // Update direction
  if (updates.direction) {
    emitter.config.velocityVector.copy(updates.direction);
    particleSystem.velocityUniforms.velocityVector.value.copy(updates.direction);
  }
    // Update physics
    if (updates.gravity) {
      emitter.config.gravity.copy(updates.gravity);
      // Also update the shader uniform for gravity
      particleSystem.velocityUniforms.gravity.value = updates.gravity;
    }
    if (updates.drag !== undefined) {
      emitter.config.drag = updates.drag;
      // Also update the drag uniform
      particleSystem.velocityUniforms.drag.value = updates.drag;
    }

    // Update base appearance
    if (updates.color) {
      emitter.config.color.copy(updates.color);
      particleSystem.particles.material.uniforms.color.value = updates.color;
    }
    if (updates.scale !== undefined) {
      emitter.config.scale = updates.scale;
      particleSystem.particles.material.uniforms.scale.value = updates.scale;
    }
    if (updates.opacity !== undefined) {
      emitter.config.opacity = updates.opacity;
      particleSystem.particles.material.uniforms.opacity.value = updates.opacity;
    }

    // Update lifeSpan
    if (updates.lifeSpan !== undefined) {
      emitter.config.lifeSpan = updates.lifeSpan;
      particleSystem.lifeUniforms.lifeSpan.value = updates.lifeSpan;
      particleSystem.particles.material.uniforms.lifeSpan.value = updates.lifeSpan;
    }

    // Update emission mode
    if (updates.emissionMode !== undefined) {
      emitter.config.emissionMode = updates.emissionMode;
      particleSystem.lifeUniforms.emissionMode.value =
        (updates.emissionMode === 'rate') ? 1 : 0;
    }

    return true;
  }

  /**
   * Call once per frame to update all particle systems
   */
  update(deltaTime) {
    for (const particleSystem of this.particleSystems.values()) {
      particleSystem.update(deltaTime);
    }
  }

  /**
   * Clean up all resources
   */
  dispose() {
    for (const particleSystem of this.particleSystems.values()) {
      this.scene.remove(particleSystem.particles);
      particleSystem.dispose();
    }

    for (const texture of this.textureCache.values()) {
      texture.dispose();
    }

    this.particleSystems.clear();
    this.emitters.clear();
    this.textureCache.clear();
  }
}
