// game.js
import { Clock } from 'three';
import { EventEmitter } from './EventEmitter';
import * as THREE from 'three';
import { InputManager } from './InputManager.js';
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
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { DroneFeedShader } from './shaders/DroneFeedShader.js';
import { notificationManager } from './NotificationManager';
import { ProjectileTimelineManager } from './ProjectileTimelineManager.js';
import { PhysicsManager } from './PhysicsManager.js';
import { CurrentPlayerArrow } from './CurrentPlayerArrow.js';

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
        this.playerManager = new PlayerManager(this);
        this.setupGameState();

    }

    setupGameState() {
        this.lastUpdateTime = performance.now();
        this.turnTimeRemaining = 0;
        this.clock = new Clock();
        this.currentRound = 0;
        this.totalRounds = 0;
        this.currentTheme = null;
        this.sunRotationRPM = 0;
        this.isDroneView = false;
        this.state = 'pregame';
        if (this.cameraManager) {
            this.cameraManager.spectatorMode = 'auto';
        }
        if (this.scene && !this.currentPlayerArrow) {
            this.currentPlayerArrow = new CurrentPlayerArrow(this.scene);
        }
    }

// Update the setupManagers method in the Game class
setupManagers() {
    // Initialize physics
    this.physicsManager = new PhysicsManager(this);
    this.physicsManager.init().then(success => {
        if (success) {
            console.log('Physics system initialized');
        } else {
            console.error('Failed to initialize physics system');
        }
    });
}
    init(gameData) {
        this.sceneManager = new SceneManager(this);

        if (gameData.terrain) this.currentTheme = gameData.terrain.theme;
        const { scene, renderer } = this.sceneManager.setupScene();
        this.scene = scene;
        this.renderer = renderer;
        this.currentPlayerArrow = new CurrentPlayerArrow(this.scene);
        this.foliageManager = new FoliageManager(this.sceneManager, this.scene);
        this.initializeGame(gameData);
        this.shieldManager = new ShieldManager(this.scene);
        this.setupEventListeners();

        this.setupManagers();
        
        // Set up drone view shader pass
        this.dronePass = new ShaderPass(DroneFeedShader);
        this.dronePass.material.uniforms.resolution.value.set(window.innerWidth, window.innerHeight);
        
        // Setup post-processing with the camera
        const composers = this.sceneManager.setupPostProcessing(this.cameraManager.camera);
        this.finalComposer = composers.finalComposer;
        this.bloomComposer = composers.bloomComposer;
        
        this.fpsDisplay = new FPSDisplay();
        this.animate();
    }

    initializeGame(gameData) {
        this.terrainRenderer = new TerrainRenderer(this.scene, this.sceneManager.directionalLight, this.renderer);
        this.cameraManager = new CameraManager(this, this.terrainRenderer);
        this.cameraManager.spectatorMode = 'auto';
        this.dmgManager = new DamageNumberManager(this.scene, this.cameraManager);
        this.inputManager = new InputManager(this, this.socket);
        this.timelineManager = new ProjectileTimelineManager(this, this.helicopterController, this.terrainRenderer);
        this.helicopterController = new HelicopterController(this.scene, this.socket, this);   
        this.shopManager = new ShopManager(this.socket, 5000);
        
        // Create terrain first if it exists
        let terrainCreated = false;
        if (gameData.terrain) {
            this.terrainRenderer.createTerrain(gameData.terrain);
            terrainCreated = true;
        }
        
        this.playerManager.init(gameData);
        this.sceneManager.loadTableModel();
    
        // Setup game state based on round information
        if (gameData.currentRound !== 0) { 
            this.sceneManager.disposePlatformMesh();
            this.playerManager.setCurrentPlayerId(gameData.currentPlayerId);
            this.turnTimeRemaining = gameData.turnTimeRemaining;
            this.turnStartTime = gameData.turnStartTime;
            this.currentPlayerId = gameData.currentPlayerId;
            this.state = 'playing';
            this.playerManager.handleGameStart();
            this.emit('stateChange', this.state);
            
            // Only set camera after terrain is valid
            if (terrainCreated && this.terrainRenderer.mesh) {
                const currentTank = this.playerManager.getCurrentPlayer();
                this.cameraManager.setTarget(currentTank.mesh);
                this.cameraManager.setView('thirdPerson');
                if (typeof currentTank.turretYawCurrent === 'number') {
                    this.cameraManager.yaw = THREE.MathUtils.degToRad(currentTank.turretYawCurrent) + Math.PI;
                }
            }
        } else {
            this.sceneManager.addPregamePlatform();
            // Only set preGame camera view after confirming terrain status
            if (gameData.terrain) {
                // Only proceed if terrain is valid
                if (this.terrainRenderer.mesh) {
                    this.cameraManager.setView('preGame');
                }
            } else {
                // No terrain needed for preGame view
                this.cameraManager.setView('preGame');
            }
        }
    
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    
        const pingManager = new PingManager(this.socket);
        pingManager.start();
    }

    
    // Called when the server sends a complete projectile timeline
    handleFullProjectileTimeline(timelineData) {
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
        this.sceneManager.setupDroneView(this.dronePass);
        this.isDroneView = true;
    }

    doNormalView(){
        this.sceneManager.removeDroneView(this.dronePass);
        this.isDroneView = false;
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
        if (this.foliageManager) this.foliageManager.spawnFoliage(spawnPoints, this.currentTheme);
    }

