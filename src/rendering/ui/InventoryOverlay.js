/**
 * InventoryOverlay - Renders the inventory overlay (Tab key)
 *
 * Responsibilities:
 * - Display semi-transparent overlay with border
 * - Show Treasure, Components, Materials — each category laid out in 2
 *   columns, widening to 3 columns if the roster won't fit in 2
 * - Rows that still don't fit the box are dropped in favor of a "+N MORE"
 *   indicator rather than overflowing past the border
 * - Show the run timer (RunTimerSystem) in the top-right corner, and the
 *   Bottles column beneath it (BottlesColumnSystem — arrows walk it, TAB
 *   release arms the highlighted Bottle)
 * - Identical in EXPLORE and REST — always the combined pool
 *
 * Drawn on the zoom-exempt UI layer (renderer.uiCtx, see ASCIIRenderer.clearUI)
 * rather than fgCtx — CameraZoomSystem's combat-proximity zoom CSS-transforms
 * only the bg/fg canvases, so the overlay must live off that layer to stay a
 * constant on-screen size regardless of the current zoom level.
 */

import { GRID, COLORS, GAME_STATES } from '../../game/GameConfig.js';
import { spectaclesTransformString, isSpectaclesActive } from '../../data/cipher.js';
import { getPickupCategory } from '../../data/items.js';
import { ZONE_COLORS } from '../../data/zones.js';
import { BOTTLES_COLUMN_ROWS } from '../../systems/BottlesColumnSystem.js';

const TREASURE_COLOR = '#ffd700';
const COMPONENTS_COLOR = '#ffaa00';
const KEY_ITEM_COLOR = '#ff5555';

// Narrative/puzzle keys (Vault Key, Skull Key) are real Items — picked up
// exactly like a weapon/armor drop, just routed by InventorySystem's
// tryPickupItem into keyItemInventory instead of a quick/equip slot. This
// section reads that array directly (see the KEY ITEMS block in render()
// below); there is no separate flag or registry to keep in sync.

// Column start cells (icon, text), keyed by column count. Icon-text gap is
// 1 cell (was 2) to leave more width for the name before the next column.
// The sections stop short of the Bottles column on the right.
const COLUMN_LAYOUTS = {
  2: [
    { iconX: 4, textX: 5 },
    { iconX: 12, textX: 13 }
  ],
  3: [
    { iconX: 4, textX: 5 },
    { iconX: 9, textX: 10 },
    { iconX: 14, textX: 15 }
  ]
};

// Rightmost cell section content may occupy before it would run into the
// Bottles column.
const CONTENT_RIGHT_CELL = 20;

// ── Bottles column (BottlesColumnSystem owns the cursor) ─────────────────
// Right-aligned under the run timer: title, a wrapped label naming the
// highlighted stack, then one glyph per stack, wrapping into a 2nd column.
const BOTTLES_COLOR = '#aaccee';
const BOTTLES_RIGHT = GRID.WIDTH - GRID.CELL_SIZE * 3;       // run timer's right edge
const BOTTLES_GLYPH_X = [GRID.CELL_SIZE * 24.5, GRID.CELL_SIZE * 26.25];
const BOTTLES_LABEL_SCALE = 0.75;
const BOTTLES_LABEL_WIDTH = GRID.CELL_SIZE * 5.5;            // on-screen px
const BOTTLES_LABEL_LINES = 3;
const BOTTLES_LABEL_LINE_HEIGHT = GRID.CELL_SIZE * 0.75;
const BOTTLES_GLYPH_TOP = GRID.CELL_SIZE * 8.5;
const BOTTLES_GLYPH_STEP = GRID.CELL_SIZE * 1.25;

export class InventoryOverlay {
  constructor(renderer) {
    this.renderer = renderer;
  }

  // Truncates text with an ellipsis so it never crosses maxWidth px — needed
  // for long ingredient names (e.g. "Fire Essence") in the narrower 3-column
  // layout, where a column's text would otherwise run into the next column
  // or past the box border.
  _fitText(text, maxWidth) {
    const ctx = this.renderer.uiCtx;
    if (ctx.measureText(text).width <= maxWidth) return text;
    let truncated = text;
    while (truncated.length > 1 && ctx.measureText(truncated + '…').width > maxWidth) {
      truncated = truncated.slice(0, -1);
    }
    return truncated + '…';
  }

