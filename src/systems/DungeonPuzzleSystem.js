import { GRID } from '../game/GameConfig.js';
import { Particle } from '../entities/Particle.js';
import { Ingredient } from '../entities/Ingredient.js';
import { ITEMS } from '../data/items.js';
import { paintDescentVisual, paintStairsUpVisual } from '../data/dungeonFloorTemplates.js';
import { TORCH_INTERACT_RADIUS } from './MazeSystem.js';

// Proximity radius for door/switch/slot interaction (px from cell center) —
// mirrors DungeonSystem's DOOR_INTERACT_RADIUS.
const INTERACT_RADIUS = GRID.CELL_SIZE * 2;

const SFX_BEEP_INTERVAL = 2.0; // Compass ping throttle, seconds

/**
 * DungeonPuzzleSystem — gating and puzzle logic for the 6-floor dungeon
 * rework (plan Phase 2/3). DungeonSystem owns lifecycle (enter/exit/ascend/
 * descend); this file owns what makes a floor's footprints/slots change
 * state — key consumption, companion-switch puzzles, the enemies-clear
 * gate, and the Legend of Three pyramid's offer/fill/solve flow.
 *
 * Called from DungeonSystem.update()/handleSpacePress() every tick the
 * player is inside a dungeon interior; every method no-ops harmlessly on
 * floors it doesn't apply to.
 */
export class DungeonPuzzleSystem {
  constructor(game) {
    this.game = game;
    this._compassBeepTimer = 0;
  }

  // ─── Per-tick update ──────────────────────────────────────────────────────

  update(floor, dt) {
    if (!floor) return;
    this.updateCompassBeep(floor, dt);

    if (floor.roomKind === 'trapRoom') {
      this._updateTrapRoom(floor);
    } else if (floor.roomKind === 'numbered' && floor.floorIndex === 2) {
      this._updateBranchSwitches(floor);
    } else if (floor.roomKind === 'puzzleRoom') {
      this._updatePuzzleRoom(floor, dt);
    }
  }

  // Compass (⌖) — dungeon-only "beeps when treasure is in the room" behavior.
  // The full Explore-mode directional/room-letter mechanic is separate,
  // out-of-scope work (see docs/adr/BACKLOG.md).
  updateCompassBeep(floor, dt) {
    const { game } = this;
    const holding = (game.player?.quickSlots || []).some(it => it?.char === '⌖');
    if (!holding) { this._compassBeepTimer = 0; return; }

    const hasTreasure = (floor.items?.length > 0) || (floor.ingredients?.length > 0);
    if (!hasTreasure) { this._compassBeepTimer = 0; return; }

    this._compassBeepTimer += dt;
    if (this._compassBeepTimer >= SFX_BEEP_INTERVAL) {
      this._compassBeepTimer = 0;
      game.audioSystem?.playSFX?.('compass_beep');
    }
  }

  // Trap Room — sealed enemy gauntlet off Branch's North descent. Exit
  // unlocks once every spawned enemy is cleared; see
  // DungeonFloorGenerator.generateTrapRoom.
  _updateTrapRoom(room) {
    if (!room.stairsUpLocked) return;
    if (room.enemies.length > 0) return;
    room.stairsUpLocked = false;
    paintStairsUpVisual(room.stairsUpObj, false);
    this._spawnUnlockEffect(room.stairsUpObj);
  }

