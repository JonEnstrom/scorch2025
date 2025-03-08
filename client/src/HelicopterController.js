// HelicopterController.js - Client-side class to manage helicopter models and animations
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { EmitterPool } from './EmitterPool.js';
import { HelicopterEmitters } from './helicopterEmitters.js';


class HelicopterController {
    constructor(scene, socketClient, game, emitterPool = null) {
      this.game = game;
      this.scene = scene;
      this.socketClient = socketClient;
      this.loader = new GLTFLoader();
      this.helicopters = new Map(); 
      this.serverTimeOffset = 0;
      this.bodyModel = null;
      this.bladesModel = null;
      this.modelsLoaded = false;
      this.pendingHelicopters = []; // Store pending helicopter spawns

      this.emitterPool = emitterPool;
      this.emitterPool = new EmitterPool(game.timelineManager.particleSystem);
      this.emitterManager = new HelicopterEmitters(this.emitterPool);
      
      
      // Load models first, then set up socket listeners
      this.loadModels().then(() => {
        this.setupSocketListeners();
        // Process any helicopters that were received while models were loading
        this.processPendingHelicopters();
      });
    }

    
    async loadModels() {
      // Return the promise so we can chain actions after models are loaded
      return Promise.all([
        this.loadModel('/models/helicopter_body.glb'),
        this.loadModel('/models/helicopter_blades.glb')
      ]).then(([bodyModelData, bladesModelData]) => {
        this.bodyModel = bodyModelData.scene;
        this.bladesModel = bladesModelData.scene;
        this.modelsLoaded = true;
        console.log('Helicopter models loaded successfully');
      }).catch(error => {
        console.error('Failed to load helicopter models:', error);
      });
    }
    
    setupSocketListeners() {
      // Handle helicopter spawn events
      this.socketClient.on('spawnHelicopter', (data) => {
        if (this.modelsLoaded) {
          this.spawnHelicopter(data);
        } else {
          // Queue for later if models aren't loaded yet
          this.pendingHelicopters.push({ type: 'spawn', data });
        }
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
        if (this.modelsLoaded) {
          this.spawnExistingHelicopters(data);
        } else {
          // Queue for later if models aren't loaded yet
          this.pendingHelicopters.push({ type: 'existing', data });
        }
      });
    }
    
