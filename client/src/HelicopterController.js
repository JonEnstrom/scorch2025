// HelicopterController.js - Client-side class to manage helicopter models and animations
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

class HelicopterController {
    constructor(scene, socketClient) {
      this.scene = scene;
      this.socketClient = socketClient;
      this.loader = new GLTFLoader();
      this.helicopters = new Map(); 
      this.serverTimeOffset = 0;
      this.bodyModel = null;
      this.bladesModel = null;
      this.modelsLoaded = false;
      this.loadModels();
      this.setupSocketListeners();
    }
    
    loadModels() {
      // Setup a promise that resolves when both models are loaded
      const loadPromise = Promise.all([
        this.loadModel('/models/helicopter_body.glb'),
        this.loadModel('/models/helicopter_blades.glb')
      ]);
      
      loadPromise.then(([bodyModelData, bladesModelData]) => {
        this.bodyModel = bodyModelData.scene;
        this.bladesModel = bladesModelData.scene;
        this.modelsLoaded = true;
        
        // Notify any pending operations that models are now loaded
        if (this.onModelsLoaded) {
          this.onModelsLoaded();
        }
      }).catch(error => {
        console.error('Failed to load helicopter models:', error);
      });
    }
    
    setupSocketListeners() {
      // Handle helicopter spawn events
      this.socketClient.on('spawnHelicopter', (data) => {
        this.spawnHelicopter(data);
      });
      
      // Handle helicopter removal events
      this.socketClient.on('removeHelicopter', (data) => {
        this.removeHelicopter(data.id);
      });

      // Handle helicopter destruction events
      this.socketClient.on('helicopterDestroyed', (data) => {
        this.handleHelicopterDestroyed(data.helicopterId, data.position);
      });
      
      // Handle existing helicopters info when joining mid-game
      this.socketClient.on('existingHelicopters', (data) => {
        this.spawnExistingHelicopters(data);
      });
    }
    
    // Calculate and update server-client time offset
    updateTimeOffset(serverTime) {
      this.serverTimeOffset = Date.now() - serverTime;
      console.log(`Time offset: ${this.serverTimeOffset}ms`);
    }
    
    // Convert server time to client performance.now() time
    serverToClientTime(serverTime) {
      // First convert server time to client system time
      const clientSystemTime = serverTime + this.serverTimeOffset;
      const performanceTimeOffset = performance.now() - Date.now();
      return clientSystemTime + performanceTimeOffset;
    }
    
    // Spawn existing helicopters when joining mid-game
    spawnExistingHelicopters(data) {
      this.updateTimeOffset(data.serverTime);
      for (const helicopter of data.helicopters) {
        if (this.helicopters.has(helicopter.id)) {
          continue;
        }
        const spawnData = {
          id: helicopter.id,
          spawnTime: helicopter.spawnTime,
          spawnPoint: helicopter.spawnPoint,
          flightPath: helicopter.flightPath
        };
        this.spawnHelicopter(spawnData);
      }
    }
    
    loadModel(url) {
      return new Promise((resolve, reject) => {
        this.loader.load(
          url,
          (gltf) => resolve(gltf),
          undefined,
          (error) => reject(error)
        );
      });
    }
    
    // Create a helicopter instance from the loaded models
    createHelicopterInstance() {
      const helicopterGroup = new THREE.Group();
      const bodyClone = this.bodyModel.clone();
      const mainBladesClone = this.bladesModel.clone();
      mainBladesClone.name = 'mainRotor';
      mainBladesClone.userData.isRotor = true;
      mainBladesClone.userData.rotationSpeed = 20; // Radians per frame
      helicopterGroup.add(bodyClone);
      helicopterGroup.add(mainBladesClone);
      const tailBladesClone = this.bladesModel.clone();
      tailBladesClone.name = 'tailRotor';
      tailBladesClone.userData.isRotor = true;
      tailBladesClone.userData.rotationSpeed = 20; // Radians per frame
      tailBladesClone.scale.set(0.3, 0.3, 0.3);
      tailBladesClone.position.set(0, 1, -8.5);
      tailBladesClone.rotation.set(0, 0, Math.PI / 2); // Rotate to face the correct direction
      helicopterGroup.add(tailBladesClone);
      return helicopterGroup;
    }
    
