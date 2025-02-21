import React, { useState, useEffect } from 'react';
import { create } from 'zustand';

// Enhanced shop store with better TypeScript-like documentation
export const useShopStore = create((set, get) => ({
    socket: null,
    isOpen: false,
    items: [],
    playerCash: 5000,
    currentCategory: 'all',
    timeLeft: 0,
    timerInterval: null,
    notifications: [],

    // Core actions
    initialize: (socket) => {
        set({ socket });
        
        // Socket event handlers
        socket.on('shoppingPhase', (data) => {
            console.log('SHop nigga!');
            set({ 
                isOpen: true, 
                items: data.items,
                currentCategory: 'all',
                timeLeft: Math.floor(data.duration / 1000)
            });
            get().startTimer(data.duration);
            get().addNotification('Shop is now open!');
        });

        socket.on('purchaseSuccess', (data) => {
            set({ playerCash: data.newCash });
            get().addNotification(`Successfully purchased ${data.quantity}x ${data.itemName}!`);
        });

        socket.on('errorMessage', (message) => {
            get().addNotification(message, 'error');
        });

        socket.on('playerUpdate', (playerData) => {
            if (playerData.state?.cash !== undefined) {
                set({ playerCash: playerData.state.cash });
            }
        });
    },

    setOpen: (isOpen) => set({ isOpen }),
    setItems: (items) => set({ items }),
    setPlayerCash: (cash) => set({ playerCash: cash }),
    setCurrentCategory: (category) => set({ currentCategory: category }),

    startTimer: (duration) => {
        const currentInterval = get().timerInterval;
        if (currentInterval) clearInterval(currentInterval);

        const interval = setInterval(() => {
            set(state => {
                const newTime = state.timeLeft - 1;
                if (newTime <= 0) {
                    clearInterval(interval);
                    set({ isOpen: false, timerInterval: null });
                    return { timeLeft: 0 };
                }
                return { timeLeft: newTime };
            });
        }, 1000);

        set({ 
            timerInterval: interval,
            timeLeft: Math.floor(duration / 1000)
        });
    },

    purchaseItem: (itemName, quantity) => {
        const { socket, playerCash, items } = get();
        const item = items.find(i => i.name === itemName);
        
        if (!item) {
            get().addNotification('Item not found!', 'error');
            return;
        }
        
        const totalCost = item.cost * quantity;
        if (totalCost > playerCash) {
            get().addNotification('Not enough cash!', 'error');
            return;
        }

        if (socket) {
            socket.emit('purchaseRequest', { itemName, quantity });
        }
    },

    addNotification: (message, type = 'success') => {
        const id = Date.now();
        set(state => ({
            notifications: [...state.notifications, { id, message, type }]
        }));
        setTimeout(() => {
            set(state => ({
                notifications: state.notifications.filter(n => n.id !== id)
            }));
        }, 3000);
    },

    cleanup: () => {
        const { timerInterval } = get();
        if (timerInterval) clearInterval(timerInterval);
        set({
            isOpen: false,
            items: [],
            timerInterval: null,
            timeLeft: 0,
            notifications: []
        });
    }
}));

// Enhanced ShopItem component with better UX
const ShopItem = ({ item, onPurchase, playerCash }) => {
    const [quantity, setQuantity] = useState(1);
    const [isPurchasing, setIsPurchasing] = useState(false);
    
    const totalCost = item.cost * quantity;
    const canAfford = totalCost <= playerCash;

    const handlePurchase = () => {
        if (!canAfford || isPurchasing) return;
        
        setIsPurchasing(true);
        onPurchase(item.name, quantity);
        
        setTimeout(() => {
            setIsPurchasing(false);
        }, 1500);
    };

    return (
        <div className="w-full p-4 bg-gray-800 rounded-lg shadow-lg">
            <div className="flex items-start space-x-4">
                <img 
                    src={item.icon} 
                    alt={item.name}
                    className="w-16 h-16 object-cover rounded"
                />
                <div className="flex-1">
                    <h3 className="text-lg font-bold text-white">{item.name}</h3>
                    <p className="text-gray-300 text-sm">{item.description}</p>
                    <div className="mt-2 flex items-center justify-between">
                        <div className="text-green-400">
                            ${item.cost} each
                            <span className="ml-2 text-gray-400">
                                Total: ${totalCost}
                            </span>
                        </div>
                        <div className="flex items-center space-x-2">
                            <button
                                className="px-2 py-1 bg-gray-700 text-white rounded disabled:opacity-50"
                                onClick={() => setQuantity(Math.max(1, quantity - 1))}
                                disabled={isPurchasing}
                            >
                                -
                            </button>
                            <input
                                type="number"
                                className="w-16 px-2 py-1 bg-gray-700 text-white rounded text-center"
                                value={quantity}
                                onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                                min="1"
                                disabled={isPurchasing}
                            />
                            <button
                                className="px-2 py-1 bg-gray-700 text-white rounded disabled:opacity-50"
                                onClick={() => setQuantity(quantity + 1)}
                                disabled={isPurchasing}
                            >
                                +
                            </button>
                            <button
                                className={`px-4 py-1 rounded font-medium transition-colors ${
                                    canAfford 
                                        ? 'bg-green-600 hover:bg-green-700 text-white' 
                                        : 'bg-red-600 cursor-not-allowed'
                                }`}
                                onClick={handlePurchase}
                                disabled={!canAfford || isPurchasing}
                            >
                                {isPurchasing ? 'Purchasing...' : 'Buy'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};