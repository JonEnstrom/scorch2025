// ModelCache.js
import * as THREE from 'three';
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

export class ModelCache {
    constructor() {
        this.cache = new Map();
        this.loader = new GLTFLoader();
        this.loadingPromises = new Map();
    }

    async getModel(modelPath) {
        // Return cached model if available
        if (this.cache.has(modelPath)) {
            return this.cache.get(modelPath).clone();
        }

        // Return existing promise if model is currently loading
        if (this.loadingPromises.has(modelPath)) {
            const model = await this.loadingPromises.get(modelPath);
            return model.clone();
        }

        // Start new load if model isn't cached or loading
        const loadPromise = this.loader.loadAsync(modelPath)
            .then(gltf => {
                const model = gltf.scene;
                this.setupModelMaterials(model);
                this.cache.set(modelPath, model);
                this.loadingPromises.delete(modelPath);
                return model.clone();
            })
            .catch(error => {
                console.error('Error loading model:', error);
                this.loadingPromises.delete(modelPath);
                throw error;
            });

        this.loadingPromises.set(modelPath, loadPromise);
        return loadPromise;
    }

    setupModelMaterials(model) {
        model.traverse((child) => {
            if (child.isMesh) {
                child.material = new THREE.MeshStandardMaterial({
                    color: 0xff0000,
                    metalness: 0.7,
                    roughness: 0.3,
                    emissive: 0xff0000,
                    emissiveIntensity: 0.5
                });
            }
        });
    }

    dispose() {
        this.cache.forEach((model) => {
            model.traverse((child) => {
                if (child.isMesh) {
                    if (child.geometry) child.geometry.dispose();
                    if (child.material) {
                        if (Array.isArray(child.material)) {
                            child.material.forEach(mat => mat.dispose());
                        } else {
                            child.material.dispose();
                        }
                    }
                }
            });
        });
        this.cache.clear();
        this.loadingPromises.clear();
    }
}
