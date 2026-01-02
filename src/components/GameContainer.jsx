// src/components/GameContainer.jsx
import React from 'react';
import { LoadingScreen } from './LoadingScreen';
import GameUI from './GameUI';
import { useLoadingStore } from '../LoadingManager';
import { useGame } from '../contexts/GameContext'; // Import the custom hook

const GameContainer = ({ isConnected }) => {
    const { 
        isLoading, 
        startLoading, 
        setProgress, 
        setError, 
        completeLoading 
    } = useLoadingStore();

    const game = useGame().game; // Access the game instance from context

    // Effect to handle asset loading
    React.useEffect(() => {
        const loadGame = async () => {
            // Only proceed with loading if we're connected and game is available
            if (!isConnected || !game) return;

            try {
                startLoading();
                
                await loadGameAssets();
                setProgress(100);
                
                completeLoading();
            } catch (error) {
                console.error('Failed to load game assets:', error);
                setError(error.message);
            }
        };

        loadGame();
    }, [isConnected, game, startLoading, setProgress, setError, completeLoading]);

    return (
        <>
            <LoadingScreen />
            <div style={{ display: isLoading ? 'none' : 'block' }}>
                <GameUI connected={isConnected} />
            </div>
        </>
    );
};

// Asset loading function
const loadGameAssets = async () => {
    // Add your asset loading logic here
    await new Promise(resolve => setTimeout(resolve, 2000)); // Simulate loading
};

export default GameContainer;