    updateRotors(delta) {
      this.helicopters.forEach((helicopter) => {
        const model = helicopter.model;
        const mainRotor = model.getObjectByName('mainRotor');
        if (mainRotor && mainRotor.userData.isRotor) {
          mainRotor.rotation.y += mainRotor.userData.rotationSpeed * delta;
        }
        const tailRotor = model.getObjectByName('tailRotor');
        if (tailRotor && tailRotor.userData.isRotor) {
          tailRotor.rotation.x += tailRotor.userData.rotationSpeed * delta;
        }
      });
    }
    
    // Spawn a helicopter based on server data
    spawnHelicopter(data) {
      if (this.helicopters.has(data.id)) {
        return this.helicopters.get(data.id).model;
      }
      const model = this.createHelicopterInstance();
      model.scale.set(5, 5, 5);
      model.position.copy(data.spawnPoint.position);
      model.rotation.set(
        data.spawnPoint.rotation.x,
        data.spawnPoint.rotation.y,
        data.spawnPoint.rotation.z
      );
      this.scene.add(model);
      
      let clientSpawnTime;
      if (data.spawnTime) {
        clientSpawnTime = this.serverToClientTime(data.spawnTime);
      }
      // Store helicopter data
      this.helicopters.set(data.id, {
        id: data.id,
        model,
        flightPath: data.flightPath,
        spawnTime: clientSpawnTime,
        serverSpawnTime: data.spawnTime || (Date.now() - this.serverTimeOffset)
      });
      
      return model;
    }
          
    // Remove a helicopter
    removeHelicopter(helicopterId) {
      const helicopter = this.helicopters.get(helicopterId);
      if (helicopter) {
        if (helicopter.isCrashing) return;
        if (!helicopter.isDestroyed && !helicopter.isCrashing) {
          this.cleanupHelicopterResources(helicopter);
          this.helicopters.delete(helicopterId);
        }
      }
    }
    
    
    // Method to handle helicopter destruction
    handleHelicopterDestroyed(helicopterId, position) {
      const helicopter = this.helicopters.get(helicopterId);
      if (!helicopter) return;
      if (helicopter.isDestroyed) return;
      
      // Mark as destroyed if not already
      helicopter.isDestroyed = true;
      
      this.createDestructionExplosion(helicopter);
      this.createHelicopterDebris(helicopter);
      this.startHelicopterCrash(helicopter);
    }
    
        
    // Create spectacular explosion for helicopter destruction
    createDestructionExplosion(helicopter) {
      const position = helicopter.model.position.clone();
      
      // Create main explosion sphere
      const explosionGeometry = new THREE.SphereGeometry(5, 16, 16);
      const explosionMaterial = new THREE.MeshBasicMaterial({
        color: 0xffffff,
      });
      const explosion = new THREE.Mesh(explosionGeometry, explosionMaterial);
      explosion.position.copy(position);
      this.scene.add(explosion);
      
      // Enable bloom
      explosion.layers.enable(1);
      
      // Create secondary explosion
      const explosion2Geometry = new THREE.SphereGeometry(3, 16, 16);
      const explosion2Material = new THREE.MeshBasicMaterial({
        color: 0xffff00,
      });
      const explosion2 = new THREE.Mesh(explosion2Geometry, explosion2Material);
      explosion2.position.copy(position);
      this.scene.add(explosion2);
      explosion2.layers.enable(1);
      
      // Add a point light for illumination
      const light = new THREE.PointLight(0xff5500, 2000, 1000);
      light.position.copy(position);
      this.scene.add(light);
      
      // Create explosion animation
      let scale = 1;
      let opacity = 0.8;
      
      const animateExplosion = () => {
        scale += 0.12;
        opacity -= 0.02;
        
        explosion.scale.set(scale, scale, scale);
        explosionMaterial.opacity = opacity;
        
        explosion2.scale.set(scale * 0.8, scale * 0.8, scale * 0.8);
        explosion2Material.opacity = opacity * 1.1;
        
        // Reduce light intensity
        light.intensity = 2000 * opacity;
        
        if (opacity <= 0) {
          // Clean up all explosion objects
          this.scene.remove(explosion);
          explosionGeometry.dispose();
          explosionMaterial.dispose();
          
          this.scene.remove(explosion2);
          explosion2Geometry.dispose();
          explosion2Material.dispose();
          
          this.scene.remove(light);
        } else {
          requestAnimationFrame(animateExplosion);
        }
      };
      
      animateExplosion();
    }
    
