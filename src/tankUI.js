import * as THREE from 'three';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';

export class TankUI {
    constructor(tank) {
        this.tank = tank;
        this.nameTag = null;
        this.statusBarGroup = null;
        this.healthBarIndicator = null;
        this.armorBarIndicator = null;
        this.shieldBarIndicator = null;
        this.armorLabel = null;
        this.shieldLabel = null;
        
        // Current visual values for smooth transitions
        this.currentVisualHealth = tank.health;
        this.currentVisualArmor = tank.armor;
        this.currentVisualShield = tank.shield;
        
        // Status bar configuration
        this.statusBarConfig = {
            width: 12,           // Width of the status bar
            height: 0.5,         // Height of the status bar
            depth: 0.5,          // Depth of the status bar
            spacing: 0.6,        // Vertical spacing between bars
            yOffset: 7,          // Height above the tank
            backgroundScale: 0.9875, // Scale of background relative to the indicator (slightly smaller)
            labelOffset: -6,     // X-offset for the status labels
            labelOffsetZ: 0.1,   // Z-offset for the status labels
            lerpRate: 20.0       // lerp the status bar sizes smoothly
        };
        
        // Create status bars
        this.createStatusBars();
    }

    createNameTag() {
        if (!this.tank.font) return;   

        if (this.nameTag) {
            this.tank.tankGroup.remove(this.nameTag);
            this.nameTag.geometry.dispose();
            this.nameTag.material.dispose();
            this.nameTag = null;
        }
        
        const textGeometry = new TextGeometry(this.tank.name, {
            font: this.tank.font,
            size: 3,
            depth: 0.5,
            curveSegments: 12,
            bevelEnabled: true,
            bevelSegments: 1,
            bevelThickness: 0.1,
            bevelSize: 0.1,
        });
        textGeometry.computeBoundingBox();
        const bbox = textGeometry.boundingBox;
        const centerOffset = -0.5 * (bbox.max.x - bbox.min.x);
    
        // Switch to MeshBasicMaterial for UI elements
        const textMaterial = new THREE.MeshStandardMaterial({ 
            color: this.tank.color ? this.tank.color : 0xffff00,
            transparent: true,  // Enable transparency
            opacity: 1.0,
            depthTest: false,   // Disable depth testing
            depthWrite: false,  // Don't write to depth buffer
            metalness: 0.2,
            roughness: 1.0,
        });
        
        const textMesh = new THREE.Mesh(textGeometry, textMaterial);
        textMesh.position.set(centerOffset, 4, 0);
        textMesh.renderOrder = 9999;  // Very high render order
        
        // Important: Add to tank group for consistent rendering
        this.tank.tankGroup.add(textMesh);
        textMesh.userData.ignoreBloom = true;  // Prevent bloom effect on UI
        
        this.nameTag = textMesh;
    }

    updateNameTagColor(hexColor) {
        if (this.nameTag && this.nameTag.material) {
            this.nameTag.material.color.set(hexColor ? hexColor : 0xffff00);
        }
    }

    // Create and manage status bars
    createStatusBars() {
        // Create a group for all status bars
        this.statusBarGroup = new THREE.Group();
        
        // Create the health bar (green)
        this.createShieldBar(0);
        
        // Create the armor bar (darker green)
        this.createArmorBar(this.statusBarConfig.spacing);
        
        // Create the shield bar (blue)
        this.createHealthBar(this.statusBarConfig.spacing * 2);
        
        // Position the status bar group above the tank
        this.statusBarGroup.position.set(0, this.statusBarConfig.yOffset, 0);
        
        // Add the status bar group to the tank
        this.tank.tankGroup.add(this.statusBarGroup);
        
        // Update all status bars display
        this.updateStatusBars();
    }

