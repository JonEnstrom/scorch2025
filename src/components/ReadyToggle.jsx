import React, { useState, useEffect } from 'react';
import { useGame } from '../contexts/GameContext';
import './ReadyToggle.css'; // Optional: add your custom styling

const ReadyToggle = () => {
  const { socket } = useGame(); // Assumes your GameContext provides a socket instance.
  const [isReady, setIsReady] = useState(false);
  const [countdown, setCountdown] = useState(null);

  const toggleReady = () => {
    const newReadyState = !isReady;
    setIsReady(newReadyState);
    // Emit the new ready state to the server.
    socket.emit('playerReady', newReadyState);
  };

  // Listen for countdown events coming from the server.
  useEffect(() => {
    if (!socket) return;

    const onCountdownStarted = (seconds) => {
      setCountdown(seconds);
    };

    const onCountdownCancelled = () => {
      setCountdown(null);
    };

    socket.on('readyCountdownStarted', onCountdownStarted);
    socket.on('readyCountdownCancelled', onCountdownCancelled);

    return () => {
      socket.off('readyCountdownStarted', onCountdownStarted);
      socket.off('readyCountdownCancelled', onCountdownCancelled);
    };
  }, [socket]);

  // Local countdown effect to update the UI every second.
  useEffect(() => {
    if (countdown === null) return;
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [countdown]);

  return (
    <div className="ready-toggle">
      <button onClick={toggleReady}>
        {isReady ? 'Cancel Ready' : 'Click When Ready!'}
      </button>
      {countdown !== null && countdown > 0 && (
        <div className="ready-countdown">
          Game starting in {countdown} second{countdown !== 1 && 's'}...
        </div>
      )}
    </div>
  );
};

export default ReadyToggle;
