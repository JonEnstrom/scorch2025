// server/TerrainGenerator.js
import { createNoise2D } from 'simplex-noise';

const DEFAULT_YIELD_INTERVAL = 2;         // For row-based loops
const DEFAULT_DROPLET_YIELD_INTERVAL = 100; // For droplet iterations in hydraulic erosion

export default class TerrainGenerator {
  constructor(options = {}) {
    this.width = options.width || 2400;
    this.depth = options.depth || 2400;
    this.segments = options.segments || 250;
    this.seed = options.seed || Math.floor(Math.random() * 10000);
    this.theme = options.theme || 'grassland';

    this.yieldInterval = options.yieldInterval || DEFAULT_YIELD_INTERVAL;
    this.dropletYieldInterval = options.dropletYieldInterval || DEFAULT_DROPLET_YIELD_INTERVAL;

    // Allocate height data
    this.heightData = new Float32Array((this.segments + 1) * (this.segments + 1));
    
    // Create a seeded random number generator
    const aleaGen = new Alea(this.seed.toString());
    
    // Initialize noise generators with different seeds for variety
    this.baseNoise = createNoise2D(() => aleaGen.next());
    this.detailNoise = createNoise2D(() => aleaGen.next());
    this.ridgeNoise = createNoise2D(() => aleaGen.next());

    // Terrain configuration
    this.config = {
      base: {
        scale: 0.001,
        amplitude: 200,
        octaves: 6,
        persistence: 0.5,
        ridgeThreshold: 0.7
      },
      detail: {
        scale: 0.002,
        amplitude: 50,
        octaves: 4,
        persistence: 0.6
      },
      mountains: {
        scale: 0.001,
        amplitude: 400,
        octaves: 4,
        persistence: 0.5,
        rangeWidth: 0.25
      },
      erosion: {
        iterations: 15,
        dropletCount: 100000,
        erosionStrength: 0.5,
        depositionStrength: 0.9
      }
    };
  }

  async generate() {
    await this.generateBaseLayer();
    await this.addMountainRanges();
    await this.addDetailLayer();
    await this.applyThermalErosion();
    await this.applyHydraulicErosion();
    await this.smoothVertices();
    return this.getTerrainData();
  }

  async generateBaseLayer() {
    const { scale, amplitude, octaves, persistence, ridgeThreshold } = this.config.base;
    for (let z = 0; z <= this.segments; z++) {
      for (let x = 0; x <= this.segments; x++) {
        const xPos = this.gridToWorld(x, 'x');
        const zPos = this.gridToWorld(z, 'z');
        let height = this.improvedFractalNoise(
          xPos * scale,
          zPos * scale,
          octaves,
          persistence,
          this.baseNoise
        ) * amplitude;

        // Apply ridge formation for sharper features
        if (height > ridgeThreshold * amplitude) {
          const ridgeFactor = (height - ridgeThreshold * amplitude) / amplitude;
          height += this.getRidgeNoise(xPos, zPos) * ridgeFactor * amplitude * 0.5;
        }
        this.setHeight(x, z, height);
      }
      // Yield every yieldInterval rows to avoid blocking
      if (z % this.yieldInterval === 0) {
        await new Promise(resolve => setImmediate(resolve));
      }
    }
  }

  async addMountainRanges() {
    const { scale, amplitude, octaves, persistence, rangeWidth } = this.config.mountains;
    const mountainRangeHalfWidth = this.depth * rangeWidth;
    for (let z = 0; z <= this.segments; z++) {
      for (let x = 0; x <= this.segments; x++) {
        const xPos = this.gridToWorld(x, 'x');
        const zPos = this.gridToWorld(z, 'z');
        const distFromCenter = Math.abs(zPos);
        const mountainInfluence = this.smoothStep(
          mountainRangeHalfWidth,
          0,
          distFromCenter
        );
        const mountainHeight = this.getRidgeNoise(
          xPos * scale,
          zPos * scale,
          octaves,
          persistence
        ) * amplitude;
        const currentHeight = this.getHeight(x, z);
        const newHeight = currentHeight + (mountainHeight * mountainInfluence);
        this.setHeight(x, z, newHeight);
      }
      if (z % this.yieldInterval === 0) {
        await new Promise(resolve => setImmediate(resolve));
      }
    }
  }

  async addDetailLayer() {
    const { scale, amplitude, octaves, persistence } = this.config.detail;
    for (let z = 0; z <= this.segments; z++) {
      for (let x = 0; x <= this.segments; x++) {
        const xPos = this.gridToWorld(x, 'x');
        const zPos = this.gridToWorld(z, 'z');
        const detailValue = this.improvedFractalNoise(
          xPos * scale,
          zPos * scale,
          octaves,
          persistence,
          this.detailNoise
        );
        const currentHeight = this.getHeight(x, z);
        const detailHeight = detailValue * amplitude;
        this.setHeight(x, z, currentHeight + detailHeight);
      }
      if (z % this.yieldInterval === 0) {
        await new Promise(resolve => setImmediate(resolve));
      }
    }
  }

