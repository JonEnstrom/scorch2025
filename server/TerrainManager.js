// server/TerrainManager.js
import TerrainGenerator from './TerrainGenerator.js';

/**
 * Configuration for different themes and height-based foliage spawning.
 */
const FOLIAGE_CONFIG = {
  grassland: [
    {
      minHeight: Number.NEGATIVE_INFINITY,
      maxHeight: -5, // Below water level
      foliageIds: ['grasslands_plant_1']
    },
    {
      minHeight: -5,
      maxHeight: 150,
      foliageIds: ['grasslands_plant_2']
    },
    {
      minHeight: 150,
      maxHeight: Number.POSITIVE_INFINITY,
      foliageIds: ['grasslands_plant_3']
    }
  ],
  desert: [
    {
      minHeight: Number.NEGATIVE_INFINITY,
      maxHeight: 40,
      foliageIds: ['desert_cactus']
    },
    {
      minHeight: 60,
      maxHeight: 150,
      foliageIds: ['desert_cactus2']
    },
    {
      minHeight: 200,
      maxHeight: Number.POSITIVE_INFINITY,
      foliageIds: ['desert_plant_1']
    }
  ],
  arctic: [
    {
      minHeight: Number.NEGATIVE_INFINITY,
      maxHeight: 50,
      foliageIds: []
    },
    {
      minHeight: 50,
      maxHeight: 300,
      foliageIds: ['snowy_stump']
    },
    {
      minHeight: 300,
      maxHeight: Number.POSITIVE_INFINITY,
      foliageIds: []
    }
  ],
};

/**
 * Configuration for foliage scales.
 */
const FOLIAGE_SCALE_CONFIG = {
  grasslands_plant_1: { minScale: 0.5, maxScale: 1.0 },
  grasslands_plant_2: { minScale: 0.4, maxScale: 1.0 },
  grasslands_plant_3: { minScale: 0.2, maxScale: 0.6 },
  desert_cactus: { minScale: 0.5, maxScale: 1.5 },
  desert_cactus2: { minScale: 0.5, maxScale: 1.0 },
  desert_plant_1: { minScale: 0.5, maxScale: 1.5 },
  snowy_stump: { minScale: 0.5, maxScale: 1.0 }
};

export default class TerrainManager {
  constructor(options = {}, isPreGame = false) {
    this.generator = new TerrainGenerator(options);
    this.theme = options.theme || 'grassland';
    // If not in pre-game, terrainData and foliage will be generated asynchronously.
    if (isPreGame) return;
  }

  /**
   * Retrieves the interpolated height at a given (x, z) world position.
   */
  getHeightAtPosition(x, z) {
    const gridX = ((x + this.terrainData.width / 2) / this.terrainData.width) * this.terrainData.segments;
    const gridZ = ((z + this.terrainData.depth / 2) / this.terrainData.depth) * this.terrainData.segments;
    const x1 = Math.floor(gridX);
    const z1 = Math.floor(gridZ);
    const x2 = Math.min(x1 + 1, this.terrainData.segments);
    const z2 = Math.min(z1 + 1, this.terrainData.segments);
    const h11 = this.getHeightFromData(x1, z1);
    const h21 = this.getHeightFromData(x2, z1);
    const h12 = this.getHeightFromData(x1, z2);
    const h22 = this.getHeightFromData(x2, z2);
    const fx = gridX - x1;
    const fz = gridZ - z1;
    const h1 = h11 * (1 - fx) + h21 * fx;
    const h2 = h12 * (1 - fx) + h22 * fx;
    return h1 * (1 - fz) + h2 * fz;
  }

  getHeightFromData(x, z) {
    const index = z * (this.terrainData.segments + 1) + x;
    return this.terrainData.heightData[index] || 0;
  }

  modifyTerrain(x, z, radius, operation = 'crater') {
    const patch = this.generator.modifyTerrain(x, z, radius, operation);
    this.terrainData = this.generator.getTerrainData();
    return patch;
  }

  getTerrainData() {
    return this.terrainData;
  }

