// MistBattleSystem — Act 1 of the Mist Battle (the true ending): the player
// commands the three lost characters at once, as one Trine.
//
// Shape (see claudedocs/zone-cosmology.md, "The True Ending — the Mist Battle"):
// - Three real `Player` bodies. `game.player` is the Primary — a pointer, not a
//   fixed body — so every existing Primary-only path (throw/drop, consumables,
//   pickup, interactions, HUD) keeps working untouched. The other two bodies
//   are Flanks, owned here.
// - The Trine is a triangle whose apex (the Primary) points where the Primary
//   faces; Flanks hold the two back corners and copy the Primary's facing so
//   all three attack in one direction.
// - Each body carries its own character type and its own gear. The global
//   InventorySystem gear slots always mirror the Primary; a Flank's passive
//   armor/consumable stats are projected onto it by briefly loading its gear
//   (see _projectGear).
//
// Today this is reached only from the CheatMenu BOSSES entry (no win state, no
// Act 2, not yet wired to GrayZoneSystem's mist-out). `start()` takes the same
// descriptor shape GrayZoneSystem._finalizeMistOut writes to
// `game.graySnapshots`, so the real wiring can hand those in unchanged.
import { GRID, PHYSICS } from '../game/GameConfig.js';
import { Player } from '../entities/Player.js';
import { Item } from '../entities/Item.js';
import { ITEMS, ITEM_TYPES, WEAPON_TYPES, AFFINITY_POOLS } from '../data/items.js';
import { CHARACTER_TYPES } from '../data/characters.js';
import { PUZZLE_ROOM_TEMPLATES } from '../data/dungeonPuzzleTemplates.js';
import { steerToward } from './npcSteering.js';

const CELL = GRID.CELL_SIZE;
// Trine geometry, in cells, measured from the Primary along its facing.
const FLANK_BACK = 2;
const FLANK_SIDE = 1.5;
// Flanks run a little faster than the Primary so drift (and later, rolls)
// always closes back up; inside SETTLE_RADIUS they ease in proportionally
// instead of overshooting and jittering around the slot.
const FLANK_SPEED_MULT = 1.2;
const SETTLE_RADIUS = CELL;
const ARRIVE_EPSILON = 1.5;

// Weapon behavior that lives in Primary-bound systems (MagicSystem's mana
// meter, the bat-charge and flail-spin tickers in main.js, the charge-hammer
// lifecycle) can't run on a Flank. Every body draws from the same pools
// because Rotate can promote any body to Primary, so these stay out of all
// three loadouts.
function isTrineCapable(data) {
  if (data.weaponSubtype === 'bat' || data.weaponSubtype === 'flail') return false;
  if (data.chargeHammer || data.gemWand || data.batCharge || data.flailSpin) return false;
  if (data.manaCost) return false;
  return true;
}

// Utility = the weapon families the dungeon puzzle rooms teach on their
// pedestals (whip, boomerang, torch today). Derived from the templates rather
// than a hand-kept list so a new trial's weapon joins the pool automatically.
// A pedestal weapon expands to its whole family: a boomerang to every
// `boomerang` item, anything else to every item sharing its weaponSubtype.
function isUtilityWeapon(data, pedestalData) {
  return pedestalData.some(p =>
    (p.boomerang && data.boomerang) ||
    (p.weaponSubtype && p.weaponSubtype === data.weaponSubtype)
  );
}

function buildLoadoutPools() {
  const pedestalData = Object.values(PUZZLE_ROOM_TEMPLATES)
    .map(t => t.pedestal?.weaponChar && ITEMS[t.pedestal.weaponChar])
    .filter(Boolean);

  const pools = { melee: [], ranged: [], utility: [], armor: [], consumables: [] };
  for (const [char, data] of Object.entries(ITEMS)) {
    if (data.type !== ITEM_TYPES.WEAPON || !isTrineCapable(data)) continue;
    if (isUtilityWeapon(data, pedestalData)) pools.utility.push(char);
    else if (data.weaponType === WEAPON_TYPES.MELEE) pools.melee.push(char);
    else if (data.weaponType === WEAPON_TYPES.GUN || data.weaponType === WEAPON_TYPES.BOW) pools.ranged.push(char);
  }

  // Armor and consumables come from the drop pools — the gear a character
  // could actually have been carrying — not every authored entry.
  const armor = new Set();
  const consumables = new Set();
  for (const affinity of Object.values(AFFINITY_POOLS)) {
    for (const chars of Object.values(affinity.armor || {})) chars.forEach(c => armor.add(c));
    for (const chars of Object.values(affinity.consumables || {})) chars.forEach(c => consumables.add(c));
  }
  pools.armor = [...armor].filter(c => ITEMS[c]?.type === ITEM_TYPES.ARMOR);
  pools.consumables = [...consumables].filter(c => ITEMS[c]?.type === ITEM_TYPES.CONSUMABLE);
  return pools;
}

