export class PingManager {
    constructor(socket) {
        // Ping measurement properties
        this.socket = socket;
        this.pingHistory = [];
        this.maxHistoryLength = 10;
        this.lastPingSent = null;
        this.isActive = false;
        this.pingInterval = null;
        
        // Display properties
        this.currentPing = 0;
        this.avgPing = 0;
        
        // Create display element
        this.element = document.createElement('div');
        this.element.style.cssText = `
            position: fixed;
            top: 5px;
            right: 5px;
            background: rgba(0, 144, 255, 0.5);
            color: white;
            padding: 2px 5px;
            border-radius: 4px;
            font-family: monospace;
            font-size: 14px;
            transition: background-color 0.3s;
        `;
        document.body.appendChild(this.element);
        
        // Bind methods
        this._handlePongReceived = this._handlePongReceived.bind(this);
        this.updateDisplay = this.updateDisplay.bind(this);
        
        // Set up socket listener
        this.socket.on('pong', this._handlePongReceived);
    }

    start(interval = 5000) {
        if (this.isActive) return;
        
        this.isActive = true;
        this.pingInterval = setInterval(() => {
            this._sendPing();
        }, interval);
    }

    stop() {
        if (!this.isActive) return;
        
        this.isActive = false;
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
        }
    }

    _sendPing() {
        this.lastPingSent = performance.now();
        this.socket.emit('ping');
    }

    _handlePongReceived() {
        const now = performance.now();
        const pingTime = now - this.lastPingSent;
        
        // Add to history
        this.pingHistory.push(pingTime);
        
        // Keep history at desired length
        if (this.pingHistory.length > this.maxHistoryLength) {
            this.pingHistory.shift();
        }
        
        // Update display with new values
        this.updateDisplay(pingTime, this.getAveragePing());
    }

    updateDisplay(ping, avgPing) {
        this.currentPing = Math.round(ping);
        this.avgPing = Math.round(avgPing);
        
        // Update text
        this.element.textContent = `PING: ${this.currentPing}ms`;
        
        // Update color based on ping quality
        if (this.currentPing < 100) {
            this.element.style.background = 'rgba(72, 255, 0, 0.5)';  // Good - green
        } else if (this.currentPing < 200) {
            this.element.style.background = 'rgba(255, 165, 0, 0.5)'; // Warning - orange
        } else {
            this.element.style.background = 'rgba(255, 0, 0, 0.5)';   // Bad - red
        }
    }

    getAveragePing() {
        if (this.pingHistory.length === 0) return 0;
        
        const sum = this.pingHistory.reduce((acc, val) => acc + val, 0);
        return sum / this.pingHistory.length;
    }

    getCurrentPing() {
        return this.pingHistory[this.pingHistory.length - 1] || 0;
    }

    remove() {
        this.stop();
        if (this.element && this.element.parentNode) {
            this.element.parentNode.removeChild(this.element);
        }
        this.socket.off('pong', this._handlePongReceived);
    }
}