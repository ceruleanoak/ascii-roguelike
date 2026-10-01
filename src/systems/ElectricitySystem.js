/**
 * ElectricitySystem — fixed-rate electric cascade through connected water
 * and slime trail.
 *
 * Any electric source touching water seeds a cascade here. The charge then
 * spreads ring-by-ring across 4-adjacent water tiles at SPREAD_INTERVAL per
 * ring, electrifying each tile for TILE_DURATION. The result is a visible
 * wavefront racing down a river with a glowing tail that decays behind it —
 * readable, dodgeable (step out of the channel before the front arrives),
 * and consistent across every source.
 *
 * Slime trails conduct too: a 'slimeTrail' Puddle (Puddle.CONDUCTIVE_TYPES)
 * is a conductor node in the same cascade. Slime trail stamps are sub-cell
 * squares at pixel positions, so they link to each other by distance
 * (SLIME_LINK_REACH — about a cell, the slime analogue of water's 4-adjacent
 * cell) and to any water tile they overlap. One cascade therefore runs river →
 * slime trail → river under the same spread rate, charge decay and imbued
 * current as water, except a charged slime stamp stays live until it expires
 * (no tile duration). An electrified slime stamp blinks like electrified water
 * (Puddle._updateElectrified) and shocks whoever stands on it through the same
 * shockEntity contact rule (_shockOnElectrifiedSlime).
 *
 * Sources (all routed through seed*):
 *   - Lightning strikes (LightningStrikeSystem → seedNear at impact point)
 *   - Shock weapons hitting water (CombatSystem → seedFromObject; replaced
 *     the old instant _electrifyFloodFillWater)
 *   - Electric-affinity enemies in contact with water or slime trail (ambient
 *     scan below — Sparks drifting over a river, Volt Spiders wading, etc.)
 *   - Stingray Mantle wearer swimming (ambient scan; wearer is shock-immune)
 *   - Zapped enemies and a zapped player (ambient scan — see "Imbued current" below)
 *
 * Counterplay / conduction rules:
 *   - Only 'normal' water conducts. Frozen / poisoned / crystallized tiles
 *     BLOCK the spread — a freeze-line across a river is a firebreak.
 *   - Seeding a tile (or slime stamp) that is already electrified is a no-op,
 *     so continuous sources (a hovering Spark) re-trigger only after the local
 *     tail decays.
 *
 * Per-tile effects (zap + damage on entities standing in electrified water)
 * are unchanged — they live in PhysicsSystem.applyLiquidResults; this system
 * decides WHEN each tile becomes electrified, and owns slime contact itself
 * (slime trail is not a liquid in the physics pass).
 *
 * isLiveAt(x, y, plane) is the "is there live current here?" query other
 * systems ask (TrapSystem's electric trigger): electrified water, electrified
 * slime trail, or a charged object such as the Ascent's lightning rod spire.
 *
 * Imbued current: zap charges the body it lands on, enemy or player. A zapped
 * body at pip N is itself a live source one pip weaker — it electrifies water
 * or slime trail it stands in and shocks whatever touches it, at pip N-1 — so
 * current weakens as it passes through a crowd, and a pip-1 enemy passes
 * nothing on. The source is never shocked by its own current, and imbued
 * current only lands on a body not already zapped — once zapped, a body can't
 * be zapped again until its pips drain (GLOSSARY: Zap), so it can't pass
 * current back and forth.
 */

import { DEATH_CAUSES } from '../data/deathCauses.js';
import { GRID } from '../game/GameConfig.js';
import { Puddle } from '../entities/Puddle.js';
import { MAX_PIPS } from './StatusEffects.js';
import { inSamePlane, planeOf, isInteriorActive } from './PlaneSystem.js';
import { absorbsZap } from './ImbuePoolSystem.js';

const SPREAD_INTERVAL = 0.08; // seconds per ring (~12.5 tiles/sec down a channel)
const TILE_DURATION = 2.5;    // seconds a tile stays electrified after the front passes
const SCAN_INTERVAL = 0.25;   // ambient electric-source contact scan cadence
const MAX_RING_PARTICLES = 4; // spark particles spawned per ring advance (visual cap)
const CHARGE_DECAY_PER_RING = 2; // charge diminished per ring expansion; spread stops at ≤0
const IMBUED_CONTACT_RANGE = GRID.CELL_SIZE * 0.8; // touching a zapped enemy
// Two slime trail stamps conduct to each other when their centers are within
// this (Chebyshev) reach — about one cell, the slime analogue of water's
// 4-adjacent neighbour. Consecutive stamps along a trail sit a few px apart,
// and the Slime Bomb's stamp ring sits ~17px apart, so both read as one pool.
const SLIME_LINK_REACH = GRID.CELL_SIZE * 1.25;
// A charged object (lightning rod spire, charged metal) counts as touching a
// point within this range — the same reach as touching a zapped body.
const CHARGED_CONTACT_RANGE = GRID.CELL_SIZE * 0.8;

