// server/PlayerManager.js
import SpawnManager from './SpawnManager.js';
import Player from './Player.js';
import TurnManager from './TurnManager.js';


const AVAILABLE_COLORS = [
  0xff0000, // Red
  0x00ff00, // Green
  0x0000ff, // Blue
  0xffff00, // Yellow
  0xff00ff, // Magenta
  0x00ffff, // Cyan
  0xffa500, // Orange
  0x800080, // Purple
  0x008000, // Dark Green
  0x000080, // Navy Blue
  0x808000, // Olive
  0x008080  // Teal
];

export default class PlayerManager {
  /**
   * @param {Object} io - Socket.IO server
   * @param {TerrainManager} terrainManager - TerrainManager instance
   * @param {ItemManager} itemManager - ItemManager instance
   * @param {string} gameId - ID of the game room to emit 
   */
  constructor(io, terrainManager, itemManager, gameId, gameInstance) {
    this.io = io;
    this.terrainManager = terrainManager;
    this.itemManager = itemManager;
    this.gameId = gameId;
    this.gameInstance = gameInstance;

    /**
     * Dictionary of userId -> Player instance
     */
    this.players = {};

    /**
     * Stores the userId of whoever is currently taking a turn
     */
    this.currentPlayer = null;

    this.spawnManager = new SpawnManager(terrainManager, this.players);
    this.turnManager = new TurnManager(io, gameId, this, this.gameInstance);

    this.turnTimer = null;
    this.TURN_DURATION_MS = 30_000; // 30 seconds
    this.isAdvancingTurn = false;

    this.currentPlayerHasFired = false;
    this.SPAWN_RADIUS = 125;

    // Track available colors for this game instance
    this.availableColors = [...AVAILABLE_COLORS];

    /**
     * Timestamp when the current turn started (in milliseconds)
     * @type {number|null}
     */
    this.turnStartTime = null;
  }

  /**
   * Get a random unused color from the available pool
   * @returns {number} Random unused color
   * @throws {Error} If no colors are available
   */
  getUniqueColor() {
    if (this.availableColors.length === 0) {
      throw new Error('No more unique colors available');
    }
    const randomIndex = Math.floor(Math.random() * this.availableColors.length);
    return this.availableColors.splice(randomIndex, 1)[0];
  }

  /**
   * Return a color to the available pool
   * @param {number} color - Color to return to the pool
   */
  returnColor(color) {
    // Only return color if it's part of the global set,
    // and only if it's not already in the pool
    if (AVAILABLE_COLORS.includes(color) && !this.availableColors.includes(color)) {
      this.availableColors.push(color);
    }
  }

  /**
   * Reset and respawn each player for the next round
   */
/**
 * Reset and respawn each player for the next round
 */
resetPlayersForNextRound() {
  for (const [userId, player] of Object.entries(this.players)) {
    player.resetForNewRound();
    
    if (!player.isSpectator) {
      // Only generate spawn points for non-spectators
      const spawnPoint = this.spawnManager.generateSpawnPoint();
      
      const patch = this.terrainManager.modifyTerrain(
        spawnPoint.x,
        spawnPoint.z,
        this.SPAWN_RADIUS,
        'flatten'
      );

      if (patch.length > 0) {
        this.io.to(this.gameId).emit('terrainPatch', { patch });
      }

      player.setPosition({
        x: spawnPoint.x,
        y: this.terrainManager.getHeightAtPosition(spawnPoint.x, spawnPoint.z),
        z: spawnPoint.z
      });
    } else {
      // Keep spectators at their off-screen position
      player.setPosition({
        x: -10000,
        y: 0,
        z: -10000
      });
    }

    this.broadcastPlayerRespawn(userId);
  }
  this.broadcastPlayerUpdate(this.getCurrentPlayerId());
}

