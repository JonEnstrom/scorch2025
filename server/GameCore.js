// server/GameCore.js
import { GameNetworking } from './GameNetworking.js';
import PlayerManager from './PlayerManager.js';
import TerrainManager from './TerrainManager.js';
import ItemManager from './ItemManager.js';
import { registerPlayerSocketHandlers } from './SocketHandlers.js';
import { processInput } from './PlayerInput.js';
import RoundManager, { GamePhase } from './RoundManager.js';
import HelicopterManager from './HelicopterManager.js';
import ArmorShieldManager from './ArmorShieldManager.js';
import CPUPlayer from './CPUPlayer.js';
import { checkAllPlayersReady, startReadyCountdown, cancelReadyCountdown } from './ReadyCheck.js';
import PrecalculatedProjectileManager from './PrecalculatedProjectileManager.js';

export default class GameCore {
  constructor(
    io,
    gameId,
    seed,
    theme,
    totalRounds,
    cpuPlayers,
    numPlayers,
    onDestroyCb = null,
    cpuNames = []
  ) {
    this.networking = new GameNetworking(io, gameId);
    this.gameId = gameId;
    this.cpuNames = cpuNames;
    this.onDestroyCb = onDestroyCb;
    this.seed = seed;
    this.theme = theme;
    this.numPlayers = numPlayers;
    this.numCpuPlayers = cpuPlayers;
    this.gameState = GamePhase.WAITING_FOR_PLAYERS;
    
    // Initialize managers
    this.terrainManager = new TerrainManager({ seed: 1, theme: 'grassland' }, true);
    this.itemManager = new ItemManager();
    this.playerManager = new PlayerManager(this.networking.io, this.terrainManager, this.itemManager, gameId, this);
    this.helicopterManager = new HelicopterManager(this.networking.io, this.gameId, this.terrainManager);
    this.projectileManager = new PrecalculatedProjectileManager(
      this.networking.io,
      this.gameId,
      this.terrainManager,
      this.helicopterManager
    );
    this.helicopterManager.projectileManager = this.projectileManager;
        this.roundManager = new RoundManager(this, totalRounds);

    // Timer and state management
    this.readyCheckTimer = null;
    this.isProcessingTurnChange = false;
    this.turnChangeDelay = 4000;
    this.lastUpdateTime = Date.now();
    this.updateInterval = 1000 / 200;
    this.emptyGameTimer = null;
    this.EMPTY_GAME_TIMEOUT = 60000;
    this.lastPlayerLeftTime = null;

    // Initialize game
    this.projectileManager.setImpactHandler((impactEvent) => {
      this.handleProjectileImpact(impactEvent);
    });

    // CPU Players get added to the game AFTER the first human player joins.
    this.cpuPlayersAdded = false;

    // If this is an all-CPU game, add the CPU players immediately
    if (this.numPlayers === this.numCpuPlayers && this.numCpuPlayers > 0) {
      for (let i = 0; i < this.numCpuPlayers; i++) {
        this.addCpuPlayer();
      }
      this.cpuPlayersAdded = true;
    }
    
    console.log(`[NEW GAME CREATED] New Game [${gameId}] created (seed: ${seed}, theme: ${theme}).`);
    this.broadcastLobbyInfo();
  }

  getRandomCpuName() {
    if (!this.usedCpuNames) {
      this.usedCpuNames = new Set();
    }
    
    const namesPool = this.cpuNames.length > 0 ? this.cpuNames : [
      'CPU_Alpha', 'CPU_Beta', 'CPU_Gamma', 'CPU_Delta', 
      'CPU_Epsilon', 'CPU_Zeta', 'CPU_Eta', 'CPU_Theta',
      'CPU_Iota', 'CPU_Kappa', 'CPU_Lambda', 'CPU_Mu',
      'CPU_Nu', 'CPU_Xi', 'CPU_Omicron', 'CPU_Pi'
    ];
    
    const availableNames = namesPool.filter(name => !this.usedCpuNames.has(name));
    
    if (availableNames.length === 0) {
      this.usedCpuNames.clear();
      return this.getRandomCpuName();
    }
    
    const randomName = availableNames[Math.floor(Math.random() * availableNames.length)];
    this.usedCpuNames.add(randomName);
    return randomName;
  }

