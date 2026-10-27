import { GRID } from '../game/GameConfig.js';
import { BackgroundObject } from '../entities/BackgroundObject.js';
import { Item } from '../entities/Item.js';
import { ITEMS } from '../data/items.js';
import { cellsWithGlyph } from '../data/dungeon/tiles.js';
import { setTriggerVisual } from './triggerMachine.js';
import { createPushRock } from './PushRock.js';

/**
 * Template fixtures — the authored objects a dungeon template places on top
 * of its grid, shared by every templated floor: numbered floors
 * (DungeonFloorGenerator._buildScaffold) and Puzzle Rooms
 * (generatePuzzleRoom) build them through the one placeTemplateFixtures
 * below, so a fixture an author draws in the dungeon editor behaves the same
 * in either. DungeonPuzzleSystem ticks them (_updateFixtures for hook posts
 * and torches on any floor; the triggers open a Puzzle Room's Exit, or a
 * numbered floor's Trigger Blocks and its 'triggers' Reveal).
 *
 * The template schema for each list is documented in dungeonPuzzleTemplates.js.
 */

// Puzzle Room torch fixture — maze-parity ignite behavior (unlit until the
// player approaches while wielding the Torch item, permanent once lit,
// pulsing glow while lit), minus the ghost-shielding half of MazeSystem's
// own MazeTorch (Puzzle Rooms have no ghosts — Tomb Ghosts, the dungeon's
// only ghost type, spawn from Tombs and never come near a torch's light by
// design; see DungeonGhostSystem). A distinct, local class rather
// than importing MazeTorch itself — MazeSystem/DungeonSystem are
// independent siblings (Interior System Pattern, CLAUDE.md); only the
// shared visual constants are reused (DungeonPuzzleSystem's ignite check,
// HutInteriorOverlay's render block).
export class PuzzleTorch {
  constructor(col, row, lit = false) {
    this.char       = '!';
    this.col        = col;
    this.row        = row;
    this.position   = { x: col * GRID.CELL_SIZE, y: row * GRID.CELL_SIZE };
    this.lit        = lit;
    this.pulseTimer = 0;
  }
}

/**
 * Place every fixture `data` (a floor or puzzle template's JSON) authors.
 * Pushes background objects onto `backgroundObjects` and template items onto
 * `items`; anything on a `reservedCells` cell is left out, the same as every
 * other template content there. Returns the floor's live fixture lists:
 * { triggers, hookPosts, torches, gapCells } (gapCells a Set of "row,col",
 * or null when the grid has no Gap).
 */
