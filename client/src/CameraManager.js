// cameraManager.js with flyAround mode
import * as THREE from 'three';

// SpringArm class remains unchanged
class SpringArm {
    constructor(cameraManager) {
        this.cameraManager = cameraManager;
        this.targetLength = cameraManager.thirdPersonDistance;
        this.currentLength = this.targetLength;
        this.minimumLength = 5; // Minimum arm length of 5 units
        this.smoothingSpeed = 0.2; // How fast the arm adjusts to new lengths
        this.collisionOffset = 1; // Distance to keep from collision points
        this.origin = new THREE.Vector3(); // Where the arm starts (player position)
        this.direction = new THREE.Vector3(); // Direction the arm extends
        this.end = new THREE.Vector3(); // Where the arm ends (camera position)
        this.yThreshold = 100; // Y-threshold for collision detection
        
        // Add flag to control terrain checking
        this.shouldCheckTerrain = false;
        // Store the last valid length after terrain check
        this.lastValidLength = this.targetLength;
    }

    update(origin, direction) {
        this.origin.copy(origin);
        this.direction.copy(direction).normalize();

        // Cast a ray from origin in 'direction' to detect obstacles
        const maxLength = this.targetLength;
        let desiredLength = maxLength;

        // Calculate potential end position at max length
        const potentialEnd = this.origin.clone().add(
            this.direction.clone().multiplyScalar(maxLength)
        );

        // -------------------------
        // 1) Check map boundaries
        // -------------------------
        // Only perform boundary checks if the potential end Y position is below threshold
        if (potentialEnd.y < this.yThreshold) {
            const mapBoundaryX = [
                this.cameraManager.overheadMinX, 
                this.cameraManager.overheadMaxX
            ];
            const mapBoundaryZ = [
                this.cameraManager.overheadMinZ, 
                this.cameraManager.overheadMaxZ
            ];

            // Handle X boundaries
            if (this.direction.x !== 0) {
                if (potentialEnd.x < mapBoundaryX[0]) {
                    const t = (mapBoundaryX[0] - this.origin.x) / this.direction.x;
                    if (t > 0) {
                        desiredLength = Math.min(desiredLength, t - this.collisionOffset);
                    }
                } else if (potentialEnd.x > mapBoundaryX[1]) {
                    const t = (mapBoundaryX[1] - this.origin.x) / this.direction.x;
                    if (t > 0) {
                        desiredLength = Math.min(desiredLength, t - this.collisionOffset);
                    }
                }
            }

            // Handle Z boundaries
            if (this.direction.z !== 0) {
                if (potentialEnd.z < mapBoundaryZ[0]) {
                    const t = (mapBoundaryZ[0] - this.origin.z) / this.direction.z;
                    if (t > 0) {
                        desiredLength = Math.min(desiredLength, t - this.collisionOffset);
                    }
                } else if (potentialEnd.z > mapBoundaryZ[1]) {
                    const t = (mapBoundaryZ[1] - this.origin.z) / this.direction.z;
                    if (t > 0) {
                        desiredLength = Math.min(desiredLength, t - this.collisionOffset);
                    }
                }
            }
        }

        // -----------------------------------
        // 2) Check terrain only when flag is set
        // -----------------------------------
        if (this.shouldCheckTerrain) {
            // We'll sample along the line from 'origin' to 'potentialEnd'.
            // If at any point the line is below the terrain surface, we shorten.
            const steps = 10;
            const stepSize = 1 / steps;
            for (let i = 1; i <= steps; i++) {
                const t = i * stepSize;
                // Get the position along the line at fraction 't'
                const checkPos = this.origin.clone().addScaledVector(this.direction, t * maxLength);

                const terrainHeight = this.cameraManager.terrainRenderer
                    .getHeightAtPosition(checkPos.x, checkPos.z);

                // We'll ensure the camera is at least `minCameraHeight` above terrain
                const minAllowedY = terrainHeight + this.cameraManager.minCameraHeight;
                if (checkPos.y < minAllowedY) {
                    // We found an intersection with the terrain. 
                    // Shorten the arm to just before the terrain (minus collisionOffset).
                    desiredLength = Math.min(desiredLength, t * maxLength - this.collisionOffset);
                    break;
                }
            }
            // Store the valid length from terrain check
            this.lastValidLength = desiredLength;
            // Reset the flag after checking
            this.shouldCheckTerrain = false;
        } else {
            // Use the last valid length from terrain check
            desiredLength = Math.min(desiredLength, this.lastValidLength);
        }

        // Ensure the desiredLength is not less than the minimum length
        desiredLength = Math.max(desiredLength, this.minimumLength);

        // Smoothly adjust current length toward the computed desiredLength
        this.currentLength = THREE.MathUtils.lerp(
            this.currentLength,
            desiredLength,
            this.smoothingSpeed
        );

        // Calculate final end position
        this.end.copy(this.origin).add(
            this.direction.clone().multiplyScalar(this.currentLength)
        );

        return this.end;
    }