  async applyThermalErosion() {
    const talus = 0.05;
    const iterations = 3;
    for (let iter = 0; iter < iterations; iter++) {
      for (let z = 1; z < this.segments; z++) {
        for (let x = 1; x < this.segments; x++) {
          const height = this.getHeight(x, z);
          const neighbors = [
            this.getHeight(x - 1, z),
            this.getHeight(x + 1, z),
            this.getHeight(x, z - 1),
            this.getHeight(x, z + 1)
          ];
          for (const neighborHeight of neighbors) {
            const heightDiff = height - neighborHeight;
            if (heightDiff > talus) {
              const transfer = (heightDiff - talus) * 0.5;
              this.setHeight(x, z, height - transfer);
            }
          }
        }
        if (z % this.yieldInterval === 0) {
          await new Promise(resolve => setImmediate(resolve));
        }
      }
    }
  }

  async applyHydraulicErosion() {
    const { dropletCount, erosionStrength, depositionStrength } = this.config.erosion;
    for (let i = 0; i < dropletCount; i++) {
      let x = Math.random() * this.segments;
      let z = Math.random() * this.segments;
      let water = 1.0;
      let sediment = 0.0;
      const maxSteps = 64;
      for (let step = 0; step < maxSteps; step++) {
        const height = this.getHeightAtPosition(
          this.gridToWorld(x, 'x'),
          this.gridToWorld(z, 'z')
        );
        const gradX = this.getHeightAtPosition(
          this.gridToWorld(x + 1, 'x'),
          this.gridToWorld(z, 'z')
        ) - height;
        const gradZ = this.getHeightAtPosition(
          this.gridToWorld(x, 'x'),
          this.gridToWorld(z + 1, 'z')
        ) - height;
        x += gradX;
        z += gradZ;
        if (x < 0 || x >= this.segments || z < 0 || z >= this.segments) {
          break;
        }
        const newHeight = this.getHeightAtPosition(
          this.gridToWorld(x, 'x'),
          this.gridToWorld(z, 'z')
        );
        const heightDiff = newHeight - height;
        if (heightDiff > 0) {
          const deposit = Math.min(sediment, heightDiff) * depositionStrength;
          sediment -= deposit;
          this.setHeight(Math.floor(x), Math.floor(z), newHeight + deposit);
        } else {
          const erosion = Math.min(-heightDiff * erosionStrength, 0.1);
          sediment += erosion;
          this.setHeight(Math.floor(x), Math.floor(z), newHeight - erosion);
        }
        water *= 0.99;
        if (water < 0.01) break;
      }
      // Yield every dropletYieldInterval iterations
      if (i % this.dropletYieldInterval === 0) {
        await new Promise(resolve => setImmediate(resolve));
      }
    }
  }

  async smoothVertices() {
    const threshold = 3;
    const smoothingFactor = 0.7;
    const originalHeights = new Float32Array(this.heightData);
    for (let z = 1; z < this.segments; z++) {
      for (let x = 1; x < this.segments; x++) {
        const currentHeight = originalHeights[z * (this.segments + 1) + x];
        const neighbors = [
          originalHeights[(z - 1) * (this.segments + 1) + x],
          originalHeights[(z + 1) * (this.segments + 1) + x],
          originalHeights[z * (this.segments + 1) + (x - 1)],
          originalHeights[z * (this.segments + 1) + (x + 1)]
        ];
        const avgNeighborHeight = neighbors.reduce((sum, h) => sum + h, 0) / neighbors.length;
        if (Math.abs(currentHeight - avgNeighborHeight) > threshold) {
          const newHeight = currentHeight + (avgNeighborHeight - currentHeight) * smoothingFactor;
          this.setHeight(x, z, newHeight);
        }
      }
      if (z % this.yieldInterval === 0) {
        await new Promise(resolve => setImmediate(resolve));
      }
    }
  }

  improvedFractalNoise(x, y, octaves, persistence, noiseGen) {
    let total = 0;
    let frequency = 1.0;
    let amplitude = 1.0;
    let maxValue = 0;
    for (let i = 0; i < octaves; i++) {
      total += noiseGen(x * frequency, y * frequency) * amplitude;
      maxValue += amplitude;
      amplitude *= persistence;
      frequency *= 2.0;
    }
    return total / maxValue;
  }

  getRidgeNoise(x, y, octaves = 4, persistence = 0.5) {
    let noise = this.improvedFractalNoise(x, y, octaves, persistence, this.ridgeNoise);
    noise = Math.abs(noise);
    noise = 1.0 - noise;
    return noise * noise;
  }

