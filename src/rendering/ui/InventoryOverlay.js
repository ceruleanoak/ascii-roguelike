/**
 * InventoryOverlay - Renders the inventory overlay (Tab key)
 *
 * Responsibilities:
 * - Display semi-transparent overlay with border
 * - Show Treasure, Components, Materials — each category laid out in 2
 *   columns, widening to 3 columns if the roster won't fit in 2
 * - Rows that still don't fit the box are dropped in favor of a "+N MORE"
 *   indicator rather than overflowing past the border
 * - Identical in EXPLORE and REST — always the combined pool
 */

import { GRID, COLORS, GAME_STATES } from '../../game/GameConfig.js';
import { spectaclesTransformString, isSpectaclesActive } from '../../data/cipher.js';
import { getPickupCategory } from '../../data/items.js';

const TREASURE_COLOR = '#ffd700';
const COMPONENTS_COLOR = '#ffaa00';

// Column start cells (icon, text), keyed by column count. Icon-text gap is
// 1 cell (was 2) to leave more width for the name before the next column.
const COLUMN_LAYOUTS = {
  2: [
    { iconX: 4, textX: 5 },
    { iconX: 16, textX: 17 }
  ],
  3: [
    { iconX: 4, textX: 5 },
    { iconX: 12, textX: 13 },
    { iconX: 20, textX: 21 }
  ]
};

// Rightmost cell content may occupy before it would cross the border.
const CONTENT_RIGHT_CELL = (GRID.WIDTH - GRID.CELL_SIZE * 2) / GRID.CELL_SIZE - 1;

export class InventoryOverlay {
  constructor(renderer) {
    this.renderer = renderer;
  }