    setTargetLength(length) {
        // Ensure the targetLength is not less than the minimum length
        this.targetLength = Math.max(length, this.minimumLength);
        // When target length changes, we should check terrain again
        this.shouldCheckTerrain = true;
    }

    getCurrentLength() {
        return this.currentLength;
    }
    
    // Method to trigger a terrain check
    checkTerrain() {
        this.shouldCheckTerrain = true;
    }
}

export class CameraManager {
    constructor(game, terrainRenderer) {
        this.game = game;
        this.terrainRenderer = terrainRenderer;

        this.camera = new THREE.PerspectiveCamera(
            60, 
            window.innerWidth / window.innerHeight, 
            0.1, 
            10000
        );
        this.camera.position.set(0, 0, 0);
        this.camera.updateProjectionMatrix();

        this.currentView = 'preGame';
        this.target = null;

        this.autoPanActive = false;
        this.autoPanTargetYaw = 0;
        this.autoPanSpeed = 0.05; // Radians per frame

        // --------------------
        //   Pre-Game Settings
        // --------------------
        this.preGameRadius = 70;
        this.preGameRotationSpeed = 0.0005;
        this.preGameAngle = 1;

        // --------------------
        //   Mouse Control
        // --------------------
        this.isMouseControlActive = false;
        this.lastMouseX = 0;
        this.lastMouseY = 0;

        // --------------------
        //   Camera transform
        // --------------------
        this.targetPosition = new THREE.Vector3();
        this.targetRotation = new THREE.Euler(0, 0, 0, 'XYZ');
        this.targetLookAt = new THREE.Vector3();
        this.lerpSpeed = 0.2;
        this.rotationLerpSpeed = 0.03;
        this.currentLookAt = new THREE.Vector3();

        // --------------------
        //   Camera angles
        // --------------------
        this.yaw = 0;
        this.pitch = 0;
        this.minPitch = -Math.PI / 2 + 0.01;
        this.maxPitch = Math.PI / 2 - 0.01;

        // --------------------
        //   Wheel Control
        // --------------------
        this.wheelZoomSensitivity = 0.05;

        // --------------------
        //   Third-person
        // --------------------
        this.thirdPersonDistance = 25;
        this.thirdPersonHeight = 1;
        this.thirdPersonDefaultPitch = 0.3;
        this.thirdPersonDefaultYaw = 0;

        // --------------------
        //     Overhead
        // --------------------
        this.overheadCenter = new THREE.Vector3(0, 0, 0);
        this.overheadZoom = 200;
        this.overheadMinZoom = 50;
        this.overheadMaxZoom = 250;
        this.overheadMinX = -120;
        this.overheadMaxX = 120;
        this.overheadMinZ = -120;
        this.overheadMaxZ = 120;
        this.overheadPanSensitivity = 0.5;
        this.overheadYaw = 0;

        // --------------------
        //      Chase
        // --------------------
        this.chaseDistance = 15;
        this.chaseHeight = 25;

        // --------------------
        //   Projectile View
        // --------------------
        this.projectileOffset = new THREE.Vector3(0, 10, 1);
        this.projectileRotationOffset = new THREE.Euler(-Math.PI / 4, Math.PI, 0);
        this.currentProjectile = null;
        this.projectileLerpSpeed = 0.03;
        this.lastProjectilePos = new THREE.Vector3();

        // --------------------
        //   FlyAround Settings
        // --------------------
        this.flyAroundSpeed = 1.0;
        this.flyAroundLookSpeed = 0.002;
        this.flyAroundVelocity = new THREE.Vector3();
        this.flyAroundMovementVector = new THREE.Vector3();
        this.flyAroundKeysPressed = {
            w: false,
            s: false,
            a: false,
            d: false,
            shift: false,
            space: false
        };
        this.flyAroundEnabled = false;

        // --------------------
        //   Clipping settings
        // --------------------
        this.minCameraHeight = 1;

        this.setupEventListeners();
        this.setupMouseWheelInput();
        this.setupKeyboardInput();

        // Create our new spring arm with terrain collision checks
        this.springArm = new SpringArm(this);
    }

