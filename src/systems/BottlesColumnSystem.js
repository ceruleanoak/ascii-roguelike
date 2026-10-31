/**
 * BottlesColumnSystem.js
 *
 * The Bottles column — the BOTTLES column of the TAB overlay (InventoryOverlay
 * draws it). While TAB is held the arrow keys walk a cursor over every
 * carried Bottle — Bottles and equipped slot Bottles alike — stacked by
 * glyph; releasing TAB arms the highlighted stack, so the Armed Glyph rises
 * over the player and SPACE uses it. An equipped stack arms its slot.
 * Otherwise, with a consumable slot free, the Bottle moves into it and the
 * slot is armed (InventorySystem.equipBottleIntoFreeSlot); with none, it is
 * armed straight from Bottles (ConsumableTriggerSystem.armBottle). No equip
 * menu.
 *
 * A plain TAB peek arms nothing: the release only commits when an arrow moved
 * the cursor during that hold.
 *
 * Owns only the cursor. The Bottles themselves are inventorySystem.bottles
 * (operations in BottlesSystem).
 */

// Glyph rows per column before the column wraps into a second one. Shared
// with InventoryOverlay's layout (title + label lines above, box border below).
export const BOTTLES_COLUMN_ROWS = 15;
export const BOTTLES_COLUMN_MAX_COLUMNS = 2;

const ARROW_STEP = {
  ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0]
};

export class BottlesColumnSystem {
  constructor(game) {
    this.game = game;
    this.cursor = -1;   // index into rows(); -1 = nothing highlighted
    this.moved = false; // an arrow moved the cursor during this TAB hold
  }

  /**
   * Every carried Bottle — equipped slot Bottles first, then Bottles —
   * stacked by glyph, in order of first appearance. Equipping a Bottle does
   * not hide it here; a slot Bottle and its Bottles twins share one row.
   * Hot Water splits by rooms left, so a nearly-cooled bottle stays its own
   * stack. Each row: { char, item (first in the stack), refs (Bottle Refs),
   * count }.
   */
  rows() {
    const bottlesSystem = this.game.bottlesSystem;
    const all = bottlesSystem.allRefs();
    const ordered = [...all.filter(r => r.source === 'slot'), ...all.filter(r => r.source === 'bottles')];
    const rows = [];
    const byKey = new Map();
    for (const ref of ordered) {
      const item = bottlesSystem.itemAt(ref);
      if (!item) continue;
      const key = item.hotWaterRoomsLeft === undefined ? item.char : `${item.char}:${item.hotWaterRoomsLeft}`;
      let row = byKey.get(key);
      if (!row) {
        row = { char: item.char, item, refs: [], count: 0 };
        byKey.set(key, row);
        rows.push(row);
      }
      row.refs.push(ref);
      row.count += item.count || 1;
    }
    return rows.slice(0, BOTTLES_COLUMN_ROWS * BOTTLES_COLUMN_MAX_COLUMNS);
  }

  /** The highlighted row, or null. */
  selectedRow() {
    return this.cursor >= 0 ? this.rows()[this.cursor] ?? null : null;
  }

  /** TAB pressed: a fresh hold starts with nothing highlighted. */
  begin() {
    this.cursor = -1;
    this.moved = false;
  }

  /**
   * Arrow while TAB is held. Up/down walk the stacks (up past the top clears
   * the highlight); left/right jump between the two columns.
   */
  step(dx, dy) {
    const count = this.rows().length;
    if (count === 0) return;
    this.moved = true;
    if (this.cursor === -1) {
      if (dy > 0 || dx !== 0) this.cursor = 0;
      return;
    }
    if (dy !== 0) {
      const next = this.cursor + dy;
      this.cursor = next < 0 ? -1 : Math.min(next, count - 1);
      return;
    }
    const next = this.cursor + dx * BOTTLES_COLUMN_ROWS;
    if (next >= 0 && next < count) this.cursor = next;
    else if (dx > 0 && Math.floor((count - 1) / BOTTLES_COLUMN_ROWS) > Math.floor(this.cursor / BOTTLES_COLUMN_ROWS)) {
      this.cursor = count - 1; // a short second column: land on its last stack
    }
  }

  /** An arrow key's keydown while TAB is held. */
  stepArrow(key) {
    const [dx, dy] = ARROW_STEP[key];
    this.step(dx, dy);
  }

  /** TAB released: arm the highlighted stack if the cursor was moved. */
  commit() {
    const row = this.moved ? this.selectedRow() : null;
    this.begin();
    if (!row || this.game.player?.polymorphed) return;
    // An equipped stack arms its slot. Otherwise a free slot takes the
    // chosen Bottle and arms it there; full slots arm it straight from Bottles.
    const { game } = this;
    const slotRef = row.refs.find(r => r.source === 'slot');
    if (slotRef) { game.consumableTriggerSystem.selectSlot(slotRef.index); return; }
    const slot = game.inventorySystem.equipBottleIntoFreeSlot(row.item, game.player);
    if (slot !== -1) game.consumableTriggerSystem.selectSlot(slot);
    else game.consumableTriggerSystem.armBottle(row.item);
  }
}
