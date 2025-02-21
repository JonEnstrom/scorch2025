// ClientProjectile.js
import * as THREE from 'three';
import { ModelCache } from './ModelCache.js';
import { TrailEffect } from './GpuTrails.js';
import { GPUExplosionEffect } from './GpuExplosion.js';

let TRAILS = true;

class ClientProjectile {
    static modelCache = new ModelCache();

    constructor(projectileData, scene, gpuParticleManager, terrainRenderer) {
        const {
            projectileId,
            playerId,
            startPos,
            direction,
            power,
            weaponId,
            weaponCode,
            projectileStyle,
            projectileScale,
            explosionType,
            explosionSize,
            craterSize,
            isFinalProjectile
        } = projectileData;

        this.projectileId = projectileId;
        this.playerId = playerId;
        this.weaponId = weaponId;
        this.weaponCode = weaponCode;

        this.projectileStyle = projectileStyle;
        this.projectileScale = projectileScale || 1;
        this.explosionType = explosionType || 'normal';
        this.explosionSize = explosionSize || 1;
        this.craterSize = craterSize || 20;
        this.isFinalProjectile = isFinalProjectile || false;

        // Scene references
        this.scene = scene;
        this.gpuParticleManager = gpuParticleManager;
        this.terrainRenderer = terrainRenderer;

        // Start position
        this.position = new THREE.Vector3(startPos.x, startPos.y, startPos.z);

        // **Lerp** variables:
        this.lerpPosition = this.position.clone();  // smoothly-updated position
        this.lerpTarget = this.position.clone();    // target position from server

        // Direction used for orientation
        this.direction = new THREE.Vector3(direction.x, direction.y, direction.z).normalize();

        this.isDestroyed = false;

        // Visual/trail config
        this.configureProjectile();
        this.setupVisuals();
    }

    setOrientation(direction) {
        // direction is either a plain { x, y, z } object or a THREE.Vector3
        const forward = new THREE.Vector3(direction.x, direction.y, direction.z).normalize();
        const up = new THREE.Vector3(0, 1, 0);

        // Create a rotation matrix that makes the -Z axis point toward `forward`.
        const matrix = new THREE.Matrix4();
        matrix.lookAt(
          new THREE.Vector3(0, 0, 0),  // eye
          forward,                     // target
          up
        );
      
        const q = new THREE.Quaternion().setFromRotationMatrix(matrix);
      
        if (this.mesh) this.mesh.quaternion.copy(q);
        if (this.tempMesh) this.tempMesh.quaternion.copy(q);
    }

    configureProjectile() {
        const styles = {
            missile: {
                tempMeshColor: 0x00aa00,
                meshColor: 0x00aa00,
                trailConfig: {
                    trailType: 'basic',
                    trailSize: this.projectileScale,
                    emitRate: 50
                },
                rotation: {
                    type: 'velocity', // 'velocity' or 'constant'
                    rotationAxis: null,
                    rotationSpeed: 0
                }
            },
            bomblet: {
                tempMeshColor: 0xff4400,
                meshColor: 0xaa4444,
                trailConfig: {
                    trailType: 'basic',
                    trailSize: 1,
                    emitRate: 50
                },
                rotation: {
                    type: 'constant',
                    rotationAxis: new THREE.Vector3(1, 1, 0).normalize(),
                    rotationSpeed: 1800
                }
            },
            default: {
                tempMeshColor: 0xff0000,
                meshColor: 0xff0000,
                trailConfig: {
                    trailType: 'basic',
                    trailSize: 1,
                    emitRate: 30
                },
                rotation: {
                    type: 'velocity',
                    rotationAxis: null,
                    rotationSpeed: 0
                }
            }
        };

        const config = styles[this.projectileStyle] || styles.default;
        this.tempMeshColor = config.tempMeshColor;
        this.meshColor = config.meshColor;
        this.trailConfig = {
            ...config.trailConfig,
            position: this.position,  // initial position
            trailId: `${this.projectileId}trail`
        };
        this.rotationConfig = config.rotation;
    }

    async setupVisuals() {
        // Temporary sphere
        this.tempMesh = this.createTempMesh();
        this.tempMesh.position.copy(this.position);
        this.scene.add(this.tempMesh);

        // Load 3D model (optional)
        await this.loadProjectileModel();

        // Trails
        if (TRAILS) {
            this.trailEffect = new TrailEffect(this.gpuParticleManager);
            this.trailEffect.createTrail(this.trailConfig);
        }
    }

