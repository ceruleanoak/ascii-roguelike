import { GRID } from '../game/GameConfig.js';
import { CHARACTER_TYPES } from '../data/characters.js';

export class CharacterNPC {
  constructor(characterType, x, y) {
    this.characterType = characterType;
    this.char = '@';
    const charData = CHARACTER_TYPES[characterType];
    this.color = charData.color;
    this.name = charData.name;
    this.position = { x, y };
    this.width = GRID.CELL_SIZE;
    this.height = GRID.CELL_SIZE;

    // Idle animation (gentle bobbing)
    this.idleTimer = Math.random() * Math.PI * 2; // Random start phase
    this.idleSpeed = 1.5;
    this.idleOffset = 0;
  }

  update(deltaTime) {
    // Gentle vertical bobbing animation
    this.idleTimer += deltaTime * this.idleSpeed;
    this.idleOffset = Math.sin(this.idleTimer) * 2; // ±2 pixels
  }

  getHitbox() {
    return {
      x: this.position.x,
      y: this.position.y + this.idleOffset,
      width: this.width,
      height: this.height
    };
  }

  render(ctx, gridToPixel) {
    const pixelPos = gridToPixel(
      this.position.x / GRID.CELL_SIZE,
      this.position.y / GRID.CELL_SIZE
    );

    ctx.save();
    ctx.fillStyle = this.color;
    ctx.font = `${GRID.CELL_SIZE}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(
      this.char,
      pixelPos.x + GRID.CELL_SIZE / 2,
      pixelPos.y + GRID.CELL_SIZE / 2 + this.idleOffset
    );
    ctx.restore();
  }
}
