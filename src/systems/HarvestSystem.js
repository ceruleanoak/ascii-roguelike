import { GRID, GAME_STATES } from '../game/GameConfig.js';
import { buildTerrainGrid, cellCost, BLOCKED, HAZARD } from './steeringTerrain.js';
import { HeldKeySteering } from './heldKeySteering.js';
import { entityCenter } from '../game/Telegraph.js';
import { planeOf, objectOnPlane } from './PlaneSystem.js';

const CELL = GRID.CELL_SIZE;

// How near the player's top-left must come to its stand cell's before it
// swings. The swing goes straight at the target from the cell beside it, as
// a player lines one up by hand; from an off-grid spot it can miss.
const STAND_PX = CELL * 0.3;

// Seconds a target may go with the player neither drawing closer nor taking
// HP off it before it is given up on (out of reach behind water or walls, or
// a swing that keeps missing it).
const TARGET_PATIENCE = 4;
const CLOSER_PX = 2;

const FRAME = 1 / 60;

const NO_KEYS = Object.freeze({ w: false, a: false, s: false, d: false });

// What each Spell farms, and the tool it takes. Trees fall only to an axe;
// rocks to the pickaxe or a hammer (InteractionSystem.resolveSmashRefusal
// lets other blunt weapons through too, but they are not tools for the job).
// Grass (HARVEST only) is cut by any blade, and only once no tree or rock is
// left to farm (`last`).
const MATERIALS = {
  tree: {
    is: obj => obj.char === 'Y',
    tool: item => item?.data?.weaponSubtype === 'axe',
  },
  rock: {
    is: obj => obj.data?.dropEffect === 'destroyObject:rockHarvest',
    tool: item => !!item?.data?.isPickaxe || item?.data?.weaponSubtype === 'hammer',
  },
  grass: {
    is: obj => !!(obj.data?.cuttable && obj.data.cutState),
    tool: item => !!item?.data?.isBlade,
    last: true,
  },
};

/**
 * HarvestSystem — the CHOP, MINE and HARVEST Spells: the player farms the
 * room's Trees (CHOP, with an axe) or Rocks (MINE, with the pickaxe or a
 * hammer), or both (HARVEST), until none are left or the player's next
 * keypress. Once HARVEST has no tree or rock left it cuts the room's grass
 * with any blade, densest cell first (the most grass objects in one cell),
 * until every blade is cut.
 *
 * Driven like FIGHT: HeldKeySteering walks the player to the open cell beside
 * the target nearest the player, then the player faces it and swings through
 * `CombatSystem.tryUseHeldWeapon`, the same entry point SPACE uses, so every
 * drop is the ordinary harvest. A charged hammer is let go once full.
 *
 * The tool comes from the quick slots through the number-key path
 * (handleSelectSlot). HARVEST works the material the held tool serves first
 * and swaps tools only when that material runs out, so it cycles once per
 * material, not once per object.
 *
 * Only the room's own farmable objects count: no Barricade material
 * (typeId), nothing obsidian, indestructible or yielding nothing, nothing on
 * another plane. A target the player neither draws closer to nor damages for
 * TARGET_PATIENCE seconds is given up on. Enemies are not fought; damage still lands. EXPLORE only.
 */
export class HarvestSystem {
  constructor(game) {
    this.game = game;
    this.active = false;
    // Materials this cast farms ('tree' / 'rock').
    this.materials = [];
    this.target = null;
    // Target HP last seen, the player's closest approach to it, and seconds
    // since either last improved (TARGET_PATIENCE).
    this.targetHp = null;
    this.closest = Infinity;
    this.targetTimer = 0;
    // Objects given up on this cast.
    this.skipped = new Set();
    this.steering = new HeldKeySteering(game);
  }

  isActive() {
    return this.active;
  }

  /**
   * Begin farming.
   * @param {string[]} materials - 'tree' (CHOP), 'rock' (MINE), or both (HARVEST)
   * @returns {string|null} null when it starts (silent cast), else the THREE's refusal
   */
  cast(materials) {
    const game = this.game;
    if (game.stateMachine?.getCurrentState() !== GAME_STATES.EXPLORE) return '...NOTHING.';
    if (!game.player || game.animationSystem.isAnimating(game.player)) return '...NOTHING.';
    this.reset();
    this.materials = materials.filter(m => this._toolSlot(m) !== -1);
    if (!this._pickTarget()) {
      this.reset();
      return '...NOTHING.';
    }
    this.active = true;
    this.steering.resetProgress();
    return null;
  }

  /** Any keypress after the cast hands control back (main.js keydown). */
  onPlayerInput() {
    this.reset();
  }

  /** End the farming (Reset Registry, room scope). */
  reset() {
    this.active = false;
    this.materials = [];
    this.target = null;
    this.targetHp = null;
    this.closest = Infinity;
    this.targetTimer = 0;
    this.skipped.clear();
  }

  /**
   * The WASD keys held this frame, or null when the player's own keys should
   * drive. Lets go of everything once the target is in reach.
   */
  heldKeys() {
    if (!this.active) return null;
    const target = this._currentTarget();
    const stand = target && this._standCell(target);
    if (!stand || this._onStand(stand)) return { ...NO_KEYS };
    return this.steering.keysToward(stand.x, stand.y);
  }

