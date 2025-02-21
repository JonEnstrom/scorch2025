import * as THREE from 'three';
import { GPUComputationRenderer } from 'three/examples/jsm/misc/GPUComputationRenderer';

export default class GPUParticle {
  constructor(renderer, particleCount, particleSystem) {
    this.renderer = renderer;
    this.particleCount = particleCount;
    this.WIDTH = Math.sqrt(particleCount) | 0; // ensure integer
    this.particleSystem = particleSystem;
    
    // We’ll also track an internal time counter for random seed usage
    this.time = 0;

    // Process keyframes into textures
    this.processKeyframes();
    this.initComputeRenderer();
    this.initParticles();
  }

  /**
   * Create three separate DataTextures (using NEAREST filtering):
   *   1. colorKeyframeTexture   -> (r,g,b, time)
   *   2. scaleKeyframeTexture   -> (scale, 0, 0, time)
   *   3. opacityKeyframeTexture -> (opacity, 0, 0, time)
   */
  processKeyframes() {
    const { colorKeyframes, scaleKeyframes, opacityKeyframes } = this.particleSystem.config;

    // 1. Color Keyframes (R,G,B, time)
    this.colorKeyframeTexture = new THREE.DataTexture(
      new Float32Array(colorKeyframes.length * 4),
      colorKeyframes.length,
      1,
      THREE.RGBAFormat,
      THREE.FloatType
    );
    {
      const colorData = this.colorKeyframeTexture.image.data;
      colorKeyframes.forEach((kf, i) => {
        colorData[i * 4 + 0] = kf.value.r;
        colorData[i * 4 + 1] = kf.value.g;
        colorData[i * 4 + 2] = kf.value.b;
        colorData[i * 4 + 3] = kf.t; // time in [0..1]
      });
      this.colorKeyframeTexture.minFilter = THREE.NearestFilter;
      this.colorKeyframeTexture.magFilter = THREE.NearestFilter;
      this.colorKeyframeTexture.wrapS = THREE.ClampToEdgeWrapping;
      this.colorKeyframeTexture.wrapT = THREE.ClampToEdgeWrapping;
      this.colorKeyframeTexture.needsUpdate = true;
    }

    // 2. Scale Keyframes (scale, 0, 0, time)
    this.scaleKeyframeTexture = new THREE.DataTexture(
      new Float32Array(scaleKeyframes.length * 4),
      scaleKeyframes.length,
      1,
      THREE.RGBAFormat,
      THREE.FloatType
    );
    {
      const scaleData = this.scaleKeyframeTexture.image.data;
      scaleKeyframes.forEach((kf, i) => {
        scaleData[i * 4 + 0] = kf.value; // scale
        scaleData[i * 4 + 1] = 0;
        scaleData[i * 4 + 2] = 0;
        scaleData[i * 4 + 3] = kf.t;     // time
      });
      this.scaleKeyframeTexture.minFilter = THREE.NearestFilter;
      this.scaleKeyframeTexture.magFilter = THREE.NearestFilter;
      this.scaleKeyframeTexture.wrapS = THREE.ClampToEdgeWrapping;
      this.scaleKeyframeTexture.wrapT = THREE.ClampToEdgeWrapping;
      this.scaleKeyframeTexture.needsUpdate = true;
    }

    // 3. Opacity Keyframes (opacity, 0, 0, time)
    this.opacityKeyframeTexture = new THREE.DataTexture(
      new Float32Array(opacityKeyframes.length * 4),
      opacityKeyframes.length,
      1,
      THREE.RGBAFormat,
      THREE.FloatType
    );
    {
      const opacityData = this.opacityKeyframeTexture.image.data;
      opacityKeyframes.forEach((kf, i) => {
        opacityData[i * 4 + 0] = kf.value; // opacity
        opacityData[i * 4 + 1] = 0;
        opacityData[i * 4 + 2] = 0;
        opacityData[i * 4 + 3] = kf.t;     // time
      });
      this.opacityKeyframeTexture.minFilter = THREE.NearestFilter;
      this.opacityKeyframeTexture.magFilter = THREE.NearestFilter;
      this.opacityKeyframeTexture.wrapS = THREE.ClampToEdgeWrapping;
      this.opacityKeyframeTexture.wrapT = THREE.ClampToEdgeWrapping;
      this.opacityKeyframeTexture.needsUpdate = true;
    }
  }

