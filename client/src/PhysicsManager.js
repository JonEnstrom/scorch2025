// PhysicsManager.js
import * as THREE from 'three';

export class PhysicsManager {
    constructor(game) {
        this.game = game;
        this.dynamicObjects = [];
        this.rigidBodies = [];
        this.tmpTransform = null;
        this.initialized = false;
        this.terrainBody = null;
    }

    async init() {
        return new Promise((resolve) => {
            // Check if Ammo is available globally
            if (typeof Ammo === 'undefined') {
                console.error('Ammo.js is not loaded. Make sure to include the Ammo.js script in your HTML.');
                resolve(false);
                return;
            }

            // Initialize Ammo.js
            console.log('Initializing Ammo.js...');
            
            // Ammo might be a function that returns a promise, or it might be already initialized
            const ammoInit = typeof Ammo === 'function' ? Ammo() : Promise.resolve(Ammo);
            
            ammoInit.then((ammo) => {
                this.ammo = ammo;
                
                // Set up physics world
                this.collisionConfiguration = new this.ammo.btDefaultCollisionConfiguration();
                this.dispatcher = new this.ammo.btCollisionDispatcher(this.collisionConfiguration);
                this.broadphase = new this.ammo.btDbvtBroadphase();
                this.solver = new this.ammo.btSequentialImpulseConstraintSolver();
                this.physicsWorld = new this.ammo.btDiscreteDynamicsWorld(
                    this.dispatcher, 
                    this.broadphase, 
                    this.solver, 
                    this.collisionConfiguration
                );
                
                // Set gravity
                this.physicsWorld.setGravity(new this.ammo.btVector3(0, -20, 0));
                
                // Temporary transform for updates
                this.tmpTransform = new this.ammo.btTransform();
                
                this.initialized = true;
                this.game.playerManager.physicsManager = this;
                console.log('Ammo.js initialized successfully');
                
                // If terrain already exists when physics is initialized, create its collision shape
                if (this.game.terrainRenderer && this.game.terrainRenderer.geometry) {
                    this.createTerrainCollision();
                }
                
                resolve(true);
            }).catch(error => {
                console.error('Failed to initialize Ammo.js:', error);
                resolve(false);
            });
        });
    }

    applyTorque(body, torque) {
        if (!this.initialized || !body) return;
        
        const btTorque = new this.ammo.btVector3(torque.x, torque.y, torque.z);
        body.applyTorque(btTorque);
        
        // Clean up Ammo.js temporary objects
       // this.ammo.destroy(btTorque);
      }

      createTerrainCollision() {
        if (!this.initialized) {
            console.warn('Physics not initialized yet. Cannot create terrain collision.');
            return;
        }
    
        // Clean up previous terrain body if it exists
        if (this.terrainBody) {
            this.physicsWorld.removeRigidBody(this.terrainBody);
            this.ammo.destroy(this.terrainBody);
            this.terrainBody = null;
        }
    
        // Get terrain data
        const terrainData = this.game.terrainRenderer.heightData;
        if (!terrainData) {
            console.warn('No terrain height data found');
            return;
        }
    
        const terrainWidth = this.game.terrainRenderer.terrainWidth;
        const terrainDepth = this.game.terrainRenderer.terrainDepth;
        const segments = this.game.terrainRenderer.terrainSegments;
        
        try {
            // Create heightfield terrain shape
            // Parameters: width segments, depth segments, height data array, height scale, 
            // min height, max height, up axis (1 = Y), heightfield data type, flip quad edges
            
            // Get actual min and max height values for better precision
            let minHeight = -200;
            let maxHeight = 500;
            
            for (let i = 0; i < terrainData.length; i++) {
                minHeight = Math.min(minHeight, terrainData[i]);
                maxHeight = Math.max(maxHeight, terrainData[i]);
            }
            
            // Create a temporary Ammo heap array to pass the height data
            // Float32Array needs to be converted to Ammo's internal format
            const ammoHeightData = this.ammo._malloc(terrainData.length * 4); // 4 bytes per float
            let heightDataArray = new Float32Array(this.ammo.HEAPF32.buffer, ammoHeightData, terrainData.length);
            
            // Copy height data to Ammo heap
            heightDataArray.set(terrainData);
            
            // btHeightfieldTerrainShape parameters
            const heightScale = 1;  
            const upAxis = 1;      // Y is up (0=X, 1=Y, 2=Z)
            const hdt = "PHY_FLOAT"; // Height data type (float)
            const flipQuadEdges = false;
            
            // Create the actual heightfield shape
            const heightFieldShape = new this.ammo.btHeightfieldTerrainShape(
                segments + 1,      // heightStickWidth
                segments + 1,      // heightStickLength
                ammoHeightData,    // heightData pointer
                heightScale,       // height scale
                minHeight,         // min height
                maxHeight,         // max height
                upAxis,            // up axis
                hdt,               // height data type
                flipQuadEdges      // flip quad edges
            );
            
            // Set the scale to match our desired terrain size
            const scaleX = terrainWidth / segments;
            const scaleZ = terrainDepth / segments;
            
            const scale = new this.ammo.btVector3(scaleX, 1, scaleZ);
            heightFieldShape.setLocalScaling(scale);
            
            // By default, the heightfield's origin is at its center, with its minimum height at y=0
            // Adjust this to properly position the terrain in the world
            const verticalOffset = (maxHeight + minHeight) / 2;
            
            // Create rigid body for terrain
            const transform = new this.ammo.btTransform();
            transform.setIdentity();
            
            // Position the terrain - center it in XZ and adjust for Y
            transform.setOrigin(new this.ammo.btVector3(0, verticalOffset, 0));
            
            const motionState = new this.ammo.btDefaultMotionState(transform);
            const localInertia = new this.ammo.btVector3(0, 0, 0);
            
            const rbInfo = new this.ammo.btRigidBodyConstructionInfo(0, motionState, heightFieldShape, localInertia);
            this.terrainBody = new this.ammo.btRigidBody(rbInfo);
            this.terrainBody.setFriction(0.8);
            this.terrainBody.setRestitution(0.2);
            
            // Add the terrain body to the physics world with the STATIC flag
            this.physicsWorld.addRigidBody(this.terrainBody, 1, -1);
            
            // Store references to clean up later
            this.ammoHeightData = ammoHeightData;
            this.terrainShape = heightFieldShape;
            
            console.log('Terrain collision created successfully');
        } catch (error) {
            console.error('Error creating terrain collision:', error);
        }
    }
    
