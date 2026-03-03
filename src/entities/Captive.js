import { GRID } from '../game/GameConfig.js';
import { NeutralCharacter } from './NeutralCharacter.js';

export class Captive extends NeutralCharacter {
  constructor(characterType, x, y) {
    const color = Captive.getColorForType(characterType);
    super('@', color, x, y);

    this.characterType = characterType; // 'red', 'cyan', 'yellow', 'gray'
    this.width = GRID.CELL_SIZE * 3; // Wider for cage
    this.height = GRID.CELL_SIZE * 3; // Taller for cage
    this.cageDestroyed = false; // First interaction: destroy cage
    this.freed = false; // Second interaction: recruit character

    // Cage structure (5x5 grid)
    this.cage = [
      ['+', '-', '-', '-', '+'],
      ['|', ' ', ' ', ' ', '|'],
      ['|', ' ', '@', ' ', '|'],
      ['|', ' ', ' ', ' ', '|'],
      ['+', '-', '-', '-', '+']
    ];
  }

  static getColorForType(type) {
    const colors = {
      'green': '#00ff00',
      'red': '#ff4444',
      'cyan': '#44ffff',
      'yellow': '#ffff44',
      'gray': '#888888'
    };
    return colors[type] || '#ffffff';
  }

  update(deltaTime) {
    // Update base pulse animation
    super.update(deltaTime);
  }

  getHitbox() {
    return {
      x: this.position.x - GRID.CELL_SIZE,
      y: this.position.y - GRID.CELL_SIZE,
      width: this.width,
      height: this.height
    };
  }

  render(ctx, gridToPixel) {
    if (this.freed) return; // Don't render if recruited

    const centerPixelPos = gridToPixel(
      this.position.x / GRID.CELL_SIZE,
      this.position.y / GRID.CELL_SIZE
    );

    ctx.save();
    ctx.font = `${GRID.CELL_SIZE}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const pulseAlpha = this.getPulseAlpha();
    const cageColor = '#ffaa00'; // Bright yellow/gold for cage

    if (this.cageDestroyed) {
      // Cage destroyed - just render the character
      ctx.globalAlpha = pulseAlpha;
      ctx.fillStyle = this.color;
      ctx.fillText(
        this.char,
        centerPixelPos.x + GRID.CELL_SIZE / 2,
        centerPixelPos.y + GRID.CELL_SIZE / 2
      );
    } else {
      // Render cage structure (5x5 grid centered on position)
      for (let row = 0; row < this.cage.length; row++) {
        for (let col = 0; col < this.cage[row].length; col++) {
          const char = this.cage[row][col];
          if (char === ' ') continue;

          // Calculate position relative to center
          const offsetX = (col - 2) * GRID.CELL_SIZE;
          const offsetY = (row - 2) * GRID.CELL_SIZE;
          const x = centerPixelPos.x + offsetX + GRID.CELL_SIZE / 2;
          const y = centerPixelPos.y + offsetY + GRID.CELL_SIZE / 2;

          // Cage bars are solid yellow, captive character pulses with color
          if (char === '@') {
            ctx.globalAlpha = pulseAlpha;
            ctx.fillStyle = this.color;
          } else {
            ctx.globalAlpha = 1.0;
            ctx.fillStyle = cageColor;
          }

          ctx.fillText(char, x, y);
        }
      }
    }

    ctx.restore();
  }
}
