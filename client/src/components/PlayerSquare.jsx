// src/components/PlayerSquare.js

import React, { useState, useEffect, useRef } from 'react';
import { useGame } from '../contexts/GameContext';
import * as THREE from 'three'; // For math utilities
import './PlayerSquare.css';

function clampYaw360(value) {
  let deg = value % 360;
  return deg < 0 ? deg + 360 : deg;
}

function clampPitch(value) {
  if (value === null || value === undefined) return 0;
  return Math.max(-90, Math.min(10, value));
}

/**
 * Extracts the camera's yaw in degrees (with "YXZ" order).
 */
function getCameraYaw(camera) {
  const euler = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
  return THREE.MathUtils.radToDeg(euler.y);
}

function PlayerSquare() {
  const { game } = useGame();
  const socket = game?.socket;
  const localPlayerId = game?.playerManager?.playerId;

  // Determine if it's the local player's turn
  const isMyTurn = game?.playerManager?.isCurrentPlayer(localPlayerId);

  // Server-sourced turret orientation
  const [turretYaw, setTurretYaw] = useState(0);
  const [turretPitch, setTurretPitch] = useState(0);

  // 2D UI rotation offset (relative to camera)
  const [uiYaw, setUiYaw] = useState(0);

  // Pressed arrow key state (null, 'left', 'right', 'up', 'down')
  const [arrowHeld, setArrowHeld] = useState(null);

  // Power from the server (default 50)
  const [power, setPower] = useState(50);

  /**
   * 1) Subscribe to "playerUpdated" from the server
   */
  useEffect(() => {
    if (!game) return;

    const handlePlayerUpdated = (data) => {
      if (data.turretYaw !== undefined) {
        setTurretYaw(clampYaw360(data.turretYaw));
      }
      if (data.turretPitch !== undefined) {
        setTurretPitch(clampPitch(data.turretPitch));
      }
      if (data.power !== undefined) {
        setPower(data.power);
      }
    };

    game.playerManager.subscribe('playerUpdated', handlePlayerUpdated);
    return () => {
      game.playerManager.unsubscribe('playerUpdated', handlePlayerUpdated);
    };
  }, [game]);

  const [lockTurretToCamera, setLockTurretToCamera] = useState(false);

  /**
   * 2) Continuously send rotate/pitch commands while arrow is held and it's your turn,
   *    but throttle to once every 100ms.
   */
  useEffect(() => {
    if (!isMyTurn || !arrowHeld || !socket || lockTurretToCamera) return;

    // We’ll just change the interval to 100ms here.
    const intervalId = setInterval(() => {
      switch (arrowHeld) {
        case 'left':
          socket.emit('clientInput', { action: 'rotateTurret', delta: -2 });
          break;
        case 'right':
          socket.emit('clientInput', { action: 'rotateTurret', delta: 2 });
          break;
        case 'up':
          socket.emit('clientInput', { action: 'pitchTurret', delta: -2 });
          break;
        case 'down':
          socket.emit('clientInput', { action: 'pitchTurret', delta: 2 });
          break;
        default:
          break;
      }
    }, 100); // changed from 50 to 100ms

    return () => clearInterval(intervalId);
  }, [isMyTurn, arrowHeld, socket, lockTurretToCamera]);


  /**
   * 3) For camera-locked turret updates, we throttle as well
   *    by using a ref to track the last time we sent to server.
   */
  const lastTurretUpdateRef = useRef(0);

  useEffect(() => {
    let frameId;

    function updateUiYawAndLock() {
      const localTank = game?.playerManager?.getPlayer(localPlayerId);
      const camera = game?.cameraManager?.camera;

      if (localTank && camera) {
        // 1. Compute the base (absolute) orientation
        const baseYawDeg = THREE.MathUtils.radToDeg(localTank.tankGroup.rotation.y);
        // 2. The turret absolute yaw = tank yaw + turretYaw (because turretYaw is stored relative)
        const turretAbsoluteYaw = baseYawDeg + turretYaw;
        // 3. Extract camera yaw in degrees
        const cameraYawDeg = getCameraYaw(camera);

        // 4. Compute UI relative yaw
        let relativeYaw = turretAbsoluteYaw - cameraYawDeg;
        relativeYaw = clampYaw360(relativeYaw);
        setUiYaw(relativeYaw);

        // 5. If locked, send a new turret yaw to the server so that
        //    the turret’s absolute yaw = camera’s absolute yaw.
        if (isMyTurn && lockTurretToCamera && socket) {
          let desiredTurretYaw = cameraYawDeg - baseYawDeg;

          desiredTurretYaw += 180; // (Only if you want that offset)
          desiredTurretYaw = clampYaw360(desiredTurretYaw);

          // Throttle: Only emit if at least 200ms have passed
          const now = Date.now();
          if (now - lastTurretUpdateRef.current >= 200) {
            lastTurretUpdateRef.current = now;

            // (Optional) If you want to avoid micro-updates, also add a small dead-zone check:
            if (Math.abs(desiredTurretYaw - turretYaw) > 1) {
              socket.emit('clientInput', {
                action: 'setTurretYaw',
                value: desiredTurretYaw
              });
            }
          }
        }
      }

      frameId = requestAnimationFrame(updateUiYawAndLock);
    }

    frameId = requestAnimationFrame(updateUiYawAndLock);
    return () => {
      if (frameId) cancelAnimationFrame(frameId);
    };
  }, [game, localPlayerId, turretYaw, isMyTurn, lockTurretToCamera, socket]);

  /**
   * 4) Arrow press handlers
   */
  const handleMouseDown = (direction) => {
    if (!isMyTurn) return;
    setArrowHeld(direction);
  };

  const handleMouseUpOrLeave = () => {
    setArrowHeld(null);
  };

  /**
   * 5) Power slider handlers
   */
  const handlePowerChange = (event) => {
    if (!isMyTurn) return;

    const newPower = parseInt(event.target.value, 10);
    setPower(newPower);
    if (socket) {
      socket.emit('clientInput', { action: 'setPower', value: newPower });
    }
  };

  // Decide which CSS class for the turn-message-container
  const turnMessageClass = isMyTurn ? 'your-turn' : 'spectating';

  return (
    <div className="player-square-outer-container">
      {/* Turn message in its own background box */}
      <div className={`turn-message-container ${turnMessageClass}`}>
        <div className="turn-message">
          {isMyTurn ? 'Your Turn!' : 'Spectating'}
        </div>
        <div className="lock-turret-container">
          <label>
            <input
              type="checkbox"
              checked={lockTurretToCamera}
              onChange={(e) => setLockTurretToCamera(e.target.checked)}
              disabled={!isMyTurn}
            />
            Lock Turret to Camera
          </label>
        </div>
      </div>

      {/* Existing row layout for turret UI + power slider */}
      <div className="player-square-container">
        <div className="square-with-arrows">
          {/* Displays the numeric orientation */}
          <div className="orientation-display">
            <div className="yaw-display">{turretYaw.toFixed(0)}°</div>
            <div className="pitch-display">{turretPitch.toFixed(0)}°</div>
          </div>

          {/* Arrows */}
          <div
            className={`arrow arrow-up ${!isMyTurn ? 'disabled' : ''}`}
            onMouseDown={isMyTurn ? () => handleMouseDown('up') : undefined}
            onMouseUp={isMyTurn ? handleMouseUpOrLeave : undefined}
            onMouseLeave={isMyTurn ? handleMouseUpOrLeave : undefined}
            title={isMyTurn ? 'Rotate/Pitch Up' : 'Not your turn'}
          />
          <div
            className={`arrow arrow-right ${!isMyTurn ? 'disabled' : ''}`}
            onMouseDown={isMyTurn ? () => handleMouseDown('right') : undefined}
            onMouseUp={isMyTurn ? handleMouseUpOrLeave : undefined}
            onMouseLeave={isMyTurn ? handleMouseUpOrLeave : undefined}
            title={isMyTurn ? 'Rotate/Pitch Right' : 'Not your turn'}
          />
          <div
            className={`arrow arrow-down ${!isMyTurn ? 'disabled' : ''}`}
            onMouseDown={isMyTurn ? () => handleMouseDown('down') : undefined}
            onMouseUp={isMyTurn ? handleMouseUpOrLeave : undefined}
            onMouseLeave={isMyTurn ? handleMouseUpOrLeave : undefined}
            title={isMyTurn ? 'Rotate/Pitch Down' : 'Not your turn'}
          />
          <div
            className={`arrow arrow-left ${!isMyTurn ? 'disabled' : ''}`}
            onMouseDown={isMyTurn ? () => handleMouseDown('left') : undefined}
            onMouseUp={isMyTurn ? handleMouseUpOrLeave : undefined}
            onMouseLeave={isMyTurn ? handleMouseUpOrLeave : undefined}
            title={isMyTurn ? 'Rotate/Pitch Left' : 'Not your turn'}
          />

          {/* 2D turret image */}
          <img
            src="turret_UI_image.png"
            alt="Turret"
            className="center-image"
            style={{
              transform: `rotate(${-uiYaw}deg)`,
              pointerEvents: 'none',
            }}
          />
        </div>

        {/* Power slider section */}
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
      </div>
    </div>
  );
}

export default PlayerSquare;