const PARTICLE_CHARS = ['·', '`', "'", '.'];
const PARTICLE_COLORS = ['#ffff88', '#ffffff', '#cccc00'];

export class ElectricitySystem {
  constructor(game) {
    this.game = game;
    // { room, waterMap, slimeGrid, plane, visited, frontier, timer, interval,
    //   tileDuration, charge, current, hutPlane }
    this.cascades = [];
    this.scanTimer = 0;
  }

  reset() {
    this.cascades = [];
    this.scanTimer = 0;
  }

  // ── Seeding ──────────────────────────────────────────────────────────────

  /**
   * Seed electricity from a weapon hitting water. Routes to seedFromObject
   * with the weapon's electricityCharge value for cascade range control.
   */
  seedFromWeapon(obj, backgroundObjects, weapon, opts = {}) {
    return this.seedFromObject(obj, backgroundObjects, {
      ...opts,
      initialCharge: weapon?.electricityCharge
    });
  }

  /**
   * Seed electricity from a player effect (e.g., Stingray Mantle wake).
   * Uses provided charge value, defaults to armor's electricityCharge or 10.
   */
  seedFromArmor(obj, backgroundObjects, armor, opts = {}) {
    return this.seedFromObject(obj, backgroundObjects, {
      ...opts,
      initialCharge: armor?.electricityCharge ?? 10
    });
  }

  /**
   * Start a cascade from a specific water tile. `backgroundObjects` is the
   * array the tile lives in (surface room or interior floor) — the cascade
   * conducts only through tiles of that same array (and the slime trail of
   * the same layer).
   * Returns true if a cascade started.
   */
  seedFromObject(obj, backgroundObjects, opts = {}) {
    if (!obj || obj.destroyed || !obj.isWater?.()) return false;
    // Already-charged tile: the local tail hasn't decayed — no re-trigger.
    if (obj.waterState === 'electrified') return false;
    // Non-normal water (frozen/poisoned/crystallized) doesn't conduct.
    if (obj.waterState !== 'normal') return false;
    return this._startCascade(obj, backgroundObjects, planeOf(obj), opts);
  }

  /**
   * Start a cascade from a conductive puddle (a slime trail stamp). The
   * cascade conducts through the active layer's water too, so charge put into
   * a slime trail that runs into a river carries on down the river.
   * Returns true if a cascade started.
   */
  seedFromPuddle(puddle, opts = {}) {
    if (!puddle || puddle.expired || !puddle.isConductive?.()) return false;
    // Already-charged stamp: slime charge is permanent — no re-trigger.
    if (puddle.isElectrified()) return false;
    const bg = this.game._activeBackgroundObjects?.() ?? [];
    return this._startCascade(puddle, bg, puddle.plane ?? 0, { ...opts, hutPlane: !!puddle.hutPlane });
  }

  /** Seed at a pixel coordinate if it lands on a water tile of the active layer. */
  seedAt(x, y, opts = {}) {
    // Active-layer accessor, same as seedNear (#281, [layer-leak]) — a zapped
    // enemy wading in a dungeon pool charges that pool, not the surface.
    const bg = this.game._activeBackgroundObjects?.();
    if (!bg) return false;
    const cx = Math.floor(x / GRID.CELL_SIZE);
    const cy = Math.floor(y / GRID.CELL_SIZE);
    for (const obj of bg) {
      if (obj.destroyed || !obj.isWater?.()) continue;
      if (Math.floor(obj.position.x / GRID.CELL_SIZE) === cx &&
          Math.floor(obj.position.y / GRID.CELL_SIZE) === cy) {
        return this.seedFromObject(obj, bg, opts);
      }
    }
    return false;
  }

