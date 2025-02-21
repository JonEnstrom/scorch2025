// server/SocketHandlers.js
export function registerPlayerSocketHandlers(socket, gameInstance) {
  function getUserIdFromSocket(sock) {
    // First check the direct playerId property we added
    if (sock.playerId) {
      return sock.playerId;
    }
    const cookies = sock.handshake?.headers?.cookie || '';
    const match = cookies.match(/playerId=([^;]+)/);
    return match ? decodeURIComponent(match[1]) : null;
  }

  const handlers = {

    'ping': () => {
      socket.emit('pong');
    },    
    'playerReady': (ready) => {
      const userId = getUserIdFromSocket(socket);
      if (!userId) return;
      console.log(`Processing ready status for user ${userId}: ${ready}`);
      gameInstance.setPlayerReadyStatus(userId, ready);
    },

    'chatMessage': (message) => {
      const userId = getUserIdFromSocket(socket);
      if (!userId) return;
      
      const player = gameInstance.playerManager.players[userId];
      if (!player) return;
      
      const fullMessage = {
        ...message,
        player: player.name || userId,
        userId: userId
      };
      
      socket.to(gameInstance.gameId).emit('chatMessage', fullMessage);
    },

    'clientInput': (input) => {
      const userId = getUserIdFromSocket(socket);

      if (!userId) return;
      gameInstance.processPlayerInput(userId, input);
    },

    'weaponChange': (tankId, weaponCode) => {
      const userId = getUserIdFromSocket(socket);
      if (!userId) return;
      gameInstance.playerManager.processWeaponChange(tankId, weaponCode);
    },

    'itemChange': (tankId, itemCode) => {
      const userId = getUserIdFromSocket(socket);
      if (!userId) return;
      gameInstance.playerManager.processItemChange(tankId, itemCode);
    },

    'disconnect': () => {
      const userId = getUserIdFromSocket(socket);
      if (!userId) return;
      console.log(`Player ${userId} disconnected from [${gameInstance.gameId}].`);
      gameInstance.removePlayer(userId);
    },

    'purchaseRequest': ({ itemName, quantity }) => {
      const userId = getUserIdFromSocket(socket);
      if (!userId) return;
      
      const player = gameInstance.playerManager.players[userId];
      if (!player) {
        socket.emit('errorMessage', 'Player not found');
        return;
      }
      
      gameInstance.itemManager.handlePurchaseRequest(
        socket,
        player,
        itemName,
        quantity,
        (playerId) => {
          gameInstance.playerManager.broadcastPlayerUpdate(playerId);
        },
        gameInstance.gameState
      );
    }
  };

  // Store handlers in the socket object
  socket.eventHandlers = new Map();
  
  // Register all handlers
  for (const [event, handler] of Object.entries(handlers)) {
    if (typeof socket.on === 'function') {
      // Main thread
      socket.on(event, handler);
    }
    // Store handler regardless of thread type
    socket.eventHandlers.set(event, handler);
  }
  
  return handlers;
}