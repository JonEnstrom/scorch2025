import * as THREE from 'three';
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';

export class DamageNumberManager {
  constructor(scene, cameraManager) {
    this.scene = scene;
    this.cameraManager = cameraManager;
    this.damageNumbers = [];

    // Load the default font (same as in Tank.js)
    this.fontLoader = new FontLoader();
    this.font = null;
    this.loadFont();
  }

  loadFont() {
    // Adjust the path as needed.
    this.fontLoader.load(
      '/fonts/helvetiker_bold.typeface.json',
      (font) => {
        this.font = font;
      },
      undefined,
      (error) => {
        console.error('Error loading font:', error);
      }
    );
  }

  /**
   * Creates a 3D damage number at the given position.
   * @param {number} damage - The damage value to display.
   * @param {THREE.Vector3} position - World position for the text.
   * @param {Object} options - Custom options.
   * @param {number} [options.initialVelocity=50] - The initial speed of the text.
   * @param {number} [options.drag=0.995] - The drag factor for the velocity.
   * @param {number} [options.lifetime=15.0] - How long (in seconds) the text is visible.
   * @param {THREE.Camera} [options.camera=this.cameraManager.camera] - The camera to face.
   * @param {number} [options.fontSize=10] - The size of the text (world units).
   * @param {number} [options.depth=0.5] - The thickness (depth) of the text.
   * @param {number} [options.curveSegments=12] - Number of segments for curves.
   * @param {string|number} [options.fontColor=null] - Color of the text; if null, a random red is used.
   */
  createDamageNumber(damage, position, options = {}) {
    const {
      initialVelocity = 5,
      drag = 0.995,
      lifetime = 15.0,
      fontSize = 1.5,
      depth: depth = 0.5,
      curveSegments = 12,
      fontColor = null,
    } = options;

    // Ensure the font has been loaded.
    if (!this.font) {
      console.warn('Font not loaded yet. Damage number not created.');
      return;
    }

    const damageStr = damage.toString();

    // Create the text geometry using the loaded font.
    const textGeometry = new TextGeometry(damageStr, {
      font: this.font,
      size: fontSize,
      depth: depth,
      curveSegments: curveSegments,
      bevelEnabled: true,
      bevelSegments: 1,
      bevelThickness: 0.1,
      bevelSize: 0.1
    });

    // Center the geometry.
    textGeometry.computeBoundingBox();
    if (textGeometry.boundingBox) {
      const offsetX = -0.5 * (textGeometry.boundingBox.max.x - textGeometry.boundingBox.min.x);
      const offsetY = -0.5 * (textGeometry.boundingBox.max.y - textGeometry.boundingBox.min.y);
      textGeometry.translate(offsetX, offsetY, 0);
    }

    // Determine the material color.
    let materialColor;
    if (fontColor) {
      materialColor = new THREE.Color(fontColor);
    } else {
      // Generate a random shade of red.
      const g = Math.random() * 0.2;
      const b = Math.random() * 0.2;
      materialColor = new THREE.Color(1, g, b);
    }

    const textMaterial = new THREE.MeshStandardMaterial({
      color: materialColor,
      depthTest: false,
      depthWrite: false,
      transparent: true,
    });
    
    // Create the mesh.
    const textMesh = new THREE.Mesh(textGeometry, textMaterial);
    textMesh.position.copy(position);
    // Apply a vertical offset so the damage number appears above the impact point.
    textMesh.position.y += 4;

    // Generate a random angle between -45 and 45 degrees for initial velocity.
    const angleInRadians = THREE.MathUtils.degToRad(THREE.MathUtils.randFloat(-45, 45));
    const velocityX = Math.sin(angleInRadians) * initialVelocity;
    const velocityY = Math.cos(angleInRadians) * initialVelocity;

    // Add the text mesh to the scene.
    this.scene.add(textMesh);

    // Save the damage number info.
    this.damageNumbers.push({
      mesh: textMesh,
      velocity: new THREE.Vector2(velocityX, velocityY),
      drag,
      lifetime,
      age: 0,
    });

    return textMesh;
  }

  /**
   * Updates all active damage numbers.
   * Should be called on every frame.
   * @param {number} delta - Time elapsed since the last update (in seconds).
   */
  update(delta) {
    const camera = this.cameraManager.camera;
    for (let i = this.damageNumbers.length - 1; i >= 0; i--) {
      const dn = this.damageNumbers[i];
      dn.age += delta;

      // Update position based on velocity.
      dn.mesh.position.x += dn.velocity.x * delta;
      dn.mesh.position.y += dn.velocity.y * delta;

      // Apply drag to the velocity.
      dn.velocity.multiplyScalar(dn.drag);

      // Fade out the text over time.
      const alpha = 1 - dn.age / dn.lifetime;
      dn.mesh.material.opacity = Math.max(alpha, 0);

      // Always face the camera.
      dn.mesh.lookAt(camera.position);

      // Remove the mesh if its lifetime has expired.
      if (dn.age >= dn.lifetime) {
        this.scene.remove(dn.mesh);
        dn.mesh.geometry.dispose();
        dn.mesh.material.dispose();
        this.damageNumbers.splice(i, 1);
      }
    }
  }

  /**
   * Dispose all active damage numbers to clean up memory.
   */
  dispose() {
    for (const dn of this.damageNumbers) {
      this.scene.remove(dn.mesh);
      dn.mesh.geometry.dispose();
      dn.mesh.material.dispose();
    }
    this.damageNumbers = [];
  }
}
