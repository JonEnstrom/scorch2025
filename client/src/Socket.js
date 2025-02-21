// client/src/socket.js
import { io } from 'socket.io-client';
import { Game } from './Game.js';

let socket;
let game;

const urlParams = new URLSearchParams(window.location.search);
const gameId = urlParams.get('gameId');

if (!gameId) {
    alert('No gameId provided! Redirecting to the lobby...');
    window.location.href = '/';
}

async function ensurePlayerId() {
    const cookies = document.cookie.split(';');
    let playerId = cookies.find(c => c.trim().startsWith('playerId='))?.split('=')[1];

    if (!playerId) {
        const response = await fetch('/init-player', {
            method: 'POST',
            credentials: 'include'
        });
        const data = await response.json();
        playerId = data.playerId;
    }
    return playerId;
}

async function initializeSocket() {
    try {
        await ensurePlayerId();
        
        socket = io('/', {
            path: '/socket.io',
            withCredentials: true,
            autoConnect: false,
            reconnection: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 3000,
            reconnectionDelayMax: 5000,
            timeout: 10000,
            transports: ['websocket', 'polling']
        });
        
        socket.on('connect_error', (error) => {
            console.log('Connection error:', error);
            // Re-ensure playerId on connection error
            ensurePlayerId().catch(console.error);
        });

        socket.on('reconnect_attempt', () => {
            console.log('Attempting to reconnect...');
        });

        socket.on('reconnect_failed', () => {
            console.log('Failed to reconnect');
            // Optional: reload page after max attempts
            // window.location.reload();
        });
        
        game = new Game(socket, );
        setupSocketEvents();
        socket.connect();
        
        return { socket, game }; // Return both socket and game
    } catch (error) {
        console.error('Socket initialization error:', error);
        throw error;
    }
}

const setupSocketEvents = () => {
    setupConnectionEvents();
    setupGameEvents();
    setupPlayerEvents();
    setupTurnEvents();
    setupCombatEvents();
    setupTerrainEvents();
    setupShopEvents();
    setupHelicopterEvents();

};

const setupConnectionEvents = () => {
    socket.on('connect', () => {
        console.log('Connected to server with ID:', socket.id);
        const urlParams = new URLSearchParams(window.location.search);
        const isSpectator = urlParams.get('spectator') === 'true';

        socket.emit('joinGame', gameId, isSpectator);
    });

    socket.on('disconnect', () => {
        console.log('Disconnected from server');
    });

    socket.on('gameSetup', (data) => {
        game.init(data);
    });
};

const setupGameEvents = () => {
    socket.on('gameStateChanged', (data) => {

    });
    socket.on('gameStartingSoon', (startDelay) => {
        game.handleGameStartingSoon(startDelay);
    });
    socket.on('roundStarting', (currentRound, totalRounds) => {
        game.handleRoundStarting(currentRound, totalRounds);
    });
    socket.on('roundEnded', (currentRound, totalRounds) => {
        game.handleRoundEnded(currentRound, totalRounds);
    });
};

const setupPlayerEvents = () => {
    const playerEvents = {
        'playerJoined': game.playerManager.handlePlayerJoined.bind(game.playerManager),
        'playerLeft': game.playerManager.handlePlayerLeft.bind(game.playerManager),
        'playerUpdate': game.playerManager.handlePlayerUpdate.bind(game.playerManager),
        'playerRespawn': game.playerManager.handlePlayerRespawn.bind(game.playerManager),
        'playerDamaged': game.playerManager.handlePlayerDamaged.bind(game.playerManager),
        'playerDefeated': (data) => game.handlePlayerDefeated(data)
    };

    Object.entries(playerEvents).forEach(([event, handler]) => {
        socket.on(event, handler);
    });
};

const setupTurnEvents = () => {
    socket.on('turnUpdate', (data) => {
        game.handleTurnUpdate(data.currentPlayerId);
    });
    
    socket.on('turnChangePending', () => {
        game.handleTurnChangePending();
    });
};

const setupCombatEvents = () => {
    const projectileEvents = {
        'fullProjectileTimeline': (timelineData) => {
            game.handleFullProjectileTimeline(timelineData);
        },
        'projectileImpact': (impactData) => {
            game.handleProjectileImpact(impactData);
        },
    };

    Object.entries(projectileEvents).forEach(([event, handler]) => {
        socket.on(event, handler);
    });
};

const setupTerrainEvents = () => {
    socket.on('terrainPatch', ({ patch }) => {
        game.handleTerrainPatch(patch);
    });

    socket.on('newTerrain', ({ terrain }) => {
        console.log('New terrain received:', terrain);
        game.loadNewTerrain(terrain);
    });
    socket.on('foliagePoints', (spawnPoints) => {
        game.spawnFoliage(spawnPoints);
    });
};

const setupShopEvents = () => {
    socket.on('purchaseSuccess', (data) => {
        console.log('Purchase successful:', data);
    });
};

const setupHelicopterEvents = () => {
    socket.on('spawnHelicopter', (data) => {
        game.spawnHelicopter(data);
    });
    socket.on('spawnExistingHelicopters', (helicopterStates) => {
        game.spawnExistingHelicopters(helicopterStates);
    });
    
    socket.on('helicopterStates', (states) => {
        game.updateHelicopters(states);
    });
    
    socket.on('helicopterNewWaypoint', (data) => {
        game.updateHelicopterWaypoint(data);
    });
    
    socket.on('helicopterDamaged', (data) => {
        game.handleHelicopterDamage(data);
    });
    
    socket.on('helicopterDestroyed', (data) => {
        game.removeHelicopter(data.id);
    });
};


// Initialize and export
const socketPromise = initializeSocket();
export { socketPromise };