// server/GameInstance.js
import GameCore from './GameCore.js';

export default class GameInstance extends GameCore {
  constructor(
    io,
    gameId,
    seed,
    theme,
    totalRounds,
    cpuPlayers,
    numPlayers,
    onDestroyCb = null,
    cpuNames = []
  ) {
    super(io, gameId, seed, theme, totalRounds, cpuPlayers, numPlayers, onDestroyCb, cpuNames);
    
    this.io = this.networking.io;
  }


getCurrentTime() {
  return Date.now() - this.gameStartTime;
}
}