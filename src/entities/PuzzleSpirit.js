import { GRID } from '../game/GameConfig.js';
import { NeutralCharacter } from './NeutralCharacter.js';

const RISE_DURATION = 1.2; // seconds of rise + fade-in after the puzzle solves

/**
 * PuzzleSpirit — the hint-bearer raised by a solved P-room puzzle.
 *
 * Appearance (char/color) and dialogue come from the zone's puzzle config
 * (data/puzzles.js). Speech goes through the standard DialogueSystem
 * protocol: getDialogueLines + SPACE in talk range. The spirit never moves;
 * it bobs in place like the other ambient NPCs.
 */
export class PuzzleSpirit extends NeutralCharacter {
  constructor(x, y, spiritConfig) {
    super(spiritConfig.char, spiritConfig.color, x, y);
    this.lines = spiritConfig.lines;
    this.riseTimer = 0;      // counts up to RISE_DURATION
    this.bobTimer = Math.random() * Math.PI * 2;
  }

  getDialogueLines() {
    return this.lines;
  }

  update(deltaTime, game) {
    super.update(deltaTime);
    if (this.riseTimer < RISE_DURATION) this.riseTimer += deltaTime;
    this.bobTimer += deltaTime * 1.6;
    this.updateTalkIndicator(game);
  }

  render(ctx, gridToPixel) {
    const cellPos = gridToPixel(
      this.position.x / GRID.CELL_SIZE,
      this.position.y / GRID.CELL_SIZE
    );

    const riseT = Math.min(this.riseTimer / RISE_DURATION, 1);
    const riseOffset = (1 - riseT) * GRID.CELL_SIZE * 0.8;
    const bobOffset = Math.sin(this.bobTimer) * 2;
    const charX = cellPos.x + GRID.CELL_SIZE / 2;
    const charY = cellPos.y + GRID.CELL_SIZE / 2 + riseOffset + bobOffset;

    ctx.save();
    ctx.font = `${GRID.CELL_SIZE}px Unifont, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.globalAlpha = this.getPulseAlpha() * riseT;
    ctx.fillStyle = this.color;
    ctx.fillText(this.char, charX, charY);

    if (this.indicator) {
      ctx.globalAlpha = riseT;
      ctx.fillStyle = this.indicator.color;
      ctx.fillText(this.indicator.char, charX, charY + this.indicator.offsetY);
    }

    ctx.restore();
  }
}