  /**
   * Add a new player OR mark an existing offline player as back online.
   * @param {string} userId - The persistent userId from the session
   * @param {Socket} socket - The user's current socket
   * @param {string} [playerName] - Optional player name
   */
  addPlayer(userId, socket, playerName, isPreGame, isSpectator = false) {
    const existingPlayer = this.players[userId];
    if (existingPlayer) {
        existingPlayer.isOnline = true;
        existingPlayer.currentSocketId = socket.id;
        existingPlayer.isNewlyCreated = false;
        return;
    }

    let spawnPoint;
    if (isSpectator) {
      // Spawn spectators far off screen
      spawnPoint = {
        x: -10000,
        y: 0,
        z: -10000
      };
    } else if (isPreGame) {
      spawnPoint = this.spawnManager.generateSpawnPoint(userId, true);
    } else {
      spawnPoint = this.spawnManager.generateSpawnPoint();
      if (!isSpectator) {  // Only flatten terrain for non-spectators
        const patch = this.terrainManager.modifyTerrain(
          spawnPoint.x,
          spawnPoint.z,
          this.SPAWN_RADIUS,
          'flatten'
        );
  
        if (patch.length > 0) {
          this.io.to(this.gameId).emit('terrainPatch', { patch });
        }
      }
    }
    
    const newTank = new Player(
        spawnPoint.x,
        spawnPoint.y,
        spawnPoint.z
    );

    newTank.currentSocketId = socket.id;
    newTank.isOnline = true;
    newTank.isNewlyCreated = true;
    newTank.isSpectator = isSpectator;

  // Only give starter items to non-spectators
  if (this.itemManager && !isSpectator) {
    const starterItems = this.itemManager.getStarterItems();
    starterItems.forEach((starter) => {
      const item = this.itemManager.getItemByName(starter.name);
      if (item) {
        newTank.addItem(item, starter.quantity);
      }
    });
  }

  let finalName = playerName?.trim() || `Player${Object.keys(this.players).length + 1}`;
  if (isSpectator) {
    finalName = `[SPEC] ${finalName}`;
  }
  newTank.setName(finalName);

  try {
    newTank.setColor(this.getUniqueColor());
  } catch (error) {
    newTank.setColor(Math.random() * 0xffffff);
  }

  this.players[userId] = newTank;
  
  // Only add non-spectators to turn manager
  if (!isSpectator) {
    this.turnManager.addPlayer(userId, playerName);
  }

  this.io.to(this.gameId).emit('playerListUpdated', this.getAllPlayers());
}

/**
   * Mark a player offline but keep them in the game dictionary so they can rejoin.
   * @param {string} userId
   */
  setPlayerOffline(userId) {
    const player = this.players[userId];
    if (player) {
      player.isOnline = false;
      player.currentSocketId = null;
      this.io.to(this.gameId).emit('playerListUpdated', this.getAllPlayers());
      // Note: We don't remove them from turn order, just mark offline
    }
  }

  /**
   * Physically remove the player from our data store (optional).
   * This is now used only if you really want them gone for good.
   */
  removePlayerPermanently(userId) {
    if (this.players[userId]) {
      const player = this.players[userId];
      this.returnColor(player.getColor());
      this.spawnManager.returnPreGameSpawn(userId);
      delete this.players[userId];
      this.turnManager.removePlayer(userId);
      this.io.to(this.gameId).emit('playerListUpdated', this.getAllPlayers());
    }
  }

/**
 * Update current player, excluding spectators from consideration
 */
updateCurrentPlayer(joinOrLeaveUserId) {
  // Get non-spectator player IDs
  const playerIds = Object.entries(this.players)
    .filter(([_, player]) => !player.isSpectator)
    .map(([id, _]) => id);

  // If we have no current player and we just added someone, pick them
  if (!this.currentPlayer && playerIds.length > 0) {
    // Make sure the new player isn't a spectator
    const newPlayer = this.players[joinOrLeaveUserId];
    if (!newPlayer?.isSpectator) {
      this.currentPlayer = joinOrLeaveUserId;
      this.turnManager.broadcastTurnUpdate();
      this.startTurnTimer();
    }
  }
  // If the current player just left or was removed
  else if (
    this.currentPlayer === joinOrLeaveUserId &&
    (!this.players[joinOrLeaveUserId] || this.players[joinOrLeaveUserId].isSpectator) &&
    playerIds.length > 0
  ) {
    this.currentPlayer = playerIds[0]; // pick the first non-spectator in the list
    this.turnManager.broadcastTurnUpdate();
    this.startTurnTimer();
  }
  // If no non-spectator players left
  else if (playerIds.length === 0) {
    this.currentPlayer = null;
    this.stopTurnTimer();
  }
}

/**
 * Ensure current turn is valid, excluding spectators
 */
ensureTurnIsValid() {
  const nonSpectatorIds = Object.entries(this.players)
    .filter(([_, player]) => !player.isSpectator)
    .map(([id, _]) => id);

  if (!this.currentPlayer || 
      !this.players[this.currentPlayer] || 
      this.players[this.currentPlayer].isSpectator) {
    if (nonSpectatorIds.length > 0) {
      this.currentPlayer = nonSpectatorIds[0];
      this.turnManager.broadcastTurnUpdate();
      this.startTurnTimer();
    }
  } else {
    // If we already had a valid non-spectator current player, just continue
    this.turnManager.broadcastTurnUpdate();
    this.startTurnTimer();
  }
}
  /**
   * Start the turn timer
   */
  startTurnTimer() {
    this.turnManager.startTurnTimer();
  }

  /**
   * Stop the turn timer
   */
  stopTurnTimer() {
    this.turnManager.stopTurnTimer();
  }

  /**
   * Move to the next player's turn
   */
  advanceTurn() {
    this.turnManager.advanceTurn(this);
    const currentPlayerId = this.getCurrentPlayerId();
    this.broadcastPlayerUpdate(currentPlayerId)
  }
  
  // Example method to clear timeouts if needed
  clearBroadcasts() {
    this.timeoutIds.forEach(timeoutId => clearTimeout(timeoutId));
  }