/**
 * Smoothly transitions light intensity over the specified duration
 * @param {number} duration - Transition duration in seconds
 * @param {Object} targetValues - Object containing target light intensities
 */
lightsUp(duration = 3.0, targetValues = { directional: 3.4, ambient: 1.8 }) {
    // Store the starting values
    const startValues = {
        directional: this.sceneManager.directionalLight.intensity,
        ambient: this.sceneManager.ambientLight.intensity
    };
    
    // Store the target values
    const targets = {
        directional: targetValues.directional,
        ambient: targetValues.ambient
    };
    
    // Calculate the increment per second
    const increments = {
        directional: (targets.directional - startValues.directional) / duration,
        ambient: (targets.ambient - startValues.ambient) / duration
    };
    
    // Track animation state
    const animation = {
        startTime: null,        // Will be set after delay
        delayStartTime: performance.now(),
        delayDuration: 500,  
        duration: duration * 1000, // Convert to milliseconds
        active: true,
        delayComplete: false
    };
    
    // Animation update function
    const updateLights = (currentTime) => {
        if (!animation.active) return;
        
        // Check if we're still in the delay period
        if (!animation.delayComplete) {
            const delayElapsed = currentTime - animation.delayStartTime;
            
            if (delayElapsed < animation.delayDuration) {
                // Still in delay period, continue waiting
                requestAnimationFrame(updateLights);
                return;
            } else {
                // Delay just completed, set the actual animation start time
                animation.delayComplete = true;
                animation.startTime = currentTime;
            }
        }
        
        // Calculate elapsed time since animation started (after delay)
        const elapsed = currentTime - animation.startTime;
        
        // Check if animation is complete
        if (elapsed >= animation.duration) {
            // Set final values
            this.sceneManager.directionalLight.intensity = targets.directional;
            this.sceneManager.ambientLight.intensity = targets.ambient;
            animation.active = false;
            return;
        }
        
        // Calculate progress (0 to 1)
        const progress = elapsed / animation.duration;
        
        // Update light intensities
        this.sceneManager.directionalLight.intensity = 
            startValues.directional + (increments.directional * progress * duration);
        this.sceneManager.ambientLight.intensity = 
            startValues.ambient + (increments.ambient * progress * duration);
        
        // Continue animation
        requestAnimationFrame(updateLights);
    };
    
    // Start the animation loop
    requestAnimationFrame(updateLights);
    
    // Return a function to cancel the animation if needed
    return () => {
        animation.active = false;
    };
}