  // Branch's companion-switch puzzle — lives directly on Branch's own floor
  // (bug #209: previously relocated into a side room off Branch's East
  // descent, gated on companion status, which hid the puzzle's very
  // existence from a solo player; git-archaeology into the pre-rework
  // 5-floor system showed Floor 2's switches were always rendered in the
  // room regardless of companion status — only solving them needed one).
  // Solving unlocks Branch's East descent (to the Pyramid) instead of a
  // floor-level stairsLocked flag.
  _updateBranchSwitches(floor) {
    const { game } = this;
    const player = game.player;
    const companion = game.companion;
    const a = floor.switchAObj;
    const b = floor.switchBObj;
    if (!a || !b) return;

    const aPx = a.position.x, aPy = a.position.y;
    const bPx = b.position.x, bPy = b.position.y;

    const playerOnA = this._overlapsCell(player, aPx, aPy);
    const playerOnB = this._overlapsCell(player, bPx, bPy);
    const compOnA = companion ? this._overlapsCell(companion, aPx, aPy) : false;
    const compOnB = companion ? this._overlapsCell(companion, bPx, bPy) : false;

    const aPressed = playerOnA || compOnA;
    const bPressed = playerOnB || compOnB;

    // Visual state — stay "pressed" once puzzle is solved
    this._setSwitchVisual(a, aPressed || floor.puzzleSolved);
    this._setSwitchVisual(b, bPressed || floor.puzzleSolved);

    // First simultaneous press → permanent unlock
    if (!floor.puzzleSolved && aPressed && bPressed) {
      floor.puzzleSolved = true;
      const onward = floor.descents.find(d => d.id === 'east');
      if (onward) {
        onward.locked = false;
        paintDescentVisual(onward.obj, { active: onward.active, locked: false });
        this._spawnUnlockEffect(onward.obj);
      }
      if (companion) companion.commandTarget = null;
      return;
    }

    // Dispatch companion to the unoccupied switch while player stands on one.
    // Sticky once committed: the companion's crossing is a straight-line walk
    // with no pathfinding, so it takes real time (the two switches are 10
    // cols apart) — requiring the player to keep standing on their switch for
    // the whole crossing made the puzzle unsolvable by anyone who moved
    // afterward (very plausible: watching the companion walk, repositioning).
    // Previously, the player stepping off before the companion arrived hit
    // the `else` branch below, nulled commandTarget mid-walk, and permanently
    // stranded the companion partway across the room — the puzzle could
    // never solve for the rest of the run (bug #205). Re-deriving the target
    // only while the companion isn't yet holding either switch (not on every
    // tick) lets it keep walking — and then hold — once dispatched.
    if (!floor.puzzleSolved && companion) {
      if (!compOnA && !compOnB) {
        if (playerOnA) {
          companion.commandTarget = { x: bPx, y: bPy };
        } else if (playerOnB) {
          companion.commandTarget = { x: aPx, y: aPy };
        }
        // else: no assignment yet — leave commandTarget as-is (null before
        // the first dispatch), companion just follows the player normally.
      }
      // else: companion is already holding a switch — leave commandTarget
      // alone so it stays put regardless of where the player wanders.
    } else if (companion) {
      companion.commandTarget = null;
    }
  }

  // Puzzle Room — generic template-driven puzzle side room (see
  // DungeonFloorGenerator.generatePuzzleRoom). Every trigger in room.triggers
  // (a 'switch', strike-triggered via the puzzleSignal/glitterHit contract;
  // a 'panel', occupancy-triggered like Branch's own switches; or a 'torch',
  // ignited by the same proximity + held-Torch-item contract as a decorative
  // PuzzleTorch below) runs through the shared _advanceTrigger state
  // machine; the exit unlocks once every trigger is active at once — the
  // generalized form of both Branch's own "all at once" solve rule and the
  // original Whip Trial's "both switches struck together" rule (now itself
  // just an editor-authored template, whip_trial.json), extended to any
  // trigger count/mix. Hook posts and the DECORATIVE torches below
  // (room.torches, not room.triggers) are independent of the trigger/solve
  // state — they keep working before, during, and after the room is solved
  // (a hook post is a traversal aid, not a one-time gate; a decorative torch
  // is pure ambience) — so both run before the solved early-return. A
  // torch-KIND trigger is the opposite of that decorative torch: it's a real
  // gate, so it's handled in the triggers loop below like switch/panel, not
  // up here.
  _updatePuzzleRoom(room, dt) {
    const { game } = this;
    const player = game.player;
    const companion = game.companion;

    // Hook posts — same pull contract as the original Whip Trial's posts:
    // each strike pulls the player to that post's own position (see
    // PhysicsSystem.updateEntity's hookedByWhip handling for the actual
    // traversal).
    for (const post of room.hookPosts) {
      if (post.glitterHit) {
        post.glitterHit = false;
        if (!player.hookedByWhip) {
          player.hookedByWhip = { targetX: post.position.x, targetY: post.position.y };
        }
      }
    }

    // Torches — maze-parity ignite: unlit until the player approaches while
    // wielding the Torch item, permanent once lit (see PuzzleTorch in
    // DungeonFloorGenerator.js / MazeSystem's own MazeTorch for the fuller
    // maze mechanic this mirrors).
    for (const torch of room.torches) {
      torch.pulseTimer += dt;
      if (torch.lit) continue;
      if (player.heldItem?.data?.name !== 'Torch') continue;
      if (this._within(player.position, torch.position, TORCH_INTERACT_RADIUS)) {
        torch.lit = true;
      }
    }

    if (room.puzzleSolved) return;

    for (const trigger of room.triggers) {
      let isTriggeredNow;
      if (trigger.kind === 'switch') {
        isTriggeredNow = !!trigger.glitterHit;
        trigger.glitterHit = false;
      } else if (trigger.kind === 'panel') { // occupancy, same contract as Branch's own switches
        const px = trigger.position.x, py = trigger.position.y;
        isTriggeredNow = this._overlapsCell(player, px, py)
          || (companion ? this._overlapsCell(companion, px, py) : false);
      } else { // 'torch' — ignite via proximity + held Torch item, same contract
               // as a decorative PuzzleTorch; authored activation is always
               // 'permanent' (validated at save time) since a lit torch never
               // reverts, so once true this stays true regardless of dt below.
        trigger.pulseTimer += dt;
        isTriggeredNow = !trigger.active
          && player.heldItem?.data?.name === 'Torch'
          && this._within(player.position, trigger.position, TORCH_INTERACT_RADIUS);
      }
      const wasActive = trigger.active;
      this._advanceTrigger(trigger, dt, isTriggeredNow);
      // Torch-kind triggers render themselves every frame from `.active`
      // directly (HutInteriorOverlay's shared torch-fixture draw, same as a
      // decorative torch) rather than mutating char/color fields on a
      // BackgroundObject, so _setTriggerVisual — which only knows the
      // switch ○/● and panel ▭/▬ glyph pairs — doesn't apply here.
      if (trigger.active !== wasActive && trigger.kind !== 'torch') {
        this._setTriggerVisual(trigger, trigger.active);
      }
    }

    if (room.triggers.length && room.triggers.every(t => t.active)) {
      room.puzzleSolved = true;
      room.stairsUpLocked = false;
      paintStairsUpVisual(room.stairsUpObj, false);
      this._spawnUnlockEffect(room.stairsUpObj);
    }
  }

