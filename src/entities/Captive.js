import { GRID } from '../game/GameConfig.js';
import { NeutralCharacter } from './NeutralCharacter.js';

export const CAGE_COLOR = '#ffaa00';

// Cage Drop: the cage is thrown down, not let go — it leaves its start height
// already moving, then accelerates into the floor.
const CAGE_FALL_HEIGHT = GRID.CELL_SIZE * 5;
const CAGE_FALL_START_SPEED = 120; // px/s
const CAGE_FALL_GRAVITY = 800; // px/s²

// Pacing inside the cage: still for a beat after the slam, then one step at a
// time, leaning toward the player.
const PACE_LANDING_BEAT = 0.4; // seconds
const PACE_MIN_INTERVAL = 0.6; // seconds
const PACE_MAX_INTERVAL = 1.2; // seconds
const PACE_STEP_DURATION = 0.1; // seconds to slide one cell
const PACE_TOWARD_PLAYER_CHANCE = 0.75;
const PACE_LIMIT = 1; // the 3x3 hollow of the 5x5 cage

export class Captive extends NeutralCharacter {
  constructor(characterType, x, y) {
    const color = Captive.getColorForType(characterType);
    super('@', color, x, y);

    this.characterType = characterType; // 'red', 'cyan', 'yellow', 'gray'
    this.width = GRID.CELL_SIZE * 3; // Wider for cage
    this.height = GRID.CELL_SIZE * 3; // Taller for cage
    this.cageDestroyed = false; // First interaction: destroy cage
    this.freed = false; // Second interaction: recruit character

    // Cage Drop: `position` is the landing spot from the start; the cage draws
    // `fallOffset` px above it until it lands.
    this.falling = true;
    this.fallOffset = CAGE_FALL_HEIGHT;
    this.fallVelocity = CAGE_FALL_START_SPEED;

    // The character's cell inside the cage, relative to the cage's center.
    this.innerCol = 0;
    this.innerRow = 0;
    this.paceFromCol = 0;
    this.paceFromRow = 0;
    this.paceStepTimer = 0; // Counts down a step's slide between cells
    this.paceTimer = PACE_LANDING_BEAT; // Counts down to the next step

    // Cage structure (5x5 grid)
    this.cage = [
      ['+', '-', '-', '-', '+'],
      ['|', ' ', ' ', ' ', '|'],
      ['|', ' ', ' ', ' ', '|'],
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

  // Advances the Cage Drop. Returns true on the frame the cage lands.
  updateFall(deltaTime) {
    this.fallVelocity += CAGE_FALL_GRAVITY * deltaTime;
    this.fallOffset -= this.fallVelocity * deltaTime;
    if (this.fallOffset > 0) return false;
    this.fallOffset = 0;
    this.falling = false;
    return true;
  }

  updatePacing(deltaTime, player) {
    this.paceStepTimer = Math.max(0, this.paceStepTimer - deltaTime);
    this.paceTimer -= deltaTime;
    if (this.paceTimer > 0) return;

    this.paceTimer = PACE_MIN_INTERVAL + Math.random() * (PACE_MAX_INTERVAL - PACE_MIN_INTERVAL);
    const step = Math.random() < PACE_TOWARD_PLAYER_CHANCE
      ? this._stepTowardPlayer(player)
      : this._randomStep();
    const col = this.innerCol + step.col;
    const row = this.innerRow + step.row;
    if (Math.abs(col) > PACE_LIMIT || Math.abs(row) > PACE_LIMIT || (step.col === 0 && step.row === 0)) return;

    this.paceFromCol = this.innerCol;
    this.paceFromRow = this.innerRow;
    this.innerCol = col;
    this.innerRow = row;
    this.paceStepTimer = PACE_STEP_DURATION;
  }

  // The larger gap to the player goes first; once the bars stop that axis the
  // character works along the other, ending in the nearest corner.
  _stepTowardPlayer(player) {
    const gapX = player.position.x - (this.position.x + this.innerCol * GRID.CELL_SIZE);
    const gapY = player.position.y - (this.position.y + this.innerRow * GRID.CELL_SIZE);
    const stepX = { col: Math.abs(gapX) < GRID.CELL_SIZE / 2 ? 0 : Math.sign(gapX), row: 0 };
    const stepY = { col: 0, row: Math.abs(gapY) < GRID.CELL_SIZE / 2 ? 0 : Math.sign(gapY) };
    const [first, second] = Math.abs(gapX) >= Math.abs(gapY) ? [stepX, stepY] : [stepY, stepX];
    const firstOpen = Math.abs(this.innerCol + first.col) <= PACE_LIMIT
      && Math.abs(this.innerRow + first.row) <= PACE_LIMIT;
    return firstOpen && (first.col !== 0 || first.row !== 0) ? first : second;
  }

  _randomStep() {
    const steps = [{ col: 1, row: 0 }, { col: -1, row: 0 }, { col: 0, row: 1 }, { col: 0, row: -1 }];
    return steps[Math.floor(Math.random() * steps.length)];
  }

  // The freed character stands where it was when the cage came apart.
  breakOpen() {
    this.cageDestroyed = true;
    this.position.x += this.innerCol * GRID.CELL_SIZE;
    this.position.y += this.innerRow * GRID.CELL_SIZE;
    this.innerCol = 0;
    this.innerRow = 0;
    this.paceStepTimer = 0;
  }

  // Each cage bar with its cell's center in world pixels.
  getCageBars() {
    const bars = [];
    for (let row = 0; row < this.cage.length; row++) {
      for (let col = 0; col < this.cage[row].length; col++) {
        const char = this.cage[row][col];
        if (char === ' ') continue;
        bars.push({
          char,
          x: this.position.x + (col - 2) * GRID.CELL_SIZE + GRID.CELL_SIZE / 2,
          y: this.position.y + (row - 2) * GRID.CELL_SIZE + GRID.CELL_SIZE / 2
        });
      }
    }
    return bars;
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
    ctx.font = `${GRID.CELL_SIZE}px 'Unifont', monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    if (!this.cageDestroyed) {
      // Cage bars are solid; only the captive character pulses
      ctx.globalAlpha = 1.0;
      ctx.fillStyle = CAGE_COLOR;
      for (const bar of this.getCageBars()) {
        ctx.fillText(
          bar.char,
          bar.x - this.position.x + centerPixelPos.x,
          bar.y - this.position.y + centerPixelPos.y - this.fallOffset
        );
      }
    }

    // Mid-step, the character slides from its last cell to its new one
    const slide = 1 - this.paceStepTimer / PACE_STEP_DURATION;
    const col = this.paceFromCol + (this.innerCol - this.paceFromCol) * slide;
    const row = this.paceFromRow + (this.innerRow - this.paceFromRow) * slide;

    ctx.globalAlpha = this.getPulseAlpha();
    ctx.fillStyle = this.color;
    ctx.fillText(
      this.char,
      centerPixelPos.x + col * GRID.CELL_SIZE + GRID.CELL_SIZE / 2,
      centerPixelPos.y + row * GRID.CELL_SIZE + GRID.CELL_SIZE / 2 - this.fallOffset
    );

    ctx.restore();
  }
}