  /**
   * Seed the nearest conductor — water tile or slime trail stamp — within
   * `radius` px of (x, y) (lightning impacts).
   */
  seedNear(x, y, radius, opts = {}) {
    // Active-layer accessor — currentRoom.backgroundObjects is frozen/empty
    // while a hut/dungeon/maze interior is active (#281, [layer-leak]).
    const bg = this.game._activeBackgroundObjects?.();
    if (!bg) return false;
    let best = null;
    let bestD = radius * radius;
    for (const obj of bg) {
      if (obj.destroyed || !obj.isWater?.()) continue;
      const ox = obj.position.x + GRID.CELL_SIZE / 2;
      const oy = obj.position.y + GRID.CELL_SIZE / 2;
      const d = (ox - x) * (ox - x) + (oy - y) * (oy - y);
      if (d <= bestD) { bestD = d; best = obj; }
    }
    const plane = opts.plane ?? 0;
    for (const p of this._activeConductivePuddles()) {
      if ((p.plane ?? 0) !== plane) continue;
      const d = (p.position.x - x) * (p.position.x - x) + (p.position.y - y) * (p.position.y - y);
      if (d <= bestD) { bestD = d; best = p; }
    }
    if (!best) return false;
    return best.isWater?.() ? this.seedFromObject(best, bg, opts) : this.seedFromPuddle(best, opts);
  }

  /**
   * Seed whatever conductor a body is standing in: the water tile under it,
   * and the slime trail stamp under it. Used by every ambient body source
   * (electric-affinity enemies, zapped carriers).
   */
  seedUnderBody(body, opts = {}) {
    if (body._isOnWater?.() || body.inLiquid) {
      this.seedAt(body.position.x + GRID.CELL_SIZE / 2, body.position.y + GRID.CELL_SIZE / 2, opts);
    }
    const bodyPlane = planeOf(body);
    for (const p of this._activeConductivePuddles()) {
      if ((p.plane ?? 0) !== bodyPlane || !p.isEntityOnPuddle(body)) continue;
      this.seedFromPuddle(p, opts);
      return;
    }
  }

  // Shared cascade start for every seed kind. `seed` is a water tile or a
  // conductive puddle; the conductor graph (water map + slime grid) is
  // snapshotted from the seed's layer and plane at seed time.
  _startCascade(seed, backgroundObjects, plane, opts) {
    const hutPlane = opts.hutPlane ?? isInteriorActive(this.game);
    const tileDuration = opts.tileDuration ?? TILE_DURATION;
    const initialCharge = opts.initialCharge ?? Infinity; // unlimited range if not specified
    const current = opts.current ?? null;

    this._electrifyNode(seed, tileDuration, current);
    this._emitSparks([seed], hutPlane);
    this.game.audioSystem?.playSFX?.('water_zap'); // silently no-ops until a buffer is loaded

    this.cascades.push({
      room: this.game.currentRoom, // cascade lifetime is bound to its room
      waterMap: this._buildWaterMap(backgroundObjects),
      slimeGrid: this._buildSlimeGrid(hutPlane, plane),
      plane,
      visited: new Set([seed]),
      frontier: [seed],
      timer: opts.interval ?? SPREAD_INTERVAL,
      interval: opts.interval ?? SPREAD_INTERVAL,
      tileDuration,
      charge: initialCharge,
      current,
      hutPlane
    });
    return true;
  }

  // ── Queries ──────────────────────────────────────────────────────────────

  /**
   * Is there live current at the point (x, y) on `plane` in the active layer?
   * The query every "touched by electricity" consumer asks (TrapSystem's
   * electric trigger): an electrified water tile covering the point, an
   * electrified slime trail stamp within `reach` of it, or a charged object
   * (the yellow Ascent's lightning rod spire, charged metal grating, a charged
   * weapon knocked to the ground) in contact range.
   */
  isLiveAt(x, y, plane = 0, reach = GRID.CELL_SIZE / 4) {
    const C = GRID.CELL_SIZE;
    const bg = this.game._activeBackgroundObjects?.() ?? [];
    for (const obj of bg) {
      if (obj.destroyed || planeOf(obj) !== plane) continue;
      const ox = obj.position.x + C / 2;
      const oy = obj.position.y + C / 2;
      if (obj.isWater?.() && obj.waterState === 'electrified') {
        if (Math.abs(ox - x) <= C / 2 && Math.abs(oy - y) <= C / 2) return true;
      } else if (obj.charged && Math.hypot(ox - x, oy - y) <= CHARGED_CONTACT_RANGE) {
        return true;
      }
    }
    // Charged ground items live on the storm record, not in the background list.
    for (const item of this.game.currentRoom?.ascentStorm?.chargedObjects ?? []) {
      if (!item.charged || bg.includes(item)) continue;
      const ix = item.position.x + C / 2;
      const iy = item.position.y + C / 2;
      if (Math.hypot(ix - x, iy - y) <= CHARGED_CONTACT_RANGE) return true;
    }
    for (const p of this._activeConductivePuddles()) {
      if (!p.isElectrified() || (p.plane ?? 0) !== plane) continue;
      if (Math.abs(p.position.x - x) <= p.radius + reach &&
          Math.abs(p.position.y - y) <= p.radius + reach) return true;
    }
    return false;
  }

