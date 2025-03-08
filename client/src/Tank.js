import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';
import { TankUI } from './tankUI.js';

function getShortestAngleDiff(current, target) {
    let diff = (target - current) % 360;
    if (diff < 0) {
        diff += 360;
    }
    if (diff > 180) {
        diff -= 360;
    }
    return diff;
}

export class Tank {
    constructor(x, y, z, game) {
        this.game = game;
        this.tankGroup = new THREE.Group();
        this.tankGroup.position.set(x, y, z);
        this.elapsedTime = 0;
        this.power = 20;
        this.turretPitch = 0;
        this.turretYaw = 0;
        this.health = 100;
        this.armor = 0;
        this.shield = 0;
        this.name = "Unknown";
        this.color = null;
        this.cash = 0;
        this.isAlive = true;
        this.inventory = {};
        this.selectedWeapon = "BW01";
        this.selectedItem = null;
        
        this.baseMesh = null;
        this.turretMesh = null;
        
        this.physicsBaseMesh = null;
        this.physicsTurretMesh = null;
        this.baseBody = null;
        this.turretBody = null;
        this.physicsGroup = new THREE.Group();
        this.game.scene.add(this.physicsGroup);
        this.physicsGroup.visible = false;
        this.disposalTimeout = null;
        
        this.currentPosition = new THREE.Vector3(x, y, z);
        this.targetPosition = new THREE.Vector3(x, y, z);
        this.positionLerpSpeed = 1;
        this.loader = new GLTFLoader();
        this.turretYawGroup = new THREE.Group();
        this.turretPitchGroup = new THREE.Group();
        this.turretYawGroup.position.set(0, 2, 0);
        this.tankGroup.add(this.turretYawGroup);
        this.turretYawGroup.add(this.turretPitchGroup);
        
        this.loadBaseModel();
        this.loadTurretModel();
        
        this.fontLoader = new FontLoader();
        this.font = null;
        this.loadFont();

        this.turretYawCurrent = 0;
        this.turretYawTarget = 0;
        this.turretPitchCurrent = 0;
        this.turretPitchTarget = 0;
        this.turretLerpSpeed = 90; 
        
        this.ui = new TankUI(this);
    }

    loadFont() {
        this.fontLoader.load(
            '/fonts/gentilis_bold.typeface.json',
            (font) => {
                this.font = font;
                this.ui.createNameTag();
                this.ui.createStatusLabels();
            },
            undefined,
            (error) => {
                console.error('Error loading font:', error);
            }
        );
    }

    getInventoryByType(type) {
        const result = [];
        for (const [code, invItem] of Object.entries(this.inventory)) {
            const item = invItem.item;
            if (type === 'weapon' && item.category === 'Weapon') {
                result.push({
                    code: code,
                    name: item.name,
                    quantity: invItem.quantity,
                    description: item.description,
                    icon: item.icon
                });
            } else if (type === 'items' && item.category !== 'Weapon') {
                result.push({
                    code: code,
                    name: item.name,
                    quantity: invItem.quantity,
                    description: item.description,
                    icon: item.icon,
                    category: item.category
                });
            }
        }
        return result;
    }

    setSelectedWeapon(weaponCode) {
        this.selectedWeapon = weaponCode;
    }

    setSelectedItem(itemCode) {
        this.selectedItem = itemCode;
    }

    getSelectedWeapon() {
        return this.selectedWeapon;
    }

    getSelectedItem() {
        return this.selectedItem;
    }

