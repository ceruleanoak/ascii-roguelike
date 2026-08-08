import { GRID, NPC_INTERACTION_RANGE } from '../game/GameConfig.js';
import { NeutralCharacter } from './NeutralCharacter.js';

// Matches the standard NPC talk range (RidgeSystem.CLOSE_RANGE mirrors this)
// — was a wider hand-rolled 4-cell radius.
const CLOSE_RANGE = NPC_INTERACTION_RANGE;
const HOP_PERIOD  = 2.2;
const HOP_ACTIVE  = 0.38;

// Lines drawn (no repeats until exhausted) on the 2nd interaction onward,
// before the bridge is built. Shuffle-bag: see _drawPoolLine().
const DIALOGUE_POOL = [
  'I WISH I HAD AN AXE.',
  'METAL IS TOO RARE IN THE VERDANT.',
  'ROCKS ONLY REQUIRE THE RIGHT TOOL.',
  "I'LL SHOW THEM.",
];

export class BridgeWorker extends NeutralCharacter {
  constructor(x, y) {
    super('W', '#cc9933', x, y);
    this.hopCycleTimer = Math.random() * HOP_PERIOD;
    this.hopOffset = 0;
    this.playerIsClose = false;

    // Dialogue gates the trade menu (RidgeSystem.handleSpacePress): each
    // fresh approach must be greeted before SPACE opens the donation menu.
    // Set true once getDialogueLines() fires, cleared when the player
    // leaves CLOSE_RANGE so the next approach greets again.
    this.readyToTrade = false;

    // True once the bridge is finished and this worker has crossed it —
    // trading is over, only the closing line remains.
    this.tradeComplete = false;

    this._pool = [];       // shuffle-bag of not-yet-drawn pool lines
    this._lastPoolLine = null;
  }

  getInteractionDistance() {
    return CLOSE_RANGE;
  }

  /** Shuffle-bag draw: every line in DIALOGUE_POOL is seen once before any
   *  repeat, and a bag refill avoids immediately repeating the prior line. */
  _drawPoolLine() {
    if (this._pool.length === 0) {
      this._pool = [...DIALOGUE_POOL];
      for (let i = this._pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [this._pool[i], this._pool[j]] = [this._pool[j], this._pool[i]];
      }
      if (this._pool.length > 1 && this._pool[0] === this._lastPoolLine) {
        const swapIdx = 1 + Math.floor(Math.random() * (this._pool.length - 1));
        [this._pool[0], this._pool[swapIdx]] = [this._pool[swapIdx], this._pool[0]];
      }
    }
    const line = this._pool.shift();
    this._lastPoolLine = line;
    return line;
  }

  getDialogueLines(game) {
    this.readyToTrade = true;

    if (this.tradeComplete || game?.currentRoom?.bridgeAnimating || game?.currentRoom?.bridgeBuilt) {
      return ['I HAVE NO REGRETS.'];
    }
    if (!this.spokenOnce) {
      return ["I'M NOT AFRAID OF THE GRAY.", 'I JUST NEED THE RIGHT MATERIALS.'];
    }
    return [this._drawPoolLine()];
  }

  update(deltaTime, game) {
    super.update(deltaTime);
    this.updateTalkIndicator(game);

    const playerPos = game?.player?.position;
    if (!playerPos) return;

    const dx = playerPos.x - this.position.x;
    const dy = playerPos.y - this.position.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    const wasClose = this.playerIsClose;
    this.playerIsClose = distance < CLOSE_RANGE;
    if (wasClose && !this.playerIsClose) {
      // Left proximity — next approach gets a fresh line before the trade
      // menu is offered again.
      this.readyToTrade = false;
    }

    if (!this.playerIsClose) {
      this.hopCycleTimer += deltaTime;
      if (this.hopCycleTimer >= HOP_PERIOD) this.hopCycleTimer = 0;
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

  render(ctx, gridToPixel) {
    const cellPos = gridToPixel(
      this.position.x / GRID.CELL_SIZE,
      this.position.y / GRID.CELL_SIZE
    );

    const charX = cellPos.x + GRID.CELL_SIZE / 2;
    const charY = cellPos.y + GRID.CELL_SIZE / 2 + this.hopOffset;

    ctx.save();
    ctx.font = `${GRID.CELL_SIZE}px Unifont, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Main character with pulse
    ctx.globalAlpha = this.getPulseAlpha();
    ctx.fillStyle = this.color;
    ctx.fillText(this.char, charX, charY);

    // One affordance at a time above the head: material icons while there's
    // still a trade to make (CLOSE_RANGE == NPC_INTERACTION_RANGE, so this
    // and the '!' talk indicator would otherwise always coincide), the
    // standard '!' (from updateTalkIndicator) once trading is done.
    if (this.playerIsClose && !this.tradeComplete) {
      ctx.globalAlpha = 1.0;
      const CS = GRID.CELL_SIZE;
      const spacing = CS * 1.2;
      const iconY = charY - CS * 1.5;

      ctx.fillStyle = '#8b4513';
      ctx.fillText('|', charX - spacing, iconY);

      ctx.fillStyle = '#aaaaaa';
      ctx.fillText('M', charX, iconY);

      ctx.fillStyle = '#888888';
      ctx.fillText('0', charX + spacing, iconY);
    } else if (this.indicator) {
      ctx.globalAlpha = 1.0;
      ctx.fillStyle = this.indicator.color;
      ctx.fillText(this.indicator.char, charX, charY + this.indicator.offsetY);
    }

    ctx.restore();
  }
}
