import { GRID } from '../game/GameConfig.js';
import { Particle } from '../entities/Particle.js';
import { Ingredient } from '../entities/Ingredient.js';
import { ITEMS } from '../data/items.js';
import { paintDescentVisual, paintStairsUpVisual } from '../data/dungeonFloorTemplates.js';

// Proximity radius for door/switch/slot interaction (px from cell center) —
// mirrors DungeonSystem's DOOR_INTERACT_RADIUS.
const INTERACT_RADIUS = GRID.CELL_SIZE * 2;

const SFX_BEEP_INTERVAL = 2.0; // Compass ping throttle, seconds

// Whip Trial — see plan doc and DungeonFloorGenerator.generateWhipTrial.
const WHIP_TRIAL_STRUCK_WINDOW = 0.25; // seconds — simultaneity window for the two switches

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

    if (floor.roomKind === 'numbered' && floor.floorIndex === 2) {
      this._updateBranchFloor(floor);
    } else if (floor.roomKind === 'whipTrial') {
      this._updateWhipTrial(floor, dt);
    } else if (floor.roomKind === 'trapRoom') {
      this._updateTrapRoom(floor);
    } else if (floor.roomKind === 'companionGate') {
      this._updateCompanionGate(floor);
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

  // Floor 3 (Branch) — Companion Gate visibility re-polls every tick so
  // recruiting a companion mid-visit retroactively reveals the East
  // descent without requiring dungeon re-entry (softlock fix, plan 2.3).
  _updateBranchFloor(floor) {
    const east = floor.descents.find(d => d.id === 'east');
    if (!east) return;
    const shouldBeActive = !!this.game.companion;
    if (east.active !== shouldBeActive) {
      east.active = shouldBeActive;
      paintDescentVisual(east.obj, { active: east.active, locked: east.locked });
    }
  }

  // Whip Trial — exit unlocks once both switches are struck within the
  // same swing. Reuses the puzzleSignal/glitterHit strike contract (see
  // PuzzleSystem.js's Listening Stones): switches/posts are indestructible,
  // each hit pulses glitterHit for one tick. Two posts, one on each bank of
  // the gap — each pulls the player to its own fixed position, no "which
  // side are they on" branching needed. The south post is the required
  // crossing; the north post is a pure non-softlock safety valve (the real
  // exit is south of the switches, not back at the entrance — see
  // generateWhipTrial). The pull itself (traversal, arrival, i-frames) is
  // owned by PhysicsSystem.updateEntity's hookedByWhip handling — this only
  // sets the target, same contract CombatSystem uses for the Stump/Tree
  // generalization of this same trick.
  _updateWhipTrial(room, dt) {
    const { game } = this;
    const player = game.player;

    // Post strikes — each pulls the player to that post's own position.
    for (const post of [room.postNorthObj, room.postSouthObj]) {
      if (post.glitterHit) {
        post.glitterHit = false;
        if (!player.hookedByWhip) {
          player.hookedByWhip = { targetX: post.position.x, targetY: post.position.y };
        }
      }
    }

    // Switch strikes — simultaneity window, then permanent unlock.
    if (!room.puzzleSolved) {
      for (const sw of [room.switchAObj, room.switchBObj]) {
        if (sw.recentlyStruck) {
          sw._struckTimer += dt;
          if (sw._struckTimer >= WHIP_TRIAL_STRUCK_WINDOW) {
            sw.recentlyStruck = false;
            this._setSwitchVisual(sw, false);
          }
        }
        if (sw.glitterHit) {
          sw.glitterHit = false;
          sw.recentlyStruck = true;
          sw._struckTimer = 0;
          this._setSwitchVisual(sw, true);
        }
      }

      if (room.switchAObj.recentlyStruck && room.switchBObj.recentlyStruck) {
        room.puzzleSolved = true;
        room.stairsUpLocked = false;
        paintStairsUpVisual(room.stairsUpObj, false);
        this._spawnUnlockEffect(room.stairsUpObj);
      }
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

  // Companion Gate — relocated companion-switch puzzle (was Floor 2's own
  // layout in the old 5-floor system). Solving unlocks the onward descent
  // to the pyramid instead of a floor-level stairsLocked flag.
  _updateCompanionGate(room) {
    const { game } = this;
    const player = game.player;
    const companion = game.companion;
    const a = room.switchAObj;
    const b = room.switchBObj;
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
    this._setSwitchVisual(a, aPressed || room.puzzleSolved);
    this._setSwitchVisual(b, bPressed || room.puzzleSolved);

    // First simultaneous press → permanent unlock
    if (!room.puzzleSolved && aPressed && bPressed) {
      room.puzzleSolved = true;
      const onward = room.descents[0];
      if (onward) {
        onward.locked = false;
        paintDescentVisual(onward.obj, { active: onward.active, locked: false });
        this._spawnUnlockEffect(onward.obj);
      }
      if (companion) companion.commandTarget = null;
      return;
    }

    // Dispatch companion to the unoccupied switch while player stands on one.
    if (!room.puzzleSolved && companion) {
      if (playerOnA && !compOnA) {
        companion.commandTarget = { x: bPx, y: bPy };
      } else if (playerOnB && !compOnB) {
        companion.commandTarget = { x: aPx, y: aPy };
      } else {
        companion.commandTarget = null;
      }
    } else if (companion) {
      companion.commandTarget = null;
    }
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
    if (!game.inventorySystem.hasKeyItem('⚿')) return false;
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
    slot.obj.char = slot.requiredChar;
    slot.obj.color = color;
    slot.obj.animationChar = slot.requiredChar;
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