  // ── Contact ──────────────────────────────────────────────────────────────

  /**
   * Contact effect for an entity standing in electrified water. Called by
   * PhysicsSystem.applyLiquidResults each frame the contact holds — electric
   * consequences live here with the element, not in the physics pass.
   *
   * Also the contact effect of electrified slime trail, of the electric wire
   * and of touching a zapped enemy (updateImbuedCurrent). `current` is the
   * imbued current's { pips, source }, or null for full-strength current.
   *
   * The status applied is 'zap' (EFFECT_AFFINITY auto-immunity), NOT
   * generic 'stun'. Electric-affinity enemies are therefore immune for free —
   * they ARE generating sources. Contact is per-frame, so it raises the zap
   * Pip track to a level (full current: pip 3) rather than adding a pip a
   * frame; while the body is still zapped the zap itself is refused (its
   * pips are a cooldown). Damage cadence is unchanged from the old inline code: per-frame
   * takeDamage(1); iframes gate it.
   */
  shockEntity(entity, current = null) {
    const p = this.game.player;
    // Stingray Mantle: wearer sits at the source of the current, not in its path.
    if (entity === p && p.stingrayMantle) return;
    // A zapped enemy isn't shocked by the current it generates.
    if (current?.source === entity) return;
    // An Imbue-capable enemy takes the current as its electric Imbue instead.
    if (absorbsZap(entity)) return;
    // Enemies route through affinity auto-immunity (zap → 'electric').
    if (entity.shouldApplyStatusEffect && !entity.shouldApplyStatusEffect('zap')) return;
    const pips = current?.pips ?? MAX_PIPS;
    // Imbued current only lands on a body not already zapped.
    if (current && entity.statusEffects?.zap?.active) return;
    if (entity.applyStatusEffect) entity.applyStatusEffect('zap', 1.5, pips);
    // The player's hit names its death cause: the carrier generating the
    // current when it is an enemy, otherwise the electricity itself.
    if (entity === p) {
      p.takeDamage(1, {
        attacker: current?.source?.data?.name ? current.source : undefined,
        cause: DEATH_CAUSES.electricity
      });
    } else if (entity.takeDamage) entity.takeDamage(1);
  }

  /**
   * Zapped carriers as live sources (see "Imbued current" in the header):
   * each enemy — and the player — at zap pip 2+ electrifies the water or
   * slime trail it stands in and shocks whoever is touching it, one pip
   * weaker than itself. Runs on the ambient scan cadence.
   */
  updateImbuedCurrent(enemies) {
    const player = this.game.player;
    const carriers = player ? [...enemies, player] : enemies;
    for (const e of carriers) {
      const zap = e.statusEffects?.zap;
      if (!zap?.active || zap.stacks < 2 || e.isDying || e.hp <= 0) continue;
      const current = { pips: zap.stacks - 1, source: e };
      this.seedUnderBody(e, { current });
      for (const other of carriers) {
        if (other === e || other.isDying || other.hp <= 0 || !inSamePlane(e, other)) continue;
        const dx = other.position.x - e.position.x;
        const dy = other.position.y - e.position.y;
        if (dx * dx + dy * dy > IMBUED_CONTACT_RANGE * IMBUED_CONTACT_RANGE) continue;
        this.shockEntity(other, current);
      }
    }
  }

  // ── Per-frame ────────────────────────────────────────────────────────────

