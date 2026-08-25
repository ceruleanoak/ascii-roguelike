import { GRID } from '../game/GameConfig.js';
import { getExitSlotPosition, mutateExitLetter } from './ExitSystem.js';

// Compass (⌖) — dungeon behavior lives in DungeonPuzzleSystem.updateCompassBeep;
// this system owns the two Explore-mode behaviors (Legend of Three green-zone
// "Truth" item, see claudedocs/legend-of-three.md):
//
// 1. Secret-reveal beep — one-shot SFX the instant a room's hidden find
//    actually becomes real. SecretEventSystem.applySecretEvents only ever
//    runs at the room-clear checkpoint (ExitSystem.updateRoomClearState), so
//    "on entry" isn't accurate — onSecretRevealed is called right alongside
//    that hook and fires only for the three findable-by-searching events.
//    fairy_grass is excluded — the fairy already has its own discovery path.
//
// 2. Dungeon-finding arrow — marks one of the room's three lettered exits
//    (which one is arbitrary) on every Explore room entry. Taking the marked
//    exit 3 *consecutive* times force-generates a guaranteed 'D' (Dungeon)
//    exit into the room reached on the 3rd follow, via the same
//    mutateExitLetter surface the Sword of the Letter and Fairy dust use —
//    a real generation-time contract, not a passive reveal of an outcome the
//    'D' letter weight might produce on its own. Any deviation from the
//    marked exit resets the streak to 0.
//
// markedDirection is public/read-only from the outside — CompassIndicator
// (the bottom-right HUD widget) reads it each frame to aim its needle.
const SECRET_BEEP_EVENTS = new Set(['key_glitter', 'leshy_chase', 'chi_grass']);
const STREAK_TO_FORCE_DUNGEON = 3;
const MARKABLE_DIRECTIONS = ['north', 'east', 'west']; // south returns to REST — never a target

export class CompassSystem {
  constructor(game) {
    this.game = game;
    this.markedDirection = null;
    this._streak = 0;
    this._pendingForceD = false;
  }

  _isHolding() {
    return (this.game.player?.quickSlots || []).some(it => it?.char === '⌖');
  }

  // Called once per Explore room generation (enterExploreState), after the
  // room object exists and its exits are populated. Picks (or re-picks) the
  // marked exit for this room and, if a guaranteed-D contract is pending
  // from the previous room's 3rd consecutive follow, consumes it here.
  onRoomEntered(room) {
    if (!this._isHolding()) { this.markedDirection = null; return; }

    // secretBlueZone exits are a fixed tutorial chain (main.js's blue-zone
    // override) — never a candidate to mark or force-mutate.
    const candidates = MARKABLE_DIRECTIONS.filter(dir =>
      room?.exits?.[dir]?.letter && !room.exits[dir].secretBlueZone
    );
    if (candidates.length === 0) { this.markedDirection = null; return; }

    const dir = candidates[Math.floor(Math.random() * candidates.length)];
    if (this._pendingForceD) {
      mutateExitLetter(room.exits[dir], 'D', { source: 'compass' });
      this._pendingForceD = false;
    }
    this.markedDirection = dir;
  }

  // Called at the moment the player commits to a direction (north/east/west
  // exit branches in main.js), before the destination room is generated.
  onExitTaken(direction) {
    if (!this._isHolding()) { this._streak = 0; return; }

    if (this.markedDirection && direction === this.markedDirection) {
      this._streak++;
      if (this._streak >= STREAK_TO_FORCE_DUNGEON) {
        this._pendingForceD = true;
        this._streak = 0;
      }
    } else {
      this._streak = 0;
    }
  }

  // Called from ExitSystem right after SecretEventSystem.applySecretEvents —
  // the moment a room's single secret event (if any) actually gets marked.
  onSecretRevealed(room) {
    if (!SECRET_BEEP_EVENTS.has(room?.activeSecretEvent)) return;
    if (!this._isHolding()) return;
    this.game.audioSystem?.playSFX?.('compass_beep');
  }

  // World-pixel position of the currently marked exit's slot, for the HUD
  // needle to aim at. Null when nothing is marked (not holding, dead-end
  // room, etc.) — CompassIndicator skips drawing in that case.
  getMarkedTargetPosition() {
    if (!this.markedDirection) return null;
    const slot = getExitSlotPosition(this.markedDirection);
    if (!slot) return null;
    return {
      x: slot.col * GRID.CELL_SIZE + GRID.CELL_SIZE / 2,
      y: slot.row * GRID.CELL_SIZE + GRID.CELL_SIZE / 2
    };
  }
}