    // Process any pending helicopter operations after models are loaded
    processPendingHelicopters() {
      if (!this.modelsLoaded) {
        console.warn('Attempted to process pending helicopters before models loaded');
        return;
      }
      
      while (this.pendingHelicopters.length > 0) {
        const pending = this.pendingHelicopters.shift();
        if (pending.type === 'spawn') {
          this.spawnHelicopter(pending.data);
        } else if (pending.type === 'existing') {
          this.spawnExistingHelicopters(pending.data);
        }
      }
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
      if (!this.modelsLoaded) {
        console.warn('Attempted to spawn existing helicopters before models loaded');
        this.pendingHelicopters.push({ type: 'existing', data });
        return;
      }
      
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
      if (!this.modelsLoaded || !this.bodyModel) {
        console.error('Cannot create helicopter instance: models not loaded');
        return null;
      }
      
      const helicopterGroup = new THREE.Group();
      const bodyClone = this.bodyModel.clone();
      
      // Enable shadows for body
      bodyClone.traverse(child => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = false;
        }
      });
      
      const mainBladesClone = this.bladesModel.clone();
      mainBladesClone.name = 'mainRotor';
      mainBladesClone.userData.isRotor = true;
      mainBladesClone.userData.rotationSpeed = 20; // Radians per frame
      
      // Enable shadows for main rotor
      mainBladesClone.traverse(child => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = false;
        }
      });
      
      helicopterGroup.add(bodyClone);
      helicopterGroup.add(mainBladesClone);
      
      const tailBladesClone = this.bladesModel.clone();
      tailBladesClone.name = 'tailRotor';
      tailBladesClone.userData.isRotor = true;
      tailBladesClone.userData.rotationSpeed = 20; // Radians per frame
      tailBladesClone.scale.set(0.25, 0.25, 0.25);
      tailBladesClone.position.set(0.5, 1, -6);
      tailBladesClone.rotation.set(0, 0, Math.PI / 2); // Rotate to face the correct direction
      
      // Enable shadows for tail rotor
      tailBladesClone.traverse(child => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = false;
        }
      });
      
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
      if (!this.modelsLoaded) {
        console.warn(`Attempted to spawn helicopter ${data.id} before models loaded, queueing for later`);
        this.pendingHelicopters.push({ type: 'spawn', data });
        return null;
      }
      
      if (this.helicopters.has(data.id)) {
        return this.helicopters.get(data.id).model;
      }
      
      const model = this.createHelicopterInstance();
      if (!model) {
        console.error(`Failed to create helicopter instance for ID ${data.id}`);
        return null;
      }
    
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

        if (this.emitterPool && this.helicopters.has(data.id)) {
    // this.emitterManager.attachHelicopterTrailEmitters(this.helicopters.get(data.id));
        }
      
      return model;
    }
          
    // Remove a helicopter
    removeHelicopter(helicopterId) {
      const helicopter = this.helicopters.get(helicopterId);
      if (helicopter) {
        if (this.emitterPool) {
          this.emitterManager.cleanupHelicopterTrailEmitters(helicopter);
        }
        if (helicopter.isCrashing) {
          // Remove physics body if it exists
          if (helicopter.physicsBody && this.game.physicsManager) {
            this.game.physicsManager.removeRigidBody(helicopter.physicsBody);
            helicopter.physicsBody = null;
          }
        }
        
        if (!helicopter.isDestroyed && !helicopter.isCrashing) {
          this.cleanupHelicopterResources(helicopter);
          this.helicopters.delete(helicopterId);
        } else {
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

      if (this.emitterPool) {
        this.emitterManager.createExplosionEmitters(helicopter.model.position);
      }
      
      this.createDestructionExplosion(helicopter);
      this.createHelicopterDebris(helicopter);
      this.startHelicopterCrash(helicopter);
    }
    
        
    // Create spectacular explosion for helicopter destruction
    createDestructionExplosion(helicopter) {
      const position = helicopter.model.position.clone();
      
      // Create main explosion sphere
      const explosionGeometry = new THREE.SphereGeometry(0.5, 16, 16);
      const explosionMaterial = new THREE.MeshBasicMaterial({
        color: 0xffffff,
      });
      const explosion = new THREE.Mesh(explosionGeometry, explosionMaterial);
      explosion.position.copy(position);
      this.scene.add(explosion);
      
      // Enable bloom
      explosion.layers.enable(1);
      
      // Create secondary explosion
      const explosion2Geometry = new THREE.SphereGeometry(0.3, 16, 16);
      const explosion2Material = new THREE.MeshBasicMaterial({
        color: 0xffff00,
      });
      const explosion2 = new THREE.Mesh(explosion2Geometry, explosion2Material);
      explosion2.position.copy(position);
      this.scene.add(explosion2);
      explosion2.layers.enable(1);
            
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
        
        if (opacity <= 0) {
          // Clean up all explosion objects
          this.scene.remove(explosion);
          explosionGeometry.dispose();
          explosionMaterial.dispose();
          
          this.scene.remove(explosion2);
          explosion2Geometry.dispose();
          explosion2Material.dispose();
          
          //this.scene.remove(light);
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
      
      // Create debris pieces
      const debrisCount = 10 + Math.floor(Math.random() * 5);
      const debrisShapes = ['box', 'sphere', 'cylinder'];
      
      for (let i = 0; i < debrisCount; i++) {
        // Pick a random shape
        const shapeType = debrisShapes[Math.floor(Math.random() * debrisShapes.length)];
        
        // Create geometry based on shape
        let debrisGeometry;
        let physicsShape = shapeType;
        let dimensions;
        
        switch (shapeType) {
          case 'box':
            dimensions = {
              x: 0.5 * (0.5 + Math.random()),
              y: 0.5 * (0.5 + Math.random()),
              z: 0.5 * (0.5 + Math.random())
            };
            debrisGeometry = new THREE.BoxGeometry(
              dimensions.x, dimensions.y, dimensions.z
            );
            break;
            
          case 'sphere':
            const radius = 0.4 * (0.5 + Math.random());
            debrisGeometry = new THREE.SphereGeometry(radius, 8, 8);
            dimensions = { radius };
            break;
            
          case 'cylinder':
            dimensions = {
              x: 0.3 * (0.5 + Math.random()), // radius top
              y: 0.6 * (0.5 + Math.random()), // height
              z: 0.3 * (0.5 + Math.random())  // radius bottom
            };
            debrisGeometry = new THREE.CylinderGeometry(
              dimensions.x, dimensions.z, dimensions.y, 8
            );
            break;
        }
        
        // Choose a material
        let debrisMaterial;
        
        if (helicopterMaterials.length > 0) {
          const sourceMaterial = helicopterMaterials[Math.floor(Math.random() * helicopterMaterials.length)];
          debrisMaterial = sourceMaterial.clone();
        } else {
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

        debris.castShadow = true;

        
        // Position around the helicopter with random offset
        debris.position.copy(position);
        debris.position.x += (Math.random() - 0.5) * 15;
        debris.position.y -= 10;
        debris.position.z += (Math.random() - 0.5) * 15;
        
        // Apply random rotation
        debris.rotation.set(
          Math.random() * Math.PI * 2,
          Math.random() * Math.PI * 2,
          Math.random() * Math.PI * 2
        );
        
        this.scene.add(debris);
        
        // Create physics body for debris
        const mass = 5 + Math.random() * 5; // Random mass
        
        let physicsBody;
        
        switch (physicsShape) {
          case 'box':
            physicsBody = this.game.physicsManager.createBoxBody(
              debris, 
              mass, 
              dimensions,
              { 
                friction: 0.5 + Math.random() * 0.5,
                restitution: 0.3 + Math.random() * 0.4
              }
            );
            break;
            
          case 'sphere':
            physicsBody = this.game.physicsManager.createSphereBody(
              debris, 
              mass, 
              dimensions.radius,
              { 
                friction: 0.1 + Math.random() * 0.4,
                restitution: 0.5 + Math.random() * 0.4
              }
            );
            break;
            
          case 'cylinder':
            physicsBody = this.game.physicsManager.createCylinderBody(
              debris, 
              mass, 
              dimensions,
              { 
                friction: 0.3 + Math.random() * 0.5,
                restitution: 0.4 + Math.random() * 0.4
              }
            );
            break;
        }
        
        if (physicsBody) {
          // Apply random impulse to make debris fly outward
          const impulseStrength = 50 + Math.random() * 50;
          const impulseDirection = new THREE.Vector3(
            (Math.random() - 0.5) * 2,
            0.5 + Math.random(), // Upward bias
            (Math.random() - 0.5) * 2
          ).normalize();
          
          const impulse = impulseDirection.multiplyScalar(impulseStrength);
          this.game.physicsManager.applyImpulse(physicsBody, impulse);
          
          // Apply random torque for spinning
          const torque = new THREE.Vector3(
            (Math.random() - 0.5) * 50,
            (Math.random() - 0.5) * 50,
            (Math.random() - 0.5) * 50
          );
          
          this.game.physicsManager.applyTorque(physicsBody, torque);
        }
        
        // Store debris data
        debris.userData.isPhysicsControlled = true;
        debris.userData.physicsBody = physicsBody;
        debris.userData.lifetime = 10000; // 10 seconds
        debris.userData.creationTime = performance.now();

        if (this.emitterPool) {
          // Add smoke trail to some debris pieces
          if (Math.random() > 0.5) {
            this.emitterManager.attachDebrisTrailEmitters(debris);
          }
          
          // Add burn trail to fewer debris pieces for visual variety
          if (Math.random() > 0.8) {
            this.emitterManager.attachDebrisTrailEmitters(debris, true); // true = burn trail
          }
        }
        
        if (!this.debrisPieces) {
          this.debrisPieces = [];
        }
        this.debrisPieces.push(debris);
      }
    }

// Start helicopter crash animation with separate debris for body and rotor
startHelicopterCrash(helicopter) {
  // Mark helicopter as crashing
  helicopter.isCrashing = true;
  helicopter.crashStartTime = performance.now();

  // Detach helicopter body as debris (assumes the body is the child without rotor flag)
  const helicopterBody = helicopter.model.children.find(child => !child.userData.isRotor);
  if (helicopterBody) {
    // Get world transform of the body
    const bodyPos = new THREE.Vector3();
    helicopterBody.getWorldPosition(bodyPos);
    const bodyQuat = new THREE.Quaternion();
    helicopterBody.getWorldQuaternion(bodyQuat);

    // Clone the body to create debris
    const bodyDebris = helicopterBody.clone();
    bodyDebris.position.copy(bodyPos);
    bodyDebris.quaternion.copy(bodyQuat);
    // Enable shadows for body debris
    bodyDebris.traverse(child => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = false;
      }
    });

    // Remove the original body from the helicopter model
    helicopter.model.remove(helicopterBody);

    // Add the cloned debris to the scene
    this.scene.add(bodyDebris);

    // Create a physics body for the debris using a box shape
    const bodyPhysics = this.createPhysicsBody(
      bodyDebris,
      10, // mass for helicopter body debris
      'box',
      { restitution: 0.7, angularDamping: 0.0, friction: 0.7 }
    );
    if (bodyPhysics) {
      bodyDebris.userData.isPhysicsControlled = true;


      const bodyTorque = new THREE.Vector3(0, 100000, 0);
      this.game.physicsManager.applyTorque(bodyPhysics, bodyTorque);
    }
    // Store debris data for later cleanup
    bodyDebris.userData.physicsBody = bodyPhysics;
    bodyDebris.userData.lifetime = 20000; // 10 seconds lifetime
    bodyDebris.userData.creationTime = performance.now();

    if (this.emitterPool) {
      // Add smoke trail to body
      this.emitterManager.attachDebrisTrailEmitters(bodyDebris);
      // Add burn trail to body for dramatic effect
      this.emitterManager.attachDebrisTrailEmitters(bodyDebris, true);
    }


    if (!this.debrisPieces) {
      this.debrisPieces = [];
    }
    this.debrisPieces.push(bodyDebris);
  }

  // Detach rotor to simulate catastrophic damage
  const mainRotor = helicopter.model.getObjectByName('mainRotor');
  if (mainRotor) {
    // Stop rotor animation on the original model
    mainRotor.userData.isRotor = false;

    // Get world transform for rotor
    const rotorPos = new THREE.Vector3();
    mainRotor.getWorldPosition(rotorPos);
    const rotorQuat = new THREE.Quaternion();
    mainRotor.getWorldQuaternion(rotorQuat);

    // Clone the rotor to create debris
    const rotorDebris = mainRotor.clone();
    rotorDebris.position.copy(rotorPos);
    rotorDebris.position.y += 5;
    rotorDebris.quaternion.copy(rotorQuat);

    // Enable shadows for rotor debris
    rotorDebris.traverse(child => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = false;
      }
    });

    // Set free-spinning properties for the detached rotor
    rotorDebris.userData.isFreeRotor = true;
    rotorDebris.userData.rotationSpeed = 20 + Math.random() * 20;
    rotorDebris.userData.rotationAxis = new THREE.Vector3(
      Math.random() - 0.5,
      Math.random() - 0.5,
      Math.random() - 0.5
    ).normalize();

    // Add rotor debris to scene
    this.scene.add(rotorDebris);

    const rotorBody = this.createPhysicsBody(
      rotorDebris,
      5, // mass for the rotor debris
      'box',
      { restitution: 0.7, angularDamping: 0.05 }
    );
    if (rotorBody) {

      const rotorTorque = new THREE.Vector3(
        0,
        250000,
        0
      );
      this.game.physicsManager.applyTorque(rotorBody, rotorTorque);
    }

    // Mark and store rotor debris data
    rotorDebris.userData.isPhysicsControlled = true;
    rotorDebris.userData.physicsBody = rotorBody;
    rotorDebris.userData.lifetime = 8000; // 8 seconds lifetime
    rotorDebris.userData.creationTime = performance.now();
    if (!this.debrisPieces) {
      this.debrisPieces = [];
    }
    this.debrisPieces.push(rotorDebris);
  }

  // If the helicopter model is now empty, remove it from the scene
  if (helicopter.model.children.length === 0) {
    this.scene.remove(helicopter.model);
  }

  // Schedule removal of the helicopter from tracking after the crash simulation
  setTimeout(() => {
    this.removeHelicopter(helicopter.id);
  }, 10000); // 10 seconds to allow physics simulation to play out
}

    
    // Clean up all resources related to a specific helicopter
    cleanupHelicopterResources(helicopter) {

      if (this.emitterPool) {
        this.emitterManager.cleanupHelicopterTrailEmitters(helicopter);
      }
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

    createPhysicsBody(mesh, mass, shape, options = {}) {
      if (!this.game || !this.game.physicsManager || !this.game.physicsManager.initialized) {
        console.warn('Physics not available - cannot create physics body');
        return null;
      }
      
      // Default options for helicopters
      const defaultOptions = {
        friction: 0.5,
        restitution: 0.8, // Bounciness
        linearDamping: 0.1,
        angularDamping: 0.2
      };
      
      const finalOptions = { ...defaultOptions, ...options };
      
      let body;
      switch (shape) {
        case 'box':
          // Estimate helicopter dimensions based on mesh bounding box
          const bbox = new THREE.Box3().setFromObject(mesh);
          const size = new THREE.Vector3();
          bbox.getSize(size);
          body = this.game.physicsManager.createBoxBody(
            mesh,
            mass,
            size,
            finalOptions
          );
          break;
          
        case 'sphere':
          // Use a sphere for simplicity
          const radius = mesh.scale.x * 2; // Approximation
          body = this.game.physicsManager.createSphereBody(
            mesh,
            mass,
            radius,
            finalOptions
          );
          break;
          
        case 'cylinder':
          // Use a cylinder for rotor blades
          const cylinderSize = new THREE.Vector3(
            mesh.scale.x * 0.4, 
            mesh.scale.y * 0.05, 
            mesh.scale.z * 0.4
          );
          body = this.game.physicsManager.createCylinderBody(
            mesh,
            mass,
            cylinderSize,
            finalOptions
          );
          break;
          
        default:
          console.warn('Unknown shape type:', shape);
          return null;
      }
      
      return body;
    }
      
    update(currentTime, deltaTime) {
      // Skip update if models aren't loaded yet
      if (!this.modelsLoaded) return;
      
      // First, update all rotors (normal helicopter rotors)
      this.updateRotors(deltaTime);

      if (this.emitterPool) {
        this.emitterManager.updateTrailEmitters(deltaTime, this.helicopters);
      }
      
      // Handle all helicopters, both normal and crashing
      this.helicopters.forEach((helicopter) => {
        if (!helicopter.isCrashing) {
          // Original flight path animation for normal helicopters
          const timeSinceSpawn = (currentTime - helicopter.spawnTime) / 1000;
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
        } else {
          //this.crashSmokeEmitter.setPosition(helicopter.userData.physicsBody.position);
        }
      });

      
      
      // Handle debris and detached rotors
      if (this.debrisPieces) {
        const currentTime = performance.now();
        const remainingDebris = [];
        
        for (const debris of this.debrisPieces) {
          const elapsed = currentTime - debris.userData.creationTime;
          
          if (elapsed < debris.userData.lifetime) {
            // Apply additional visual rotation for free-spinning rotors
            // This is separate from physical rotation and just for visual effect
            if (debris.userData.isFreeRotor && debris.userData.rotationSpeed) {
              // Create a rotation matrix for custom axis rotation
              const rotationMatrix = new THREE.Matrix4();
              const axis = debris.userData.rotationAxis || new THREE.Vector3(0, 1, 0);
              const angle = debris.userData.rotationSpeed * deltaTime;
              
              rotationMatrix.makeRotationAxis(axis, angle);
              debris.matrix.multiply(rotationMatrix);
              debris.matrix.decompose(debris.position, debris.quaternion, debris.scale);
            }
            
            // Fade-out effect
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

            if (this.emitterPool) {
              this.emitterManager.cleanupDebrisTrailEmitters(debris);
            }
            this.scene.remove(debris);
            
            // Remove physics body
            if (debris.userData.physicsBody && this.game.physicsManager) {
              this.game.physicsManager.removeRigidBody(debris.userData.physicsBody);
            }
            
            // Dispose resources
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