    setupEventListeners() {
        const canvas = this.game?.renderer?.domElement;
        if (!canvas) return;

        // Mouse down handler
        canvas.addEventListener('mousedown', (event) => {
            if (event.button !== 0 && event.button !== 2) return;
            // Only activate if clicking on the canvas, not UI
            if (event.target !== canvas) return;

            this.isMouseControlActive = true;
            this.lastMouseX = event.clientX;
            this.lastMouseY = event.clientY;

            // Lock pointer when in flyAround mode
            if (this.currentView === 'flyAround') {
                canvas.requestPointerLock();
            }
        });

        // Mouse move handler
        document.addEventListener('mousemove', (event) => {
            if (!this.isMouseControlActive) return;
            
            let movementX, movementY;
            
            // Use pointer lock API if available
            if (document.pointerLockElement === canvas && this.currentView === 'flyAround') {
                movementX = event.movementX || 0;
                movementY = event.movementY || 0;
            } else {
                movementX = event.clientX - this.lastMouseX;
                movementY = event.clientY - this.lastMouseY;
                this.lastMouseX = event.clientX;
                this.lastMouseY = event.clientY;
            }
            
            this.handleMouseMovement(movementX, movementY);
        });

        // Mouse up handler
        document.addEventListener('mouseup', (event) => {
            if (event.button !== 0 && event.button !== 2) return;
            this.isMouseControlActive = false;
            
            // Exit pointer lock when releasing mouse
            if (document.pointerLockElement === canvas) {
                document.exitPointerLock();
            }
        });

        // Prevent context menu
        canvas.addEventListener('contextmenu', (event) => {
            event.preventDefault();
        });
        
        // Handle pointer lock change
        document.addEventListener('pointerlockchange', () => {
            if (document.pointerLockElement !== canvas && this.currentView === 'flyAround') {
                this.isMouseControlActive = false;
            }
        });
    }

 // Add these methods to your CameraManager class

setFreeflyMode(mode) {
    this.spectatorMode = mode; // 'auto' or 'freeFly'
    
    if (mode === 'freeFly') {
        // Store current view for potential return
        this._previousView = this.currentView;
        
        // Switch to flyAround mode
        this.setView('flyAround');
        
        // Enable flyAround controls
        this.flyAroundEnabled = true;
        
        console.log('Camera set to free fly spectator mode');
    } else {
        // Auto mode - if we were in flyAround, go back to following current player
        if (this.currentView === 'flyAround') {
            // Get the current tank
            const currentTank = this.game.playerManager.getCurrentPlayer();
            if (currentTank && currentTank.mesh) {
                this.setTarget(currentTank.mesh);
                this.setView('thirdPerson');
                if (typeof currentTank.turretYawCurrent === 'number') {
                    this.yaw = THREE.MathUtils.degToRad(currentTank.turretYawCurrent) + Math.PI;
                }
            }
        }
        
        console.log('Camera set to auto-follow spectator mode');
    }
}

// Get current spectator mode
getSpectatorMode() {
    return this.spectatorMode || 'auto';
}

