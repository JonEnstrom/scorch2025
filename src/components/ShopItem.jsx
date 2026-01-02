import React, { useState } from 'react';

export const ShopItem = ({ item, onPurchase, playerCash }) => {
    const [quantity, setQuantity] = useState(1);
    const [isPurchasing, setIsPurchasing] = useState(false);
    
    const totalCost = item.cost * quantity;
    const canAfford = totalCost <= playerCash;

    const handlePurchase = () => {
        if (!canAfford || isPurchasing) return;
        
        setIsPurchasing(true);
        onPurchase(item.name, quantity);
        
        setTimeout(() => {
            setIsPurchasing(false);
        }, 1500);
    };

    return (
        <div className="w-full p-4 bg-gray-800 rounded-lg shadow-lg">
            <div className="flex items-start space-x-4">
                <img 
                    src={item.icon} 
                    alt={item.name}
                    className="w-16 h-16 object-cover rounded"
                />
                <div className="flex-1">
                    <h3 className="text-lg font-bold text-white">{item.name}</h3>
                    <p className="text-gray-300 text-sm">{item.description}</p>
                    <div className="mt-2 flex items-center justify-between">
                        <div className="text-green-400">
                            ${item.cost} each
                            <span className="ml-2 text-gray-400">
                                Total: ${totalCost}
                            </span>
                        </div>
                        <div className="flex items-center space-x-2">
                            <button
                                className="px-2 py-1 bg-gray-700 text-white rounded disabled:opacity-50"
                                onClick={() => setQuantity(Math.max(1, quantity - 1))}
                                disabled={isPurchasing}
                            >
                                -
                            </button>
                            <input
                                type="number"
                                className="w-16 px-2 py-1 bg-gray-700 text-white rounded text-center"
                                value={quantity}
                                onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                                min="1"
                                disabled={isPurchasing}
                            />
                            <button
                                className="px-2 py-1 bg-gray-700 text-white rounded disabled:opacity-50"
                                onClick={() => setQuantity(quantity + 1)}
                                disabled={isPurchasing}
                            >
                                +
                            </button>
                            <button
                                className={`px-4 py-1 rounded font-medium transition-colors ${
                                    canAfford 
                                        ? 'bg-green-600 hover:bg-green-700 text-white' 
                                        : 'bg-red-600 cursor-not-allowed'
                                }`}
                                onClick={handlePurchase}
                                disabled={!canAfford || isPurchasing}
                            >
                                {isPurchasing ? 'Purchasing...' : 'Buy'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};