  gridToWorld(gridCoord, axis) {
    const size = axis === 'x' ? this.width : this.depth;
    return (gridCoord / this.segments) * size - size / 2;
  }

  worldToGrid(worldCoord, axis) {
    const size = axis === 'x' ? this.width : this.depth;
    return ((worldCoord + size / 2) / size) * this.segments;
  }

  smoothStep(edge0, edge1, x) {
    let t = (edge0 - x) / (edge0 - edge1);
    t = Math.max(0, Math.min(1, t));
    return t * t * (3 - 2 * t);
  }

  modifyTerrain(centerX, centerZ, radius, operation = 'flatten') {
    const patch = [];
    const startHeight = this.getHeightAtPosition(centerX, centerZ);
    for (let z = 0; z <= this.segments; z++) {
      for (let x = 0; x <= this.segments; x++) {
        const xPos = this.gridToWorld(x, 'x');
        const zPos = this.gridToWorld(z, 'z');
        const distance = Math.sqrt((xPos - centerX) ** 2 + (zPos - centerZ) ** 2);
        if (distance > radius) continue;
        const currentHeight = this.getHeight(x, z);
        let newHeight = currentHeight;
        switch (operation) {
          case 'flatten': {
            const t = Math.max(0, Math.min(1, distance / radius));
            const blend = t * t * (3 - 2 * t);
            newHeight = startHeight * (1 - blend) + currentHeight * blend;
            break;
          }
          case 'crater': {
            const blendFactor =
              distance > radius * 0.5
                ? 1.0 - (distance - radius * 0.5) / (radius * 0.5)
                : 1.0;
            const craterDepth = 40 * blendFactor;
            newHeight =
              currentHeight -
              (distance <= radius * 0.5 ? craterDepth : craterDepth * blendFactor);
            break;
          }
        }
        if (Math.abs(newHeight - currentHeight) > 0.001) {
          this.setHeight(x, z, newHeight);
          const gridIndex = z * (this.segments + 1) + x;
          patch.push({
            index: gridIndex,
            height: newHeight
          });
        }
      }
    }
    return patch;
  }

  getTerrainData() {
    return {
      heightData: Array.from(this.heightData),
      width: this.width,
      depth: this.depth,
      segments: this.segments,
      theme: this.theme
    };
  }

  setHeight(x, z, height) {
    const index = z * (this.segments + 1) + x;
    this.heightData[index] = height;
  }

  getHeight(x, z) {
    const index = z * (this.segments + 1) + x;
    return this.heightData[index];
  }

  getHeightAtPosition(x, z) {
    // Clamp world coordinates to terrain bounds
    x = Math.max(-this.width / 2, Math.min(this.width / 2, x));
    z = Math.max(-this.depth / 2, Math.min(this.depth / 2, z));
    const gridX = this.worldToGrid(x, 'x');
    const gridZ = this.worldToGrid(z, 'z');
    const x1 = Math.floor(gridX);
    const x2 = Math.min(x1 + 1, this.segments);
    const z1 = Math.floor(gridZ);
    const z2 = Math.min(z1 + 1, this.segments);
    const fx = gridX - x1;
    const fz = gridZ - z1;
    const h11 = this.getHeight(x1, z1);
    const h21 = this.getHeight(x2, z1);
    const h12 = this.getHeight(x1, z2);
    const h22 = this.getHeight(x2, z2);
    const h1 = h11 * (1 - fx) + h21 * fx;
    const h2 = h12 * (1 - fx) + h22 * fx;
    return h1 * (1 - fz) + h2 * fz;
  }
}

// Alea random number generator
class Alea {
  constructor(seed) {
    this.s0 = 0;
    this.s1 = 0;
    this.s2 = 0;
    this.c = 1;

    if (seed === undefined) {
      seed = +new Date();
    }

    let mash = Mash();

    this.s0 = mash(' ');
    this.s1 = mash(' ');
    this.s2 = mash(' ');

    this.s0 -= mash(seed);
    if (this.s0 < 0) {
      this.s0 += 1;
    }
    this.s1 -= mash(seed);
    if (this.s1 < 0) {
      this.s1 += 1;
    }
    this.s2 -= mash(seed);
    if (this.s2 < 0) {
      this.s2 += 1;
    }
  }

  next() {
    const t = 2091639 * this.s0 + this.c * 2.3283064365386963e-10;
    this.s0 = this.s1;
    this.s1 = this.s2;
    return this.s2 = t - (this.c = t | 0);
  }
}

function Mash() {
  let n = 0xefc8249d;
  return function(data) {
    const str = data.toString();
    for (let i = 0; i < str.length; i++) {
      n += str.charCodeAt(i);
      let h = 0.02519603282416938 * n;
      n = h >>> 0;
      h -= n;
      h *= n;
      n = h >>> 0;
      h -= n;
      n += h * 0x100000000;
    }
    return (n >>> 0) * 2.3283064365386963e-10;
  };
}