export function placeTemplateFixtures(data, { backgroundObjects, items, reservedCells = [] }) {
  const CS = GRID.CELL_SIZE;
  const reserved = new Set(reservedCells.map(({ row, col }) => `${row},${col}`));
  const free = list => (list ?? []).filter(({ row, col }) => !reserved.has(`${row},${col}`));

  for (const { row, col } of cellsWithGlyph(data.grid, '=', reservedCells)) {
    backgroundObjects.push(BackgroundObject.createVariant('lava', col * CS, row * CS));
  }

  // Hammer Trial fixtures: Cavern Rocks the Onyx Hammer rolls, and the
  // Deflectors that turn a rolling rock toward its target.
  for (const { row, col } of free(data.unbreakableRocks)) {
    backgroundObjects.push(BackgroundObject.createVariant('cavern_rock', col * CS, row * CS));
  }
  for (const { row, col, char } of free(data.deflectors)) {
    backgroundObjects.push(new BackgroundObject(char, col * CS, row * CS));
  }

  // Gap cells ('G') — impassable, chasm-rendered (same "reach across, not
  // walk around" mechanic as the original Whip Trial's hardcoded gap band,
  // generalized to arbitrary per-cell shapes). Collision is already
  // stamped solid with the rest of the template's solid tiles; gapCells is
  // rendering-only metadata (HutInteriorOverlay draws chasm edge glyphs +
  // true void instead of an ordinary wall for any cell in this set).
  const gapCellList = cellsWithGlyph(data.grid, 'G', reservedCells);
  const gapCells = gapCellList.length
    ? new Set(gapCellList.map(({ row, col }) => `${row},${col}`))
    : null;

  // Trigger Blocks ('T', numbered floors only) — collision is already
  // stamped solid by the template; DungeonPuzzleSystem._updateFloorTriggers
  // removes every one (and clears its cell) once the floor's triggers are
  // all active at once.
  for (const { row, col } of cellsWithGlyph(data.grid, 'T', reservedCells)) {
    backgroundObjects.push(new BackgroundObject('▥', col * CS, row * CS, { typeId: 'trigger_block' }));
  }

  // Trigger fixtures — 'switch' is strike-based (puzzleSignal + glitterHit,
  // indestructible override so a hit never destroys it, just pulses);
  // 'panel' is occupancy-only and needs no override at all — its char is
  // unregistered in BACKGROUND_OBJECTS, so BackgroundObject's constructor
  // already falls back to indestructible:true/hp:null (see the hook-post
  // comment below for the full mechanism), which is exactly right for a
  // floor panel: nothing should ever be able to attack it. 'torch' is a
  // third kind, built as a plain object rather than a BackgroundObject —
  // ignition is proximity + held-item (same contract as a decorative
  // PuzzleTorch above), not a combat strike, so it needs none of
  // BackgroundObject's hp/collision machinery, just the generic
  // activation/active/_timer trio _advanceTrigger already reads. Kept
  // deliberately distinct from PuzzleTorch (which uses `.lit`) rather than
  // a shared class: a decorative torch and a torch-trigger are genuinely
  // different lifecycles (ambience that never gates vs. a real trigger
  // that feeds the solve check) and conflating them risks reading
  // the wrong field from the wrong render/update path.
  const triggers = [];
  for (const t of free(data.triggers)) {
    if (t.kind === 'torch') {
      triggers.push({
        char: '!',
        col: t.col, row: t.row,
        position: { x: t.col * CS, y: t.row * CS },
        kind: 'torch',
        activation: 'permanent',
        active: false,
        _timer: 0,
        pulseTimer: 0,
      });
      continue;
    }
    // A Push Rock is its own fixture: a Cavern Rock look-alike that slides
    // a cell when leaned on (PushRock.js). Always permanent.
    if (t.kind === 'push') {
      const rock = createPushRock(t.col, t.row);
      backgroundObjects.push(rock);
      triggers.push(rock);
      continue;
    }
    const isSwitch = t.kind === 'switch';
    const obj = new BackgroundObject(isSwitch ? '○' : '▭', t.col * CS, t.row * CS);
    obj.kind = t.kind;
    setTriggerVisual(obj, false);
    if (isSwitch) {
      obj.puzzleSignal = true;
      obj.indestructible = false;
      obj.hp = 1;
      obj.maxHp = 1;
    }
    obj.activation = t.activation;
    obj.neutralizeSeconds = t.neutralizeSeconds;
    obj.active = false;
    obj._timer = 0;
    backgroundObjects.push(obj);
    triggers.push(obj);
  }

  // Hook posts — manually authored pull fixtures (independent of Gap
  // placement; an author positions them anywhere). Same puzzleSignal/
  // glitterHit strike contract as a switch, but pulls the player to the
  // post's own position instead of arming a trigger (player.hookedByWhip;
  // PhysicsSystem owns the actual traversal) — the mechanic the original
  // Whip Trial used to cross its gap. '•' (bullet) — prominent, round,
  // human-readable at a glance; distinct from the switches' ○/● pair so
  // "pull fixture" vs. "strike fixture" read as different symbol
  // families. Unregistered in BACKGROUND_OBJECTS, so BackgroundObject's
  // constructor falls back to synthetic data with indestructible:true,
  // hp:null (src/entities/BackgroundObject.js's unregistered-char
  // branch). takeDamage() checks `this.indestructible || this.hp === null`
  // BEFORE it ever reaches the puzzleSignal/glitterHit branch, so that
  // fallback would silently eat every strike — hence the explicit
  // override below. minAttackSegment gates on CombatSystem's per-segment
  // collision check: a post commonly sits at the player's own natural
  // standing cell, so without this ANY swing (even the near segments)
  // would trigger it by accident — only a reach weapon's farthest
  // segments (its actual reach) should count.
  const hookPosts = [];
  for (const { row, col } of free(data.hookPosts)) {
    const obj = new BackgroundObject('•', col * CS, row * CS);
    obj.color = '#ddaa55';
    obj.animationChar = '•';
    obj.animationColor = '#ddaa55';
    obj.puzzleSignal = true;
    obj.indestructible = false;
    obj.hp = 1;
    obj.maxHp = 1;
    obj.minAttackSegment = 4;
    backgroundObjects.push(obj);
    hookPosts.push(obj);
  }

  // Torches — maze-parity fixture: unlit until the player approaches while
  // wielding the Torch item, permanent once lit, pulsing glow while lit.
  // Purely decorative — never gates anything (contrast the 'torch'-kind
  // trigger above, a separate mechanic for a torch that DOES gate). `lit`
  // is an optional per-entry starting flag (author can place a torch
  // already burning); everything else about the fixture is identical
  // whether it started lit or was lit by the player.
  const torches = free(data.torches).map(({ row, col, lit }) => new PuzzleTorch(col, row, !!lit));

  // Template items — any ITEMS char an author sets on a cell, most often the
  // optional reward a Trigger Block walls off. The editor and the data gate
  // check each char; a stale one is skipped rather than spawning a ghost.
  for (const { row, col, char } of free(data.items)) {
    if (!ITEMS[char]) {
      console.warn(`[dungeonFixtures] template item "${char}" at (${row},${col}) isn't in ITEMS — skipped.`);
      continue;
    }
    items.push(Object.assign(new Item(char, col * CS, row * CS), { hutPlane: true }));
  }

  return { triggers, hookPosts, torches, gapCells };
}