  /** Swap to the right tool, then face and swing at the target in reach. */
  update() {
    if (!this.active) return;
    const game = this.game;
    const player = game.player;
    const held = player.heldItem;

    // A charge started by an earlier swing (a charged hammer): let go once full.
    if (held?.isCharging) {
      const full = held.data.chargeTime ?? held.maxChargeTime ?? 0;
      if (held.chargeTime >= full) game.handleSpaceRelease();
      return;
    }

    const target = this._currentTarget();
    if (!target) { this.reset(); return; }
    if (this._outOfPatience(target)) return;

    const material = this._materialOf(target);
    if (!MATERIALS[material].tool(held)) {
      const slot = this._toolSlot(material);
      if (slot === -1) { this.skipped.add(target); this.target = null; return; }
      game.handleSelectSlot(slot);
      return;
    }

    const stand = this._standCell(target);
    if (!stand || !this._onStand(stand)) return;
    player.facing.x = stand.faceX;
    player.facing.y = stand.faceY;
    if (player.canAttack()) game.combatSystem.tryUseHeldWeapon();
  }

  // The target this frame: the one being worked while it still stands,
  // otherwise a fresh pick.
  _currentTarget() {
    if (this.target && this._farmable(this.target)) return this.target;
    return this._pickTarget();
  }

  // The nearest farmable object, preferring the material the held tool
  // serves so HARVEST only swaps tools when that material runs out. Grass
  // waits until no tree or rock is left, then goes densest cell first.
  _pickTarget() {
    const held = this.game.player.heldItem;
    const all = this._candidates();
    const first = all.filter(o => !MATERIALS[this._materialOf(o)].last);
    let best;
    if (first.length) {
      const served = first.filter(o => MATERIALS[this._materialOf(o)].tool(held));
      best = this._nearest(served.length ? served : first);
    } else {
      best = this._densest(all);
    }
    this.target = best;
    this.targetHp = best?.hp ?? null;
    this.closest = Infinity;
    this.targetTimer = 0;
    return best;
  }

  // Gives up on a target the player has gone TARGET_PATIENCE seconds without
  // drawing closer to or taking HP off. True when it was given up this frame.
  _outOfPatience(target) {
    const p = entityCenter(this.game.player);
    const t = entityCenter(target);
    const dist = Math.hypot(t.x - p.x, t.y - p.y);
    if (target.hp !== this.targetHp || dist < this.closest - CLOSER_PX) {
      this.targetHp = target.hp;
      this.closest = Math.min(this.closest, dist);
      this.targetTimer = 0;
      return false;
    }
    this.targetTimer += FRAME;
    if (this.targetTimer < TARGET_PATIENCE) return false;
    this.skipped.add(target);
    this.target = null;
    return true;
  }

  _nearest(objects) {
    const p = entityCenter(this.game.player);
    let best = null;
    let bestDist = Infinity;
    for (const obj of objects) {
      const c = entityCenter(obj);
      const d = Math.hypot(c.x - p.x, c.y - p.y);
      if (d < bestDist) { bestDist = d; best = obj; }
    }
    return best;
  }

  // The nearest object in the cell holding the most of them.
  _densest(objects) {
    const cells = new Map();
    for (const obj of objects) {
      const c = entityCenter(obj);
      const key = `${Math.floor(c.x / CELL)},${Math.floor(c.y / CELL)}`;
      if (!cells.has(key)) cells.set(key, []);
      cells.get(key).push(obj);
    }
    const most = Math.max(0, ...[...cells.values()].map(cell => cell.length));
    return this._nearest([...cells.values()].filter(cell => cell.length === most).flat());
  }

  _candidates() {
    const objects = this.game._activeBackgroundObjects() || [];
    return objects.filter(o => this._farmable(o));
  }

  // Standing, breakable, the room's own (no Barricade material), worth
  // breaking, on the player's plane, and of a material this cast farms.
  _farmable(obj) {
    if (obj.destroyed || this.skipped.has(obj)) return false;
    if (obj.typeId || obj.obsidian || obj.indestructible || obj.dropsNothing || obj.hp == null) return false;
    if (!objectOnPlane(obj, planeOf(this.game.player))) return false;
    const material = this._materialOf(obj);
    return material !== null && this.materials.includes(material);
  }

  _materialOf(obj) {
    for (const [name, m] of Object.entries(MATERIALS)) if (m.is(obj)) return name;
    return null;
  }

  // The quick slot holding a tool for this material (the held slot first),
  // or -1 when none does.
  _toolSlot(material) {
    const player = this.game.player;
    const slots = player.quickSlots;
    const order = [player.activeSlotIndex, ...slots.keys()];
    const tool = MATERIALS[material].tool;
    return order.find(i => !player.destroyedSlots?.[i] && tool(slots[i])) ?? -1;
  }

  // Whether the player stands on the stand cell (see STAND_PX).
  _onStand(stand) {
    const pos = this.game.player.position;
    return Math.hypot(pos.x - stand.x, pos.y - stand.y) <= STAND_PX;
  }

  // The open cell beside the target (left, right, above, below) nearest the
  // player: its top-left and the straight facing from it to the target. Null
  // when the target is walled in on all sides.
  _standCell(target) {
    const game = this.game;
    const player = game.player;
    const map = player.collisionMap || game.activeRoom?.collisionMap || game.currentRoom?.collisionMap || null;
    const grid = buildTerrainGrid(game, player, map);
    const t = entityCenter(target);
    const col = Math.floor(t.x / CELL), row = Math.floor(t.y / CELL);
    const p = entityCenter(player);
    let best = null;
    let bestDist = Infinity;
    for (const [dc, dr] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const cost = cellCost(grid, col + dc, row + dr);
      if (cost === BLOCKED || cost === HAZARD) continue;
      const x = (col + dc) * CELL, y = (row + dr) * CELL;
      const d = Math.hypot(x + CELL / 2 - p.x, y + CELL / 2 - p.y);
      if (d < bestDist) { bestDist = d; best = { x, y, faceX: -dc, faceY: -dr }; }
    }
    return best;
  }
}