  // Generic per-trigger activation state machine — shared by every dungeon
  // puzzle room's switches/panels (Whip Trial's two switches, and any
  // editor-authored Puzzle Room trigger). `trigger` carries `activation`
  // ('permanent' | 'timed'), `neutralizeSeconds` (timed only), and mutable
  // `active`/`_timer` fields. `isTriggeredNow` is the caller's per-kind read
  // of "is this trigger being hit/occupied THIS tick" — a one-tick pulse for
  // a struck switch, a sustained level for an occupied floor panel.
  _advanceTrigger(trigger, dt, isTriggeredNow) {
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

  // Visual for a generic trigger — switches reuse Branch/Whip
  // Trial's ○/● pair (one consistent "this is a switch" glyph language
  // across every dungeon puzzle room); panels use their own ▭/▬ pair so the
  // two trigger kinds always read as visually distinct fixtures.
  _setTriggerVisual(trigger, active) {
    const isSwitch = trigger.kind === 'switch';
    const char = isSwitch ? (active ? '●' : '○') : (active ? '▬' : '▭');
    const color = active ? '#ffcc44' : '#888888';
    trigger.char = char;
    trigger.color = color;
    trigger.animationChar = char;
    trigger.animationColor = color;
  }

  _setSwitchVisual(sw, pressed) {
    const char = pressed ? '●' : '○';
    const color = pressed ? '#ffcc44' : '#888888';
    sw.isPressed = pressed;
    sw.char = char;
    sw.color = color;
    sw.animationChar = char;
    sw.animationColor = color;
  }

  // ─── SPACE-press puzzle actions ───────────────────────────────────────────
  // DungeonSystem.handleSpacePress() delegates here after ruling out normal
  // enter/exit/ascend/descend transitions. Returns true if handled.

  handleSpacePress() {
    const { game } = this;
    const floor = game.activeFloor;
    if (!floor) return false;

    if (floor.roomKind === 'numbered' && floor.floorIndex === 1) {
      if (this._tryUnlockCorridorGate(floor)) return true;
    }
    if (floor.roomKind === 'numbered' && floor.floorIndex === 3) {
      if (this._tryDepositPyramid(floor)) return true;
    }
    return false;
  }

  // Corridor floor's West descent — SPACE while locked, key in hand,
  // standing on the footprint: consumes the key and unlocks the path down
  // to Branch. A subsequent SPACE (now unlocked) is a normal descend,
  // handled by DungeonSystem.
  _tryUnlockCorridorGate(floor) {
    const { game } = this;
    const west = floor.descents.find(d => d.id === 'west');
    if (!west || !west.locked) return false;
    if (!game.inventorySystem.hasKeyItem('⚿', game)) return false;
    if (!this._overlapsCell(game.player, west.obj.position.x, west.obj.position.y)) return false;

    game.inventorySystem.consumeKeyItem('⚿');
    game.dungeonKeyUsedThisRun = true;
    west.locked = false;
    paintDescentVisual(west.obj, { active: west.active, locked: false });
    this._spawnUnlockEffect(west.obj);
    game.audioSystem?.playSFX?.('dungeon_key_use');
    return true;
  }

  // Pyramid — "walk up + offer" verb (WellSystem/FountainSystem precedent).
  // Justice (Lucky Coin) lives in the consumable slot; Truth (Compass) and
  // Help (Bread) are weapon-slot items — both are checked via quickSlots
  // since Item exposes .char directly. One deposit per SPACE press.
  _tryDepositPyramid(floor) {
    const { game } = this;
    const player = game.player;
    for (const key of Object.keys(floor.pyramidSlots)) {
      const slot = floor.pyramidSlots[key];
      if (slot.filled || !slot.requiredChar) continue;
      if (!this._nearCell(player, slot.obj.position.x, slot.obj.position.y, INTERACT_RADIUS)) continue;

      if (slot.itemType === 'consumable') {
        const slots = game.inventorySystem?.equippedConsumables || [];
        const idx = slots.findIndex(it => it?.char === slot.requiredChar || it?.data?.char === slot.requiredChar);
        if (idx < 0) continue;
        slots[idx] = null;
      } else {
        const qs = player.quickSlots || [];
        const idx = qs.findIndex(it => it?.char === slot.requiredChar);
        if (idx < 0) continue;
        qs[idx] = null;
      }

      this._fillPyramidSlot(floor, slot);
      return true;
    }
    return false;
  }

  _fillPyramidSlot(floor, slot) {
    const { game } = this;
    const color = ITEMS[slot.requiredChar]?.color || '#ffcc00';
    slot.filled = true;
    // The Slot has shown its wanted glyph all along, dimmed in SLOT_CHROME
    // .PENDING (DungeonFloorGenerator._generatePyramid) — satisfying it is
    // purely a repaint into the item's own color. The stone brackets around
    // it don't change; they're masonry, not state.
    slot.obj.color = color;
    slot.obj.animationColor = color;

    const cx = slot.obj.position.x + GRID.CELL_SIZE / 2;
    const cy = slot.obj.position.y + GRID.CELL_SIZE / 2;
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2;
      game.particles.push(new Particle(
        cx, cy, '*', color,
        { vx: Math.cos(angle) * 25, vy: Math.sin(angle) * 25 - 15 },
        0.8
      ));
    }
    game.audioSystem?.playSFX?.('pyramid_fill');
    this._checkPyramidComplete(floor);
  }

