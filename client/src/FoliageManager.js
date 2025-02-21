import * as THREE from 'three';

export class FoliageManager {
    constructor(sceneManager, scene) {
        this.sceneManager = sceneManager;
        this.scene = scene;
        this.loader = sceneManager.loader;
        this.textureLoader = new THREE.TextureLoader();

        // Cache for loaded models, materials, and textures
        this.modelCache = new Map();
        this.materialCache = new Map();
        this.textureCache = new Map();

        // Shared materials configuration
        this.materials = {
            grasslandMaterial: {
                textures: {
                    color: 'textures/grassland_plants_1_color.jpg',
                    normal: 'textures/grassland_plants_1_normal.jpg',
                    roughness: 'textures/desert_shrub_roughness.jpg',
                    ao: 'textures/desert_shrub_ao.jpg',
                    opacity: 'textures/grassland_plants_1_opacity.jpg',
                    translucency: 'textures/grassland_plants_1_translucency.jpg'
                }
            },
            desertCactus: {
                textures: {
                    color: 'textures/desert/foliage/desert_cactus_color.jpg',
                    normal: 'textures/desert/foliage/desert_cactus_normal.jpg',
                    roughness: 'textures/desert/foliage/desert_cactus_roughness.jpg',
                }
            },
            desertCactus2: {
                textures: {
                    color: 'textures/desert/foliage/desert_cactus2_color.jpg',
                    normal: 'textures/desert/foliage/desert_cactus2_normal.jpg',
                    roughness: 'textures/desert/foliage/desert_cactus2_roughness.jpg',
                }
            },
            desertPlants: {
                textures: {
                    color: 'textures/desert/foliage/desert_plants_color.jpg',
                    normal: 'textures/desert/foliage/desert_plants_normal.jpg',
                    roughness: 'textures/desert/foliage/desert_plants_roughness.jpg',
                    ao: 'textures/desert/foliage/desert_plants_ao.jpg',
                    opacity: 'textures/desert/foliage/desert_plants_opacity.jpg',
                    translucency: 'textures/desert/foliage/desert_plants_translucency.jpg'
                }
            },
            snowyStump: {
                textures: {
                    color: 'textures/arctic/foliage/snowy_stump_color.jpg',
                    normal: 'textures/arctic/foliage/snowy_stump_normal.jpg',
                    roughness: 'textures/arctic/foliage/snowy_stump_roughness.jpg',
                }
            },
        };

        // Each 'foliageId' should map to one of these definitions.
        // You can keep them grouped by theme or flatten them all into a single list.
        // Just ensure the 'id' field matches what the server sends (e.g., 'desert_cactus', 'snowy_stump', etc.).
        this.foliageTypes = {
            grassland: [
                {
                    id: 'grasslands_plant_1',
                    model: 'models/grasslands_plant_1.glb',
                    materialId: 'grasslandMaterial',
                    weight: 0.8,
                    castShadow: false
                },
                {
                    id: 'grasslands_plant_2',
                    model: 'models/grasslands_plant_2.glb',
                    materialId: 'grasslandMaterial',
                    weight: 0.1,
                    castShadow: true
                },
                {
                    id: 'grasslands_plant_3',
                    model: 'models/grasslands_plant_3.glb',
                    materialId: 'grasslandMaterial',
                    weight: 0.1,
                    castShadow: true
                },
            ],
            desert: [
                {
                    id: 'desert_cactus',
                    model: 'models/foliage/desert/desert_cactus.glb',
                    materialId: 'desertCactus',
                    weight: 0.2,
                    castShadow: true
                },
                {
                    id: 'desert_cactus2',
                    model: 'models/foliage/desert/desert_cactus2.glb',
                    materialId: 'desertCactus2',
                    weight: 0.2,
                    castShadow: true
                },
                {
                    id: 'desert_plant_1',
                    model: 'models/foliage/desert/desert_plant_1.glb',
                    materialId: 'desertPlants',
                    weight: 0.8,
                    castShadow: true
                },
            ],
            arctic: [
                {
                    id: 'snowy_stump',
                    model: 'models/foliage/arctic/snowy_stump.glb',
                    materialId: 'snowyStump',
                    weight: 1.0,
                    castShadow: true
                },
            ]
        };
    }

    /**
     * Looks up the foliage definition by matching a given foliageId in all theme arrays.
     * If your server uses exactly the same IDs from these arrays, you'll find a match.
     * Otherwise, adjust as needed or flatten these definitions in a single map.
     */
    getFoliageDefinition(foliageId) {
        for (const theme of Object.keys(this.foliageTypes)) {
            const definition = this.foliageTypes[theme].find(item => item.id === foliageId);
            if (definition) {
                return definition;
            }
        }
        console.warn(`Foliage definition for ID "${foliageId}" not found.`);
        return null;
    }