    createStatusLabels() {
        if (!this.tank.font) {
            console.warn('Font not loaded yet for status labels.');
            return;
        }
        
        // Create the health label (H:)
        this.createStatusLabel("Shield", 0, 0xdddddd);
        
        // Create the armor label (A:)
        this.createStatusLabel("Armor", this.statusBarConfig.spacing, 0x00dd00);
        
        // Create the shield label (S:)
        this.createStatusLabel("Health", this.statusBarConfig.spacing * 2, 0x006400);
        
        // Update visibility of armor and shield labels
        this.updateStatusLabelVisibility();
    }

    createStatusLabel(text, yOffset, color) {
        const textGeometry = new TextGeometry(text, {
            font: this.tank.font,
            size: 0.4,
            depth: 0.1,
            curveSegments: 12,
        });
        
        textGeometry.computeBoundingBox();
        
        const statusTextMaterial = new THREE.MeshBasicMaterial({ 
            color: color,
            transparent: true,
            depthTest: false,
            depthWrite: false,
        });
        
        const textMesh = new THREE.Mesh(textGeometry, statusTextMaterial);
        // Position the labels to the left of the bar
        textMesh.position.set(this.statusBarConfig.labelOffset, yOffset - 0.2, this.statusBarConfig.labelOffsetZ);
        textMesh.renderOrder = 1;
        
        // Add label directly to the status bar group
        this.statusBarGroup.add(textMesh);
        
        // Store references to armor and shield labels for visibility control
        if (text === "Armor") {
            this.armorLabel = textMesh;
            this.armorLabel.visible = false; // Initially hidden
        } else if (text === "Shield") {
            this.shieldLabel = textMesh;
            this.shieldLabel.visible = false; // Initially hidden
        }
    }

    updateStatusLabelVisibility() {
        // Show/hide the armor label based on whether the tank has armor
        if (this.armorLabel) {
            const hasArmor = this.tank.armor > 0;
            this.armorLabel.visible = hasArmor;
        }
        
        // Show/hide the shield label based on whether the tank has shield
        if (this.shieldLabel) {
            const hasShield = this.tank.shield > 0;
            this.shieldLabel.visible = hasShield;
        }
    }
    
    createHealthBar(yOffset) {
        // Create the health indicator (green part)
        const healthGeometry = new THREE.CylinderGeometry(
            this.statusBarConfig.height / 2,
            this.statusBarConfig.height / 2, 
            this.statusBarConfig.width,
            12,
            1,
            false
        );
        healthGeometry.rotateZ(Math.PI / 2);
        const healthMaterial = new THREE.MeshStandardMaterial({ 
            color: 0x00ff00,
            roughness: 0.5,
            metalness: 0.0,
            transparent: true,
            depthTest: false,
            depthWrite: false,
        });
        this.healthBarIndicator = new THREE.Mesh(healthGeometry, healthMaterial);
        this.healthBarIndicator.position.y = yOffset;
        
        // Add meshes to the group
        this.statusBarGroup.add(this.healthBarIndicator);
    }
    
    createArmorBar(yOffset) {
        // Create the armor indicator
        const armorGeometry = new THREE.CylinderGeometry(
            this.statusBarConfig.height / 2,
            this.statusBarConfig.height / 2, 
            this.statusBarConfig.width,
            16,
            1,
            false
        );
        armorGeometry.rotateZ(Math.PI / 2);
        const armorMaterial = new THREE.MeshStandardMaterial({ 
            color: 0x006400,
            roughness: 0.5,
            metalness: 0.2,
            transparent: true,
            depthTest: false,
            depthWrite: false,
        });
        this.armorBarIndicator = new THREE.Mesh(armorGeometry, armorMaterial);
        this.armorBarIndicator.position.y = yOffset;
        this.armorBarIndicator.visible = false; // Initially hidden
        
        // Add meshes to the group
        this.statusBarGroup.add(this.armorBarIndicator);
    }
    
