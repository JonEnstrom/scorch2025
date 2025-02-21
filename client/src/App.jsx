// src/App.jsx
import React, { useEffect, useState } from 'react';
import GameContainer from './components/GameContainer';
import { socketPromise } from './Socket'; // Ensure this exports { socket, game }
import { GameProvider } from './contexts/GameContext'; // Import GameProvider

function App() {
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState(null);
  const [game, setGame] = useState(null); // State to hold the game instance
  const [socket, setSocket] = useState(null); // State to hold the socket instance

  useEffect(() => {
    const initSocket = async () => {
      try {
        const { socket, game } = await socketPromise; // Destructure socket and game
        setIsConnected(true);
        setGame(game); // Set the game instance
        setSocket(socket); // Save the socket in state

        socket.on('disconnect', () => {
          setIsConnected(false);
        });
      } catch (error) {
        console.error('Failed to initialize socket:', error);
        setConnectionError(error.message);
      }
    };

    initSocket();

    return () => {
      socketPromise
        .then(({ socket }) => {
          if (socket && socket.connected) {
            socket.disconnect();
          }
        })
        .catch((err) => console.error('Cleanup error:', err));
    };
  }, []);

  if (connectionError) {
    return <div>Error connecting to game: {connectionError}</div>;
  }

  return (
    <GameProvider game={game} socket={socket}>
      <GameContainer isConnected={isConnected} />
    </GameProvider>
  );
}

export default App;
