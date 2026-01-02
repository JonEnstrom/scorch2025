class NotificationManager {
    constructor() {
        this.listeners = new Set();
    }

    showMessage(text, duration = 3000) {
        this.listeners.forEach(listener => listener(text, duration));
    }

    addListener(listener) {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        }
    }
}
// Create a single instance to use throughout the app
export const notificationManager = new NotificationManager();