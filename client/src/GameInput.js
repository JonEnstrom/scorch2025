export class GameInput {
    constructor(game, socket) {
        this.game = game;
        this.socket = socket;
        this.keys = new Set();

        this.setupEventListeners();

        document.addEventListener('weaponChanged', (event) => {
            if (event.detail.tankId === this.game.playerManager.playerId) {
                this.socket.emit('clientInput', {
                    action: 'changeWeapon',
                    weaponCode: event.detail.weaponCode
                });
            }
        });
    }

    setupEventListeners() {
        document.addEventListener('keydown', (event) => {
            this.keys.add(event.code);
            

            if (!this.inventoryOpen) {
                this.processInput();
            }

            if (event.code === 'Space' && 
                this.game.playerManager.isCurrentPlayer(this.game.playerManager.playerId) &&
                !this.inventoryOpen) {
                const currentTank = this.game.playerManager.getPlayer(this.game.playerManager.playerId);
                const weaponCode = currentTank.getSelectedWeapon();
                this.socket.emit('clientInput', { 
                    action: 'fire', 
                    weaponCode: weaponCode
                });
            }
            else if (event.code === 'KeyC' && !this.inventoryOpen) {
                this.game.cameraManager.setView('overhead');
            }
        });

        document.addEventListener('keyup', (event) => {
            this.keys.delete(event.code);

            if (event.code === 'KeyC' && !this.inventoryOpen) {
                if (this.game.activeProjectile) {
                    this.game.cameraManager.setView('chase');
                } else {
                    this.game.cameraManager.setView('thirdPerson');
                }
            }
        });

    }
    
    processInput() {
        if (this.game.playerManager.currentPlayerId !== this.game.playerManager.playerId) return;

        if (this.keys.has('ArrowLeft')) {
            this.socket.emit('clientInput', { action: 'rotateTurret', delta: 2 });
        }
        if (this.keys.has('ArrowRight')) {
            this.socket.emit('clientInput', { action: 'rotateTurret', delta: -2 });
        }
        if (this.keys.has('ArrowUp')) {
            this.socket.emit('clientInput', { action: 'pitchTurret', delta: -2 });
        }
        if (this.keys.has('ArrowDown')) {
            this.socket.emit('clientInput', { action: 'pitchTurret', delta: 2 });
        }
        if (this.keys.has('KeyQ')) {
            this.socket.emit('clientInput', { action: 'changePower', delta: 5 });
        }
        if (this.keys.has('KeyE')) {
            this.socket.emit('clientInput', { action: 'changePower', delta: -5 });
        }
    }
}