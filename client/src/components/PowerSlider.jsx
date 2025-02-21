// TurretPowerSlider.js
import React, { useState, useEffect } from 'react';
import { useGame } from '../contexts/GameContext';
import './PowerSlider.css';

function PowerSlider() {
  const { game } = useGame();
  const socket = game?.socket;
  const localPlayerId = game?.playerManager?.playerId;
  const isMyTurn = game?.playerManager?.isCurrentPlayer(localPlayerId);

  const [power, setPower] = useState(50);

  // Subscribe to player updates from server
  useEffect(() => {
    if (!game) return;

    const handlePlayerUpdated = (data) => {
      if (data.power !== undefined) {
        setPower(data.power);
      }
    };

    game.playerManager.subscribe('playerUpdated', handlePlayerUpdated);
    return () => {
      game.playerManager.unsubscribe('playerUpdated', handlePlayerUpdated);
    };
  }, [game]);

  // Handle slider changes and notify server
  const handlePowerChange = (event) => {
    if (!isMyTurn) return;

    const newPower = parseInt(event.target.value, 10);
    setPower(newPower);
    
    if (socket) {
      socket.emit('clientInput', { action: 'setPower', value: newPower });
    }
  };

  return (
    <div className="power-slider-container">
      <label htmlFor="power-slider">Power</label>
      <input
        type="range"
        id="power-slider"
        className="vertical-slider"
        min="100"
        max="1000"
        value={power}
        onChange={handlePowerChange}
        disabled={!isMyTurn}
        title={isMyTurn ? 'Adjust Power' : 'Not your turn'}
      />
      <div>{power}</div>
    </div>
  );
}

export default PowerSlider;