  initComputeRenderer() {
    this.gpuCompute = new GPUComputationRenderer(this.WIDTH, this.WIDTH, this.renderer);

    const dtPosition = this.gpuCompute.createTexture();
    const dtVelocity = this.gpuCompute.createTexture();
    const dtLife = this.gpuCompute.createTexture();

    this.fillPositionTexture(dtPosition);
    this.fillVelocityTexture(dtVelocity);
    this.fillLifeTexture(dtLife);

    this.lifeVariable = this.gpuCompute.addVariable(
      'textureLife',
      this.lifeShader(),
      dtLife
    );

    this.positionVariable = this.gpuCompute.addVariable(
      'texturePosition',
      this.positionShader(),
      dtPosition
    );

    this.velocityVariable = this.gpuCompute.addVariable(
      'textureVelocity',
      this.velocityShader(),
      dtVelocity
    );

    // Set dependencies
    this.gpuCompute.setVariableDependencies(this.positionVariable, [
      this.positionVariable,
      this.velocityVariable,
      this.lifeVariable
    ]);

    this.gpuCompute.setVariableDependencies(this.velocityVariable, [
      this.positionVariable,
      this.velocityVariable,
      this.lifeVariable
    ]);

    this.gpuCompute.setVariableDependencies(this.lifeVariable, [
      this.lifeVariable
    ]);

    // Uniforms
    this.positionUniforms = this.positionVariable.material.uniforms;
    this.velocityUniforms = this.velocityVariable.material.uniforms;
    this.lifeUniforms = this.lifeVariable.material.uniforms;
    this.lifeUniforms.spawnRate = { value: this.particleSystem.config.spawnRate || 1000 };
        // emissionMode: 0 => burst, 1 => rate
    this.lifeUniforms.emissionMode = {
      value: (this.particleSystem.config.emissionMode === 'rate') ? 1 : 0
    };

    this.velocityUniforms.gravity = { value: this.particleSystem.config.gravity };
    this.velocityUniforms.drag = { value: this.particleSystem.config.drag };
    this.positionUniforms.deltaTime = { value: 0.0 };
    this.velocityUniforms.deltaTime = { value: 0.0 };

    // We pass in these for re-init logic (used in position/velocity shaders)
    this.positionUniforms.emitterPosition = { value: this.particleSystem.config.position };
    this.positionUniforms.emitterSpread = { value: this.particleSystem.config.spread };
    this.velocityUniforms.velocityVector = { value: this.particleSystem.config.velocityVector };
    this.velocityUniforms.minSpeed = { value: this.particleSystem.config.minSpeed };
    this.velocityUniforms.maxSpeed = { value: this.particleSystem.config.maxSpeed };
    this.velocityUniforms.randomizeVelocityOnBurst = {
      value: this.particleSystem.config.randomizeVelocityOnBurst};
    
    // We'll pass a randomSeed uniform we can increment each frame
    this.positionUniforms.randomSeed = { value: Math.random() };
    this.velocityUniforms.randomSeed = { value: Math.random() };
    this.lifeUniforms.randomSeed = { value: Math.random() };

    // For the "life" step
    this.lifeUniforms.deltaTime = { value: 0.0 };
    this.lifeUniforms.lifeSpan = { value: this.particleSystem.config.lifeSpan || 0.0 };

    const error = this.gpuCompute.init();
    if (error !== null) {
      console.error(error);
    }
  }

  fillPositionTexture(texture) {
    const { position, spread } = this.particleSystem.config;
    const theArray = texture.image.data;
    
    for (let k = 0; k < theArray.length; k += 4) {
      const x = position.x + (Math.random() - 0.5) * spread.x;
      const y = position.y + (Math.random() - 0.5) * spread.y;
      const z = position.z + (Math.random() - 0.5) * spread.z;
      
      theArray[k + 0] = x;
      theArray[k + 1] = y;
      theArray[k + 2] = z;
      theArray[k + 3] = 1;
    }
  }

  fillVelocityTexture(texture) {
    const { velocityVector, minSpeed, maxSpeed } = this.particleSystem.config;
    const theArray = texture.image.data;
    
    // Normalize the velocity vector
    const direction = velocityVector.clone().normalize();
    
    for (let k = 0; k < theArray.length; k += 4) {
      // Random speed between min and max
      const speed = THREE.MathUtils.lerp(minSpeed, maxSpeed, Math.random());
      
      // Apply speed to direction
      theArray[k + 0] = direction.x * speed;
      theArray[k + 1] = direction.y * speed;
      theArray[k + 2] = direction.z * speed;
      theArray[k + 3] = 1;
    }
  }

