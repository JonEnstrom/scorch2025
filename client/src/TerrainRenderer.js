// client/src/terrainRenderer.js
import * as THREE from 'three';
import { WaterShader } from './shaders/WaterShader.js';
import { HeightBlendedShader } from './shaders/HeighBlendedShader.js';
import { ScorchShader } from './shaders/ScorchShader.js';

export class TerrainRenderer {
  constructor(scene, lightRef, renderer) {
    this.scene = scene;
    this.lightRef = lightRef;
    this.renderer = renderer;
    
    this.geometry = null;
    this.modificationQueue = [];
    this.modificationInterval = 20; // e.g. 1 call every 100ms
    this.lastModificationTime = 0;

    this.material = null;
    this.mesh = null;
    this.texSize = 2400;

    // For reflections
    this.reflectionRenderTarget = null;
    this.reflectionCamera = null;
    this.environmentMap = null;
    
    // Create reflection render target
    const renderTargetParams = {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      stencilBuffer: false
    };
    this.reflectionRenderTarget = new THREE.WebGLRenderTarget(
      window.innerWidth,
      window.innerHeight,
      renderTargetParams
    );
    
    // Create reflection camera (will be updated during render)
    this.reflectionCamera = new THREE.PerspectiveCamera(
      75, window.innerWidth / window.innerHeight, 0.1, 1000
    );

    const terrainSize = new THREE.Vector2(this.texSize, this.texSize);
    this.scorchSystem = this.setupScorchSystem(renderer, terrainSize);
    this.currentTheme = 'grassland';
    this.surfacePlane = null;

    this.heightTextures = {
      water: null,
      low: null,
      mid: null,
      high: null,
      mountain: null
    };

    this.thresholds = {
      water: -5,
      low: 2,
      mid: 10,
      high: 20,
      blendRange: 5.0
    };

    this.uvScales = {
      water: 0.005,
      low: 0.005,
      mid: 0.005,
      high: 0.005,
      mountain: 0.005
    };

    this.intersectionRT = new THREE.WebGLRenderTarget(4096, 4096, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.FloatType
    });

