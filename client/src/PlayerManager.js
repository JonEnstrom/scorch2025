// src/playerManager.js
import { Tank } from './Tank.js';
import * as THREE from 'three';

export class PlayerManager {
    constructor(game) {
        this.game = game;
        this.players = {};
        this.currentPlayerId = null;
        this.playerId = null;
        this.isPreGame = null;
        this.subscribers = {};
    }

    // Subscribe to an event
    subscribe(eventName, callback) {
        if (!this.subscribers[eventName]) {
            this.subscribers[eventName] = [];
        }
        this.subscribers[eventName].push(callback);
    }

    // Unsubscribe from an event
    unsubscribe(eventName, callback) {
        if (!this.subscribers[eventName]) return;
        this.subscribers[eventName] = this.subscribers[eventName].filter(cb => cb !== callback);
    }

    // Emit an event to all subscribers
    emit(eventName, data) {
        if (!this.subscribers[eventName]) return;
        this.subscribers[eventName].forEach(callback => callback(data));
    }

    /**
     * Update the tank's properties from the given state.
     *
     * Options:
     * - actualPosition: boolean (if true, update using setPosition; otherwise, use setTargetPosition)
     */
    updateTankProperties(tank, state, options = {}) {
        const useActualPosition = options.actualPosition || false;
        if (state.position !== undefined) {
            if (useActualPosition) {
                tank.setPosition(state.position);
            } else {
                tank.setTargetPosition(state.position);
            }
        }
        if (state.turretYaw !== undefined) tank.setTurretYaw(state.turretYaw);
        if (state.turretPitch !== undefined) tank.setTurretPitch(state.turretPitch);
        if (state.power !== undefined) tank.setPower(state.power);
        if (state.name !== undefined) tank.setName(state.name);
        if (state.health !== undefined) tank.setHealth(state.health);
        if (state.color !== undefined) tank.setColor(state.color);
        if (state.cash !== undefined) tank.setCash(state.cash);
        if (state.inventory !== undefined) tank.setInventory(state.inventory);
        if (state.selectedItem !== undefined) tank.setSelectedItem(state.selectedItem);
        if (state.selectedWeapon !== undefined) tank.setSelectedWeapon(state.selectedWeapon);
    }

    init(gameData) {
        this.playerId = gameData.playerId;
        this.currentPlayerId = gameData.currentPlayerId;

        // Initialize existing players
        Object.entries(gameData.players).forEach(([id, playerData]) => {
            this.addPlayer(id, playerData, gameData.currentRound === 0);
        });
    }

    addPlayer(id, playerData, isPreGame) {
        if (this.players[id]) return;
        const pos = playerData.position;
        const tank = new Tank(pos.x, pos.y, pos.z);
        // Use unified update function (using target position update)
        this.updateTankProperties(tank, playerData, { actualPosition: false });
        tank.id = id; // Assign unique identifier
        this.players[id] = tank;
        this.game.scene.add(tank.mesh);

        const currentDirection = new THREE.Vector3(0, 0, 1);
        currentDirection.applyQuaternion(tank.mesh.quaternion);
        const newDirection = new THREE.Vector3(currentDirection.x, 0, currentDirection.z);
        newDirection.normalize();
        tank.mesh.lookAt(tank.mesh.position.clone().add(newDirection));
        if (id === this.playerId) {
            this.game.cameraManager.setTarget(tank.mesh);
        }
        if (isPreGame) {
            const spotlight = new THREE.SpotLight(0xffffff, 5);
            spotlight.position.set(pos.x, pos.y + 70, pos.z); // Position above scene
            spotlight.angle = Math.PI / 6; // Cone angle in radians
            spotlight.penumbra = 0.9; // Softness of the edges (0-1)
            spotlight.decay = 0; // Light decay
            spotlight.distance = 100; // Maximum distance
            spotlight.castShadow = true; // Enable shadow casting
            this.game.scene.add(spotlight);
            spotlight.target.position.set(pos.x, pos.y, pos.z);
            this.game.scene.add(spotlight.target);
        } else {
            this.game.lightsUp();
        }
        this.emit('inventoryChanged', { playerId: id, inventory: tank.inventory });
    }

    removePlayer(id) {
        if (!this.players[id]) return;
        this.game.scene.remove(this.players[id].mesh);
        this.players[id].destroy();
        delete this.players[id];
    }

    handlePlayerJoined(data) {
        this.isPreGame = data.isPreGame;
        this.addPlayer(data.id, data.state, this.isPreGame);
        console.log(`Player joined: ${data.id}`);
        this.emit("playerListUpdated", this.getAllPlayersInfo());

    }
    
    handlePlayerLeft(data) {
        this.removePlayer(data.id);
        console.log(`Player left: ${data.id}`);
        this.emit("playerListUpdated", this.getAllPlayersInfo());

    }

    handlePlayerRespawn(data) {
        const { id, state } = data;
        const tank = this.players[id];
        if (tank) {
            tank.isAlive = true;  // Reset alive status
            tank.tankGroup.visible = true;  // Make sure tank is visible
            this.updateTankProperties(tank, state, { actualPosition: true });
        }
    }    
    
    handlePlayerUpdate(data) {
        const { id, state } = data;
        let tank = this.players[id];
        if (!tank) {
            this.addPlayer(id, state, this.isPreGame);
        } else {
            // Capture previous inventory to detect changes
            const previousInventory = JSON.stringify(tank.inventory);
            // Use unified update function (using target position update)
            this.updateTankProperties(tank, state, { actualPosition: false });
            if (previousInventory !== JSON.stringify(tank.inventory)) {
                this.emit('inventoryChanged', { playerId: id, inventory: tank.inventory });
            }
        }
        // Emit updated info
        this.emit("playerUpdated", {
            id, 
            turretYaw: state.turretYaw,
            turretPitch: state.turretPitch,
            power: state.power,
        });
        this.emit("playerListUpdated", this.getAllPlayersInfo());

    }

    getAllPlayersInfo() {
        // Return an array or object with each player's data
        return Object.entries(this.players).map(([id, tank]) => ({
            id,
            name: tank.name,
            health: tank.health,
            armor: tank.armor,
            shield: tank.shield,
            color: tank.color,
        }));
    }
    
    handlePlayerDamaged(data) {
        const playerHit = this.players[data.id];
        if (!playerHit || !playerHit.isAlive) return;
        if (!playerHit) return;
        playerHit.setHealth(data.currentHealth);
        this.game.dmgManager.createDamageNumber(data.damage, playerHit.mesh.position, {
            initialVelocity: 150,
            drag: 0.98,
            lifetime: 5.0
        });
    }

    getCurrentPlayer() {
        return this.players[this.currentPlayerId];
    }

    getPlayer(id) {
        return this.players[id];
    }

    updatePlayers(deltaTime, camera) {
        Object.values(this.players).forEach(tank => 
            tank.update(deltaTime, camera)
        );
    }

    setCurrentPlayerId(id) {
        this.currentPlayerId = id;
        this.emit("turnUpdate", id);  // Notify all subscribers of the new turn.
    }
    
    isCurrentPlayer(id) {
        return this.currentPlayerId === id;
    }

    isLocalPlayer(id) {
        return this.playerId === id;
    }
}
