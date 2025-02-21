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

        this.craterSize = craterSize;
        this.isFinalProjectile = isFinalProjectile;
        this.projectileId = projectileId;
        this.playerId = playerId;
        this.isDestroyed = false;
        this.weaponId = weaponId;
        this.weaponCode = weaponCode;
        this.direction = new THREE.Vector3(0,0,0);
        
        // Scene references
        this.scene = scene;
        this.gpuParticleManager = gpuParticleManager;
        this.terrainRenderer = terrainRenderer;
        
        // Position and motion setup
        this.position = new THREE.Vector3(startPos.x, startPos.y, startPos.z);
        
        // Acceleration and velocity parameters
        this.maxSpeed = power * 1.0;  // Maximum speed the projectile can reach
        this.currentSpeed = 0;        // Current speed of the projectile
        this.acceleration = 305;      // Units per second²
        this.velocity = new THREE.Vector3()
            .copy(direction)
            .normalize()
            .multiplyScalar(this.currentSpeed);
        this.moveDirection = new THREE.Vector3()
            .copy(direction)
            .normalize();
        
        this.gravity = -300;

        // Visual properties
        this.projectileStyle = projectileStyle;
        this.projectileScale = projectileScale || 1;
        this.explosionType = explosionType || 'normal';
        this.explosionSize = explosionSize || 1;

        // Configuration based on projectileStyle
        this.configureProjectile();

        // Setup visuals
        if (TRAILS) this.trailEffect = new TrailEffect(gpuParticleManager);
        this.setupVisuals();
    }


    // Configuration for different projectile styles
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
                    rotationSpeed: 0 // degrees per second, only for 'constant'
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
                    rotationSpeed: 1800 // degrees per second
                }
            },
            // Add more styles here as needed
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

        // Assign configuration based on projectileStyle
        const config = styles[this.projectileStyle] || styles.default;
        this.tempMeshColor = config.tempMeshColor;
        this.meshColor = config.meshColor;
        this.trailConfig = {
            ...config.trailConfig,
            position: this.position,
            trailId: `${this.projectileId}trail`
        };
        this.rotationConfig = config.rotation;
    }

    async setupVisuals() {
        this.tempMesh = this.createTempMesh();
        this.tempMesh.position.copy(this.position);
        this.scene.add(this.tempMesh);
        await this.loadProjectileModel();
        if (TRAILS) this.setupTrailEffect();
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

    getTrailConfig() {
        // Return the pre-configured trailConfig
        return this.trailConfig;
    }

    setupTrailEffect() {
        this.trailEffect.createTrail(this.getTrailConfig());

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
                    child.receiveShadow = true;  // Add this
                    child.material = new THREE.MeshStandardMaterial({
                        color: this.meshColor,
                        metalness: 0.7,
                        roughness: 0.3,
                        shadowSide: THREE.FrontSide  // Add this
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

    update(deltaTime) {
        if (this.isDestroyed) return;
        
        // Update speed with acceleration
        if (this.currentSpeed < this.maxSpeed) {
            this.currentSpeed = Math.min(
                this.maxSpeed,
                this.currentSpeed + (this.acceleration * deltaTime)
            );
            
            // Update velocity vector with new speed
            this.velocity.copy(this.moveDirection).multiplyScalar(this.currentSpeed);
        }

        // Base update logic
        this.updatePosition(deltaTime);
        this.updateMesh(deltaTime);
        if (TRAILS) this.updateTrail();

        // Collision check
        if ((this.terrainRenderer.getHeightAtPosition(this.position.x, this.position.z) > this.position.y) ||
            (this.terrainRenderer.currentTheme === 'arctic' && this.position.y < 5)) {
            this.terrainRenderer.scorchSystem.applyScorch(this.position, this.explosionSize * 25, 0.2);
            this.terrainRenderer.queueTerrainModification(this.position.x, this.position.z, this.craterSize, 'crater');

            const explosionEffect = new GPUExplosionEffect(this.gpuParticleManager);
            explosionEffect.createBasicExplosion({
                position: this.position,
                projectileId: this.projectileId, 
                explosionSize: this.explosionSize || 1,
                explosionType: this.explosionType || 'normal'
            });
            if (this.isFinalProjectile) this.terrainRenderer.updateNormals();
            this.destroy();
        }
    }

    updatePosition(deltaTime) {
        // Update velocity due to gravity
        this.velocity.y += this.gravity * deltaTime;
        
        // Update position based on velocity
        this.position.x += this.velocity.x * deltaTime;
        this.position.y += this.velocity.y * deltaTime;
        this.position.z += this.velocity.z * deltaTime;
    }

    updateMesh(deltaTime) {
        const activeMesh = this.mesh || this.tempMesh;
        if (activeMesh) {
            activeMesh.position.copy(this.position);
            this.updateMeshRotation(activeMesh, deltaTime);
        }
    }

    updateMeshRotation(mesh, deltaTime) {
        if (this.rotationConfig.type === 'velocity') {
            if (this.velocity.lengthSq() > 0.001) {
                const targetQuaternion = new THREE.Quaternion();
                const up = new THREE.Vector3(0, 1, 0);
                const matrix = new THREE.Matrix4();
                
                // Get the forward direction from velocity
                const forward = this.velocity.clone().normalize();
                
                matrix.lookAt(
                    new THREE.Vector3(0, 0, 0),
                    forward,
                    up
                );
                
                targetQuaternion.setFromRotationMatrix(matrix);
                mesh.quaternion.copy(targetQuaternion);
                
                // Update direction to match the mesh's forward direction
                this.direction.set(0, 0, 1).applyQuaternion(mesh.quaternion);
            }
        } else if (this.rotationConfig.type === 'constant') {
            const rotationAmount = THREE.MathUtils.degToRad(this.rotationConfig.rotationSpeed) * deltaTime;
            mesh.rotateOnAxis(this.rotationConfig.rotationAxis, rotationAmount);
            
            // For constant rotation, update direction based on mesh rotation
            this.direction.set(0, 0, 1).applyQuaternion(mesh.quaternion);
        }
    }

    updateTrail() {
        this.trailEffect.updatePosition(
            this.trailConfig.trailId,
            this.position
        );
        this.trailEffect.updatePosition(
            this.trailConfig.trailId + 'fire',
            this.position
        );

        this.trailEffect.updateDirection(
            this.trailConfig.trailId,
            this.direction
        );
        this.trailEffect.updateDirection(
            this.trailConfig.trailId + 'fire',
            this.direction
        );
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

        //this.gpuParticleManager.removeEmitter(this.projectileId);
        if (TRAILS) this.trailEffect.stopTrail(this.trailConfig.trailId);

        this.scene = null;
        this.particleManager = null;
        this.gpuParticleManager = null;
    }
}

export { ClientProjectile };
