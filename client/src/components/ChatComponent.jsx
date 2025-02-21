import React, { useState, useEffect, useRef } from 'react';
import { useGame } from '../contexts/GameContext';
import './ChatComponent.css';

const ChatComponent = () => {
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isVisible, setIsVisible] = useState(true);
  const messagesEndRef = useRef(null);
  const fadeTimeoutRef = useRef(null);
  const { game } = useGame();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // Reset fade to make messages container fully visible,
  // then after 10s, fade out.
  const resetFade = () => {
    if (fadeTimeoutRef.current) {
      clearTimeout(fadeTimeoutRef.current);
    }
    setIsVisible(true);
    fadeTimeoutRef.current = setTimeout(() => {
      setIsVisible(false);
    }, 10000); // 10s delay before fading out
  };

  useEffect(() => {
    const handleChatMessage = (message) => {
      setMessages(prev => [...prev, message].slice(-10));
      resetFade();
    };

    if (game && game.socket) {
      game.socket.on('chatMessage', handleChatMessage);
    }

    return () => {
      if (game && game.socket) {
        game.socket.off('chatMessage', handleChatMessage);
      }
      if (fadeTimeoutRef.current) {
        clearTimeout(fadeTimeoutRef.current);
      }
    };
  }, [game]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!inputMessage.trim()) return;

    if (game && game.socket) {
      game.socket.emit('chatMessage', {
        text: inputMessage,
        timestamp: new Date().toISOString()
      });
      setInputMessage('');
    }
  };

  return (
    <div className="chat-container">
      <div 
        className={`messages-container ${!isVisible ? 'fade' : ''}`}
      >
        <div className="messages-wrapper">
          {messages.map((msg, index) => (
            <div key={index} className="message">
              <span className="player-name">{msg.player}: </span>
              <span className="message-text">{msg.text}</span>
            </div>
          ))}
        </div>
        <div ref={messagesEndRef} />
      </div>
      
      <form onSubmit={handleSubmit} className="chat-input-form">
        <input
          type="text"
          value={inputMessage}
          onChange={(e) => setInputMessage(e.target.value)}
          className="chat-input"
          placeholder="Type a message..."
        />
        <button type="submit" className="chat-send-button">
          Send
        </button>
      </form>
    </div>
  );
};

export default ChatComponent;