  // Rows a category section would need (title + content rows + spacer) at
  // the given column count. Mirrors _renderCategorySection's row math
  // without drawing, so render() can pick a column count before drawing.
  _sectionRowCount(counts, columnCount) {
    const entryCount = Object.keys(counts).length;
    if (entryCount === 0) return 0;
    return 1 + Math.ceil(entryCount / columnCount) + 1;
  }

  // Renders a category section (title row + up to N entries split across the
  // chosen column layout) and returns the updated row index. Rows past
  // maxIndex are skipped and their item counts folded into `overflow` for
  // the "+N MORE" indicator, rather than drawing outside the box.
  _renderCategorySection(game, title, color, counts, startY, index, spectaclesOn, maxIndex, overflow, columnCount, nameOverrides = null) {
    const entries = Object.entries(counts);
    if (entries.length === 0) return index;

    const lineHeight = GRID.CELL_SIZE * 1.5;
    const columns = COLUMN_LAYOUTS[columnCount];

    if (index > maxIndex) {
      overflow.count += entries.reduce((sum, [, count]) => sum + count, 0);
      return index;
    }

    this.renderer.uiCtx.fillStyle = color;
    this.renderer.uiCtx.textAlign = 'left';
    this.renderer.uiCtx.fillText(spectaclesTransformString(title, spectaclesOn), GRID.CELL_SIZE * 4, startY + index * lineHeight);
    this.renderer.uiCtx.textAlign = 'center';
    index++;

    const rows = Math.ceil(entries.length / columns.length);
    for (let row = 0; row < rows; row++) {
      if (index > maxIndex) {
        for (let r = row; r < rows; r++) {
          for (let col = 0; col < columns.length; col++) {
            const entry = entries[r * columns.length + col];
            if (entry) overflow.count += entry[1];
          }
        }
        return index;
      }

      const y = startY + index * lineHeight;
      for (let col = 0; col < columns.length; col++) {
        const entry = entries[row * columns.length + col];
        if (!entry) continue;
        const [char, count] = entry;
        const overrideName = nameOverrides?.[char];
        const data = overrideName ? { name: overrideName } : game.getIngredientData(char);
        const { iconX, textX } = columns[col];
        const nextColX = columns[col + 1] ? columns[col + 1].iconX : CONTENT_RIGHT_CELL + 1;
        const maxTextWidth = (nextColX - textX) * GRID.CELL_SIZE - GRID.CELL_SIZE * 0.5;

        this.renderer.drawUIEntity(GRID.CELL_SIZE * iconX, y, char, color);

        // Key items pass a nameOverride and, being single one-off pickups,
        // omit the "xN" count suffix used by stackable treasure/components/materials.
        const text = this._fitText(overrideName ? data.name : `${data.name} x${count}`, maxTextWidth);
        this.renderer.uiCtx.fillStyle = COLORS.TEXT;
        this.renderer.uiCtx.textAlign = 'left';
        this.renderer.uiCtx.fillText(spectaclesTransformString(text, spectaclesOn), GRID.CELL_SIZE * textX, y);
        this.renderer.uiCtx.textAlign = 'center';
      }
      index++;
    }
    index++; // Extra space after section
    return index;
  }

  // Word-wraps text into lines no wider than maxWidth (canvas px at the
  // current font), the last line truncated if it still doesn't fit.
  _wrapText(text, maxWidth, maxLines) {
    const ctx = this.renderer.uiCtx;
    const lines = [];
    let line = '';
    for (const word of text.split(' ')) {
      const candidate = line ? `${line} ${word}` : word;
      if (!line || ctx.measureText(candidate).width <= maxWidth) {
        line = candidate;
      } else {
        lines.push(line);
        line = word;
      }
    }
    if (line) lines.push(line);
    if (lines.length > maxLines) {
      lines.length = maxLines;
      lines[maxLines - 1] = this._fitText(lines[maxLines - 1] + '…', maxWidth);
    }
    return lines;
  }

