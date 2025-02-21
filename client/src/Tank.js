// Tank.js
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

let BASE_SCALE = {
    x: 80,
    y: 20,
    z: 2
};

// Animation settings
let SCALE_FACTOR = 0.05; // How much to scale up/down (10% in this case)
let ANIMATION_SPEED = 7; // Adjust this to make the animation faster or slower

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
        this.createNameTag();

        // --- Added Properties for Smooth Turret Movement ---
        // Current and target angles (in degrees)
        this.turretYawCurrent = 0;
        this.turretYawTarget = 0;
        this.turretPitchCurrent = 0;
        this.turretPitchTarget = 0;

        // Control how quickly the turret rotates (degrees/sec).
        // Adjust this value to make turret rotate faster or slower.
        this.turretLerpSpeed = 90; 
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


  // Update the weapon selection and notify the game
  setSelectedWeapon(weaponCode) {
    this.selectedWeapon = weaponCode;
  }

    // Similarly, add an item selection method
    setSelectedItem(itemCode) {
        this.selectedItem = itemCode;
    }

    // Optionally, update your getter(s) if needed:
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
                    // Handle single or multiple materials
                    const materials = Array.isArray(child.material) ? child.material : [child.material];
                    materials.forEach(material => {
                        material.shadowSide = THREE.FrontSide;
                        if (material.color) {
                        }
                    });
                }
            }
        });
        if (this.nameTag) {
            this.updateNameTagTexture();
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
        const texture = this.makeTextTexture(this.name);
        const spriteMaterial = new THREE.SpriteMaterial({
            map: texture,
            transparent: true,
            depthTest: false,
        });

        this.nameTag = new THREE.Sprite(spriteMaterial);
        this.nameTag.position.set(0, 40, 0);

        // Create health bar
        const healthTexture = this.makeHealthBarTexture(this.health);
        const healthBarMaterial = new THREE.SpriteMaterial({
            map: healthTexture,
            transparent: true,
            depthTest: false,
        });

        this.healthBar = new THREE.Sprite(healthBarMaterial);
        this.healthBar.position.set(0, 45, 0);
        this.healthBar.scale.set(50, 3, 1);
        this.tankGroup.add(this.nameTag);
        this.tankGroup.add(this.healthBar);
    }

    bigNameTag() {
        BASE_SCALE.x = 120;
        BASE_SCALE.y = 40;
        BASE_SCALE.z = 15;
        ANIMATION_SPEED = 6;
        SCALE_FACTOR = 0.8;
    }

    littleNameTag() {
        BASE_SCALE.x = 80;
        BASE_SCALE.y = 20;
        BASE_SCALE.z = 2;
        ANIMATION_SPEED = 7;
        SCALE_FACTOR = 0.05;
    }

    makeTextTexture(text) {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = 512;
        canvas.height = 128;

        context.clearRect(0, 0, canvas.width, canvas.height);
        context.fillStyle = this.color ? '#' + this.color.toString(16).padStart(6, '0') : '#ffff00';        
        context.font = '40px sans-serif';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(text, canvas.width / 2, canvas.height / 2);

        const texture = new THREE.Texture(canvas);
        texture.needsUpdate = true;
        return texture;
    }

    makeHealthBarTexture(health) {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = 256;
        canvas.height = 2;

        // Clear the canvas
        context.clearRect(0, 0, canvas.width, canvas.height);

        // Draw the background (gray)
        context.fillStyle = '#444444';
        context.fillRect(0, 0, canvas.width, canvas.height);

        // Calculate health percentage
        const healthPercent = health / 100;
        const barWidth = canvas.width * healthPercent;

        // Draw the health bar
        context.fillStyle = this.getHealthColor(healthPercent);
        context.fillRect(0, 0, barWidth, canvas.height);
        const texture = new THREE.Texture(canvas);
        texture.needsUpdate = true;
        return texture;
    }

    getHealthColor(healthPercent) {
        // Convert health percent to value between 0 and 1
        healthPercent = Math.max(0, Math.min(1, healthPercent));
        
        let color;
        
        if (healthPercent > 0.6) {
            // Blend between green and yellow
            const t = (healthPercent - 0.6) / 0.4; // normalize to 0-1 range
            const r = Math.round(255 * (1 - t));
            const g = 255;
            const b = 0;
            color = `rgb(${r}, ${g}, ${b})`;
        } else if (healthPercent > 0.2) {
            // Blend between yellow and red
            const t = (healthPercent - 0.2) / 0.4; // normalize to 0-1 range
            const r = 255;
            const g = Math.round(255 * t);
            const b = 0;
            color = `rgb(${r}, ${g}, ${b})`;
        } else {
            // Red for 20% or lower
            color = '#ff0000';
        }
        
        return color;
    }

    updateNameTagTexture() {
        if (!this.nameTag) return;
        const newTexture = this.makeTextTexture(this.name);
        this.nameTag.material.map = newTexture;
        this.nameTag.material.map.needsUpdate = true;
    }

    /**
     * Update the tank's shield value.
     * @param {number} newShield - The new shield value.
     */
    setShield(newShield) {
        this.shield = newShield;
        // Optionally, trigger any UI updates for the shield value here.
    }
    
    /**
     * Update the tank's armor value.
     * @param {number} newArmor - The new armor value.
     */
    setArmor(newArmor) {
        this.armor = newArmor;
        // Optionally, trigger any UI updates for the armor value here.
    }
    

    setName(newName) {
        this.name = newName;
        this.updateNameTagTexture();
    }

    setColor(hexColor) {
        this.color = hexColor;
        if (this.baseMesh) {
            this.applyColor(this.baseMesh, hexColor);
        }
        if (this.turretMesh) {
            this.applyColor(this.turretMesh, hexColor);
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
        // Update health bar if it exists
        if (this.healthBar) {
            const newTexture = this.makeHealthBarTexture(this.health);
            this.healthBar.material.map = newTexture;
            this.healthBar.material.map.needsUpdate = true;
        }
    }

    setPosition(positionOrX, y, z) {
        if (y === undefined && z === undefined) {
            // Handle case where a position object is passed
            this.tankGroup.position.set(positionOrX.x, positionOrX.y, positionOrX.z);
            this.targetPosition.set(positionOrX.x, positionOrX.y, positionOrX.z);
        } else {
            // Handle case where individual coordinates are passed
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
        
        // Recreate name tag and health bar
        if (!this.nameTag || !this.healthBar) {
            this.createNameTag(); // This method creates both nameTag and healthBar
        } else {
            this.nameTag.visible = true;
            this.healthBar.visible = true;
        }
        
        this.setHealth(100);
        this.armor = 0;
        this.shield = 0;
        this.power = 200;
    }

    get mesh() {
        return this.tankGroup;
    }

    updateNameTagScale(deltaTime) {
        // Update the elapsed time
        this.elapsedTime += deltaTime;
        const scaleModifier = 1 + (Math.sin(this.elapsedTime * ANIMATION_SPEED) + 1) / 2 * SCALE_FACTOR;
        
        // Apply the scale
        this.nameTag.scale.set(
            BASE_SCALE.x * scaleModifier,
            BASE_SCALE.y * scaleModifier,
            BASE_SCALE.z * scaleModifier
        );
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
        if (camera) {
            if (this.nameTag) {
                this.updateNameTagScale(deltaTime);
            }
        }
    }
}

function getShortestAngleDiff(current, target) {
    let diff = (target - current) % 360;
    // Force into [0, 360) range
    if (diff < 0) {
      diff += 360;
    }
    // Now force into [-180, 180] range
    if (diff > 180) {
      diff -= 360;
    }
    return diff;
  }
  
