// game.js
import { Clock } from 'three';
import { EventEmitter } from './EventEmitter';
import * as THREE from 'three';
import { ClientProjectile } from './Projectile.js';
import { GameInput } from './GameInput.js';
import { CameraManager } from './CameraManager.js';
import { TerrainRenderer } from './TerrainRenderer.js';
import { SceneManager } from './SceneManager.js';
import { ShopManager } from './stores/shopStore.js';
import { PlayerManager } from './PlayerManager.js';
import { DamageNumberManager } from './DamageNumberManager.js';
import { GPUParticleManager } from './GpuParticleManager.js';
import { FoliageManager } from './FoliageManager.js';
import { ShieldManager } from './ShieldManager.js';
import { HelicopterManager } from './HelicopterManager.js';
import { PingManager } from './PingManager.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { DroneFeedShader } from './shaders/DroneFeedShader.js';
import { notificationManager } from './NotificationManager';
import { ProjectileTimelineManager } from './ProjectileTimelineManager.js';

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
        this.timelineManager = new ProjectileTimelineManager(this);
        }

    init(gameData) {
        if (gameData.terrain) this.currentTheme = gameData.terrain.theme;
        const { scene, renderer } = this.sceneManager.setupScene();
        this.scene = scene;
        this.renderer = renderer;
        this.composer = new EffectComposer(renderer);
        this.foliageManager = new FoliageManager(this.sceneManager, this.scene);
        this.gpuParticleManager = new GPUParticleManager(this.renderer, this.scene);
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
        this.dmgManager = new DamageNumberManager(this.scene, this.cameraManager, './particles/damage_numbers.png');
        if (gameData.terrain) this.cameraManager.setView('thirdPerson');
        this.playerManager.init(gameData);
        this.inputManager = new GameInput(this, this.socket);
        this.helicopterManager = new HelicopterManager(
            this.scene,
            this.sceneManager.loader,
            this.terrainRenderer,
            this.gpuParticleManager,
            this.dmgManager
        );
        this.sceneManager.loadEXR(this.scene, this.renderer, './hdri/hut.exr');
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

        this.renderPass = new RenderPass(this.scene, this.cameraManager.camera);
        this.composer.addPass(this.renderPass);
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


    }

    // Called when the server sends a complete timeline
    handleFullProjectileTimeline(timelineData) {
        
        // Let the timeline manager handle it.
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

    spawnExistingHelicopters(helicopterStates) {
        helicopterStates.forEach((heliState) => {
            this.spawnHelicopter({
                id: heliState.id,
                state: heliState,
            });
        });
    }

    spawnHelicopter(data) {
        this.helicopterManager.spawnHelicopter(data);
    }
    
    updateHelicopters(states) {
        this.helicopterManager.updateHelicopters(states);
    }
    
    updateHelicopterWaypoint(data) {
        this.helicopterManager.updateHelicopterWaypoint(data);
    }
    
    handleHelicopterDamage(data) {
        this.helicopterManager.handleHelicopterDamage(data);
    }
    
    removeHelicopter(id) {
        this.helicopterManager.removeHelicopter(id);
    }
    
    doDroneView(){
        this.composer.addPass(this.dronePass);
    }

    doNormalView(){
        this.composer.removePass(this.dronePass);
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
        this.sceneManager.directionalLight.intensity = 0.5;
        this.sceneManager.ambientLight.intensity = 0.5;
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
            // data: { playerId, amount, totalShield }
            const player = this.playerManager.getPlayer(data.playerId);
            if (player) {
                player.setShield(data.totalShield);
                this.shieldManager.addShield(player.mesh);
                console.log(`Shield added to ${player.name}: +${data.amount}, total shield: ${data.totalShield}`);
            } else {
                console.warn(`Player with id ${data.playerId} not found.`);
            }
        });
            
        // Handle armor updates from the server
        this.socket.on('armorAdded', data => {
            const player = this.playerManager.getPlayer(data.playerId);
            if (player) {
                // Update the tank’s armor property so the UI can display the new value
                player.setArmor(data.totalArmor);
                console.log(`Armor added to ${player.name}: +${data.amount}, total armor: ${data.totalArmor}`);
                // Optionally, update any armor-specific UI elements here.
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
            playerKilled.destroy();  // This will set isAlive = false and hide the tank
            notificationManager.showMessage(`${playerKilled.name} Destroyed!`, 5000);
            
            // If the current player was defeated, switch to an overhead view
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
        
        // Emit state change to 'playing'
        this.state = 'playing';
        this.emit('stateChange', this.state);
    }

    handleProjectileFired(data) {
        const projectile = new ClientProjectile(data, this.scene, this.gpuParticleManager, this.terrainRenderer);
        this.projectiles.push(projectile); 
        this.currentPlayerHasFired = true;
        
    }
    
    handleTerrainPatch(patch) {
        if (this.terrainRenderer) {
            this.terrainRenderer.applyTerrainPatch(patch);
        }
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        const currentTime = performance.now();
        const deltaTime = (currentTime - this.lastUpdateTime) / 1000;
        this.lastUpdateTime = currentTime;
        this.updateGameElements(deltaTime);
        this.terrainRenderer.update();
        this.composer.render();
    }

    updateGameElements(deltaTime) {
        this.fpsDisplay.update();
        this.cameraManager.update(deltaTime);
        this.dmgManager.update(deltaTime);
        this.shieldManager.update();
        this.gpuParticleManager.update(deltaTime);
        this.playerManager.updatePlayers(deltaTime, this.cameraManager.camera);
        this.timelineManager.update(deltaTime);
        for (const proj of this.projectiles) {
            proj.updateVisual(deltaTime);
        }
        this.updateTerrainShaders();
        this.updateSunPosition(deltaTime);
        this.terrainRenderer.updateReflections(this.renderer, this.scene, this.cameraManager.camera);
        this.helicopterManager.update(deltaTime);
    }

    updateSunPosition(deltaTime) {
        if (!this.sceneManager.directionalLight) return;
        const rotationAngle = (this.sunRotationRPM * Math.PI * 2 * deltaTime) / 60;
        this.sceneManager.directionalLight.position.applyAxisAngle(
            new THREE.Vector3(1, 0, 1), // Rotate around Z axis
            rotationAngle
        );
        this.sceneManager.directionalLight.lookAt(0, 0, 0);
        if (this.sceneManager.directionalLight.shadow) {
            this.sceneManager.directionalLight.shadow.camera.updateProjectionMatrix();
        }
    }
    updateProjectiles(deltaTime) {
        this.projectiles.forEach(proj => {
            proj.update(deltaTime);
            if (proj.mesh) {
                const pos = proj.mesh.position;
                if (Math.abs(pos.x) > 4000 || Math.abs(pos.y) > 4000 || Math.abs(pos.z) > 4000) {
                    proj.destroy();
                }
            }
        });
        this.projectiles = this.projectiles.filter(p => !p.isDestroyed);
    }

    updateTerrainShaders() {
        if (this.terrainRenderer.currentTheme === 'grassland' && 
            this.terrainRenderer.surfacePlane && 
            this.terrainRenderer.surfacePlane.material.uniforms) {      
        if (this.terrainRenderer.surfacePlane.material.uniforms.uTime) {
            this.terrainRenderer.surfacePlane.material.uniforms.uTime.value = 
                this.clock.getElapsedTime();
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