    setupKeyboardInput() {
        // Keyboard event listeners for flyAround mode
        document.addEventListener('keydown', (event) => {
            if (this.currentView !== 'flyAround') return;
            
            switch (event.key.toLowerCase()) {
                case 'w':
                    this.flyAroundKeysPressed.w = true;
                    break;
                case 's':
                    this.flyAroundKeysPressed.s = true;
                    break;
                case 'a':
                    this.flyAroundKeysPressed.a = true;
                    break;
                case 'd':
                    this.flyAroundKeysPressed.d = true;
                    break;
                case 'shift':
                    this.flyAroundKeysPressed.shift = true;
                    break;
                case ' ':
                    this.flyAroundKeysPressed.space = true;
                    break;
            }
        });

        document.addEventListener('keyup', (event) => {
            if (this.currentView !== 'flyAround') return;
            
            switch (event.key.toLowerCase()) {
                case 'w':
                    this.flyAroundKeysPressed.w = false;
                    break;
                case 's':
                    this.flyAroundKeysPressed.s = false;
                    break;
                case 'a':
                    this.flyAroundKeysPressed.a = false;
                    break;
                case 'd':
                    this.flyAroundKeysPressed.d = false;
                    break;
                case 'shift':
                    this.flyAroundKeysPressed.shift = false;
                    break;
                case ' ':
                    this.flyAroundKeysPressed.space = false;
                    break;
            }
        });
    }

    handleMouseMovement(movementX, movementY) {
        if (this.currentView === 'overhead') {
            // Pan in overhead view
            this.overheadCenter.x -= movementX * this.overheadPanSensitivity;
            this.overheadCenter.z -= movementY * this.overheadPanSensitivity;

            // Clamp overhead center
            this.overheadCenter.x = THREE.MathUtils.clamp(
                this.overheadCenter.x, 
                this.overheadMinX, 
                this.overheadMaxX
            );
            this.overheadCenter.z = THREE.MathUtils.clamp(
                this.overheadCenter.z, 
                this.overheadMinZ, 
                this.overheadMaxZ
            );
            return;
        }

        // Different sensitivity for flyAround mode
        const sensitivity = this.currentView === 'flyAround' 
            ? this.flyAroundLookSpeed 
            : 0.002;
            
        this.yaw -= movementX * sensitivity;
        this.pitch += movementY * sensitivity;
        this.pitch = Math.max(this.minPitch, Math.min(this.maxPitch, this.pitch));
        
        // In flyAround mode, directly set the camera rotation
        if (this.currentView === 'flyAround') {
            // Use 'YXZ' to ensure yaw is applied first, then pitch
            this.targetRotation.set(-this.pitch, this.yaw, 0, 'YXZ');
            this.camera.quaternion.setFromEuler(this.targetRotation);
        }
    }

    setupMouseWheelInput() {
        const canvas = this.game?.renderer?.domElement;
        if (!canvas) return;

        canvas.addEventListener('wheel', (event) => {
            const delta = event.deltaY * this.wheelZoomSensitivity;
            const minDistance = 10;
            const maxDistance = 200;

            if (this.currentView === 'overhead') {
                this.overheadZoom += delta;
                this.overheadZoom = THREE.MathUtils.clamp(
                    this.overheadZoom, 
                    this.overheadMinZoom, 
                    this.overheadMaxZoom
                );
            } else if (this.currentView === 'thirdPerson') {
                this.thirdPersonDistance = THREE.MathUtils.clamp(
                    this.thirdPersonDistance + delta,
                    minDistance,
                    maxDistance
                );
                // Update spring arm target length
                this.springArm.setTargetLength(this.thirdPersonDistance);
            } else if (this.currentView === 'preGame') {
                this.preGameRadius = THREE.MathUtils.clamp(
                    this.preGameRadius + delta,
                    minDistance,
                    maxDistance
                );
            } else if (this.currentView === 'flyAround') {
                // Adjust fly speed with mouse wheel
                this.flyAroundSpeed = THREE.MathUtils.clamp(
                    this.flyAroundSpeed + delta * 0.01,
                    0.1,
                    5.0
                );
            }
        });
    }

    setTarget(target) {
        this.target = target;
    }

