// CurrentPlayerArrow.js
import * as THREE from 'three';

export class CurrentPlayerArrow {
    constructor(scene) {
        this.scene = scene;
        this.currentTarget = null;
        this.arrow = null;
        this.bounceSpeed = 2.5; // Speed of the bouncing animation
        this.bounceHeight = 3.8; // Maximum height of bounce
        this.rotationSpeed = 0.5; // Speed of the rotation
        this.offsetY = 30.0; // Vertical offset above the tank
        
        this.createArrow();
    }
    
    createArrow() {
        // Create a cone for the arrow head
        const geometry = new THREE.ConeGeometry(4, 10, 4);
        
        // Rotate the cone to point downward
        geometry.rotateX(Math.PI);
        
        // Create a material with emissive properties for better visibility
        const material = new THREE.MeshStandardMaterial({
            color: 0x000000, 
            transparent: true,
            opacity: 0.5,
            side: THREE.DoubleSide
        });
        
        // Create the mesh
        this.arrow = new THREE.Mesh(geometry, material);
        
        // Set render order to ensure it renders on top
        this.arrow.renderOrder = 999;
        
        // Scale the arrow
        this.arrow.scale.set(1.2, 1.5, 1.2);
        
        // Add outline to make it more visible
        const edges = new THREE.EdgesGeometry(geometry);
        const line = new THREE.LineSegments(
            edges,
            new THREE.LineBasicMaterial({ 
                color: 0xff0000,
                linewidth: 1 // Note: linewidth > 1 not supported in WebGL
            })
        );
        this.arrow.add(line);
        
        // Add the arrow to the scene
        this.scene.add(this.arrow);
        
        // Initially hide the arrow
        this.arrow.visible = false;
    }
    
    setTarget(target) {
        // Set the current target (tank) to follow
        this.currentTarget = target;
        if (target) {
            this.arrow.visible = true;
            // Initial position update
            this.updatePosition(0);
        } else {
            this.arrow.visible = false;
        }
    }
    
    updatePosition(deltaTime) {
        if (!this.currentTarget || !this.arrow) return;
        
        // Get the world position of the current target
        const targetPosition = new THREE.Vector3();
        this.currentTarget.getWorldPosition(targetPosition);
        
        // Calculate bounce offset using a sine wave
        const time = performance.now() * 0.001; // Convert to seconds
        const bounceOffset = Math.sin(time * this.bounceSpeed) * this.bounceHeight;
        
        // Position the arrow above the target with bouncing effect
        this.arrow.position.set(
            targetPosition.x,
            targetPosition.y + this.offsetY + bounceOffset,
            targetPosition.z
        );
        
        // Rotate the arrow around the Y axis
        this.arrow.rotation.y += this.rotationSpeed * deltaTime;
    }
    
    update(deltaTime) {
        this.updatePosition(deltaTime);
    }
    
    // Method to update the appearance of the arrow (color, etc.)
    updateAppearance(options = {}) {
        if (!this.arrow) return;
        
        const material = this.arrow.material;
        
        if (options.color) {
            material.color.set(options.color);
        }
        
        if (options.emissive) {
            material.emissive.set(options.emissive);
        }
        
        if (typeof options.emissiveIntensity === 'number') {
            material.emissiveIntensity = options.emissiveIntensity;
        }
        
        if (typeof options.opacity === 'number') {
            material.opacity = options.opacity;
        }
        
        if (typeof options.scale === 'number') {
            this.arrow.scale.set(options.scale, options.scale * 1.25, options.scale);
        }
    }
    
    // Clean up resources when no longer needed
    dispose() {
        if (this.arrow) {
            if (this.arrow.geometry) this.arrow.geometry.dispose();
            if (this.arrow.material) this.arrow.material.dispose();
            this.scene.remove(this.arrow);
            this.arrow = null;
        }
    }
}