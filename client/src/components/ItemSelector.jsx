// src/components/ItemSelector.jsx
import React, { useState } from 'react';
import PropTypes from 'prop-types';
import LongPressButton from './LongPressButton';
import './InventorySelector.css'; // <-- single unified file

const ItemSelector = ({
  inventory,
  selectedItemCode,
  onItemSelect
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const items = inventory;
  const selectedItem = items.find(i => i.code === selectedItemCode);

  const handleUse = () => {
    console.log('Use item:', selectedItemCode);
    // Your game logic for using the item
  };

  return (
    <div className="inventory-selector">
      {/* Row containing the Use button (25%) and the selected item button (75%) */}
      <div className="selected-inventory-row">
        {/* Use Button on the left 25% */}
        {selectedItem && (
          <div className="fire-use-button-wrapper">
            <LongPressButton
              label="Use (Hold)"
              onLongPress={handleUse}
              pressDuration={1200} 
            />
          </div>
        )}

        {/* The main button that shows the selected item & toggles dropdown */}
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="inventory-selector-button"
        >
          <div className="inventory-info">
            {selectedItem ? (
              <>
                <img
                  src={selectedItem.icon}
                  alt={selectedItem.name}
                  className="inventory-icon"
                />
                <div className="inventory-details">
                  <div>{selectedItem.name}</div>
                  <div className="inventory-quantity">
                    Qty: {selectedItem.quantity}
                  </div>
                </div>
              </>
            ) : (
              <div className="no-inventory">No Item Selected</div>
            )}
          </div>
          <span>{isOpen ? '▼' : '▲'}</span>
        </button>
      </div>

      {/* Dropdown with the list of all items */}
      {isOpen && (
        <div className="inventory-dropdown">
          {items.length > 0 ? (
            items.map(item => (
              <button
                key={item.code}
                onClick={() => {
                  onItemSelect(item.code);
                  setIsOpen(false);
                }}
                className={`inventory-item ${
                  item.code === selectedItemCode ? 'selected' : ''
                }`}
              >
                <img
                  src={item.icon}
                  alt={item.name}
                  className="inventory-icon"
                />
                <div className="inventory-item-details">
                  <div className="inventory-item-top-row">
                    <span className="inventory-item-name">
                      {item.name}
                    </span>
                    <span className="inventory-item-quantity">
                      x{item.quantity}
                    </span>
                  </div>
                  <p className="inventory-item-description">
                    {item.description}
                  </p>
                </div>
              </button>
            ))
          ) : (
            <div className="no-inventory">No Items Available</div>
          )}
        </div>
      )}
    </div>
  );
};

ItemSelector.propTypes = {
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
  selectedItemCode: PropTypes.string,
  onItemSelect: PropTypes.func.isRequired,
};

export default ItemSelector;
