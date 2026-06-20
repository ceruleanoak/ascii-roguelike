/**
 * FireSystem — deterministic fire front through connected flammables.
 *
 * Sibling of ElectricitySystem: PhysicsSystem / CombatSystem / TrapSystem
 * detect contact and delegate here; this system owns propagation and
 * consequences. BackgroundObject keeps the per-object burn state
 * (onFire / fireTimer / ignite / burnGrass) — FireSystem orchestrates it.
 *
 * Spread model (replaces the old 15%/s adjacency roll + 5% ember-ignition
 * roll that lived in main.js): every IGNITE_INTERVAL, each burning object
 * ignites flammable, non-burning neighbors within 1 cell (diagonals
 * included so dense grass fields burn as a contiguous front). Net front
 * speed ≈ 2.5 tiles/s — slow enough to outwalk, fast enough to feel alive.
 *
 * Counterplay / propagation rules:
 *   - Burnt grass (flammability 'none' after burnGrass) never re-ignites —
 *     the decaying tail behind the front is permanent and readable.
 *   - Cutting grass / destroying objects ahead of the front is a firebreak;
 *     water and other non-flammables block naturally.
 *   - Embers are pure visuals now — they never ignite anything.
 *
 * Sources (all routed through igniteObject):
 *   - Fire weapons / projectiles (CombatSystem)
 *   - Fire Trap detonation (TrapSystem)
 *   - Burning entities (ambient scan below): an enemy with an active burn
 *     status — or the player on fire — ignites the flammable object on its
 *     own tile, mirroring ElectricitySystem's ambient source scan.
 *
 * Rendering: the cached background canvas only redraws when dirty, so this
 * system marks the background dirty on every fire state TRANSITION (ignite,
 * burn-out, burnGrass) — never every frame. The per-frame flicker draw for
 * burning objects lives in ExploreRenderer.drawBurningObjects.
 */

import { GRID } from '../game/GameConfig.js';

const IGNITE_INTERVAL = 0.4;  // seconds per spread step (~2.5 tiles/s front)
const SCAN_INTERVAL = 0.25;   // burning-entity contact scan cadence
const PARTICLE_BUDGET = 200;  // shared particle cap (same as the old main.js code)

// Player direct-contact ember stacking (moved from main.js unchanged):
// overlapping a burning object accrues stacks; 3 stacks within the window
// applies a real burn.
const EMBER_STACK_COOLDOWN = 0.5;
const EMBER_STACK_WINDOW = 2.0;
const EMBER_THRESHOLD = 3;

export class FireSystem {
  constructor(game) {
    this.game = game;
    this.spreadTimer = 0;
    this.scanTimer = 0;
    this._burning = new Set(); // objects seen onFire last frame (transition tracking)
    this._room = null;         // room the tracking set belongs to
  }

  reset() {
    this.spreadTimer = 0;
    this.scanTimer = 0;
    this._burning.clear();
    this._room = null;
  }

  // ── Ignition (single entry point) ────────────────────────────────────────

  /**
   * Ignite a background object. Returns true if the object is burning after
   * the call (matches BackgroundObject.ignite semantics: false only for
   * non-flammables). Marks the background dirty on a fresh ignition so the
   * cached canvas drops the object (it moves to the foreground flicker pass).
   */
  igniteObject(obj, duration = 5.0) {
    if (!obj || obj.destroyed) return false;
    const wasBurning = obj.onFire;
    const ignited = obj.ignite(duration);
    if (ignited && !wasBurning) {
      this._burning.add(obj);
      this.game.renderer?.markBackgroundDirty?.();
    }
    return ignited;
  }

  // ── Per-frame ────────────────────────────────────────────────────────────

  update(deltaTime) {
    const game = this.game;

    // Fire state is per-room and rooms regenerate — drop the tracking set on
    // transition so stale objects can't mark the new room's background dirty.
    if (this._room !== game.currentRoom) {
      this._burning.clear();
      this._room = game.currentRoom;
    }

    const objects = this._activeObjects();

    this._trackTransitions(objects);
    this._advanceFront(deltaTime, objects);
    this._emitEmbers(deltaTime, objects);
    this._applyPlayerContact(objects);
    this._scanBurningEntities(deltaTime, objects);
  }

  // Detect fire state transitions regardless of entry point (lava contact in
  // InteractionSystem still calls obj.ignite directly) and mark the background
  // dirty exactly once per transition: new burn, burn-out, or burnGrass.
  _trackTransitions(objects) {
    let dirty = false;
    for (const obj of this._burning) {
      if (!obj.onFire || obj.destroyed) {
        this._burning.delete(obj);
        dirty = true;
      }
    }
    for (const obj of objects) {
      if (obj.onFire && !obj.destroyed && !this._burning.has(obj)) {
        this._burning.add(obj);
        dirty = true;
      }
    }
    if (dirty) this.game.renderer?.markBackgroundDirty?.();
  }

