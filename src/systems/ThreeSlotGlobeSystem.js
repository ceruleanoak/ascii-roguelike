import { menuIntent } from './MenuInput.js';
import { ThreeSlotGlobeOverlay } from '../rendering/ui/ThreeSlotGlobeOverlay.js';
import { ITEMS } from '../data/items.js';

/**
 * ThreeSlotGlobeSystem — the offering menu for the Three Room's slots.
 *
 * SPACE on an empty slot opens this as a PauseSystem modal: the world freezes
 * and a slowly turning globe fills the frame, its surface carrying every glyph
 * this run has touched. Navigation is orthogonal — left/right walks the
 * longitude ring, up/down changes latitude band — and the globe rotates the
 * chosen glyph to the front-center of the frame rather than moving a cursor
 * over it. The far hemisphere is not drawn at all.
 *
 * The offered set is deliberately run-scoped (see recordTouched): the player
 * can only offer what this particular run put in their hands, so the puzzle is
 * simply unsolvable on some runs. That is the intent, not a gap — the Three
 * Room is not a thing you clear on demand.
 *
 * Confirming is final. The glyph goes into the slot and the slot locks; there
 * is no reopening it to change an answer. ThreeRoomSystem owns what the
 * placement then means.
 *
 * GLOSSARY: "globe" and "offering" are working terms pending the user's
 * naming — see the plan's open-decisions list.
 */

// How long the globe takes to bring a newly selected glyph to front-center.
const ROTATE_DURATION_MS = 260;

// Ignore input briefly after opening so the SPACE that opened the globe can't
// carry through into an immediate, irreversible confirm.
const INPUT_LOCKOUT_MS = 250;

// Latitude band count scales with how much the run has touched — one ring
// reads best when there is little to show, three when the globe is crowded.
function bandCountFor(n) {
  if (n <= 8) return 1;
  if (n <= 16) return 2;
  return 3;
}

export class ThreeSlotGlobeSystem {
  constructor(game) {
    this.game = game;
    this.overlay = new ThreeSlotGlobeOverlay();

    // Every glyph this run has put in the player's hands. Run-scoped: cleared
    // by the same reset paths that end a run (see main.js reset parity).
    this.touched = new Set();

    this.slot = null;        // the BackgroundObject being offered to
    this.symbols = [];       // chars laid out on the globe, in grid order
    this.bands = 1;          // latitude band count
    this.perBand = 0;        // longitude columns per band
    this.row = 0;
    this.col = 0;

    // Rotation animation state. The modal pauses the world, so PauseSystem
    // never ticks us — these are driven off wall-clock time at render.
    this.rotFrom = 0;
    this.rotTo = 0;
    this.tiltFrom = 0;
    this.tiltTo = 0;
    this.animStart = 0;

    this.openedAt = 0;
    this.inputReadyAt = 0;
  }

  /**
   * Remember a glyph the run has touched. Called from the pickup and crafting
   * dispatch sites; harmless to call with a glyph already recorded.
   */
  recordTouched(char) {
    if (typeof char === 'string' && char.length > 0) this.touched.add(char);
  }

  /** Run-scoped clear — the globe forgets everything when the run ends. */
  hardReset() {
    this.touched.clear();
    this.slot = null;
  }

  /**
   * SPACE on a Three Room slot. Refuses a slot that already holds an offering
   * (placement is one-shot) and refuses to open on an empty run rather than
   * showing a bare sphere with nothing on it.
   * @returns {boolean} true when the press was consumed
   */
  open(slot) {
    if (!slot || slot.threeFilled) return false;
    if (this.touched.size === 0) return false;
    if (!this.game.pauseSystem.openModal(this)) return false;

    this.slot = slot;
    this.symbols = [...this.touched];
    this.bands = bandCountFor(this.symbols.length);
    this.perBand = Math.ceil(this.symbols.length / this.bands);
    this.row = 0;
    this.col = 0;

    const { lat, lon } = this.cellAngles(this.row, this.col);
    this.rotFrom = this.rotTo = lon;
    this.tiltFrom = this.tiltTo = lat;
    this.animStart = performance.now();

    this.openedAt = performance.now();
    this.inputReadyAt = this.openedAt + INPUT_LOCKOUT_MS;
    return true;
  }