  update(deltaTime) {
    // Advance cascade wavefronts at the fixed spread rate. Cascades seeded in
    // a different room are dropped — they don't survive room transitions.
    for (let i = this.cascades.length - 1; i >= 0; i--) {
      const c = this.cascades[i];
      if (c.room !== this.game.currentRoom) {
        this.cascades.splice(i, 1);
        continue;
      }
      c.timer -= deltaTime;
      while (c.timer <= 0 && c.frontier.length > 0) {
        c.timer += c.interval;
        this._advanceRing(c);
      }
      if (c.frontier.length === 0) this.cascades.splice(i, 1);
    }

    // Ambient sources: electric-affinity enemies and Stingray Mantle wearers
    // in contact with water (or slime trail) continuously re-seed (no-op while
    // the tail is live).
    this.scanTimer -= deltaTime;
    if (this.scanTimer <= 0) {
      this.scanTimer = SCAN_INTERVAL;
      const game = this.game;
      // Active-layer enemies ([layer-leak]): currentRoom's list is emptied
      // while an interior is active, which would silence every source there.
      const enemies = game._activeEnemies?.() ?? [];
      for (const e of enemies) {
        if (e.isDying || e.hp <= 0) continue;
        if (!e.data?.affinities?.includes('electric')) continue;
        this.seedUnderBody(e);
      }
      const p = game.player;
      if (p?.stingrayMantle && p.inLiquid) {
        this.seedAt(p.position.x + GRID.CELL_SIZE / 2, p.position.y + GRID.CELL_SIZE / 2);
      }
      this.updateImbuedCurrent(enemies);
    }

    this._shockOnElectrifiedSlime();
  }

  /**
   * Per-frame contact with electrified slime trail — the slime counterpart of
   * PhysicsSystem.applyLiquidResults' electrified-water branch, routed through
   * the same shockEntity rule (pip 3 for full current, the stamp's imbued
   * current otherwise; iframes gate the per-frame damage).
   */
  _shockOnElectrifiedSlime() {
    const live = this._activeConductivePuddles().filter(p => p.isElectrified());
    if (live.length === 0) return;
    const game = this.game;
    const bodies = [...(game._activeEnemies?.() ?? [])];
    if (game.player) bodies.push(game.player);
    for (const body of bodies) {
      if (body.isDying || body.hp <= 0) continue;
      // Rubber Boots: the same waterImmunityTimer that gates electrified
      // water in PhysicsSystem also covers standing on live slime. Only
      // ground contact — every other electric source still lands.
      if (body === game.player && body.waterImmunityTimer > 0) continue;
      const bodyPlane = planeOf(body);
      for (const p of live) {
        if ((p.plane ?? 0) !== bodyPlane || !p.isEntityOnPuddle(body)) continue;
        this.shockEntity(body, p.electricCurrent);
        break; // one contact per body per frame
      }
    }
  }

  _advanceRing(c) {
    // Apply charge decay before expanding
    c.charge -= CHARGE_DECAY_PER_RING;
    // Stop spreading if charge depleted
    if (c.charge <= 0) {
      c.frontier = [];
      return;
    }

    const next = [];
    for (const node of c.frontier) {
      for (const n of this._neighbors(c, node)) {
        if (c.visited.has(n)) continue;
        c.visited.add(n);
        if (!this._conducts(n)) continue;
        this._electrifyNode(n, c.tileDuration, c.current);
        next.push(n);
      }
    }
    if (next.length > 0) this._emitSparks(next, c.hutPlane);
    c.frontier = next;
  }

  // ── Conductor graph ──────────────────────────────────────────────────────
  // Nodes are water tiles (BackgroundObject, grid-aligned, position = cell
  // corner) and conductive puddles (Puddle, position = center).

  // instanceof, not duck typing: water BackgroundObjects answer isConductive()
  // too, so a `typeof node.isConductive` check sends every water tile down the
  // puddle branch — water never spreads past its seed tile, and a cascade that
  // reaches water through a slime stamp throws in _electrifyNode (bug #322).
  _isPuddle(node) {
    return node instanceof Puddle;
  }

  // Only normal water conducts; frozen/poisoned/crystallized block the spread
  // entirely (counterplay: freeze a line to stop the cascade). A slime trail
  // stamp conducts until it expires.
  _conducts(node) {
    if (this._isPuddle(node)) return !node.expired;
    if (node.destroyed) return false;
    return node.waterState === 'normal' || node.waterState === 'electrified';
  }

  _electrifyNode(node, duration, current) {
    if (this._isPuddle(node)) node.electrify(duration, current);
    else node.setWaterState('electrified', duration, current);
  }

  _center(node) {
    if (this._isPuddle(node)) return node.position;
    return { x: node.position.x + GRID.CELL_SIZE / 2, y: node.position.y + GRID.CELL_SIZE / 2 };
  }

