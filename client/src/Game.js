// game.js
import { Clock } from 'three';
import { EventEmitter } from './EventEmitter';
import * as THREE from 'three';
import { GameInput } from './GameInput.js';
import { CameraManager } from './CameraManager.js';
import { TerrainRenderer } from './TerrainRenderer.js';
import { SceneManager } from './SceneManager.js';
import { ShopManager } from './stores/shopStore.js';
import { PlayerManager } from './PlayerManager.js';
import { DamageNumberManager } from './DamageNumberManager.js';
import { FoliageManager } from './FoliageManager.js';
import { ShieldManager } from './ShieldManager.js';
import { HelicopterController } from './HelicopterController.js';
import { PingManager } from './PingManager.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { DroneFeedShader } from './shaders/DroneFeedShader.js';
import { notificationManager } from './NotificationManager';
import { ProjectileTimelineManager } from './ProjectileTimelineManager.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { GammaCorrectionShader } from 'three/examples/jsm/shaders/GammaCorrectionShader.js';

// Selective bloom constant and dark material for non-bloomed objects
const BLOOM_SCENE = 1;
const darkMaterial = new THREE.MeshBasicMaterial({ color: 'black' });

class FPSDisplay {
    constructor() {
        this.fps = 0;
        this.frameCount = 0;
        this.lastTime = performance.now();
        
        // Create display element
        this.element = document.createElement('div');
        this.element.style.cssText = `
            position: fixed;
            top: 30px;
            right: 5px;
            background: rgba(72, 255, 0, 0.5);
            color: white;
            padding: 2px 5px;
            border-radius: 4px;
            font-family: monospace;
            font-size: 14px
        `;
        document.body.appendChild(this.element);
    }

    update() {
        this.frameCount++;
        const elapsedTime = performance.now() - this.lastTime;

        // Update FPS every 500ms
        if (elapsedTime >= 500) {
            this.fps = Math.round(this.frameCount / (elapsedTime / 1000));
            this.frameCount = 0;
            this.lastTime = performance.now();
            this.element.textContent = `${this.fps} FPS`;
        }
    }
}

export class Game extends EventEmitter {
    constructor(socket) {
        super(); // Initialize EventEmitter
        this.socket = socket;
        this.projectiles = [];
        this.projectileMap = new Map();
        this.materialsBackup = {}; // To store original materials during bloom pass

        // Set up bloom layer (layer index 1)
        this.bloomLayer = new THREE.Layers();
        this.bloomLayer.set(BLOOM_SCENE);

        this.setupGameState();
        this.setupManagers();
    }

    setupGameState() {
        this.lastUpdateTime = performance.now();
        this.currentPlayerHasFired = false;
        this.turnTimeRemaining = 0;
        this.clock = new Clock();
        this.currentRound = 0;
        this.totalRounds = 0;
        this.currentTheme = null;
        this.sunRotationRPM = 0;
        this.isDroneView = false;
        this.state = 'pregame';
    }

    setupManagers() {
        this.sceneManager = new SceneManager(this);
        this.shopManager = new ShopManager(this.socket, 5000);
        this.playerManager = new PlayerManager(this);
    }