const pick = (list) => list[Math.floor(Math.random() * list.length)];

function shuffled(list) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export class MistBattleSystem {
  constructor(game) {
    this.game = game;
    this.pools = null; // built lazily on first start — ITEMS is static, so once is enough
    this.reset();
  }

  /** True while a Trine exists in the current room. */
  get active() {
    return this.members.length > 0;
  }

  // Room-scoped teardown (RESET_REGISTRY `mistBattleSystem.reset`): leaving the
  // arena ends the battle. Flank bodies are dropped from physics here; the
  // room-scope physicsSystem.clear also covers them, but a re-start inside the
  // same room (re-selecting the cheat entry) must not leave stale bodies.
  reset() {
    for (const member of this.members || []) {
      if (member.body !== this.game.player) this.game.physicsSystem?.removeEntity(member.body);
    }
    // Clockwise ring order. members[(primaryIndex + k) % 3] holds Trine slot k:
    // 0 = apex (Primary), 1 = back-right, 2 = back-left — clockwise when the
    // apex points up.
    this.members = [];
    this.primaryIndex = 0;
  }

  /**
   * Random lost-character snapshots for the test entry: three distinct
   * character types, each with 1 melee + 1 ranged + 1 utility weapon, one
   * armor and one consumable. Same shape as a `game.graySnapshots` entry.
   */
  rollTestSnapshots() {
    this.pools ??= buildLoadoutPools();
    const p = this.pools;
    return shuffled(Object.keys(CHARACTER_TYPES)).slice(0, 3).map(characterType => ({
      characterType,
      quickSlots: [pick(p.melee), pick(p.ranged), pick(p.utility)].map(char => ({ char })),
      armor: { char: pick(p.armor) },
      consumables: [{ char: pick(p.consumables) }],
    }));
  }

  /**
   * Build the Trine from three snapshots. The existing `game.player` becomes
   * the first member (and Primary) so its wiring (godMode, physics, collision
   * map) carries over; the other two are fresh Flank bodies standing on it —
   * they steer out to their corners, which keeps a spawn inside wall geometry
   * from ever trapping one.
   */
  start(snapshots = this.rollTestSnapshots()) {
    const game = this.game;
    this.reset();

    const primary = game.player;
    snapshots.slice(0, 3).forEach((snap, i) => {
      let body = primary;
      if (i > 0) {
        body = new Player(primary.position.x, primary.position.y);
        body.godMode = primary.godMode;
        body.setCollisionMap(primary.collisionMap);
        game.physicsSystem.addEntity(body);
      }
      game.characterSystem.applyCharacterTypeTo(body, snap.characterType);
      body.quickSlots = snap.quickSlots.map(s => (s ? this._makeItem(s.char, body) : null));
      body.activeSlotIndex = 0;
      body.destroyedSlots = [false, false, false];
      body.hp = body.maxHp;
      this.members.push({
        body,
        characterType: snap.characterType,
        gear: {
          armor: snap.armor ? this._makeItem(snap.armor.char, body) : null,
          consumables: (snap.consumables || []).map(c => (c ? this._makeItem(c.char, body) : null)),
          spent: (snap.consumables || []).map(() => false),
          cooldowns: (snap.consumables || []).map(() => 0),
        },
      });
    });

    this.primaryIndex = 0;
    game.activeCharacterType = this.members[0].characterType;
    for (const member of this.members) this._projectGear(member);
    this._loadGear(this.members[this.primaryIndex]);
    game.updateUI();
  }

  /**
   * A spawn cell for an apex-up Trine: the cell nearest the room center whose
   * whole footprint (apex row plus the rows behind it, FLANK_SIDE either side)
   * is free of walls and background objects. A canonical exit spawn alone
   * isn't enough — the south one sits two rows off the wall, exactly where the
   * back corners land. Returns top-left pixel coords, or null when no cell
   * fits (the caller keeps its own spawn).
   */
  findSpawnAnchor(room) {
    const map = room.collisionMap;
    if (!map) return null;
    const rows = map.length;
    const cols = map[0]?.length ?? 0;
    const occupied = new Set();
    for (const obj of room.backgroundObjects || []) {
      occupied.add(`${Math.floor(obj.position.x / CELL)},${Math.floor(obj.position.y / CELL)}`);
    }
    const halfWidth = Math.ceil(FLANK_SIDE);
    const clear = (c, r) => {
      for (let row = r - 1; row <= r + FLANK_BACK + 1; row++) {
        for (let col = c - halfWidth; col <= c + halfWidth; col++) {
          if (row < 0 || row >= rows || col < 0 || col >= cols) return false;
          if (map[row][col] || occupied.has(`${col},${row}`)) return false;
        }
      }
      return true;
    };
    const centerCol = Math.floor(cols / 2);
    const centerRow = Math.floor(rows / 2);
    const maxRing = Math.max(rows, cols);
    for (let ring = 0; ring < maxRing; ring++) {
      for (let dr = -ring; dr <= ring; dr++) {
        for (let dc = -ring; dc <= ring; dc++) {
          if (Math.max(Math.abs(dr), Math.abs(dc)) !== ring) continue;
          const c = centerCol + dc;
          const r = centerRow + dr;
          if (clear(c, r)) return { x: c * CELL, y: r * CELL };
        }
      }
    }
    return null;
  }

  _makeItem(char, body) {
    return new Item(char, body.position.x, body.position.y);
  }

  /** The member whose body is `game.player`. */
  get primary() {
    return this.members[this.primaryIndex] ?? null;
  }

  /** Every living non-Primary member, in ring order. */
  flanks() {
    const out = [];
    for (let k = 1; k < this.members.length; k++) {
      const member = this.members[(this.primaryIndex + k) % this.members.length];
      if (member.body.hp > 0) out.push(member);
    }
    return out;
  }

  // Put a member's gear into the global InventorySystem slots. Those slots are
  // the Primary's by contract (HUD, SPACE-armed consumables, death saves all
  // read them), so this is only ever left loaded for the Primary.
  _loadGear(member) {
    const inv = this.game.inventorySystem;
    const slots = inv.maxConsumableSlots;
    const fit = (list, fill) => Array.from({ length: slots }, (_, i) => list[i] ?? fill);
    inv.equippedArmor = member.gear.armor;
    inv.equippedConsumables = fit(member.gear.consumables, null);
    inv.spentConsumableSlots = fit(member.gear.spent, false);
    inv.consumableCooldowns = fit(member.gear.cooldowns, 0);
    inv.applyEquipmentEffectsToPlayer(member.body);
  }

  // Project a Flank's passive gear stats (defense, resists, passives) onto its
  // body by loading its gear through the one sanctioned path,
  // EquipmentEffectsSystem.apply, then putting the Primary's gear back.
  _projectGear(member) {
    this._loadGear(member);
    const primary = this.primary;
    if (primary && primary !== member) this._loadGear(primary);
  }

  /** Trine slot k's target position (top-left of the body), relative to the Primary. */
  _slotPosition(k) {
    const lead = this.game.player;
    const fx = lead.facing.x;
    const fy = lead.facing.y;
    const len = Math.hypot(fx, fy) || 1;
    const nx = fx / len;
    const ny = fy / len;
    if (k === 0) return { x: lead.position.x, y: lead.position.y };
    // Right of facing is (-ny, nx); slot 1 = back-right, slot 2 = back-left.
    const side = k === 1 ? 1 : -1;
    return {
      x: lead.position.x - nx * FLANK_BACK * CELL + -ny * side * FLANK_SIDE * CELL,
      y: lead.position.y - ny * FLANK_BACK * CELL + nx * side * FLANK_SIDE * CELL,
    };
  }

  // rest-parity: absent because the Mist Battle only exists in its EXPLORE arena.
  update(deltaTime) {
    if (!this.active) return;
    const game = this.game;
    const lead = game.player;
    const flankSpeed = PHYSICS.PLAYER_SPEED * FLANK_SPEED_MULT;

    for (let k = 1; k < this.members.length; k++) {
      const body = this.members[(this.primaryIndex + k) % this.members.length].body;
      if (body.hp <= 0) continue;
      body.update(deltaTime);
      body.facing.x = lead.facing.x;
      body.facing.y = lead.facing.y;
      if (body.dodgeRoll.active) continue; // the roll owns velocity; drift back afterward

      const slot = this._slotPosition(k);
      const dist = Math.hypot(slot.x - body.position.x, slot.y - body.position.y);
      if (dist < ARRIVE_EPSILON) {
        body.velocity.vx = 0;
        body.velocity.vy = 0;
        continue;
      }
      const speed = dist < SETTLE_RADIUS ? flankSpeed * (dist / SETTLE_RADIUS) : flankSpeed;
      steerToward(game, body, slot.x, slot.y, speed);
    }
  }
}