  // The Bottles column: BOTTLES title, the highlighted stack's name (×N when
  // more than one), then glyphs only — one per stack, the cursor boxed.
  _renderBottlesColumn(game, startY, spectaclesOn) {
    const ctx = this.renderer.uiCtx;
    const column = game.bottlesColumnSystem;
    const rows = column.rows();

    ctx.textAlign = 'right';
    ctx.fillStyle = BOTTLES_COLOR;
    ctx.fillText(spectaclesTransformString('BOTTLES', spectaclesOn), BOTTLES_RIGHT, startY);

    const selected = column.selectedRow();
    if (selected) {
      const name = selected.count > 1 ? `${selected.item.data.name} ×${selected.count}` : selected.item.data.name;
      const lines = this._wrapText(spectaclesTransformString(name, spectaclesOn), BOTTLES_LABEL_WIDTH / BOTTLES_LABEL_SCALE, BOTTLES_LABEL_LINES);
      lines.forEach((line, i) => {
        this.renderer.drawUIEntityScaled(BOTTLES_RIGHT, startY + GRID.CELL_SIZE + i * BOTTLES_LABEL_LINE_HEIGHT, line, COLORS.TEXT, BOTTLES_LABEL_SCALE);
      });
    }

    ctx.textAlign = 'center';
    rows.forEach((row, i) => {
      const x = BOTTLES_GLYPH_X[Math.floor(i / BOTTLES_COLUMN_ROWS)];
      const y = BOTTLES_GLYPH_TOP + (i % BOTTLES_COLUMN_ROWS) * BOTTLES_GLYPH_STEP;
      this.renderer.drawUIEntity(x, y, row.char, row.item.data.color || COLORS.ITEM);
      if (i === column.cursor) {
        this.renderer.drawUIRect(x - GRID.CELL_SIZE * 0.6, y - GRID.CELL_SIZE * 0.6, GRID.CELL_SIZE * 1.2, GRID.CELL_SIZE * 1.2, COLORS.ITEM, false);
      }
    });
  }

