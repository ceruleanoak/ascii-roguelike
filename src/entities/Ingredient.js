import { GRID, COLORS } from '../game/GameConfig.js';
import { INGREDIENTS } from '../data/items.js';

export class Ingredient {
  constructor(char, x, y) {
    this.char = char;
    this.data = INGREDIENTS[char] || { char, name: 'Unknown', color: COLORS.INGREDIENT };

    // Pixel-based position
    this.position = { x, y };
    this.velocity = { vx: 0, vy: 0 };
    this.acceleration = { ax: 0, ay: 0 };

    // Rendering
    this.color = this.data.color;
    this.width = GRID.CELL_SIZE;
    this.height = GRID.CELL_SIZE;

    // Physics flags
    this.hasCollision = false;
    this.boundToGrid = true;
    this.friction = true;

    // State
    this.pickedUp = false;
    this.pickupCooldown = 0;  // seconds before magnetization kicks in
    this.bobTimer = 0;        // accumulates while in water for bob animation
    this.inWater = false;     // set each frame by waterResults processing
  }

  getHitbox() {
    return {
      x: this.position.x,
      y: this.position.y,
      width: this.width,
      height: this.height
    };
  }

  pickup() {
    this.pickedUp = true;
  }
}
