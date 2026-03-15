import { GRID } from '../game/GameConfig.js';
import { NeutralCharacter } from './NeutralCharacter.js';

const CLOSE_RANGE = GRID.CELL_SIZE * 4;  // Distance to show indicator / enable SHIFT give
const HOP_PERIOD = 2.2;                  // Seconds between hop bursts when far
const HOP_ACTIVE = 0.38;                 // Duration of each hop

export class ErrandCharacter extends NeutralCharacter {
  constructor(x, y, requestedItem) {
    super('e', '#88ffcc', x, y);
    this.requestedItem = requestedItem;  // char of the item being requested

    // Hop animation
    this.hopCycleTimer = Math.random() * HOP_PERIOD;
    this.hopOffset = 0;
    this.playerIsClose = false;
  }

  update(deltaTime, game) {
    super.update(deltaTime);

    const playerPos = game?.player?.position;
    if (!playerPos) return;

    const dx = playerPos.x - this.position.x;
    const dy = playerPos.y - this.position.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    this.playerIsClose = distance < CLOSE_RANGE;

    if (!this.playerIsClose) {
      this.hopCycleTimer += deltaTime;
      if (this.hopCycleTimer >= HOP_PERIOD) {
        this.hopCycleTimer = 0;
      }
      // Parabolic hop during first HOP_ACTIVE seconds of each cycle
      if (this.hopCycleTimer < HOP_ACTIVE) {
        const t = this.hopCycleTimer / HOP_ACTIVE;
        this.hopOffset = -Math.sin(t * Math.PI) * GRID.CELL_SIZE * 0.65;
      } else {
        this.hopOffset = 0;
      }
    } else {
      this.hopOffset = 0;
      this.hopCycleTimer = 0;
    }
  }

  getInteractionDistance() {
    return CLOSE_RANGE;
  }

  render(ctx, gridToPixel) {
    const cellPos = gridToPixel(
      this.position.x / GRID.CELL_SIZE,
      this.position.y / GRID.CELL_SIZE
    );

    const charX = cellPos.x + GRID.CELL_SIZE / 2;
    const charY = cellPos.y + GRID.CELL_SIZE / 2 + this.hopOffset;

    ctx.save();
    ctx.font = `${GRID.CELL_SIZE}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Main character with pulse
    ctx.globalAlpha = this.getPulseAlpha();
    ctx.fillStyle = this.color;
    ctx.fillText(this.char, charX, charY);

    // Yellow item indicator when player is close
    if (this.playerIsClose && this.requestedItem) {
      ctx.globalAlpha = 1.0;
      ctx.fillStyle = '#ffff00';
      ctx.fillText(this.requestedItem, charX, charY - GRID.CELL_SIZE);
    }

    ctx.restore();
  }
}
