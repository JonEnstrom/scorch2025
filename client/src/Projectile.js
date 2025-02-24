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

        // Position management
        this.position = new THREE.Vector3(startPos.x, startPos.y, startPos.z);
        this.currentPosition = new THREE.Vector3(startPos.x, startPos.y, startPos.z);
        this.direction = new THREE.Vector3(direction.x, direction.y, direction.z).normalize();

        // New trajectory-based properties
        this.trajectory = [];  // Will be populated with {time, position} points
        this.currentTrajectoryIndex = 0;
        this.impactTime = null;

        // Visual properties
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

        this.isDestroyed = false;

        // Visual/trail config
        this.configureProjectile();
        this.setupVisuals();
    }

    // New method to set the complete trajectory data
    setTrajectory(trajectoryPoints) {
        this.trajectory = trajectoryPoints;
        
        // Check if the last point is an impact point
        const lastPoint = trajectoryPoints[trajectoryPoints.length - 1];
        if (lastPoint.isImpact) {
            this.impactTime = lastPoint.time;
        }
    }

    // Cubic spline interpolation for smooth position
    cubicInterpolate(p0, p1, p2, p3, t) {
        const t2 = t * t;
        const t3 = t2 * t;
        
        // Catmull-Rom coefficients
        const a = -0.5 * p0 + 1.5 * p1 - 1.5 * p2 + 0.5 * p3;
        const b = p0 - 2.5 * p1 + 2 * p2 - 0.5 * p3;
        const c = -0.5 * p0 + 0.5 * p2;
        const d = p1;
        
        return a * t3 + b * t2 + c * t + d;
    }

    // New method to update position based on current simulation time
    updateTrajectoryPosition(currentTime) {
        if (this.trajectory.length < 2) return;
        
        // Handle impact case
        if (this.impactTime !== null && currentTime >= this.impactTime) {
            const impactPoint = this.trajectory.find(point => point.isImpact);
            if (impactPoint) {
                this.currentPosition.copy(impactPoint.position);
                this.position.copy(impactPoint.position);
                return;
            }
        }
        
        // Find the two points around the current time
        let index1 = 0;
        while (index1 < this.trajectory.length - 1 && 
               this.trajectory[index1 + 1].time <= currentTime) {
            index1++;
        }
        
        if (index1 >= this.trajectory.length - 1) {
            // We're at or past the last position
            this.currentPosition.copy(this.trajectory[this.trajectory.length - 1].position);
            this.position.copy(this.currentPosition);
            return;
        }
        
        const index2 = index1 + 1;
        const point1 = this.trajectory[index1];
        const point2 = this.trajectory[index2];
        
        // Calculate normalized t value between the two points
        const timeSpan = point2.time - point1.time;
        const t = timeSpan > 0 ? (currentTime - point1.time) / timeSpan : 0;
        
        // Advanced interpolation based on available points
        let newPosition;
        
        if (this.trajectory.length >= 4 && index1 >= 1 && index2 < this.trajectory.length - 1) {
            // We have enough points for cubic interpolation
            const point0 = this.trajectory[index1 - 1];
            const point3 = this.trajectory[index2 + 1];
            
            // Interpolate each component separately
            newPosition = new THREE.Vector3(
                this.cubicInterpolate(
                    point0.position.x, point1.position.x, point2.position.x, point3.position.x, t
                ),
                this.cubicInterpolate(
                    point0.position.y, point1.position.y, point2.position.y, point3.position.y, t
                ),
                this.cubicInterpolate(
                    point0.position.z, point1.position.z, point2.position.z, point3.position.z, t
                )
            );
        } else {
            // Fall back to simple linear interpolation
            newPosition = new THREE.Vector3().copy(point1.position).lerp(point2.position, t);
        }
        
        // Store the previous position for direction calculation
        const prevPosition = this.position.clone();
        
        // Update positions
        this.currentPosition.copy(newPosition);
        this.position.copy(newPosition);
        
        // Update direction for orientation
        const moveDelta = new THREE.Vector3().copy(this.position).sub(prevPosition);
        if (moveDelta.lengthSq() > 0.00001) { // Only update if there's meaningful movement
            this.direction.copy(moveDelta).normalize();
            if (this.rotationConfig && this.rotationConfig.type === 'velocity') {
                this.setOrientation(this.direction);
            }
        }
        
        // Update mesh position
        const activeMesh = this.mesh || this.tempMesh;
        if (activeMesh) {
            activeMesh.position.copy(this.position);
            
            // Handle constant rotation if configured
            if (this.rotationConfig && this.rotationConfig.type === 'constant') {
                const deltaTime = (point2.time - point1.time) / 1000 * t; // Convert to seconds
                const rotationAmount = THREE.MathUtils.degToRad(
                    this.rotationConfig.rotationSpeed
                ) * deltaTime;
                activeMesh.rotateOnAxis(this.rotationConfig.rotationAxis, rotationAmount);
            }
        }
        
        // Update trail position
        if (TRAILS && this.trailEffect) {
            this.trailEffect.updatePosition(this.trailConfig.trailId, this.position);
            this.trailEffect.updateDirection(this.trailConfig.trailId, this.direction);
        }
    }
    
    // The original updateVisual method is replaced by updateTrajectoryPosition
    updateVisual(deltaTime) {
        // This method is now just a compatibility layer
        // All the actual positioning is done in updateTrajectoryPosition
        
        if (this.isDestroyed) return;
        
        // If we're using rotation animation that isn't direction-based
        const activeMesh = this.mesh || this.tempMesh;
        if (activeMesh && this.rotationConfig && this.rotationConfig.type === 'constant') {
            const rotationAmount = THREE.MathUtils.degToRad(
                this.rotationConfig.rotationSpeed
            ) * deltaTime;
            activeMesh.rotateOnAxis(this.rotationConfig.rotationAxis, rotationAmount);
        }
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
                tempMeshColor: 0xaaaaaa,
                trailConfig: {
                    trailType: 'basic',
                    trailSize: this.projectileScale,
                    emitRate: 50
                },
                rotation: {
                    type: 'velocity', 
                    rotationAxis: null,
                    rotationSpeed: 0
                }
            },
            balloon: {
                tempMeshColor: 0xaaaaaa,
                trailConfig: {
                    trailType: 'none',
                    trailSize: this.projectileScale,
                    emitRate: 0
                },
                rotation: {
                    type: 'constant', 
                    rotationAxis: new THREE.Vector3(0, 1, 0).normalize(),
                    rotationSpeed: 5
                }
            },
            bomblet: {
                tempMeshColor: 0xaaaaaa,
                trailConfig: {
                    trailType: 'none',
                    trailSize: 1,
                    emitRate: 50
                },
                rotation: {
                    type: 'constant',
                    rotationAxis: new THREE.Vector3(0.3, 1, 0).normalize(),
                    rotationSpeed: 200
                }
            },
            spike_bomb: {
                tempMeshColor: 0xaaaaaa,
                trailConfig: {
                    trailType: 'basic',
                    trailSize: 1,
                    emitRate: 50
                },
                rotation: {
                    type: 'constant',
                    rotationAxis: new THREE.Vector3(0.3, 1, 0).normalize(),
                    rotationSpeed: 50
                }
            },
            default: {
                tempMeshColor: 0xaaaaaa,
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
        this.trailConfig = {
            ...config.trailConfig,
            position: this.position,  // initial position
            trailId: `${this.projectileId}trail`
        };
        this.rotationConfig = config.rotation;
    }

    async setupVisuals() {
        // Temporary model
        this.tempMesh = this.createTempMesh();
        this.tempMesh.position.copy(this.position);
        this.scene.add(this.tempMesh);

        // Load 3D model
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
            
            // Create a proper clone that preserves materials
            this.mesh = loadedModel.clone(true); // The 'true' parameter ensures materials are cloned too            
            this.mesh.scale.setScalar(this.projectileScale);
            this.mesh.position.copy(this.position);
        
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
        //this.terrainRenderer.queueTerrainModification(this.position.x, this.position.z, this.craterSize, 'crater');
        if (this.isFinalProjectile) {
            this.terrainRenderer.updateNormals();
        }
    }
    
    getPosition() {
        return this.position;
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

        this.trajectory = null;
        this.scene = null;
        this.gpuParticleManager = null;
        this.terrainRenderer = null;
    }
}

export { ClientProjectile };