// NotificationArea.jsx
import React, { useState, useEffect } from 'react';
import { notificationManager } from '../NotificationManager';

const NotificationArea = () => {
    const [message, setMessage] = useState('');
    const [isVisible, setIsVisible] = useState(false);
    const [fadeOut, setFadeOut] = useState(false);

    useEffect(() => {
        // Subscribe to notifications
        const cleanup = notificationManager.addListener((text, duration) => {
            setMessage(text);
            setIsVisible(true);
            setFadeOut(false);

            // Start fade out animation before hiding
            const fadeOutTimer = setTimeout(() => {
                setFadeOut(true);
            }, duration - 1000); // Start fade 1 second before duration ends

            // Hide the message after duration
            const hideTimer = setTimeout(() => {
                setIsVisible(false);
                setMessage('');
            }, duration);

            return () => {
                clearTimeout(fadeOutTimer);
                clearTimeout(hideTimer);
            };
        });

        // Cleanup subscription when component unmounts
        return cleanup;
    }, []);

    if (!isVisible) return null;

    return (
        <div className={`notification-area ${fadeOut ? 'fade-out' : ''}`}>
            {message}
        </div>
    );
};

export default NotificationArea;