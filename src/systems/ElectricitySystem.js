/**
 * ElectricitySystem — fixed-rate electric cascade through connected water.
 *
 * Any electric source touching water seeds a cascade here. The charge then
 * spreads ring-by-ring across 4-adjacent water tiles at SPREAD_INTERVAL per
 * ring, electrifying each tile for TILE_DURATION. The result is a visible
 * wavefront racing down a river with a glowing tail that decays behind it —
 * readable, dodgeable (step out of the channel before the front arrives),
 * and consistent across every source.
 *
 * Sources (all routed through seed*):
 *   - Lightning strikes (LightningStrikeSystem → seedNear at impact point)
 *   - Shock weapons hitting water (CombatSystem → seedFromObject; replaced
 *     the old instant _electrifyFloodFillWater)
 *   - Electric-affinity enemies in contact with water (ambient scan below —
 *     Sparks drifting over a river, Volt Spiders wading, etc.)
 *   - Stingray Mantle wearer swimming (ambient scan; wearer is shock-immune)
 *
 * Counterplay / conduction rules:
 *   - Only 'normal' water conducts. Frozen / poisoned / crystallized tiles
 *     BLOCK the spread — a freeze-line across a river is a firebreak.
 *   - Seeding a tile that is already electrified is a no-op, so continuous
 *     sources (a hovering Spark) re-trigger only after the local tail decays.
 *
 * Per-tile effects (stun + damage on entities standing in electrified water)
 * are unchanged — they live in PhysicsSystem.applyLiquidResults; this system
 * only decides WHEN each tile becomes electrified.
 */

import { GRID } from '../game/GameConfig.js';

const SPREAD_INTERVAL = 0.08; // seconds per ring (~12.5 tiles/sec down a channel)
const TILE_DURATION = 2.5;    // seconds a tile stays electrified after the front passes
const SCAN_INTERVAL = 0.25;   // ambient electric-source contact scan cadence
const MAX_RING_PARTICLES = 4; // spark particles spawned per ring advance (visual cap)
const CHARGE_DECAY_PER_RING = 2; // charge diminished per ring expansion; spread stops at ≤0

const PARTICLE_CHARS = ['·', '`', "'", '.'];
const PARTICLE_COLORS = ['#ffff88', '#ffffff', '#cccc00'];