    // Create helicopter debris for dramatic destruction
    createHelicopterDebris(helicopter) {
      const position = helicopter.model.position.clone();
      
      // Extract materials from the helicopter to reuse for debris
      const helicopterMaterials = [];
      helicopter.model.traverse((child) => {
        if (child.isMesh && child.material) {
          if (Array.isArray(child.material)) {
            helicopterMaterials.push(...child.material);
          } else {
            helicopterMaterials.push(child.material);
          }
        }
      });
      
      // Create 15-20 large debris pieces from the helicopter
      const debrisCount = 15 + Math.floor(Math.random() * 5);
      const debrisShapes = [
        'box', 'sphere', 'cylinder'
      ];
      
      for (let i = 0; i < debrisCount; i++) {
        // Pick a random shape
        const shapeType = debrisShapes[Math.floor(Math.random() * debrisShapes.length)];
        
        // Create geometry based on shape
        let debrisGeometry;
        
        switch (shapeType) {
          case 'box':
            debrisGeometry = new THREE.BoxGeometry(
              5 * (0.5 + Math.random()),
              5 * (0.5 + Math.random()),
              5 * (0.5 + Math.random())
            );
            break;
            
          case 'sphere':
            debrisGeometry = new THREE.SphereGeometry(
              4 * (0.5 + Math.random()),
              4,
              4
            );
            break;
            
          case 'cylinder':
            debrisGeometry = new THREE.CylinderGeometry(
              3 * (0.5 + Math.random()),
              3 * (0.5 + Math.random()),
              6 * (0.5 + Math.random()),
              4
            );
            break;
        }
        
        // Choose a material from the helicopter's materials or create a new one based on them
        let debrisMaterial;
        
        if (helicopterMaterials.length > 0) {
          // Clone a random material from the helicopter
          const sourceMaterial = helicopterMaterials[Math.floor(Math.random() * helicopterMaterials.length)];
          
          // Clone the material to avoid modifying the original
          debrisMaterial = sourceMaterial.clone();
          
        } else {
          // Fallback if no materials are found
          const color = Math.random() > 0.6 ? 0x333333 : 0x222222;
          debrisMaterial = new THREE.MeshStandardMaterial({
            color: color,
            metalness: 0.7,
            roughness: 0.3,
            emissive: Math.random() > 0.7 ? 0xff2200 : 0x000000,
            emissiveIntensity: 0.5
          });
        }
        
        // Ensure the material is set to allow transparency for fade-out
        debrisMaterial.transparent = true;
        
        const debris = new THREE.Mesh(debrisGeometry, debrisMaterial);
        
        // Position around the helicopter with random offset
        debris.position.copy(position);
        debris.position.x += (Math.random() - 0.5) * 20;
        debris.position.y += (Math.random() - 0.5) * 20;
        debris.position.z += (Math.random() - 0.5) * 20;
        
        // Apply random rotation
        debris.rotation.set(
          Math.random() * Math.PI * 2,
          Math.random() * Math.PI * 2,
          Math.random() * Math.PI * 2
        );
        
        this.scene.add(debris);
        
        // Calculate random velocity in all directions
        const velocityMagnitude = 20 + Math.random() * 30;
        const velocityDirection = new THREE.Vector3(
          (Math.random() - 0.5) * 2,
          (Math.random() - 0.5) * 2 + 0.5, // Slight upward bias
          (Math.random() - 0.5) * 2
        ).normalize();
        
        const velocity = velocityDirection.multiplyScalar(velocityMagnitude);
        
        // Store velocity and rotation data
        debris.userData.velocity = velocity;
        debris.userData.rotationSpeed = {
          x: (Math.random() - 0.5) * 0.1,
          y: (Math.random() - 0.5) * 0.1,
          z: (Math.random() - 0.5) * 0.1
        };
        debris.userData.gravity = 40;
        debris.userData.lifetime = 10000; // 10 seconds
        debris.userData.creationTime = performance.now();
        
        // Add to debris array
        if (!this.debrisPieces) {
          this.debrisPieces = [];
        }
        this.debrisPieces.push(debris);
      }
    }