  addCpuPlayer(cpuName) {
    if (!cpuName) {
      cpuName = this.getRandomCpuName();
    }

    const dummySocket = {
      id: `cpu_${Date.now()}_${Math.random()}`,
      join: () => {},
      emit: () => {}
    };

    const userId = `cpu_${Object.keys(this.playerManager.players).length + 1}`;
    const isPreGame = this.roundManager.currentRound === 0;
    const spawnPoint = this.playerManager.spawnManager.generateSpawnPoint(userId, isPreGame);

    const cpuPlayer = new CPUPlayer(spawnPoint.x, spawnPoint.y, spawnPoint.z);
    cpuPlayer.currentSocketId = dummySocket.id;
    cpuPlayer.isOnline = true;
    cpuPlayer.isNewlyCreated = true;
    cpuPlayer.setName(cpuName);

    if (this.itemManager) {
      const starterItems = this.itemManager.getStarterItems();
      starterItems.forEach((starter) => {
        const item = this.itemManager.getItemByName(starter.name);
        if (item) {
          cpuPlayer.addItem(item, starter.quantity);
        }
      });
    }

    try {
      cpuPlayer.setColor(this.playerManager.getUniqueColor());
    } catch (error) {
      cpuPlayer.setColor(Math.random() * 0xffffff);
    }

    this.playerManager.players[userId] = cpuPlayer;
    this.playerManager.turnManager.addPlayer(userId, cpuName);

    this.networking.io.to(this.gameId).emit('playerJoined', {
      id: userId,
      state: cpuPlayer.getState(),
      isPreGame: isPreGame,
    });
    this.networking.io.to(this.gameId).emit('playerListUpdated', this.playerManager.getAllPlayers());
    this.broadcastLobbyInfo();
    cpuPlayer.autoReady(this, userId);
  }

  setPlayerReadyStatus(userId, isReady) {
    const player = this.playerManager.players[userId];
    if (!player) return;
    player.isReady = isReady;

    this.networking.io.to(this.gameId).emit('playerReadyStatusChanged', {
      id: userId,
      isReady: isReady,
    });

    this.networking.io.to(this.gameId).emit('playerListUpdated', this.playerManager.getAllPlayers());
    checkAllPlayersReady(this);
    this.broadcastLobbyInfo();
  }

  addPlayer(socket, playerName, isSpectator = false) {
    const userId = socket.playerId || this.extractPlayerIdFromCookie(socket);
    
    if (!userId) {
      this.networking.emitToSocket(socket, 'errorMessage', 'No playerId found.');
      return;
    }
  
    if (this.gameState === 'GAME_OVER') {
      this.networking.emitToSocket(socket, 'errorMessage', 'Game is already over.');
      return;
    }

    // Check if player exists in this game
    const existingPlayer = this.playerManager.getPlayer(userId);
    
    // Handle spectators first - they can always join
    if (isSpectator) {
      this.handleSpectatorJoin(socket, userId, playerName);
      return;
    }

    // For non-spectators, validate join conditions
    if (this.gameState === GamePhase.WAITING_FOR_PLAYERS) {
      // New players can join only if game isn't full
      if (!existingPlayer && !this.isFull()) {
        this.handleNewPlayerJoin(socket, userId, playerName);
        return;
      }
      // Existing players can rejoin
      if (existingPlayer) {
        this.handlePlayerRejoin(socket, userId, playerName);
        return;
      }
    } else {
      // Game in progress - only offline players can rejoin
      if (existingPlayer && !existingPlayer.isOnline) {
        this.handlePlayerRejoin(socket, userId, playerName);
        return;
      }
    }

    // If we get here, the join is not allowed
    let errorMessage = 'Cannot join the game. ';
    if (this.isFull()) {
      errorMessage += 'Game is full.';
    } else if (this.gameState !== GamePhase.WAITING_FOR_PLAYERS) {
      errorMessage += 'Game is in progress and you were not previously in this game.';
    } else {
      errorMessage += 'Join conditions not met.';
    }
    
    this.networking.emitToSocket(socket, 'errorMessage', errorMessage);
  }

  handleSpectatorJoin(socket, userId, playerName) {
    const socketWrapper = this.networking.wrapSocket(socket, userId);
    console.log(`[SPECTATOR JOINED] ${playerName} joined game [${this.gameId}] as spectator`);
    
    this.setupPlayerInGame(socketWrapper, userId, playerName, true);
  }

  handleNewPlayerJoin(socket, userId, playerName) {
    const socketWrapper = this.networking.wrapSocket(socket, userId);
    console.log(`[NEW PLAYER] ${playerName} joined game [${this.gameId}]`);
    
    this.setupPlayerInGame(socketWrapper, userId, playerName, false);
  }

