// SpawnManager.js
export default class SpawnManager {
    constructor(terrainManager, players) {
        if (!terrainManager) {
            throw new Error('TerrainManager is required for SpawnManager initialization');
        }
        this.terrainManager = terrainManager;
        this.players = players;
        
        // Configuration constants
        this.MAP_SIZE = 240;
        this.MAP_BOUNDARY = 120;
        this.MIN_EDGE_DISTANCE = 20;
        this.MIN_PLAYER_DISTANCE = 40;
        this.MIN_HEIGHT = 1;
        this.MAX_ATTEMPTS = 200;
        const y_offset = 0;
        // Pre-game spawn system
        this.PREGAME_SPAWN_POINTS = Array.from({length: 8}, (_, i) => {
            const angle = (2 * Math.PI * i) / 8;
            return {
                x: 10 * Math.cos(angle),
                y: y_offset,
                z: 10 * Math.sin(angle)
            };
        });        
        // Track which pre-game spawn points are in use
        this.usedPregameSpawns = new Map(); // userId -> spawn index
        this.availablePregameSpawns = [...Array(this.PREGAME_SPAWN_POINTS.length).keys()];
    }

    generateSpawnPoint(userId = null, isPreGame = false) {
        if (!this.terrainManager && !isPreGame) {
            throw new Error('TerrainManager is required for in-game spawn points');
        }
        
        if (isPreGame) {
            return this.getPreGameSpawnPoint(userId);
        }
        return this.getInGameSpawnPoint();
    }

    getPreGameSpawnPoint(userId) {
        if (this.availablePregameSpawns.length === 0) {
            throw new Error('No more pre-game spawn points available');
        }

        // Get random available spawn index
        const randomIdx = Math.floor(Math.random() * this.availablePregameSpawns.length);
        const spawnIndex = this.availablePregameSpawns[randomIdx];
        
        // Remove this spawn point from available pool
        this.availablePregameSpawns.splice(randomIdx, 1);
        
        // Track which user got this spawn point
        this.usedPregameSpawns.set(userId, spawnIndex);
        
        return { ...this.PREGAME_SPAWN_POINTS[spawnIndex] };
    }

    returnPreGameSpawn(userId) {
        const spawnIndex = this.usedPregameSpawns.get(userId);
        if (spawnIndex !== undefined) {
            // Add the spawn point back to available pool if it's not already there
            if (!this.availablePregameSpawns.includes(spawnIndex)) {
                this.availablePregameSpawns.push(spawnIndex);
            }
            this.usedPregameSpawns.delete(userId);
        }
    }

    getInGameSpawnPoint() {
        if (!this.terrainManager) {
            throw new Error('TerrainManager is null when attempting to get in-game spawn point');
        }
        for (let attempt = 0; attempt < this.MAX_ATTEMPTS; attempt++) {
            const x = this.getRandomCoordinate();
            const z = this.getRandomCoordinate();
            const y = this.terrainManager.getHeightAtPosition(x, z);
            
            if (this.isValidSpawnPosition(x, y, z)) {
                return { x, y, z };
            }
        }
        
        throw new Error('Unable to find valid spawn point after maximum attempts');
    }
    
    getRandomCoordinate() {
        const max = this.MAP_BOUNDARY - this.MIN_EDGE_DISTANCE;
        return (Math.random() * 2 - 1) * max;
    }
    
    isValidSpawnPosition(x, y, z) {
        if (y < this.MIN_HEIGHT) {
            return false;
        }
        
        return !Object.values(this.players).some(player => {
            const pos = player.getPosition();
            const dx = pos.x - x;
            const dz = pos.z - z;
            return Math.sqrt(dx * dx + dz * dz) < this.MIN_PLAYER_DISTANCE;
        });
    }

    updateTerrainManager(terrainManager) {
        if (!terrainManager) {
            throw new Error('Cannot update with null TerrainManager');
        }
        this.terrainManager = terrainManager;
    }

    destroy() {
        this.terrainManager = null;
        this.players = null;
        this.usedPregameSpawns.clear();
        this.availablePregameSpawns = [];
        this.MAP_SIZE = 0;
        this.MAP_BOUNDARY = 0;
        this.MIN_EDGE_DISTANCE = 0;
        this.MIN_PLAYER_DISTANCE = 0;
        this.MIN_HEIGHT = 0;
        this.MAX_ATTEMPTS = 0;
    }
}