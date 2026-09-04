/**
 * PhasedHazardSystem — reusable base for zone-specific Ascent (A-room) hazards.
 *
 * Drives a state machine of named phases, each with a fixed duration and
 * an ease-in conversion schedule. Subclasses override:
 *   - `PHASE_ORDER` / `PHASE_DURATIONS` — the phase list and timing
 *   - `onPhaseStart(phase, room)` — lock/unlock exits, re-init counters
 *   - `onTick(phase, eased, dt, room)` — per-frame conversion logic
 *   - `isActive(room)` — whether this system's data is present on the room
 *
 * The base class handles the timer, phase transitions, and ease-in math.
 * Exit locking/unlocking is gated on `room.exitsLocked` and exposed to
 * the caller (main.js) via `isHazardActive(room)` for the generic
 * enemy-clear unlock guard.
 */

export class PhasedHazardSystem {
  constructor(game) {
    this.game = game;
  }

  /** Subclasses return the room's phase-data object (e.g. `room.ascentIce`). */
  _getData(room) { return null; }

  /** Subclasses override to return true when this system should tick. */
  isActive(room) { return false; }

  update(dt) {
    const room = this.game.currentRoom;
    if (!room || !this.isActive(room)) return;
    const data = this._getData(room);
    if (!data || data.phase === 'complete') return;

    data.timer += dt;
    const duration = this._getDuration(data.phase);
    const fraction = Math.min(1, data.timer / duration);
    const eased = fraction * fraction; // ease-in

    this.onTick(data.phase, eased, dt, room);

    if (fraction >= 1) {
      data.timer = 0;
      const order = this._getPhaseOrder();
      const idx = order.indexOf(data.phase);
      const nextPhase = order[idx + 1];
      data.phase = nextPhase;
      if (nextPhase) this.onPhaseStart(nextPhase, room);
    }
  }

  /** True while the hazard is actively filling (exit-lock during fill). */
  isHazardActive(room) {
    const data = this._getData(room);
    if (!data) return false;
    return this._getFillPhases().includes(data.phase);
  }

  /** Override: return the fill-phase names where exits should be locked. */
  _getFillPhases() { return []; }

  /** Override: return the ordered phase list. */
  _getPhaseOrder() { return []; }

  /** Override: return the duration (seconds) for a given phase. */
  _getDuration(phase) { return 1; }

  /** Override: called each frame with the current phase, eased progress, dt, and room. */
  onTick(phase, eased, dt, room) {}

  /** Override: called when a phase completes and the next begins. */
  onPhaseStart(phase, room) {}
}