    // Start helicopter crash animation
    startHelicopterCrash(helicopter) {
      // Detach rotor to simulate catastrophic damage
      const mainRotor = helicopter.model.getObjectByName('mainRotor');
      if (mainRotor) {
        // Stop rotor animation
        mainRotor.userData.isRotor = false;
        
        // Create detached main rotor debris
        const rotorPos = new THREE.Vector3();
        mainRotor.getWorldPosition(rotorPos);
        
        // Clone rotor to create debris
        const rotorDebris = mainRotor.clone();
        rotorDebris.scale.set(5, 5, 5);
        rotorDebris.position.copy(rotorPos);
        rotorDebris.userData.velocity = new THREE.Vector3(
          (Math.random() - 0.5) * 300,
          20 + Math.random() * 20,
          (Math.random() - 0.5) * 300
        );
        rotorDebris.userData.rotationSpeed = {
          x: (Math.random() - 0.5) * 30,
          y: (Math.random() - 0.5) * 1,
          z: (Math.random() - 0.5) * 1
        };
        rotorDebris.userData.gravity = 40;
        rotorDebris.userData.lifetime = 8000; // 8 seconds
        rotorDebris.userData.creationTime = performance.now();
        
        this.scene.add(rotorDebris);
        
        if (!this.debrisPieces) {
          this.debrisPieces = [];
        }
        this.debrisPieces.push(rotorDebris);
        
        // Hide original rotor
        mainRotor.visible = false;
      }
      
      // Set helicopter to fall
      helicopter.isCrashing = true;
      helicopter.crashStartTime = performance.now();
      helicopter.crashVelocity = new THREE.Vector3(
        (Math.random() - 0.5) * 10,
        -20, // Falling down
        (Math.random() - 0.5) * 10
      );
      helicopter.crashRotation = new THREE.Vector3(
        (Math.random() - 0.5) * 0.05,
        (Math.random() - 0.5) * 0.05,
        (Math.random() - 0.5) * 0.05
      );
      
      // Schedule removal after crash animation
      setTimeout(() => {
        this.removeHelicopter(helicopter.id);
      }, 8000);
    }
    
    // Clean up all resources related to a specific helicopter
    cleanupHelicopterResources(helicopter) {
      // Remove the model from scene
      this.scene.remove(helicopter.model);
      
      // Dispose model resources
      helicopter.model.traverse((child) => {
        if (child.isMesh) {
          child.geometry?.dispose();
          if (child.material) {
            if (Array.isArray(child.material)) {
              child.material.forEach(mat => mat.dispose());
            } else {
              child.material.dispose();
            }
          }
        }
      });
    }
      
