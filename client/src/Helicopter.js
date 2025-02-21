import * as THREE from 'three';

export class Helicopter {
    constructor(scene, loader, terrainRenderer) {
        this.scene = scene;
        this.loader = loader;
        this.terrainRenderer = terrainRenderer;
        this.bodyPath = './models/helicopter_body.glb';
        this.bladesPath = '/models/helicopter_blades.glb';
        
        // Main properties
        this.body = null;
        this.blades = null;
        this.group = new THREE.Group();
        
        // Movement properties
        this.forward = new THREE.Vector3(0, 0, 1);
        this.targetPosition = new THREE.Vector3();
        this.maxTurnRate = Math.PI * 0.5;
        this.currentTurnRate = 0;
        this.turnAcceleration = Math.PI * 0.2;
        this.maxBankAngle = Math.PI * 0.25;
        this.currentBankAngle = 0;
        this.bankingSmoothness = 0.05;
        
        // Speed properties
        this.maxSpeed = 100;
        this.currentSpeed = 0;
        this.acceleration = 10;
        this.deceleration = 15;
        this.rotationSpeed = 15;
        this.arrivalThreshold = 5;
        
        // Terrain avoidance properties
        this.targetHeight = 200;
        this.heightLerpSpeed = 0.5;
        this.minHeightAboveTerrain = 100;
        this.forwardCheckDistance = 100;
        this.heightCheckAngles = [0, Math.PI/6, Math.PI/3]; // 0°, 30°, 60° from horizontal
        this.speedReductionFactor = 0.7; // How much to reduce speed when terrain is detected
        
        // Autonomous movement properties
        this.lastWaypointUpdate = 0;
        this.waypointInterval = 10000;
        this.autonomous = true;
        
        this.init();
    }
    
