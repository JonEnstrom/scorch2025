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

        // --------------------
        //   Projectile View
        // --------------------
        this.projectileOffset = new THREE.Vector3(0, 100, 10);
        this.projectileRotationOffset = new THREE.Euler(-Math.PI / 4, Math.PI, 0);
        this.currentProjectile = null;
        this.projectileLerpSpeed = 1.0;
        this.hasReachedApex = false;
        this.apexPosition = null;
        this.initialProjectileHeight = null;

        // We'll track the last position to approximate forward direction
        // in projectile view (since velocity is gone).
        this.lastProjectilePos = new THREE.Vector3();

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
                this.lerpSpeed = 1.0; 
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
    
            // Store the projectile's initial height for apex detection
            if (projectile.mesh) {
                projectile.previousHeight = projectile.mesh.position.y;
            }
    
            // Let's override the camera's pitch so it starts somewhat looking downward.
            // For example, -Math.PI/4 is a 45° downward tilt.
            this.pitch = -Math.PI / 4;
            this.yaw = 0; // You can tweak yaw if you want to face a particular direction
    
            // Keep track of the projectile’s last position for forward vector calculation
            this.lastProjectilePos.copy(
                projectile.mesh ? projectile.mesh.position : new THREE.Vector3()
            );
    
            // Optionally snap the camera to an offset behind the projectile right away
            if (projectile.mesh) {
                this.camera.position
                    .copy(projectile.mesh.position)
                    .add(this.projectileOffset); // e.g. {x:0, y:-50, z:10}
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

        const projMeshPos = this.currentProjectile.mesh.position;
        const currentHeight = projMeshPos.y;

        // Apex detection via height
        if (!this.hasReachedApex) {
            if (this.initialProjectileHeight === null) {
                this.initialProjectileHeight = currentHeight;
            }
            // If current height is below the previous frame's height, 
            // AND above initial height, that means we've passed apex
            if (currentHeight < (this.currentProjectile.previousHeight || currentHeight) &&
                currentHeight > this.initialProjectileHeight) {
                this.hasReachedApex = true;
                // Store camera's position as apex position
                this.apexPosition = this.camera.position.clone();
                // Store projectile position at apex
                this.apexProjectilePosition = projMeshPos.clone();
            }
            // Update previous height
            this.currentProjectile.previousHeight = currentHeight;
        }

        // Approximate forward vector from last position
        const forward = projMeshPos.clone().sub(this.lastProjectilePos).normalize();
        this.lastProjectilePos.copy(projMeshPos);

        if (!this.hasReachedApex) {
            // Before apex: camera follows behind & above
            const up = new THREE.Vector3(0, 1, 0);
            const right = new THREE.Vector3().crossVectors(forward, up).normalize();
            const trueUp = new THREE.Vector3().crossVectors(right, forward.clone().negate()).normalize();
            
            const baseRotationMatrix = new THREE.Matrix4().makeBasis(right, trueUp, forward.clone().negate());
            const offsetMatrix = new THREE.Matrix4().makeRotationFromEuler(this.projectileRotationOffset);
            const rotationMatrix = baseRotationMatrix.multiply(offsetMatrix);
            
            // Position: a bit behind the projectile
            this.targetPosition.copy(projMeshPos)
                .add(new THREE.Vector3(0, this.projectileOffset.y, 0))
                .sub(forward.multiplyScalar(Math.abs(this.projectileOffset.z)));
            
            this.targetRotation.setFromRotationMatrix(rotationMatrix);
            this.targetLookAt.copy(projMeshPos);
        } else {
            // After apex: keep camera where it was at apex, look downward
            if (this.apexPosition) {
                this.targetPosition.copy(this.apexPosition);
            } else {
                // fallback in case apexPosition is missing
                this.targetPosition.copy(this.camera.position);
            }

            // Slowly rotate downward
            const downwardRotation = new THREE.Euler(-Math.PI / 2, 0, 0);
            const currentRotation = new THREE.Euler().setFromQuaternion(this.camera.quaternion);
            
            this.targetRotation.x = THREE.MathUtils.lerp(currentRotation.x, downwardRotation.x, 0.05);
            this.targetRotation.y = THREE.MathUtils.lerp(currentRotation.y, downwardRotation.y, 0.05);
            this.targetRotation.z = THREE.MathUtils.lerp(currentRotation.z, downwardRotation.z, 0.05);

            this.targetLookAt.copy(projMeshPos);
        }
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
        // We no longer try to compute "avgVelocity".
        // Instead, we just center the camera on the average position of all projectiles.

        const activeProjectiles = this.game.projectiles.filter(p => !p.isDestroyed && p.mesh);
        if (activeProjectiles.length === 0) return;

        // Find average position
        const center = new THREE.Vector3();
        for (const proj of activeProjectiles) {
            center.add(proj.mesh.position);
        }
        center.divideScalar(activeProjectiles.length);

        // We'll just place the camera at a fixed offset from this center,
        // using 'yaw' + 'pitch' if you want manual control.
        const r = this.chaseDistance;
        // We'll assume pitch is the user’s pitch or some default
        const pitch = Math.max(this.pitch, Math.PI / 6); // minimum angle
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