    // Make sure to add this cleanup method to your class
    cleanupTerrainPhysics() {
        if (this.terrainBody) {
            this.physicsWorld.removeRigidBody(this.terrainBody);
            
            // Clean up Ammo.js objects to prevent memory leaks
            this.ammo.destroy(this.terrainBody);
            this.ammo.destroy(this.terrainShape);
            
            // Free the allocated memory for the height data
            if (this.ammoHeightData) {
                this.ammo._free(this.ammoHeightData);
                this.ammoHeightData = null;
            }
            
            this.terrainBody = null;
            this.terrainShape = null;
        }
    }
    
    createRigidBody(mesh, mass, shape, options = {}) {
        if (!this.initialized) {
            console.warn('Physics not initialized. Cannot create rigid body.');
            return null;
        }

        const position = mesh.position;
        const quaternion = mesh.quaternion;
        
        // Create transform
        const transform = new this.ammo.btTransform();
        transform.setIdentity();
        transform.setOrigin(new this.ammo.btVector3(position.x, position.y, position.z));
        transform.setRotation(new this.ammo.btQuaternion(quaternion.x, quaternion.y, quaternion.z, quaternion.w));
        
        // Create motion state
        const motionState = new this.ammo.btDefaultMotionState(transform);
        
        // Calculate local inertia
        const localInertia = new this.ammo.btVector3(0, 0, 0);
        if (mass > 0) {
            shape.calculateLocalInertia(mass, localInertia);
        }
        
        // Create rigid body
        const rbInfo = new this.ammo.btRigidBodyConstructionInfo(mass, motionState, shape, localInertia);
        const body = new this.ammo.btRigidBody(rbInfo);
        
        // Apply options
        if (options.friction !== undefined) body.setFriction(options.friction);
        if (options.restitution !== undefined) body.setRestitution(options.restitution);
        if (options.linearDamping !== undefined && options.angularDamping !== undefined) {
            body.setDamping(options.linearDamping, options.angularDamping);
        }
        
        // Add to world
        this.physicsWorld.addRigidBody(body);
        
        // Store reference to the mesh
        body.threeObject = mesh;
        
        // If dynamic (mass > 0), add to update list
        if (mass > 0) {
            this.dynamicObjects.push({ mesh, body });
        }
        
        return body;
    }

    createSphereBody(mesh, mass, radius, options = {}) {
        const shape = new this.ammo.btSphereShape(radius);
        return this.createRigidBody(mesh, mass, shape, options);
    }

    createBoxBody(mesh, mass, dimensions, options = {}) {
        const shape = new this.ammo.btBoxShape(
            new this.ammo.btVector3(dimensions.x / 2, dimensions.y / 2, dimensions.z / 2)
        );
        return this.createRigidBody(mesh, mass, shape, options);
    }