  // For the client side Player List
  getAllPlayers() {
    const regularPlayers = [];
    const spectators = [];
    
    // First, separate players and spectators
    const processPlayer = (userId) => {
      const player = this.players[userId];
      const playerData = {
        id: userId,
        name: player.getName(),
        color: '#' + player.getColor().toString(16).padStart(6, '0'),
        health: player.getHealth(),
        armor: player.getArmor(),
        shield: player.getShield(),
        isOnline: player.isOnline ?? false,
        isReady: player.isReady,
        isSpectator: player.isSpectator ?? false,
        isCurrent: userId === this.getCurrentPlayerId()
      };
      
      if (player.isSpectator) {
        spectators.push(playerData);
      } else {
        regularPlayers.push(playerData);
      }
    };

    // If we have a turn order, use it to sort regular players
    if (this.turnManager.playerOrder && this.turnManager.playerOrder.length > 0) {
      // Process players in turn order
      this.turnManager.playerOrder.forEach(processPlayer);
      
      // Process any players that might not be in turn order
      Object.keys(this.players).forEach(userId => {
        if (!this.turnManager.playerOrder.includes(userId)) {
          processPlayer(userId);
        }
      });
    } else {
      // No turn order, just process all players
      Object.keys(this.players).forEach(processPlayer);
    }

    // Return combined array with spectators at the end
    return [...regularPlayers, ...spectators];
  }
  
  
  /**
   * Return an object of all player states: { [userId]: playerState, ... }
   */
  getAllPlayerStates() {
    const result = {};
    for (const userId in this.players) {
      result[userId] = this.players[userId].getState();
    }
    return result;
  }

  /**
   * Return the underlying players object (if needed)
   */
  getPlayersObject() {
    return this.players;
  }

  /**
   * Return how many players are currently in this game
   */
  getPlayerCount() {
    return Object.values(this.players)
      .filter(player => !player.isSpectator).length;
  }

  /**
   * Retrieve a single Player instance by userId
   */
  getPlayer(userId) {
    return this.players[userId] || null;
  }

  /**
   * Broadcast an updated state for the specified player to everyone in this game.
   */
  broadcastPlayerUpdate(userId) {
    if (!this.players[userId]) return;
    this.io.to(this.gameId).emit('playerUpdate', {
      id: userId,
      state: this.players[userId].getState()
    });
  }

  /**
   * Broadcast player respawn
   */
  broadcastPlayerRespawn(userId) {
    if (!this.players[userId]) return;
    this.io.to(this.gameId).emit('playerRespawn', {
      id: userId,
      state: this.players[userId].getState()
    });
  }

  /**
   * Adjust each player's Y-position so they sit on top of the terrain
   */
  adjustPositionsToTerrain() {
    const GROUND_OFFSET = 2;
    for (const [userId, tank] of Object.entries(this.players)) {
      const pos = tank.getPosition();
      const newTerrainY = this.terrainManager.getHeightAtPosition(
        pos.x,
        pos.z
      );
      const desiredY = newTerrainY + GROUND_OFFSET;

      if (pos.y > desiredY) {
        tank.setPosition({ x: pos.x, y: desiredY, z: pos.z });
        this.broadcastPlayerUpdate(userId);
      }
    }
  }

/**
 * Initialize turns with proper random order
 */
initializeTurns() {
  // Filter out spectators when initializing turns
  const playerIds = Object.entries(this.players)
    .filter(([_, player]) => !player.isSpectator)
    .map(([id, _]) => id);

  if (playerIds.length >= 2) {
    playerIds.forEach(id => this.turnManager.addPlayer(id));
    this.turnManager.randomizeOrder();
    this.currentPlayer = this.turnManager.getCurrentPlayerId();
    this.turnManager.startTurnTimer();
  }
}

/**
 * Process weapon changes (block spectators)
 */
processWeaponChange(tankId, weaponCode) {
  const player = this.getPlayer(tankId);
  if (!player || player.isSpectator) return;
  player.selectedWeapon = weaponCode;
  this.broadcastPlayerUpdate(tankId);
}

/**
 * Process item changes (block spectators)
 */
processItemChange(tankId, itemCode) {
  const player = this.getPlayer(tankId);
  if (!player || player.isSpectator) return;
  player.selectedItem = itemCode;
  this.broadcastPlayerUpdate(tankId);
}

/**
   * Get the current player's ID
   */
  getCurrentPlayerId() {
    return this.turnManager.getCurrentPlayerId();
  }

  /**
   * Check if it's a specific player's turn
   */
  isPlayerTurn(userId) {
    return this.turnManager.getCurrentPlayerId() === userId;
  }

  /**
   * Get time remaining in current turn
   */
  getTimeLeft() {
    return this.turnManager.getTimeRemaining();
  }

  /**
   * Clean up all player data when the game is destroyed
   */
  destroy() {
    this.stopTurnTimer();
    for (const [userId, player] of Object.entries(this.players)) {
      this.returnColor(player.getColor());
      player.destroy?.();
    }
    
    this.players = {};
    this.turnManager.destroy();
    this.spawnManager.destroy?.();
    
    this.turnManager = null;
    this.spawnManager = null;
    this.io = null;
    this.terrainManager = null;
    this.itemManager = null;
    this.gameId = null;
    
    this.availableColors = [...AVAILABLE_COLORS];
  }
}