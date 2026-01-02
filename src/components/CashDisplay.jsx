// src/game/CashDisplay.jsx
import React from 'react';
import { useShopStore } from '../stores/shopStore';

export const CashDisplay = () => {
    const playerCash = useShopStore(state => state.playerCash);

    return (
        <div className="cash-display">
            Cash: ${playerCash}
        </div>
    );
};