    init(gameData) {
        if (gameData.terrain) this.currentTheme = gameData.terrain.theme;
        const { scene, renderer } = this.sceneManager.setupScene();
        this.scene = scene;
        this.renderer = renderer;

        // Set up the composers for selective bloom:
        // 1. The final composer renders the full scene composite (base + bloom)
        this.finalComposer = new EffectComposer(renderer);
        this.finalComposer.renderToScreen = true;
        this.renderPass = new RenderPass(this.scene, this.cameraManager ? this.cameraManager.camera : null);
        this.finalComposer.addPass(this.renderPass);

        // 2. The bloom composer renders only objects in the bloom layer.
        this.bloomComposer = new EffectComposer(renderer);
        this.bloomComposer.renderToScreen = false;
        const bloomRenderPass = new RenderPass(this.scene, this.cameraManager ? this.cameraManager.camera : null);
        this.bloomComposer.addPass(bloomRenderPass);

        const bloomParams = {
            strength: 1.5,
            radius: 1.0,
            threshold: 0
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

        // Continue with the rest of your initialization:
        this.foliageManager = new FoliageManager(this.sceneManager, this.scene);
        this.initializeGame(gameData);
        this.shieldManager = new ShieldManager(this.scene);
        this.setupEventListeners();
        this.fpsDisplay = new FPSDisplay();
        this.animate();
    }

    initializeGame(gameData) {
        this.terrainRenderer = new TerrainRenderer(this.scene, this.sceneManager.directionalLight, this.renderer);
        if (gameData.terrain) this.terrainRenderer.createTerrain(gameData.terrain);
        this.cameraManager = new CameraManager(this, this.terrainRenderer);
        // Update camera for the render passes in composers
        this.renderPass.camera = this.cameraManager.camera;
        this.bloomComposer.passes[0].camera = this.cameraManager.camera;

        this.dmgManager = new DamageNumberManager(this.scene, this.cameraManager, './fonts/font.ttf');
        if (gameData.terrain) this.cameraManager.setView('thirdPerson');
        this.playerManager.init(gameData);
        this.inputManager = new GameInput(this, this.socket);
        this.helicopterController = new HelicopterController(
            this.scene,
            this.socket,
        );
        this.timelineManager = new ProjectileTimelineManager(this);
        //this.sceneManager.loadEXR(this.scene, this.renderer, './hdri/hut.exr');
        this.sceneManager.loadTableModel(this.scene);
        if (gameData.turnTimeRemaining !== undefined) {
            this.turnDuration = gameData.turnDuration || 45000;
            const currentTime = performance.now();
            this.turnStartTime = currentTime - (this.turnDuration - gameData.turnTimeRemaining);
            this.turnTimeRemaining = gameData.turnTimeRemaining;

            this.emit('turnUpdate', {
                currentPlayerId: this.playerManager.currentPlayerId,
                turnDuration: this.turnDuration,
                turnStart: this.turnStartTime,
            });
        }

        // Set up drone view pass if needed
        this.dronePass = new ShaderPass(DroneFeedShader);
        this.dronePass.material.uniforms.resolution.value.set(window.innerWidth, window.innerHeight);

        if (gameData.currentRound !== 0) { 
            this.lightsUp();
            this.sceneManager.disposePlatformMesh();
            this.playerManager.setCurrentPlayerId(gameData.currentPlayerId);
            this.currentPlayerId = gameData.currentPlayerId;
            this.state = 'playing';
            this.emit('stateChange', this.state);
            const currentTank = this.playerManager.getCurrentPlayer();
            this.cameraManager.setTarget(currentTank.mesh);
            this.cameraManager.setView('thirdPerson');
            if (typeof currentTank.turretYawCurrent === 'number') {
                this.cameraManager.yaw = THREE.MathUtils.degToRad(currentTank.turretYawCurrent) + Math.PI;
            }
        }

        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        const pingManager = new PingManager(this.socket);
        pingManager.start();
        if (gameData.currentRound === 0) this.cameraManager.setView('preGame');

        // Gamma correction and other passes can be added if needed:
         const gammaCorrectionPass = new ShaderPass(GammaCorrectionShader);
         this.finalComposer.addPass(gammaCorrectionPass);
    }

    // Called when the server sends a complete projectile timeline
    handleFullProjectileTimeline(timelineData) {
        console.log(timelineData);
        this.timelineManager.queueTimeline(timelineData);
    }

    isInPreGame() {
        return this.state === 'pregame';
    }
      
    isPlaying() {
        return this.state === 'playing';
    }
      
    isGameOver() {
        return this.state === 'postgame';
    }
    
    doDroneView(){
        this.finalComposer.addPass(this.dronePass);
    }

    doNormalView(){
        this.finalComposer.removePass(this.dronePass);
    }

    addShieldToPlayer(playerId) {
        const tank = this.playerManager.getPlayer(playerId);
        if (tank) {
            this.shieldManager.addShield(tank.mesh);
            console.log(`Shield added to player ${tank.name}`);
        } else {
            console.warn(`Player with ID ${playerId} not found.`);
        }
    }

    spawnFoliage(spawnPoints) {
        this.foliageManager.spawnFoliage(spawnPoints, this.currentTheme);
    }

    lightsUp() {
        this.sceneManager.directionalLight.intensity = 1.4;
        this.sceneManager.ambientLight.intensity = 0.4;
    }

    loadNewTerrain(terrain) {
        console.log(terrain.theme);
        this.terrainRenderer.dispose();
        this.foliageManager.clearFoliage();
        this.terrainRenderer.currentTheme = terrain.theme;
        this.currentTheme = terrain.theme;
        this.terrainRenderer.createTerrain(terrain);
        this.sceneManager.disposePlatformMesh();
        this.lightsUp();
    }

    setupEventListeners() {
        window.addEventListener('resize', () => this.handleResize());
        
        
        this.socket.on('shieldAdded', data => {
            const player = this.playerManager.getPlayer(data.playerId);
            if (player) {
                player.setShield(data.totalShield);
                this.shieldManager.addShield(player.mesh);
            } else {
                console.warn(`Player with id ${data.playerId} not found.`);
            }
        });

        this.socket.on('removeShield', data => {
            console.log(data);
            const player = this.playerManager.getPlayer(data.playerId);
            if (player) {
                this.shieldManager.removeShield(player.mesh);
            } else {
                console.warn(`Player with id ${data.playerId} not found.`);
            }
        });
            
        this.socket.on('armorAdded', data => {
            const player = this.playerManager.getPlayer(data.playerId);
            if (player) {
                player.setArmor(data.totalArmor);
            } else {
                console.warn('Local player not found.');
            }
        });
    }
    
    handleResize() {
        if (this.renderer && this.cameraManager) {
            this.renderer.setSize(window.innerWidth, window.innerHeight);
            this.cameraManager.camera.aspect = window.innerWidth / window.innerHeight;
            this.cameraManager.camera.updateProjectionMatrix();
        }
    }

    handleRoundStarting(currentRound, totalRounds) {
        notificationManager.showMessage(`Round ${currentRound} of ${totalRounds} starting!`, 5000);
    }

    handleRoundEnded(currentRound, totalRounds) {
        notificationManager.showMessage('Round ' + currentRound + ' ended!', 5000);
        if (currentRound === totalRounds) {
            this.state = 'postgame';
            this.emit('stateChange', this.state);
        }
    }
    
    handlePlayerDefeated(data) {
        const playerKilled = this.playerManager.getPlayer(data.id);
        if (playerKilled) {
            playerKilled.destroy();
            notificationManager.showMessage(`${playerKilled.name} Destroyed!`, 5000);
            if (data.id === this.playerManager.currentPlayerId) {
                this.cameraManager.setView('overhead');
            }
        }
    }

    handleGameStartingSoon(startDelay) {
        this.gameStartCountdown = startDelay;
        notificationManager.showMessage('Game Starting in ' + (startDelay / 1000).toFixed(1) + ' seconds!', startDelay);
        this.state = 'pregame';
        this.emit('stateChange', this.state);
    }

    handleTurnChangePending() {
        this.terrainRenderer.updateNormals();
    }

    handleTurnUpdate(currentPlayerId) {
        this.playerManager.setCurrentPlayerId(currentPlayerId);
        const currentTank = this.playerManager.getCurrentPlayer();
        if (!currentTank || !currentTank.mesh) return;
        this.currentPlayerHasFired = false;
        this.cameraManager.setTarget(currentTank.mesh);
        this.cameraManager.setView('thirdPerson');
        if (typeof currentTank.turretYawCurrent === 'number') {
            this.cameraManager.yaw = THREE.MathUtils.degToRad(currentTank.turretYawCurrent) + Math.PI;
        }
        notificationManager.showMessage(`${currentTank.name}'s Turn!`, 3000);
        this.state = 'playing';
        this.emit('stateChange', this.state);
    }
    
    handleTerrainPatch(patch) {
        if (this.terrainRenderer) {
            this.terrainRenderer.applyTerrainPatch(patch);
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

    animate() {
        requestAnimationFrame(() => this.animate());
        const currentTime = performance.now();
        const deltaTime = (currentTime - this.lastUpdateTime) / 1000;
        this.lastUpdateTime = currentTime;
        this.updateGameElements(deltaTime);


        if (this.helicopterController) {
            this.helicopterController.update(currentTime, deltaTime);
            this.helicopterController.updateRotors(deltaTime);
        }

        this.terrainRenderer.update();

        // Selective bloom rendering:
        // 1. Temporarily darken objects that are not on the bloom layer.
        this.scene.traverse(obj => this.darkenNonBloomed(obj));
        // 2. Render bloom composer.
        // Store the current background
        const oldBackground = this.scene.background;
        // Remove the background so it isn’t rendered in the bloom pass
        this.scene.background = null;
        this.bloomComposer.render();
        this.scene.background = oldBackground;
        // 3. Restore original materials.
        this.scene.traverse(obj => this.restoreMaterial(obj));

        // Render final composite scene (base + bloom).
        this.finalComposer.render();
    }

    updateGameElements(deltaTime) {
        this.fpsDisplay.update();
        if (this.cameraManager) {
            this.cameraManager.update(deltaTime);
        }
        if (this.dmgManager) {
            this.dmgManager.update(deltaTime);
        }
        if (this.shieldManager) {
            this.shieldManager.update();
        }
        if (this.timelineManager) {
            this.timelineManager.particleSystem.update(deltaTime);
            this.timelineManager.update(deltaTime);
        }
        if (this.playerManager) {
            this.playerManager.updatePlayers(deltaTime, this.cameraManager.camera);
        }
        this.terrainRenderer.updateReflections(this.renderer, this.scene, this.cameraManager.camera);
        this.updateTerrainShaders();
    }
    
    updateTerrainShaders() {
        if (this.terrainRenderer.currentTheme === 'grassland' && 
            this.terrainRenderer.surfacePlane && 
            this.terrainRenderer.surfacePlane.material.uniforms) {      
            if (this.terrainRenderer.surfacePlane.material.uniforms.uTime) {
                this.terrainRenderer.surfacePlane.material.uniforms.uTime.value = this.clock.getElapsedTime();
            }
            this.dronePass.material.uniforms.time.value = this.clock.getElapsedTime() * 0.001;
            if (this.terrainRenderer.material.uniforms.lightPosition &&
                this.sceneManager.directionalLight) {
                this.terrainRenderer.material.uniforms.lightPosition.value.copy(
                    this.sceneManager.directionalLight.position
                );
            }
        }
    }
}