  fillLifeTexture(texture) {
    const theArray = texture.image.data;
    for (let k = 0; k < theArray.length; k += 4) {
      if (this.particleSystem.config.emissionMode === 'rate') {
      theArray[k + 0] = -1.0;
      } else {
        theArray[k + 0] = 0.0;
      }
      theArray[k + 1] = Math.random() * Math.PI * 2; // rotation (just an example)
      theArray[k + 2] = 0;
      theArray[k + 3] = 1;
    }
  }

/**
 * `lifeShader()`: 
 *   - if `emissionMode == 0` (burst), if life > lifeSpan => life = -1 (dead).
 *   - if `emissionMode == 1` (rate), we do a spawnRate-based chance for re-spawning a dead particle.
 */
lifeShader() {
  return `
uniform float deltaTime;
uniform float lifeSpan;
uniform int emissionMode;    // 0 => burst, 1 => rate
uniform float spawnRate;     // spawns/second
uniform float randomSeed;

// Simple hash function
float hash(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453123);
}

void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec4 lifeData = texture2D(textureLife, uv);
    
    float life = lifeData.x;
    float rotation = lifeData.y;
    
    // If alive, increment life
    if (life >= 0.0) {
        life += deltaTime;
        
        // If it exceeds lifeSpan, it becomes dead
        if (lifeSpan > 0.0 && life > lifeSpan) {
            life = -1.0;
        }
    }
    
    // Rate-based emission logic
    if (emissionMode == 1 && life < 0.0) {
        // Calculate how many particles should spawn this frame
        float particlesToSpawn = spawnRate * deltaTime;
        
        // Calculate this particle's index
        float totalParticles = resolution.x * resolution.y;
        float particleIndex = uv.y * resolution.y * resolution.x + uv.x * resolution.x;
        
        // Use the particle index to distribute spawns evenly
        float spawnThreshold = particlesToSpawn / totalParticles;
        
        // Random check with higher probability for lower indices
        float r = hash(uv + vec2(randomSeed));
        if (r < spawnThreshold) {
            life = 0.0;  // Spawn this particle
        }
    }
    
    gl_FragColor = vec4(life, rotation, lifeData.z, 1.0);
}  `;
}

  /**
   * `positionShader()`: The normal code is
   *   pos += vel * deltaTime
   * If continuous emission is enabled, whenever the life was just reset to 0, we re-randomize pos.
   * 
   * We do that by checking if life < deltaTime, meaning it was set to 0 this frame.
   */
  positionShader() {
    return `
      uniform float deltaTime;
      uniform vec3 emitterPosition;
      uniform vec3 emitterSpread;
      uniform float randomSeed;
  
      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453123);
      }
      vec3 random3(vec2 uv) {
        float r1 = hash(uv + vec2(randomSeed, 0.1234));
        float r2 = hash(uv + vec2(randomSeed*1.37, 2.1234));
        float r3 = hash(uv + vec2(randomSeed*2.17, 4.5678));
        return vec3(r1, r2, r3);
      }
  
      void main() {
        vec2 uv = gl_FragCoord.xy / resolution.xy;
        vec4 pos = texture2D(texturePosition, uv);
        vec4 lifeData = texture2D(textureLife, uv);
        vec4 vel = texture2D(textureVelocity, uv);
  
        float life = lifeData.x;
  
        // Move if alive
        if (life >= 0.0) {
          pos.xyz += vel.xyz * deltaTime;
        }
  
        // If life was just set to 0 this frame => re-init
        if (life >= 0.0 && life < deltaTime) {
          vec3 rnd = random3(uv);
          pos.x = emitterPosition.x + (rnd.x - 0.5) * emitterSpread.x;
          pos.y = emitterPosition.y + (rnd.y - 0.5) * emitterSpread.y;
          pos.z = emitterPosition.z + (rnd.z - 0.5) * emitterSpread.z;
        }
  
        gl_FragColor = pos;
      }
    `;
  }
  