  // ── Globe layout ─────────────────────────────────────────────────────────

  /** Index into `symbols` for a grid cell, or -1 where the grid is ragged. */
  indexAt(row, col) {
    const idx = row * this.perBand + col;
    return idx < this.symbols.length ? idx : -1;
  }

  /**
   * Sphere coordinates for a grid cell. Latitude bands are spread across the
   * middle of the sphere (never the poles, where glyphs would crowd into a
   * point); longitude divides the full ring evenly.
   */
  cellAngles(row, col) {
    const latSpread = Math.PI / 3.2;                  // ±~28° from the equator
    const lat = this.bands === 1
      ? 0
      : -latSpread / 2 + (row / (this.bands - 1)) * latSpread;
    const lon = (col / this.perBand) * Math.PI * 2;
    return { lat, lon };
  }

  /** Current animated rotation/tilt, eased toward the selection. */
  orientation(now = performance.now()) {
    const t = Math.min(1, (now - this.animStart) / ROTATE_DURATION_MS);
    const e = 1 - Math.pow(1 - t, 3);                 // easeOutCubic
    return {
      rot: this.rotFrom + (this.rotTo - this.rotFrom) * e,
      tilt: this.tiltFrom + (this.tiltTo - this.tiltFrom) * e
    };
  }

  /**
   * Re-aim the globe at the current selection. Longitude takes the shortest
   * way around so stepping past the seam turns the short direction rather
   * than unwinding the whole sphere.
   */
  _retarget() {
    const now = performance.now();
    const { rot, tilt } = this.orientation(now);
    const { lat, lon } = this.cellAngles(this.row, this.col);

    let delta = lon - rot;
    const twoPi = Math.PI * 2;
    delta = ((delta % twoPi) + twoPi) % twoPi;
    if (delta > Math.PI) delta -= twoPi;

    this.rotFrom = rot;
    this.rotTo = rot + delta;
    this.tiltFrom = tilt;
    this.tiltTo = lat;
    this.animStart = now;
  }

  // ── PauseSystem modal contract ───────────────────────────────────────────

  handleKey(key, event) {
    if (event?.repeat) return;
    if (performance.now() < this.inputReadyAt) return;

    const intent = menuIntent(event);
    if (intent === 'left' || intent === 'right') {
      const dir = intent === 'left' ? -1 : 1;
      // Walk the ring until a populated cell turns up — the last band is
      // ragged whenever the touched count doesn't divide evenly.
      for (let step = 1; step <= this.perBand; step++) {
        const col = (this.col + dir * step + this.perBand * 2) % this.perBand;
        if (this.indexAt(this.row, col) !== -1) { this.col = col; break; }
      }
      this._retarget();
    } else if (intent === 'up' || intent === 'down') {
      const dir = intent === 'up' ? -1 : 1;
      const row = this.row + dir;
      if (row >= 0 && row < this.bands && this.indexAt(row, this.col) !== -1) {
        this.row = row;
        this._retarget();
      }
    } else if (intent === 'confirm') {
      this._confirm();
    }
  }

  render(renderer, game) {
    this.overlay.render(renderer, game, this);
  }

  onClose() {
    this.slot = null;
  }

  /** Place the selected glyph. One-shot — ThreeRoomSystem judges it from here. */
  _confirm() {
    const idx = this.indexAt(this.row, this.col);
    if (idx === -1) return;
    const char = this.symbols[idx];
    const slot = this.slot;

    this.game.pauseSystem.closeModal();
    this.game.threeRoomSystem.placeOffering(this.game, slot, char, ITEMS[char] || null);
  }
}
