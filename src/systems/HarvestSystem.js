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

// The middle of what a swing has to strike: a Background Object's hitbox.
// Not entityCenter, which reads `width`/`height` from the object's top-left:
// on a Background Object those are the hitbox's size (a Rock's is 3x6 px),
// not its cell's, so entityCenter lands near the top-left corner and, on a
// Rock or a blade of grass set off the grid, in the cell beside the one it
// stands in. The swing then went at that empty cell.
function objectCenter(obj) {
  const box = obj.getHitbox();
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

// How many cells in from the room's edge an exit's lane runs: the middle
// column (north, south exits) or row (east, west) that far in is where
// updateExploreState (main.js) warps the player out of the room. A target
// beside an exit is struck from another side, or the player standing there
// would walk out of the room and end the Spell.
const EXIT_LANE_CELLS = 3;

// Whether a player-sized body with this top-left reaches into an exit's lane.
function inExitLane(spot) {
  const midCol = Math.floor(GRID.COLS / 2), midRow = Math.floor(GRID.ROWS / 2);
  const inMidCol = spot.x < (midCol + 1) * CELL && spot.x + CELL > midCol * CELL;
  const inMidRow = spot.y < (midRow + 1) * CELL && spot.y + CELL > midRow * CELL;
  const nearTopOrBottom = spot.y < EXIT_LANE_CELLS * CELL || spot.y + CELL > (GRID.ROWS - EXIT_LANE_CELLS) * CELL;
  const nearLeftOrRight = spot.x < EXIT_LANE_CELLS * CELL || spot.x + CELL > (GRID.COLS - EXIT_LANE_CELLS) * CELL;
  return (inMidCol && nearTopOrBottom) || (inMidRow && nearLeftOrRight);
}

// What each Spell farms, and the tool it takes (`tool(item, obj)`; `obj` is
// left out when the question is whether the player carries a tool for the
// material at all). Trees fall only to an axe; rocks to the pickaxe or a
// hammer (InteractionSystem.resolveSmashRefusal lets other blunt weapons
// through too, but they are not tools for the job). A Glittering Rock is a
// rock too, but only the pickaxe breaks it (CombatSystem's glitteringRock
// gate): a hammer is not a tool for that one.
// HARVEST works them in `stage` order: containers first, then trees, rocks and
// Brush together, then grass (any blade, densest cell first), then sand (any
// melee weapon a blunt one excepted: CombatSystem lets a blunt swing rustle
// but never spend an object).
const MATERIALS = {
  // OPEN: the containers SPACE opens by hand (Barrels, Chests, Crates, Metal
  // Boxes), opened through InteractionSystem.openContainer from the cell
  // beside each, as SPACE opens one: no tool, no swing (`byHand`). A Tomb is
  // left shut: it is SPACE-openable too, but what it lets out (a Tomb Ghost)
  // is not a harvest.
  container: {
    is: obj => !!obj.data?.dropEffect?.startsWith('destroyObject:') && !!obj.acceptsInteraction?.('spacebar'),
    tool: () => true,
    byHand: true,
    stage: -1,
  },
  tree: {
    is: obj => obj.char === 'Y',
    tool: item => item?.data?.weaponSubtype === 'axe',
    stage: 0,
  },
  rock: {
    // The Secret Vein Rock shares glitteringRock but not showsGlitter: it is
    // disguised as ordinary stone, and MINE must not give the secret away.
    is: obj => obj.data?.dropEffect === 'destroyObject:rockHarvest'
      || !!(obj.data?.glitteringRock && obj.data.showsGlitter),
    tool: (item, obj) => obj?.data?.glitteringRock
      ? !!item?.data?.isPickaxe
      : !!item?.data?.isPickaxe || item?.data?.weaponSubtype === 'hammer',
    stage: 0,
  },
  // Shrubs and Brambles (Brush) yield to any melee swing, blunt ones too
  // (CombatSystem's brush exception), so no tool is asked of them beyond a
  // weapon swung by hand: a bare hand only shakes one (BackgroundObject
  // .interact) and a Punch passes objects by. Farmed with the trees and rocks
  // by any cast that farms grass (`with`), which is HARVEST.
  brush: {
    is: obj => obj.data?.kind === 'brush',
    tool: item => item?.data?.weaponType === 'MELEE',
    stage: 0,
    with: 'grass',
  },
  grass: {
    is: obj => !!(obj.data?.cuttable && obj.data.cutState),
    tool: item => !!item?.data?.isBlade,
    stage: 1,
    densestFirst: true,
    // Any blade that reaches a blade of grass cuts it at once
    // (BackgroundObject.takeDamage), so one still standing after a swing was
    // missed, and swinging again from the same spot misses it again.
    oneSwing: true,
  },
  sand: {
    is: obj => obj.char === '.' && !!obj.data?.depletedColor,
    tool: item => item?.data?.weaponType === 'MELEE' && !item.data.isBlunt,
    stage: 2,
  },
};

/**
 * HarvestSystem — the CHOP, MINE, HARVEST and OPEN Spells: the player farms the
 * room's Trees (CHOP, with an axe) or Rocks (MINE, with the pickaxe or a
 * hammer; a Glittering Rock with the pickaxe alone), or both and the room's
 * Shrubs and Brambles with any melee weapon (HARVEST), until none are left
 * or the player's next letter, SPACE, Shift or Enter. OPEN walks to each of
 * the room's Barrels, Chests, Crates and Metal Boxes in turn and opens it by
 * hand, as SPACE does; HARVEST does that first. Once HARVEST has none of
 * those left it cuts
 * the room's grass with any blade, densest cell first (the most grass
 * objects in one cell), until every blade is cut, then scoops its Sand.
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
    // Materials this cast farms (MATERIALS keys).
    this.materials = [];
    this.target = null;
    // Target HP last seen, the player's closest approach to it, and seconds
    // since either last improved (TARGET_PATIENCE).
    this.targetHp = null;
    this.closest = Infinity;
    this.targetTimer = 0;
    // Objects given up on this cast.
    this.skipped = new Set();
    // The target the last swing went at (a `oneSwing` material's one try).
    this.swungAt = null;
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
    this.materials = Object.keys(MATERIALS)
      .filter(m => materials.includes(m) || materials.includes(MATERIALS[m].with))
      .filter(m => this._toolSlot(m) !== -1);
    if (!this._pickTarget()) {
      this.reset();
      return '...NOTHING.';
    }
    this.active = true;
    this.steering.resetProgress();
    return null;
  }

  /** A letter, SPACE, Shift or Enter after the cast hands control back (main.js keydown, takesBackSpellDrive). */
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
    this.swungAt = null;
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
    if (MATERIALS[material].byHand) {
      const stand = this._standCell(target);
      if (!stand || !this._onStand(stand)) return;
      player.facing.x = stand.faceX;
      player.facing.y = stand.faceY;
      game.interactionSystem.openContainer(target);
      return;
    }
    if (!MATERIALS[material].tool(held, target)) {
      const slot = this._toolSlot(material, target);
      if (slot === -1) { this.skipped.add(target); this.target = null; return; }
      game.handleSelectSlot(slot);
      return;
    }

    const stand = this._standCell(target);
    if (!stand || !this._onStand(stand)) return;
    player.facing.x = stand.faceX;
    player.facing.y = stand.faceY;
    if (!player.canAttack()) return;
    // Ready to swing: the held weapon is past its windup and recovery.
    const ready = held.canUse();
    // A `oneSwing` target that outlived the swing that went at it (that swing
    // is over by the time the weapon is ready again) is given up on.
    if (ready && MATERIALS[material].oneSwing && this.swungAt === target) {
      this.skipped.add(target);
      this.target = null;
      return;
    }
    game.combatSystem.tryUseHeldWeapon();
    // A swing was spent once the weapon is no longer ready (a windup counts:
    // its swing lands as the windup ends).
    if (ready && !player.heldItem?.canUse()) this.swungAt = target;
  }

  // The target this frame: the one being worked while it still stands,
  // otherwise a fresh pick.
  _currentTarget() {
    if (this.target && this._farmable(this.target)) return this.target;
    return this._pickTarget();
  }

  // A target from the earliest stage with anything left: the nearest,
  // preferring the material the held tool serves so HARVEST only swaps tools
  // when that material runs out; grass goes densest cell first.
  _pickTarget() {
    const held = this.game.player.heldItem;
    const all = this._candidates();
    const stage = Math.min(...all.map(o => MATERIALS[this._materialOf(o)].stage));
    const pool = all.filter(o => MATERIALS[this._materialOf(o)].stage === stage);
    let best = null;
    if (pool.some(o => MATERIALS[this._materialOf(o)].densestFirst)) {
      best = this._densest(pool);
    } else if (pool.length) {
      const served = pool.filter(o => MATERIALS[this._materialOf(o)].tool(held, o));
      best = this._nearest(served.length ? served : pool);
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
    const t = objectCenter(target);
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
      const c = objectCenter(obj);
      const d = Math.hypot(c.x - p.x, c.y - p.y);
      if (d < bestDist) { bestDist = d; best = obj; }
    }
    return best;
  }

  // The nearest object in the cell holding the most of them.
  _densest(objects) {
    const cells = new Map();
    for (const obj of objects) {
      const c = objectCenter(obj);
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
  // breaking, on the player's plane, of a material this cast farms, and with
  // a tool for it in the quick slots (a Glittering Rock wants the pickaxe
  // even when a hammer serves every other rock).
  _farmable(obj) {
    // A blow that broke it queues the destruction behind its animation
    // (destroyAfterAnimation): it is already done, not one to swing at again.
    if (obj.destroyed || obj.destroyAfterAnimation || this.skipped.has(obj)) return false;
    if (obj.typeId || obj.obsidian || obj.indestructible || obj.dropsNothing || obj.hp == null) return false;
    if (!objectOnPlane(obj, planeOf(this.game.player))) return false;
    const material = this._materialOf(obj);
    return material !== null && this.materials.includes(material) && this._toolSlot(material, obj) !== -1;
  }

  _materialOf(obj) {
    for (const [name, m] of Object.entries(MATERIALS)) if (m.is(obj)) return name;
    return null;
  }

  // The quick slot holding a tool for this material (the held slot first),
  // or -1 when none does. With `obj`, a tool for that object in particular.
  _toolSlot(material, obj) {
    const player = this.game.player;
    // Opened by hand: whatever is held (or nothing) will do.
    if (MATERIALS[material].byHand) return player.activeSlotIndex;
    const slots = player.quickSlots;
    const order = [player.activeSlotIndex, ...slots.keys()];
    const tool = MATERIALS[material].tool;
    return order.find(i => !player.destroyedSlots?.[i] && tool(slots[i], obj)) ?? -1;
  }

  // Whether the player stands on the stand cell (see STAND_PX).
  _onStand(stand) {
    const pos = this.game.player.position;
    return Math.hypot(pos.x - stand.x, pos.y - stand.y) <= STAND_PX;
  }

  // Where to stand beside the target (left, right, above, below), nearest
  // the player: a top-left and the straight facing from it to the target.
  // Null when the target is walled in on all sides.
  //
  // The spot lines the player's middle up with the target's, one cell back,
  // as a player lines a swing up by hand. Rocks, trees and grass are set off
  // the grid, and a swing reaches a fixed distance from the player: from the
  // cell beside the target's cell, a Rock pushed against the near side of its
  // cell sits inside the pickaxe's reach and one at the far side beyond the
  // hammer's. When that spot would put the player in a wall or a hazard, the
  // same spot squared to the target's row (column) comes next, and the cell
  // beside the target's cell last.
  _standCell(target) {
    const game = this.game;
    const player = game.player;
    const map = player.collisionMap || game.activeRoom?.collisionMap || game.currentRoom?.collisionMap || null;
    const grid = buildTerrainGrid(game, player, map);
    const t = objectCenter(target);
    const col = Math.floor(t.x / CELL), row = Math.floor(t.y / CELL);
    const p = entityCenter(player);
    let best = null;
    let bestDist = Infinity;
    for (const [dc, dr] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const lined = { x: t.x - CELL / 2 + dc * CELL, y: t.y - CELL / 2 + dr * CELL };
      // The same distance out, squared to the target's row (or column) so
      // the body reaches into one fewer row (column) beside it.
      const squared = dc ? { x: lined.x, y: row * CELL } : { x: col * CELL, y: lined.y };
      const cell = { x: (col + dc) * CELL, y: (row + dr) * CELL };
      const spot = [lined, squared, cell].find(s => this._standable(grid, s, col, row));
      if (!spot) continue;
      const d = Math.hypot(spot.x + CELL / 2 - p.x, spot.y + CELL / 2 - p.y);
      if (d < bestDist) { bestDist = d; best = { x: spot.x, y: spot.y, faceX: -dc, faceY: -dr }; }
    }
    return best;
  }

  // Whether a player-sized body with this top-left touches only open ground.
  // The target's own cell doesn't count: what stands in it is the target,
  // and a body one cell back from the target's middle never touches it.
  // Nor is a spot in an exit's lane (see EXIT_LANE_CELLS) one to stand on.
  _standable(grid, spot, targetCol, targetRow) {
    if (inExitLane(spot)) return false;
    const c0 = Math.floor(spot.x / CELL), r0 = Math.floor(spot.y / CELL);
    const c1 = Math.floor((spot.x + CELL - 1) / CELL), r1 = Math.floor((spot.y + CELL - 1) / CELL);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        if (c === targetCol && r === targetRow) continue;
        const cost = cellCost(grid, c, r);
        if (cost === BLOCKED || cost === HAZARD) return false;
      }
    }
    return true;
  }
}