  /**
   * `velocityShader()`: normal velocity update with gravity & drag.
   * If continuous emission is enabled and the particle was just reset (life < deltaTime),
   * we also re-init velocity here.
   */
  velocityShader() {
    return `
      uniform float deltaTime;
      uniform vec3 gravity;
      uniform float drag;
      uniform vec3 velocityVector; // normalized direction
      uniform float minSpeed;
      uniform float maxSpeed;
      uniform float randomSeed;
      uniform bool randomizeVelocityOnBurst; // Add this uniform
  
      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453123);
      }
  
      vec3 randomDirection(vec2 uv) {
        float theta = hash(uv + vec2(randomSeed, 0.0)) * 2.0 * 3.14159265359;
        float phi = hash(uv + vec2(randomSeed * 1.37, 1.0)) * 3.14159265359;
        float x = sin(phi) * cos(theta);
        float y = sin(phi) * sin(theta);
        float z = cos(phi);
        return vec3(x, y, z);
      }
  
      void main() {
        vec2 uv = gl_FragCoord.xy / resolution.xy;
        vec4 vel = texture2D(textureVelocity, uv);
        vec4 lifeData = texture2D(textureLife, uv);
  
        float life = lifeData.x;
  
        // If alive, apply gravity & drag
        if (life >= 0.0) {
          vel.xyz += gravity * deltaTime;
          vel.xyz *= (1.0 - drag * deltaTime);
        }
  
        // If just spawned this frame => init velocity
        if (life >= 0.0 && life < deltaTime) {
          float speed = mix(minSpeed, maxSpeed, hash(uv + vec2(randomSeed)));
  
          if (randomizeVelocityOnBurst) {
            // Randomize the direction for each particle
            vel.xyz = randomDirection(uv) * speed;
          } else {
            // Use the normalized velocityVector as direction
            vel.xyz = normalize(velocityVector) * speed;
          }
        }
  
        gl_FragColor = vel;
      }
    `;
  }

  initParticles() {
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(this.particleCount * 3);
    const uvs = new Float32Array(this.particleCount * 2);
    
    for (let i = 0; i < this.particleCount; i++) {
      const i3 = i * 3;
      const i2 = i * 2;
      
      // All initially at 0, or do what you like
      positions[i3 + 0] = 0;
      positions[i3 + 1] = 0;
      positions[i3 + 2] = 0;
      
      // uv to map to the FBO
      uvs[i2 + 0] = (i % this.WIDTH) / this.WIDTH;
      uvs[i2 + 1] = Math.floor(i / this.WIDTH) / this.WIDTH;
    }
    
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  
    const material = new THREE.ShaderMaterial({
      uniforms: {
        texturePosition: { value: null },
        textureVelocity: { value: null },
        textureLife: { value: null },
        
        // Our three separate keyframe textures (nearest-filtered):
        colorKeyframes:   { value: this.colorKeyframeTexture },
        scaleKeyframes:   { value: this.scaleKeyframeTexture },
        opacityKeyframes: { value: this.opacityKeyframeTexture },
        
        // Number of keyframes in each
        numColorKeyframes:   { value: this.particleSystem.config.colorKeyframes.length },
        numScaleKeyframes:   { value: this.particleSystem.config.scaleKeyframes.length },
        numOpacityKeyframes: { value: this.particleSystem.config.opacityKeyframes.length },
        
        // The actual particle sprite (if you have one)
        particleTexture: { value: this.particleSystem.texture },
        
        // Some defaults
        color:   { value: this.particleSystem.config.color },
        opacity: { value: this.particleSystem.config.opacity },
        scale:   { value: this.particleSystem.config.scale },
        lifeSpan:{ value: this.particleSystem.config.lifeSpan },
      },
      vertexShader: this.particleVertexShader(),
      fragmentShader: this.particleFragmentShader(),
      transparent: true,
      blending: this.particleSystem.config.blending === 'additive' 
        ? THREE.AdditiveBlending 
        : THREE.NormalBlending,
      depthWrite: false
    });
  
    this.particles = new THREE.Points(geometry, material);
    this.particles.frustumCulled = false; // don’t cull
  }
  
