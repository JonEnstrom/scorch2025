import React, { useEffect, useState, useRef } from 'react';
import { useGame } from '../contexts/GameContext';
import './PlayerList.css';

function getHealthColor(health) {
  const percent = health / 100;
  if (percent > 0.6) {
    const t = (percent - 0.6) / 0.4; 
    const r = Math.round(255 * (1 - t));
    const g = 200;
    return `rgb(${r}, ${g}, 0)`;
  } else if (percent > 0.2) {
    const t = (percent - 0.2) / 0.4;
    const g = Math.round(255 * t);
    return `rgb(255, ${g}, 0)`;
  } else {
    return 'rgb(255,0,0)';
  }
}

const PlayerList = () => {
  const { game } = useGame();
  const [players, setPlayers] = useState([]);
  const [turnInfo, setTurnInfo] = useState({
    currentPlayerId: null,
    turnTimeRemaining: 0,
    turnStartServer: 0,
  });
  const [timeLeft, setTimeLeft] = useState(0);
  const intervalRef = useRef(null);
  
  // Initialize with currentPlayerId from game.playerManager
  const [currentTurnPlayerId, setCurrentTurnPlayerId] = useState(
    game?.playerManager?.currentPlayerId || null
  );
  const localPlayerId = game?.playerManager?.playerId;
  const isMyTurn = localPlayerId === currentTurnPlayerId;

  useEffect(() => {
    if (!game) return;

    // Handle player list updates
    const handlePlayerListUpdated = (data) => {
      setPlayers(data);

    };

    // Subscribe to player manager's current player changed event
    const handlePlayerChange = () => {
      if (game.playerManager) {
        const newCurrentPlayerId = game.playerManager.currentPlayerId;
        setCurrentTurnPlayerId(newCurrentPlayerId);
        // Update turnInfo state as well to keep both in sync
        setTurnInfo(prev => ({
          ...prev,
          currentPlayerId: newCurrentPlayerId
        }));
      }
    };

    // Handle turn updates from socket
    const handleTurnUpdate = (data) => {
      const { currentPlayerId, turnTimeRemaining, turnStartTime } = data;
      setCurrentTurnPlayerId(currentPlayerId);
      setTurnInfo({
        currentPlayerId,
        turnTimeRemaining,
        turnStartServer: turnStartTime,
      });
      setTimeLeft(turnTimeRemaining);
    };

    // Set up event listeners
    game.socket.on('playerListUpdated', handlePlayerListUpdated);
    game.socket.on('turnUpdate', handleTurnUpdate);
    
    // Subscribe to player manager events
    if (game.playerManager && game.playerManager.subscribe) {
      game.playerManager.subscribe('currentPlayerChanged', handlePlayerChange);
      game.playerManager.subscribe('turnUpdate', (id) => {
        setCurrentTurnPlayerId(id);
        setTurnInfo(prev => ({
          ...prev,
          currentPlayerId: id
        }));
      });
    }

    // Clean up event listeners on unmount
    return () => {
      game.socket.off('playerListUpdated', handlePlayerListUpdated);
      game.socket.off('turnUpdate', handleTurnUpdate);
      if (game.playerManager && game.playerManager.unsubscribe) {
        game.playerManager.unsubscribe('currentPlayerChanged', handlePlayerChange);
        game.playerManager.unsubscribe('turnUpdate', handlePlayerChange);
      }
    };
  }, [game]);

// Update timer using the time remaining from the server
useEffect(() => {
  if (intervalRef.current) {
    clearInterval(intervalRef.current);
  }
  
  // If no time remaining or no active turn, don't start timer
  if (!turnInfo.turnTimeRemaining || turnInfo.turnTimeRemaining <= 0) {
    setTimeLeft(0);
    return;
  }

  // Set initial time from server
  setTimeLeft(turnInfo.turnTimeRemaining);
  
  // Simple countdown timer that decrements every 100ms
  intervalRef.current = setInterval(() => {
    setTimeLeft((prevTime) => {
      const newTime = prevTime - 100;
      return newTime > 0 ? newTime : 0;
    });
  }, 100);

  return () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
  };
}, [turnInfo.turnTimeRemaining]);



  const renderStatusBar = (label, value, color) => (
    <div className="status-bar-container">
      <span className="status-label">{label}:</span>
      <div className="status-bar-bg">
        <div
          className="status-bar-fill"
          style={{
            width: `${Math.max(0, Math.min(100, value))}%`,
            backgroundColor: color
          }}
        />
      </div>
    </div>
  );

  const renderPlayer = (player) => {
    const isCurrentTurn = currentTurnPlayerId === player.id;
    const containerClassName = `player-list-item ${isCurrentTurn ? 'current-turn' : ''}`;
    
    if (player.isSpectator) {
      return (
        <div key={player.id} className={containerClassName}>
          <div className="player-info spectator">
            <img
              className="player-icon"
              src="/icons/spectator.png"
              alt="Spectator icon"
            />
            <div className="player-details">
              <span className="player-name" style={{ color: '#d1d1d1' }}>
                {player.name}
              </span>
            </div>
            {!player.isOnline && (
              <span className="offline-indicator">OFFLINE</span>
            )}
          </div>
        </div>
      );
    }

    return (
      <div key={player.id} className={containerClassName}>
        <div className="player-info">
          <img
            className="player-icon"
            src="/icons/tank_player_icon.png"
            alt="Tank icon"
          />
          <div className="player-details">
            <span className="player-name" style={{ color: player.color }}>
              {player.name}
            </span>
            {renderStatusBar("HEALTH", player.health, getHealthColor(player.health))}
            {renderStatusBar("ARMOR", player.armor || 0, 'darkgreen')}
            {renderStatusBar("SHIELD", player.shield || 0, 'blue')}
          </div>
          {!player.isOnline ? (
            <span className="offline-indicator">OFFLINE</span>
          ) : (
            turnInfo.currentPlayerId === null && (
              <span
                className="ready-status"
                style={{ color: player.isReady ? '#00dd00' : '#dd0000' }}
              >
                {player.isReady ? 'Ready' : 'Not Ready'}
              </span>
            )
          )}
          
          {/* Add KIA overlay for dead players */}
          {player.health <= 0 && (
            <div className="kia-overlay">
              <div className="kia-text">DESTROYED</div>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="player-list-wrapper">
      <div className="player-list-container">
        <div className="player-list">
          <center>Players</center>
          {players
            .sort((a, b) => {
              if (a.isSpectator === b.isSpectator) return 0;
              return a.isSpectator ? 1 : -1;
            })
            .map(player => renderPlayer(player))}
        </div>
      </div>

      <div className="turn-indicators">
        {players
          .filter(player => !player.isSpectator)
          .map((player) => {
            const isCurrentTurn = currentTurnPlayerId === player.id;
            let timerSeconds = null;
            if (isCurrentTurn && timeLeft > 0) {
              timerSeconds = Math.ceil(timeLeft / 1000);
            }

            return (
              <div key={player.id} className="turn-indicator-row">
                {isCurrentTurn ? (
                  <span className="turn-arrow">&larr;</span>
                ) : (
                  <span className="turn-arrow-placeholder"></span>
                )}
                {timerSeconds !== null ? (
                  <span className="turn-timer">{timerSeconds}s</span>
                ) : (
                  <span className="turn-timer-placeholder"></span>
                )}
              </div>
            );
          })}
      </div>
    </div>
  );
};

export default PlayerList;