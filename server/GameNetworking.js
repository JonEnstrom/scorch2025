// server/GameNetworking.js
export class GameNetworking {
    constructor(io, gameId) {
      this.io = this.wrapIO(io, gameId);
      this.gameId = gameId;
    }
  
    wrapIO(io, gameId) {
      return {
        to: (room) => ({
          emit: (event, ...args) => {
            if (io.to) {
              io.to(room).emit(event, ...args);
            } else {
              io.emit('SOCKET_ROOM_EVENT', {
                room,
                event,
                args,
                gameId: this.gameId
              });
            }
          }
        }),
        in: (room) => ({
          emit: (event, ...args) => {
            if (io.in) {
              io.in(room).emit(event, ...args);
            } else {
              io.emit('SOCKET_ROOM_EVENT', {
                room,
                event,
                args,
                gameId: this.gameId
              });
            }
          }
        }),
        emit: (event, ...args) => {
          if (io.emit) {
            io.emit(event, ...args);
          } else {
            io.emit('SOCKET_EVENT', {
              event,
              args,
              gameId: this.gameId
            });
          }
        },
        sockets: {
          adapter: {
            rooms: new Map(),
          },
          sockets: new Map()
        }
      };
    }
  
    emitToSocket(socket, event, ...args) {
      if (socket.emit) {
        socket.emit(event, ...args);
      } else {
        this.io.emit('SOCKET_EMIT', {
          socketId: socket.id,
          event,
          args
        });
      }
    }
  
    wrapSocket(socket, userId) {
      return {
        id: socket.id,
        playerId: userId,
        handshake: {
          headers: {
            cookie: `playerId=${userId}`
          }
        },
        join: (room) => {
          if (socket.join) {
            socket.join(room);
          }
        },
        emit: (event, ...args) => {
          if (socket.emit) {
            socket.emit(event, ...args);
          } else {
            this.io.emit('SOCKET_EMIT', {
              socketId: socket.id,
              event,
              args
            });
          }
        },
        on: (event, handler) => {
          if (socket.on) {
            socket.on(event, handler);
          } else {
            if (!socket.eventHandlers) {
              socket.eventHandlers = new Map();
            }
            socket.eventHandlers.set(event, handler);
          }
        },
        broadcast: {
          to: (room) => ({
            emit: (event, ...args) => {
              if (socket.broadcast?.to) {
                socket.broadcast.to(room).emit(event, ...args);
              } else {
                this.io.emit('SOCKET_BROADCAST_ROOM', {
                  socketId: socket.id,
                  room,
                  event,
                  args
                });
              }
            }
          })
        },
        to: (room) => ({
          emit: (event, ...args) => {
            if (socket.to) {
              socket.to(room).emit(event, ...args);
            } else {
              this.io.emit('SOCKET_ROOM_EVENT', {
                room,
                event,
                args
              });
            }
          }
        })
      };
    }
  
    broadcastLobbyInfo(lobbyInfo) {
      if (!this.io) return;
      this.io.emit('lobbyGameUpdated', lobbyInfo);
    }
  
    broadcastGameState(gameState, currentRound, totalRounds) {
      if (!this.io) return;
      this.io.to(this.gameId).emit('gameStateChanged', {
        gameState,
        currentRound,
        totalRounds
      });
    }
  
    broadcastRoundStartingSoon(currentRound, totalRounds) {
      if (!this.io) return;
      this.io.to(this.gameId).emit('roundStartingSoon', currentRound, totalRounds);
    }
  
    destroy() {
      if (this.io) {
        try {
          this.io.to(this.gameId).emit('gameDestroyed', {
            message: 'Game instance is being shut down'
          });
        } catch (error) {
          console.error('Error during socket cleanup:', error);
        }
      }
      this.io = null;
    }
  }
  