  handlePlayerRejoin(socket, userId, playerName) {
    const existingPlayer = this.playerManager.getPlayer(userId);
    
    // Clean up old socket handlers
    if (existingPlayer.currentSocketId) {
      this.networking.io.emit('CLEANUP_SOCKET_HANDLERS', {
        oldSocketId: existingPlayer.currentSocketId,
        playerId: userId
      });
    }

    const socketWrapper = this.networking.wrapSocket(socket, userId);
    console.log(`[REJOIN] ${playerName} rejoined game [${this.gameId}]`);
    
    this.setupPlayerInGame(socketWrapper, userId, playerName, false);
  }

  setupPlayerInGame(socketWrapper, userId, playerName, isSpectator) {
    const isPreGame = this.roundManager.currentRound === 0;
    this.playerManager.addPlayer(userId, socketWrapper, playerName, isPreGame, isSpectator);
    registerPlayerSocketHandlers(socketWrapper, this);

    const player = this.playerManager.getPlayer(userId);
    if (!player) {
      this.networking.emitToSocket(socketWrapper, 'errorMessage', 'Failed to create or retrieve player object.');
      return;
    }

    player.isReady = isSpectator || (player.isReady && !isPreGame);

    if (player.isOnline && player.isNewlyCreated) {
      socketWrapper.broadcast.to(this.gameId).emit('playerJoined', {
        id: userId,
        state: player.getState(),
        isPreGame: isPreGame,
      });
    } else {
      socketWrapper.broadcast.to(this.gameId).emit('playerRejoined', {
        id: userId,
      });
    }

    // Send game state to player
    socketWrapper.emit('gameSetup', {
      terrain: this.terrainManager.getTerrainData(),
      players: this.playerManager.getAllPlayerStates(),
      playerId: userId,
      currentPlayerId: this.playerManager.currentPlayer,
      gameState: this.gameState,
      turnTimeRemaining: this.playerManager.getTimeLeft(),
      currentRound: this.roundManager.currentRound,
      totalRounds: this.roundManager.totalRounds,
    });

    // Send additional game data
    if (this.terrainManager.foliageSpawnPoints) {
      this.networking.io.to(this.gameId).emit('foliagePoints', this.terrainManager.foliageSpawnPoints);
    }
    if (this.helicopterManager) {
      const helicopterStates = Array.from(this.helicopterManager.helicopters.values()).map((heli) => heli.getState());
      socketWrapper.emit('spawnExistingHelicopters', helicopterStates);
    }

    this.broadcastGameState();
    this.networking.io.to(this.gameId).emit('playerListUpdated', this.playerManager.getAllPlayers());
    
    if (this.gameState === GamePhase.WAITING_FOR_PLAYERS) {
      checkAllPlayersReady(this);
    }

    // Handle CPU players if needed
    if (!this.cpuPlayersAdded) {
      if (!isSpectator || this.numPlayers === this.numCpuPlayers) {
        for (let i = 0; i < this.numCpuPlayers; i++) {
          this.addCpuPlayer();
        }
        this.cpuPlayersAdded = true;
        this.networking.io.to(this.gameId).emit('playerListUpdated', this.playerManager.getAllPlayers());
      }
    }

    this.clearEmptyGameTimer();
    this.lastPlayerLeftTime = null;
    this.broadcastLobbyInfo();
  }
  
  extractPlayerIdFromCookie(socket) {
    if (socket.playerId) return socket.playerId;

    const cookies = socket.handshake?.headers?.cookie || '';
    const match = cookies.match(/playerId=([^;]+)/);
    return match ? decodeURIComponent(match[1]) : null;
  }

  removePlayer(userId) {
    if (this._isDestroyed) return;

    const gonePlayer = this.playerManager.getPlayer(userId);
    if (!gonePlayer) return;

    const isPreGame = this.roundManager.currentRound === 0;

    if (isPreGame || gonePlayer.isSpectator) {
      if (gonePlayer.isSpectator) {
        console.log(`[SPECTATOR LEFT] Spectator ${gonePlayer.getName()} removed from game [${this.gameId}]`);
      }
      
      delete this.playerManager.players[userId];
      this.playerManager.turnManager.removePlayer(userId);
      
      this.networking.io.to(this.gameId).emit('playerLeft', {
        id: userId,
        state: gonePlayer.getState()
      });
    } else {
      this.playerManager.setPlayerOffline(userId);
      
      this.networking.io.to(this.gameId).emit('playerWentOffline', {
        id: userId,
        state: gonePlayer.getState()
      });
    }

    this.networking.io.to(this.gameId).emit('playerListUpdated', this.playerManager.getAllPlayers());

    this.checkForActivePlayers();
    if (this.gameState === GamePhase.WAITING_FOR_PLAYERS) {
      checkAllPlayersReady(this);
    }
    this.broadcastLobbyInfo();
  }

