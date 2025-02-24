// server/ReadyCheck.js
import { GamePhase } from './RoundManager.js';

export function areAllPlayersReady(gameCore) {
  const onlinePlayers = Object.values(gameCore.playerManager.players)
    .filter(p => p.isOnline && !p.isSpectator);
  return onlinePlayers.length > 0 && onlinePlayers.every(p => p.isReady);
}

export function startReadyCountdown(gameCore) {
  let countdownSeconds = 2;
  gameCore.gameState = GamePhase.COUNTDOWN;
  
  // Only adjust numPlayers if it's not an all-CPU game
  if (gameCore.numCpuPlayers !== gameCore.numPlayers) {
    gameCore.originalNumPlayers = gameCore.numPlayers;
    gameCore.numPlayers = Object.values(gameCore.playerManager.players)
      .filter(player => !player.isSpectator).length;
  }
    
  gameCore.broadcastLobbyInfo();
  gameCore.networking.io.to(gameCore.gameId).emit('readyCountdownStarted', countdownSeconds);

  gameCore.readyCountdown = setInterval(() => {
    countdownSeconds--;
    if (countdownSeconds > 0) {
      gameCore.networking.io.to(gameCore.gameId).emit('readyCountdownUpdate', countdownSeconds);
    } else {
      clearInterval(gameCore.readyCountdown);
      gameCore.readyCountdown = null;
      
      if (areAllPlayersReady(gameCore)) {
        // Slots are already closed, just need to clear the stored original count
        delete gameCore.originalNumPlayers;
        console.log(`[GAME STARTED] Player count locked at: ${gameCore.numPlayers}`);
        gameCore.broadcastLobbyInfo();
        
        // Then announce game starting
        gameCore.roundManager.announceGameStarting();
      } else {
        reopenSlots(gameCore);
        gameCore.networking.io.to(gameCore.gameId).emit('readyCountdownCancelled');
        gameCore.gameState = GamePhase.WAITING_FOR_PLAYERS;
        gameCore.broadcastLobbyInfo();
      }
    }
  }, 1000);
}

export function cancelReadyCountdown(gameCore) {
  if (gameCore.readyCountdown) {
    clearInterval(gameCore.readyCountdown);
    gameCore.readyCountdown = null;
    reopenSlots(gameCore);
    gameCore.networking.io.to(gameCore.gameId).emit('readyCountdownCancelled');
    gameCore.gameState = GamePhase.WAITING_FOR_PLAYERS;
    gameCore.broadcastLobbyInfo();
  }
}

function reopenSlots(gameCore) {
  // Restore original number of player slots if countdown was cancelled
  if (gameCore.originalNumPlayers !== undefined) {
    gameCore.numPlayers = gameCore.originalNumPlayers;
    delete gameCore.originalNumPlayers;
  }
}

export function checkAllPlayersReady(gameCore) {
  if (gameCore._isDestroyed || gameCore.gameState === GamePhase.GAME_OVER) return;

  if (areAllPlayersReady(gameCore)) {
    if (!gameCore.readyCountdown) {
      startReadyCountdown(gameCore);
    }
  } else {
    cancelReadyCountdown(gameCore);
  }
}