    const distanceShader = {
      uniforms: {
        uWaterLevel: { value: -5.0 },  // match your water plane’s Y level
      },
      vertexShader: `
        varying float vTerrainHeight;
        void main() {
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          vTerrainHeight = worldPos.y;
          gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uWaterLevel;
        varying float vTerrainHeight;
        void main() {
          // distance above/below water
          float dist = vTerrainHeight - uWaterLevel; 
          dist = clamp((dist + 20.0) / 40.0, 0.0, 1.0);
    
          // We'll store it in the G channel so it reads as .y in the water shader
          gl_FragColor = vec4(0.0, dist, 0.0, 1.0);
        }      `
    };
    this.intersectionMaterial = new THREE.ShaderMaterial(distanceShader);
  }
  
  /**
   * Loads the 5 textures used for the height blending (per theme).
   */
  async loadHeightTextures(theme = 'grassland') {
    const loader = new THREE.TextureLoader();

    if (theme === 'desert') {
      this.heightTextures.mountain         = loader.load('textures/desert/desert_rock2.jpg');
      this.heightTextures.mountainNormal   = loader.load('textures/desert/desert_rock2_normal.jpg');
      this.heightTextures.low              = loader.load('textures/desert/desert_sand2.jpg');
      this.heightTextures.lowNormal        = loader.load('textures/desert/desert_sand2_normal.jpg');
      this.heightTextures.mid              = loader.load('textures/desert/desert_sand.jpg');
      this.heightTextures.midNormal        = loader.load('textures/desert/desert_sand_normal.jpg');
      this.heightTextures.high             = loader.load('textures/desert/desert_rock.jpg');
      this.heightTextures.highNormal       = loader.load('textures/desert/desert_rock_normal.jpg');
      this.heightTextures.water            = loader.load('textures/desert/desert_mountain.jpg');
      this.heightTextures.waterNormal      = loader.load('textures/desert/desert_mountain_normal.jpg');

      this.thresholds = { water: -5, low: 40, mid:80, high: 200, blendRange: 50.0 };

    } else if (theme === 'arctic') {
      this.heightTextures.water            = loader.load('textures/arctic/arctic_ice.jpg');
      this.heightTextures.waterNormal      = loader.load('textures/arctic/arctic_ice_normal.jpg');
      this.heightTextures.low              = loader.load('textures/arctic/arctic_snow1.jpg');
      this.heightTextures.lowNormal        = loader.load('textures/arctic/arctic_snow1_normal.jpg');
      this.heightTextures.mid              = loader.load('textures/arctic/arctic_snow2.jpg');
      this.heightTextures.midNormal        = loader.load('textures/arctic/arctic_snow2_normal.jpg');
      this.heightTextures.high             = loader.load('textures/arctic/arctic_rock.jpg');
      this.heightTextures.highNormal       = loader.load('textures/arctic/arctic_rock_normal.jpg');
      this.heightTextures.mountain         = loader.load('textures/arctic/arctic_mountain.jpg');
      this.heightTextures.mountainNormal   = loader.load('textures/arctic/arctic_mountain_normal.jpg');

      this.thresholds = { water: -5, low: 40, mid: 85, high: 200, blendRange: 50.0 };

    } else {
      // Grassland (default)
      this.heightTextures.water            = loader.load('textures/grassland/grassland_water.jpg');
      this.heightTextures.waterNormal      = loader.load('textures/grassland/grassland_water_normal.jpg');
      this.heightTextures.low              = loader.load('textures/grassland/grassland_low.jpg');
      this.heightTextures.lowNormal        = loader.load('textures/grassland/grassland_low_normal.jpg');
      this.heightTextures.mid              = loader.load('textures/grassland/grassland_mid.jpg');
      this.heightTextures.midNormal        = loader.load('textures/grassland/grassland_mid_normal.jpg');
      this.heightTextures.high             = loader.load('textures/grassland/grassland_high.jpg');
      this.heightTextures.highNormal       = loader.load('textures/grassland/grassland_high_normal.jpg');
      this.heightTextures.mountain         = loader.load('textures/grassland/grassland_mountain.jpg');
      this.heightTextures.mountainNormal   = loader.load('textures/grassland/grassland_mountain_normal.jpg');

      this.thresholds = { water: -7, low: 40, mid: 80, high: 200, blendRange: 50.0 };
    }

    // Wrap mode, repeats, etc.:
    for (const key in this.heightTextures) {
      const tex = this.heightTextures[key];
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(25,25);
    }
  }

  update() {
    if (!this.mesh) return;
    this.processQueuedModifications();
    
    this.material.uniforms.shadowMap.value = 
      this.lightRef.shadow.map ? this.lightRef.shadow.map.texture : null;

    const shadowMatrix = new THREE.Matrix4();
    shadowMatrix.multiply(this.lightRef.shadow.camera.projectionMatrix);
    shadowMatrix.multiply(this.lightRef.shadow.camera.matrixWorldInverse);
    this.material.uniforms.shadowMatrix.value.copy(shadowMatrix);
  }

  processQueuedModifications() {
    const now = Date.now();
    if (now - this.lastModificationTime < this.modificationInterval || 
        this.modificationQueue.length === 0) {
      return;
    }

    const nextMod = this.modificationQueue.shift();
    this.modifyTerrain(...Object.values(nextMod));
    this.lastModificationTime = now;
  }

  updateNormals() {
    this.geometry.computeVertexNormals();
  }

  /**
   * Creates BOTH copies of the terrain geometry using the new blending shader.
   */
  async createTerrain(terrainData) {
    this.dispose();
    this.currentTheme = terrainData.theme || 'grassland';
    await this.loadHeightTextures(this.currentTheme);

    try {
      const heightDataFloat32 = new Float32Array(terrainData.heightData);
      const segments = terrainData.segments;
      const width = terrainData.width;
      const depth = terrainData.depth;

      this.geometry = new THREE.PlaneGeometry(width, depth, segments, segments);
      const positions = this.geometry.attributes.position.array;

      for (let i = 0, j = 0; i < positions.length; i += 3, j++) {
        positions[i + 2] = heightDataFloat32[j];
      }

      this.geometry.computeVertexNormals();
      this.geometry.attributes.position.needsUpdate = true;

      this.material = new THREE.ShaderMaterial({
        uniforms: THREE.UniformsUtils.clone(HeightBlendedShader.uniforms),
        vertexShader: HeightBlendedShader.vertexShader,
        fragmentShader: HeightBlendedShader.fragmentShader,
        lights: false,
      });

      // Create a ShaderMaterial with our height-blending shader
      this.material = new THREE.ShaderMaterial({
        uniforms: THREE.UniformsUtils.clone(HeightBlendedShader.uniforms),
        vertexShader: HeightBlendedShader.vertexShader,
        fragmentShader: HeightBlendedShader.fragmentShader,
        lights: false,
      });

      // Assign the loaded textures
      this.material.uniforms.textureWater.value    = this.heightTextures.water;
      this.material.uniforms.textureLow.value      = this.heightTextures.low;
      this.material.uniforms.textureMid.value      = this.heightTextures.mid;
      this.material.uniforms.textureHigh.value     = this.heightTextures.high;
      this.material.uniforms.textureMountain.value = this.heightTextures.mountain;

      // Pass in the thresholds
      this.material.uniforms.thresholdWater.value = this.thresholds.water;
      this.material.uniforms.thresholdLow.value   = this.thresholds.low;
      this.material.uniforms.thresholdMid.value   = this.thresholds.mid;
      this.material.uniforms.thresholdHigh.value  = this.thresholds.high;

      // How wide the overlap region is
      this.material.uniforms.blendRange.value = this.thresholds.blendRange;

      // Set default scaling factors for each layer
      this.material.uniforms.scaleWater.value    = this.uvScales.water;
      this.material.uniforms.scaleLow.value      = this.uvScales.low;
      this.material.uniforms.scaleMid.value      = this.uvScales.mid;
      this.material.uniforms.scaleHigh.value     = this.uvScales.high;
      this.material.uniforms.scaleMountain.value = this.uvScales.mountain;

      // Normal textures
      this.material.uniforms.normalWater.value    = this.heightTextures.waterNormal;
      this.material.uniforms.normalLow.value      = this.heightTextures.lowNormal;
      this.material.uniforms.normalMid.value      = this.heightTextures.midNormal;
      this.material.uniforms.normalHigh.value     = this.heightTextures.highNormal;
      this.material.uniforms.normalMountain.value = this.heightTextures.mountainNormal;

      // For scorch
      this.material.uniforms.scorchPositions.value = new THREE.DataTexture(
        new Float32Array(this.texSize * this.texSize * 4), 
        this.texSize, 
        this.texSize, 
        THREE.RGBAFormat,
        THREE.FloatType
      );
      const loader = new THREE.TextureLoader();
      const scorchTexture = loader.load('./textures/burnt.jpg');
      scorchTexture.wrapS = THREE.RepeatWrapping;
      scorchTexture.wrapT = THREE.RepeatWrapping;
      this.material.uniforms.scorchTexture.value = scorchTexture;

      this.mesh = new THREE.Mesh(this.geometry, this.material);
      this.mesh.rotation.x = -Math.PI / 2;
      this.mesh.receiveShadow = true;
      this.scene.add(this.mesh);

      this.createSurfacePlane(terrainData);

      this.intersectionCamera = new THREE.OrthographicCamera(
        -width/2, width/2, depth/2, -depth/2, -1000, 1000
      );
      this.intersectionCamera.position.set(0, 0, 0);
      this.intersectionCamera.rotation.z = -Math.PI/2;
      this.intersectionCamera.lookAt(0, 0, 0);
      this.intersectionScene = new THREE.Scene();
      this.intersectionMesh = new THREE.Mesh(this.geometry, this.intersectionMaterial);
      this.intersectionMesh.rotation.x = -Math.PI/2;
      this.intersectionScene.add(this.intersectionMesh);

      this.renderer.setRenderTarget(this.intersectionRT);
      this.renderer.render(this.intersectionScene, this.intersectionCamera);
      this.renderer.setRenderTarget(null);

      return true;
    } catch (error) {
      console.error('Error creating terrain:', error);
      this.dispose();
      return false;
    }
  }

  /**
   * Set the per-layer UV scale.
   */
  setUVScales(scales) {
    Object.assign(this.uvScales, scales);

    if (this.material && this.material.uniforms) {
      this.material.uniforms.scaleWater.value    = this.uvScales.water;
      this.material.uniforms.scaleLow.value      = this.uvScales.low;
      this.material.uniforms.scaleMid.value      = this.uvScales.mid;
      this.material.uniforms.scaleHigh.value     = this.uvScales.high;
      this.material.uniforms.scaleMountain.value = this.uvScales.mountain;
    }
  }

  /**
   * Decide which plane to create (if any) based on the theme.
   */
  createSurfacePlane(terrainData) {
    if (this.surfacePlane) {
      this.scene.remove(this.surfacePlane);
      this.surfacePlane.geometry.dispose();
      this.surfacePlane.material.dispose();
      this.surfacePlane = null;
    }

    // Desert => no plane
    if (this.currentTheme === 'desert') {
      return;
    }

    let planeMaterial;
    if (this.currentTheme === 'grassland') {
      // "Water"
      planeMaterial = new THREE.ShaderMaterial({
        uniforms: THREE.UniformsUtils.clone(WaterShader.uniforms),
        vertexShader: WaterShader.vertexShader,
        fragmentShader: WaterShader.fragmentShader,
        transparent: true
      });
      planeMaterial.uniforms.tReflection.value    = this.reflectionRenderTarget.texture;
      planeMaterial.uniforms.tEnvironment.value   = this.environmentMap;
      if (planeMaterial instanceof THREE.ShaderMaterial) {
        planeMaterial.uniforms.tIntersections.value = this.intersectionRT.texture;
        // The WaterShader example already has `tIntersections` in the uniforms
        planeMaterial.uniforms.uIntersectionTextureSize.value = 1.0; 
      }

    } else if (this.currentTheme === 'arctic') {
      // "Ice"
      const textureLoader = new THREE.TextureLoader();
      const diffuseMap = textureLoader.load('textures/arctic/frozen_lake.jpg');
      const normalMap  = textureLoader.load('textures/arctic/frozen_lake_normal.jpg');
      planeMaterial = new THREE.MeshPhysicalMaterial({
        map: diffuseMap,
        normalMap: normalMap,
        transparent: true,
        roughness: 0.5,
        metalness: 0.5,
      });
      planeMaterial.normalScale.set(1.5, 1.5);
      diffuseMap.wrapS = diffuseMap.wrapT = THREE.RepeatWrapping;
      normalMap.wrapS  = normalMap.wrapT  = THREE.RepeatWrapping;
      diffuseMap.repeat.set(10, 10);
      normalMap.repeat.set(10, 10);

    } else {
      // fallback
      return;
    }

    const planeGeometry = new THREE.PlaneGeometry(terrainData.width, terrainData.depth, 1, 1);
    planeGeometry.rotateX(-Math.PI / 2);
    planeGeometry.renderOrder = 0;

    this.surfacePlane = new THREE.Mesh(planeGeometry, planeMaterial);
    this.surfacePlane.position.y = -5;
    this.surfacePlane.receiveShadow = true;
    this.scene.add(this.surfacePlane);
  }

  /**
   * Update reflections each frame if using the separate water plane approach.
   */
  updateReflections(renderer, scene, camera) {
    if (!this.surfacePlane || !this.reflectionRenderTarget) return;

    const currentRenderTarget = renderer.getRenderTarget();
    
    // Mirror main camera
    this.reflectionCamera.position.copy(camera.position);
    this.reflectionCamera.rotation.copy(camera.rotation);
    this.reflectionCamera.position.y = -this.reflectionCamera.position.y;
    this.reflectionCamera.rotation.x = -this.reflectionCamera.rotation.x;
    
    // Temporarily hide the plane
    this.surfacePlane.visible = false;
    
    // Render reflection
    renderer.setRenderTarget(this.reflectionRenderTarget);
    renderer.render(scene, this.reflectionCamera);
    
    // Restore
    renderer.setRenderTarget(currentRenderTarget);
    this.surfacePlane.visible = true;
  }

  /**
   * Dispose geometry/material to clean up old terrain.
   */
  dispose() {
    if (this.mesh) {
      this.scene.remove(this.mesh);
      this.mesh.geometry?.dispose();
      this.mesh.material?.dispose();
      this.mesh = null;
    }
    this.geometry?.dispose();
    this.geometry = null;
    
    if (this.surfacePlane) {
      this.scene.remove(this.surfacePlane);
      this.surfacePlane.geometry.dispose();
      this.surfacePlane.material.dispose();
      this.surfacePlane = null;
    }
  }

  getHeightAtPosition(x, z) {
    if (!this.geometry) return 0;
    const worldSize = {
      width: this.geometry.parameters.width,
      height: this.geometry.parameters.height
    };
    
    const segments = this.geometry.parameters.widthSegments;
    const gridX = Math.round((x + worldSize.width/2) * (segments/worldSize.width));
    const gridZ = Math.round((z + worldSize.height/2) * (segments/worldSize.height));
    
    if (gridX < 0 || gridX > segments || gridZ < 0 || gridZ > segments) return 0;
    
    const index = gridZ * (segments + 1) + gridX;
    return this.geometry.attributes.position.array[index * 3 + 2];
  }

  applyTerrainPatch(patch) {
    if (!this.geometry?.attributes.position) {
      console.warn('No terrain geometry to patch!');
      return;
    }
    const positions = this.geometry.attributes.position.array;
    for (const {index, height} of patch) {
      positions[index * 3 + 2] = height;
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.mesh.position.y = 0;
  }

  modifyTerrain(centerX, centerZ, radius, operation = 'flatten', targetHeight = null) {
    if (!this.geometry?.attributes.position) {
      console.warn('No terrain geometry to modify!');
      return;
    }
  
    const positions = this.geometry.attributes.position.array;
    const segments = this.geometry.parameters.widthSegments;
    const width = this.geometry.parameters.width;
    const depth = this.geometry.parameters.height;
  
    if (operation === 'flatten' && targetHeight === null) {
      targetHeight = this.getHeightAtPosition(centerX, centerZ);
    }
  
    for (let z = 0; z <= segments; z++) {
      for (let x = 0; x <= segments; x++) {
        const xPos = (x/segments)*width - width/2;
        const zPos = (z/segments)*depth - depth/2;
        const distance = Math.sqrt((xPos-centerX)**2 + (zPos-centerZ)**2);
        
        if (distance > radius) continue;
        
        const vertexIndex = (z*(segments+1) + x)*3;
        let newHeight = positions[vertexIndex + 2];
        
        switch(operation) {
          case 'flatten':
            const t = Math.max(0, Math.min(1, distance/radius));
            const blend = t*t*(3 - 2*t);
            newHeight = targetHeight*(1-blend) + newHeight*blend;
            break;
            
          case 'crater':
            // Add a check to ensure radius is greater than zero
            if (radius > 0) {
              const blendFactor = distance > radius*0.5 
                ? 1.0 - (distance - radius*0.5)/(radius*0.5)
                : 1.0;
              newHeight -= radius * blendFactor * (distance <= radius*0.5 ? 1 : blendFactor);
            }
            break;
        }
        
        positions[vertexIndex + 2] = newHeight;
      }
    }
  
    this.geometry.attributes.position.needsUpdate = true;    
    this.renderer.setRenderTarget(this.intersectionRT);
    this.renderer.render(this.intersectionScene, this.intersectionCamera);
    this.renderer.setRenderTarget(null);
    this.updateNormals();
  }

  queueTerrainModification(centerX, centerZ, radius, operation = 'flatten', targetHeight = null) {
    this.modificationQueue.push({ centerX, centerZ, radius, operation, targetHeight });
  }

  // ---------------------------------------------------------------------------
  // Scorch system setup
  // ---------------------------------------------------------------------------
  setupScorchSystem(renderer, terrainSize) {
    const scorchRT1 = new THREE.WebGLRenderTarget(this.texSize, this.texSize, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.FloatType
    });
    
    const scorchRT2 = scorchRT1.clone();
    let currentRT = scorchRT1;
    let previousRT = scorchRT2;
  
    // Initialize blank texture
    const blankData = new Float32Array(this.texSize * this.texSize * 4).fill(0);
    const initialTexture = new THREE.DataTexture(
      blankData,
      this.texSize, this.texSize,
      THREE.RGBAFormat,
      THREE.FloatType
    );
    initialTexture.needsUpdate = true;
    previousRT.texture = initialTexture;

    const scorchMaterial = new THREE.ShaderMaterial(ScorchShader);
    scorchMaterial.uniforms.terrainSize.value.copy(terrainSize);

    const scorchQuad = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      scorchMaterial
    );
  
    const orthoCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  
    const applyScorch = (worldPosition, radius = 50, intensity = 1.0) => {
      // Swap render targets
      [currentRT, previousRT] = [previousRT, currentRT];
      
      scorchMaterial.uniforms.hitPosition.value.set(worldPosition.x, worldPosition.z);
      scorchMaterial.uniforms.radius.value = radius;
      scorchMaterial.uniforms.intensity.value = intensity;
      scorchMaterial.uniforms.existingScorches.value = previousRT.texture;
  
      renderer.setRenderTarget(currentRT);
      renderer.render(scorchQuad, orthoCamera);
      renderer.setRenderTarget(null);
  
      // Update terrain material
      this.material.uniforms.scorchPositions.value = currentRT.texture;
      
      return currentRT.texture;
    };
  
    return {
      currentRT,
      applyScorch
    };
  }
}