  // Deterministic spread: a fixed-rate fire front, one ring of cells per
  // IGNITE_INTERVAL. Burnt / non-flammable / already-burning tiles are
  // excluded by the map build, so firebreaks work with zero special cases.
  _advanceFront(deltaTime, objects) {
    this.spreadTimer -= deltaTime;
    if (this.spreadTimer > 0) return;
    this.spreadTimer = IGNITE_INTERVAL;

    const burning = objects.filter(obj => obj.onFire && !obj.destroyed);
    if (burning.length === 0) return;

    const flammableMap = this._buildFlammableMap(objects);
    for (const obj of burning) {
      const cx = Math.round(obj.position.x / GRID.CELL_SIZE);
      const cy = Math.round(obj.position.y / GRID.CELL_SIZE);
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const n = flammableMap.get(`${cx + dx},${cy + dy}`);
          if (!n || n.destroyed || n.onFire) continue;
          this.igniteObject(n);
        }
      }
    }
  }

  // Ember particles from burning objects and burning stuck arrows — pure
  // visuals (the old 5% ember-ignition roll is gone; the deterministic front
  // is the only spread mechanism).
  _emitEmbers(deltaTime, objects) {
    const particles = this.game.particles;
    if (!particles) return;

    for (const obj of objects) {
      if (!obj.onFire || obj.destroyed) continue;
      const emberCount = obj.flammability === 'high' ? 3 : 1;
      if (Math.random() < emberCount * deltaTime && particles.length < PARTICLE_BUDGET) {
        const travelDist = obj.flammability === 'high' ? 48 : 32;
        particles.push(this._makeEmber(
          obj.position.x + GRID.CELL_SIZE / 2,
          obj.position.y + GRID.CELL_SIZE / 2,
          travelDist
        ));
      }
    }

    for (const arrow of this.game.combatSystem?.getStuckArrows() ?? []) {
      if (arrow.isBurning && particles.length < PARTICLE_BUDGET && Math.random() < deltaTime) {
        particles.push(this._makeEmber(
          arrow.position.x + GRID.CELL_SIZE / 2,
          arrow.position.y + GRID.CELL_SIZE / 2,
          32
        ));
      }
    }
  }

  _makeEmber(x, y, travelDist) {
    const angle = Math.random() * Math.PI * 2;
    const speed = Math.random() * 50 + 30;
    return {
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 20, // Slight upward bias
      life: travelDist / speed,
      maxLife: travelDist / speed,
      char: '.',
      color: '#ff6600',
      size: 3,
      isEmber: true,
      alive: true
    };
  }

  // Direct fire contact — player overlapping a burning object accumulates
  // ember stacks without relying on emitted particles, which may travel away
  // before reaching threshold. (Moved from main.js unchanged.)
  _applyPlayerContact(objects) {
    const player = this.game.player;
    if (!player || player.fireImmune) return;
    if (player.emberStackCooldown > 0) return;

    const px = player.position.x + GRID.CELL_SIZE / 2;
    const py = player.position.y + GRID.CELL_SIZE / 2;
    for (const obj of objects) {
      if (!obj.onFire || obj.destroyed) continue;
      const cx = obj.position.x + GRID.CELL_SIZE / 2;
      const cy = obj.position.y + GRID.CELL_SIZE / 2;
      if (Math.abs(px - cx) < GRID.CELL_SIZE && Math.abs(py - cy) < GRID.CELL_SIZE) {
        player.emberStacks++;
        player.emberStackTimer = EMBER_STACK_WINDOW;
        player.emberStackCooldown = EMBER_STACK_COOLDOWN;
        if (player.emberStacks >= EMBER_THRESHOLD) {
          player.applyBurn(2.0);
          player.emberStacks = 0;
          player.emberStackTimer = 0;
        }
        break; // one contact credit per frame regardless of how many tiles are burning
      }
    }
  }

  // Ambient sources: burning entities ignite what they touch (consistency
  // with electricity — a burning enemy crossing a grass field leaves fire).
  _scanBurningEntities(deltaTime, objects) {
    this.scanTimer -= deltaTime;
    if (this.scanTimer > 0) return;
    this.scanTimer = SCAN_INTERVAL;

    const game = this.game;
    const flammableMap = this._buildFlammableMap(objects);
    if (flammableMap.size === 0) return;

    const igniteUnderEntity = (entity) => {
      const cx = Math.round(entity.position.x / GRID.CELL_SIZE);
      const cy = Math.round(entity.position.y / GRID.CELL_SIZE);
      const n = flammableMap.get(`${cx},${cy}`);
      if (n && !n.onFire) this.igniteObject(n);
    };

    for (const enemy of game.currentRoom?.enemies ?? []) {
      if (enemy.isDying || enemy.hp <= 0) continue;
      if (!enemy.statusEffects?.burn?.active) continue;
      igniteUnderEntity(enemy);
    }
    const player = game.player;
    if (player && player.burnDuration > 0) igniteUnderEntity(player);
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  // Delegates to the canonical game accessor (single source of truth, null-safe).
  // Fire follows whichever layer the player is in.
  _activeObjects() {
    return this.game._activeBackgroundObjects();
  }

  // Cell-keyed map of ignition candidates (flammable, not yet burning).
  // Burnt grass has flammability 'none' after burnGrass, so it self-excludes.
  _buildFlammableMap(objects) {
    const map = new Map();
    for (const obj of objects) {
      if (obj.destroyed || obj.onFire || !obj.isFlammable?.()) continue;
      const key = `${Math.round(obj.position.x / GRID.CELL_SIZE)},${Math.round(obj.position.y / GRID.CELL_SIZE)}`;
      map.set(key, obj);
    }
    return map;
  }
}
