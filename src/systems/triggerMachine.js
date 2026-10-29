import { GRID } from '../game/GameConfig.js';
import { readPushRock } from './PushRock.js';
import { readWatcherEye } from './WatcherEye.js';

/**
 * triggerMachine — the generic Switch/Panel/Torch activation state machine,
 * shared by everything that gates passage on "are all of these active at once".
 *
 * Extracted from DungeonPuzzleSystem when BarricadeSystem became a second
 * caller: the machine was dungeon-interior-only, PuzzleSystem had already
 * re-implemented its own glitterHit polling for P-rooms, and a third private
 * copy for surface Barricades would have been the same drift a third time.
 * DungeonPuzzleSystem and BarricadeSystem now both drive triggers through
 * tickTriggers() below; neither owns the rules.
 *
 * A trigger is a plain object (usually a BackgroundObject, but the torch kind
 * is not) carrying:
 *   kind              'switch' | 'panel' | 'torch' | 'push' | 'eye'
 *   activation        'permanent' | 'timed'
 *   neutralizeSeconds  how long a timed trigger holds after release
 *   active, _timer     mutable state, initialized by whoever builds it
 *
 * Nothing here reads or writes room/floor state — callers decide what an
 * all-active reading unlocks.
 */

// Per-kind read of "is this trigger being hit/occupied THIS tick" — a one-tick
// pulse for a struck switch, a sustained level for an occupied floor panel.
//
// 'switch'  strike-triggered, via the puzzleSignal/glitterHit contract in
//           BackgroundObject.takeDamage (HP preserved, glitterHit pulses true).
//           The pulse is consumed here so one strike reads as one activation.
// 'panel'   occupancy — the player or the companion standing on the cell.
// 'torch'   struck by a fire attack (torchIgnition.js). Which attacks are
//           live is combat state only the caller's `world.fireStrikes` can
//           read. Authored activation is always 'permanent' since a lit torch
//           never reverts, so the !trigger.active guard keeps it a one-shot.
// 'push'    a Push Rock leaned on until it slides a cell (PushRock.js). It
//           needs to know what the destination cell holds, which only the
//           caller's `world` can say; always 'permanent'.
// 'eye'     a Watcher Eye (WatcherEye.js) struck by a melee blow while open.
//           It watches the player to decide when it is open; always
//           'permanent'.
export function readTrigger(trigger, dt, player, companion = null, world = null) {
  if (trigger.kind === 'push') return readPushRock(trigger, dt, player, world);
  if (trigger.kind === 'eye') return readWatcherEye(trigger, dt, player);

  if (trigger.kind === 'switch') {
    const hit = !!trigger.glitterHit;
    trigger.glitterHit = false;
    return hit;
  }

  if (trigger.kind === 'panel') {
    const px = trigger.position.x, py = trigger.position.y;
    return overlapsCell(player, px, py)
      || (companion ? overlapsCell(companion, px, py) : false);
  }

  trigger.pulseTimer += dt;
  return !trigger.active && !!world?.fireStrikes?.(trigger);
}

// The activation state machine itself. `isTriggeredNow` is the caller's
// per-kind read from readTrigger above.
export function advanceTrigger(trigger, dt, isTriggeredNow) {
  if (isTriggeredNow) {
    trigger.active = true;
    trigger._timer = 0;
  } else if (trigger.active && trigger.activation === 'timed') {
    trigger._timer += dt;
    if (trigger._timer >= trigger.neutralizeSeconds) {
      trigger.active = false;
    }
  }
  // activation === 'permanent': once active, never reverts.
}

// The one visual for every trigger fixture, everywhere (Barricades, dungeon
// Puzzle Rooms, Branch's companion panels). The rule is universal: an impact
// trigger (switch — struck) is circular, ○/●; a pressure trigger (panel —
// stood on) is quadrilateral, ▭/▬. Every trigger builder sets `kind` and
// calls this rather than choosing glyphs itself, so the two kinds can never
// drift into looking alike.
export function setTriggerVisual(trigger, active) {
  const isSwitch = trigger.kind === 'switch';
  const char = isSwitch ? (active ? '●' : '○') : (active ? '▬' : '▭');
  const color = active ? '#ffcc44' : '#888888';
  trigger.char = char;
  trigger.color = color;
  trigger.animationChar = char;
  trigger.animationColor = color;
}

/**
 * Read, advance and repaint every trigger in a set for one frame. Returns
 * whether they are ALL active right now — the solve condition every caller
 * shares, and the reason "simultaneous" is expressed as a short
 * `neutralizeSeconds` rather than as a mechanic of its own.
 *
 * Torch-kind triggers render themselves every frame from `.active` directly
 * (the shared torch-fixture draw, same as a decorative torch) rather than
 * mutating char/color on a BackgroundObject, so setTriggerVisual — which only
 * knows the switch and panel glyph pairs — is skipped for them. So is the
 * Push Rock: its having moved IS its active state, and it must keep looking
 * like the rocks around it. And the Watcher Eye paints itself, because it has
 * three looks (open, shut, struck) where a switch has two.
 *
 * `world` is passed through to the 'push' read only (see readPushRock).
 */
export function tickTriggers(triggers, dt, player, companion = null, world = null) {
  for (const trigger of triggers) {
    const wasActive = trigger.active;
    advanceTrigger(trigger, dt, readTrigger(trigger, dt, player, companion, world));
    if (trigger.active !== wasActive && trigger.kind !== 'torch' && trigger.kind !== 'push' &&
        trigger.kind !== 'eye') {
      setTriggerVisual(trigger, trigger.active);
    }
  }
  return triggers.length > 0 && triggers.every(t => t.active);
}

// Whether an entity's cell-sized box overlaps the cell at these pixel coords.
export function overlapsCell(entity, cellPixelX, cellPixelY) {
  const px = entity.position.x;
  const py = entity.position.y;
  const pw = GRID.CELL_SIZE;
  const ph = GRID.CELL_SIZE;
  return (
    px < cellPixelX + pw &&
    px + pw > cellPixelX &&
    py < cellPixelY + ph &&
    py + ph > cellPixelY
  );
}
