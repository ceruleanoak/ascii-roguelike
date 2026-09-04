/**
 * IceAscentSystem — drives the cyan-zone Ascent (A room) ice cycle.
 *
 * `RoomGenerator.generateAscentRoom()` seeds `room.ascentIce` when
 * `room.zone === 'cyan'`: the floor ring outside the plateau is frozen water
 * (low elevation ice), and slope tiles are icy (momentum-based sliding,
 * no constant acceleration).
 *
 * Phases (one pass, then done): stable → cracking → broken → refreezing →
 * complete. The cycle does not repeat — `PhasedHazardSystem.update` stops
 * ticking once `phase === 'complete'`, so the room settles back to solid ice
 * and stays there.
 *   - stable: frozen floor, slopes push with momentum (friction = 0.15×)
 *   - cracking: tiles accumulate weight from overlapping entities; the
 *     heaviest-loaded tiles craze first (visual only — they stay walkable)
 *   - broken: the whole floor ring thaws to open water (drops to plane 1) and
 *     exits unlock; the open water is the hazard, so this is not a fill phase
 *   - refreezing: water reverts to frozen (wave from outside in). Exits are
 *     NOT re-locked — matching LavaAscentSystem, the hazard hands the exits
 *     back to the normal enemy-clear gate and never takes them again.
 *
 * Frozen Maw shadow: a large glyph under the ice that appears briefly on
 * room entry, then drifts downward and fades. Purely visual, no collision.
 */

import { PhasedHazardSystem } from './PhasedHazardSystem.js';
import { GRID } from '../game/GameConfig.js';

const PHASE_DURATIONS = {
  stable: 12,     // how long the ice holds before cracks begin
  cracking: 8,    // weight threshold builds, then tiles break
  broken: 6,      // open water hazard
  refreezing: 8   // wave of ice returns
};

const PHASE_ORDER = ['stable', 'cracking', 'broken', 'refreezing', 'complete'];
// Only 'cracking' — NOT 'broken'. `_getFillPhases()` names the phases where
// exits stay locked (PhasedHazardSystem's own contract), and `broken` is the
// phase that explicitly unlocks them below. Listing it here made
// `isHazardActive()` true across the whole open-water window, which
// short-circuits `ExitSystem.updateRoomClearState` — so a room cleared during
// those seconds never ran its clear bookkeeping (captive spawn, secret events,
// pre-boss gate) and the hazard's unlock stuck even with enemies still alive.
// LavaAscentSystem already draws the line this way: fill phases end exactly
// where the unlock begins.
const FILL_PHASES = ['cracking'];

// Frozen Maw shadow — visual only
const MAW_GLYPH = 'M';
const MAW_COLOR = '#4488aa';
const MAW_SIZE = 2.5;        // glyph scale multiplier
const MAW_ALPHA = 0.3;
const MAW_FADE_DURATION = 3; // seconds to drift down and vanish

export class IceAscentSystem extends PhasedHazardSystem {
  _getData(room) { return room?.ascentIce; }
  isActive(room) { return !!room?.ascentIce; }
  _getPhaseOrder() { return PHASE_ORDER; }
  _getDuration(phase) { return PHASE_DURATIONS[phase] ?? 1; }
  _getFillPhases() { return FILL_PHASES; }

  onPhaseStart(phase, room) {
    const ice = room.ascentIce;
    if (!ice) return;

    if (phase === 'cracking') {
      ice._crackProgress = 0;
      ice._crackedTiles = new Set();
    }
    if (phase === 'broken') {
      // Thaw all floor tiles to open water
      for (const tile of ice.floorTiles) {
        if (tile.destroyed) continue;
        tile.setWaterState('normal', 0);
        tile.damaging = false;
      }
      // Unlock exits — the open water is the hazard, not the recede
      room.exitsLocked = false;
      this.game.updateExitCollisions?.();
    }
    if (phase === 'refreezing') {
      ice._refreezeProgress = 0;
    }
  }

  onTick(phase, eased, dt, room) {
    const ice = room.ascentIce;
    if (!ice) return;

    if (phase === 'stable') {
      // During stable, track entity weight on tiles for the cracking queue
      this._trackWeight(ice, room);
      // Fade the Maw shadow downward
      this._updateMawShadow(ice, dt);
    } else if (phase === 'cracking') {
      this._advanceCracking(ice, eased, room);
      this._updateMawShadow(ice, dt);
    } else if (phase === 'refreezing') {
      this._advanceRefreeze(ice, eased);
    }
  }

  _trackWeight(ice, room) {
    const game = this.game;
    const player = game.player;
    if (!player) return;

    // Check player position against floor tiles
    for (const tile of ice.floorTiles) {
      if (tile.destroyed) continue;
      const dx = player.position.x - tile.position.x;
      const dy = player.position.y - tile.position.y;
      if (Math.abs(dx) < GRID.CELL_SIZE && Math.abs(dy) < GRID.CELL_SIZE) {
        tile._weight = (tile._weight || 0) + 1;
      }
    }
  }

  _advanceCracking(ice, eased, room) {
    const tiles = ice.floorTiles;
    if (!tiles.length) return;

    // Cracking is weight-driven: tiles with accumulated weight crack first
    // Sort by weight descending (heaviest = cracks first)
    const crackable = tiles.filter(t => !t.destroyed && t.waterState === 'frozen');
    crackable.sort((a, b) => (b._weight || 0) - (a._weight || 0));

    const targetCount = Math.floor(eased * crackable.length);
    for (let i = 0; i < targetCount && i < crackable.length; i++) {
      const tile = crackable[i];
      if (tile._cracked) continue;
      tile._cracked = true;
      // Visual crack: change char to indicate damage
      tile.animationColor = '#aaddff';
      // Slight transparency to hint at the water below
      tile.alpha = 0.6;
    }
  }

  _advanceRefreeze(ice, eased) {
    const tiles = ice.floorTiles;
    if (!tiles.length) return;

    // Refreeze from outside in (tiles farther from center refreeze first)
    const centerCol = ice.plateau.centerCol;
    const centerRow = ice.plateau.centerRow;
    const sorted = [...tiles].sort((a, b) => {
      const da = Math.hypot(a._ascentCol - centerCol, a._ascentRow - centerRow);
      const db = Math.hypot(b._ascentCol - centerCol, b._ascentRow - centerRow);
      return db - da; // farthest first
    });

    const targetCount = Math.floor(eased * sorted.length);
    for (let i = 0; i < targetCount; i++) {
      const tile = sorted[i];
      if (tile.waterState === 'frozen') continue;
      // Infinity — a 0-second freeze thaws on the next BackgroundObject.update
      // tick, which would make the whole refreeze phase a no-op (see the same
      // note on the seed in roomFeatures.seedFrozenAscentCycle).
      tile.setWaterState('frozen', Infinity);
      tile._cracked = false;
      tile._weight = 0;
      tile.alpha = 1;
    }
  }

  _updateMawShadow(ice, dt) {
    if (!ice.mawShadow) return;
    const maw = ice.mawShadow;
    maw.timer += dt;
    if (maw.timer >= MAW_FADE_DURATION) {
      maw.alpha = 0;
      return;
    }
    const t = maw.timer / MAW_FADE_DURATION;
    maw.alpha = MAW_ALPHA * (1 - t);
    maw.yOffset = t * GRID.CELL_SIZE * 3; // drift downward
  }
}