    async init() {
        try {
            const [bodyModel, bladesModel] = await Promise.all([
                this.loadModel(this.bodyPath),
                this.loadModel(this.bladesPath)
            ]);
            
            this.body = bodyModel.scene;
            this.blades = bladesModel.scene;

            this.body.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                    if (child.material) {
                        child.material.metalness = 0.3;
                        child.material.roughness = 0.4;
                    }
                }
            });
            
            this.blades.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                    if (child.material) {
                        child.material.metalness = 0.3;
                        child.material.roughness = 0.4;
                    }
                }
            });            
            this.group.add(this.body);
            this.group.add(this.blades);
            this.scene.add(this.group);
            
            this.group.position.set(0, 200, 0);
            this.setScale(5);
        } catch (error) {
            console.error('Error loading helicopter models:', error);
        }
    }

    checkTerrainHeight() {
        const position = this.group.position;
        const rotation = this.group.rotation;
        const forward = new THREE.Vector3(0, 0, 1).applyEuler(rotation);
        const heightChecks = [];

        // Check terrain height at multiple angles
        for (const angle of this.heightCheckAngles) {
            const checkVector = forward.clone()
                .applyAxisAngle(new THREE.Vector3(1, 0, 0), -angle)
                .normalize()
                .multiplyScalar(this.forwardCheckDistance);
            
            const checkPoint = position.clone().add(checkVector);
            const terrainHeight = this.terrainRenderer.getHeightAtPosition(
                checkPoint.x,
                checkPoint.z
            );
            
            heightChecks.push(terrainHeight);
        }

        // Calculate target height based on terrain checks
        const maxTerrainHeight = Math.max(...heightChecks);
        const newTargetHeight = maxTerrainHeight + this.minHeightAboveTerrain;
        
        // Adjust speed if terrain is rising rapidly
        if (newTargetHeight > this.targetHeight) {
            const heightDifference = newTargetHeight - this.targetHeight;
            const speedReduction = Math.min(
                1.0,
                heightDifference / this.minHeightAboveTerrain
            ) * this.speedReductionFactor;
            
            this.currentSpeed *= (1 - speedReduction);
        }

        this.targetHeight = newTargetHeight;
    }
    
    loadModel(path) {
        return new Promise((resolve, reject) => {
            this.loader.load(
                path,
                (gltf) => resolve(gltf),
                undefined,
                (error) => reject(error)
            );
        });
    }
        
    updateWaypoint(x, y, z) {
        this.autonomous = false;
        this.targetPosition.set(x, y, z);
        this.lastWaypointUpdate = Date.now();
    }

    generateRandomWaypoint() {
        const x = (Math.random() * 1500) - 750;
        const y = Math.random() * 200 + 200;
        const z = (Math.random() * 1500) - 750;
        return new THREE.Vector3(x, y, z);
    }

    setAutonomous(enabled) {
        this.autonomous = enabled;
        if (enabled) {
            this.targetPosition.copy(this.generateRandomWaypoint());
            this.lastWaypointUpdate = Date.now();
        }
    }

    calculateDesiredTurnRate(currentForward, targetDirection) {
        const angle = currentForward.angleTo(targetDirection);
        const cross = new THREE.Vector3();
        cross.crossVectors(currentForward, targetDirection);
        const turnDirection = Math.sign(cross.y);
        return Math.min(this.maxTurnRate, angle) * turnDirection;
    }

    updateRotation(deltaTime, targetDirection) {
        const currentForward = new THREE.Vector3(0, 0, 1).applyEuler(this.group.rotation);
        const desiredTurnRate = this.calculateDesiredTurnRate(currentForward, targetDirection);
        
        if (Math.abs(desiredTurnRate) > 0.01) {
            this.currentTurnRate += Math.sign(desiredTurnRate - this.currentTurnRate) * 
                                  this.turnAcceleration * deltaTime;
        } else {
            this.currentTurnRate *= 0.95;
        }
        
        this.currentTurnRate = THREE.MathUtils.clamp(
            this.currentTurnRate, 
            -this.maxTurnRate, 
            this.maxTurnRate
        );
        
        const targetBankAngle = (this.currentTurnRate / this.maxTurnRate) * this.maxBankAngle;
        this.currentBankAngle += (targetBankAngle - this.currentBankAngle) * 
                                this.bankingSmoothness;
        
        this.group.rotation.y += this.currentTurnRate * deltaTime;
        this.group.rotation.z = -this.currentBankAngle;
    }

    calculateMovementSpeed(deltaTime, distanceToTarget) {
        const shouldDecelerate = distanceToTarget < 
            (this.currentSpeed * this.currentSpeed) / (2 * this.deceleration);

        if (shouldDecelerate) {
            this.currentSpeed = Math.max(0, 
                this.currentSpeed - this.deceleration * deltaTime);
        } else {
            this.currentSpeed = Math.min(this.maxSpeed, 
                this.currentSpeed + this.acceleration * deltaTime);
        }

        return this.currentSpeed;
    }
    
    update(deltaTime) {
        if (!this.body || !this.blades) return;

        const currentTime = Date.now();
        
        if (this.autonomous && 
            (currentTime - this.lastWaypointUpdate > this.waypointInterval)) {
            this.targetPosition.copy(this.generateRandomWaypoint());
            this.lastWaypointUpdate = currentTime;
        }
        
        // Check terrain and update target height
        this.checkTerrainHeight();
        
        // Lerp current height to target height
        const currentHeight = this.group.position.y;
        const newHeight = THREE.MathUtils.lerp(
            currentHeight,
            this.targetHeight,
            this.heightLerpSpeed * deltaTime
        );
        this.group.position.y = newHeight;
        
        const toTarget = new THREE.Vector3()
            .subVectors(this.targetPosition, this.group.position)
            .normalize();
        
        this.updateRotation(deltaTime, toTarget);
        
        const distanceToTarget = this.group.position.distanceTo(this.targetPosition);
        
        if (distanceToTarget > this.arrivalThreshold) {
            const speed = this.calculateMovementSpeed(deltaTime, distanceToTarget);
            
            const movement = new THREE.Vector3(0, 0, speed * deltaTime)
                .applyEuler(this.group.rotation);
            this.group.position.add(movement);
        } else {
            this.currentSpeed = 0;
        }
        
        if (this.blades) {
            this.blades.rotation.y += this.rotationSpeed * deltaTime;
        }
    }
    
    setMaxTurnRate(rate) {
        this.maxTurnRate = Math.max(0, rate);
    }
    
    setTurnAcceleration(acc) {
        this.turnAcceleration = Math.max(0, acc);
    }
    
    setMaxBankAngle(angle) {
        this.maxBankAngle = THREE.MathUtils.clamp(angle, 0, Math.PI * 0.5);
    }
    
    setBankingSmoothness(smoothness) {
        this.bankingSmoothness = THREE.MathUtils.clamp(smoothness, 0.01, 1);
    }
    
    setMaxSpeed(speed) {
        this.maxSpeed = Math.max(0, speed);
    }
    
    setAcceleration(acc) {
        this.acceleration = Math.max(0, acc);
    }
    
    setDeceleration(dec) {
        this.deceleration = Math.max(0, dec);
    }
    
    setRotationSpeed(speed) {
        this.rotationSpeed = speed;
    }
    
    getPosition() {
        return this.group.position;
    }

    setScale(scale) {
        if (!this.group) return;
        this.group.scale.set(scale, scale, scale);
    }
    
    dispose() {
        if (this.body) {
            this.scene.remove(this.body);
            this.body.traverse((child) => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) child.material.dispose();
            });
        }
        
        if (this.blades) {
            this.scene.remove(this.blades);
            this.blades.traverse((child) => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) child.material.dispose();
            });
        }
        
        this.scene.remove(this.group);
    }
}