  // Truncates text with an ellipsis so it never crosses maxWidth px — needed
  // for long ingredient names (e.g. "Fire Essence") in the narrower 3-column
  // layout, where a column's text would otherwise run into the next column
  // or past the box border.
  _fitText(text, maxWidth) {
    const ctx = this.renderer.fgCtx;
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
  _renderCategorySection(game, title, color, counts, startY, index, spectaclesOn, maxIndex, overflow, columnCount) {
    const entries = Object.entries(counts);
    if (entries.length === 0) return index;

    const lineHeight = GRID.CELL_SIZE * 1.5;
    const columns = COLUMN_LAYOUTS[columnCount];

    if (index > maxIndex) {
      overflow.count += entries.reduce((sum, [, count]) => sum + count, 0);
      return index;
    }

    this.renderer.fgCtx.fillStyle = color;
    this.renderer.fgCtx.textAlign = 'left';
    this.renderer.fgCtx.fillText(spectaclesTransformString(title, spectaclesOn), GRID.CELL_SIZE * 4, startY + index * lineHeight);
    this.renderer.fgCtx.textAlign = 'center';
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
        const data = game.getIngredientData(char);
        const { iconX, textX } = columns[col];
        const nextColX = columns[col + 1] ? columns[col + 1].iconX : CONTENT_RIGHT_CELL + 1;
        const maxTextWidth = (nextColX - textX) * GRID.CELL_SIZE - GRID.CELL_SIZE * 0.5;

        this.renderer.drawEntity(GRID.CELL_SIZE * iconX, y, char, color);

        const text = this._fitText(`${data.name} x${count}`, maxTextWidth);
        this.renderer.fgCtx.fillStyle = COLORS.TEXT;
        this.renderer.fgCtx.textAlign = 'left';
        this.renderer.fgCtx.fillText(spectaclesTransformString(text, spectaclesOn), GRID.CELL_SIZE * textX, y);
        this.renderer.fgCtx.textAlign = 'center';
      }
      index++;
    }
    index++; // Extra space after section
    return index;
  }

  render(game) {
    const spectaclesOn = isSpectaclesActive(game);
    this.renderer.fgCtx.save();

    // Draw semi-transparent background
    this.renderer.drawRect(
      GRID.CELL_SIZE * 2,
      GRID.CELL_SIZE * 2,
      GRID.WIDTH - GRID.CELL_SIZE * 4,
      GRID.HEIGHT - GRID.CELL_SIZE * 4,
      'rgba(0, 0, 0, 0.8)',
      true
    );

    // Draw border
    this.renderer.drawRect(
      GRID.CELL_SIZE * 2,
      GRID.CELL_SIZE * 2,
      GRID.WIDTH - GRID.CELL_SIZE * 4,
      GRID.HEIGHT - GRID.CELL_SIZE * 4,
      COLORS.BORDER,
      false
    );

    // Title is state-independent — the overlay shows the same combined pool
    // in EXPLORE and REST, so there's no "FINDINGS vs INVENTORY" split.
    this.renderer.drawEntity(
      GRID.WIDTH / 2,
      GRID.CELL_SIZE * 3,
      spectaclesTransformString('INVENTORY', spectaclesOn),
      COLORS.TEXT
    );

    const startY = GRID.CELL_SIZE * 5;
    const lineHeight = GRID.CELL_SIZE * 1.5;
    let index = 0;

    // Combined ingredient pool — banked REST + unbanked carried, always together.
    const combinedIngredients = [
      ...game.inventorySystem.restInventory,
      ...(game.player?.inventory ?? [])
    ];
    const coinCount = game.inventorySystem.getCoinCount();

    const totalItems = combinedIngredients.length + coinCount;

    if (totalItems === 0) {
      const emptyMsg = game.stateMachine.getCurrentState() === GAME_STATES.REST
        ? 'explore to gather ingredients'
        : 'Empty';
      this.renderer.drawEntity(
        GRID.WIDTH / 2,
        GRID.HEIGHT / 2,
        spectaclesTransformString(emptyMsg, spectaclesOn),
        COLORS.TEXT
      );
      this.renderer.fgCtx.restore();
      return;
    }

    // ── Treasure (coins + gems) ─────────────────────────────────────────────
    const treasureCounts = {};
    for (const char of combinedIngredients) {
      if (getPickupCategory(char) === 'treasure') {
        treasureCounts[char] = (treasureCounts[char] || 0) + 1;
      }
    }
    if (coinCount > 0) treasureCounts['c'] = coinCount;

    // ── Components (raw ingredients usable as potion recipe inputs) ─────────
    const componentCounts = {};
    for (const char of combinedIngredients) {
      if (getPickupCategory(char) === 'components') {
        componentCounts[char] = (componentCounts[char] || 0) + 1;
      }
    }

    // ── Materials (remaining raw ingredients) ───────────────────────────────
    const materialCounts = {};
    for (const char of combinedIngredients) {
      if (getPickupCategory(char) === 'materials') {
        materialCounts[char] = (materialCounts[char] || 0) + 1;
      }
    }

    // Last row that still fits inside the border.
    const contentBottom = GRID.HEIGHT - GRID.CELL_SIZE * 4;
    const availableRows = Math.floor((contentBottom - startY) / lineHeight) + 1;

    // Prefer 2 columns; widen to 3 only if 2 wouldn't fit the roster.
    const rowsFor2 = this._sectionRowCount(treasureCounts, 2) + this._sectionRowCount(componentCounts, 2) + this._sectionRowCount(materialCounts, 2);
    const rowsFor3 = this._sectionRowCount(treasureCounts, 3) + this._sectionRowCount(componentCounts, 3) + this._sectionRowCount(materialCounts, 3);
    const columnCount = rowsFor2 <= availableRows ? 2 : 3;
    const fitsWithoutOverflow = (columnCount === 2 ? rowsFor2 : rowsFor3) <= availableRows;

    // Reserve one row for the "+N MORE" indicator only if even 3 columns overflows.
    const maxIndex = fitsWithoutOverflow ? availableRows - 1 : availableRows - 2;
    const overflow = { count: 0 };

    index = this._renderCategorySection(game, 'TREASURE', TREASURE_COLOR, treasureCounts, startY, index, spectaclesOn, maxIndex, overflow, columnCount);
    index = this._renderCategorySection(game, 'COMPONENTS', COMPONENTS_COLOR, componentCounts, startY, index, spectaclesOn, maxIndex, overflow, columnCount);
    index = this._renderCategorySection(game, 'MATERIALS', COLORS.INGREDIENT, materialCounts, startY, index, spectaclesOn, maxIndex, overflow, columnCount);

    if (overflow.count > 0) {
      this.renderer.drawEntity(
        GRID.WIDTH / 2,
        startY + (maxIndex + 1) * lineHeight,
        spectaclesTransformString(`+${overflow.count} MORE`, spectaclesOn),
        COLORS.TEXT
      );
    }

    this.renderer.fgCtx.restore();
  }
}