    applyColor(object3D, hexColor) {
        if (!object3D) return;
        object3D.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                if (child.material) {
                    const materials = Array.isArray(child.material) ? child.material : [child.material];
                    materials.forEach(material => {
                        material.shadowSide = THREE.FrontSide;
                    });
                }
            }
        });
        this.ui.updateNameTagColor(hexColor);
    }
    
    getName() {
        return this.name;
    }

    loadBaseModel() {
        this.loader.load(
            '/models/tank1_base.glb',
            (gltf) => {
                this.baseMesh = gltf.scene.clone();
                if (this.color !== null) {
                    this.applyColor(this.baseMesh, this.color);
                }
                this.baseMesh.castShadow = true;
                this.baseMesh.receiveShadow = true;
                this.tankGroup.add(this.baseMesh);
                
                this.physicsBaseMesh = gltf.scene.clone();
                if (this.color !== null) {
                    this.applyColor(this.physicsBaseMesh, this.color);
                }
                this.physicsBaseMesh.castShadow = true;
                this.physicsBaseMesh.receiveShadow = true;
                this.physicsGroup.add(this.physicsBaseMesh);
            },
            undefined,
            (error) => {
                console.error('Error loading tank1_base.glb:', error);
            }
        );
    }

    loadTurretModel() {
        this.loader.load(
            '/models/tank1_turret.glb',
            (gltf) => {
                this.turretMesh = gltf.scene.clone();
                this.turretMesh.position.set(0, -1.5, 0);
                if (this.color !== null) {
                    this.applyColor(this.turretMesh, this.color);
                }                
                this.turretMesh.castShadow = true;
                this.turretMesh.receiveShadow = true;
                this.turretPitchGroup.add(this.turretMesh);
                
                this.physicsTurretMesh = gltf.scene.clone();
                this.physicsTurretMesh.position.set(0, 0, 0);
                if (this.color !== null) {
                    this.applyColor(this.physicsTurretMesh, this.color);
                }
                this.physicsTurretMesh.castShadow = true;
                this.physicsTurretMesh.receiveShadow = true;
                this.physicsGroup.add(this.physicsTurretMesh);
            },
            undefined,
            (error) => {
                console.error('Error loading tank1_turret.glb:', error);
            }
        );
    }

    createPhysicsBodies() {
        if (!this.game.physicsManager.initialized) return false;
        
        if (this.baseBody || this.turretBody) {
            this.removePhysicsBodies();
        }
        
        const baseSize = new THREE.Vector3(1, 2, 2);
        this.baseBody = this.game.physicsManager.createBoxBody(
            this.physicsBaseMesh,
            10,
            baseSize,
            {
                friction: 0.7,
                restitution: 0.2,
                linearDamping: 0.05,
                angularDamping: 0.05
            }
        );
        
        const turretSize = new THREE.Vector3(0.5, 0.5, 0.5);
        this.turretBody = this.game.physicsManager.createBoxBody(
            this.physicsTurretMesh,
            5,
            turretSize,
            {
                friction: 0.7,
                restitution: 0.2,
                linearDamping: 0.05,
                angularDamping: 0.05
            }
        );
        
        return true;
    }
    
    removePhysicsBodies() {
        if (this.baseBody) {
            this.game.physicsManager.removeRigidBody(this.baseBody);
            this.baseBody = null;
        }
        
        if (this.turretBody) {
            this.game.physicsManager.removeRigidBody(this.turretBody);
            this.turretBody = null;
        }
    }

    setShield(newShield) {
        this.shield = newShield;
        this.ui.updateStatusLabelVisibility();
    }
    
    setArmor(newArmor) {
        this.armor = newArmor;
        this.ui.updateStatusLabelVisibility();
    }
    
    setName(newName) {
        this.name = newName;
        this.ui.createNameTag();
    }

    setColor(hexColor) {
        this.color = hexColor;
        if (this.baseMesh) {
            this.applyColor(this.baseMesh, hexColor);
        }
        if (this.turretMesh) {
            this.applyColor(this.turretMesh, hexColor);
        }
        if (this.physicsBaseMesh) {
            this.applyColor(this.physicsBaseMesh, hexColor);
        }
        if (this.physicsTurretMesh) {
            this.applyColor(this.physicsTurretMesh, hexColor);
        }
        this.ui.updateNameTagColor(hexColor);
    }

    setCash(newCash) {
        this.cash = newCash;
    }

    getCash() {
        return this.cash;
    }

    getColor() {
        return this.color;
    }

    setInventory(newInventory) {
        this.inventory = newInventory;
    }

    setTurretYaw(yawDeg) {
        this.turretYawTarget = yawDeg;
    }

    setTurretPitch(pitchDeg) {
        this.turretPitchTarget = pitchDeg;
    }

    setPower(newPower) {
        this.power = newPower;
    }

    setHealth(value) {
        this.health = value;
    }

    setPosition(positionOrX, y, z) {
        if (y === undefined && z === undefined) {
            this.tankGroup.position.set(positionOrX.x, positionOrX.y, positionOrX.z);
            this.targetPosition.set(positionOrX.x, positionOrX.y, positionOrX.z);
            this.physicsGroup.position.set(positionOrX.x, positionOrX.y, positionOrX.z);
        } else {
            this.tankGroup.position.set(positionOrX, y, z);
            this.targetPosition.set(positionOrX, y, z);
            this.physicsGroup.position.set(positionOrX, y, z);
        }
    }
    
    setTargetPosition(newPos) {
        this.targetPosition.set(newPos.x, newPos.y, newPos.z);
    }

    lerpPosition(deltaTime) {
        const distance = this.positionLerpSpeed * deltaTime;
        const current = this.tankGroup.position;
        const diff = new THREE.Vector3().subVectors(this.targetPosition, current);
        const distanceToTarget = diff.length();

        if (distanceToTarget < 0.01) {
            current.copy(this.targetPosition);
            return;
        }

        const step = Math.min(distance, distanceToTarget);
        const direction = diff.normalize().multiplyScalar(step);
        current.add(direction);
    }

    getFireDirection() {
        if (!this.turretMesh) return new THREE.Vector3(0, 0, 1);
        const localForward = new THREE.Vector3(0, 0, 1);
        const worldPos = new THREE.Vector3();
        this.turretMesh.getWorldPosition(worldPos);

        const barrelWorldDir = localForward
            .clone()
            .applyMatrix4(this.turretMesh.matrixWorld)
            .sub(worldPos)
            .normalize();

        return barrelWorldDir;
    }

    destroy() {
        this.explodeTank();
        this.ui.toggleTank3dElementsVisibility(false);
    }

    resetForNewRound() {
        this.isAlive = true;
        this.health = 100;
        this.armor = 0;
        this.shield = 0;
        this.power = 20;
        
        this.removePhysicsBodies();
        
        if (this.physicsBaseMesh.parent === this.game.scene) {
            this.game.scene.remove(this.physicsBaseMesh);
        }
        
        if (this.physicsTurretMesh.parent === this.game.scene) {
            this.game.scene.remove(this.physicsTurretMesh);
        }
        
        if (this.physicsGroup.parent !== this.game.scene) {
            this.game.scene.add(this.physicsGroup);
        }
        
        this.physicsGroup.add(this.physicsBaseMesh);
        this.physicsGroup.add(this.physicsTurretMesh);
        this.physicsBaseMesh.position.set(0, 0, 0);
        this.physicsTurretMesh.position.set(0, 0, 0);
        this.physicsGroup.visible = false;
        
        this.tankGroup.visible = true;
        
        this.turretYawCurrent = 0;
        this.turretYawTarget = 0;
        this.turretPitchCurrent = 0;
        this.turretPitchTarget = 0;
        this.turretYawGroup.rotation.y = 0;
        this.turretPitchGroup.rotation.x = 0;
        
        this.tankGroup.position.copy(this.targetPosition);
        
        this.ui.resetForNewRound();
        this.ui.toggleTank3dElementsVisibility(true);
    }

    get mesh() {
        return this.tankGroup;
    }

    update(deltaTime, camera) {
        if (!this.isAlive) return;
        
        this.lerpPosition(deltaTime);
        
        const yawDiff = getShortestAngleDiff(this.turretYawCurrent, this.turretYawTarget);
        const yawStep = this.turretLerpSpeed * deltaTime;
        if (Math.abs(yawDiff) > yawStep) {
            this.turretYawCurrent += Math.sign(yawDiff) * yawStep;
        } else {
            this.turretYawCurrent = this.turretYawTarget;
        }
        this.turretYawGroup.rotation.y = THREE.MathUtils.degToRad(this.turretYawCurrent);
        
        let pitchDiff = this.turretPitchTarget - this.turretPitchCurrent;
        const pitchStep = this.turretLerpSpeed * deltaTime;
        if (Math.abs(pitchDiff) > pitchStep) {
            this.turretPitchCurrent += Math.sign(pitchDiff) * pitchStep;
        } else {
            this.turretPitchCurrent = this.turretPitchTarget;
        }
        this.turretPitchGroup.rotation.x = THREE.MathUtils.degToRad(this.turretPitchCurrent);
        
        this.ui.updateVisualValues(deltaTime);
        this.ui.updateUIForCamera(camera);
    }

    explodeTank(disposalTime = 10, explosionOptions = {}) {
        this.isAlive = false;
        
        this.tankGroup.visible = false;
        
        const tankWorldPos = new THREE.Vector3();
        this.tankGroup.getWorldPosition(tankWorldPos);
        
        const baseWorldPos = new THREE.Vector3();
        const baseWorldQuat = new THREE.Quaternion();
        const turretWorldPos = new THREE.Vector3();
        const turretWorldQuat = new THREE.Quaternion();
        
        this.baseMesh.getWorldPosition(baseWorldPos);
        this.baseMesh.getWorldQuaternion(baseWorldQuat);
        this.turretMesh.getWorldPosition(turretWorldPos);
        this.turretMesh.getWorldQuaternion(turretWorldQuat);
        
        this.physicsGroup.position.set(0, 0, 0);
        this.game.scene.remove(this.physicsGroup);
        this.game.scene.add(this.physicsBaseMesh);
        this.game.scene.add(this.physicsTurretMesh);
        
        this.physicsBaseMesh.position.copy(baseWorldPos);
        this.physicsBaseMesh.position.y += 0.5;
        this.physicsBaseMesh.quaternion.copy(baseWorldQuat);
        
        this.physicsTurretMesh.position.copy(turretWorldPos);
        this.physicsTurretMesh.position.y += 0.5;
        this.physicsTurretMesh.quaternion.copy(turretWorldQuat);
        
        this.physicsBaseMesh.visible = true;
        this.physicsTurretMesh.visible = true;
        
        this.createPhysicsBodies();

        if (this.turretBody) {
            const turretImpulse = new THREE.Vector3(
                (Math.random() * 2 - 1) * (explosionOptions.randomForce || 50) * 1.2,
                (explosionOptions.upwardForce || 25) * 1.5,
                (Math.random() * 2 - 1) * (explosionOptions.randomForce || 50) * 1.2
            );
            this.game.physicsManager.applyImpulse(this.turretBody, turretImpulse);
            
            const turretTorque = new THREE.Vector3(
                (Math.random() * 2 - 1) * (explosionOptions.torqueForce || 10) * 1.5,
                (Math.random() * 2 - 1) * (explosionOptions.torqueForce || 50) * 1.5,
                (Math.random() * 2 - 1) * (explosionOptions.torqueForce || 10) * 1.5
            );
            this.game.physicsManager.applyTorque(this.turretBody, turretTorque);
        }

        
        if (this.baseBody) {
            const baseImpulse = new THREE.Vector3(
                (Math.random() * 2 - 1) * (explosionOptions.randomForce || 50),
                (explosionOptions.upwardForce || 325),
                (Math.random() * 2 - 1) * (explosionOptions.randomForce || 50)
            );
            this.game.physicsManager.applyImpulse(this.baseBody, baseImpulse);
            
            const baseTorque = new THREE.Vector3(
                (Math.random() * 2 - 1) * (explosionOptions.torqueForce || 20),
                (Math.random() * 2 - 1) * (explosionOptions.torqueForce || 50),
                (Math.random() * 2 - 1) * (explosionOptions.torqueForce || 20)
            );
            this.game.physicsManager.applyTorque(this.baseBody, baseTorque);
        }
        
        
        if (this.disposalTimeout) {
            clearTimeout(this.disposalTimeout);
        }
        
        this.disposalTimeout = setTimeout(() => {
            this.removePhysicsBodies();
            
            if (this.physicsBaseMesh.parent === this.game.scene) {
                this.game.scene.remove(this.physicsBaseMesh);
            }
            
            if (this.physicsTurretMesh.parent === this.game.scene) {
                this.game.scene.remove(this.physicsTurretMesh);
            }
            
            if (this.physicsGroup.parent !== this.game.scene) {
                this.game.scene.add(this.physicsGroup);
            }
            
            this.physicsGroup.add(this.physicsBaseMesh);
            this.physicsGroup.add(this.physicsTurretMesh);
            this.physicsBaseMesh.visible = false;
            this.physicsTurretMesh.visible = false;
        }, disposalTime * 1000);
        
        return true;
    }
}