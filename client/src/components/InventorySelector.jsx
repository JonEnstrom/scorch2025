import React, { useState, useRef, useEffect } from 'react';
import PropTypes from 'prop-types';
import { CSSTransition } from 'react-transition-group';
import { useGame } from '../contexts/GameContext';
import LongPressButton from './LongPressButton';
import './InventorySelector.css';

const InventorySelector = ({
  inventory,
  selectedCode,
  onSelect,
  inventoryType, // "weapon" or "items"
  className,     // e.g., "weapon-selector" or "item-selector" for positioning
}) => {
  const { game } = useGame();
  const containerRef = useRef(null);
  const dropdownRef = useRef(null);

  const [isOpen, setIsOpen] = useState(false);
  const [currentSelectedCode, setCurrentSelectedCode] = useState(selectedCode);
  const [currentTurnId, setCurrentTurnId] = useState(game.playerManager.currentPlayerId);

  // Update the current selection based on game events.
  useEffect(() => {
    const handlePlayerUpdate = () => {
      const currentPlayer = game.playerManager.getCurrentPlayer();
      if (currentPlayer) {
        const code =
          inventoryType === 'weapon'
            ? currentPlayer.getSelectedWeapon()
            : currentPlayer.getSelectedItem();
        setCurrentSelectedCode(code);
      }
    };

    game.playerManager.subscribe('playerUpdated', handlePlayerUpdate);
    game.playerManager.subscribe('inventoryChanged', handlePlayerUpdate);

    return () => {
      game.playerManager.unsubscribe('playerUpdated', handlePlayerUpdate);
      game.playerManager.unsubscribe('inventoryChanged', handlePlayerUpdate);
    };
  }, [game.playerManager, inventoryType]);

  // Listen for turn changes so the UI re-renders.
  useEffect(() => {
    const handleTurnUpdate = (newPlayerId) => {
      setCurrentTurnId(newPlayerId);
    };

    game.playerManager.subscribe('turnUpdate', handleTurnUpdate);

    return () => {
      game.playerManager.unsubscribe('turnUpdate', handleTurnUpdate);
    };
  }, [game.playerManager]);

  const isLocalTurn = currentTurnId === game.playerManager.playerId;

  // Determine which inventory and which item to display.
  let currentInventory = inventory;
  let displayedItem = null;
  if (isLocalTurn) {
    displayedItem = currentInventory.find((i) => i.code === currentSelectedCode);
  } else {
    const currentPlayer = game.playerManager.getCurrentPlayer();
    if (currentPlayer) {
      const currentCode =
        inventoryType === 'weapon'
          ? currentPlayer.getSelectedWeapon()
          : currentPlayer.getSelectedItem();
      currentInventory = currentPlayer.getInventoryByType(inventoryType);
      displayedItem = currentInventory.find((i) => i.code === currentCode);
    }
  }

  // Long-press sends different commands based on the inventory type.
  const handleLongPress = () => {
    if (!isLocalTurn) return;
    if (inventoryType === 'weapon') {
      game.socket.emit('clientInput', {
        action: 'fire',
        weaponCode: currentSelectedCode,
      });
    } else {
      game.socket.emit('clientInput', {
        action: 'use',
        itemCode: currentSelectedCode,
      });
    }
  };

  // Close the dropdown when clicking outside or pressing Escape.
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Set labels and fallback text based on type.
  const longPressLabel = inventoryType === 'weapon' ? 'Fire (hold)' : 'Use (Hold)';
  const noSelectionText = inventoryType === 'weapon' ? 'No Weapon Selected' : 'No Item Selected';
  const noInventoryText = inventoryType === 'weapon' ? 'No Weapons Available' : 'No Items Available';

  // Choose the transition class names based on inventory type.
  // For example, weapons slide from the right and items from the left.
  const transitionClassNames =
    inventoryType === 'weapon' ? 'dropdown-weapon' : 'dropdown-item';

  return (
    <div className={`inventory-selector ${className}`} ref={containerRef}>
      {/* Row containing the long-press action and the main (selected) button */}
      <div className="selected-inventory-row">
        {displayedItem && (
          <div className="fire-use-button-wrapper">
            <LongPressButton
              label={longPressLabel}
              onLongPress={handleLongPress}
              pressDuration={1200}
              disabled={!isLocalTurn}
            />
          </div>
        )}

        <button
          onClick={() => isLocalTurn && setIsOpen(!isOpen)}
          className="inventory-selector-button"
          disabled={!isLocalTurn}
        >
          <div className="inventory-info">
            {displayedItem ? (
              <>
                <img
                  src={displayedItem.icon}
                  alt={displayedItem.name}
                  className="inventory-icon"
                />
                <div className="inventory-details">
                  <div>{displayedItem.name}</div>
                  <div className="inventory-quantity">Qty: {displayedItem.quantity}</div>
                </div>
              </>
            ) : (
              <div className="no-inventory">{noSelectionText}</div>
            )}
          </div>
          <span>{isOpen ? '▼' : '▲'}</span>
        </button>
      </div>

      {/* Dropdown list wrapped in CSSTransition for animations */}
      <CSSTransition
        in={isOpen && isLocalTurn}
        timeout={1500}
        classNames={transitionClassNames}
        unmountOnExit
        nodeRef={dropdownRef}
      >
        <div className="inventory-dropdown" ref={dropdownRef}>
          {currentInventory.length > 0 ? (
            currentInventory.map((item) => (
              <button
                key={item.code}
                onClick={() => {
                  if (inventoryType === 'weapon') {
                    game.socket.emit('weaponChange', game.playerManager.playerId, item.code);
                  } else {
                    game.socket.emit('itemChange', game.playerManager.playerId, item.code);
                  }
                  onSelect(item.code);
                  setCurrentSelectedCode(item.code);
                  setIsOpen(false);
                }}
                className={`inventory-item ${
                  item.code === currentSelectedCode ? 'selected' : ''
                }`}
              >
                <img src={item.icon} alt={item.name} className="inventory-icon" />
                <div className="inventory-item-details">
                  <div className="inventory-item-top-row">
                    <span className="inventory-item-name">{item.name}</span>
                    <span className="inventory-item-quantity">x{item.quantity}</span>
                  </div>
                  <p className="inventory-item-description">{item.description}</p>
                </div>
              </button>
            ))
          ) : (
            <div className="no-inventory">{noInventoryText}</div>
          )}
        </div>
      </CSSTransition>
    </div>
  );
};

InventorySelector.propTypes = {
  inventory: PropTypes.arrayOf(
    PropTypes.shape({
      code: PropTypes.string.isRequired,
      name: PropTypes.string.isRequired,
      quantity: PropTypes.number.isRequired,
      description: PropTypes.string,
      icon: PropTypes.string.isRequired,
      category: PropTypes.string,
    })
  ).isRequired,
  selectedCode: PropTypes.string,
  onSelect: PropTypes.func.isRequired,
  inventoryType: PropTypes.oneOf(['weapon', 'items']).isRequired,
  className: PropTypes.string,
};

export default InventorySelector;
