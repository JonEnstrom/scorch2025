import React, { useState, useEffect, useRef } from 'react';
import { useGame } from '../contexts/GameContext';
import './TurretControls.css';
import * as THREE from 'three';

// Define pitch bounds.
const pitchMin = -90;
const pitchMax = 10;

// Helper functions.
function clampYaw360(value) {
  let deg = value % 360;
  return deg < 0 ? deg + 360 : deg;
}

function getCameraYaw(camera) {
  const euler = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
  return THREE.MathUtils.radToDeg(euler.y);
}

function clampPitch(value) {
  if (value === null || value === undefined) return 0;
  return Math.max(pitchMin, Math.min(pitchMax, value));
}

const TurretControls = () => {
  const { game } = useGame();
  const socket = game?.socket;
  const localPlayerId = game?.playerManager?.playerId;

  // Initialize current turn player from game state and track updates
  const [currentTurnPlayerId, setCurrentTurnPlayerId] = useState(
    game?.playerManager?.currentPlayerId || null
  );
  // Determine if it's the local player's turn
  const isMyTurn = localPlayerId === currentTurnPlayerId;

  /***********************
   * Turret Pitch & Power *
   ***********************/
  // The "target" values are the ones received from the server or set by the user.
  const [turretPitch, setTurretPitch] = useState(0);
  const [power, setPower] = useState(50);

  // The "display" values are what the slider uses. When a server update occurs (and it's not your turn)
  // we animate these values to smoothly approach the target values.
  const [displayTurretPitch, setDisplayTurretPitch] = useState(0);
  const [displayPower, setDisplayPower] = useState(50);

  /***********************
   * Unified Throttling Code:
   *
   * We queue any input changes (turretYaw, turretPitch, power) into
   * pendingInputsRef and flush them at most once every 200ms.
   *
   * We check that game.currentPlayerHasFired is false before sending any
   * updates. Each pending change is sent with the proper 'action' key so that
   * the server processes it as expected.
   ***********************/
  const pendingInputsRef = useRef({});
  const throttleTimerRef = useRef(null);
  const lastSentTimeRef = useRef(0);
  // Keep track of the last sent values for turretYaw (for the 1° diff check).
  const lastSentInputsRef = useRef({ turretYaw: null, turretPitch: null, power: null });

  // Flush the pending inputs: send each change with its proper action.
  const flushPendingInputs = () => {
    if (!socket || !isMyTurn || (game && game.currentPlayerHasFired)) {
      pendingInputsRef.current = {};
      throttleTimerRef.current = null;
      return;
    }
    const now = Date.now();
    const updates = pendingInputsRef.current;

    // Send turret yaw update (if the change is significant).
    if (updates.turretYaw !== undefined) {
      const lastYaw = lastSentInputsRef.current.turretYaw;
      const diff = lastYaw === null ? Infinity : Math.abs(((updates.turretYaw - lastYaw + 180) % 360) - 180);
      if (diff >= 1) {
        socket.emit('clientInput', { action: 'setTurretYaw', value: updates.turretYaw });
        lastSentInputsRef.current.turretYaw = updates.turretYaw;
      }
    }
    // Send turret pitch update.
    if (updates.turretPitch !== undefined) {
      socket.emit('clientInput', { action: 'setTurretPitch', value: updates.turretPitch });
      lastSentInputsRef.current.turretPitch = updates.turretPitch;
    }
    // Send power update.
    if (updates.power !== undefined) {
      socket.emit('clientInput', { action: 'setPower', value: updates.power });
      lastSentInputsRef.current.power = updates.power;
    }
    // Clear pending inputs and update last sent time.
    pendingInputsRef.current = {};
    lastSentTimeRef.current = now;
    throttleTimerRef.current = null;
  };

  // Queue an input update by merging new changes into the pending inputs.
  const queueInputUpdate = (newUpdate) => {
    if (!isMyTurn || (game && game.currentPlayerHasFired)) return;
    pendingInputsRef.current = { ...pendingInputsRef.current, ...newUpdate };
    const now = Date.now();
    const timeSinceLastSent = now - lastSentTimeRef.current;

    if (timeSinceLastSent >= 200) {
      flushPendingInputs();
    } else if (!throttleTimerRef.current) {
      throttleTimerRef.current = setTimeout(() => {
        flushPendingInputs();
      }, 200 - timeSinceLastSent);
    }
  };

  /***********************
   * Animation Setup
   ***********************/
  // These refs hold the current animation frame IDs so that we can cancel any ongoing animation.
  const turretPitchAnimFrameRef = useRef(null);
  const powerAnimFrameRef = useRef(null);

  // animateValue smoothly updates a value from its current (start) value to a target value over a fixed duration.
  const animateValue = (start, target, setter, animFrameRef) => {
    const duration = 250; // Duration of the animation in milliseconds
    const startTime = performance.now();
    const initialValue = start;

    const step = (now) => {
      const elapsed = now - startTime;
      const t = Math.min(elapsed / duration, 1);
      const newValue = initialValue + (target - initialValue) * t;
      setter(newValue);
      if (t < 1) {
        animFrameRef.current = requestAnimationFrame(step);
      } else {
        animFrameRef.current = null;
      }
    };

    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
    }
    animFrameRef.current = requestAnimationFrame(step);
  };

  // Subscribe to both game state and turn updates
  useEffect(() => {
    if (!game) return;

    // Update when the game's current player changes
    const handlePlayerChange = () => {
      setCurrentTurnPlayerId(game.playerManager.currentPlayer);
    };
    game.playerManager.subscribe('currentPlayerChanged', handlePlayerChange);

    // Also still listen for turn updates from server
    const handleTurnUpdate = (data) => {
      setCurrentTurnPlayerId(data.currentPlayerId);
    };
    socket?.on('turnUpdate', handleTurnUpdate);

    return () => {
      game.playerManager.unsubscribe('currentPlayerChanged', handlePlayerChange);
      socket?.off('turnUpdate', handleTurnUpdate);
    };
  }, [game, socket]);

  // When turretPitch (the target value) changes, animate the display value if you're not in control.
  useEffect(() => {
    if (!isMyTurn) {
      animateValue(displayTurretPitch, turretPitch, setDisplayTurretPitch, turretPitchAnimFrameRef);
    } else {
      // If it's your turn, update immediately.
      setDisplayTurretPitch(turretPitch);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turretPitch, isMyTurn]);

  // Do the same for power.
  useEffect(() => {
    if (!isMyTurn) {
      animateValue(displayPower, power, setDisplayPower, powerAnimFrameRef);
    } else {
      setDisplayPower(power);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [power, isMyTurn]);

  // Clean up any outstanding animation frames on unmount.
  useEffect(() => {
    return () => {
      if (turretPitchAnimFrameRef.current) {
        cancelAnimationFrame(turretPitchAnimFrameRef.current);
      }
      if (powerAnimFrameRef.current) {
        cancelAnimationFrame(powerAnimFrameRef.current);
      }
    };
  }, []);

  /***********************
   * Server & Player Updates
   ***********************/
  // Subscribe to player update events (turretPitch and power).
  useEffect(() => {
    if (!game) return;
    const handlePlayerUpdated = (data) => {
      if (data.turretPitch !== undefined) {
        const newPitch = clampPitch(data.turretPitch);
        setTurretPitch(newPitch);
        // If it's your turn you want immediate update.
        if (isMyTurn) {
          setDisplayTurretPitch(newPitch);
        }
      }
      if (data.power !== undefined) {
        setPower(data.power);
        if (isMyTurn) {
          setDisplayPower(data.power);
        }
      }
    };
    game.playerManager.subscribe('playerUpdated', handlePlayerUpdated);
    return () => {
      game.playerManager.unsubscribe('playerUpdated', handlePlayerUpdated);
    };
  }, [game, isMyTurn]);

  // Automatically update turret yaw based on the camera.
  useEffect(() => {
    let frameId;
    function updateTurretYaw() {
      const localTank = game?.playerManager?.getPlayer(localPlayerId);
      const camera = game?.cameraManager?.camera;
      if (localTank && camera && isMyTurn && socket && !(game && game.currentPlayerHasFired)) {
        // Compute the tank's base yaw in degrees.
        const baseYawDeg = THREE.MathUtils.radToDeg(localTank.tankGroup.rotation.y);
        // Get camera yaw.
        const cameraYawDeg = getCameraYaw(camera);
        // Compute desired turret yaw so that the turret's absolute yaw equals the camera's yaw.
        let desiredTurretYaw = cameraYawDeg - baseYawDeg;
        // (Optional offset)
        desiredTurretYaw += 180;
        desiredTurretYaw = clampYaw360(desiredTurretYaw);

        // Queue turret yaw update.
        queueInputUpdate({ turretYaw: desiredTurretYaw });
      }
      frameId = requestAnimationFrame(updateTurretYaw);
    }
    frameId = requestAnimationFrame(updateTurretYaw);
    return () => cancelAnimationFrame(frameId);
  }, [game, localPlayerId, isMyTurn, socket]);

  /***********************
   * Handlers for Local Input
   ***********************/
  // Handler for turret pitch slider change.
  const handlePitchChange = (event) => {
    if (!isMyTurn || (game && game.currentPlayerHasFired)) return;
    // The slider returns a value that is reversed relative to the actual turret pitch.
    // Compute the actual turret pitch as: actualPitch = pitchMin + pitchMax - sliderValue
    const sliderValue = parseInt(event.target.value, 10);
    const actualPitch = pitchMin + pitchMax - sliderValue;
    setTurretPitch(actualPitch);
    setDisplayTurretPitch(actualPitch); // Immediate update for local input.
    queueInputUpdate({ turretPitch: actualPitch });
  };

  // Handler for power slider change.
  const handlePowerChange = (event) => {
    if (!isMyTurn || (game && game.currentPlayerHasFired)) return;
    const newPower = parseInt(event.target.value, 10);
    setPower(newPower);
    setDisplayPower(newPower);
    queueInputUpdate({ power: newPower });
  };

  return (
    <>
      {/* Left slider for turret pitch */}
      <div className="left-slider-container">
        <div className="slider">
          <label className="slider-label">Pitch</label>
          <input
            type="range"
            min={pitchMin}
            max={pitchMax}
            // Reverse the slider's value for display: sliderValue = pitchMin + pitchMax - displayTurretPitch
            value={pitchMin + pitchMax - Math.round(displayTurretPitch)}
            onChange={handlePitchChange}
            disabled={!isMyTurn}
          />
          <div className="slider-value">{Math.round(displayTurretPitch)}°</div>
        </div>
      </div>

      {/* Right slider for power */}
      <div className="right-slider-container">
        <div className="slider">
          <label className="slider-label">Power</label>
          <input
            type="range"
            min="100"
            max="700"
            value={Math.round(displayPower)}
            onChange={handlePowerChange}
            disabled={!isMyTurn}
          />
          <div className="slider-value">{Math.round(displayPower)}</div>
        </div>
      </div>

      {/* Turn indicator */}
      <div
        className="turn-indicator"
        style={{
          backgroundColor: isMyTurn ? 'green' : 'red',
          color: '#fff'
        }}
      >
        {isMyTurn ? "Your Turn!" : "Spectating"}
      </div>
    </>
  );
};

export default TurretControls;