    createShieldBar(yOffset) {
        // Create the shield indicator
        const shieldGeometry = new THREE.CylinderGeometry(
            this.statusBarConfig.height / 2,
            this.statusBarConfig.height / 2, 
            this.statusBarConfig.width,
            16,
            1,
            false
        );
        shieldGeometry.rotateZ(Math.PI / 2);
        const shieldMaterial = new THREE.MeshStandardMaterial({ 
            color: 0x0088ff, // Blue
            roughness: 0.5,
            metalness: 0.2,
            transparent: true,
            depthTest: false,
            depthWrite: false,
        });
        this.shieldBarIndicator = new THREE.Mesh(shieldGeometry, shieldMaterial);
        this.shieldBarIndicator.position.y = yOffset;
        this.shieldBarIndicator.visible = false; // Initially hidden
        
        // Add meshes to the group
        this.statusBarGroup.add(this.shieldBarIndicator);
    }
    
    updateStatusBars() {
        this.updateHealthBar();
        this.updateArmorBar();
        this.updateShieldBar();
    }
    
    updateHealthBar() {
        if (!this.healthBarIndicator) return;
        
        // Calculate health percentage based on visual health
        const healthPercent = this.currentVisualHealth / 100;
        
        // Scale the health bar according to current visual health
        this.healthBarIndicator.scale.x = Math.max(0.01, healthPercent);
        
        // Adjust position so it shrinks from the right side
        this.healthBarIndicator.position.x = (1 - healthPercent) * (-this.statusBarConfig.width / 2);
        
        // Update color based on health percentage
        let color;
        if (healthPercent > 0.75) {
            // Green (75-100%)
            color = 0x00ff00;
        } else if (healthPercent > 0.5) {
            // Yellow (50-75%)
            color = 0xffff00;
        } else if (healthPercent > 0.25) {
            // Orange (25-50%)
            color = 0xff9900;
        } else {
            // Red (0-25%)
            color = 0xff0000;
        }
        
        this.healthBarIndicator.material.color.set(color);
    }
    
    updateArmorBar() {
        if (!this.armorBarIndicator) return;
        
        // Show/hide the armor bar based on whether the tank has armor
        const hasArmor = this.currentVisualArmor > 0;
        this.armorBarIndicator.visible = hasArmor;
        
        // Update armor label visibility
        if (this.armorLabel) {
            this.armorLabel.visible = hasArmor;
        }
        
        if (!hasArmor) return;
        
        // Calculate armor percentage (assuming max armor is 100)
        const armorPercent = Math.min(this.currentVisualArmor / 100, 1.0);
        
        // Scale the armor bar according to current visual armor
        this.armorBarIndicator.scale.x = Math.max(0.01, armorPercent);
        
        // Adjust position so it shrinks from the right side
        this.armorBarIndicator.position.x = (1 - armorPercent) * (-this.statusBarConfig.width / 2);
    }
    
    updateShieldBar() {
        if (!this.shieldBarIndicator) return;
        
        // Show/hide the shield bar based on whether the tank has shield
        const hasShield = this.currentVisualShield > 0;
        this.shieldBarIndicator.visible = hasShield;
        
        // Update shield label visibility
        if (this.shieldLabel) {
            this.shieldLabel.visible = hasShield;
        }
        
        if (!hasShield) return;
        
        // Calculate shield percentage (assuming max shield is 100)
        const shieldPercent = Math.min(this.currentVisualShield / 100, 1.0);
        
        // Scale the shield bar according to current visual shield
        this.shieldBarIndicator.scale.x = Math.max(0.01, shieldPercent);
        
        // Adjust position so it shrinks from the right side
        this.shieldBarIndicator.position.x = (1 - shieldPercent) * (-this.statusBarConfig.width / 2);
    }

