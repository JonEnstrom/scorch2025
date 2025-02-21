import React, { useEffect } from 'react';
import { useShopStore } from '../stores/shopStore';
import { ShopItem } from './ShopItem';

export const ShopModal = () => {
    const { 
        isOpen,
        items,
        playerCash,
        currentCategory,
        timeLeft,
        setOpen,
        setCurrentCategory,
        purchaseItem
    } = useShopStore();

    if (!isOpen) return null;

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            zIndex: 10000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'auto'
        }}>
            <div style={{
                background: '#1a1a1a',
                borderRadius: '8px',
                width: '90%',
                maxWidth: '1000px',
                maxHeight: '90vh',
                display: 'flex',
                flexDirection: 'column',
                color: 'white'
            }}>
                {/* Header */}
                <div style={{
                    padding: '20px',
                    borderBottom: '1px solid #333',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                }}>
                    <div>
                        <h2 style={{ fontSize: '24px', fontWeight: 'bold' }}>Shop</h2>
                        <div style={{ color: '#ffd700' }}>Time left: {timeLeft}s</div>
                        <div style={{ color: '#4ade80' }}>Cash: ${playerCash}</div>
                    </div>
                    <button 
                        onClick={() => setOpen(false)}
                        style={{
                            background: 'none',
                            border: 'none',
                            color: 'white',
                            fontSize: '24px',
                            cursor: 'pointer'
                        }}
                    >
                        ×
                    </button>
                </div>

                {/* Items Grid */}
                <div style={{
                    padding: '20px',
                    overflowY: 'auto',
                    flex: 1
                }}>
                    <div style={{
                        display: 'grid',
                        gap: '20px',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))'
                    }}>
                        {items.map((item, index) => (
                            <div 
                                key={index}
                                style={{
                                    padding: '15px',
                                    background: '#333',
                                    borderRadius: '4px',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '10px'
                                }}
                            >
                                <img style={{width: 100}} src={item.icon}></img>
                                <h3 style={{ fontSize: '18px', fontWeight: 'bold' }}>{item.name}</h3>
                                <p style={{ color: '#aaa' }}>{item.description}</p>
                                <div style={{ color: '#4ade80' }}>Cost: ${item.cost}</div>
                                <button 
                                    onClick={() => purchaseItem(item.name, 1)}
                                    style={{
                                        background: '#4ade80',
                                        color: 'black',
                                        padding: '8px',
                                        borderRadius: '4px',
                                        cursor: 'pointer',
                                        border: 'none'
                                    }}
                                    disabled={item.cost > playerCash}
                                >
                                    Purchase
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};