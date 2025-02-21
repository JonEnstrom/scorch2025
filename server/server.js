import express from 'express';
import http from 'http';
import { Server as SocketIoServer } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import bodyParser from 'body-parser';
import cookieParser from 'cookie-parser';
import crypto from 'crypto';
import { Worker } from 'worker_threads';
import os from 'os';
import { initDatabase, getPlayerSession, createPlayerSession, updatePlayerName } from './db/database.js';
import { loadCpuNames } from './cpuNames.js';

const numCPUs = os.cpus().length;
const workers = new Map();
const gameWorkerMapping = new Map();
const playerGameMapping = new Map(); // Track which game each player is in
let currentWorkerIndex = 0;

const cpuNames = await loadCpuNames();

// Initialize worker pool
for (let i = 0; i < numCPUs; i++) {
  const worker = new Worker('./gameWorker.js', { 
      type: 'module',
      workerData: { cpuNames }
  });

  worker.on('message', handleWorkerMessage);
  worker.on('error', (error) => {
    console.error(`Worker ${i} error:`, error);
  });
  worker.on('exit', (code) => {
    if (code !== 0) {
      console.error(`Worker ${i} stopped with exit code ${code}`);
    }
  });

  workers.set(i, worker);
}

function handleWorkerMessage(message) {
  switch (message.type) {
    case 'SOCKET_EVENT':
      io.emit(message.data.event, ...message.data.args);
      break;

    case 'SOCKET_ROOM_EVENT':
      io.to(message.data.room).emit(message.data.event, ...message.data.args);
      break;

    case 'SOCKET_EMIT':
      const socket = io.sockets.sockets.get(message.data.socketId);
      if (socket) {
        socket.emit(message.data.event, ...message.data.args);
      }
      break;

    case 'SOCKET_BROADCAST_ROOM':
      const broadcastSocket = io.sockets.sockets.get(message.data.socketId);
      if (broadcastSocket) {
        broadcastSocket.broadcast.to(message.data.room).emit(message.data.event, ...message.data.args);
      }
      break;

    case 'GAME_INFO':
      const gameInfo = message.data;
      io.emit('lobbyGameUpdated', gameInfo);
      break;

    case 'GAME_DESTROYED':
      // Clean up player mappings for this game
      for (const [playerId, gameName] of playerGameMapping.entries()) {
        if (gameName === message.data.gameName) {
          playerGameMapping.delete(playerId);
        }
      }
      gameWorkerMapping.delete(message.data.gameName);
      broadcastGamesList();
      break;
  }
}

function getNextWorker() {
  const worker = workers.get(currentWorkerIndex);
  currentWorkerIndex = (currentWorkerIndex + 1) % numCPUs;
  return worker;
}

await initDatabase();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new SocketIoServer(server, {
  pingTimeout: 60000,
  pingInterval: 25000
});

app.use(bodyParser.json());
app.use(cookieParser());

const playerSessions = new Map();
const lobbyPlayers = {};

// Middleware to handle player sessions
app.use(async (req, res, next) => {
  let playerId = req.cookies.playerId;

  if (!playerId) {
    playerId = crypto.randomBytes(16).toString('hex');
    res.cookie('playerId', playerId, {
      maxAge: 1000 * 60 * 60 * 24 * 14,
      httpOnly: true,
      sameSite: 'strict',
      secure: false
    });
  }

  let playerData = await getPlayerSession(playerId);
  
  if (!playerData) {
    const defaultName = `Player_${playerId.slice(0, 5)}`;
    await createPlayerSession(playerId, defaultName);
    playerData = { player_id: playerId, name: defaultName };
  }

  playerSessions.set(playerId, {
    userId: playerId,
    name: playerData.name,
    socketId: null
  });

  req.playerId = playerId;
  next();
});

function broadcastLobbyPlayers() {
  io.emit('lobbyPlayersUpdated', Object.values(lobbyPlayers));
}

function broadcastGamesList() {
  io.emit('gamesUpdated', Array.from(gameWorkerMapping.keys()));
}

