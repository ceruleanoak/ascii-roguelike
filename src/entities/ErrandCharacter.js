import { GRID } from '../game/GameConfig.js';
import { NeutralCharacter } from './NeutralCharacter.js';
import { getItemData } from '../data/items.js';

const CLOSE_RANGE = GRID.CELL_SIZE * 4;  // Distance to show indicator / enable SHIFT give
const HOP_PERIOD = 2.2;                  // Seconds between hop bursts when far
const HOP_ACTIVE = 0.38;                 // Duration of each hop

// Indicator color per trade stage: ingredient (teal), low-tier (yellow), legendary (gold)
const STAGE_COLORS = ['#44ffee', '#ffff00', '#ffaa00'];

// Dialogue templates keyed to the requested item's resolved name — mirrors
// Fisherman's zone-catch-name generation (data/items.js is the source of
// truth for names, never hardcoded per-char here since the request pool in
// ErrandSystem is meant to stay editable without touching dialogue). Stage 0
// requests a raw ingredient; stages 1-2 request a crafted item back, so the
// phrasing differs. Several phrasings per pool so repeat visits don't repeat
// verbatim (WiseFellow/Fisherman pattern). Never reveals the reward — the
// trade stays a surprise, matching the un-labeled stage-color teaser glyph.
const INGREDIENT_REQUEST_LINES = [
  name => `I'M LOOKING FOR ${name}, IF YOU'VE COME ACROSS ANY.`,
  name => `SPARE SOME ${name}? I'D TRADE WELL FOR IT.`,
  name => `A LITTLE ${name} WOULD GO A LONG WAY OUT HERE.`
];
const ITEM_REQUEST_LINES = [
  name => `I COULD USE A ${name}. MINE'S SEEN BETTER DAYS.`,
  name => `TRADE FOR A ${name}? I HAVE SOMETHING WORTH YOUR WHILE.`,
  name => `PART WITH A ${name} AND YOU CAN HAVE THIS.`
];
const CLOSING_LINE = "LET'S MAKE A DEAL.";

export class ErrandCharacter extends NeutralCharacter {
  constructor(x, y, requestedItem, stage = 0) {
    super('e', '#88ffcc', x, y);
    this.requestedItem = requestedItem;  // char of the item being requested
    this.stage = stage;                  // 0 | 1 | 2 — controls indicator color

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

  /**
   * Speech goes through the standard DialogueSystem protocol (SPACE in talk
   * range opens the box) — see WiseFellow/Fisherman for the same pattern.
   * Computed fresh on every call rather than cached at construction: the
   * traveler is mutated in place (requestedItem/stage) when a trade
   * completes rather than respawned, so a cached line would go stale.
   * Only reachable when the player does NOT currently hold the requested
   * item — ErrandSystem's confirm-menu check consumes SPACE first once a
   * trade is actually possible, so dialogue is purely "here's what I want."
   */
  getDialogueLines() {
    if (!this.requestedItem) return [];
    const itemName = (getItemData(this.requestedItem)?.name || 'SOMETHING').toUpperCase();
    // Stage 0 requests a raw ingredient; stages 1-2 request a crafted item
    // back (mirrors STAGE_CONFIG.isIngredient in ErrandSystem).
    const pool = this.stage === 0 ? INGREDIENT_REQUEST_LINES : ITEM_REQUEST_LINES;
    const line = pool[Math.floor(Math.random() * pool.length)](itemName);
    return [line, CLOSING_LINE];
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

    // Stage-colored item indicator when player is close
    if (this.playerIsClose && this.requestedItem) {
      ctx.globalAlpha = 1.0;
      ctx.fillStyle = STAGE_COLORS[this.stage] ?? '#ffff00';
      ctx.fillText(this.requestedItem, charX, charY - GRID.CELL_SIZE);
    }

    ctx.restore();
  }
}
