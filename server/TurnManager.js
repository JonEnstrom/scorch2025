// server/TurnManager.js
export default class TurnManager {
  /**
   * @param {Object} io - Socket.IO server
   * @param {string} gameId - The game room ID
   * @param {Object} playerManager - The PlayerManager instance
   * @param {Object} gameInstance - The GameInstance (needed for CPU simulation)
   */
  constructor(io, gameId, playerManager, gameInstance) {
    this.io = io;
    this.gameId = gameId;
    this.playerManager = playerManager;
    this.gameInstance = gameInstance; // New: store a reference to the game instance
    this.TURN_DURATION = 40000;

    this.players = new Map(); // Map of userId -> {id, name}
    this.playerOrder = [];    // Array of userIds in turn order
    this.currentTurnIndex = -1;
    
    this.turnTimer = null;
    this.turnStartTime = null;
  }

  getCurrentPlayerId() {
    if (this.currentTurnIndex === -1 || this.playerOrder.length === 0) {
      return null;
    }
    return this.playerOrder[this.currentTurnIndex];
  }

  getCurrentPlayerName() {
    const currentId = this.getCurrentPlayerId();
    return currentId ? this.players.get(currentId).name : null;
  }

  addPlayer(playerId, providedName) {
    if (!this.players.has(playerId)) {
      this.players.set(playerId, {
        id: playerId,
        name: providedName || playerId
      });
      this.playerOrder.push(playerId);
      
      if (this.playerOrder.length === 1) {
        this.currentTurnIndex = 0;
      }
    }
  }

  removePlayer(playerId) {
    const index = this.playerOrder.indexOf(playerId);
    if (index === -1) return;

    this.playerOrder.splice(index, 1);
    this.players.delete(playerId);

    if (this.playerOrder.length === 0) {
      this.currentTurnIndex = -1;
      this.stopTurnTimer();
    } else {
      if (index <= this.currentTurnIndex) {
        this.currentTurnIndex = Math.max(0, (this.currentTurnIndex - 1) % this.playerOrder.length);
      }
    }
  }

  broadcastPlayerListUpdate() {
    // Create the update list based on the current turn order
    const updatedList = this.playerOrder.map(playerId => {
      const playerData = this.playerManager.players[playerId];
      return {
        id: playerId,
        name: this.players.get(playerId).name,
        color: playerData.getColor(),
        health: playerData.getHealth(),
        isOnline: playerData.isOnline,
      };
    });
    this.io.to(this.gameId).emit('playerListUpdated', updatedList);
  }

  randomizeOrder() {
    // Randomize the player order
    for (let i = this.playerOrder.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.playerOrder[i], this.playerOrder[j]] = [this.playerOrder[j], this.playerOrder[i]];
    }
    
    // Set initial turn index if we have players
    if (this.playerOrder.length > 0) {
      this.currentTurnIndex = Math.floor(Math.random() * this.playerOrder.length);
    }

    // Broadcast the updated player list to reflect new order
    this.io.to(this.gameId).emit('playerListUpdated', this.playerManager.getAllPlayers());
  }


  startTurnTimer() {
    // Stop any previous timer.
    this.stopTurnTimer();
    if (this.currentTurnIndex === -1 || this.playerOrder.length === 0) {
      return;
    }
    // Start the turn timer.
    this.turnStartTime = Date.now();
    this.turnTimer = setTimeout(() => {
      this.advanceTurn();
    }, this.TURN_DURATION);
    // Notify all players of the turn update.
    this.broadcastTurnUpdate();

    const currentPlayerId = this.getCurrentPlayerId();
    const currentPlayer = this.playerManager.players[currentPlayerId];
    if (currentPlayer && currentPlayer.isCPU && typeof currentPlayer.simulateTurn === 'function') {
      // Have the CPU simulate its turn.
      currentPlayer.simulateTurn(this.gameInstance, currentPlayerId);
    }
  }

  stopTurnTimer() {
    if (this.turnTimer) {
      clearTimeout(this.turnTimer);
      this.turnTimer = null;
    }
    this.turnStartTime = null;
  }

  advanceTurn() {
    if (this.playerOrder.length === 0) return;
    
    // Clean up current CPU player if exists
    const currentPlayerId = this.getCurrentPlayerId();
    if (currentPlayerId) {
      const currentPlayer = this.playerManager.players[currentPlayerId];
      if (currentPlayer && currentPlayer.isCPU) {
        currentPlayer.clearTurnTimeouts();
      }
    }
    
    let checkedAllPlayers = false;
    let startIndex = this.currentTurnIndex;
    
    while (!checkedAllPlayers) {
      this.currentTurnIndex = (this.currentTurnIndex + 1) % this.playerOrder.length;
      const nextPlayer = this.playerOrder[this.currentTurnIndex];
      
      if (this.playerManager.players[nextPlayer].getHealth() > 0) {
        this.playerManager.currentPlayer = nextPlayer;
        this.startTurnTimer(); // This also broadcasts the turn update
        console.log(
          `[TURN CHANGED] Turn in game [${this.gameId}] switched to player: ${this.getCurrentPlayerName()} (#${this.getCurrentPlayerId()})`
        );
        return;
      }
      
      if (this.currentTurnIndex === startIndex) {
        checkedAllPlayers = true;
      }
    }
    
    console.log(`[GAME END] No healthy players remaining in game: [${this.gameId}]`);
    // Add any game-end logic here
  }
  
  getTimeRemaining() {
    if (!this.turnStartTime) return this.TURN_DURATION;
    const elapsed = Date.now() - this.turnStartTime;
    return Math.max(0, this.TURN_DURATION - elapsed);
  }

  broadcastTurnUpdate() {
    this.io.to(this.gameId).emit('turnUpdate', {
      currentPlayerId: this.getCurrentPlayerId(),
      turnTimeRemaining: this.getTimeRemaining(),
      turnStartTime: Date.now() // server timestamp
    });  
  }

  destroy() {
    this.stopTurnTimer();
    this.playerOrder = [];
    this.players.clear();
    this.currentTurnIndex = -1;
    this.io = null;
  }
}