  // Only zones with real legendOfThree.js content can solve the pyramid —
  // unauthored zones stay dormant/inert rather than instantly "solving".
  _checkPyramidComplete(floor) {
    const { game } = this;
    if (!floor.legendAuthored || floor.puzzleSolved) return;
    const allFilled = Object.values(floor.pyramidSlots).every(s => s.filled);
    if (!allFilled) return;

    floor.puzzleSolved = true;
    // The offering's real payoff: the Vault descent unlocks (the Artifact ⚜
    // drops alongside it — the trophy the player carries out either way).
    const onward = floor.descents.find(d => d.id === 'north');
    if (onward) {
      onward.locked = false;
      paintDescentVisual(onward.obj, { active: onward.active, locked: false });
      this._spawnUnlockEffect(onward.obj);
    }
    const reward = Object.assign(
      new Ingredient('⚜', 12 * GRID.CELL_SIZE, 18 * GRID.CELL_SIZE),
      { hutPlane: true }
    );
    floor.ingredients.push(reward);
    game.ingredients.push(reward);
    game.physicsSystem.addEntity(reward);
    game.audioSystem?.playSFX?.('pyramid_solve');
  }

  // ─── Shared visual/geometry helpers ───────────────────────────────────────

  _spawnUnlockEffect(obj) {
    const { game } = this;
    if (!obj) return;
    const sx = obj.position.x + GRID.CELL_SIZE / 2;
    const sy = obj.position.y + GRID.CELL_SIZE / 2;
    const chars = ['*', '+', '߃', '*', '+'];
    const colors = ['#ffcc00', '#ffffff', '#ffcc00', '#ffffaa', '#ffcc00'];
    for (let i = 0; i < chars.length; i++) {
      const angle = (i / chars.length) * Math.PI * 2;
      const speed = 30 + Math.random() * 30;
      game.particles.push(new Particle(
        sx + (Math.random() - 0.5) * 6,
        sy + (Math.random() - 0.5) * 6,
        chars[i], colors[i],
        { vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 20 },
        1.0 + Math.random() * 0.5
      ));
    }
  }

  _nearCell(entity, cellPixelX, cellPixelY, radius = INTERACT_RADIUS) {
    const C = GRID.CELL_SIZE;
    const px = entity.position.x + C / 2;
    const py = entity.position.y + C / 2;
    const cx = cellPixelX + C / 2;
    const cy = cellPixelY + C / 2;
    const dx = px - cx, dy = py - cy;
    return Math.sqrt(dx * dx + dy * dy) < radius;
  }

  // Straight-line proximity between two {x,y} positions — used by the torch
  // ignite check (mirrors MazeSystem's own private _within helper; distance
  // here is between two positions directly, not entity-vs-cell like
  // _nearCell above).
  _within(a, b, radius) {
    const dx = a.x - b.x, dy = a.y - b.y;
    return dx * dx + dy * dy <= radius * radius;
  }

  _overlapsCell(entity, cellPixelX, cellPixelY) {
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
}