    /**
     * Loads a material by ID and caches it. Returns a THREE.MeshPhysicalMaterial.
     */
    async loadMaterial(materialId) {
        if (this.materialCache.has(materialId)) {
            return this.materialCache.get(materialId);
        }

        const materialConfig = this.materials[materialId];
        if (!materialConfig) {
            throw new Error(`Material ID "${materialId}" not found in materials configuration.`);
        }

        // Define texture type to material property mapping
        const texturePropertyMap = {
            color: 'map',
            normal: 'normalMap',
            roughness: 'roughnessMap',
            ao: 'aoMap',
            opacity: 'alphaMap',
            translucency: 'transmissionMap',
            metalness: 'metalnessMap',
            height: 'heightMap',
            emissive: 'emissiveMap'
        };

        const materialProperties = {};
        const texturePromises = [];

        // Load textures if defined
        for (const [textureType, path] of Object.entries(materialConfig.textures || {})) {
            if (!path) continue;

            const loadTexture = async () => {
                if (this.textureCache.has(path)) {
                    return [textureType, this.textureCache.get(path)];
                }
                try {
                    const texture = await this.textureLoader.loadAsync(path);
                    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
                    texture.flipY = false;
                    this.textureCache.set(path, texture);
                    return [textureType, texture];
                } catch (error) {
                    console.warn(`Failed to load texture ${path} for ${materialId}:`, error);
                    return [textureType, null];
                }
            };

            texturePromises.push(loadTexture());
        }

        // Wait for all textures to load
        const loadedTexturesArray = await Promise.all(texturePromises);
        for (const [textureType, texture] of loadedTexturesArray) {
            if (texture && texturePropertyMap[textureType]) {
                materialProperties[texturePropertyMap[textureType]] = texture;
            }
        }

        // Create the material
        const material = new THREE.MeshPhysicalMaterial({
            side: THREE.DoubleSide,
            envMapIntensity: 0.0,
            ...materialConfig.properties,
            ...materialProperties
        });

        // If we have an alpha map or explicit transparent property, enable transparency
        if (materialProperties.alphaMap || materialConfig.properties?.transparent) {
            material.transparent = true;
        }

        this.materialCache.set(materialId, material);
        return material;
    }

    /**
     * Loads (and caches) the 3D model + material for a specific foliageId if not loaded yet.
     */
    async loadFoliageAssetsById(foliageId) {
        // Check the cache first
        if (this.modelCache.has(foliageId)) return;

        // Find the definition for this foliageId
        const definition = this.getFoliageDefinition(foliageId);
        if (!definition) {
            throw new Error(`Cannot load foliage for unknown foliageId: ${foliageId}`);
        }

        // Load the model via GLTF loader
        const model = await this.loader.loadAsync(definition.model);
        const originalMesh = model.scene.children[0];

        // Load or get the shared material
        const material = await this.loadMaterial(definition.materialId);

        // Clone geometry if needed
        const geometry = originalMesh.geometry.clone();

        // Create an InstancedMesh to handle multiple instances
        const instancedMesh = new THREE.InstancedMesh(
            geometry,
            material,
            1000 // max instances for this mesh; adjust as needed
        );
        instancedMesh.count = 0;
        instancedMesh.castShadow = definition.castShadow;
        instancedMesh.receiveShadow = true;

        // Store in cache for re-use
        this.modelCache.set(foliageId, {
            mesh: instancedMesh,
            material,
            castShadow: definition.castShadow
        });
    }

    /**
     * Receives spawnPoints from the server, each containing x, y, z, foliageId, and scale.
     * We group them by foliageId, load the needed assets, and instantiate them.
     */
    async spawnFoliage(spawnPoints) {
        // 1) Gather unique foliageIds
        const uniqueFoliageIds = new Set(spawnPoints.map(p => p.foliageId).filter(id => !!id));

        // 2) Pre-load all required assets
        for (const foliageId of uniqueFoliageIds) {
            await this.loadFoliageAssetsById(foliageId);
        }

        // 3) Group spawn points by their foliageId
        const instanceGroups = new Map();
        for (const { x, y, z, foliageId, scale } of spawnPoints) {
            if (!instanceGroups.has(foliageId)) {
                instanceGroups.set(foliageId, []);
            }
            instanceGroups.get(foliageId).push({ x, y, z, scale });
        }

        // 4) For each foliageId, update instanced meshes
        const matrix = new THREE.Matrix4();
        const position = new THREE.Vector3();
        const quaternion = new THREE.Quaternion();
        const scaleVec = new THREE.Vector3();

        for (const [foliageId, instances] of instanceGroups) {
            const foliageData = this.modelCache.get(foliageId);
            if (!foliageData) {
                console.warn(`No cached data for foliageId "${foliageId}". Skipping...`);
                continue;
            }

            const { mesh } = foliageData;

            // Ensure instancedMesh can hold all instances
            if (instances.length > mesh.count) {
                mesh.instanceMatrix = new THREE.InstancedBufferAttribute(
                    new Float32Array(Math.ceil(instances.length * 1.2) * 16),
                    16
                );
                mesh.count = instances.length;
            } else {
                mesh.count = instances.length;
            }

            instances.forEach((instance, index) => {
                position.set(instance.x, instance.y, instance.z);

                quaternion.setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0));

                // Use the scale received from the server
                const scaleValue = instance.scale;
                scaleVec.set(scaleValue, scaleValue, scaleValue);

                matrix.compose(position, quaternion, scaleVec);
                mesh.setMatrixAt(index, matrix);
            });

            mesh.instanceMatrix.needsUpdate = true;

            // Add the mesh to the scene if not already present
            if (!mesh.parent) {
                this.scene.add(mesh);
            }
        }
    }

    /**
     * Clears all foliage instances from the scene (but keeps the caches).
     */
    clearFoliage() {
        for (const { mesh } of this.modelCache.values()) {
            if (mesh.parent === this.scene) {
                this.scene.remove(mesh);
            }
            mesh.count = 0;
        }
    }

    /**
     * Disposes of all resources. Useful when unloading the scene entirely.
     */
    dispose() {
        // Dispose each InstancedMesh and its material
        for (const { mesh, material } of this.modelCache.values()) {
            mesh.geometry.dispose();
            material.dispose();
            if (mesh.parent === this.scene) {
                this.scene.remove(mesh);
            }
        }
        this.modelCache.clear();

        // Dispose textures
        for (const texture of this.textureCache.values()) {
            texture.dispose();
        }
        this.textureCache.clear();

        // Dispose materials
        for (const material of this.materialCache.values()) {
            material.dispose();
        }
        this.materialCache.clear();
    }
}
