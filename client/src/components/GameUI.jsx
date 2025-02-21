import React, { useEffect, useState } from 'react';
import NotificationArea from './NotificationArea';
import { ShopModal } from './ShopModal';
import { CashDisplay } from './CashDisplay';
import InventorySelector from './InventorySelector';
import { useGame } from '../contexts/GameContext';
import PlayerList from './PlayerList';
import TurretControls from './TurretControls';
import ReadyToggle from './ReadyToggle';
import ChatComponent from './ChatComponent';
import './GameUI.css';

// Define game states
const GAME_STATES = {
  DISCONNECTED: 'disconnected',
  LOADING: 'loading',
  PREGAME: 'pregame',
  PLAYING: 'playing',
  POSTGAME: 'postgame'
};

// Define which components should be visible in each state
const COMPONENT_VISIBILITY = {
  [GAME_STATES.DISCONNECTED]: {
    notificationArea: true,
    playerList: false,
    cashDisplay: false,
    weaponSelector: false,
    itemSelector: false,
    turretControls: false,
    shopModal: false
  },
  [GAME_STATES.LOADING]: {
    notificationArea: true,
    playerList: false,
    cashDisplay: false,
    weaponSelector: false,
    itemSelector: false,
    turretControls: false,
    shopModal: false
  },
  [GAME_STATES.PREGAME]: {
    notificationArea: true,
    playerList: true,
    cashDisplay: true,
    weaponSelector: false,
    itemSelector: false,
    turretControls: false,
    shopModal: true,
    chatComponent: true,
  },
  [GAME_STATES.PLAYING]: {
    notificationArea: true,
    playerList: true,
    cashDisplay: true,
    weaponSelector: true,
    itemSelector: true,
    turretControls: true,
    shopModal: true,
    chatComponent: true,
  },
  [GAME_STATES.POSTGAME]: {
    notificationArea: true,
    playerList: true,
    cashDisplay: true,
    weaponSelector: false,
    itemSelector: false,
    turretControls: false,
    shopModal: false
  }
};

const GameUI = ({ connected }) => {
  const { game, weaponInventory, itemInventory } = useGame();
  const [selectedWeapon, setSelectedWeapon] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);
  const [gameState, setGameState] = useState(GAME_STATES.DISCONNECTED);

  useEffect(() => {
    if (!connected) {
      setGameState(GAME_STATES.DISCONNECTED);
    } else if (!game) {
      setGameState(GAME_STATES.LOADING);
    } else {
      // You can add your own game state detection logic here
      // For example:
      const updateGameState = () => {
        if (game.isInPreGame()) {
          setGameState(GAME_STATES.PREGAME);
        } else if (game.isPlaying()) {
          setGameState(GAME_STATES.PLAYING);
        } else if (game.isGameOver()) {
          setGameState(GAME_STATES.POSTGAME);
        }
      };

      // Listen to game state changes
      game.on('stateChange', updateGameState);
      updateGameState(); // Initial state check

      return () => {
        game.off('stateChange', updateGameState);
      };
    }
  }, [connected, game]);

  const handleWeaponSelect = (weaponCode) => {
    setSelectedWeapon(weaponCode);
    const currentPlayer = game.playerManager.getCurrentPlayer();
    if (currentPlayer) {
      currentPlayer.setSelectedWeapon(weaponCode);
    }
  };

  const handleItemSelect = (itemCode) => {
    setSelectedItem(itemCode);
    const currentPlayer = game.playerManager.getCurrentPlayer();
    if (currentPlayer) {
      currentPlayer.setSelectedItem(itemCode);
    }
  };

  if (gameState === GAME_STATES.DISCONNECTED) {
    return <div>Not connected...</div>;
  }

  if (gameState === GAME_STATES.LOADING) {
    return <div>Loading game data...</div>;
  }

  const visibility = COMPONENT_VISIBILITY[gameState];

  return (
    <div className="game-container">
      {visibility.notificationArea && <NotificationArea />}

      {visibility.playerList && (
        <div className="player-list-panel">
          <PlayerList />
        </div>
      )}

      
      {visibility.chatComponent && (
      <div className="chat-panel">
        <ChatComponent />
      </div>
      )}


      {visibility.cashDisplay && (
        <div className="cash-display">
          <CashDisplay />
        </div>
      )}

      {visibility.weaponSelector && (
        <InventorySelector
          inventory={weaponInventory}
          selectedCode={selectedWeapon}
          onSelect={handleWeaponSelect}
          inventoryType="weapon"
          className="weapon-selector"
        />
      )}

      {visibility.itemSelector && (
        <InventorySelector
          inventory={itemInventory}
          selectedCode={selectedItem}
          onSelect={handleItemSelect}
          inventoryType="items"
          className="item-selector"
        />
      )}

      {visibility.turretControls && <TurretControls />}

      <div className="main-content">
      {gameState === GAME_STATES.PREGAME && <ReadyToggle />}
        <div>Game UI Base Container</div>
      </div>

      {visibility.shopModal && <ShopModal />}
    </div>
  );
};

export default GameUI;