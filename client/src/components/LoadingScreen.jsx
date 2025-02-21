// src/components/LoadingScreen.jsx
import React from 'react';
import { useLoadingStore } from '../LoadingManager';

export const LoadingScreen = () => {
    const { 
        isLoading,
        progress, 
        isFadingContent, 
        isFadingBackground, 
        isHidden 
    } = useLoadingStore();

    if (isHidden) return null;

    return (
        <div 
            id="loading-screen" 
            className={`loading-screen
                ${isFadingContent ? 'fade-content' : ''}
                ${isFadingBackground ? 'fade-out' : ''}
            `}
        >
            <div className="loading-background"></div>
            <div className="loading-content">
                <div className="loading-title">Loading Game...</div>
                <div className="progress-bar-container">
                    <div 
                        className="progress-bar" 
                        style={{ width: `${progress}%` }} 
                    />
                </div>
                <div className="progress-text">
                    {Math.round(progress)}%
                </div>
            </div>
        </div>
    );
};