async loadNewTerrain(terrain) {
    this.terrainRenderer.dispose();
    this.foliageManager.clearFoliage();   
    this.terrainRenderer.currentTheme = terrain.theme;
    this.currentTheme = terrain.theme;
    
    // Wait for the terrain to be created
    await this.terrainRenderer.createTerrain(terrain);
    
    this.sceneManager.disposePlatformMesh();
    this.lightsUp();

    if (this.physicsManager && this.physicsManager.initialized) {
        this.physicsManager.createTerrainCollision();
    }
}
    setupEventListeners() {
        window.addEventListener('resize', () => {
            if (this.renderer && this.cameraManager) {
                this.sceneManager.handleResize();
                this.cameraManager.camera.aspect = window.innerWidth / window.innerHeight;
                this.cameraManager.camera.updateProjectionMatrix();
                // Update drone pass resolution if in drone view
                if (this.isDroneView && this.dronePass) {
                    this.dronePass.material.uniforms.resolution.value.set(window.innerWidth, window.innerHeight);
                }
            }
            });
        
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
        }
    }

    handleGameStartingSoon(startDelay) {
        this.gameStartCountdown = startDelay;
        notificationManager.showMessage('Game Starting in ' + (startDelay / 1000).toFixed(1) + ' seconds!', startDelay);
        this.state = 'pregame';
        this.emit('stateChange', this.state);
        this.playerManager.handleGameStart();

    }

    handleTurnChangePending() {
        this.terrainRenderer.updateNormals();
    }

    handleTurnUpdate(currentPlayerId) {
        this.playerManager.setCurrentPlayerId(currentPlayerId);
        const currentTank = this.playerManager.getCurrentPlayer();
        if (!currentTank || !currentTank.mesh) return;
        
        // Update the arrow to point at the current player
        if (this.currentPlayerArrow) {
            this.currentPlayerArrow.setTarget(currentTank.mesh);
        }
        
        // Check if it's the local player's turn
        const isLocalPlayerTurn = currentPlayerId === this.playerManager.playerId;
        
        if (isLocalPlayerTurn) {
            // If it's our turn, always set to third person view
            this.cameraManager.setTarget(currentTank.mesh);
            this.cameraManager.setView('thirdPerson');
            if (typeof currentTank.turretYawCurrent === 'number') {
                this.cameraManager.yaw = THREE.MathUtils.degToRad(currentTank.turretYawCurrent) + Math.PI;
            }
        } else {
            // If we're spectating, check the spectator mode
            const spectatorMode = this.cameraManager.getSpectatorMode();
            
            if (spectatorMode === 'auto') {
                // In auto mode, we follow the current player
                this.cameraManager.setTarget(currentTank.mesh);
                this.cameraManager.setView('thirdPerson');
                if (typeof currentTank.turretYawCurrent === 'number') {
                    this.cameraManager.yaw = THREE.MathUtils.degToRad(currentTank.turretYawCurrent) + Math.PI;
                }
            }
            // In freeFly mode, we don't change anything and let the player control the camera
        }
        
        notificationManager.showMessage(`${currentTank.name}'s Turn!`, 3000);
        this.state = 'playing';
        this.emit('stateChange', this.state);
    }


    // Update the handleTerrainPatch method to update physics
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
        this.sceneManager.sortTransparentObjects();
        this.sceneManager.renderWithBloom(this.cameraManager.camera);
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
        if (this.helicopterController) {
            this.helicopterController.update(this.lastUpdateTime, deltaTime);
            this.helicopterController.updateRotors(deltaTime);
        }
        if (this.physicsManager && this.physicsManager.initialized) {
            this.physicsManager.update(deltaTime);
        }
        if (this.currentPlayerArrow) {
            this.currentPlayerArrow.update(deltaTime);
        }

        this.terrainRenderer.update();
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
            if (this.isDroneView && this.dronePass) {
                this.dronePass.material.uniforms.time.value = this.clock.getElapsedTime() * 0.001;
            }
            if (this.terrainRenderer.material && this.terrainRenderer.material.uniforms && 
                this.terrainRenderer.material.uniforms.lightPosition &&
                this.sceneManager.directionalLight) {
                this.terrainRenderer.material.uniforms.lightPosition.value.copy(
                    this.sceneManager.directionalLight.position
                );
            }
        }
    }
}