    setView(viewType) {
        if (this.currentView === viewType) return;
    
        this.currentView = viewType;
    
        switch (viewType) {
            case 'preGame':
                this.camera.fov = 75;
                this.game.doNormalView();
                this.camera.updateProjectionMatrix();
                this.lerpSpeed = 0.1;
                break;
    
            case 'overhead':
                this.camera.fov = 75;
                this.lerpSpeed = 0.01;
                this.game.doDroneView();
                this.camera.updateProjectionMatrix();
                this.overheadCenter.set(0, 2000, 0);
                // Snap overheadYaw to multiples of 90 degrees
                this.overheadYaw = Math.round(
                    this.overheadYaw / (Math.PI / 2)
                ) * (Math.PI / 2);
                this.targetPosition.set(
                    this.overheadCenter.x,
                    this.overheadCenter.y,
                    this.overheadCenter.z
                );
                this.targetRotation.set(-Math.PI / 2, 0, 0);
                break;
    
            case 'thirdPerson':
                this.camera.fov = 75;
                this.game.doNormalView();
                this.camera.updateProjectionMatrix();
                this.lerpSpeed = 0.2;
                this.pitch = this.thirdPersonDefaultPitch;
                
                // Trigger a terrain check when entering third-person view
                if (this.springArm) {
                    this.springArm.checkTerrain();
                }
                break;
    
            case 'chase':
                this.camera.fov = 75;
                this.game.doNormalView();
                this.camera.updateProjectionMatrix();
                this.lerpSpeed = 0.06;
                this.rotationLerpSpeed = 0.05;
                break;
    
            case 'projectile':
                this.camera.fov = 60;
                this.game.doNormalView();
                this.camera.updateProjectionMatrix();
                this.lerpSpeed = 0.1; 
                this.rotationLerpSpeed = 0.01;
                break;
                
            case 'flyAround':
                this.camera.fov = 75; // Wider FOV for better flying experience
                this.game.doNormalView();
                this.camera.updateProjectionMatrix();
                this.lerpSpeed = 1.0; // Instant camera movement
                this.rotationLerpSpeed = 1.0; // Instant rotation
                
                // Initialize fly position
                this.camera.position.set(-100, 100, 100);
                
                // Reset velocity
                this.flyAroundVelocity.set(0, 0, 0);
                
                // Set initial look direction
                this.yaw = -0.785;
                this.pitch = 0.5;
                this.targetRotation.set(-this.pitch, this.yaw, 0, 'YXZ');
                this.camera.quaternion.setFromEuler(this.targetRotation);
                    
                // Enable flyAround controls
                this.flyAroundEnabled = true;
                break;
        }
    }

    setProjectileTarget(projectile) {
        this.currentProjectile = projectile;
        if (this.currentView === 'projectile') {
            this.hasReachedApex = false;
            this.apexPosition = null;
            this.apexProjectilePosition = null;

            // Store the projectile's initial height for apex detection
            if (projectile.mesh) {
                projectile.previousHeight = projectile.mesh.position.y;
            }

            // We'll track the projectile's last position for forward vector calculation
            this.lastProjectilePos.copy(
                projectile.mesh ? projectile.mesh.position : new THREE.Vector3()
            );

            // Optionally snap the camera to an offset behind the projectile right away
            if (projectile.mesh) {
                this.camera.position
                    .copy(projectile.mesh.position)
                    .add(this.projectileOffset);
                this.camera.lookAt(projectile.mesh.position);
            }
        }
    }

