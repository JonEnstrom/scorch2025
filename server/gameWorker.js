// gameWorker.js
import { parentPort, workerData } from 'worker_threads';
const { cpuNames } = workerData || { cpuNames: [] };
import GameInstance from './GameInstance.js';

const workerGames = new Map();
const socketProxies = new Map();
const playerEventHandlers = new Map();

// Update the createSocketProxy function
const createSocketProxy = (socketId, playerId, gameName) => {
  if (socketProxies.has(socketId)) {
    return socketProxies.get(socketId);
  }

  // Initialize event handlers for this player if not exists
  if (!playerEventHandlers.has(playerId)) {
    playerEventHandlers.set(playerId, new Map());
  }

  const socketProxy = {
    id: socketId,
    playerId: playerId,
    handshake: {
      headers: {
        cookie: `playerId=${playerId}`
      }
    },
    // Add event registration method
    on: function(event, handler) {
      const handlers = playerEventHandlers.get(playerId);
      if (handlers) {
        handlers.set(event, handler);
      }
    },
    emit: function(event, ...args) {
      parentPort.postMessage({
        type: 'SOCKET_EMIT',
        data: {
          socketId,
          event,
          args
        }
      });
    },
    join: function(room) {
      // No-op in worker
    },
    to: function(room) {
      return {
        emit: (event, ...args) => {
          parentPort.postMessage({
            type: 'SOCKET_ROOM_EVENT',
            data: {
              room,
              event,
              args,
              gameName
            }
          });
        }
      };
    },
    broadcast: {
      to: function(room) {
        return {
          emit: (event, ...args) => {
            parentPort.postMessage({
              type: 'SOCKET_BROADCAST_ROOM',
              data: {
                socketId,
                room,
                event,
                args
              }
            });
          }
        };
      }
    }
  };

  socketProxies.set(socketId, socketProxy);
  return socketProxy;
};

