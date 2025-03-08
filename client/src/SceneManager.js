// sceneManager.js
import * as THREE from 'three';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader';
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { GameLoadingManager } from './LoadingManager';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { GammaCorrectionShader } from 'three/examples/jsm/shaders/GammaCorrectionShader.js';

// Selective bloom constant and dark material for non-bloomed objects
const BLOOM_SCENE = 1;
const darkMaterial = new THREE.MeshBasicMaterial({ color: 'black' });

export class SceneManager {
    constructor(game) {
        this.game = game;
        this.loadingManager = new GameLoadingManager();
        this.loader = new GLTFLoader(this.loadingManager.getLoader());
        this.textureLoader = new THREE.TextureLoader(this.loadingManager.getLoader());
        this.materialsBackup = {}; // To store original materials during bloom pass
        
        // Set up bloom layer (layer index 1)
        this.bloomLayer = new THREE.Layers();
        this.bloomLayer.set(BLOOM_SCENE);
    }
    
    setupScene() {
        const scene = new THREE.Scene();
        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, sortObjects: true });
        this.configureRenderer(renderer);
        this.setupLights(scene);
        this.scene = scene;
        this.renderer = renderer;
        this.renderer.setClearColor(0x001122);
        
        return { scene, renderer };
    }

    setupPostProcessing(camera) {
        // Set up the composers for selective bloom:
        // 1. The final composer renders the full scene composite (base + bloom)
        this.finalComposer = new EffectComposer(this.renderer);
        this.finalComposer.renderToScreen = true;
        this.renderPass = new RenderPass(this.scene, camera);
        this.finalComposer.addPass(this.renderPass);

        // 2. The bloom composer renders only objects in the bloom layer.
        this.bloomComposer = new EffectComposer(this.renderer);
        this.bloomComposer.renderToScreen = false;
        const bloomRenderPass = new RenderPass(this.scene, camera);
        this.bloomComposer.addPass(bloomRenderPass);

        const bloomParams = {
            strength: 2.0,
            radius: 0.75,
            threshold: 0.5
        };
        this.bloomPass = new UnrealBloomPass(
            new THREE.Vector2(window.innerWidth, window.innerHeight),
            bloomParams.strength,
            bloomParams.radius,
            bloomParams.threshold
        );
        this.bloomComposer.addPass(this.bloomPass);

        // 3. Final composite pass to blend base scene and bloom texture.
        const finalPassMaterial = new THREE.ShaderMaterial({
            uniforms: {
                baseTexture: { value: null },
                bloomTexture: { value: this.bloomComposer.renderTarget2.texture }
            },
            vertexShader: /* glsl */`
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: /* glsl */`
                uniform sampler2D baseTexture;
                uniform sampler2D bloomTexture;
                varying vec2 vUv;
                void main() {
                    vec4 baseColor = texture2D(baseTexture, vUv);
                    vec4 bloomColor = texture2D(bloomTexture, vUv);
                    gl_FragColor = baseColor + bloomColor;
                }
            `
        });
        this.finalPass = new ShaderPass(finalPassMaterial, 'baseTexture');
        this.finalPass.needsSwap = true;
        this.finalComposer.addPass(this.finalPass);

        // Gamma correction can be added if needed
        // const gammaCorrectionPass = new ShaderPass(GammaCorrectionShader);
        // this.finalComposer.addPass(gammaCorrectionPass);
        
        return {
            finalComposer: this.finalComposer,
            bloomComposer: this.bloomComposer,
            renderPass: this.renderPass
        };
    }
    
    updateCameraInComposers(camera) {
        if (this.renderPass) this.renderPass.camera = camera;
        if (this.bloomComposer && this.bloomComposer.passes[0]) {
            this.bloomComposer.passes[0].camera = camera;
        }
    }
    
    setupDroneView(dronePass) {
        if (this.finalComposer) {
            this.finalComposer.addPass(dronePass);
        }
    }
    
    removeDroneView(dronePass) {
        if (this.finalComposer) {
            this.finalComposer.removePass(dronePass);
        }
    }
    
    /**
     * Traverse scene and replace material of non-bloom objects with a dark material.
     */
    darkenNonBloomed(obj) {
        if (obj.isMesh) {
            if ((obj.layers.mask & (1 << BLOOM_SCENE)) === 0) {
                this.materialsBackup[obj.uuid] = obj.material;
                obj.material = darkMaterial;
            }
        }
    }

    /**
     * Restore the original material after the bloom pass.
     */
    restoreMaterial(obj) {
        if (obj.isMesh && this.materialsBackup[obj.uuid]) {
            obj.material = this.materialsBackup[obj.uuid];
            delete this.materialsBackup[obj.uuid];
        }
    }
    
    sortTransparentObjects() {
        // Force specific render order for transparent objects
        this.scene.traverse(object => {
            if (object.isMesh && object.material && object.material.transparent) {
                // UI elements have depthTest === false
                if (!object.material.depthTest) {
                    object.renderOrder = Math.max(object.renderOrder, 9000);
                }
                // Tag transparent materials to ensure they sort properly
                object.material.needsUpdate = true;
            }
        });
    }
    
    renderWithBloom(camera) {
        // Selective bloom rendering:
        // 1. Temporarily darken objects that are not on the bloom layer.
        this.scene.traverse(obj => this.darkenNonBloomed(obj));
        
        // 2. Render bloom composer.
        // Store the current background
        const oldBackground = this.scene.background;
        // Remove the background so it isn't rendered in the bloom pass
        this.scene.background = null;
        this.bloomComposer.render();
        this.scene.background = oldBackground;
        
        // 3. Restore original materials.
        this.scene.traverse(obj => this.restoreMaterial(obj));

        // Render final composite scene (base + bloom).
        this.finalComposer.render();
    }

    handleResize() {
        if (this.renderer) {
            this.renderer.setSize(window.innerWidth, window.innerHeight);
            
            // Resize composers if they exist
            if (this.bloomComposer) {
                this.bloomComposer.setSize(window.innerWidth, window.innerHeight);
            }
            if (this.finalComposer) {
                this.finalComposer.setSize(window.innerWidth, window.innerHeight);
            }
            
            // Update bloom pass if it exists
            if (this.bloomPass) {
                this.bloomPass.resolution.set(window.innerWidth, window.innerHeight);
            }
        }
    }

    addPregamePlatform() {
        this.loader.load(
            '/models/pregame_platform.glb',
            (gltf) => {
                this.platformMesh = gltf.scene;
                this.platformMesh.scale.set(1.03, 1.03, 1.03);
                this.platformMesh.receiveShadow = true;
                this.scene.add(this.platformMesh);
            },
            undefined,
            (error) => console.error('Error loading pregame_platform.glb:', error)
        );
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
            
            this.scene.remove(this.platformMesh);            
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
        this.ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
        scene.add(this.ambientLight);

        this.directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
        this.directionalLight.position.set(0, 150, 0);
        this.directionalLight.castShadow = true;
        this.configureShadowCamera(this.directionalLight);
        scene.add(this.directionalLight);
    }

    configureShadowCamera(light) {
        light.shadow.camera.near = 5;
        light.shadow.camera.far = 800;
        light.shadow.camera.left = -150;
        light.shadow.camera.right = 150;
        light.shadow.camera.top = 250;
        light.shadow.camera.bottom = -200;
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

    loadTableModel() {
        const textureLoader = new THREE.TextureLoader();
        const woodTexture = this.loadWoodTexture(textureLoader);
        const normalMap = this.loadNormalMap(textureLoader, woodTexture);
        
        this.loader.load(
            '/models/game_base.glb',
            (gltf) => {
                const tableMesh = this.processTableMesh(gltf, woodTexture, normalMap);
                this.scene.add(tableMesh);
                tableMesh.receiveShadow = true;
                tableMesh.castShadow = true;
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
                    metalness: 0.1,
                });
                child.receiveShadow = true;
                child.castShadow = true;
            }
        });
        
        tableMesh.position.set(0, -100, 0);
        tableMesh.scale.set(73, 73, 73);
        return tableMesh;
    }
}