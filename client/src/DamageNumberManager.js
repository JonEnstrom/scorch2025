import * as THREE from 'three';

export class DamageNumberManager {
  constructor(scene, cameraManager, digitsTextureURL) {
    this.scene = scene;
    this.cameraManager = cameraManager;
    this.digitsTexture = null;
    this.digitMaterials = [];
    this.damageNumbers = [];

    this._loadTexture(digitsTextureURL);
  }

  _loadTexture(url) {
    const loader = new THREE.TextureLoader();
    loader.load(url, (texture) => {
      this.digitsTexture = texture;
      this.digitsTexture.wrapS = THREE.ClampToEdgeWrapping;
      this.digitsTexture.wrapT = THREE.ClampToEdgeWrapping;
      this.digitsTexture.minFilter = THREE.LinearFilter;
      this.digitsTexture.magFilter = THREE.LinearFilter;
      this._createDigitMaterials();
    });
  }

  _createDigitMaterials() {
    for (let i = 0; i < 10; i++) {
      const digitTexture = this.digitsTexture.clone();
      digitTexture.repeat.set(0.1, 1);
      digitTexture.offset.set(i * 0.1, 0);
      
      const digitMaterial = new THREE.SpriteMaterial({
        map: digitTexture,
        transparent: true
      });

      this.digitMaterials.push(digitMaterial);
    }
  }

  createDamageNumber(damage, position, options = {}) {
    if (!this.digitMaterials.length) {
      console.warn('Digits texture/material not loaded yet.');
      return;
    }

    const {
      initialVelocity = 50,
      drag = 0.995,
      lifetime = 15.0,
      camera = this.cameraManager.camera 
    } = options;

    const group = new THREE.Group();
    
    // Generate random shade of red
    const redShade = THREE.MathUtils.randFloat(1.0, 3.0);
    const color = new THREE.Color(redShade, 0, 0);
    
    // Get camera right vector for proper horizontal offset
    const cameraRight = new THREE.Vector3();
    camera.getWorldDirection(cameraRight);
    cameraRight.cross(camera.up).normalize();

    // Create each digit
    let offsetX = 0;
    for (let i = 0; i < damage.toString().length; i++) {
      const digitIndex = parseInt(damage.toString()[i], 10);
      const material = this.digitMaterials[digitIndex].clone();
      material.color = color;
      const sprite = new THREE.Sprite(material);
      
      const offset = cameraRight.clone().multiplyScalar(offsetX);
      sprite.position.add(offset);
      
      sprite.scale.set(25, 25, 25);
      group.add(sprite);
      offsetX += 7;
    }

    // Generate random angle between -45 and 45 degrees
    const angleInRadians = THREE.MathUtils.degToRad(THREE.MathUtils.randFloat(-45, 45));
    
    // Calculate velocity components
    const velocityX = Math.sin(angleInRadians) * initialVelocity;
    const velocityY = Math.cos(angleInRadians) * initialVelocity;

    group.position.copy(position);
    group.position.y += 40;
    this.scene.add(group);

    this.damageNumbers.push({
      group,
      velocity: new THREE.Vector2(velocityX, velocityY),
      drag,
      lifetime,
      age: 0
    });
  }

  update(delta) {
    for (let i = this.damageNumbers.length - 1; i >= 0; i--) {
      const dn = this.damageNumbers[i];
      dn.age += delta;

      // Apply velocity to position
      dn.group.position.x += dn.velocity.x * delta;
      dn.group.position.y += dn.velocity.y * delta;

      // Apply drag to both velocity components
      dn.velocity.multiplyScalar(dn.drag);

      // Fade out over time
      const alpha = 1 - (dn.age / dn.lifetime);
      dn.group.traverse((child) => {
        if (child instanceof THREE.Sprite) {
          child.material.opacity = Math.max(alpha, 0);
        }
      });

      if (dn.age >= dn.lifetime) {
        this.scene.remove(dn.group);
        this.damageNumbers.splice(i, 1);
      }
    }
  }
}
