// timeSync.js
export class TimeSync {
    constructor() {
      // Store the offset between server time and client performance.now()
      this.serverTimeOffset = 0;
      this.lastSyncTime = 0;
      this.initialized = false;
    }
  
    // Call this when receiving the initial server timestamp
    initialize(serverTimestamp) {
      this.serverTimeOffset = Date.now() - performance.now();
      this.lastSyncTime = performance.now();
      this.initialized = true;
    }
  
    // Convert server timestamp (Date.now()) to client performance time
    serverToClientTime(serverTimestamp) {
      if (!this.initialized) {
        console.warn('TimeSync not initialized');
        return performance.now();
      }
      return serverTimestamp - this.serverTimeOffset;
    }
  
    // Convert client performance time to server timestamp
    clientToServerTime(clientTimestamp) {
      if (!this.initialized) {
        console.warn('TimeSync not initialized');
        return Date.now();
      }
      return clientTimestamp + this.serverTimeOffset;
    }
  
    // Get current server time from client time
    getCurrentServerTime() {
      return this.clientToServerTime(performance.now());
    }
  }
  
  // Create a singleton instance
  export const timeSync = new TimeSync();