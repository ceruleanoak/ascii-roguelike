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
// - Flanks mirror the Primary: same attack press (each with its own weapon),
//   same slot on 1/2/3, and a roll in the same direction with their own
//   character's roll type.
// - Rotate (double-tap SPACE) turns the Trine clockwise: `game.player` is
//   repointed at the back-left body and the gear slots swap with it.
// - Enemies target and hit Flanks too (resolveCombat). A fallen Primary hands
//   off to a living Flank; only the last body's death ends the run.
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
import { tryDeathSave } from './DeathSaveSystem.js';
import { attackHitsBox, isSweptStrike } from '../game/Telegraph.js';
import { inSamePlane } from './PlaneSystem.js';
import { createExplosion } from '../entities/Particle.js';
import { DEATH_CAUSES } from '../data/deathCauses.js';

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
// How long each body's newly held weapon glyph shows above it after a 1/2/3
// swap (seconds).
const SWAP_FLASH_TIME = 0.6;
// Two SPACE presses within this many seconds are a Rotate, not two attacks.
const ROTATE_DOUBLE_TAP = 0.25;
// After a Rotate the new Primary glides up into the old apex position over
// this many seconds, so the triangle turns in place instead of the whole
// Trine stepping back a corner with every Rotate.
const ROTATE_GLIDE_TIME = 0.2;
// Arena waves: when fewer than WAVE_FLOOR enemies remain, WAVE_SIZE more
// arrive after WAVE_DELAY seconds — the fight never runs dry (no win state yet).
const WAVE_FLOOR = 3;
const WAVE_SIZE = 4;
const WAVE_DELAY = 1.5;

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
    // Last frame's Primary roll state, for the mirrored-dodge edge (_mirrorDodge).
    this.leadRollCooldown = 0;
    this.leadSliding = false;
    // Game-time clock for the double-tap window (deterministic, pauses with the game).
    this.clock = 0;
    this.lastSpacePress = -Infinity;
    this.glide = null; // { x, y, timer } — the new Primary's run to the old apex
    this.waveTimer = 0;
    // Enemy melee attack → Set of Flank bodies it is done with. CombatSystem
    // marks a still attack `hasHit` after its one Primary test frame, so the
    // Flanks keep their own record instead of reading that flag.
    this.meleeResolved = new WeakMap();
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
        swapFlash: 0,
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

  // ── Mirrored attacks ──────────────────────────────────────────────────
  // Flanks fire with the Primary, Galaga-style: the same press, the same
  // facing, each with its own held weapon. A Flank's weapon runs the carrier
  // pattern (CampNPCSystem._tryAttack): `use(body)` / `releaseBow()` build the
  // attack from that body's position, and CombatSystem resolves it. The
  // Primary-only damage modifier (shrines, Frog Coin, training — all read
  // `game.player`) is deliberately not applied to Flank attacks.

  _fire(attack) {
    if (attack) this.game.combatSystem.createAttack(attack, this.game._activeEnemies());
  }

  /** SPACE press, right after the Primary's attack (main.js handleSpacePress). */
  onAttackPress() {
    if (!this.active) return;
    for (const { body } of this.flanks()) {
      if (body.heldItem && body.canAttack()) this._fire(body.useHeldItem());
    }
  }

  /** SPACE release: loose every charged Flank bow (mirrors handleSpaceRelease). */
  onAttackRelease() {
    if (!this.active) return;
    for (const { body } of this.flanks()) {
      if (body.heldItem?.isCharging && body.canAttack()) this._fire(body.heldItem.releaseBow());
    }
  }

  // Held-SPACE repeat for guns and melee, the per-Flank shape of
  // CharacterSystem.handleAutoAttack (charge weapons fire on release instead).
  _autoAttack(body) {
    const game = this.game;
    const weapon = body.heldItem;
    if (!game.keys.space || !game.attackSequenceActive || !weapon) return;
    const type = weapon.data.weaponType;
    if (type === WEAPON_TYPES.BOW || type === 'WAND' || type === 'UTILITY') return;
    // Held SPACE simply resumes once a Flank's roll ends — no roll-queued shot.
    if (!body.dodgeRoll.active && body.canAttack()) this._fire(body.useHeldItem());
  }

  // A Flank's held weapon ticks here, at the same WEAPON_TIMER_RATE as the
  // Primary's (main.js updatePlayerMechanics); a completed windup lands here.
  _tickWeapon(body, deltaTime) {
    const weapon = body.heldItem;
    if (!weapon?.update) return;
    const windupAttack = weapon.update(deltaTime * PHYSICS.WEAPON_TIMER_RATE);
    if (windupAttack) {
      this.game.playWeaponAttackSFX(weapon);
      this._fire(windupAttack);
    }
  }

  /**
   * 1/2/3 select the slot on every body at once, and each body flashes its
   * newly held weapon above it so the three loadouts read at a glance.
   * Called after main.js has switched the Primary's slot.
   */
  onSelectSlot(index) {
    if (!this.active) return;
    for (const member of this.members) {
      const body = member.body;
      if (body.hp <= 0) continue;
      if (body !== this.game.player && !body.destroyedSlots?.[index]) {
        if (index !== body.activeSlotIndex) body.heldItem?.cancelChargeAndReload?.();
        body.activeSlotIndex = index;
      }
      member.swapFlash = SWAP_FLASH_TIME;
    }
  }

  // ── Rotate ────────────────────────────────────────────────────────────
  // Double-tap SPACE turns the Trine clockwise one slot: the back-left Flank
  // becomes the Primary at the apex, the old Primary drops to back-right. The
  // first tap of the pair attacks as usual; the second rotates instead.

  /**
   * Called on every EXPLORE SPACE press before the attack. Returns true when
   * the press completed a double-tap and Rotated (the press is consumed).
   */
  tryRotate() {
    if (!this.active) return false;
    if (this.clock - this.lastSpacePress > ROTATE_DOUBLE_TAP) {
      this.lastSpacePress = this.clock;
      return false;
    }
    this.lastSpacePress = -Infinity; // a third tap starts a fresh pair
    return this.rotate();
  }

  /** Promote the next living member clockwise (back-left first) to Primary. */
  rotate() {
    const n = this.members.length;
    let next = -1;
    for (let k = n - 1; k >= 1; k--) { // back-left (n-1) before back-right
      const idx = (this.primaryIndex + k) % n;
      if (this.members[idx].body.hp > 0) { next = idx; break; }
    }
    if (next < 0) return false;
    this._promote(next);
    return true;
  }

  _promote(index) {
    const game = this.game;
    const outgoing = this.primary;
    this._stashGear(outgoing);
    // The outgoing body stops answering input; formation steering takes over.
    outgoing.body.acceleration.ax = 0;
    outgoing.body.acceleration.ay = 0;
    outgoing.body.heldItem?.cancelChargeAndReload?.();

    this.glide = { x: outgoing.body.position.x, y: outgoing.body.position.y, timer: ROTATE_GLIDE_TIME };
    this.primaryIndex = index;
    const incoming = this.primary;
    // Keep the Trine's heading: the new apex faces where the old one did.
    incoming.body.facing.x = outgoing.body.facing.x;
    incoming.body.facing.y = outgoing.body.facing.y;
    game.player = incoming.body;
    game.activeCharacterType = incoming.characterType;
    this._loadGear(incoming);
    this.leadRollCooldown = incoming.body.dodgeRoll.cooldownTimer;
    this.leadSliding = incoming.body.continuousRollActive;
    game.updateUI();
  }

  // Copy the global gear slots (the Primary's live gear — consumables may
  // have been spent or cooled down since they were loaded) back onto the member.
  _stashGear(member) {
    const inv = this.game.inventorySystem;
    member.gear.armor = inv.equippedArmor;
    member.gear.consumables = [...inv.equippedConsumables];
    member.gear.spent = [...inv.spentConsumableSlots];
    member.gear.cooldowns = [...inv.consumableCooldowns];
  }

  _updateGlide(deltaTime, minSpeed) {
    const glide = this.glide;
    if (!glide) return;
    const body = this.game.player;
    glide.timer -= deltaTime;
    const dist = Math.hypot(glide.x - body.position.x, glide.y - body.position.y);
    if (body.dodgeRoll.active) {
      this.glide = null; // a roll takes over the body
      return;
    }
    if (glide.timer <= 0 || dist < ARRIVE_EPSILON) {
      // Stop on the mark — the glide's speed would otherwise coast past it.
      body.velocity.vx = 0;
      body.velocity.vy = 0;
      this.glide = null;
      return;
    }
    steerToward(this.game, body, glide.x, glide.y, Math.max(minSpeed, dist / glide.timer));
  }

  // ── Mirrored dodge ────────────────────────────────────────────────────
  // When the Primary rolls, every Flank rolls the same way with its OWN
  // character's roll (hide, blink, damage, sprint...). Detected as an edge on
  // the Primary's state rather than hooked into CharacterSystem.updateDodge,
  // so every way a roll starts is covered: a standard roll re-arms
  // dodgeRoll.cooldownTimer (blink included — it is instant, so `active`
  // alone can miss it), and Green Ranger's continuous slide raises
  // continuousRollActive instead.
  _mirrorDodge() {
    const lead = this.game.player;
    const rolled = lead.dodgeRoll.cooldownTimer > this.leadRollCooldown;
    const slid = lead.continuousRollActive && !this.leadSliding;
    this.leadRollCooldown = lead.dodgeRoll.cooldownTimer;
    this.leadSliding = lead.continuousRollActive;

    let direction = null;
    if (rolled) direction = lead.dodgeRoll.direction;
    else if (slid) direction = this._unit(lead.velocity.vx, lead.velocity.vy) ?? lead.facing;
    if (direction) {
      const enemies = this.game._activeEnemies();
      for (const { body } of this.flanks()) {
        if (body.dodgeRoll.active) continue;
        if (!body.startDodgeRoll({ x: direction.x, y: direction.y }, enemies)) continue;
        if (body.pendingBlink) {
          this.game.warpSystem.resolveBlinkTeleport(body.pendingBlink, body);
          body.pendingBlink = null;
        }
      }
    }

    // A roll curves with held input (CharacterSystem.updateDodge); Flanks
    // curve with the Primary's so the Trine keeps its shape mid-roll.
    if (lead.dodgeRoll.active) {
      for (const { body } of this.flanks()) {
        if (body.dodgeRoll.active) body.dodgeRoll.direction = lead.dodgeRoll.direction;
      }
    }
  }

  _unit(x, y) {
    const len = Math.hypot(x, y);
    return len > 0 ? { x: x / len, y: y / len } : null;
  }

  // ── Combat against the Trine ──────────────────────────────────────────
  // CombatSystem resolves enemy attacks against `game.player` only; this
  // resolves them against the Flanks, the same poll-after-combat shape as
  // CompanionSystem.applyEnemyDamageToTamedRats. Damage goes through
  // Player.takeDamage, so each Flank's own armor, i-frames and roll apply.

  /**
   * Called from main.js right after CombatSystem.update, before the death
   * check. Returns true when the Primary fell and the Trine caught it (a death
   * save fired or a living Flank was promoted) — main.js must then skip its
   * death path this frame.
   */
  resolveCombat() {
    if (!this.active) return false;
    this._applyEnemyDamageToFlanks();
    return this._catchPrimaryDeath();
  }

  _applyEnemyDamageToFlanks() {
    const cs = this.game.combatSystem;
    const projectiles = cs.enemyProjectiles || [];
    const melee = cs.enemyMeleeAttacks || [];
    for (const member of this.flanks()) {
      const body = member.body;
      for (let i = projectiles.length - 1; i >= 0; i--) {
        const proj = projectiles[i];
        if (proj.reflected || !inSamePlane(proj, body)) continue;
        if (!cs.checkProjectileCollisionWithPlayer(proj, body)) continue;
        const result = body.takeDamage(proj.damage, { isBullet: true, element: proj.onHit, attacker: proj.owner });
        if (result === false) continue; // i-frames: the shot passes through
        projectiles.splice(i, 1);
        this._reportHit(body, result, proj.damage, proj.position, proj.knockbackForce || PHYSICS.DEFAULT_DAMAGE_KNOCKBACK);
      }
      for (const attack of melee) {
        if (attack.windupPhase || attack.isCharmedAttack) continue;
        if ((attack.shooterPlane ?? 0) !== 0) continue;
        let resolved = this.meleeResolved.get(attack);
        if (resolved?.has(body)) continue;
        const connected = attackHitsBox(attack, body.getHitbox(), () => cs.checkMeleeCollisionWithPlayer(attack, body));
        // A still attack gets one test per Flank; a travelling strike keeps
        // testing until it connects (Telegraph.retireAfterTest's rule).
        if (connected || !isSweptStrike(attack)) {
          if (!resolved) this.meleeResolved.set(attack, resolved = new Set());
          resolved.add(body);
        }
        if (!connected) continue;
        const result = body.takeDamage(attack.damage, { isBullet: false, isMelee: true, element: attack.onHit, attacker: attack.owner });
        if (result === false) continue;
        this._reportHit(body, result, attack.damage, attack.position, attack.knockback);
      }
      if (body.hp <= 0) this._fall(member);
    }
  }

  // Damage number + knockback for a landed hit, matching CombatSystem's
  // player-hit reporting (dodge/block/immune words, else the damage taken).
  _reportHit(body, result, damage, from, knockbackForce) {
    const cs = this.game.combatSystem;
    const { x, y } = body.position;
    if (result?.dodged) cs.createDamageNumber(result.lucky ? 'LUCKY DODGE' : 'DODGE', x, y, result.lucky ? '#ffff66' : '#ffff00');
    else if (result?.blocked) cs.createDamageNumber(result.guard ?? 'BLOCK', x, y, '#aaaaaa');
    else if (result?.immune) cs.createDamageNumber('IMMUNE', x, y, '#00ffff');
    else {
      cs.createDamageNumber(result?.actualDamage ?? damage, x, y, body.color);
      if (knockbackForce) this.game.physicsSystem.applyKnockback(body, from.x, from.y, knockbackForce);
    }
  }

  // The Primary is down. With a Flank still standing the Trine doesn't end:
  // an equipped death save gets its normal chance first, then the fallen
  // Primary leaves and the next living body is promoted. The last body
  // standing dies through main.js's normal path.
  _catchPrimaryDeath() {
    const primary = this.primary;
    if (!primary || primary.body.hp > 0 || this.flanks().length === 0) return false;
    if (tryDeathSave(this.game)) return true;
    this.rotate();
    this._fall(primary);
    this.glide = null; // the new Primary holds its ground; the apex is empty
    return true;
  }

  // A member leaves the fight: burst, out of physics, out of every roster
  // (flanks(), rotate() and the draw all skip hp <= 0).
  _fall(member) {
    const game = this.game;
    const body = member.body;
    body.hp = 0;
    body.velocity.vx = 0;
    body.velocity.vy = 0;
    body.heldItem?.cancelChargeAndReload?.();
    game.physicsSystem.removeEntity(body);
    const burst = createExplosion(body.position.x + CELL / 2, body.position.y + CELL / 2, 20, body.color);
    game.particles.push(...burst);
    for (const particle of burst) game.physicsSystem.addEntity(particle);
  }

  // Keep the arena fed: mixed gray-zone enemies, topped up through the
  // Quagmire's live wave spawner.
  _updateWaves(deltaTime) {
    const room = this.game.currentRoom;
    if (!room || room.enemies.length >= WAVE_FLOOR) {
      this.waveTimer = WAVE_DELAY;
      return;
    }
    this.waveTimer -= deltaTime;
    if (this.waveTimer > 0) return;
    this.waveTimer = WAVE_DELAY;
    this.game.roundCombatSystem.spawnWave(room, WAVE_SIZE);
  }

  // Burn/poison ticks a Flank's own Player.update reports (the Primary's go
  // through StatusEffectSystem.applyPlayerDot, which is game.player-bound).
  _applyDot(member, tick) {
    if (!tick) return;
    const body = member.body;
    if (tick.burnDamage) body.takeDamage(tick.burnDamage, { isBullet: false, element: 'burn', cause: DEATH_CAUSES.burn });
    if (tick.poisonDamage) body.takeDamage(tick.poisonDamage, { isBullet: false, element: 'poison', cause: DEATH_CAUSES.poison });
    if (body.hp <= 0) this._fall(member);
  }

  // rest-parity: absent because the Mist Battle only exists in its EXPLORE arena.
  update(deltaTime) {
    if (!this.active) return;
    const game = this.game;
    const lead = game.player;
    const flankSpeed = PHYSICS.PLAYER_SPEED * FLANK_SPEED_MULT;
    this.clock += deltaTime;

    for (const member of this.members) {
      if (member.swapFlash > 0) member.swapFlash = Math.max(0, member.swapFlash - deltaTime);
    }
    this._mirrorDodge();
    this._updateGlide(deltaTime, flankSpeed);

    this._updateWaves(deltaTime);

    for (let k = 1; k < this.members.length; k++) {
      const member = this.members[(this.primaryIndex + k) % this.members.length];
      const body = member.body;
      if (body.hp <= 0) continue;
      this._applyDot(member, body.update(deltaTime));
      if (body.hp <= 0) continue;
      body.facing.x = lead.facing.x;
      body.facing.y = lead.facing.y;
      this._tickWeapon(body, deltaTime);
      this._autoAttack(body);
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
