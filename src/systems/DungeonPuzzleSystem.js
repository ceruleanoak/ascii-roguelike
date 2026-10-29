import { GRID } from '../game/GameConfig.js';
import { Particle } from '../entities/Particle.js';
import { Ingredient } from '../entities/Ingredient.js';
import { ITEMS, ITEM_TYPES } from '../data/items.js';
import { paintDescentVisual, paintStairsUpVisual } from '../data/dungeonFloorTemplates.js';
import { fireStrikesTorch } from './torchIgnition.js';
import { tickTriggers, overlapsCell, setTriggerVisual } from './triggerMachine.js';
import { tagInteriorPlane } from './PlaneSystem.js';
import { Item } from '../entities/Item.js';
import { BOMB_CHAR } from './BombBagSystem.js';
import { SIMPLE_KEY_CHAR } from '../data/items.js';
import { hasStandingVent } from './SpawnVentSystem.js';
import { consumeKeyItem, hasKeyItem, holdsUniversalKey } from './keyItems.js';
import { floorAnchorCells } from '../data/dungeon/footprints.js';
import FOOTPRINT_CONTRACT from '../data/dungeon/footprintContract.json';

// Proximity radius for door/switch/slot interaction (px from cell center) —
// mirrors DungeonSystem's DOOR_INTERACT_RADIUS.
const INTERACT_RADIUS = GRID.CELL_SIZE * 2;
// A Lock Block opens from any of the 8 cells around it — the Progression
// Solver (dungeon/progressionSolver.js LOCK_REACH_CELLS) assumes the same.
const LOCK_BLOCK_REACH = GRID.CELL_SIZE * 1.5;

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
    if (this._floorCleared(floor)) {
      this._updateShutters(floor);
      this.revealEdges(floor, 'clear');
    }

    this._updateFixtures(floor, dt);

    if (floor.kind === 'trapRoom') {
      this._updateTrapRoom(floor);
    } else if (floor.puzzle === 'panels') {
      this._updateBranchPanels(floor);
    } else if (floor.kind === 'puzzleRoom') {
      this._updatePuzzleRoom(floor, dt);
    }
    // Any other templated floor's triggers (a Trap Room's too) open its
    // Trigger Blocks and emit its 'triggers' Reveal.
    if (floor.kind !== 'puzzleRoom') this._updateFloorTriggers(floor, dt);
    this._updateGateRock(floor, dt);
  }

  /**
   * A floor emits a Reveal (GLOSSARY.md): every locked descent on it whose
   * Dungeon Graph edge names that Reveal opens. Returns the descents opened.
   * Solving a puzzle never names which door it unlocks — the visit's graph
   * decides that, so one puzzle can open a different door in another zone.
   */
  revealEdges(floor, reveal, { flash = true } = {}) {
    const opened = floor.descents.filter(d => d.locked && d.reveal === reveal);
    for (const d of opened) {
      d.locked = false;
      paintDescentVisual(d.obj, { active: d.active, locked: false, hidden: d.hidden });
      if (flash) this._spawnUnlockEffect(d.obj);
    }
    // A Hidden Descent appearing is the floor's only answer — no door was
    // ever shown — so it gets the unlock chime as well as the flash.
    if (opened.some(d => d.hidden)) {
      this.game.renderer?.markBackgroundDirty?.();
      this.game.audioSystem?.playSFX?.('dungeon_key_use');
    }
    return opened;
  }

  // Compass (⌖) — dungeon-only beep, narrowed (2026-08-25) to exactly the
  // two dungeon secrets it's meant to flag: the skull key (wherever
  // interiorState.keySkullNode rolled it — a floor before the key's door) and the Branch's
  // companion-panel puzzle. Generic floor loot (Pyramid slots, Puzzle Room
  // triggers, plain chests) no longer beeps. The full Explore-mode mechanic
  // (secret-reveal beep + directional arrow) lives in CompassSystem.js.
  updateCompassBeep(floor, dt) {
    const { game } = this;
    if (!game.compassSystem?.isWorn()) { this._compassBeepTimer = 0; return; }

    // Skull key: pending only while unfound. hasKeyItem alone can't tell
    // "not yet found" apart from "already spent" (both read false once the
    // key is consumed), so interiorState.keyUsed disambiguates.
    const state = game.dungeonSystem.interiorState;
    const skullPending = floor.nodeId === state?.keySkullNode
      && !state.keyUsed
      && !hasKeyItem(game.inventorySystem, '⚿', game);
    const branchPending = floor.puzzle === 'panels' && !floor.puzzleSolved;

    if (!skullPending && !branchPending) { this._compassBeepTimer = 0; return; }

    this._compassBeepTimer += dt;
    if (this._compassBeepTimer >= SFX_BEEP_INTERVAL) {
      this._compassBeepTimer = 0;
      game.compassSystem.announceFind();
    }
  }

  // Trap Room — sealed enemy gauntlet off Branch's North descent. Exit
  // unlocks once every spawned enemy is cleared; see
  // DungeonFloorGenerator.generateTrapRoom.
  _updateTrapRoom(room) {
    if (!room.stairsUpLocked) return;
    if (room.enemies.length > 0) return;
    // A standing Spawn Vent would only refill the room — it must fall too.
    if (hasStandingVent(room)) return;
    room.stairsUpLocked = false;
    paintStairsUpVisual(room.stairsUpObj, false);
    this._spawnUnlockEffect(room.stairsUpObj);
  }

  // Branch's companion-panel puzzle — lives directly on Branch's own floor
  // (bug #209: previously relocated into a side room off Branch's East
  // descent, gated on companion status, which hid the puzzle's very
  // existence from a solo player; git-archaeology into the pre-rework
  // 5-floor system showed Floor 2's panels were always rendered in the
  // room regardless of companion status — only solving them needed one).
  // Solving emits the 'panels' Reveal, which opens the Branch's descent to
  // the Pyramid, instead of a floor-level stairsLocked flag.
  _updateBranchPanels(floor) {
    const { game } = this;
    const player = game.player;
    const companion = game.companion;
    const a = floor.panelAObj;
    const b = floor.panelBObj;
    if (!a || !b) return;

    const aPx = a.position.x, aPy = a.position.y;
    const bPx = b.position.x, bPy = b.position.y;

    const playerOnA = overlapsCell(player, aPx, aPy);
    const playerOnB = overlapsCell(player, bPx, bPy);
    const compOnA = companion ? overlapsCell(companion, aPx, aPy) : false;
    const compOnB = companion ? overlapsCell(companion, bPx, bPy) : false;

    const aPressed = playerOnA || compOnA;
    const bPressed = playerOnB || compOnB;

    // Visual state — stay "pressed" once puzzle is solved
    setTriggerVisual(a, aPressed || floor.puzzleSolved);
    setTriggerVisual(b, bPressed || floor.puzzleSolved);

    // First simultaneous press → permanent unlock
    if (!floor.puzzleSolved && aPressed && bPressed) {
      floor.puzzleSolved = true;
      this.revealEdges(floor, 'panels');
      if (companion) companion.commandTarget = null;
      return;
    }

    // Dispatch companion to the unoccupied panel while player stands on one.
    // Sticky once committed: the companion's crossing is a straight-line walk
    // with no pathfinding, so it takes real time (the two panels are 10
    // cols apart) — requiring the player to keep standing on their panel for
    // the whole crossing made the puzzle unsolvable by anyone who moved
    // afterward (very plausible: watching the companion walk, repositioning).
    // Previously, the player stepping off before the companion arrived hit
    // the `else` branch below, nulled commandTarget mid-walk, and permanently
    // stranded the companion partway across the room — the puzzle could
    // never solve for the rest of the run (bug #205). Re-deriving the target
    // only while the companion isn't yet holding either panel (not on every
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
      // else: companion is already holding a panel — leave commandTarget
      // alone so it stays put regardless of where the player wanders.
    } else if (companion) {
      companion.commandTarget = null;
    }
  }

  // Hook posts and decorative torches, on any floor whose template placed
  // them (dungeonFixtures.js). Neither gates anything, so both keep working
  // before, during and after a floor's triggers are solved — a hook post is
  // a traversal aid, not a one-time gate; a torch is pure ambience.
  _updateFixtures(floor, dt) {
    const player = this.game.player;
    if (!floor.hookPosts?.length && !floor.torches?.length) return;

    // Hook posts — same pull contract as the original Whip Trial's posts:
    // each strike pulls the player to that post's own position (see
    // PhysicsSystem.updateEntity's hookedByWhip handling for the actual
    // traversal).
    for (const post of floor.hookPosts ?? []) {
      if (post.glitterHit) {
        post.glitterHit = false;
        if (!player.hookedByWhip) {
          player.hookedByWhip = { targetX: post.position.x, targetY: post.position.y };
        }
      }
    }

    // Torches — maze-parity ignite: unlit until a fire attack strikes the
    // cell (torchIgnition.js), permanent once lit (see PuzzleTorch in
    // dungeonFixtures.js / MazeSystem's own MazeTorch for the fuller
    // maze mechanic this mirrors).
    for (const torch of floor.torches ?? []) {
      torch.pulseTimer += dt;
      if (torch.lit) continue;
      if (fireStrikesTorch(this.game.combatSystem, torch)) torch.lit = true;
    }
  }

  // A numbered floor's triggers (dungeonFixtures.js): once every one is
  // active at once, every Trigger Block on the floor opens for good and the
  // floor emits its 'triggers' Reveal, opening any descent that waits on it
  // (a Hidden Descent most often). Push Rocks are kept off every anchor cell
  // (staircases, landings, the Entrance's door), the cells the Progression
  // Solver proves stay connected.
  _updateFloorTriggers(floor, dt) {
    if (!floor.triggers?.length || floor.triggersSolved) return;
    const { game } = this;
    if (!tickTriggers(floor.triggers, dt, game.player, game.companion, this._pushWorld(floor))) return;
    floor.triggersSolved = true;
    for (const block of floor.backgroundObjects.filter(obj => obj.typeId === 'trigger_block' && !obj.destroyed)) {
      floor.backgroundObjects.splice(floor.backgroundObjects.indexOf(block), 1);
      const row = Math.round(block.position.y / GRID.CELL_SIZE);
      const col = Math.round(block.position.x / GRID.CELL_SIZE);
      if (floor.collisionMap[row]) floor.collisionMap[row][col] = false;
      this._spawnUnlockEffect(block);
    }
    game.renderer?.markBackgroundDirty?.();
    game.audioSystem?.playSFX?.('dungeon_key_use');
    this.revealEdges(floor, 'triggers');
  }

  // The gate rock (DungeonFloorGenerator._buildScaffold): a Push Rock sitting
  // on the footprint of the floor's 'push' descent, the alternative to the
  // Skull Key. One shove off the footprint — never onto another anchor
  // cell — and the floor emits its 'push' Reveal, opening that descent.
  _updateGateRock(floor, dt) {
    if (!floor.gateRock || floor.gateRock.active) return;
    const { game } = this;
    // The 'push' descent is hidden, so revealEdges sounds the chime itself.
    if (tickTriggers([floor.gateRock], dt, game.player, game.companion, this._pushWorld(floor))) {
      this.revealEdges(floor, 'push');
    }
  }

  // The world a numbered floor's Push Rocks slide through: its walls and
  // objects, with every anchor cell (staircases, landings, the Entrance's
  // door) forbidden — the cells the Progression Solver proves stay connected.
  _pushWorld(floor) {
    const anchorCells = new Set(floorAnchorCells(FOOTPRINT_CONTRACT, floor.diagonals)
      .map(({ row, col }) => `${row},${col}`));
    return {
      collisionMap: floor.collisionMap,
      backgroundObjects: floor.backgroundObjects,
      isReserved: (col, row) => anchorCells.has(`${row},${col}`),
      fireStrikes: (torch) => fireStrikesTorch(this.game.combatSystem, torch),
    };
  }

  // Puzzle Room — generic template-driven puzzle side room (see
  // DungeonFloorGenerator.generatePuzzleRoom). Every trigger in room.triggers
  // (a 'switch', strike-triggered via the puzzleSignal/glitterHit contract;
  // a 'panel', occupancy-triggered like Branch's own panels; a 'torch',
  // ignited by the same fire-strike contract (torchIgnition.js) as a decorative
  // PuzzleTorch (dungeonFixtures.js); or a 'push', a Push Rock shoved one cell) runs through the shared triggerMachine state
  // machine; the exit unlocks once every trigger is active at once — the
  // generalized form of both Branch's own "all at once" solve rule and the
  // original Whip Trial's "both switches struck together" rule (now itself
  // just an editor-authored template, whip_trial.json), extended to any
  // trigger count/mix. Hook posts and the DECORATIVE torches
  // (room.torches, not room.triggers) are independent of the trigger/solve
  // state and run in _updateFixtures on every floor. A torch-KIND trigger is
  // the opposite of that decorative torch: it's a real gate, so it's handled
  // with the triggers below like switch/panel.
  _updatePuzzleRoom(room, dt) {
    const { game } = this;
    const player = game.player;
    const companion = game.companion;
    if (room.puzzleSolved) return;

    this._restockBomb(room);

    // What a Push Rock needs to know about its destination cell. The stairs
    // cell is reserved so a shove can never bury the room's own exit; no
    // onMove hook, since the interior overlay redraws every frame.
    const world = {
      collisionMap: room.collisionMap,
      backgroundObjects: room.backgroundObjects,
      isReserved: (col, row) => col === room.stairsUpCol && row === room.stairsUpRow,
      fireStrikes: (torch) => fireStrikesTorch(game.combatSystem, torch)
    };
    if (tickTriggers(room.triggers, dt, player, companion, world)) {
      room.puzzleSolved = true;
      room.stairsUpLocked = false;
      paintStairsUpVisual(room.stairsUpObj, false);
      this._spawnUnlockEffect(room.stairsUpObj);
    }
  }

  /**
   * Bomb Trial: a Bomb explodes on the active floor. Flags the Trial to drop
   * a fresh Bomb on its pedestal (_restockBomb) — the room hands back every
   * Bomb it costs, so a player who brought their own Bomb Bag is never made
   * to spend its stock. Called from ConsumableWindupEffects' explode case.
   */
  onBombExploded() {
    const floor = this.game.activeFloor;
    if (floor?.dais && !floor.puzzleSolved) floor.bombRestockPending = true;
  }

  /**
   * Bomb Trial pedestal restock: after a Bomb explodes (onBombExploded), drop
   * a fresh one on the pedestal. Waits while a thrown Bomb is still winding
   * up (its blast may yet solve the room) or a Bomb is still lying on this
   * floor.
   */
  _restockBomb(room) {
    const { game } = this;
    if (!room.bombRestockPending || !room.weaponPedestal) return;
    const windups = game.inventorySystem?.consumableWindups ?? [];
    if (windups.some(w => w.consumable?.char === BOMB_CHAR)) return;
    if (game.items.some(item => item.hutPlane && item.char === BOMB_CHAR)) return;

    room.bombRestockPending = false;
    const CS = GRID.CELL_SIZE;
    const { col, row } = room.weaponPedestal;
    const bomb = Object.assign(new Item(BOMB_CHAR, col * CS, row * CS), { hutPlane: true });
    game.items.push(bomb);
    this._spawnUnlockEffect(bomb);
  }

  // ─── SPACE-press puzzle actions ───────────────────────────────────────────
  // DungeonSystem.handleSpacePress() delegates here after ruling out normal
  // enter/exit/ascend/descend transitions. Returns true if handled.

  handleSpacePress() {
    const { game } = this;
    const floor = game.activeFloor;
    if (!floor) return false;

    if (this._tryOpenLockBlock(floor)) return true;
    if (this._tryUnlockKeyGate(floor)) return true;
    if (floor.kind === 'pyramid') {
      if (this._tryDepositPyramid(floor)) return true;
    }
    return false;
  }

  // Lock Block — SPACE beside one with a key opens it, on any floor whose
  // template placed one ('L'). A universal key (opensAnyLock) opens it for
  // free; otherwise one Simple Key is spent. The nearest block in reach is
  // the one opened, so a single press never spends two keys.
  _tryOpenLockBlock(floor) {
    const { game } = this;
    const inventory = game.inventorySystem;
    const universal = holdsUniversalKey(game);
    if (!universal && !hasKeyItem(inventory, SIMPLE_KEY_CHAR)) return false;

    const player = game.player;
    let nearest = null, nearestDist = Infinity;
    for (const obj of floor.backgroundObjects) {
      if (obj.typeId !== 'lock_block' || obj.destroyed) continue;
      const dist = Math.hypot(obj.position.x - player.position.x, obj.position.y - player.position.y);
      if (dist < LOCK_BLOCK_REACH && dist < nearestDist) { nearest = obj; nearestDist = dist; }
    }
    if (!nearest) return false;

    if (!universal) consumeKeyItem(inventory, SIMPLE_KEY_CHAR);
    floor.backgroundObjects.splice(floor.backgroundObjects.indexOf(nearest), 1);
    const row = Math.round(nearest.position.y / GRID.CELL_SIZE);
    const col = Math.round(nearest.position.x / GRID.CELL_SIZE);
    if (floor.collisionMap[row]) floor.collisionMap[row][col] = false;
    this._spawnUnlockEffect(nearest);
    game.renderer?.markBackgroundDirty?.();
    game.audioSystem?.playSFX?.('dungeon_key_use');
    return true;
  }

  // A floor is cleared once it holds no counted enemy and no standing Spawn
  // Vent. Counted, not raw, so a hidden or pacifist enemy can't hold a door
  // shut forever. Clearing opens the floor's Shutters and emits the 'clear'
  // Reveal (a Hidden Descent) on the same tick.
  _floorCleared(floor) {
    return this.game._countedEnemies(floor.enemies).length === 0 && !hasStandingVent(floor);
  }

  // Shutters ('S') — on any floor, every Shutter opens at once, for good,
  // the first tick the floor is cleared (_floorCleared). A floor with
  // Shutters and nothing to fight opens them the moment the player arrives.
  _updateShutters(floor) {
    const { game } = this;
    const shutters = floor.backgroundObjects.filter(obj => obj.typeId === 'shutter' && !obj.destroyed);
    if (shutters.length === 0) return;
    for (const shutter of shutters) {
      floor.backgroundObjects.splice(floor.backgroundObjects.indexOf(shutter), 1);
      const row = Math.round(shutter.position.y / GRID.CELL_SIZE);
      const col = Math.round(shutter.position.x / GRID.CELL_SIZE);
      if (floor.collisionMap[row]) floor.collisionMap[row][col] = false;
      this._spawnUnlockEffect(shutter);
    }
    game.renderer?.markBackgroundDirty?.();
    game.audioSystem?.playSFX?.('dungeon_key_use');
  }

  // The Skull Key's door — a locked descent whose Reveal is 'key' (the
  // corridor layer's door into the Branch; on a triangle, the shortcut). SPACE while
  // standing on it, key in hand: consumes the key and emits the 'key'
  // Reveal. A subsequent SPACE (now unlocked) is a normal descend, handled by
  // DungeonSystem.
  _tryUnlockKeyGate(floor) {
    const { game } = this;
    const gate = floor.descents.find(d => d.locked && d.reveal === 'key');
    if (!gate) return false;
    if (!hasKeyItem(game.inventorySystem, '⚿', game)) return false;
    if (!overlapsCell(game.player, gate.obj.position.x, gate.obj.position.y)) return false;

    consumeKeyItem(game.inventorySystem, '⚿');
    game.dungeonSystem.interiorState.keyUsed = true;
    this.revealEdges(floor, 'key');
    game.audioSystem?.playSFX?.('dungeon_key_use');
    return true;
  }

  // Pyramid — "walk up + offer" verb (WellSystem/FountainSystem precedent).
  // Each slot takes its item from wherever that item's type lives: a
  // consumable (green: Bread) from the equipped consumables, armor (green:
  // Compass) off the player, a weapon (green: Fortune Dagger) from the quick
  // slots, where Item exposes .char directly. One deposit per SPACE press.
  _tryDepositPyramid(floor) {
    const { game } = this;
    const player = game.player;
    for (const key of Object.keys(floor.pyramidSlots)) {
      const slot = floor.pyramidSlots[key];
      if (slot.filled || !slot.requiredChar) continue;
      if (!this._nearCell(player, slot.obj.position.x, slot.obj.position.y, INTERACT_RADIUS)) continue;

      if (slot.itemType === ITEM_TYPES.CONSUMABLE) {
        const slots = game.inventorySystem?.equippedConsumables || [];
        const idx = slots.findIndex(it => it?.char === slot.requiredChar || it?.data?.char === slot.requiredChar);
        if (idx < 0) continue;
        slots[idx] = null;
      } else if (slot.itemType === ITEM_TYPES.ARMOR) {
        const inv = game.inventorySystem;
        if (inv?.equippedArmor?.char !== slot.requiredChar) continue;
        inv.equippedArmor = null;
        inv.applyEquipmentEffectsToPlayer(player);
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
      game.particles.push(tagInteriorPlane(game, new Particle(
        cx, cy, '*', color,
        { vx: Math.cos(angle) * 25, vy: Math.sin(angle) * 25 - 15 },
        0.8
      )));
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
    // The offering's real payoff: it emits the 'offering' Reveal, opening
    // the Vault descent (the Artifact ⚜ drops alongside it — the trophy the
    // player carries out either way).
    this.revealEdges(floor, 'offering');
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
      game.particles.push(tagInteriorPlane(game, new Particle(
        sx + (Math.random() - 0.5) * 6,
        sy + (Math.random() - 0.5) * 6,
        chars[i], colors[i],
        { vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 20 },
        1.0 + Math.random() * 0.5
      )));
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
}
