// Tank.js
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';

export class Tank {
    constructor(x, y, z) {
        this.tankGroup = new THREE.Group();
        this.tankGroup.position.set(x, y, z);
        this.elapsedTime = 0;
        this.power = 200;
        this.turretPitch = 0;  // in degrees
        this.turretYaw = 0;    // in degrees
        this.health = 100;
        this.armor = 0;
        this.shield = 0;
        this.name = "Unknown";
        this.color = null;
        this.cash = 0;
        this.isAlive = true;
        this.inventory = {};
        this.selectedWeapon = "PS01";
        this.selectedItem = null;
        this.baseMesh = null;    // For tank1_base
        this.turretMesh = null;  // For tank1_turret
        this.currentPosition = new THREE.Vector3(x, y, z);
        this.targetPosition = new THREE.Vector3(x, y, z);
        this.positionLerpSpeed = 50; // Units per second
        this.loader = new GLTFLoader();
        this.turretYawGroup = new THREE.Group();
        this.turretPitchGroup = new THREE.Group();
        this.turretYawGroup.position.set(0, 16.0, 0);
        this.tankGroup.add(this.turretYawGroup);
        this.turretYawGroup.add(this.turretPitchGroup);
        this.loadBaseModel();
        this.loadTurretModel();
        
        // Load a font for 3D text and create the name tag when ready.
        this.fontLoader = new FontLoader();
        this.font = null;
        this.loadFont();

        // --- Properties for Smooth Turret Movement ---
        // Current and target angles (in degrees)
        this.turretYawCurrent = 0;
        this.turretYawTarget = 0;
        this.turretPitchCurrent = 0;
        this.turretPitchTarget = 0;

        // Speed of turret rotation (degrees per second).
        this.turretLerpSpeed = 90; 
    }

    loadFont() {
        // Adjust the path to your font file as needed.
        this.fontLoader.load(
            '/fonts/helvetiker_bold.typeface.json',
            (font) => {
                this.font = font;
                this.createNameTag(); // Create the 3D text name tag once the font is loaded.
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

    // Update the weapon selection
    setSelectedWeapon(weaponCode) {
        this.selectedWeapon = weaponCode;
    }

    // Update the item selection
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
        // Update the text color if the name tag exists.
        if (this.nameTag && this.nameTag.material) {
            this.nameTag.material.color.set(hexColor ? hexColor : 0xffff00);
        }
    }
    
    getName() {
        return this.name;
    }

    loadBaseModel() {
        this.loader.load(
            '/models/tank1_base.glb',
            (gltf) => {
                this.baseMesh = gltf.scene;
                this.baseMesh.scale.set(2, 2, 2);
                if (this.color !== null) {
                    this.applyColor(this.baseMesh, this.color);
                }
                this.baseMesh.castShadow = true;
                this.baseMesh.receiveShadow = true;
                this.tankGroup.add(this.baseMesh);
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
                this.turretMesh = gltf.scene;
                this.turretMesh.scale.set(2, 2, 2);
                this.turretMesh.position.set(0, 0, 0);
                if (this.color !== null) {
                    this.applyColor(this.turretMesh, this.color);
                }                
                this.turretMesh.castShadow = true;
                this.turretMesh.receiveShadow = true;
                this.turretPitchGroup.add(this.turretMesh);
            },
            undefined,
            (error) => {
                console.error('Error loading tank1_turret.glb:', error);
            }
        );
    }

    createNameTag() {
        // Remove existing name tag if it exists.
        if (this.nameTag) {
            this.tankGroup.remove(this.nameTag);
            this.nameTag.geometry.dispose();
            this.nameTag.material.dispose();
            this.nameTag = null;
        }

        if (!this.font) {
            console.warn('Font not loaded yet.');
            return;
        }

        const textGeometry = new TextGeometry(this.name, {
            font: this.font,
            size: 10,
            depth: 2,
            curveSegments: 12,
            bevelEnabled: false
        });
        textGeometry.computeBoundingBox();
        const bbox = textGeometry.boundingBox;
        const centerOffset = -0.5 * (bbox.max.x - bbox.min.x);

        const textMaterial = new THREE.MeshStandardMaterial({ 
            color: this.color ? this.color : 0xffff00,
            depthTest: false, 
          });
        const textMesh = new THREE.Mesh(textGeometry, textMaterial);
        textMesh.position.set(centerOffset, 40, 0);
        textMesh.renderOrder = 1;
        this.tankGroup.add(textMesh);
        this.nameTag = textMesh;
    }

    /**
     * Update the tank's shield value.
     * @param {number} newShield - The new shield value.
     */
    setShield(newShield) {
        this.shield = newShield;
    }
    
    /**
     * Update the tank's armor value.
     * @param {number} newArmor - The new armor value.
     */
    setArmor(newArmor) {
        this.armor = newArmor;
    }
    
    setName(newName) {
        this.name = newName;
        // Recreate the 3D text name tag with the new name.
        this.createNameTag();
    }

    setColor(hexColor) {
        this.color = hexColor;
        if (this.baseMesh) {
            this.applyColor(this.baseMesh, hexColor);
        }
        if (this.turretMesh) {
            this.applyColor(this.turretMesh, hexColor);
        }
        if (this.nameTag && this.nameTag.material) {
            this.nameTag.material.color.set(hexColor ? hexColor : 0xffff00);
        }
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
        } else {
            this.tankGroup.position.set(positionOrX, y, z);
            this.targetPosition.set(positionOrX, y, z);
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
        this.isAlive = false;
        this.tankGroup.visible = false; 
    }

    resetForNewRound() {
        this.isAlive = true;
        this.tankGroup.visible = true;
        
        if (!this.nameTag) {
            this.createNameTag();
        } else {
            this.nameTag.visible = true;
        }
        
        this.setHealth(100);
        this.armor = 0;
        this.shield = 0;
        this.power = 200;
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
        if (this.nameTag) {
            this.nameTag.lookAt(camera.position);
        }
        }
}

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