  // Updated resetForNextRound using asynchronous terrain generation (chunking)
  async resetForNextRound() {
    const themes = ['grassland', 'arctic', 'desert'];
    const randomTheme = themes[Math.floor(Math.random() * themes.length)];

    // Create a new TerrainManager instance with the desired seed and theme.
    this.terrainManager = new TerrainManager({
      seed: this.seed * 10,
      theme: randomTheme
    });

    // Await the asynchronous terrain generation.
    this.terrainManager.terrainData = await this.terrainManager.generator.generate();
    
    // Generate foliage spawn points based on the newly generated terrain.
    this.terrainManager.foliageSpawnPoints = this.terrainManager.makeFoliageSpawnPoints({
      theme: this.terrainManager.theme,
      maxSpots: 100,
      minDistance: 25,
      gridSize: 3,
      width: this.terrainManager.terrainData.width,
      depth: this.terrainManager.terrainData.depth,
      slopeThreshold: 2,
      maxAttemptsMultiplier: 4
    });

    // Update references in other managers.
    this.playerManager.terrainManager = this.terrainManager;
    this.playerManager.spawnManager.terrainManager = this.terrainManager;
    this.projectileManager.terrainManager = this.terrainManager;
    this.helicopterManager.terrainManager = this.terrainManager;

    // Emit the new terrain and foliage points to clients.
    this.networking.io.to(this.gameId).emit('newTerrain', {
      terrain: this.terrainManager.getTerrainData(),
    });
    this.networking.io.to(this.gameId).emit('foliagePoints', this.terrainManager.foliageSpawnPoints);

    this.playerManager.resetPlayersForNextRound();
    this.broadcastLobbyInfo();
  }

  processPlayerInput(userId, input) {
    processInput(userId, input, this);
  }

  broadcastGameState() {
    if (this._isDestroyed) return;
    this.networking.broadcastGameState(
      this.gameState,
      this.roundManager.currentRound,
      this.roundManager.totalRounds
    );
  }

  addShieldToPlayer(playerId) {
    this.networking.io.to(this.gameId).emit('addShield', playerId);
  }

  broadcastRoundStartingSoon(currentRound, totalRounds) {
    if (this._isDestroyed) return;
    this.networking.broadcastRoundStartingSoon(currentRound, totalRounds);
  }

  handleProjectileImpact(impactEvent) {
    if (this._isDestroyed) {
      return;
    }
  
    // If this wasn't a helicopter hit, handle terrain & area damage.
    if (!impactEvent.isHelicopterHit) {
      const patch = this.terrainManager.modifyTerrain(
        impactEvent.position.x,
        impactEvent.position.z,
        impactEvent.craterSize,
        'crater'
      );
  
      const allPlayers = this.playerManager.getPlayersObject();
      for (const [userId, player] of Object.entries(allPlayers)) {
        if (!player.isAlive) continue;
  
        const playerPos = player.getPosition();
        const dx = playerPos.x - impactEvent.position.x;
        const dz = playerPos.z - impactEvent.position.z;
        const distance = Math.sqrt(dx * dx + dz * dz);
  
        // Area-of-effect damage
        if (distance < impactEvent.aoeSize) {
          const falloffPercent = (distance / impactEvent.aoeSize) * 0.5;
          const damageMultiplier = 1 - falloffPercent;
          const damage = Math.round(impactEvent.damage * damageMultiplier);
  
          // Changed from this.ArmorShieldManager to ArmorShieldManager
          const damageResult = ArmorShieldManager.applyDamage(player, damage);
  
          this.networking.io.to(this.gameId).emit('playerDamaged', {
            id: userId,
            damage: damage,
            damageDistribution: damageResult,
            currentHealth: player.getHealth()
          });
  
          if (player.getHealth() <= 0) {
            player.isAlive = false;
            this.networking.io.to(this.gameId).emit('playerDefeated', { id: userId });
          }
          this.networking.io.to(this.gameId).emit('playerListUpdated', this.playerManager.getAllPlayers());
        }
      }
  
      // Re-adjust any players that might be standing where terrain changed.
      this.playerManager.adjustPositionsToTerrain();
    }
  }