export class ElectricitySystem {
  constructor(game) {
    this.game = game;
    this.cascades = [];   // { room, waterMap, visited, frontier, timer, interval, tileDuration }
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
   * conducts only through tiles of that same array.
   * Returns true if a cascade started.
   */
  seedFromObject(obj, backgroundObjects, opts = {}) {
    if (!obj || obj.destroyed || !obj.isWater?.()) return false;
    // Already-charged tile: the local tail hasn't decayed — no re-trigger.
    if (obj.waterState === 'electrified') return false;
    // Non-normal water (frozen/poisoned/crystallized) doesn't conduct.
    if (obj.waterState !== 'normal') return false;

    const waterMap = this._buildWaterMap(backgroundObjects);
    const tileDuration = opts.tileDuration ?? TILE_DURATION;
    const initialCharge = opts.initialCharge ?? Infinity; // unlimited range if not specified
    const seedKey = this._key(obj);

    obj.setWaterState('electrified', tileDuration);
    this._emitSparks([obj], opts.hutPlane ?? false);
    this.game.audioSystem?.playSFX?.('water_zap'); // silently no-ops until a buffer is loaded

    this.cascades.push({
      room: this.game.currentRoom, // cascade lifetime is bound to its room
      waterMap,
      visited: new Set([seedKey]),
      frontier: [obj],
      timer: opts.interval ?? SPREAD_INTERVAL,
      interval: opts.interval ?? SPREAD_INTERVAL,
      tileDuration,
      charge: initialCharge,
      hutPlane: opts.hutPlane ?? false
    });
    return true;
  }

  /** Seed at a pixel coordinate if it lands on a surface water tile. */
  seedAt(x, y, opts = {}) {
    const bg = this.game.currentRoom?.backgroundObjects;
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

  /** Seed the nearest surface water tile within `radius` px (lightning impacts). */
  seedNear(x, y, radius, opts = {}) {
    const bg = this.game.currentRoom?.backgroundObjects;
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
    return best ? this.seedFromObject(best, bg, opts) : false;
  }

  /**
   * Contact effect for an entity standing in electrified water. Called by
   * PhysicsSystem.applyLiquidResults each frame the contact holds — electric
   * consequences live here with the element, not in the physics pass.
   *
   * The status applied is 'zap' (the electric stun variant: rapid-shake
   * visual, EFFECT_AFFINITY auto-immunity), NOT generic 'stun'. Electric-
   * affinity enemies are therefore immune for free — they ARE generating
   * sources. Damage cadence is unchanged from the old inline code: per-frame
   * takeDamage(1); player iframes gate it to ~1/s.
   */
  shockEntity(entity) {
    const p = this.game.player;
    // Stingray Mantle: wearer sits at the source of the current, not in its path.
    if (entity === p && p.stingrayMantle) return;
    // Enemies route through affinity auto-immunity (zap → 'electric').
    if (entity.shouldApplyStatusEffect && !entity.shouldApplyStatusEffect('zap')) return;
    if (entity.applyStatusEffect) entity.applyStatusEffect('zap', 1.5);
    if (entity.takeDamage) entity.takeDamage(1);
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
    // in contact with water continuously re-seed (no-op while tail is live).
    this.scanTimer -= deltaTime;
    if (this.scanTimer <= 0) {
      this.scanTimer = SCAN_INTERVAL;
      const game = this.game;
      for (const e of game.currentRoom?.enemies ?? []) {
        if (e.isDying || e.hp <= 0) continue;
        if (!e.data?.affinities?.includes('electric')) continue;
        if (!(e._isOnWater?.() || e.inLiquid)) continue;
        this.seedAt(e.position.x + GRID.CELL_SIZE / 2, e.position.y + GRID.CELL_SIZE / 2);
      }
      const p = game.player;
      if (p?.stingrayMantle && p.inLiquid) {
        this.seedAt(p.position.x + GRID.CELL_SIZE / 2, p.position.y + GRID.CELL_SIZE / 2);
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
    for (const obj of c.frontier) {
      const cx = Math.round(obj.position.x / GRID.CELL_SIZE);
      const cy = Math.round(obj.position.y / GRID.CELL_SIZE);
      const neighborKeys = [
        `${cx - 1},${cy}`, `${cx + 1},${cy}`,
        `${cx},${cy - 1}`, `${cx},${cy + 1}`
      ];
      for (const nk of neighborKeys) {
        if (c.visited.has(nk)) continue;
        c.visited.add(nk);
        const n = c.waterMap.get(nk);
        if (!n || n.destroyed) continue;
        // Only normal water conducts; frozen/poisoned/crystallized block the
        // spread entirely (counterplay: freeze a line to stop the cascade).
        if (n.waterState !== 'normal' && n.waterState !== 'electrified') continue;
        n.setWaterState('electrified', c.tileDuration);
        next.push(n);
      }
    }
    if (next.length > 0) this._emitSparks(next, c.hutPlane);
    c.frontier = next;
  }

  // Small spark burst at a few wavefront tiles — sells the traveling charge.
  _emitSparks(tiles, hutPlane) {
    const particles = this.game.particles;
    if (!particles) return;
    const count = Math.min(tiles.length, MAX_RING_PARTICLES);
    for (let i = 0; i < count; i++) {
      const t = tiles[Math.floor(Math.random() * tiles.length)];
      particles.push({
        x: t.position.x + GRID.CELL_SIZE / 2,
        y: t.position.y + GRID.CELL_SIZE / 2,
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
