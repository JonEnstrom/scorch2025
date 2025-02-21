// cameraManager.js
import * as THREE from 'three';

export class CameraManager {
    constructor(game, terrainRenderer) {
        this.game = game;
        this.terrainRenderer = terrainRenderer;

        this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.camera.position.set(0, 50, 50);
        this.camera.near = 1;
        this.camera.far = 4000;
        this.camera.updateProjectionMatrix();

        this.currentView = 'preGame';
        this.target = null;

        // --------------------
        //   Pre-Game Settings
        // --------------------
        this.preGameRadius = 300;
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
        this.rotationLerpSpeed = 0.1;
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
        this.wheelZoomeSensitivity = 0.8;

        // --------------------
        //   Third-person
        // --------------------
        this.thirdPersonDistance = 450;
        this.thirdPersonHeight = 80;
        this.thirdPersonDefaultPitch = 0.3;
        this.thirdPersonDefaultYaw = 0;

        // --------------------
        //     Overhead
        // --------------------
        this.overheadCenter = new THREE.Vector3(0, 0, 0);
        this.overheadZoom = 2000;
        this.overheadMinZoom = 500;
        this.overheadMaxZoom = 2500;
        this.overheadMinX = -1200;
        this.overheadMaxX = 1200;
        this.overheadMinZ = -1200;
        this.overheadMaxZ = 1200;
        this.overheadPanSensitivity = 1.5;
        this.overheadYaw = 0;

        // --------------------
        //      Chase
        // --------------------
        this.chaseDistance = 80;
        this.chaseHeight = 150;
        this.chaseProjectiles = new Map();

        // --------------------
        //   Projectile View
        // --------------------
        this.projectileOffset = new THREE.Vector3(0, 50, 0);
        this.projectileRotationOffset = new THREE.Euler(Math.PI / 4, Math.PI, Math.PI / 2);
        this.currentProjectile = null;
        this.projectileLerpSpeed = 1.0;
        this.hasReachedApex = false;
        this.apexPosition = null;
        this.initialProjectileHeight = null;

        // --------------------
        //   Clipping settings
        // --------------------
        this.minCameraHeight = 10;

        this.setupEventListeners();
        this.setupResizeHandler();
        this.setupMouseWheelInput();
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
        });

        // Mouse move handler
        document.addEventListener('mousemove', (event) => {
            if (!this.isMouseControlActive) return;
            const movementX = event.clientX - this.lastMouseX;
            const movementY = event.clientY - this.lastMouseY;
            this.handleMouseMovement(movementX, movementY);
            this.lastMouseX = event.clientX;
            this.lastMouseY = event.clientY;
        });

        // Mouse up handler
        document.addEventListener('mouseup', (event) => {
            if (event.button !== 0 && event.button !== 2) return;
            this.isMouseControlActive = false;
        });

        // Prevent context menu
        canvas.addEventListener('contextmenu', (event) => {
            event.preventDefault();
        });
    }

    handleMouseMovement(movementX, movementY) {
        if (this.currentView === 'overhead') {
            // Pan in overhead view
            this.overheadCenter.x -= movementX * this.overheadPanSensitivity;
            this.overheadCenter.z -= movementY * this.overheadPanSensitivity;
    
            // Clamp overhead center
            this.overheadCenter.x = THREE.MathUtils.clamp(this.overheadCenter.x, this.overheadMinX, this.overheadMaxX);
            this.overheadCenter.z = THREE.MathUtils.clamp(this.overheadCenter.z, this.overheadMinZ, this.overheadMaxZ);
            return;
        }
    
        const sensitivity = 0.002;
        this.yaw -= movementX * sensitivity;
        this.pitch += movementY * sensitivity;
        this.pitch = Math.max(this.minPitch, Math.min(this.maxPitch, this.pitch));
    }

    setupResizeHandler() {
        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.game.renderer.setSize(window.innerWidth, window.innerHeight);
        });
    }

    setupMouseWheelInput() {
        const canvas = this.game?.renderer?.domElement;
        if (!canvas) return;
    
        canvas.addEventListener('wheel', (event) => {
            const delta = event.deltaY * this.wheelZoomeSensitivity;
            const minDistance = 50;
            const maxDistance = 1000;

            if (this.currentView === 'overhead') {
                this.overheadZoom += delta;
                this.overheadZoom = THREE.MathUtils.clamp(this.overheadZoom, this.overheadMinZoom, this.overheadMaxZoom);
            } else if (this.currentView === 'thirdPerson') {
                this.thirdPersonDistance = THREE.MathUtils.clamp(
                    this.thirdPersonDistance + delta,
                    minDistance,
                    maxDistance
                );
            } else if (this.currentView === 'preGame') {
                this.preGameRadius = THREE.MathUtils.clamp(
                    this.preGameRadius + delta,
                    minDistance,
                    maxDistance
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
                this.camera.fov = 90;
                this.game.doNormalView();
                this.camera.updateProjectionMatrix();
                this.lerpSpeed = 0.1;
                break;

            case 'overhead':
                this.camera.fov = 60;
                this.lerpSpeed = 0.01;
                this.game.doDroneView();
                this.camera.updateProjectionMatrix();
                this.overheadCenter.set(0, 2000, 0);
                // Snap overheadYaw to multiples of 90 degrees
                this.overheadYaw = Math.round(this.overheadYaw / (Math.PI / 2)) * (Math.PI / 2);
                this.targetPosition.set(
                    this.overheadCenter.x,
                    this.overheadCenter.y,
                    this.overheadCenter.z
                );
                this.targetRotation.set(-Math.PI / 2, 0, 0);
                Object.values(this.game.playerManager.players).forEach(tank => tank.bigNameTag());
                break;

            case 'thirdPerson':
                this.camera.fov = 70; 
                this.game.doNormalView();
                this.camera.updateProjectionMatrix();
                this.lerpSpeed = 0.2;
                this.pitch = this.thirdPersonDefaultPitch;
                Object.values(this.game.playerManager.players).forEach(tank => tank.littleNameTag());
                break;

            case 'chase':
                this.camera.fov = 80; 
                this.game.doNormalView();
                this.camera.updateProjectionMatrix();
                this.lerpSpeed = 0.03;
                Object.values(this.game.playerManager.players).forEach(tank => tank.bigNameTag());
                break;

            case 'projectile':
                this.camera.fov = 90; // Wide FOV for more dramatic effect
                this.game.doNormalView();
                this.camera.updateProjectionMatrix();
                this.lerpSpeed = 1.0; // Instant follow
                this.rotationLerpSpeed = 1.0;
                Object.values(this.game.playerManager.players).forEach(tank => tank.bigNameTag());
                break;        
        }
    }

    setProjectileTarget(projectile) {
        this.currentProjectile = projectile;
        if (this.currentView === 'projectile') {
            this.hasReachedApex = false;
            this.apexPosition = null;
            this.apexProjectilePosition = null;
            this.initialProjectileHeight = projectile.mesh ? projectile.mesh.position.y : null;
            
            // Reset camera position to be right behind projectile
            if (projectile.mesh) {
                this.camera.position.copy(projectile.mesh.position).add(this.projectileOffset);
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
        }

        this.preventClipping();

        // Lerp camera position
        this.camera.position.lerp(this.targetPosition, this.lerpSpeed);

        // Lerp camera rotation (Euler)
        const currentEuler = new THREE.Euler().setFromQuaternion(this.camera.quaternion);
        currentEuler.x = THREE.MathUtils.lerp(currentEuler.x, this.targetRotation.x, this.rotationLerpSpeed);
        currentEuler.y = THREE.MathUtils.lerp(currentEuler.y, this.targetRotation.y, this.rotationLerpSpeed);
        currentEuler.z = THREE.MathUtils.lerp(currentEuler.z, this.targetRotation.z, this.rotationLerpSpeed);
        this.camera.quaternion.setFromEuler(currentEuler);

        // LookAt logic
        if (this.currentView === 'preGame' || this.currentView === 'thirdPerson') {
            this.camera.lookAt(this.targetLookAt);
        } else if (this.currentView === 'chase') {
            this.currentLookAt.lerp(this.targetLookAt, this.rotationLerpSpeed);
            this.camera.lookAt(this.currentLookAt);
        }
    }

    updatePreGameView() {
        this.preGameAngle += this.preGameRotationSpeed;
        const x = Math.cos(this.preGameAngle) * this.preGameRadius;
        const z = Math.sin(this.preGameAngle) * this.preGameRadius;
        this.targetPosition.set(x, 150, z);
        this.targetLookAt.set(0, 0, 0);
    }

updateProjectileView() {
    if (!this.currentProjectile || !this.currentProjectile.mesh) return;

    const currentHeight = this.currentProjectile.mesh.position.y;
    
    // Check if we've reached the apex
    if (!this.hasReachedApex) {
        if (this.initialProjectileHeight === null) {
            this.initialProjectileHeight = currentHeight;
        }
        
        // We've reached apex if current height is less than previous height
        // and we're above the initial height (to avoid triggering on launch)
        if (currentHeight < this.currentProjectile.previousHeight && 
            currentHeight > this.initialProjectileHeight) {
            this.hasReachedApex = true;
            // Store the current camera position as our fixed position
            this.apexPosition = this.camera.position.clone();
            // Also store the projectile position at apex for calculating offset
            this.apexProjectilePosition = this.currentProjectile.mesh.position.clone();
        }
        
        // Store current height for next frame comparison
        this.currentProjectile.previousHeight = currentHeight;
    }

    // Get projectile's forward direction
    const forward = this.currentProjectile.velocity.clone().normalize();
    
    if (!this.hasReachedApex) {
        // Before apex: Follow normally
        const up = new THREE.Vector3(0, 1, 0);
        const right = new THREE.Vector3().crossVectors(forward, up).normalize();
        const trueUp = new THREE.Vector3().crossVectors(right, forward).normalize();

        const baseRotationMatrix = new THREE.Matrix4().makeBasis(right, trueUp, forward.multiplyScalar(-1));
        const offsetMatrix = new THREE.Matrix4().makeRotationFromEuler(this.projectileRotationOffset);
        const rotationMatrix = baseRotationMatrix.multiply(offsetMatrix);
        
        this.targetPosition.copy(this.currentProjectile.mesh.position)
            .add(new THREE.Vector3(0, this.projectileOffset.y, 0))
            .sub(forward.multiplyScalar(Math.abs(this.projectileOffset.z)));
            
        this.targetRotation.setFromRotationMatrix(rotationMatrix);
    } else {
        // After apex: Keep camera position fixed where we detached
        this.targetPosition.copy(this.apexPosition);
        
        // Start transitioning rotation towards looking straight down
        const downwardRotation = new THREE.Euler(-Math.PI / 2, 0, 0);
        const currentRotation = new THREE.Euler().setFromQuaternion(this.camera.quaternion);
        
        // Lerp each rotation component
        this.targetRotation.x = THREE.MathUtils.lerp(currentRotation.x, downwardRotation.x, 0.05);
        this.targetRotation.y = THREE.MathUtils.lerp(currentRotation.y, downwardRotation.y, 0.05);
        this.targetRotation.z = THREE.MathUtils.lerp(currentRotation.z, downwardRotation.z, 0.05);
    }
    
    // Update look target
    this.targetLookAt.copy(this.currentProjectile.mesh.position);
}


updateThirdPersonView() {
        if (!this.target) return;
        const r = this.thirdPersonDistance;
        
        let pitch = this.pitch;
        let offset = new THREE.Vector3(
             r * Math.cos(pitch) * Math.sin(this.yaw),
             r * Math.sin(pitch) + this.thirdPersonHeight,
             r * Math.cos(pitch) * Math.cos(this.yaw)
        );
        
        let candidatePos = this.target.position.clone().add(offset);
        const terrainHeight = this.terrainRenderer.getHeightAtPosition(candidatePos.x, candidatePos.z);
        const minAllowedY = terrainHeight + this.minCameraHeight;
        
        if (candidatePos.y < minAllowedY) {
            let requiredSin = (minAllowedY - this.target.position.y - this.thirdPersonHeight) / r;
            requiredSin = THREE.MathUtils.clamp(requiredSin, -1, 1);
            const newPitch = Math.asin(requiredSin);
            
            if (newPitch > pitch) {
                pitch = newPitch;
                offset.set(
                    r * Math.cos(pitch) * Math.sin(this.yaw),
                    r * Math.sin(pitch) + this.thirdPersonHeight,
                    r * Math.cos(pitch) * Math.cos(this.yaw)
                );
            }
        }
        
        this.targetPosition.copy(this.target.position).add(offset);
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
        this.game.projectiles.forEach((proj) => {
            if (!this.chaseProjectiles.has(proj)) {
                this.chaseProjectiles.set(proj, {
                    lastPosition: new THREE.Vector3(),
                    velocity: new THREE.Vector3()
                });
            }
        });

        this.chaseProjectiles.forEach((record, proj) => {
            if (!proj.isDestroyed) {
                if (proj.mesh) {
                    record.lastPosition.copy(proj.mesh.position);
                } else if (proj.tempMesh) {
                    record.lastPosition.copy(proj.tempMesh.position);
                }
                record.velocity.copy(proj.velocity);
            }
        });

        const entries = Array.from(this.chaseProjectiles.values());
        if (entries.length === 0) return;

        const center = new THREE.Vector3();
        const avgVelocity = new THREE.Vector3();

        entries.forEach(({ lastPosition, velocity }) => {
            center.add(lastPosition);
            avgVelocity.add(velocity);
        });

        center.divideScalar(entries.length);
        avgVelocity.divideScalar(entries.length);

        const trajectoryPitch = Math.atan2(
            avgVelocity.y,
            Math.sqrt(avgVelocity.x * avgVelocity.x + avgVelocity.z * avgVelocity.z)
        );
        const minViewingAngle = Math.PI / 6;
        const combinedPitch = Math.max(this.pitch, minViewingAngle);

        const heightOffset = Math.abs(Math.sin(trajectoryPitch)) * this.chaseHeight;
        const adjustedHeight = this.chaseHeight + heightOffset;

        const r = this.chaseDistance;
        const x = r * Math.cos(combinedPitch) * Math.sin(this.yaw);
        const y = r * Math.sin(combinedPitch) + adjustedHeight;
        const z = r * Math.cos(combinedPitch) * Math.cos(this.yaw);

        this.targetPosition.copy(center).add(new THREE.Vector3(x, y, z));
        this.targetLookAt.copy(center);
    }

    clearChaseProjectiles() {
        this.chaseProjectiles.clear();
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