// Handle messages from the main thread
parentPort.on('message', (message) => {
  
  switch (message.type) {
    case 'CREATE_GAME': {
      const { gameName, seed, theme, totalRounds, cpuPlayers, numPlayers } = message.data;
      
      const ioEmulator = {
        emit: (event, ...args) => {
          parentPort.postMessage({
            type: 'SOCKET_EVENT',
            data: {
              event,
              args,
              gameName
            }
          });
        },
        to: (room) => ({
          emit: (event, ...args) => {
            parentPort.postMessage({
              type: 'SOCKET_ROOM_EVENT',
              data: {
                room,
                event,
                args,
                gameName
              }
            });
          }
        }),
        in: (room) => ({
          emit: (event, ...args) => {
            parentPort.postMessage({
              type: 'SOCKET_ROOM_EVENT',
              data: {
                room,
                event,
                args,
                gameName
              }
            });
          }
        }),
        sockets: {
          adapter: { rooms: new Map() },
          sockets: new Map()
        }
      };
      
    const game = new GameInstance(
        ioEmulator,
        gameName,
        seed,
        theme,
        totalRounds,
        cpuPlayers,
        numPlayers,
        () => {
            workerGames.delete(gameName);
            parentPort.postMessage({
                type: 'GAME_DESTROYED',
                data: { gameName }
            });
        },
        workerData?.cpuNames || []
    );
      workerGames.set(gameName, game);
      console.log(`Created game: ${gameName}`);
      
      parentPort.postMessage({
        type: 'GAME_CREATED',
        data: { gameName }
      });
      break;
    }

    case 'GET_GAME_INFO': {
      const { gameName } = message.data;
      const game = workerGames.get(gameName);
      
      if (game) {
        const gameInfo = game.getLobbyInfo();
        
        parentPort.postMessage({
          type: 'GAME_INFO',
          data: gameInfo
        });
      }
      break;
    }

    case 'ADD_PLAYER': {
      const gameToJoin = workerGames.get(message.data.gameName);
      if (gameToJoin) {
        console.log(`Adding player ${message.data.playerName} to game ${message.data.gameName} ${message.data.isSpectator ? 'as spectator' : ''}`);

        // Clean up any existing handlers for this player
        if (playerEventHandlers.has(message.data.playerId)) {
          playerEventHandlers.delete(message.data.playerId);
        }
        
        const socketProxy = createSocketProxy(
          message.data.socketId,
          message.data.playerId,
          message.data.gameName
        );
    
        // Store the created socket proxy in the game's player data
        const player = gameToJoin.addPlayer(socketProxy, message.data.playerName, message.data.isSpectator);
        if (player) {
          player.socket = socketProxy;  // Make sure socket is stored on player
          
          const handlers = {
            'ping': () => {
              socketProxy.emit('pong');
            },

            'playerReady': (ready) => {
              gameToJoin.setPlayerReadyStatus(message.data.playerId, ready);
            },
            'chatMessage': (message) => {
              const player = gameToJoin.playerManager.players[message.data.playerId];
              if (!player) return;
              
              const fullMessage = {
                ...message,
                player: player.name || message.data.playerId,
                userId: message.data.playerId
              };
              
              socketProxy.to(gameToJoin.gameId).emit('chatMessage', fullMessage);
              socketProxy.emit('chatMessage', fullMessage);
            },
            'clientInput': (input) => {
              gameToJoin.processPlayerInput(message.data.playerId, input);
            },
            'weaponChange': (tankId, weaponCode) => {
              gameToJoin.playerManager.processWeaponChange(tankId, weaponCode);
            },
            'itemChange': (tankId, itemCode) => {
              gameToJoin.playerManager.processItemChange(tankId, itemCode);
            },
            'disconnect': () => {
              gameToJoin.removePlayer(message.data.playerId);
            },
            'purchaseRequest': ({ itemName, quantity }) => {
              const player = gameToJoin.playerManager.players[message.data.playerId];
              if (!player) {
                socketProxy.emit('errorMessage', 'Player not found');
                return;
              }
              
              gameToJoin.itemManager.handlePurchaseRequest(
                socketProxy,
                player,
                itemName,
                quantity,
                (playerId) => {
                  gameToJoin.playerManager.broadcastPlayerUpdate(playerId);
                },
                gameToJoin.gameState
              );
            }
          };
    
          // Register all handlers for this socket
          for (const [event, handler] of Object.entries(handlers)) {
            socketProxy.on(event, handler);
          }
        }
      }
      break;
    }

    case 'CLEANUP_SOCKET_HANDLERS': {
      const { oldSocketId, playerId } = message.data;
      // Clean up both socket proxies and player event handlers
      if (socketProxies.has(oldSocketId)) {
        socketProxies.delete(oldSocketId);
      }
      if (playerEventHandlers.has(playerId)) {
        playerEventHandlers.delete(playerId);
      }
      break;
    }
    
    case 'SOCKET_EVENT': {
      const { gameId, socketId, event, args } = message.data;
      const game = workerGames.get(gameId);
      
      if (game) {
        // Find player by socket ID
        const playerId = Object.entries(game.playerManager.players)
          .find(([_, player]) => player.currentSocketId === socketId)?.[0];
          
        if (playerId) {
          const handlers = playerEventHandlers.get(playerId);
          if (handlers) {
            const handler = handlers.get(event);
            if (handler) {
              try {
                handler(...args);
              } catch (error) {
                console.error(`Error executing ${event} handler:`, error);
              }
            } else {
              console.log(`No handler found for event ${event} for player ${playerId}`);
            }
          } else {
            console.log(`No handlers found for player ${playerId}`);
          }
        } else {
          console.log(`No player found for socket ${socketId} in game ${gameId}`);
        }
      } else {
        console.log(`No game found for ${gameId}`);
      }
      break;
    }

    case 'DESTROY_GAME': {
      const gameToDestroy = workerGames.get(message.data.gameName);
      if (gameToDestroy) {
        // Clean up handlers for all players in the game
        Object.keys(gameToDestroy.playerManager.players).forEach(playerId => {
          if (playerEventHandlers.has(playerId)) {
            playerEventHandlers.delete(playerId);
          }
        });
        
        gameToDestroy.destroy();
        workerGames.delete(message.data.gameName);
      }
      break;
    }
  }
});