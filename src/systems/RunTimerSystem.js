/**
 * RunTimerSystem — elapsed real time in the current run.
 *
 * The clock is a `performance.now()` delta, NOT accumulated deltaTime. That is
 * the whole point: it keeps advancing through everything that freezes the
 * update loop — the Tab overlay it's drawn in, modal pauses (PauseSystem),
 * the cheat menu, crafting/equipment menus. Opening a menu is not a timeout.
 *
 * Run-scoped, like the game's other run state (runId, wishesUsed, key items):
 * the clock starts on the first REST entry of a run and death restarts it from
 * zero via `_resetRunToRest`. TITLE clears it — no run is in progress there,
 * and the arcade demo (which routes through EXPLORE, never REST) never starts
 * one.
 *
 * Sole consumer: InventoryOverlay draws `format()` in the box's top-right.
 */
export class RunTimerSystem {
  constructor() {
    this.startedAt = null; // performance.now() at run start; null = no run in progress
  }

  // Start a fresh clock. Call only when a run genuinely (re)starts — re-entry
  // guarding is beginIfIdle's job.
  begin() {
    this.startedAt = performance.now();
  }

  // REST is entered many times per run (every return from EXPLORE), so the
  // start hook must not restart the clock on re-entry.
  beginIfIdle() {
    if (this.startedAt === null) this.begin();
  }

  clear() {
    this.startedAt = null;
  }

  getElapsedMs() {
    return this.startedAt === null ? 0 : performance.now() - this.startedAt;
  }

  // M:SS, widening to H:MM:SS only past the hour — a run that never gets there
  // shouldn't pay for leading zeros it doesn't need.
  format() {
    const totalSeconds = Math.floor(this.getElapsedMs() / 1000);
    const seconds = String(totalSeconds % 60).padStart(2, '0');
    const minutes = Math.floor(totalSeconds / 60) % 60;
    const hours = Math.floor(totalSeconds / 3600);
    if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${seconds}`;
    return `${minutes}:${seconds}`;
  }
}