    update() {
        switch (this.currentView) {
            case 'preGame':
                this.updatePreGameView();
                break;
            case 'thirdPerson':
                this.updateThirdPersonView();
                break;
            case 'overhead':
                this.updateOverheadView();
                break;
            case 'chase':
                this.updateChaseView();
                break;
            case 'projectile':
                this.updateProjectileView();
                break;
            case 'flyAround':
                this.updateFlyAroundView();
                break;
        }

        // Only check for clipping when not in flyAround mode
        if (this.currentView !== 'flyAround') {
            this.preventClipping();
        }

        // Skip lerping in flyAround mode for direct control
        if (this.currentView !== 'flyAround') {
            // Lerp camera position
            this.camera.position.lerp(this.targetPosition, this.lerpSpeed);

            // Lerp camera rotation (Euler)
            const currentEuler = new THREE.Euler().setFromQuaternion(this.camera.quaternion);
            currentEuler.x = THREE.MathUtils.lerp(
                currentEuler.x, 
                this.targetRotation.x, 
                this.rotationLerpSpeed
            );
            currentEuler.y = THREE.MathUtils.lerp(
                currentEuler.y, 
                this.targetRotation.y, 
                this.rotationLerpSpeed
            );
            currentEuler.z = THREE.MathUtils.lerp(
                currentEuler.z, 
                this.targetRotation.z, 
                this.rotationLerpSpeed
            );
            this.camera.quaternion.setFromEuler(currentEuler);
        }

        // LookAt logic
        if (this.currentView === 'preGame' || this.currentView === 'thirdPerson') {
            this.camera.lookAt(this.targetLookAt);
        } else if (this.currentView === 'chase') {
            this.currentLookAt.lerp(this.targetLookAt, this.rotationLerpSpeed);
            this.camera.lookAt(this.currentLookAt);
        }
    }

    updateFlyAroundView() {
        const speedModifier = this.flyAroundKeysPressed.shift ? 2.0 : 1.0;
        const moveSpeed = this.flyAroundSpeed * speedModifier;
        
        // Reset movement vector
        this.flyAroundMovementVector.set(0, 0, 0);
        
        // Calculate forward direction from camera's orientation
        const forwardVector = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
        const rightVector = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
        
        // Apply movement based on keys pressed
        if (this.flyAroundKeysPressed.w) {
            this.flyAroundMovementVector.add(forwardVector);
        }
        if (this.flyAroundKeysPressed.s) {
            this.flyAroundMovementVector.sub(forwardVector);
        }
        if (this.flyAroundKeysPressed.a) {
            this.flyAroundMovementVector.sub(rightVector);
        }
        if (this.flyAroundKeysPressed.d) {
            this.flyAroundMovementVector.add(rightVector);
        }
        if (this.flyAroundKeysPressed.space) {
            this.flyAroundMovementVector.y += 1;
        }
        if (this.flyAroundKeysPressed.shift && this.flyAroundKeysPressed.space) {
            // If both shift and space are pressed, don't move down
            this.flyAroundMovementVector.y = 1;
        } else if (this.flyAroundKeysPressed.shift) {
            this.flyAroundMovementVector.y -= 1;
        }
        
        // Normalize if not zero
        if (this.flyAroundMovementVector.lengthSq() > 0) {
            this.flyAroundMovementVector.normalize();
            
            // Apply speed
            this.flyAroundMovementVector.multiplyScalar(moveSpeed);
            
            // Update velocity with some smoothing
            this.flyAroundVelocity.lerp(this.flyAroundMovementVector, 0.2);
        } else {
            // Slow down when no keys are pressed
            this.flyAroundVelocity.multiplyScalar(0.9);
        }
        
        // Apply velocity to camera position
        this.camera.position.add(this.flyAroundVelocity);
        
        // Optional: Respect map boundaries
        const mapBoundaryX = [this.overheadMinX, this.overheadMaxX];
        const mapBoundaryZ = [this.overheadMinZ, this.overheadMaxZ];
        
        this.camera.position.x = THREE.MathUtils.clamp(
            this.camera.position.x,
            mapBoundaryX[0],
            mapBoundaryX[1]
        );
        
        this.camera.position.z = THREE.MathUtils.clamp(
            this.camera.position.z,
            mapBoundaryZ[0],
            mapBoundaryZ[1]
        );
        
        // Optional: Prevent going below terrain
        if (this.terrainRenderer) {
            const terrainHeight = this.terrainRenderer.getHeightAtPosition(
                this.camera.position.x, 
                this.camera.position.z
            );
            
            const minHeight = terrainHeight + this.minCameraHeight;
            if (this.camera.position.y < minHeight) {
                this.camera.position.y = minHeight;
                this.flyAroundVelocity.y = 0;
            }
        }
        
        // Update targetPosition to match current camera position
        this.targetPosition.copy(this.camera.position);
    }

    updateAutoPan() {
        // Example autoPan logic if you need it
        this.yaw += this.autoPanSpeed;
    }

