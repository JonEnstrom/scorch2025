import * as THREE from 'three';

export class TrailEffect {
  constructor(particleManager) {
    this.particleManager = particleManager;
  }

  /**
   * Create and start a trail. (For trails we use continuous (rate) emission.)
   */
  createTrail(params) {
    const {
      position,
      trailId,
      trailType = 'basic',
      trailSize = 1,
      emitRate = 30,
      texture = './particles/smoke.png'
    } = params;

    // Ensure position is a THREE.Vector3.
    const pos =
      position instanceof THREE.Vector3
        ? position
        : new THREE.Vector3(position.x, position.y, position.z);

    switch (trailType) {
      case 'missile':
        this._createMissileTrail(pos, trailId, trailSize, emitRate);
        break;
      case 'smoke':
        this._createSmokeTrail(pos, trailId, trailSize, emitRate);
        break;
      case 'fire':
        this._createFireTrail(pos, trailId, trailSize, emitRate);
        break;
      case 'basic':
      default:
        this._createBasicTrail(pos, trailId, trailSize, emitRate, texture);
        break;
    }
  }

  _createBasicTrail(position, trailId, scale, emitRate, texture) {
    // Create a basic trail emitter using continuous (rate) emission.
    let config = {
      position: position,
      particleCount: 5000,
      emissionMode: 'rate',
      spawnRate: 20,
      lifeSpan: 5,
      minSpeed: 0,
      maxSpeed: 30,
      drag: 0.95,
      colorKeyframes: [
        { t: 0, value: new THREE.Color(1.0, 1.0, 1.0) },
        { t: 0.4, value: new THREE.Color(0.3, 0.3, 0.3) },
        { t: 1, value: new THREE.Color(0.1, 0.1, 0.1) }
      ],
      scaleKeyframes: [
        { t: 0, value: 20 * scale },
        { t: 0.5, value: 10 * scale }
      ],
      opacityKeyframes: [
        { t: 0, value: 0.05 },
        { t: 0.7, value: 0.01 },
        { t: 1, value: 0 }
      ]
    };

    this._createEmitterAndAutoRemove(trailId, config, texture);

    // Also add a fire-like trail overlay.
    config = {
      position: position,
      particleCount: 15000,
      emissionMode: 'rate',
      spawnRate: 500,
      lifeSpan: 3,
      minSpeed: -10,
      maxSpeed: 10,
      drag: 0.98,
      blending: 'additive',
      colorKeyframes: [
        { t: 0, value: new THREE.Color(1.0, 0.7, 0.3) },
        { t: 0.3, value: new THREE.Color(0.9, 0.5, 0.2) },
        { t: 0.4, value: new THREE.Color(0.6, 0.3, 0.1) },
        { t: 0.45, value: new THREE.Color(0.3, 0.3, 0.3) }
      ],
      scaleKeyframes: [
        { t: 0, value: 10 * scale }
      ],
      opacityKeyframes: [
        { t: 0, value: 0.8 },
        { t: 0.2, value: 0.1 },
        { t: 1, value: 0 }
      ]
    };

    this._createEmitterAndAutoRemove(trailId + 'fire', config, './particles/fire_01.png');
  }

  _createMissileTrail(position, trailId, scale, emitRate) {
    const config = {
      position: position,
      particleCount: 15000,
      emissionMode: 'rate',
      spawnRate: 5000,
      lifeSpan: 10,
      minSpeed: -10,
      maxSpeed: 10,
      drag: 0.98,
      colorKeyframes: [
        { t: 0, value: new THREE.Color(1.0, 0.7, 0.3) },
        { t: 0.3, value: new THREE.Color(0.9, 0.5, 0.2) },
        { t: 0.6, value: new THREE.Color(0.6, 0.3, 0.1) },
        { t: 1, value: new THREE.Color(0.3, 0.3, 0.3) }
      ],
      scaleKeyframes: [
        { t: 0, value: 30 * scale },
        { t: 0.3, value: 60 * scale },
        { t: 1, value: 120 * scale }
      ],
      opacityKeyframes: [
        { t: 0, value: 0.8 },
        { t: 0.5, value: 0.4 },
        { t: 1, value: 0 }
      ]
    };

    this._createEmitterAndAutoRemove(trailId, config, './particles/fire_01.png');
  }

  _createSmokeTrail(position, trailId, scale, emitRate) {
    const config = {
      position: position,
      particleCount: 5000,
      emissionMode: 'rate',
      spawnRate: 1000,
      lifeSpan: 10,
      minSpeed: -10,
      maxSpeed: 10,
      drag: 0.98,
      colorKeyframes: [
        { t: 0, value: new THREE.Color(0.8, 0.8, 0.8) },
        { t: 0.5, value: new THREE.Color(0.6, 0.6, 0.6) },
        { t: 1, value: new THREE.Color(0.3, 0.3, 0.3) }
      ],
      scaleKeyframes: [
        { t: 0, value: 40 * scale },
        { t: 0.5, value: 80 * scale },
        { t: 1, value: 150 * scale }
      ],
      opacityKeyframes: [
        { t: 0, value: 0.4 },
        { t: 0.7, value: 0.2 },
        { t: 1, value: 0 }
      ]
    };

    this._createEmitterAndAutoRemove(trailId, config, './particles/smoke.png');
  }

  _createFireTrail(position, trailId, scale, emitRate) {
    const config = {
      position: position,
      particleCount: 50000,
      emissionMode: 'rate',
      spawnRate: 100,
      lifeSpan: 10,
      minSpeed: -25,
      maxSpeed: 25,
      drag: 0.96,
      blending: 'additive',
      colorKeyframes: [
        { t: 0, value: new THREE.Color(1.0, 0.9, 0.5) },
        { t: 0.3, value: new THREE.Color(1.0, 0.5, 0.0) },
        { t: 0.7, value: new THREE.Color(0.7, 0.2, 0.0) },
        { t: 1, value: new THREE.Color(0.3, 0.1, 0.0) }
      ],
      scaleKeyframes: [
        { t: 0, value: 10 * scale }
      ],
      opacityKeyframes: [
        { t: 0, value: 1.0 },
        { t: 0.5, value: 0.2 },
        { t: 1, value: 0 }
      ]
    };

    this._createEmitterAndAutoRemove(trailId, config, './particles/fire_01.png');
  }

  _createEmitterAndAutoRemove(trailId, config, texturePath) {
    this.particleManager
      .createEmitter(trailId, config, texturePath)
      .then(() => {
        const totalLifetime = config.lifeSpan * 1000;
        if (totalLifetime > 0) {
          setTimeout(() => {
            if (this.particleManager.emitters.has(trailId)) {
              this.particleManager.removeEmitter(trailId);
            }
          }, totalLifetime);
        }
      })
      .catch((err) => {
        console.error(`Failed to create emitter ${trailId}:`, err);
      });
  }

  updatePosition(trailId, position) {
    this.particleManager.updateEmitter(trailId, { position: position });
}

  updateDirection(trailId, direction, scaleFactor = 400) {
    // Ensure direction is a THREE.Vector3.
    const directionVector =
      direction instanceof THREE.Vector3
        ? direction
        : new THREE.Vector3(direction.x, direction.y, direction.z);
    const normalizedDir = directionVector.clone().normalize();
    this.particleManager.updateEmitter(trailId, {
      direction: normalizedDir
    });
  }

  stopTrail(trailId) {
    // Stop emission by setting spawnRate to 0.
    this.particleManager.updateEmitter(trailId, { spawnRate: 0 });
  }

  removeTrail(trailId) {
    this.particleManager.removeEmitter(trailId);
  }
}
