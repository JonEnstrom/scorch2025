import React, { useState, useRef, useEffect } from 'react';
import PropTypes from 'prop-types';
import { useGame } from '../contexts/GameContext';
import LongPressButton from './LongPressButton';
import { CSSTransition } from 'react-transition-group';
import './InventorySelector.css';

const WeaponSelector = ({ 
  inventory, 
  selectedWeaponCode, 
  onWeaponSelect 
}) => {
  const { game } = useGame();
  const containerRef = useRef(null);
  const dropdownRef = useRef(null);

  const [isOpen, setIsOpen] = useState(false);
  // Local state to track the selected weapon and item for the local player.
  const [currentSelectedWeaponCode, setCurrentSelectedWeaponCode] = useState(selectedWeaponCode);
  const [currentSelectedItem, setCurrentSelectedItem] = useState(null);
  // New state to track the current turn. This ensures that our component updates when the turn changes.
  const [currentTurnId, setCurrentTurnId] = useState(game.playerManager.currentPlayerId);

  // Listen for player update and inventory change events.
  useEffect(() => {
    const handlePlayerUpdate = () => {
      // Always display the current player's selected weapon and item.
      const currentPlayer = game.playerManager.getCurrentPlayer();
      if (currentPlayer) {
        setCurrentSelectedWeaponCode(currentPlayer.getSelectedWeapon());
        setCurrentSelectedItem(currentPlayer.getSelectedItem());
      }
    };

    game.playerManager.subscribe("playerUpdated", handlePlayerUpdate);
    game.playerManager.subscribe("inventoryChanged", handlePlayerUpdate);

    return () => {
      game.playerManager.unsubscribe("playerUpdated", handlePlayerUpdate);
      game.playerManager.unsubscribe("inventoryChanged", handlePlayerUpdate);
    };
  }, [game.playerManager]);

  // Listen for turn update events so the component re-renders when the turn changes.
  useEffect(() => {
    const handleTurnUpdate = (newPlayerId) => {
      setCurrentTurnId(newPlayerId);
    };

    game.playerManager.subscribe("turnUpdate", handleTurnUpdate);

    return () => {
      game.playerManager.unsubscribe("turnUpdate", handleTurnUpdate);
    };
  }, [game.playerManager]);

  // Determine if it’s the local player’s turn.
  const isLocalTurn = currentTurnId === game.playerManager.playerId;

  // Determine which weapon to display.
  // If it's the local turn, use our local state; otherwise, use the current player's selections.
  let weapons = inventory;
  let displayedWeapon = null;

  if (isLocalTurn) {
    displayedWeapon = weapons.find(w => w.code === currentSelectedWeaponCode);
  } else {
    const currentPlayer = game.playerManager.getCurrentPlayer();
    if (currentPlayer) {
      const currentWeaponCode = currentPlayer.getSelectedWeapon();
      // Assuming that the current player's weapon inventory is available via getInventoryByType.
      const currentPlayerInventory = currentPlayer.getInventoryByType('weapon');
      displayedWeapon = currentPlayerInventory.find(w => w.code === currentWeaponCode);
      weapons = currentPlayerInventory;
    }
  }

  const handleFire = () => {
    if (!isLocalTurn) return; // Do nothing if it isn’t the local player's turn.
    game.socket.emit('clientInput', {
      action: 'fire',
      weaponCode: currentSelectedWeaponCode,
    });
  };

  // Close the dropdown when clicking outside or pressing the ESC key.
  useEffect(() => {
    const handleClickOutside = event => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = event => {
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

  return (
    <div className="inventory-selector" ref={containerRef}>
      {/* Row containing the Fire button (25%) and the selected weapon button (75%) */}
      <div className="selected-inventory-row">
        {displayedWeapon && (
          <div className="fire-use-button-wrapper">
            <LongPressButton
              label="Fire (hold)"
              onLongPress={handleFire}
              pressDuration={1200}
              disabled={!isLocalTurn} // Disabled when it's not the local player's turn.
            />
          </div>
        )}

        <button
          onClick={() => isLocalTurn && setIsOpen(!isOpen)}
          className="inventory-selector-button"
          disabled={!isLocalTurn} // Disable control if it's not the local player's turn.
        >
          <div className="inventory-info">
            {displayedWeapon ? (
              <>
                <img
                  src={displayedWeapon.icon}
                  alt={displayedWeapon.name}
                  className="inventory-icon"
                />
                <div className="inventory-details">
                  <div>{displayedWeapon.name}</div>
                  <div className="inventory-quantity">
                    Qty: {displayedWeapon.quantity}
                  </div>
                  {currentSelectedItem && (
                    <div className="selected-item">
                      Selected Item: {currentSelectedItem.name || currentSelectedItem}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="no-inventory">No Weapon Selected</div>
            )}
          </div>
          <span>{isOpen ? '▼' : '▲'}</span>
        </button>
      </div>

      {/* Dropdown with the list of all weapons wrapped with CSSTransition for animations */}
      <CSSTransition
        in={isOpen && isLocalTurn} // Only allow dropdown open when it's the local player's turn.
        timeout={1500}
        classNames="dropdown"
        unmountOnExit
        nodeRef={dropdownRef}
      >
        <div className="inventory-dropdown" ref={dropdownRef}>
          {weapons.length > 0 ? (
            weapons.map(weapon => (
              <button
                key={weapon.code}
                onClick={() => {
                  // Emit the weapon change event to the server.
                  game.socket.emit('weaponChange', game.playerManager.playerId, weapon.code);
                  // Update local state and notify the parent.
                  onWeaponSelect(weapon.code);
                  setCurrentSelectedWeaponCode(weapon.code);
                  setIsOpen(false);
                }}
                className={`inventory-item ${weapon.code === currentSelectedWeaponCode ? 'selected' : ''}`}
              >
                <img
                  src={weapon.icon}
                  alt={weapon.name}
                  className="inventory-icon"
                />
                <div className="inventory-item-details">
                  <div className="inventory-item-top-row">
                    <span className="inventory-item-name">{weapon.name}</span>
                    <span className="inventory-item-quantity">x{weapon.quantity}</span>
                  </div>
                  <p className="inventory-item-description">{weapon.description}</p>
                </div>
              </button>
            ))
          ) : (
            <div className="no-inventory">No Weapons Available</div>
          )}
        </div>
      </CSSTransition>
    </div>
  );
};

WeaponSelector.propTypes = {
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
  selectedWeaponCode: PropTypes.string,
  onWeaponSelect: PropTypes.func.isRequired,
};

export default WeaponSelector;