    update(currentTime, deltaTime) {
      // Update flight path for non-crashing helicopters
      this.helicopters.forEach((helicopter) => {
        if (!helicopter.isCrashing) {
          const timeSinceSpawn = (currentTime - helicopter.spawnTime) / 1000; // Convert to seconds
          if (timeSinceSpawn < 0) return;
          
          // Find the appropriate path segments for interpolation
          const flightPath = helicopter.flightPath;
          
          let startIndex = 0;
          while (
            startIndex < flightPath.length - 1 &&
            flightPath[startIndex + 1].time <= timeSinceSpawn
          ) {
            startIndex++;
          }
          
          // If we've reached the end of the pre-calculated path
          if (startIndex >= flightPath.length - 1) {
            const lastPoint = flightPath[flightPath.length - 1];
            helicopter.model.position.copy(lastPoint.position);
            helicopter.model.rotation.set(
              lastPoint.rotation.x,
              lastPoint.rotation.y,
              lastPoint.rotation.z
            );
          } else {
            // Interpolate between the two closest path points
            const point1 = flightPath[startIndex];
            const point2 = flightPath[startIndex + 1];
            const t = (timeSinceSpawn - point1.time) / (point2.time - point1.time);
            
            // Position interpolation
            helicopter.model.position.set(
              point1.position.x + (point2.position.x - point1.position.x) * t,
              point1.position.y + (point2.position.y - point1.position.y) * t,
              point1.position.z + (point2.position.z - point1.position.z) * t
            );
            
            // Rotation interpolation - handle wraparound for yaw
            let y1 = point1.rotation.y;
            let y2 = point2.rotation.y;
            if (Math.abs(y2 - y1) > Math.PI) {
              if (y2 > y1) {
                y1 += Math.PI * 2;
              } else {
                y2 += Math.PI * 2;
              }
            }
            
            helicopter.model.rotation.set(
              point1.rotation.x + (point2.rotation.x - point1.rotation.x) * t,
              y1 + (y2 - y1) * t,
              point1.rotation.z + (point2.rotation.z - point1.rotation.z) * t
            );
            
            // Normalize rotation
            helicopter.model.rotation.y = helicopter.model.rotation.y % (Math.PI * 2);
          }
        }
      });
      
      // Handle crashing helicopters
      this.helicopters.forEach((helicopter) => {
        if (helicopter.isCrashing) {
          
          // Update crash velocity with gravity (gravity accelerates the fall over time)
          helicopter.crashVelocity.y -= 100 * deltaTime; // gravity
          
          // Update position using the updated velocity
          helicopter.model.position.x += helicopter.crashVelocity.x * deltaTime;
          helicopter.model.position.y += helicopter.crashVelocity.y * deltaTime;
          helicopter.model.position.z += helicopter.crashVelocity.z * deltaTime;
          
          // Update rotation - more dramatic as it falls
          const elapsedCrashTime = (currentTime - helicopter.crashStartTime) / 1000; // in seconds
          helicopter.model.rotation.x += helicopter.crashRotation.x * Math.min(elapsedCrashTime * 5, 3);
          helicopter.model.rotation.y += helicopter.crashRotation.y;
          helicopter.model.rotation.z += helicopter.crashRotation.z * Math.min(elapsedCrashTime * 5, 3);
        }
      });
      
      // Update debris physics
      if (this.debrisPieces) {
        const currentTime = performance.now();
        const remainingDebris = [];
        
        for (const debris of this.debrisPieces) {
          const elapsed = currentTime - debris.userData.creationTime;
          
          if (elapsed < debris.userData.lifetime) {
            // Apply velocity
            debris.position.x += debris.userData.velocity.x * deltaTime; // assuming 60fps
            debris.position.y += debris.userData.velocity.y * deltaTime;
            debris.position.z += debris.userData.velocity.z * deltaTime;
            
            // Apply gravity if specified
            if (debris.userData.gravity) {
              debris.userData.velocity.y -= debris.userData.gravity * deltaTime;
            }
            
            // Apply rotation
            debris.rotation.x += debris.userData.rotationSpeed.x;
            debris.rotation.y += debris.userData.rotationSpeed.y;
            debris.rotation.z += debris.userData.rotationSpeed.z;
            
            // Fade out near end of lifetime
            if (elapsed > debris.userData.lifetime * 0.7 && debris.material) {
              const fadeProgress = (elapsed - debris.userData.lifetime * 0.7) / (debris.userData.lifetime * 0.3);
              if (debris.material.opacity !== undefined) {
                debris.material.opacity = 1 - fadeProgress;
                debris.material.transparent = true;
              }
            }
            
            remainingDebris.push(debris);
          } else {
            // Debris lifetime expired, remove it
            this.scene.remove(debris);
            if (debris.geometry) debris.geometry.dispose();
            if (debris.material) {
              if (Array.isArray(debris.material)) {
                debris.material.forEach(mat => mat.dispose());
              } else {
                debris.material.dispose();
              }
            }
          }
        }
        
        this.debrisPieces = remainingDebris;
      }
    }
  }
  
  export { HelicopterController };