    updatePreGameView() {
        this.preGameAngle += this.preGameRotationSpeed;
        const x = Math.cos(this.preGameAngle) * this.preGameRadius;
        const z = Math.sin(this.preGameAngle) * this.preGameRadius;
        this.targetPosition.set(x, 15, z);
        this.targetLookAt.set(0, 0, 0);
    }

    updateProjectileView() {
        if (!this.currentProjectile || !this.currentProjectile.mesh) return;

        const projMeshPos = this.currentProjectile.mesh.position;

        // Approximate forward vector from last position
        const forward = projMeshPos.clone().sub(this.lastProjectilePos).normalize();
        this.lastProjectilePos.copy(projMeshPos);

        // Define up vector
        const up = new THREE.Vector3(0, 1, 0);

        // Calculate right vector (perpendicular to forward and up)
        const right = new THREE.Vector3().crossVectors(forward, up).normalize();

        // Calculate true up vector (perpendicular to right and forward)
        const trueUp = new THREE.Vector3().crossVectors(right, forward).normalize();

        // Set camera position: above and slightly to the side of the projectile
        const heightOffset = 20; // how high above the projectile
        const sideOffset = 1.5;  // how far to the side
        this.targetPosition.copy(projMeshPos)
            .add(trueUp.clone().multiplyScalar(heightOffset))
            .add(right.clone().multiplyScalar(sideOffset));

        // We'll look slightly ahead of the projectile on the ground:
        const lookAheadDistance = 1.5; 
        const groundLevel = 0;  // Adjust if your terrain is at a different base height
        this.targetLookAt.copy(projMeshPos)
            .add(forward.clone().multiplyScalar(lookAheadDistance));
        this.targetLookAt.y = groundLevel;

        // Update rotation so camera looks at targetLookAt
        this.camera.lookAt(this.targetLookAt);
        this.targetRotation.setFromQuaternion(this.camera.quaternion.clone());
    }

    updateThirdPersonView() {
        if (!this.target) return;

        // Calculate direction from target to desired camera position
        const pitch = this.pitch;
        const yaw = this.yaw;

        // Direction of the spring arm
        const direction = new THREE.Vector3(
            Math.cos(pitch) * Math.sin(yaw),
            Math.sin(pitch),
            Math.cos(pitch) * Math.cos(yaw)
        );

        // Origin of the spring arm (target position + height offset)
        const origin = this.target.position.clone();
        origin.y += this.thirdPersonHeight;

        // Update spring arm and get camera position
        this.targetPosition.copy(this.springArm.update(origin, direction));

        // We'll simply look at the target's position
        this.targetLookAt.copy(this.target.position);
    }

    updateOverheadView() {
        this.targetPosition.set(
            this.overheadCenter.x,
            this.overheadZoom,
            this.overheadCenter.z
        );
    }

    updateChaseView() {
        const activeProjectiles = this.game.projectiles.filter(
            (p) => !p.isDestroyed && p.mesh
        );
        if (activeProjectiles.length === 0) return;

        // Find average position
        const center = new THREE.Vector3();
        for (const proj of activeProjectiles) {
            center.add(proj.mesh.position);
        }
        center.divideScalar(activeProjectiles.length);

        const r = this.chaseDistance;
        // We'll assume pitch is the user's pitch or some default
        const pitch = Math.max(this.pitch, Math.PI / 6); 
        const x = r * Math.cos(pitch) * Math.sin(this.yaw);
        const y = r * Math.sin(pitch) + this.chaseHeight;
        const z = r * Math.cos(pitch) * Math.cos(this.yaw);

        this.targetPosition.copy(center).add(new THREE.Vector3(x, y, z));
        this.targetLookAt.copy(center);
    }

    preventClipping() {
        if (!this.terrainRenderer) return;

        const camPosClone = this.targetPosition.clone();
        const terrainHeight = this.terrainRenderer.getHeightAtPosition(camPosClone.x, camPosClone.z);

        if (camPosClone.y < terrainHeight + this.minCameraHeight) {
            camPosClone.y = terrainHeight + this.minCameraHeight;
            this.targetPosition.y = camPosClone.y;
        }
    }
}