    // Update visual values for smooth transitions
    updateVisualValues(deltaTime) {
        // Calculate the max change per frame based on deltaTime
        const maxChange = this.statusBarConfig.lerpRate * deltaTime;
        
        // Lerp health
        const healthDiff = this.tank.health - this.currentVisualHealth;
        if (Math.abs(healthDiff) > 0.01) {
            this.currentVisualHealth += Math.sign(healthDiff) * Math.min(maxChange, Math.abs(healthDiff));
            this.updateHealthBar();
        }
        
        // Lerp armor
        const armorDiff = this.tank.armor - this.currentVisualArmor;
        if (Math.abs(armorDiff) > 0.01) {
            this.currentVisualArmor += Math.sign(armorDiff) * Math.min(maxChange, Math.abs(armorDiff));
            this.updateArmorBar();
        }
        
        // Lerp shield
        const shieldDiff = this.tank.shield - this.currentVisualShield;
        if (Math.abs(shieldDiff) > 0.01) {
            this.currentVisualShield += Math.sign(shieldDiff) * Math.min(maxChange, Math.abs(shieldDiff));
            this.updateShieldBar();
        }
    }

    // Update UI elements when the camera changes
    updateUIForCamera(camera) {
        // Update name tag to face camera
        if (this.nameTag) {
            this.nameTag.lookAt(camera.position);
            const nameTagPosition = new THREE.Vector3();
            this.nameTag.getWorldPosition(nameTagPosition);
            const distanceToCamera = nameTagPosition.distanceTo(camera.position);
            const baseScale = 3.0;
            const scaleFactor = baseScale * (distanceToCamera / 400);
            
            // Apply the scale to the nameTag
            this.nameTag.scale.set(scaleFactor, scaleFactor, scaleFactor);
        }
        
        // Make status bars and labels face the camera, but only rotate on Y axis
        if (this.statusBarGroup) {
            // Get camera position in world space
            const cameraPosition = camera.position.clone();
            
            // Get the status bar's world position
            const statusBarPosition = new THREE.Vector3();
            this.statusBarGroup.getWorldPosition(statusBarPosition);
            
            // Create a vector pointing from status bar to camera (only on XZ plane)
            const direction = new THREE.Vector3(
                cameraPosition.x - statusBarPosition.x,
                0, // Ignore Y component to only rotate on Y axis
                cameraPosition.z - statusBarPosition.z
            ).normalize();
            
            // Set the status bar's rotation to face this direction
            this.statusBarGroup.rotation.set(0, Math.atan2(direction.x, direction.z), 0);
        }
    }

    toggleTank3dElementsVisibility(isVisible = true) {
        // Toggle the name tag if it exists
        if (this.nameTag) {
            this.nameTag.visible = isVisible;
        }
        
        // Toggle the status bar group if it exists
        if (this.statusBarGroup) {
            this.statusBarGroup.visible = isVisible;
        }
        
        // Toggle individual status labels if they exist
        if (this.armorLabel) {
            this.armorLabel.visible = isVisible && this.tank.armor > 0;
        }
        
        if (this.shieldLabel) {
            this.shieldLabel.visible = isVisible && this.tank.shield > 0;
        }
    }
        

    // Reset UI for a new round
    resetForNewRound() {
        if (!this.nameTag) {
            this.createNameTag();
        } else {
            this.nameTag.visible = true;
        }
        
        if (this.statusBarGroup) {
            this.statusBarGroup.visible = true;
        }
        
        this.currentVisualHealth = 100;
        this.currentVisualArmor = 0;
        this.currentVisualShield = 0;
        
        this.updateStatusBars();
    }

    // Clean up resources
    dispose() {
        if (this.nameTag) {
            this.tank.tankGroup.remove(this.nameTag);
            this.nameTag.geometry.dispose();
            this.nameTag.material.dispose();
            this.nameTag = null;
        }
        
        if (this.statusBarGroup) {
            this.tank.tankGroup.remove(this.statusBarGroup);
            if (this.healthBarIndicator) {
                this.healthBarIndicator.geometry.dispose();
                this.healthBarIndicator.material.dispose();
            }
            if (this.armorBarIndicator) {
                this.armorBarIndicator.geometry.dispose();
                this.armorBarIndicator.material.dispose();
            }
            if (this.shieldBarIndicator) {
                this.shieldBarIndicator.geometry.dispose();
                this.shieldBarIndicator.material.dispose();
            }
            this.statusBarGroup = null;
        }
    }
}