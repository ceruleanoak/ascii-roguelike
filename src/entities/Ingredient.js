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

    // Drop-bounce animation (used by crow-pearl drop and any future "tossed" ingredient).
    // dropBounceTimer counts down from dropBounceDuration; renderer reads the ratio to
    // offset y by a decaying sine. When > 0, pickupCooldown also blocks magnet pickup.
    this.dropBounceTimer = 0;
    this.dropBounceDuration = 0;
  }

  startDropBounce(duration = 0.55) {
    this.dropBounceTimer = duration;
    this.dropBounceDuration = duration;
    // Pickup is gated on this cooldown elsewhere; keep them in sync so the bounce plays out.
    if (this.pickupCooldown < duration) this.pickupCooldown = duration;
  }

  // Returns vertical pixel offset for the bounce-settle animation, 0 once finished.
  getDropBounceOffsetY() {
    if (this.dropBounceTimer <= 0 || this.dropBounceDuration <= 0) return 0;
    const t = 1 - (this.dropBounceTimer / this.dropBounceDuration); // 0 → 1
    // Two decaying hops, then settle. Negative = up.
    return -Math.abs(Math.sin(t * Math.PI * 2)) * 6 * (1 - t);
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