app.post('/init-player', async (req, res) => {
  let playerId = req.cookies.playerId;
  let playerData = await getPlayerSession(playerId);
  
  if (playerId && !playerData) {
    const defaultName = `Player_${playerId.slice(0, 5)}`;
    await createPlayerSession(playerId, defaultName);
    playerData = { player_id: playerId, name: defaultName };
  }

  res.json({ playerId });
});

app.get('/games', async (req, res) => {
  try {
    // Create a promise for each game's info
    const gamePromises = Array.from(gameWorkerMapping.entries()).map(([gameName, worker]) => {
      return new Promise((resolve) => {
        // Create a one-time message handler for this specific request
        const messageHandler = (message) => {
          if (message.type === 'GAME_INFO' && message.data.gameName === gameName) {
            // Remove the handler once we get our response
            worker.removeListener('message', messageHandler);
            resolve(message.data);
          }
        };
        
        // Add the temporary message handler
        worker.on('message', messageHandler);
        
        // Request the game info
        worker.postMessage({
          type: 'GET_GAME_INFO',
          data: { gameName }
        });
        
        // Add a timeout in case a worker doesn't respond
        setTimeout(() => {
          worker.removeListener('message', messageHandler);
          resolve(null);
        }, 1000);
      });
    });

    // Wait for all game info responses
    const games = (await Promise.all(gamePromises)).filter(game => game !== null);
    
    // Send the complete list back to the client
    res.json(games);
  } catch (err) {
    console.error('Error fetching games:', err);
    res.status(500).json({ error: 'Failed to fetch games' });
  }
});

// Create test games
app.post('/create-test-games', async (req, res) => {
  const { numberOfGames = 5, playersPerGame = 8, theme = 'grassland' } = req.body;
  const DELAY_BETWEEN_GAMES = 5000; // 500ms = half second
  
  // Create new test games with delay
  for (let i = 0; i < numberOfGames; i++) {
    const gameName = `test-game-${Date.now()}-${i}`;
    const seed = Math.floor(Math.random() * 1000000);
    const cpuPlayers = playersPerGame;
    
    const worker = getNextWorker();
    worker.postMessage({
      type: 'CREATE_GAME',
      data: {
        gameName,
        seed,
        theme,
        totalRounds: 10,
        cpuPlayers,
        numPlayers: playersPerGame,
      }
    });

    gameWorkerMapping.set(gameName, worker);
    broadcastGamesList();
    
    // Wait before creating the next game (except for the last one)
    if (i < numberOfGames - 1) {
      await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_GAMES));
    }
  }

  res.json({ 
    message: `Created ${numberOfGames} test games with ${DELAY_BETWEEN_GAMES}ms delay between each`,
  });
});

// Clear test games
app.post('/clear-test-games', async (req, res) => {
  const testGames = Array.from(gameWorkerMapping.keys())
    .filter(name => name.startsWith('test-game-'));
  const count = testGames.length;
  
  for (const gameName of testGames) {
    const worker = gameWorkerMapping.get(gameName);
    if (worker) {
      worker.postMessage({
        type: 'DESTROY_GAME',
        data: { gameName }
      });
      gameWorkerMapping.delete(gameName);
    }
  }

  res.json({ message: `Cleared ${count} test games` });
  broadcastGamesList();
});

// Get lobby players
app.get('/lobby-players', (req, res) => {
  res.json(Object.values(lobbyPlayers));
});

app.post('/create-game', (req, res) => {
  const { gameName, seed, theme, totalRounds, cpuPlayers, numPlayers } = req.body;
  console.log ('NumPlayers: ' + numPlayers + " ::: cpuPlayers: " + cpuPlayers);

  if (!gameName || typeof gameName !== 'string') {
    return res.status(400).json({ error: 'Game name is required and must be a string.' });
  }

  if (gameWorkerMapping.has(gameName)) {
    return res.status(400).json({ error: 'That game name is already in use.' });
  }
  const worker = getNextWorker();
  worker.postMessage({
    type: 'CREATE_GAME',
    data: { gameName, seed, theme, totalRounds, cpuPlayers, numPlayers }
  });

  gameWorkerMapping.set(gameName, worker);
  res.json({ gameName });
  broadcastGamesList();
});

