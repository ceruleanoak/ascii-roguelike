import { GRID } from '../game/GameConfig.js';

/**
 * Base class for non-hostile entities (Captives, Leshy, future NPCs)
 * Provides common functionality: pulsing animation, indicators, standard entity interface
 */
export class NeutralCharacter {
  constructor(char, color, x, y) {
    this.char = char;
    this.color = color;
    this.position = { x, y };
    this.width = GRID.CELL_SIZE;
    this.height = GRID.CELL_SIZE;
    this.velocity = { x: 0, y: 0 };

    // Pulsing animation
    this.pulseTimer = 0;
    this.pulseSpeed = 2.0;
    this.pulseMin = 0.7;
    this.pulseMax = 1.0;

    // Optional indicator (e.g., white '!' above character)
    this.indicator = null; // { char, color, offsetY }
  }

  update(deltaTime) {
    // Update pulse animation
    this.pulseTimer += deltaTime * this.pulseSpeed;
  }

  getPulseAlpha() {
    // Sine wave between pulseMin and pulseMax
    const sineWave = Math.sin(this.pulseTimer);
    return this.pulseMin + (sineWave + 1) * 0.5 * (this.pulseMax - this.pulseMin);
  }

  setIndicator(char, color, offsetY = -GRID.CELL_SIZE) {
    this.indicator = { char, color, offsetY };
  }

  clearIndicator() {
    this.indicator = null;
  }

  getHitbox() {
    return {
      x: this.position.x - this.width / 2,
      y: this.position.y - this.height / 2,
      width: this.width,
      height: this.height
    };
  }

  render(ctx, gridToPixel) {
    const centerPixelPos = gridToPixel(
      this.position.x / GRID.CELL_SIZE,
      this.position.y / GRID.CELL_SIZE
    );

    ctx.save();
    ctx.font = `${GRID.CELL_SIZE}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const pulseAlpha = this.getPulseAlpha();

    // Render main character with pulse
    ctx.globalAlpha = pulseAlpha;
    ctx.fillStyle = this.color;
    ctx.fillText(
      this.char,
      centerPixelPos.x + GRID.CELL_SIZE / 2,
      centerPixelPos.y + GRID.CELL_SIZE / 2
    );

    // Render indicator if present
    if (this.indicator) {
      ctx.globalAlpha = 1.0;
      ctx.fillStyle = this.indicator.color;
      ctx.fillText(
        this.indicator.char,
        centerPixelPos.x + GRID.CELL_SIZE / 2,
        centerPixelPos.y + GRID.CELL_SIZE / 2 + this.indicator.offsetY
      );
    }

    ctx.restore();
  }
}
