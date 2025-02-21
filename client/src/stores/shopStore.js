import { create } from 'zustand';

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
        
        socket.on('shoppingPhase', (data) => {
            console.log('Received shopping phase data:', data);
            set(state => {
                const newState = { 
                    isOpen: true, 
                    items: data.items,
                    currentCategory: 'all',
                    timeLeft: Math.floor(data.duration / 1000)
                };
                console.log('Setting new shop state:', newState);
                return newState;
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

    setOpen: (isOpen) => {
        console.log('Setting shop open state:', isOpen);
        set({ isOpen });
    },    setItems: (items) => set({ items }),
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

// ShopManager class - initializes the store
export class ShopManager {
    constructor(socket, initialCash = 5000) {
        useShopStore.getState().initialize(socket);
        useShopStore.getState().setPlayerCash(initialCash);
    }
}