    createTempMesh() {
        const geometry = new THREE.SphereGeometry(1.5 * this.projectileScale, 16, 16);
        const material = new THREE.MeshStandardMaterial({
            color: this.tempMeshColor,
            metalness: 0.7,
            roughness: 0.3,
            emissive: this.tempMeshColor,
            emissiveIntensity: 0.5
        });
        return new THREE.Mesh(geometry, material);
    }

    async loadProjectileModel() {
        try {
            const modelPath = `./models/${this.projectileStyle}.glb`;
            const loadedModel = await ClientProjectile.modelCache.getModel(modelPath);
            this.mesh = loadedModel.clone();
            this.mesh.scale.setScalar(this.projectileScale);
            this.mesh.position.copy(this.position);

            this.mesh.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                    child.material = new THREE.MeshStandardMaterial({
                        color: this.meshColor,
                        metalness: 0.7,
                        roughness: 0.3
                    });
                }
            });

            this.scene.add(this.mesh);
            if (this.tempMesh) {
                this.scene.remove(this.tempMesh);
                this.tempMesh.geometry.dispose();
                this.tempMesh.material.dispose();
                this.tempMesh = null;
            }
        } catch (error) {
            console.error('Error loading projectile model:', error);
        }
    }

    /**
     * Called by ProjectileTimelineManager or by the client
     * to update the "target" position from the server.
     */
    setExactPosition(newPos) {
        // Instead of snapping, we store it as our 'lerpTarget'
        this.lerpTarget.set(newPos.x, newPos.y, newPos.z);
    }

    /**
     * Smoother interpolation in updateVisual.
     */
    updateVisual(deltaTime) {
        if (this.isDestroyed) return;

        // Lerp from current 'lerpPosition' to 'lerpTarget'
        // e.g. factor = 10 * deltaTime means we try to "reach" the target in ~0.1s
        const lerpFactor = 10 * deltaTime;
        this.lerpPosition.lerp(this.lerpTarget, lerpFactor);

        // Update the actual mesh to the 'lerpPosition'
        const activeMesh = this.mesh || this.tempMesh;
        if (activeMesh) {
            activeMesh.position.copy(this.lerpPosition);

            // If rotation type is 'constant', we spin it
            if (this.rotationConfig.type === 'constant') {
                const rotationAmount = THREE.MathUtils.degToRad(this.rotationConfig.rotationSpeed) * deltaTime;
                activeMesh.rotateOnAxis(this.rotationConfig.rotationAxis, rotationAmount);
            }
            // If rotation type is 'velocity', you might do setOrientation(this.direction)
            // if you have an updated direction from the timeline.
        }

        // For convenience, also keep this.position in sync (if other code references it)
        this.position.copy(this.lerpPosition);

        // Update trails
        if (TRAILS && this.trailEffect) {
            this.trailEffect.updatePosition(this.trailConfig.trailId, this.position);
            this.trailEffect.updateDirection(this.trailConfig.trailId, this.direction);
        }
    }

    triggerExplosion(impactEvent) {
        const explosionEffect = new GPUExplosionEffect(this.gpuParticleManager);
        explosionEffect.createBasicExplosion({
            position: this.position,
            projectileId: this.projectileId, 
            explosionSize: this.explosionSize,
            explosionType: this.explosionType
        });

        // Deform terrain (client-side effect)
        this.terrainRenderer.scorchSystem.applyScorch(this.position, this.explosionSize * 25, 0.2);
        this.terrainRenderer.queueTerrainModification(this.position.x, this.position.z, this.craterSize, 'crater');
        if (this.isFinalProjectile) {
            this.terrainRenderer.updateNormals();
        }
    }

    destroy() {
        if (this.isDestroyed) return;
        this.isDestroyed = true;

        if (this.mesh) {
            this.scene.remove(this.mesh);
            this.mesh.traverse((child) => {
                if (child.isMesh) {
                    if (child.geometry) child.geometry.dispose();
                    if (child.material) {
                        if (Array.isArray(child.material)) {
                            child.material.forEach(mat => mat.dispose());
                        } else {
                            child.material.dispose();
                        }
                    }
                }
            });
            this.mesh = null;
        }

        if (this.tempMesh) {
            this.scene.remove(this.tempMesh);
            this.tempMesh.geometry.dispose();
            this.tempMesh.material.dispose();
            this.tempMesh = null; 
        }

        // Stop trails
        if (TRAILS && this.trailEffect) {
            this.trailEffect.stopTrail(this.trailConfig.trailId);
        }

        this.scene = null;
        this.gpuParticleManager = null;
        this.terrainRenderer = null;
    }
}

export { ClientProjectile };
