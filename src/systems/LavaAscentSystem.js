/**
 * LavaAscentSystem — drives the red-zone Ascent (A room) flood cycle.
 *
 * `RoomGenerator.generateAscentRoom()` seeds `room.ascentLava` only when
 * `room.zone === 'red'`: the floor outside the plateau starts as mud and the
 * slope ring still pushes outward as normal. This system floods the outer
 * floor to lava — spreading outward from a handful of seed tiles
 * (`ascentLava.floorFillOrder`, built in `roomFeatures.js`) rather than
 * converting at random, so the flood reads as directional and gives the
 * player something to route around — then floods the slope ring one whole
 * radius ring at a time (`ascentLava.slopeFillGroups`, outermost ring first,
 * since that's where the floor lava reaches the slope belt), leaving only
 * the central plateau safe. Draining walks both orderings backwards:
 * innermost ring first (filled last, drains first), then the floor drains
 * back toward its seed tiles last. Exits unlock the instant the drain
 * begins (`drainingSlopes`) rather than waiting for the full recede — the
 * flood is the hazard, not the residual puddle. `main.js`'s generic
 * enemy-clear unlock is gated off during the two filling phases only
 * (`ascentLavaActive`), so a room cleared of enemies mid-flood doesn't open
 * early.
 */

import { PhasedHazardSystem } from './PhasedHazardSystem.js';
import { BACKGROUND_OBJECT_VARIANTS } from '../game/GameConfig.js';

const PHASE_DURATIONS = {
  fillingFloor: 10,
  fillingSlopes: 10,
  drainingSlopes: 10,
  drainingFloor: 10
};

const PHASE_ORDER = ['fillingFloor', 'fillingSlopes', 'drainingSlopes', 'drainingFloor', 'complete'];
const FILL_PHASES = ['fillingFloor', 'fillingSlopes'];

export class LavaAscentSystem extends PhasedHazardSystem {
  _getData(room) { return room?.ascentLava; }
  isActive(room) { return !!room?.ascentLava; }
  _getPhaseOrder() { return PHASE_ORDER; }
  _getDuration(phase) { return PHASE_DURATIONS[phase] ?? 1; }
  _getFillPhases() { return FILL_PHASES; }

  onPhaseStart(phase, room) {
    const lava = room.ascentLava;
    if (!lava) return;

    if (phase === 'fillingSlopes') lava._slopeConverted = 0;
    if (phase === 'drainingSlopes') {
      lava._slopeConverted = 0;
      // The flood is the hazard, not the residual puddle — let the player
      // out as soon as recession starts rather than waiting for full drain.
      room.exitsLocked = false;
      this.game.updateExitCollisions?.();
    }
    if (phase === 'drainingFloor') lava._floorConverted = 0;
  }

  onTick(phase, eased, dt, room) {
    const lava = room.ascentLava;
    if (!lava) return;

    if (phase === 'fillingFloor') {
      this._advanceFloor(lava, eased, true);
    } else if (phase === 'fillingSlopes') {
      this._advanceSlopeRings(lava, eased, true);
    } else if (phase === 'drainingSlopes') {
      this._advanceSlopeRings(lava, eased, false);
    } else if (phase === 'drainingFloor') {
      this._advanceFloor(lava, eased, false);
    }
  }

  // Floor tiles convert in `floorFillOrder` (ascending distance from the
  // flood's seed tiles) so lava visibly spreads from a handful of sources.
  // Draining walks the same order backwards — farthest-from-source drains
  // first, receding back toward the seeds last.
  _advanceFloor(lava, eased, toLava) {
    const tiles = lava.floorFillOrder;
    if (!tiles.length) return;
    const targetCount = Math.floor(eased * tiles.length);
    const converted = lava._floorConverted || 0;
    const reverse = !toLava;
    for (let i = converted; i < targetCount; i++) {
      const idx = reverse ? tiles.length - 1 - i : i;
      this._convertTile(tiles[idx], toLava, false);
    }
    lava._floorConverted = targetCount;
  }

  // Slope tiles are pre-grouped into whole radius rings (outermost first).
  // Each ring converts as a unit so "all r=8 tiles turn to lava at once" —
  // no ring is ever half-flooded. Draining walks the ring list backwards
  // (innermost ring — filled last — drains first).
  _advanceSlopeRings(lava, eased, toLava) {
    const groups = lava.slopeFillGroups;
    if (!groups.length) return;
    const targetCount = Math.floor(eased * groups.length);
    const converted = lava._slopeConverted || 0;
    const reverse = !toLava;
    for (let i = converted; i < targetCount; i++) {
      const idx = reverse ? groups.length - 1 - i : i;
      for (const obj of groups[idx]) this._convertTile(obj, toLava, true);
    }
    lava._slopeConverted = targetCount;
  }

  _convertTile(obj, toLava, isSlope) {
    const variant = toLava ? BACKGROUND_OBJECT_VARIANTS.lava : BACKGROUND_OBJECT_VARIANTS.mud_dry;
    obj.typeId = toLava ? 'lava' : 'mud_dry';
    obj._variantData = { ...variant };
    obj.damaging = toLava;
    obj.color = variant.color;
    obj.animationColor = variant.color;

    if (isSlope) {
      // Lava tiles are pure hazard — the ramp stops pushing once flooded,
      // and regains its push force once the lava recedes. PhysicsSystem's
      // lava/mud detection keys off `char === '~'`, so the slope's
      // directional glyph (ʌ v < >) must swap to '~' and back.
      obj.slope = !toLava;
      obj.char = toLava ? '~' : obj.originalSlopeChar;
      if (!toLava) obj.slopeDirection = obj.originalSlopeDirection;
    }
  }
}
