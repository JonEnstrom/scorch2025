// src/LoadingManager.js
import { LoadingManager } from 'three';
import { create } from 'zustand';

export const useLoadingStore = create((set) => ({
    isLoading: true,
    progress: 0,
    error: null,
    isFadingContent: false,
    isFadingBackground: false,
    isHidden: false,

    startLoading: () => set(() => ({
        isLoading: true,
        progress: 0,
        error: null,
        isFadingContent: false,
        isFadingBackground: false,
        isHidden: false
    })),

    setProgress: (progress) => set(() => ({ progress })),

    setError: (error) => set(() => ({ error })),

    startFadeOut: () => {
        // First fade the content
        set(() => ({ isFadingContent: true }));

        // After content fades, fade the background
        setTimeout(() => {
            set(() => ({ isFadingBackground: true }));
        }, 500);
    },

    completeLoading: () => {
        // Start the fade out process
        set(state => {
            state.startFadeOut();
            return state;
        });

        // After all animations complete, hide the loading screen
        setTimeout(() => {
            set(() => ({
                isLoading: false,
                isHidden: true,
                isFadingContent: false,
                isFadingBackground: false
            }));
        }, 1500); // Total animation duration (500ms content fade + 1000ms background fade)
    }
}));

export class GameLoadingManager {
    constructor() {
        this.manager = new LoadingManager();
        this.totalItems = 0;
        this.loadedItems = 0;
        this.setupLoadingManager();
    }

    setupLoadingManager() {
        this.manager.onStart = (url, itemsLoaded, itemsToLoad) => {
            this.totalItems = itemsToLoad;
        };

        this.manager.onLoad = () => {
            console.log('Loading complete!');
            useLoadingStore.getState().startFadeOut();
        };

        this.manager.onProgress = (url, itemsLoaded, itemsToLoad) => {
            this.loadedItems = itemsLoaded;
            const progress = (itemsLoaded / itemsToLoad) * 100;
            useLoadingStore.getState().setProgress(progress);
        };

        this.manager.onError = (url) => {
            console.error('Error loading:', url);
        };
    }

    getLoader() {
        return this.manager;
    }
}