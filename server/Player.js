// server/player.js
import * as THREE from 'three';

export default class Player {
    constructor(x, y, z) {
        this.position = new THREE.Vector3(x, y, z);
        this.power =  20;
        this.turretPitch = 0;  
        this.turretYaw = 0;
        this.maxHealth = 100;
        this.health = 100;
        this.armor = 0;
        this.hasShield = false;
        this.shield = 0;
        this.name = "Unknown";  
        this.color = null;
        this.cash = 5000;
        this.inventory = {};
        this.selectedWeapon = null;
        this.selectedItem = null;
        this.isAlive = true;
        this.isReady = false;
        this.isSpectator = false;
    }

    // ----------------------------------------------------------------
    //  GETTERS
    // ----------------------------------------------------------------
    getPosition() {
        return this.position.clone();
    }

    getColor() {
        return this.color;
    }

    getName() {
        return this.name;
    }

    getIsAlive() {
        return this.isAlive;
    }

    getHealth() {
        return this.health;
    }
    
    getArmor() {
        return this.armor;
    }

    getShield() {
        return this.shield;
    }

    getState() {
        return {
            position: this.getPosition(),
            turretPitch: this.turretPitch,
            turretYaw: this.turretYaw,
            power: this.power,
            health: this.health,
            armor: this.armor,
            shield: this.shield,
            name: this.name,
            color: this.color,
            cash: this.cash,
            inventory: this.inventory,
            selectedWeapon: this.selectedWeapon,
            selectedItem: this.selectedItem,
            isSpectator: this.isSpectator
        };
    }
    
    // ----------------------------------------------------------------
    //  SETTERS
    // ----------------------------------------------------------------
    setName(newName) {
        this.name = newName;
    }

    setColor(newColor) {
        this.color = newColor;
    }
    setTurretYaw(delta) {
        this.turretYaw = (this.turretYaw + delta) % 360;
        if (this.turretYaw < 0) {
            this.turretYaw += 360;
        }
    }
    newTurretYaw(value) {
        this.turretYaw = value;
    }

    deltaTurretPitch(delta) {
        const newPitch = this.turretPitch + delta;
        this.turretPitch = THREE.MathUtils.clamp(newPitch, -90, 10);
    }
    setTurretPitch(value) {
        const newPitch = value;
        this.turretPitch = THREE.MathUtils.clamp(newPitch, -90, 10);
    }

    adjustPower(delta) {
        const newPower = this.power + delta;
        this.power = THREE.MathUtils.clamp(newPower, 5, 100);
    }
    setPower(value) {
        this.power = THREE.MathUtils.clamp(value, 5, 100);
    }

    setPosition(newPos) {
        this.position.set(newPos.x, newPos.y, newPos.z);
    }
    
    // ----------------------------------------------------------------
    //  ITEMS / INVENTORY
    // ----------------------------------------------------------------
    addItem(item, quantity = 1) {
        const code = item.code;
        if (!this.inventory[code]) {
            this.inventory[code] = {
                item: item,
                quantity: 0
            };
        }
        this.inventory[code].quantity += quantity;
    }

    removeItem(itemCode, quantity = 1) {
        if (!this.inventory[itemCode] || this.inventory[itemCode].quantity < quantity) {
            return false;
        }
        
        this.inventory[itemCode].quantity -= quantity;
        if (this.inventory[itemCode].quantity <= 0) {
            delete this.inventory[itemCode];
        }
        return true;
    }

    /*
     * Gets the quantity of a specific item in inventory
     * @param {string} itemCode - The code of the item to check
     * @returns {number} - The quantity of the item (0 if not present)
     */
    getItemCount(itemCode) {
        return this.inventory[itemCode]?.quantity || 0;
    }

    /**
     * Gets the full item object from inventory
     * @param {string} itemCode - The code of the item to get
     * @returns {GameItem|null} - The full item object or null if not in inventory
     */
    getItem(itemCode) {
        return this.inventory[itemCode]?.item || null;
    }

    /**
     * Gets all items in the inventory with their quantities
     * @returns {Object} - The full inventory object
     */
    getInventory() {
        return this.inventory;
    }
    
    /**
     * Checks if the player has a specific item in their inventory.
     * @param {string} itemCode - The code of the item to check.
     * @returns {boolean} - True if the player has at least one of the item, false otherwise.
     */
    hasItem(itemCode) {
        return this.getItemCount(itemCode) > 0;
    }

    // ----------------------------------------------------------------
    //  FIRING HELPERS
    // ----------------------------------------------------------------
    getFireDirection() {
        const direction = new THREE.Vector3(0, 0, 1);
        const euler = new THREE.Euler(
            THREE.MathUtils.degToRad(this.turretPitch), // X rotation (pitch)
            THREE.MathUtils.degToRad(this.turretYaw),   // Y rotation (yaw)
            0,
            'YXZ'
        );
        direction.applyEuler(euler);
        return direction.normalize();
    }

    getBarrelTip() {
        const BARREL_LENGTH = 2;
        const TURRET_HEIGHT = 2;
        const tip = this.position.clone();
        tip.y += TURRET_HEIGHT;
        const direction = this.getFireDirection();
        tip.add(direction.multiplyScalar(BARREL_LENGTH));
        return tip;
    }

    destroy() {
        if (this.position) {
            this.position.set(0, 0, 0);
        }
        this.position = null;

        for (const itemCode in this.inventory) {
            const entry = this.inventory[itemCode];
            if (entry.item && entry.item.destroy) {
                entry.item.destroy();
            }
        }
        this.inventory = {};
        this.power = 0;
        this.turretPitch = 0;
        this.turretYaw = 0;
        this.health = 0;
        this.name = null;
        this.color = null;
        this.cash = 0;
    }

    resetForNewRound() {
        this.isAlive = true;
         this.health = 100;
         this.armor = 0;
         this.shield = 0;
         this.turretPitch = -45;
         this.power = 20;
    }
}