  isFull() {
    const nonSpectatorCount = Object.values(this.playerManager.players)
      .filter(player => !player.isSpectator).length;
    return nonSpectatorCount >= this.numPlayers;
  }

  checkForActivePlayers() {
    const hasOnlineHumanPlayers = Object.values(this.playerManager.players).some(player =>
      player.isOnline && 
      !player.currentSocketId.startsWith('cpu_') && 
      !player.isSpectator
    );
  
    if (!hasOnlineHumanPlayers) {
      if (this.lastPlayerLeftTime === null) {
        this.lastPlayerLeftTime = Date.now();
        this.startEmptyGameTimer();
      }
    } else {
      this.clearEmptyGameTimer();
      this.lastPlayerLeftTime = null;
    }
  }
  
  startEmptyGameTimer() {
    this.clearEmptyGameTimer();

    this.emptyGameTimer = setTimeout(() => {
      const hasOnlinePlayers = Object.values(this.playerManager.players).some(player => player.isOnline);
      if (!hasOnlinePlayers) {
        console.log(`[GAME INACTIVE] Game [${this.gameId}] had no active players for ${this.EMPTY_GAME_TIMEOUT}ms. Shutting down.`);
        this.destroy();
      }
    }, this.EMPTY_GAME_TIMEOUT);
  }

  clearEmptyGameTimer() {
    if (this.emptyGameTimer) {
      clearTimeout(this.emptyGameTimer);
      this.emptyGameTimer = null;
    }
  }
  

  getLobbyInfo() {
    const allPlayers = Object.values(this.playerManager.players)
      .filter(player => !player.isSpectator);
    const slots = [];
    
    for (let i = 0; i < 8; i++) {
      if (i < this.numPlayers) {
        if (i < allPlayers.length) {
          const player = allPlayers[i];
          const type = (player.currentSocketId && player.currentSocketId.startsWith('cpu_')) ? 'cpu' : 'human';
          slots.push({ 
            state: type, 
            name: player.name,
            health: player.getHealth(),
            maxHealth: player.maxHealth
          });
        } else {
          slots.push({ state: 'open' });
        }
      } else {
        slots.push({ state: 'closed' });
      }
    }
    return {
      gameName: this.gameId,
      state: this.gameState,
      slots: slots,
      currentRound: this.roundManager.currentRound,
      totalRounds: this.roundManager.totalRounds
    };
  }

  
  
  closeRemainingSlots() {
    const currentPlayerCount = Object.values(this.playerManager.players)
      .filter(player => !player.isSpectator).length;
    
    // Update numPlayers to match current players
    this.numPlayers = currentPlayerCount;
    
    console.log(`[GAME STARTED] Closing remaining slots. Player count locked at: ${this.numPlayers}`);
    this.broadcastLobbyInfo();
  }

  broadcastLobbyInfo() {
    const lobbyInfo = this.getLobbyInfo();
    this.networking.broadcastLobbyInfo(lobbyInfo);
  }

  destroy() {
    if (this._isDestroyed) return;
    this._isDestroyed = true;

    if (this.playerManager) {
      this.playerManager.stopTurnTimer();
    }

    // Clean up socket listeners
    if (this.networking.io) {
      try {
        const allPlayers = this.playerManager?.getPlayersObject() || {};
        for (const [userId, player] of Object.entries(allPlayers)) {
          const socketId = player.currentSocketId;
          if (socketId) {
            const socket = this.networking.io.sockets?.sockets.get(socketId);
            if (socket) {
              socket.removeAllListeners('clientInput');
              socket.removeAllListeners('purchaseRequest');
              socket.leave(this.gameId);
            }
          }
        }
      } catch (error) {
        console.error('Error during socket cleanup:', error);
      }
    }

    // Clean up managers
    this.playerManager?.destroy();
    this.terrainManager?.destroy();
    this.itemManager?.destroy();
    this.roundManager?.destroy();
    this.helicopterManager?.destroy();
    this.helicopterManager = null;

    this.clearEmptyGameTimer();
    this.lastPlayerLeftTime = null;

    // Null out references
    this.projectileManager = null;
    this.playerManager = null;
    this.terrainManager = null;
    this.itemManager = null;
    this.roundManager = null;

    // Clean up networking
    this.networking.destroy();

    console.log(`GameInstance [${this.gameId}] destroyed.`);

    if (this.onDestroyCb) {
      this.onDestroyCb(this.gameId);
      this.onDestroyCb = null;
    }
  }
}