// Socket connection handling
io.on('connection', async (socket) => {
  const cookies = socket.handshake.headers.cookie || '';
  const match = cookies.match(/playerId=([^;]+)/);
  const playerId = match ? decodeURIComponent(match[1]) : null;

  if (!playerId) {
    console.warn('Socket connected with no valid playerId cookie.');
    socket.emit('errorMessage', 'No valid player session found.');
    return;
  }

  let playerData = await getPlayerSession(playerId);
  if (!playerData) {
    const defaultName = `Player_${playerId.slice(0, 5)}`;
    await createPlayerSession(playerId, defaultName);
    playerData = { player_id: playerId, name: defaultName };
  }

  if (playerSessions.has(playerId)) {
    const session = playerSessions.get(playerId);
    session.socketId = socket.id;
  } else {
    playerSessions.set(playerId, {
      userId: playerId,
      name: playerData.name,
      socketId: socket.id
    });
  }

  if (lobbyPlayers[playerId]) {
    lobbyPlayers[playerId].currentSocketId = socket.id;
  } else {
    lobbyPlayers[playerId] = {
      userId: playerId,
      currentSocketId: socket.id,
      name: playerData.name
    };
  }

  socket.emit('reconnected');
  broadcastLobbyPlayers();
  broadcastGamesList();

  // Handle joining a game
  socket.on('joinGame', (gameName, asSpectator = false) => {
    const worker = gameWorkerMapping.get(gameName);
    if (!worker) {
      socket.emit('errorMessage', 'Game does not exist.');
      return;
    }
  
    const playerData = playerSessions.get(playerId);
    socket.join(gameName);
    
    // Update player-game mapping
    playerGameMapping.set(playerId, gameName);
    
    worker.postMessage({
      type: 'ADD_PLAYER',
      data: {
        gameName,
        socketId: socket.id,
        playerId: playerId,
        playerName: playerData.name,
        isSpectator: asSpectator
      }
    });
  
    delete lobbyPlayers[playerId];
    broadcastLobbyPlayers();
  });

 

  // Game-specific events to forward to worker
  const gameEvents = [
    'ping',
    'playerReady',
    'chatMessage',
    'clientInput',
    'weaponChange',
    'itemChange',
    'purchaseRequest'
  ];

  // Set up forwarding for all game events
  gameEvents.forEach(eventName => {
    socket.on(eventName, (...args) => {
      const gameName = playerGameMapping.get(playerId);
      if (gameName) {
        const worker = gameWorkerMapping.get(gameName);
        if (worker) {
          worker.postMessage({
            type: 'SOCKET_EVENT',
            data: {
              gameId: gameName,
              socketId: socket.id,
              event: eventName,
              args: args
            }
          });
        }
      }
    });
  });

  // Handle general game actions
  socket.on('gameAction', (gameName, action, actionData) => {
    const worker = gameWorkerMapping.get(gameName);
    if (worker) {
      worker.postMessage({
        type: 'PLAYER_ACTION',
        data: {
          gameId: gameName,
          playerId: playerId,
          action,
          actionData
        }
      });
    }
  });

  // Handle lobby name changes
  socket.on('lobbyChangeName', async (newName) => {
    if (typeof newName === 'string' && newName.trim().length > 0) {
      const trimmed = newName.trim();
      if (lobbyPlayers[playerId]) {
        lobbyPlayers[playerId].name = trimmed;
        playerSessions.get(playerId).name = trimmed;
        await updatePlayerName(playerId, trimmed);
        broadcastLobbyPlayers();
      }
    }
  });

  // Handle disconnections
  socket.on('disconnect', () => {
    const gameName = playerGameMapping.get(playerId);
    if (gameName) {
      const worker = gameWorkerMapping.get(gameName);
      if (worker) {
        worker.postMessage({
          type: 'SOCKET_EVENT',
          data: {
            gameId: gameName,
            socketId: socket.id,
            event: 'disconnect',
            args: []
          }
        });
      }
    }

    setTimeout(() => {
      if (playerSessions.get(playerId)?.socketId === socket.id) {
        delete lobbyPlayers[playerId];
        playerGameMapping.delete(playerId);
        broadcastLobbyPlayers();
      }
    }, 5000);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT} with ${numCPUs} worker threads`);
});