  isValidSpawnLocation(x, z, radius) {
    const centerHeight = this.getHeightAtPosition(x, z);
    const checkPoints = 8;
    for (let i = 0; i < checkPoints; i++) {
      const angle = (i / checkPoints) * Math.PI * 2;
      const checkX = x + Math.cos(angle) * radius;
      const checkZ = z + Math.sin(angle) * radius;
      const height = this.getHeightAtPosition(checkX, checkZ);
      if (Math.abs(height - centerHeight) > 5) return false;
      if (Math.abs(height) > 400) return false;
    }
    return true;
  }

  makeFoliageSpawnPoints({
    theme = 'grassland',
    maxSpots = 500,
    minDistance = 20,
    gridSize = 1,
    width = 2400,
    depth = 2400,
    slopeThreshold = 2,
    maxAttemptsMultiplier = 4
  } = {}) {
    const spots = [];
    const attempts = maxSpots * maxAttemptsMultiplier;
    const startX = -width / 2;
    const startZ = -depth / 2;
    const positions = [];
    for (let x = 0; x < width; x += gridSize) {
      for (let z = 0; z < depth; z += gridSize) {
        positions.push({ x: startX + x, z: startZ + z });
      }
    }
    // Shuffle positions using Fisher-Yates
    for (let i = positions.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [positions[i], positions[j]] = [positions[j], positions[i]];
    }
    let attemptCount = 0;
    for (const pos of positions) {
      if (spots.length >= maxSpots || attemptCount >= attempts) break;
      attemptCount++;
      if (!this.isValidSpawnLocation(pos.x, pos.z, 10)) continue;
      if (!this.isTerrainFlat(pos.x, pos.z, slopeThreshold)) continue;
      let tooClose = false;
      for (const spot of spots) {
        const dx = pos.x - spot.x;
        const dz = pos.z - spot.z;
        if (Math.sqrt(dx * dx + dz * dz) < minDistance) {
          tooClose = true;
          break;
        }
      }
      if (tooClose) continue;
      const y = this.getHeightAtPosition(pos.x, pos.z);
      const foliageId = this.pickFoliageIdForTheme(theme, y);
      let scale = 1.0;
      if (foliageId && FOLIAGE_SCALE_CONFIG[foliageId]) {
        const { minScale, maxScale } = FOLIAGE_SCALE_CONFIG[foliageId];
        scale = minScale + Math.random() * (maxScale - minScale);
      }
      if (foliageId) {
        spots.push({
          x: pos.x,
          y,
          z: pos.z,
          foliageId,
          scale
        });
      }
    }
    return spots;
  }

  isTerrainFlat(x, z, slopeThreshold) {
    const step = 1;
    const centerHeight = this.getHeightAtPosition(x, z);
    const northHeight = this.getHeightAtPosition(x, z + step);
    const southHeight = this.getHeightAtPosition(x, z - step);
    const eastHeight  = this.getHeightAtPosition(x + step, z);
    const westHeight  = this.getHeightAtPosition(x - step, z);
    const maxDifference = Math.max(
      Math.abs(centerHeight - northHeight),
      Math.abs(centerHeight - southHeight),
      Math.abs(centerHeight - eastHeight),
      Math.abs(centerHeight - westHeight)
    );
    return maxDifference <= slopeThreshold;
  }

  pickFoliageIdForTheme(theme, y) {
    const config = FOLIAGE_CONFIG[theme];
    if (!config) {
      console.warn(`Theme "${theme}" not found in foliage config!`);
      return null;
    }
    const tier = config.find(t => y >= t.minHeight && y < t.maxHeight);
    if (!tier || tier.foliageIds.length === 0) return null;
    const foliageIds = tier.foliageIds;
    return foliageIds[Math.floor(Math.random() * foliageIds.length)];
  }

  destroy() {
    if (this.terrainData) {
      this.terrainData.heightData = null;
      this.terrainData = null;
    }
    if (this.generator && this.generator.destroy) {
      this.generator.destroy();
    }
    this.generator = null;
    if (this.foliageSpawnPoints) {
      this.foliageSpawnPoints = null;
    }
  }
}
