// roundManager.js

/**
 * Enum for game phases to make state management more explicit
 */
export const GamePhase = {
    WAITING_FOR_PLAYERS: 'WAITING_FOR_PLAYERS',
    COUNTDOWN: 'COUNTDOWN',
    STARTING_SOON: 'STARTING_SOON',
    SHOPPING: 'SHOPPING',
    ROUND_IN_PROGRESS: 'ROUND_IN_PROGRESS',
    ROUND_ENDING: 'ROUND_ENDING',
    GAME_OVER: 'GAME_OVER'
  };
  
  export default class RoundManager {
    /**
     * Creates a new round manager.
     * @param {GameInstance} gameInstance - Reference to the parent game instance
     * @param {number} totalRounds - Total number of rounds to play
     * @param {number} shoppingDuration - Duration of shopping phase in ms
     * @param {number} startDelay - Delay before starting round after announcement
     */
    constructor(gameInstance, totalRounds = 3, shoppingDuration = 1000, startDelay = 1000) {
      this.gameInstance = gameInstance;
      this.totalRounds = totalRounds;
      this.currentRound = 0; // Start at 0, increment when starting new round
      this.shoppingDuration = shoppingDuration;
      this.startDelay = startDelay;
      
      // Bind methods to preserve 'this' context
      this.checkGameStart = this.checkGameStart.bind(this);
      this.startNextRound = this.startNextRound.bind(this);
      this.startShoppingPhase = this.startShoppingPhase.bind(this);
      this.checkRoundOver = this.checkRoundOver.bind(this);
    }
  
    /**
     * Check if we have enough players to start the game
     */
    checkGameStart() {
      if (this.gameInstance._isDestroyed) return;
      
      const numPlayers = this.gameInstance.playerManager.getPlayerCount();
      if (numPlayers >= this.gameInstance.minPlayers && 
          this.gameInstance.gameState === GamePhase.WAITING_FOR_PLAYERS) {
      }
    }
  
    /**
     * Announce game is starting soon and trigger shopping phase
     */
    async announceGameStarting() {
      if (this.gameInstance._isDestroyed) return;
  
      this.gameInstance.gameState = GamePhase.STARTING_SOON;
      this.gameInstance.broadcastGameState();
      
      // Notify clients game is starting
      this.gameInstance.io.to(this.gameInstance.gameId).emit('gameStartingSoon', this.startDelay);
  
      // Wait the start delay then begin shopping
      await new Promise(resolve => setTimeout(resolve, this.startDelay));
      if (!this.gameInstance._isDestroyed) {
        this.startShoppingPhase();
      }
    }
  
    /**
     * Start shopping phase before round begins
     */
    async startShoppingPhase() {
        if (this.gameInstance._isDestroyed) return;
      
        this.gameInstance.gameState = GamePhase.SHOPPING;
        this.gameInstance.broadcastGameState();
      
        // Send available items and duration to clients
        console.log(`[SHOPPING PHASE BEGIN] Shopping for ${this.shoppingDuration} seconds.`)
        this.gameInstance.io.to(this.gameInstance.gameId).emit('shoppingPhase', {
          items: this.gameInstance.itemManager.getAllItems(),
          duration: this.shoppingDuration
        });
      
        // Set timer for fade in 5 seconds before shopping ends
        const sixSecondsBeforeEnd = this.shoppingDuration - 5000;
        setTimeout(() => {
          if (!this.gameInstance._isDestroyed) {
            // Emit an event to notify clients about 5 seconds remaining
            this.gameInstance.io.to(this.gameInstance.gameId).emit('unfadeShopBackground');
          }
        }, sixSecondsBeforeEnd);
      
        // Wait half the shopping duration
        await new Promise(resolve => setTimeout(resolve, this.shoppingDuration / 2));
        if (this.gameInstance._isDestroyed) return;
      
        // Reset terrain and positions mid-shopping
        this.gameInstance.resetForNextRound();

        // Wait remainder of shopping duration
        await new Promise(resolve => setTimeout(resolve, this.shoppingDuration / 2));
        if (this.gameInstance._isDestroyed) return;
      
        if (this.currentRound !== 0) {
          // First verify gameInstance exists
          if (!this.gameInstance?.playerManager) {
            console.error('PlayerManager not initialized');
            return;
          }
        
          const playerManager = this.gameInstance.playerManager;
          playerManager.advanceTurn();
          playerManager.currentPlayerHasFired = false;
          playerManager.currentPlayer = playerManager.turnManager.getCurrentPlayerId();
        }        
        
        // Start the next round
        this.startNextRound();
      }

    /**
     * Start the next round of gameplay
     */
    async startNextRound() {
      if (this.gameInstance._isDestroyed) return;
  
      this.currentRound++;
      console.log(`[ROUND MANAGER] Game [${this.gameInstance.gameId}] - Round ${this.currentRound} starting!`);
  
      if (this.currentRound === 1) {
        this.gameInstance.playerManager.initializeTurns();
      }

      // Announce round starting
      this.gameInstance.io.to(this.gameInstance.gameId).emit('roundStarting', this.currentRound, this.totalRounds);
      // Short delay then start round
      await new Promise(resolve => setTimeout(resolve, 3000));
      if (this.gameInstance._isDestroyed) return;
  
      this.gameInstance.gameState = GamePhase.ROUND_IN_PROGRESS;

      this.gameInstance.io.to(this.gameInstance.gameId).emit('playerListUpdated', this.gameInstance.playerManager.getAllPlayers());
      this.gameInstance.broadcastGameState();
      this.gameInstance.playerManager.ensureTurnIsValid();
    }
  
    /**
     * Check if the round should end (called after projectile impacts)
     * @returns {boolean} True if round should end
     */
/**
 * Check if the round should end (called after projectile impacts)
 * @returns {boolean} True if round should end
 */
async checkRoundOver() {
  if (this.gameInstance._isDestroyed || 
      this.gameInstance.gameState !== GamePhase.ROUND_IN_PROGRESS) {
    return false;
  }

  // Count alive non-spectator players
  const alivePlayers = Object.values(this.gameInstance.playerManager.players)
    .filter(p => p.isOnline && p.getHealth() > 0 && !p.isSpectator);

  // Get total non-spectator players
  const totalNonSpectatorPlayers = Object.values(this.gameInstance.playerManager.players)
    .filter(p => !p.isSpectator).length;

  // End round if 0-1 players left (excluding spectators)
  if (alivePlayers.length <= 1 && totalNonSpectatorPlayers !== 1) {
    // Add 3 second delay
    await new Promise(resolve => setTimeout(resolve, 3000));
    this.handleRoundEnd();
    return true;
  }

  return false;
}
    /**
     * Handle the end of a round
     */
    async handleRoundEnd() {
      if (this.gameInstance._isDestroyed) return;
  
      this.gameInstance.gameState = GamePhase.ROUND_ENDING;
      this.gameInstance.broadcastGameState();
  
      // Announce round end
      this.gameInstance.io.to(this.gameInstance.gameId).emit('roundEnded', this.currentRound, this.totalRounds);
  
      // Short delay then either start shopping or end game
      await new Promise(resolve => setTimeout(resolve, 3000));
      if (this.gameInstance._isDestroyed) return;
  
      if (this.currentRound >= this.totalRounds) {
        this.endGame();
      } else {
        this.startShoppingPhase();
      }
    }
  
    /**
     * End the game completely
     */
    endGame() {
      if (this.gameInstance._isDestroyed) return;
  
      this.gameInstance.gameState = GamePhase.GAME_OVER;
      this.gameInstance.broadcastGameState();
  
      // Announce game over with final stats
      this.gameInstance.io.to(this.gameInstance.gameId).emit('gameOver', {
        players: this.gameInstance.playerManager.getAllPlayerStates()
      });
  
      console.log(`Game [${this.gameInstance.gameId}] - Game over after ${this.currentRound} rounds.`);
      
      // Cleanup after brief delay
      setTimeout(() => {
        if (!this.gameInstance._isDestroyed) {
          this.gameInstance.destroy();
        }
      }, 5000);
    }
  
    /**
     * Clean up the round manager
     */
    destroy() {
      this.gameInstance = null;
    }
  }