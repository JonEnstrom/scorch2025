// src/contexts/GameContext.jsx
import React, { createContext, useContext, useState, useEffect } from 'react';

const GameContext = createContext(null);

export const useGame = () => {
    return useContext(GameContext);
};

export const GameProvider = ({ children, game, socket }) => {
    const [weaponInventory, setWeaponInventory] = useState([]);
    const [itemInventory, setItemInventory] = useState([]);

    useEffect(() => {
        if (!game) return;

        const updateInventories = () => {
            const localPlayerId = game.playerManager.playerId;
            const localPlayer = game.playerManager.players[localPlayerId];
        
            if (localPlayer) {
                // Pull different inventories by type
                const weps = localPlayer.getInventoryByType('weapon');
                const items = localPlayer.getInventoryByType('items');
                setWeaponInventory(weps);
                setItemInventory(items);
            }
        };

        // Initial fetch
        updateInventories();

        // Subscribe to inventory changes
        const handleInventoryChange = () => {
            updateInventories();
        };

        game.playerManager.subscribe('inventoryChanged', handleInventoryChange);

        // Cleanup on unmount
        return () => {
            game.playerManager.unsubscribe('inventoryChanged', handleInventoryChange);
        };
    }, [game]);

    return (
        <GameContext.Provider value={{
            game,
            socket,
            weaponInventory,
            itemInventory
        }}>
            {children}
        </GameContext.Provider>
    );
};

export default GameContext;
