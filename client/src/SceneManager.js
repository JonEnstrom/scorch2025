// sceneManager.js
import * as THREE from 'three';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader';
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { GameLoadingManager } from './LoadingManager';
import { floorPowerOfTwo } from 'three/src/math/MathUtils.js';

export class SceneManager {
    constructor(game) {
        this.game = game;
        this.loadingManager = new GameLoadingManager();
        this.loader = new GLTFLoader(this.loadingManager.getLoader());
        this.textureLoader = new THREE.TextureLoader(this.loadingManager.getLoader());
    }
    
    setupScene() {
        const scene = new THREE.Scene();
        const renderer = new THREE.WebGLRenderer({ antialias: true });
        this.configureRenderer(renderer);
        this.setupLights(scene);


        this.loader.load(
            '/models/pregame_platform.glb',
            (gltf) => {
                this.platformMesh = gltf.scene;
                this.platformMesh.scale.set(10.3, 10.3, 10.3);
                this.platformMesh.receiveShadow = true;
                scene.add(this.platformMesh);
            },
            undefined,
            (error) => console.error('Error loading pregame_platform.glb:', error)
        );
        
        return { scene, renderer };
    }

    disposePlatformMesh() {
        if (this.platformMesh) {
            // Traverse through all children to dispose geometries and materials
            this.platformMesh.traverse((child) => {
                if (child.isMesh) {
                    if (child.geometry) {
                        child.geometry.dispose();
                    }
                    if (child.material) {
                        // Handle both single materials and material arrays
                        if (Array.isArray(child.material)) {
                            child.material.forEach(material => material.dispose());
                        } else {
                            child.material.dispose();
                        }
                    }
                }
            });
            
            // Remove from parent (scene)
            if (this.platformMesh.parent) {
                this.platformMesh.parent.remove(this.platformMesh);
            }
            
            this.platformMesh = null;
        }
    }

    configureRenderer(renderer) {
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        renderer.outputEncoding = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1;
        document.body.appendChild(renderer.domElement);
    }

    setupLights(scene) {
        this.ambientLight = new THREE.AmbientLight(0xffffff, 0.0);
        scene.add(this.ambientLight);

        this.directionalLight = new THREE.DirectionalLight(0xffffff, 0.2);
        this.directionalLight.position.set(0, 1000, 0);
        this.directionalLight.castShadow = true;
        this.configureShadowCamera(this.directionalLight);
        scene.add(this.directionalLight);

            }

    configureShadowCamera(light) {
        light.shadow.camera.near = 5;
        light.shadow.camera.far = 1600;
        light.shadow.camera.left = -1200;
        light.shadow.camera.right = 1200;
        light.shadow.camera.top = 1000;
        light.shadow.camera.bottom = -1000;
        light.shadow.mapSize.width = 8192;
        light.shadow.mapSize.height = 8192;
    }

    loadHDRI(scene, renderer, hdrPath) {
        const rgbeLoader = new RGBELoader(); 
        const pmremGenerator = new THREE.PMREMGenerator(renderer);
        pmremGenerator.compileEquirectangularShader();

        rgbeLoader.load(
            hdrPath,
            (texture) => {
                const envMap = pmremGenerator.fromEquirectangular(texture).texture;
                scene.background = envMap;
                scene.environment = null;
                texture.dispose();
                pmremGenerator.dispose();
            },
            undefined,
            (err) => console.error('An error occurred while loading the HDRI:', err)
        );
    }

    loadEXR(scene, renderer, exrPath) {
        const exrLoader = new EXRLoader();
        const pmremGenerator = new THREE.PMREMGenerator(renderer);
        pmremGenerator.compileEquirectangularShader();
    
        exrLoader.load(
            exrPath,
            (texture) => {
                const envMap = pmremGenerator.fromEquirectangular(texture).texture;
                scene.background = envMap;
                scene.environment = null;
                texture.dispose();
                pmremGenerator.dispose();
            },
            undefined,
            (err) => console.error('An error occurred while loading the EXR:', err)
        );
    }

    loadTableModel(scene) {
        const textureLoader = new THREE.TextureLoader();
        const woodTexture = this.loadWoodTexture(textureLoader);
        const normalMap = this.loadNormalMap(textureLoader, woodTexture);
        
        this.loader.load(
            '/models/game_base.glb',
            (gltf) => {
                const tableMesh = this.processTableMesh(gltf, woodTexture, normalMap);
                scene.add(tableMesh);
            },
            undefined,
            (error) => console.error('Error loading table.glb:', error)
        );
    }

    loadWoodTexture(loader) {
        return loader.load(
            '/textures/table_color.jpg',
            (texture) => {
                texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
                texture.repeat.set(2, 2);
                texture.offset.set(0, 0);
                texture.rotation = 0;
            },
            undefined,
            (error) => console.error('Error loading wood texture:', error)
        );
    }

    loadNormalMap(loader, woodTexture) {
        return loader.load(
            '/textures/table_normal.jpg',
            (texture) => {
                texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
                texture.repeat.copy(woodTexture.repeat);
                texture.offset.copy(woodTexture.offset);
                texture.rotation = woodTexture.rotation;
            },
            undefined,
            (error) => console.error('Error loading normal map:', error)
        );
    }

    processTableMesh(gltf, woodTexture, normalMap) {
        const tableMesh = gltf.scene;
        tableMesh.traverse((child) => {
            if (child.isMesh) {
                child.material = new THREE.MeshStandardMaterial({
                    map: woodTexture,
                    normalMap: normalMap,
                    normalScale: new THREE.Vector2(1, 1),
                    roughness: 0.5,
                    metalness: 0.1
                });
                child.receiveShadow = true;
                child.castShadow = true;
            }
        });
        
        tableMesh.position.set(0, -990, 0);
        tableMesh.scale.set(670, 670, 670);
        return tableMesh;
    }
}