  particleVertexShader() {
    return `
      uniform sampler2D texturePosition;
      uniform sampler2D textureLife;

      // Keyframe textures:
      uniform sampler2D colorKeyframes;
      uniform sampler2D scaleKeyframes;
      uniform sampler2D opacityKeyframes;

      uniform float scale;
      uniform float lifeSpan;

      uniform int numColorKeyframes;
      uniform int numScaleKeyframes;
      uniform int numOpacityKeyframes;

      varying vec2 vUv;
      varying vec3 vColor;
      varying float vOpacity;

      // Interpolation helper for keyframes
      float interpolateKeyframe(sampler2D keyframes, int numFrames, float time, int channel) {
        if (numFrames == 0) return 1.0;
        if (numFrames == 1) {
          vec4 singleFrame = texture2D(keyframes, vec2(0.5/float(numFrames), 0.5));
          return singleFrame[channel];
        }

        vec4 first = texture2D(
          keyframes, 
          vec2((0.0 + 0.5)/float(numFrames), 0.5)
        );
        if (time <= first.w) {
          return first[channel];
        }

        for (int i = 0; i < 16; i++) {
          if (i >= numFrames - 1) {
            break;
          }
          vec4 kf0 = texture2D(keyframes, vec2((float(i) + 0.5)/float(numFrames), 0.5));
          vec4 kf1 = texture2D(keyframes, vec2((float(i+1) + 0.5)/float(numFrames), 0.5));

          if (time >= kf0.w && time <= kf1.w) {
            float t = (time - kf0.w) / (kf1.w - kf0.w);
            return mix(kf0[channel], kf1[channel], t);
          }
        }

        vec4 last = texture2D(
          keyframes,
          vec2((float(numFrames - 1) + 0.5)/float(numFrames), 0.5)
        );
        return last[channel];
      }

      void main() {
        vec4 posTemp = texture2D(texturePosition, uv);
        vec4 lifeTemp = texture2D(textureLife, uv);
        vec3 pos = posTemp.xyz;
        
        float currentLife = lifeTemp.x;
        
        // If life < 0 => "dead" => hide it
        if (currentLife < 0.0) {
          gl_Position = vec4(0.0);
          gl_PointSize = 0.0;
          vOpacity = 0.0;
          return;
        }

        // rotation is stored in lifeTemp.y if needed
        float rotation = lifeTemp.y;

        // normalizedLife in [0..1] if your config wants it that way
        // Here we just clamp since currentLife can exceed lifeSpan if it's continuous
        float normalizedLife = lifeSpan > 0.0 ? clamp(currentLife / lifeSpan, 0.0, 1.0) : 0.0;

        // Interpolate color (RGB)
        float r = interpolateKeyframe(colorKeyframes,   numColorKeyframes,   normalizedLife, 0);
        float g = interpolateKeyframe(colorKeyframes,   numColorKeyframes,   normalizedLife, 1);
        float b = interpolateKeyframe(colorKeyframes,   numColorKeyframes,   normalizedLife, 2);
        vColor = vec3(r, g, b);

        // Interpolate scale
        float particleScale = scale * interpolateKeyframe(scaleKeyframes, numScaleKeyframes, normalizedLife, 0);

        // Interpolate opacity
        vOpacity = interpolateKeyframe(opacityKeyframes, numOpacityKeyframes, normalizedLife, 0);

        // Standard billboard transform
        vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
        gl_Position = projectionMatrix * mvPosition;

        vUv = uv;

        // Set point size (tweak to taste)
        gl_PointSize = max(particleScale * 100.0 * (1.0 / -mvPosition.z), 1.0);
      }
    `;
  }

  particleFragmentShader() {
    return `
      uniform sampler2D particleTexture;
      
      varying vec2 vUv;
      varying vec3 vColor;
      varying float vOpacity;
      
      void main() {
        // "gl_PointCoord" = 0..1 coords across point sprite
        vec4 texColor = texture2D(particleTexture, gl_PointCoord);

        // Multiply by color & opacity
        gl_FragColor = vec4(vColor, vOpacity) * texColor;
      }
    `;
  }

  update(deltaTime) {
    this.time += deltaTime;

    // Update uniforms for each compute pass
    this.positionUniforms.deltaTime.value = deltaTime;
    this.velocityUniforms.deltaTime.value = deltaTime;
    this.lifeUniforms.deltaTime.value = deltaTime;

    // Update randomSeed each frame (basic approach)
    this.positionUniforms.randomSeed.value = Math.random() * 10000.0;
    this.velocityUniforms.randomSeed.value = Math.random() * 10000.0;
    this.lifeUniforms.randomSeed.value = Math.random() * 10000.0;

    // Compute!
    this.gpuCompute.compute();
    
    // Retrieve computed textures
    this.particles.material.uniforms.texturePosition.value = 
      this.gpuCompute.getCurrentRenderTarget(this.positionVariable).texture;
    this.particles.material.uniforms.textureVelocity.value = 
      this.gpuCompute.getCurrentRenderTarget(this.velocityVariable).texture;
    this.particles.material.uniforms.textureLife.value =
      this.gpuCompute.getCurrentRenderTarget(this.lifeVariable).texture;
  }

  dispose() {
    this.particles.geometry.dispose();
    this.particles.material.dispose();
    this.gpuCompute.dispose();
    
    this.colorKeyframeTexture.dispose();
    this.scaleKeyframeTexture.dispose();
    this.opacityKeyframeTexture.dispose();
  }
}