    createCylinderBody(mesh, mass, dimensions, options = {}) {
        const shape = new this.ammo.btCylinderShape(
            new this.ammo.btVector3(dimensions.x / 2, dimensions.y / 2, dimensions.z / 2)
        );
        return this.createRigidBody(mesh, mass, shape, options);
    }

    removeRigidBody(body) {
        if (!this.initialized || !body) return;
        
        // Remove from physics world
        this.physicsWorld.removeRigidBody(body);
        
        // Remove from dynamic objects list
        const index = this.dynamicObjects.findIndex(obj => obj.body === body);
        if (index !== -1) {
            this.dynamicObjects.splice(index, 1);
        }
        
        // Clean up Ammo.js resources
        this.ammo.destroy(body);
    }

    applyForce(body, force, localPoint = null) {
        if (!this.initialized || !body) return;
        
        const btForce = new this.ammo.btVector3(force.x, force.y, force.z);
        
        if (localPoint) {
            const btPoint = new this.ammo.btVector3(localPoint.x, localPoint.y, localPoint.z);
            body.applyForce(btForce, btPoint);
        } else {
            body.applyCentralForce(btForce);
        }
    }

    applyImpulse(body, impulse, localPoint = null) {
        if (!this.initialized || !body) return;
        
        const btImpulse = new this.ammo.btVector3(impulse.x, impulse.y, impulse.z);
        
        if (localPoint) {
            const btPoint = new this.ammo.btVector3(localPoint.x, localPoint.y, localPoint.z);
            body.applyImpulse(btImpulse, btPoint);
        } else {
            body.applyCentralImpulse(btImpulse);
        }
    }

    update(deltaTime) {
        if (!this.initialized) return;
        // Step the physics simulation
        this.physicsWorld.stepSimulation(deltaTime, 10);
        
        // Update all dynamic objects
        for (let i = 0, il = this.dynamicObjects.length; i < il; i++) {
            const { mesh, body } = this.dynamicObjects[i];
            
            // Get the updated transform
            const motionState = body.getMotionState();
            if (motionState) {
                motionState.getWorldTransform(this.tmpTransform);
                
                // Update the mesh position and rotation
                const position = this.tmpTransform.getOrigin();
                const rotation = this.tmpTransform.getRotation();
                
                mesh.position.set(position.x(), position.y(), position.z());
                mesh.quaternion.set(rotation.x(), rotation.y(), rotation.z(), rotation.w());
            }
        }
    }

    raycast(from, to) {
        if (!this.initialized) return null;
        
        const rayFrom = new this.ammo.btVector3(from.x, from.y, from.z);
        const rayTo = new this.ammo.btVector3(to.x, to.y, to.z);
        
        const rayCallback = new this.ammo.ClosestRayResultCallback(rayFrom, rayTo);
        this.physicsWorld.rayTest(rayFrom, rayTo, rayCallback);
        
        if (rayCallback.hasHit()) {
            const hitPoint = rayCallback.get_m_hitPointWorld();
            const hitNormal = rayCallback.get_m_hitNormalWorld();
            const hitBody = Ammo.castObject(rayCallback.get_m_collisionObject(), this.ammo.btRigidBody);
            
            const result = {
                point: new THREE.Vector3(hitPoint.x(), hitPoint.y(), hitPoint.z()),
                normal: new THREE.Vector3(hitNormal.x(), hitNormal.y(), hitNormal.z()),
                body: hitBody,
                distance: from.distanceTo(new THREE.Vector3(hitPoint.x(), hitPoint.y(), hitPoint.z()))
            };
            
            // Clean up
            this.ammo.destroy(rayCallback);
            
            return result;
        }
        
        // Clean up
        this.ammo.destroy(rayCallback);
        
        return null;
    }

    dispose() {
        if (!this.initialized) return;
        
        // Clean up all rigid bodies
        this.dynamicObjects.forEach(obj => {
            this.physicsWorld.removeRigidBody(obj.body);
            this.ammo.destroy(obj.body);
        });
        
        if (this.terrainBody) {
            this.physicsWorld.removeRigidBody(this.terrainBody);
            this.ammo.destroy(this.terrainBody);
        }
        
        // Clean up physics world
        this.ammo.destroy(this.physicsWorld);
        this.ammo.destroy(this.solver);
        this.ammo.destroy(this.broadphase);
        this.ammo.destroy(this.dispatcher);
        this.ammo.destroy(this.collisionConfiguration);
        
        this.initialized = false;
    }
}