  // Water: its 4-adjacent water tiles plus the slime stamps overlapping it.
  // Slime: the slime stamps within SLIME_LINK_REACH plus the water tiles it overlaps.
  _neighbors(c, node) {
    const C = GRID.CELL_SIZE;
    const out = [];
    const { x, y } = this._center(node);
    const col = Math.floor(x / C);
    const row = Math.floor(y / C);
    if (!this._isPuddle(node)) {
      for (const [dc, dr] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const n = c.waterMap.get(`${col + dc},${row + dr}`);
        if (n) out.push(n);
      }
      for (const p of this._slimeNear(c, col, row)) {
        if (this._puddleTouchesTile(p, node)) out.push(p);
      }
      return out;
    }
    for (const p of this._slimeNear(c, col, row)) {
      if (p === node) continue;
      if (Math.abs(p.position.x - x) <= SLIME_LINK_REACH &&
          Math.abs(p.position.y - y) <= SLIME_LINK_REACH) out.push(p);
    }
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const w = c.waterMap.get(`${col + dc},${row + dr}`);
        if (w && planeOf(w) === c.plane && this._puddleTouchesTile(node, w)) out.push(w);
      }
    }
    return out;
  }

  // A slime stamp touches a water tile when its square overlaps the tile's cell.
  _puddleTouchesTile(p, tile) {
    const C = GRID.CELL_SIZE;
    const tx = tile.position.x + C / 2;
    const ty = tile.position.y + C / 2;
    return Math.abs(p.position.x - tx) <= C / 2 + p.radius &&
           Math.abs(p.position.y - ty) <= C / 2 + p.radius;
  }

  // Slime stamps bucketed within ±2 cells of (col, row) — SLIME_LINK_REACH is
  // under 2 cells, so every in-reach stamp is in the scan.
  _slimeNear(c, col, row) {
    const out = [];
    for (let dr = -2; dr <= 2; dr++) {
      for (let dc = -2; dc <= 2; dc++) {
        const bucket = c.slimeGrid.get(`${col + dc},${row + dr}`);
        if (bucket) out.push(...bucket);
      }
    }
    return out;
  }

  // Snapshot the layer's slime trail stamps on `plane`, bucketed by cell.
  _buildSlimeGrid(hutPlane, plane) {
    const C = GRID.CELL_SIZE;
    const grid = new Map();
    for (const p of this.game.puddles ?? []) {
      if (p.expired || !p.isConductive?.()) continue;
      if (!!p.hutPlane !== hutPlane || (p.plane ?? 0) !== plane) continue;
      const k = `${Math.floor(p.position.x / C)},${Math.floor(p.position.y / C)}`;
      if (!grid.has(k)) grid.set(k, []);
      grid.get(k).push(p);
    }
    return grid;
  }

  // Conductive puddles (slime trail stamps) in the layer the player occupies —
  // puddles carry their interior tag in `hutPlane` (tagInteriorPlane at spawn).
  _activeConductivePuddles() {
    const interior = isInteriorActive(this.game);
    return (this.game.puddles ?? []).filter(p =>
      !p.expired && p.isConductive?.() && !!p.hutPlane === interior);
  }

  // Small spark burst at a few wavefront nodes — sells the traveling charge.
  _emitSparks(nodes, hutPlane) {
    const particles = this.game.particles;
    if (!particles) return;
    const count = Math.min(nodes.length, MAX_RING_PARTICLES);
    for (let i = 0; i < count; i++) {
      const { x, y } = this._center(nodes[Math.floor(Math.random() * nodes.length)]);
      particles.push({
        x,
        y,
        vx: (Math.random() - 0.5) * 50,
        vy: -20 - Math.random() * 40,
        gravity: 220,
        char: PARTICLE_CHARS[Math.floor(Math.random() * PARTICLE_CHARS.length)],
        color: PARTICLE_COLORS[Math.floor(Math.random() * PARTICLE_COLORS.length)],
        life: 0.3,
        maxLife: 0.3,
        hutPlane
      });
    }
  }

  // Water tiles are grid-aligned (position = cell corner). round(corner / C)
  // equals floor(center / C), so the key agrees with _neighbors' center-derived
  // cell and the slime grid's buckets.
  _key(obj) {
    return `${Math.round(obj.position.x / GRID.CELL_SIZE)},${Math.round(obj.position.y / GRID.CELL_SIZE)}`;
  }

  _buildWaterMap(backgroundObjects) {
    const map = new Map();
    for (const obj of backgroundObjects) {
      if (obj.destroyed || !obj.isWater?.()) continue;
      map.set(this._key(obj), obj);
    }
    return map;
  }
}