  render(game) {
    const spectaclesOn = isSpectaclesActive(game);
    this.renderer.uiCtx.save();

    // Draw semi-transparent background
    this.renderer.drawUIRect(
      GRID.CELL_SIZE * 2,
      GRID.CELL_SIZE * 2,
      GRID.WIDTH - GRID.CELL_SIZE * 4,
      GRID.HEIGHT - GRID.CELL_SIZE * 4,
      'rgba(0, 0, 0, 0.8)',
      true
    );

    // Draw border
    this.renderer.drawUIRect(
      GRID.CELL_SIZE * 2,
      GRID.CELL_SIZE * 2,
      GRID.WIDTH - GRID.CELL_SIZE * 4,
      GRID.HEIGHT - GRID.CELL_SIZE * 4,
      COLORS.BORDER,
      false
    );

    // Title is state-independent — the overlay shows the same combined pool
    // in EXPLORE and REST, so there's no "FINDINGS vs INVENTORY" split.
    this.renderer.drawUIEntity(
      GRID.WIDTH / 2,
      GRID.CELL_SIZE * 3,
      spectaclesTransformString('INVENTORY', spectaclesOn),
      COLORS.TEXT
    );

    // Run timer, top-right of the box on the title row. Bare digits, no label —
    // the overlay is non-instructive. Not run through the Spectacles cipher:
    // that mapping is letters-only, so digits and ':' would pass through as-is.
    const runTimerText = game.runTimerSystem.format();
    const runTimerRight = GRID.WIDTH - GRID.CELL_SIZE * 3;
    this.renderer.uiCtx.fillStyle = COLORS.TEXT;
    this.renderer.uiCtx.textAlign = 'right';
    this.renderer.uiCtx.fillText(runTimerText, runTimerRight, GRID.CELL_SIZE * 3);

    // The Curse Clock: on a Cursed Run, a second timer in gray to the run
    // timer's left, counting from the moment the curse began. Same bare digits.
    const curseClockText = game.cursedRunSystem.formatCurseClock(game);
    if (curseClockText) {
      const runTimerWidth = this.renderer.uiCtx.measureText(runTimerText).width;
      this.renderer.uiCtx.fillStyle = ZONE_COLORS.gray;
      this.renderer.uiCtx.fillText(curseClockText, runTimerRight - runTimerWidth - GRID.CELL_SIZE, GRID.CELL_SIZE * 3);
    }
    this.renderer.uiCtx.textAlign = 'center';

    const startY = GRID.CELL_SIZE * 5;
    const lineHeight = GRID.CELL_SIZE * 1.5;
    let index = 0;

    this._renderBottlesColumn(game, startY, spectaclesOn);

    // The whole ingredient pile — one array in every game state.
    const ingredients = game.getIngredients();
    const coinCount = game.inventorySystem.getCoinCount();

    // ── Key items (held, not equipped narrative/puzzle keys) ────────────────
    const keyItemCounts = {};
    const keyItemNames = {};
    for (const item of game.inventorySystem.keyItemInventory) {
      keyItemCounts[item.char] = (keyItemCounts[item.char] || 0) + 1;
      keyItemNames[item.char] = item.data.name;
    }
    const keyItemCount = game.inventorySystem.keyItemInventory.length;

    const totalItems = ingredients.length + coinCount + keyItemCount;

    if (totalItems === 0) {
      const emptyMsg = game.stateMachine.getCurrentState() === GAME_STATES.REST
        ? 'explore to gather ingredients'
        : 'Empty';
      this.renderer.drawUIEntity(
        GRID.WIDTH / 2,
        GRID.HEIGHT / 2,
        spectaclesTransformString(emptyMsg, spectaclesOn),
        COLORS.TEXT
      );
      this.renderer.uiCtx.restore();
      return;
    }

    // ── Treasure (coins + gems) ─────────────────────────────────────────────
    const treasureCounts = {};
    for (const char of ingredients) {
      if (getPickupCategory(char) === 'treasure') {
        treasureCounts[char] = (treasureCounts[char] || 0) + 1;
      }
    }
    if (coinCount > 0) treasureCounts['c'] = coinCount;

    // ── Components (raw ingredients usable as potion recipe inputs) ─────────
    const componentCounts = {};
    for (const char of ingredients) {
      if (getPickupCategory(char) === 'components') {
        componentCounts[char] = (componentCounts[char] || 0) + 1;
      }
    }

    // ── Materials (remaining raw ingredients) ───────────────────────────────
    const materialCounts = {};
    for (const char of ingredients) {
      if (getPickupCategory(char) === 'materials') {
        materialCounts[char] = (materialCounts[char] || 0) + 1;
      }
    }

    // Last row that still fits inside the border.
    const contentBottom = GRID.HEIGHT - GRID.CELL_SIZE * 4;
    const availableRows = Math.floor((contentBottom - startY) / lineHeight) + 1;

    // Prefer 2 columns; widen to 3 only if 2 wouldn't fit the roster.
    const rowsFor2 = this._sectionRowCount(keyItemCounts, 2) + this._sectionRowCount(treasureCounts, 2) + this._sectionRowCount(componentCounts, 2) + this._sectionRowCount(materialCounts, 2);
    const rowsFor3 = this._sectionRowCount(keyItemCounts, 3) + this._sectionRowCount(treasureCounts, 3) + this._sectionRowCount(componentCounts, 3) + this._sectionRowCount(materialCounts, 3);
    const columnCount = rowsFor2 <= availableRows ? 2 : 3;
    const fitsWithoutOverflow = (columnCount === 2 ? rowsFor2 : rowsFor3) <= availableRows;

    // Reserve one row for the "+N MORE" indicator only if even 3 columns overflows.
    const maxIndex = fitsWithoutOverflow ? availableRows - 1 : availableRows - 2;
    const overflow = { count: 0 };

    // KEY ITEMS leads, above Treasure — narrative/puzzle keys aren't loot.
    index = this._renderCategorySection(game, 'KEY ITEMS', KEY_ITEM_COLOR, keyItemCounts, startY, index, spectaclesOn, maxIndex, overflow, columnCount, keyItemNames);
    index = this._renderCategorySection(game, 'TREASURE', TREASURE_COLOR, treasureCounts, startY, index, spectaclesOn, maxIndex, overflow, columnCount);
    index = this._renderCategorySection(game, 'COMPONENTS', COMPONENTS_COLOR, componentCounts, startY, index, spectaclesOn, maxIndex, overflow, columnCount);
    index = this._renderCategorySection(game, 'MATERIALS', COLORS.INGREDIENT, materialCounts, startY, index, spectaclesOn, maxIndex, overflow, columnCount);

    if (overflow.count > 0) {
      this.renderer.drawUIEntity(
        GRID.WIDTH / 2,
        startY + (maxIndex + 1) * lineHeight,
        spectaclesTransformString(`+${overflow.count} MORE`, spectaclesOn),
        COLORS.TEXT
      );
    }

    this.renderer.uiCtx.restore();
  }
}
