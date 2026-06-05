import { Item } from '../entities/Item.js';
import { Puddle } from '../entities/Puddle.js';
import { createActivationBurst, createEmberBurst, createIceBurst } from '../entities/Particle.js';
import { GRID } from '../game/GameConfig.js';
import { BackgroundObject } from '../entities/BackgroundObject.js';

const MAX_CHARGE_TIME = 0.7; // seconds to reach max throw distance
const MIN_DIST = GRID.CELL_SIZE;       // 16px — tap distance
// Lower decel = weightier flight. Landing position is unchanged (v0=sqrt(2*decel*dist)),
// but total flight time = v0/decel = sqrt(2*dist/decel) increases as decel drops.
const THROW_DECEL = 350;               // px/s² deceleration

// Per-subtype throw profile. Subtype implies intended use:
// - `maxDist`: full-charge throw distance (reticule cap)
// - `damageMult`: multiplier on weapon base damage at peak velocity
// - `minVelForDamage`: velocity below which a flight hit deals no damage
// - `maxDamageVel`: velocity at which damageMult is fully applied; falls off linearly toward minVel
const TRAP_MAX_DIST = GRID.CELL_SIZE * 4; // 64px — preserves prior trap behavior
const THROW_PROFILES = {
  trap:    { maxDist: TRAP_MAX_DIST,      damageMult: 0,   minVelForDamage: 0,   maxDamageVel: 1 },
  spear:   { maxDist: GRID.CELL_SIZE * 16, damageMult: 1.5, minVelForDamage: 120, maxDamageVel: 550 },
  dagger:  { maxDist: GRID.CELL_SIZE * 12, damageMult: 1.0, minVelForDamage: 100, maxDamageVel: 480 },
  sword:   { maxDist: GRID.CELL_SIZE * 8,  damageMult: 0.7, minVelForDamage: 100, maxDamageVel: 390 },
  axe:     { maxDist: GRID.CELL_SIZE * 8,  damageMult: 0.7, minVelForDamage: 100, maxDamageVel: 390 },
  hammer:  { maxDist: GRID.CELL_SIZE * 8,  damageMult: 0.6, minVelForDamage: 100, maxDamageVel: 390 },
  flail:   { maxDist: GRID.CELL_SIZE * 8,  damageMult: 0.6, minVelForDamage: 100, maxDamageVel: 390 },
  pickaxe: { maxDist: GRID.CELL_SIZE * 8,  damageMult: 0.6, minVelForDamage: 100, maxDamageVel: 390 },
  whip:    { maxDist: GRID.CELL_SIZE * 8,  damageMult: 0.5, minVelForDamage: 100, maxDamageVel: 390 },
  bow:     { maxDist: GRID.CELL_SIZE * 6,  damageMult: 0.3, minVelForDamage: 100, maxDamageVel: 340 },
  wand:    { maxDist: GRID.CELL_SIZE * 6,  damageMult: 0.3, minVelForDamage: 100, maxDamageVel: 340 },
  staff:   { maxDist: GRID.CELL_SIZE * 6,  damageMult: 0.3, minVelForDamage: 100, maxDamageVel: 340 },
  default: { maxDist: GRID.CELL_SIZE * 8,  damageMult: 0.4, minVelForDamage: 100, maxDamageVel: 390 },
};

function getThrowProfile(item) {
  const data = item?.data;
  if (!data) return THROW_PROFILES.default;
  if (data.type === 'TRAP') return THROW_PROFILES.trap;
  return THROW_PROFILES[data.weaponSubtype] || THROW_PROFILES.default;
}

export class TrapSystem {
  constructor(game) {
    this.game = game;
  }

  // Begin charging a throw. Called on SPACE keydown (traps) or SHIFT keydown (weapons).
  // Profile is captured at charge start from the currently held item.
  startTrapCharge() {
    const profile = getThrowProfile(this.game.player?.heldItem);
    this.game.trapCharging = { timer: 0, maxDist: profile.maxDist, maxTime: MAX_CHARGE_TIME };
  }

  // Cancel charge without throwing (state change, death, etc.).
  cancelTrapCharge() {
    this.game.trapCharging = null;
  }

  // Advance charge timer each frame.
  updateTrapCharge(deltaTime) {
    if (!this.game.trapCharging) return;
    this.game.trapCharging.timer = Math.min(
      this.game.trapCharging.timer + deltaTime,
      MAX_CHARGE_TIME
    );
  }

  // Returns the reticule pixel position for the current charge state, or null.
  getTrapReticulePos() {
    const game = this.game;
    if (!game.trapCharging || !game.player) return null;
    const ratio = game.trapCharging.timer / MAX_CHARGE_TIME;
    const maxDist = game.trapCharging.maxDist ?? TRAP_MAX_DIST;
    const dist = MIN_DIST + ratio * (maxDist - MIN_DIST);
    const f = game.player.facing;
    const len = Math.sqrt(f.x * f.x + f.y * f.y) || 1;
    const C = GRID.CELL_SIZE;
    return {
      x: game.player.position.x + C / 2 + (f.x / len) * dist,
      y: game.player.position.y + C / 2 + (f.y / len) * dist,
    };
  }

  // Execute the throw on key release. Routes to trap-arm or weapon-pickup flight.
  releaseTrapThrow() {
    const game = this.game;
    if (!game.trapCharging) return;
    const heldItem = game.player.heldItem;
    if (!heldItem) { game.trapCharging = null; return; }

    // Wires are TRAP-typed but throw-land as pickups (WireSystem handles placement
    // via two-stage SPACE anchoring, not trap arming on landing).
    const isTrap = heldItem.data?.type === 'TRAP' && !heldItem.data?.wire;
    if (isTrap && !game.player.canUseTrap()) { game.trapCharging = null; return; }

    const pos = this.getTrapReticulePos();
    game.trapCharging = null;
    if (!pos) return;

    const C = GRID.CELL_SIZE;
    const px = game.player.position.x + C / 2;
    const py = game.player.position.y + C / 2;
    const dx = pos.x - px, dy = pos.y - py;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const v0 = Math.sqrt(2 * THROW_DECEL * dist);
    const profile = getThrowProfile(heldItem);

    if (isTrap) {
      game.inFlightTraps.push({
        kind: 'trap',
        x: px, y: py,
        vx: (dx / dist) * v0,
        vy: (dy / dist) * v0,
        decel: THROW_DECEL,
        targetX: pos.x, targetY: pos.y,
        char: heldItem.char,
        color: heldItem.color,
        trapData: heldItem.data,
        plane: game.player.plane ?? 0,
      });
      game.player.markTrapUsed();
    } else {
      // Weapon throw: clear the active slot, item flies until it hits an enemy or stops
      const thrownItem = game.player.dropItem();
      if (!thrownItem) return;
      // Directional glyphs (currently spear ↑) rotate to face throw direction.
      // ↑ points at -π/2 in canvas space, so add π/2 to the velocity angle.
      const subtype = thrownItem.data?.weaponSubtype;
      const rotation = subtype === 'spear' ? Math.atan2(dy, dx) + Math.PI / 2 : 0;
      game.inFlightTraps.push({
        kind: 'weapon',
        x: px, y: py,
        vx: (dx / dist) * v0,
        vy: (dy / dist) * v0,
        decel: THROW_DECEL,
        targetX: pos.x, targetY: pos.y,
        char: thrownItem.char,
        color: thrownItem.color,
        rotation,
        weaponItem: thrownItem,
        profile,
        baseDamage: thrownItem.data?.damage ?? 1,
        hitEnemies: new Set(),
        plane: game.player.plane ?? 0,
        inHut: game.player.inHut === true,
        inMaze: game.player.inMaze === true,
      });
    }
    game.updateUI();
  }

  // Move in-flight throwables. Traps arm on stop; weapons hit enemies mid-flight then land as pickups.
  updateInFlightTraps(deltaTime) {
    const game = this.game;
    const C = GRID.CELL_SIZE;
    for (let i = game.inFlightTraps.length - 1; i >= 0; i--) {
      const t = game.inFlightTraps[i];
      const speed = Math.sqrt(t.vx * t.vx + t.vy * t.vy);
      const decelThisFrame = t.decel * deltaTime;

      // Weapon mid-flight: enemy collision check against current position
      if (t.kind === 'weapon' && speed > 0) {
        this._checkThrownWeaponHit(t, speed);
        if (t.landed) {
          this._landThrownWeapon(t);
          game.inFlightTraps.splice(i, 1);
          continue;
        }
      }

      // Pinning spear carry: drag the carried enemy with the spear mid-flight
      if (t.carriedEnemy && !t.carriedEnemy.destroyed) {
        const enemy = t.carriedEnemy;

        if (this._spearHitsWall(t)) {
          // Spear embeds in wall — pin enemy at its current safe position (before drag into wall)
          enemy.pinnedDuration = 2.0;
          enemy.carriedBySpear = false;
          t.carriedEnemy = null;
          this._landThrownWeapon(t);
          game.inFlightTraps.splice(i, 1);
          continue;
        }

        enemy.position.x = t.x - C / 2;
        enemy.position.y = t.y - C / 2;
      }

      if (decelThisFrame >= speed) {
        const prevX = t.x, prevY = t.y;
        t.x = t.targetX;
        t.y = t.targetY;
        // Snap to target, but don't land weapons inside walls
        if (t.kind === 'weapon' && this._spearHitsWall(t)) {
          t.x = prevX;
          t.y = prevY;
        }
        // Spear stopped naturally — release carried enemy without pinning
        if (t.carriedEnemy) {
          t.carriedEnemy.carriedBySpear = false;
          t.carriedEnemy = null;
        }
        if (t.kind === 'weapon') {
          this._landThrownWeapon(t);
        } else {
          this._armTrap(t);
        }
        game.inFlightTraps.splice(i, 1);
      } else {
        const prevX = t.x, prevY = t.y;
        const ratio = (speed - decelThisFrame) / speed;
        t.vx *= ratio;
        t.vy *= ratio;
        t.x += t.vx * deltaTime;
        t.y += t.vy * deltaTime;

        // Thrown weapons stop at walls instead of passing through and landing off-screen
        if (t.kind === 'weapon' && this._spearHitsWall(t)) {
          t.x = prevX;
          t.y = prevY;
          // Pinning spear: enemy is already at safe position from carry block drag — just release it
          if (t.carriedEnemy) {
            t.carriedEnemy.pinnedDuration = 2.0;
            t.carriedEnemy.carriedBySpear = false;
            t.carriedEnemy = null;
          }
          this._landThrownWeapon(t);
          game.inFlightTraps.splice(i, 1);
        }
      }
    }
  }

  // Check if a spear's current position overlaps a room wall or solid background object.
  _spearHitsWall(t) {
    const game = this.game;
    const C = GRID.CELL_SIZE;
    // Out-of-bounds positions are treated as wall hits (catches fast tunneling past border walls)
    if (t.x < 0 || t.y < 0 || t.x >= GRID.WIDTH || t.y >= GRID.HEIGHT) return true;
    const gridX = Math.floor(t.x / C);
    const gridY = Math.floor(t.y / C);
    const room = game.currentRoom;
    if (room?.collisionMap?.[gridY]?.[gridX]) return true;
    const bgObjs = room?.backgroundObjects;
    if (!bgObjs) return false;
    for (const obj of bgObjs) {
      if (obj.destroyed || !obj.data?.solid) continue;
      const box = obj.getHitbox();
      if (t.x >= box.x && t.x < box.x + box.width && t.y >= box.y && t.y < box.y + box.height) return true;
    }
    return false;
  }

  // Compute thrown-weapon damage from current velocity using the profile's threshold/cap/falloff.
  _thrownWeaponDamage(t, speed) {
    const { profile, baseDamage } = t;
    if (speed < profile.minVelForDamage) return 0;
    const range = Math.max(1, profile.maxDamageVel - profile.minVelForDamage);
    const t01 = Math.min(1, (speed - profile.minVelForDamage) / range);
    return Math.max(1, Math.round(baseDamage * profile.damageMult * t01));
  }

  // Detect enemy collision for a flying weapon. Marks t.landed on hit.
  _checkThrownWeaponHit(t, speed) {
    const game = this.game;
    const enemies = this._getActiveEnemies();
    if (!enemies.length) return;
    const C = GRID.CELL_SIZE;
    const hitR = C * 0.75;
    const playerPlane = t.plane ?? 0;
    for (const enemy of enemies) {
      if (!enemy || enemy.hp <= 0) continue;
      if ((enemy.plane ?? 0) !== playerPlane) continue;
      if (t.hitEnemies.has(enemy)) continue;
      const ex = enemy.position.x + C / 2;
      const ey = enemy.position.y + C / 2;
      const dx = ex - t.x;
      const dy = ey - t.y;
      if (dx * dx + dy * dy > hitR * hitR) continue;

      const dmg = this._thrownWeaponDamage(t, speed);
      if (dmg > 0) {
        enemy.takeDamage(dmg);
        game.combatSystem?.createDamageNumber?.(dmg, enemy.position.x, enemy.position.y, t.color || '#ffffff');
      }
      t.hitEnemies.add(enemy);

      // Pinning spear: carry the enemy with the spear instead of landing immediately
      if (t.weaponItem?.data?.pinning) {
        t.carriedEnemy = enemy;
        enemy.carriedBySpear = true;
        return;
      }

      t.landed = true; // non-pinning weapon stops on first enemy
      t.x = ex;
      t.y = ey;
      return;
    }
  }

  // Drop the thrown weapon as a floor pickup at its current position.
  _landThrownWeapon(t) {
    const game = this.game;
    const C = GRID.CELL_SIZE;
    const item = t.weaponItem;
    if (!item) return;
    // Let FountainSystem intercept throws aimed at the pool
    if (game.fountainSystem?.checkWeaponLanding(t)) return;
    item.position.x = t.x - C / 2;
    item.position.y = t.y - C / 2;
    item.velocity = { vx: 0, vy: 0 };
    item.pickupReadyAt = performance.now() + 600;
    item.plane = t.plane ?? 0;
    // Absolute (not additive) — an item that was picked up inside a hut keeps
    // hutPlane=true on its inventory entry, so re-throwing it on the surface
    // would otherwise carry the stale flag and confuse plane-aware scans
    // (e.g. surface rats ignoring SHIFT-thrown bread that was originally a
    // hut loaf).
    item.hutPlane = t.inHut === true;
    item.mazePlane = t.inMaze === true;
    game.items.push(item);
    game.physicsSystem.addEntity(item);
  }

  // Place trap entity at landing position and emit burst particles.
  _armTrap(t) {
    const game = this.game;
    const C = GRID.CELL_SIZE;
    const placedTrapItem = new Item(t.char, t.x - C / 2, t.y - C / 2);
    placedTrapItem.isPlaced = true;
    placedTrapItem.plane = t.plane;
    const entry = {
      item: placedTrapItem,
      tickTimer: t.trapData.tickInterval || 0,
      activeDuration: t.trapData.activeDuration != null ? t.trapData.activeDuration : Infinity,
      affectedEnemies: new Set()
    };
    if (t.trapData.remoteTrigger) {
      entry.blinkTimer = 0;
      entry.blinkVisible = true;
    }
    game.placedTraps.push(entry);
    game.particles.push(...createActivationBurst(t.x, t.y, t.trapData.color || '#ffffff'));
  }

  placeTrap() {
    const game = this.game;
    if (!game.player.canUseTrap()) return;

    const trapItem = game.player.heldItem;
    const trapData = trapItem.data;

    // Decrement charge and advance to next slot
    game.player.markTrapUsed();

    // Create placed trap entity at player position
    const placedTrapItem = new Item(
      trapItem.char,
      game.player.position.x,
      game.player.position.y
    );
    placedTrapItem.isPlaced = true;
    placedTrapItem.plane = game.player.plane ?? 0;

    // Add to placed traps list for auto-trigger detection
    game.placedTraps.push({
      item: placedTrapItem,
      tickTimer: trapData.tickInterval || 0,
      activeDuration: trapData.activeDuration != null ? trapData.activeDuration : Infinity,
      affectedEnemies: new Set()
    });

    game.updateUI();
  }

  // Place a trap at an arbitrary world position (used by Trap Goblin enemy).
  // type: 'slow' → Slime Bomb (●), 'fire' → Fire Trap (^)
  placeTrapAtPosition(x, y, type, plane = 0, owner = null) {
    const game = this.game;
    const charMap = { slow: '●', fire: '^', freeze: '[', stun: '{' };
    const char = charMap[type] || '●';

    const trapItem = new Item(char, x - GRID.CELL_SIZE / 2, y - GRID.CELL_SIZE / 2);
    trapItem.isPlaced = true;
    trapItem.plane = plane;

    game.placedTraps.push({
      item: trapItem,
      owner,
      tickTimer: trapItem.data?.tickInterval || 0,
      activeDuration: trapItem.data?.activeDuration != null ? trapItem.data.activeDuration : Infinity,
      affectedEnemies: new Set()
    });
  }

  _getActiveEnemies() {
    const game = this.game;
    if (game.player?.inMaze && game.mazeInterior) return game.mazeInterior.enemies || [];
    if (game.player?.inHut && game.activeFloor) return game.activeFloor.enemies;
    return game.currentRoom?.enemies ?? [];
  }

  updatePlacedTraps(deltaTime) {
    const game = this.game;
    if (!game.currentRoom) return;
    const enemies = this._getActiveEnemies();
    game.activeNoiseSource = null; // reset each frame

    for (let i = game.placedTraps.length - 1; i >= 0; i--) {
      const entry = game.placedTraps[i];
      const { item } = entry;
      const trapData = item.data;
      const tx = item.position.x;
      const ty = item.position.y;

      // Remote bomb blink
      if (trapData.remoteTrigger) {
        entry.blinkTimer = (entry.blinkTimer || 0) + deltaTime;
        if (entry.blinkTimer >= 0.4) {
          entry.blinkTimer -= 0.4;
          entry.blinkVisible = !entry.blinkVisible;
        }
        continue; // Remote traps are only triggered by player, not by proximity
      }

      if (trapData.oneShot) {
        // One-shot trap: triggered by enemy or player proximity (owner is immune)
        let triggered = false;
        for (const enemy of enemies) {
          if (enemy === entry.owner) continue;
          const dx = enemy.position.x - tx;
          const dy = enemy.position.y - ty;
          if (Math.sqrt(dx * dx + dy * dy) <= trapData.triggerRadius) {
            triggered = true;
            break;
          }
        }
        // Player can also trigger traps by walking near them
        if (!triggered && game.player && !trapData.remoteTrigger) {
          const pdx = (game.player.position.x + GRID.CELL_SIZE / 2) - (tx + GRID.CELL_SIZE / 2);
          const pdy = (game.player.position.y + GRID.CELL_SIZE / 2) - (ty + GRID.CELL_SIZE / 2);
          if (Math.sqrt(pdx * pdx + pdy * pdy) <= trapData.triggerRadius) {
            triggered = true;
          }
        }

        if (triggered) {
          this._fireOneShotTrap(entry, i, enemies);
        }
      } else {
        // Persistent placeable
        const effect = trapData.effect;

        if (effect === 'noise') {
          // Noise-maker: redirect enemies toward self; destroyed on enemy contact
          game.activeNoiseSource = { x: tx, y: ty, radius: trapData.effectRadius };
          // Destroy on enemy overlap (< 16 px)
          let destroyed = false;
          for (const enemy of enemies) {
            const dx = enemy.position.x - tx;
            const dy = enemy.position.y - ty;
            if (Math.sqrt(dx * dx + dy * dy) < 16) {
              destroyed = true;
              break;
            }
          }
          if (destroyed) {
            game.placedTraps.splice(i, 1);
          }

        } else if (effect === 'sleep') {
          // Music Box: apply sleep to enemies that enter radius while active
          entry.activeDuration -= deltaTime;
          if (entry.activeDuration > 0) {
            for (const enemy of enemies) {
              const dx = enemy.position.x - tx;
              const dy = enemy.position.y - ty;
              if (Math.sqrt(dx * dx + dy * dy) <= trapData.effectRadius) {
                if (!entry.affectedEnemies.has(enemy)) {
                  entry.affectedEnemies.add(enemy);
                  enemy.applyStatusEffect('sleep', trapData.effectDuration);
                }
              } else {
                // Enemy left radius — allow re-triggering if they re-enter
                entry.affectedEnemies.delete(enemy);
              }
            }
          }

        } else if (effect === 'stun') {
          // Tesla Coil: deal damage + stun every tickInterval seconds
          entry.tickTimer -= deltaTime;
          if (entry.tickTimer <= 0) {
            entry.tickTimer = trapData.tickInterval;
            for (const enemy of enemies) {
              const dx = enemy.position.x - tx;
              const dy = enemy.position.y - ty;
              if (Math.sqrt(dx * dx + dy * dy) <= trapData.effectRadius) {
                enemy.takeDamage(trapData.damage || 2);
                enemy.applyStatusEffect('stun', trapData.stunDuration || 0.8);
                game.combatSystem.createDamageNumber(trapData.damage || 2, enemy.position.x, enemy.position.y, '#00ffff');
                // Lightning particle
                game.particles.push({
                  x: tx,
                  y: ty,
                  vx: (Math.random() - 0.5) * 60,
                  vy: (Math.random() - 0.5) * 60,
                  life: 0.3,
                  maxLife: 0.3,
                  char: '!',
                  color: '#00ffff',
                  isImpact: true
                });
              }
            }
          }

        }
      }
    }
  }

  // Fire a one-shot trap's effect and remove it from placedTraps.
  // Called by both proximity-trigger (updatePlacedTraps) and weapon-trigger (checkWeaponTriggers).
  _fireOneShotTrap(entry, index, enemies) {
    const game = this.game;
    const { item } = entry;
    const trapData = item.data;
    const tx = item.position.x;
    const ty = item.position.y;
    const cx = tx + GRID.CELL_SIZE / 2;
    const cy = ty + GRID.CELL_SIZE / 2;
    const r = trapData.effectRadius;

    if (trapData.effect === 'slow') {
      // Slime Bomb: blast applies goo status to enemies + player in radius (gooBlob parity)
      // and lays a permanent slime puddle on the ground.
      for (const enemy of enemies) {
        if (enemy.getElementalModifier('slime') === 0) continue;
        const dx = (enemy.position.x + GRID.CELL_SIZE / 2) - cx;
        const dy = (enemy.position.y + GRID.CELL_SIZE / 2) - cy;
        if (Math.sqrt(dx * dx + dy * dy) <= r) {
          enemy.applyStatusEffect('goo', 5.0);
        }
      }
      if (game.player) {
        const pdx = (game.player.position.x + GRID.CELL_SIZE / 2) - cx;
        const pdy = (game.player.position.y + GRID.CELL_SIZE / 2) - cy;
        if (Math.sqrt(pdx * pdx + pdy * pdy) <= r) {
          game.player.applyStatusEffect?.('goo', 5.0);
        }
      }
      // Lay a disk of slimeTrail tiles covering the blast footprint — uses the
      // shared trail-tile system instead of a one-off circle puddle.
      const plane = item.plane ?? 0;
      game._dropSlimeTrail(cx, cy, plane);
      const RING_RADIUS = r * 0.7;
      const RING_TILES = 12;
      for (let i = 0; i < RING_TILES; i++) {
        const a = (i / RING_TILES) * Math.PI * 2;
        game._dropSlimeTrail(cx + Math.cos(a) * RING_RADIUS, cy + Math.sin(a) * RING_RADIUS, plane);
      }
    } else if (trapData.effect === 'freeze') {
      // Freeze Trap: freeze enemies + crystallize water/puddle tiles + scatter ice objects.
      // Slimes and ice-weak enemies stay frozen permanently — others thaw normally.
      game.particles.push(...createIceBurst(cx, cy));
      for (const enemy of enemies) {
        const dx = (enemy.position.x + GRID.CELL_SIZE / 2) - cx;
        const dy = (enemy.position.y + GRID.CELL_SIZE / 2) - cy;
        if (Math.sqrt(dx * dx + dy * dy) <= r) {
          const isSlime = enemy.getElementalModifier('slime') === 0;
          const isIceWeak = enemy.getElementalModifier('freeze') > 1.0;
          const duration = (isSlime || isIceWeak) ? Infinity : trapData.effectDuration;
          enemy.applyStatusEffect('freeze', duration);
          if (!enemy.data.freezePermanent) enemy.statusEffects.freeze.frozen = true;
        }
      }

      const C = GRID.CELL_SIZE;
      const room = game.currentRoom;
      if (room?.backgroundObjects) {
        // Structural/special chars that shouldn't be visually frozen
        const SKIP_FREEZE = new Set(['!', '$', '.', '-', 'I', '<', '>', '^', 'v', '≡', '∩', '2', '3', '}', 'x']);
        const newObjects = [];

        for (const obj of room.backgroundObjects) {
          if (obj.destroyed) continue;
          const odx = (obj.position.x + C / 2) - cx;
          const ody = (obj.position.y + C / 2) - cy;
          if (Math.sqrt(odx * odx + ody * ody) > r) continue;

          if (obj.char === '=') {
            // Standing water → replace with frozen water tile
            obj.destroyed = true;
            const frozenWater = new BackgroundObject('~', obj.position.x, obj.position.y);
            frozenWater.setWaterState('frozen', Infinity);
            newObjects.push(frozenWater);
          } else if (obj.char === '~') {
            // Puddle → freeze in place
            obj.setWaterState('frozen', Infinity);
          } else if (!SKIP_FREEZE.has(obj.char)) {
            // Trees, bushes, rocks, crates, etc. → tint ice-blue and flag so the
            // cut-grass handler can produce an ice-burst on slicing frozen grass.
            obj.color = '#aaffff';
            obj.frozen = true;
          }
        }

        room.backgroundObjects.push(...newObjects);

        // Build occupancy set so scattered frozen water doesn't stack on existing objects
        const occupied = new Set(
          room.backgroundObjects
            .filter(o => !o.destroyed)
            .map(o => `${Math.floor(o.position.x / C)},${Math.floor(o.position.y / C)}`)
        );

        // Scatter frozen water tiles across open cells within radius (~30% density, max 14)
        const radiusCells = Math.ceil(r / C);
        const centerCol = Math.floor(cx / C);
        const centerRow = Math.floor(cy / C);
        let placed = 0;
        for (let dr = -radiusCells; dr <= radiusCells && placed < 14; dr++) {
          for (let dc = -radiusCells; dc <= radiusCells && placed < 14; dc++) {
            const ox = (centerCol + dc) * C + C / 2 - cx;
            const oy = (centerRow + dr) * C + C / 2 - cy;
            if (Math.sqrt(ox * ox + oy * oy) > r) continue;
            if (Math.random() > 0.30) continue;
            const key = `${centerCol + dc},${centerRow + dr}`;
            if (occupied.has(key)) continue;
            const frozenTile = new BackgroundObject('~', (centerCol + dc) * C, (centerRow + dr) * C);
            frozenTile.setWaterState('frozen', Infinity);
            room.backgroundObjects.push(frozenTile);
            occupied.add(key);
            placed++;
          }
        }
      }

      // Radial ice particle burst
      const iceColors = ['#aaffff', '#00ddff', '#ffffff'];
      const iceChars = ['*', '+', 'o', '.'];
      for (let i = 0; i < 18; i++) {
        const angle = (Math.PI * 2 * i) / 18 + (Math.random() - 0.5) * 0.3;
        const speed = 70 + Math.random() * 80;
        game.particles.push({
          x: cx, y: cy,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 0.5 + Math.random() * 0.35,
          maxLife: 0.85,
          char: iceChars[Math.floor(Math.random() * iceChars.length)],
          color: iceColors[Math.floor(Math.random() * iceColors.length)],
          isImpact: true
        });
      }
    } else if (trapData.effect === 'remote') {
      // Remote Bomb: radial explosion damage + fire particles (friendly fire)
      const dmg = trapData.damage || 6;
      for (const enemy of enemies) {
        const dx = (enemy.position.x + GRID.CELL_SIZE / 2) - cx;
        const dy = (enemy.position.y + GRID.CELL_SIZE / 2) - cy;
        if (Math.sqrt(dx * dx + dy * dy) <= r) {
          enemy.takeDamage(dmg);
          enemy.applyStatusEffect('burn', 3.0);
          game.combatSystem.createDamageNumber(dmg, enemy.position.x, enemy.position.y, '#ff6600');
        }
      }
      // Player takes damage if within blast radius
      if (game.player) {
        const pdx = (game.player.position.x + GRID.CELL_SIZE / 2) - cx;
        const pdy = (game.player.position.y + GRID.CELL_SIZE / 2) - cy;
        if (Math.sqrt(pdx * pdx + pdy * pdy) <= r) {
          game.player.takeDamage(dmg, { type: 'explosion' });
          game.combatSystem.createDamageNumber(dmg, game.player.position.x, game.player.position.y, '#ff6600');
        }
      }
      // Radial fire particle burst
      const fireColors = ['#ff6600', '#ff4400', '#ffaa00', '#ffffff'];
      for (let i = 0; i < 24; i++) {
        const angle = (Math.PI * 2 * i) / 24 + (Math.random() - 0.5) * 0.4;
        const speed = 80 + Math.random() * 120;
        game.particles.push({
          x: cx, y: cy,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 0.4 + Math.random() * 0.4,
          maxLife: 0.8,
          char: ['*', '!', '+', '.'][Math.floor(Math.random() * 4)],
          color: fireColors[Math.floor(Math.random() * fireColors.length)],
          isImpact: true
        });
      }
    } else {
      // All other one-shot effects: apply to enemies and player in effectRadius
      for (const enemy of enemies) {
        const dx = enemy.position.x - tx;
        const dy = enemy.position.y - ty;
        if (Math.sqrt(dx * dx + dy * dy) <= r) {
          if (trapData.effect === 'burn' && game.currentRoom.backgroundObjects) {
            for (const obj of game.currentRoom.backgroundObjects) {
              if (obj.destroyed || !obj.isFlammable) continue;
              const odx = obj.position.x - tx;
              const ody = obj.position.y - ty;
              if (Math.sqrt(odx * odx + ody * ody) <= r) {
                if (obj.isFlammable()) obj.ignite(5.0);
              }
            }
          }
          enemy.applyStatusEffect(trapData.effect, trapData.effectDuration);
        }
      }
      if (game.player) {
        const pdx = (game.player.position.x + GRID.CELL_SIZE / 2) - cx;
        const pdy = (game.player.position.y + GRID.CELL_SIZE / 2) - cy;
        if (Math.sqrt(pdx * pdx + pdy * pdy) <= r) {
          if (trapData.effect === 'burn') {
            game.player.applyBurn?.(trapData.effectDuration);
          } else if (trapData.effect === 'freeze') {
            game.player.applyStatusEffect?.('freeze', trapData.effectDuration);
          } else if (trapData.effect === 'stun') {
            game.player.applyStatusEffect?.('freeze', 1.0);
          }
        }
      }
    }

    // Burst particle effect at trap location
    if (trapData.effect === 'burn') {
      game.particles.push(...createEmberBurst(cx, cy));
    } else {
      game.particles.push(...createActivationBurst(cx, cy, trapData.color || '#ffffff'));
    }
    game.placedTraps.splice(index, 1);
  }

  // Detonate all placed remote bombs. Called on SPACE press when remote bombs exist.
  detonateRemoteBombs() {
    const game = this.game;
    if (!game.currentRoom) return false;
    const enemies = this._getActiveEnemies();
    let detonated = false;
    for (let i = game.placedTraps.length - 1; i >= 0; i--) {
      const entry = game.placedTraps[i];
      if (entry.item.data.remoteTrigger) {
        this._fireOneShotTrap(entry, i, enemies);
        detonated = true;
      }
    }
    return detonated;
  }

  // Check if any player melee attack or projectile hits a placed one-shot trap and fires it.
  checkWeaponTriggers() {
    const game = this.game;
    if (!game.placedTraps.length || !game.combatSystem || !game.currentRoom) return;
    const enemies = this._getActiveEnemies();
    const C = GRID.CELL_SIZE;

    for (let i = game.placedTraps.length - 1; i >= 0; i--) {
      const entry = game.placedTraps[i];
      const trapData = entry.item.data;
      if (!trapData.oneShot) continue; // Only throwable one-shots can be weapon-detonated

      const tx = entry.item.position.x + C / 2;
      const ty = entry.item.position.y + C / 2;
      const hitR = C; // trap hitbox
      let hit = false;

      // Melee attacks
      for (const attack of game.combatSystem.meleeAttacks) {
        const atkR = (attack.radius || C) + hitR;
        const dx = tx - attack.position.x;
        const dy = ty - attack.position.y;
        if (dx * dx + dy * dy <= atkR * atkR) { hit = true; break; }
      }

      // Projectiles (any player bullet or arrow)
      if (!hit) {
        for (const proj of game.combatSystem.projectiles) {
          const dx = tx - proj.position.x;
          const dy = ty - proj.position.y;
          if (dx * dx + dy * dy <= hitR * hitR) { hit = true; break; }
        }
      }

      if (hit) this._fireOneShotTrap(entry, i, enemies);
    }
  }

  // Apply per-frame effects for all active puddles based on their type.
  updatePuddles(deltaTime) {
    const game = this.game;
    if (!game.puddles?.length || !game.player) return;
    const playerPlane = game.player.plane ?? 0;

    for (let i = game.puddles.length - 1; i >= 0; i--) {
      const puddle = game.puddles[i];

      // Tick down lifetime for temporary puddles
      if (puddle.lifetime !== undefined) {
        puddle.lifetime -= deltaTime;
        if (puddle.lifetime <= 0) {
          puddle.expired = true;
          game.puddles.splice(i, 1);
          continue;
        }
      }

      if ((puddle.plane ?? 0) !== playerPlane) continue;

      switch (puddle.type) {
        case 'fire': this._applyFirePuddle(puddle, playerPlane); break;
        case 'ice':  this._applyIcePuddle(puddle, playerPlane);  break;
        // slimeTrail contact effects are applied in main.js (see updateExploreState).
        // Future types added here
      }
    }
  }

  _applyFirePuddle(puddle, playerPlane) {
    const game = this.game;
    // Player burn lives on its own duration field (applyBurn), not statusEffects.
    // Refresh past the 1.5s tick rate so a tick actually fires before it expires.
    if (puddle.isEntityOnPuddle(game.player) && !game.player.fireImmune) {
      game.player.applyBurn?.(2.0);
    }
    for (const enemy of (game.currentRoom?.enemies ?? [])) {
      if ((enemy.plane ?? 0) !== playerPlane) continue;
      if (!puddle.isEntityOnPuddle(enemy)) continue;
      const fireImmune = enemy.elementalAffinity?.immunity?.includes('burn');
      if (!fireImmune) {
        enemy.applyStatusEffect('burn', 3.0);
      }
    }
  }

  _applyIcePuddle(puddle, playerPlane) {
    const game = this.game;
    if (puddle.isEntityOnPuddle(game.player)) {
      // Ice patches slow the player. Player has no 'slow' status — `freeze` is
      // the slow-bearing key (slowAmount 0.5). Refresh each frame so movement
      // resumes shortly after stepping off.
      game.player.applyStatusEffect?.('freeze', 0.3);
    }
    for (const enemy of (game.currentRoom?.enemies ?? [])) {
      if ((enemy.plane ?? 0) !== playerPlane) continue;
      if (!puddle.isEntityOnPuddle(enemy)) continue;
      const freezeImmune = enemy.elementalAffinity?.immunity?.includes('freeze');
      if (!freezeImmune) {
        enemy.applyStatusEffect('freeze', 0.5);
      }
    }
  }

  /** SPACE in EXPLORE: place/arm the held trap at the player's feet. Wires are
   *  handled separately by WireSystem before this is reached. */
  placeTrap() {
    const game = this.game;
    const held = game.player.heldItem;
    if (!held || held.data?.wire) return;
    const droppedItem = game.player.dropItem();
    if (!droppedItem) return;

    const trapData = droppedItem.data || droppedItem;
    if (trapData.type === 'TRAP' && !trapData.oneShot) {
      // Persistent placeables (Music Box, Noise-maker, Tesla Coil)
      const trapItem = new Item(droppedItem.char, game.player.position.x, game.player.position.y);
      trapItem.isPlaced = true;
      game.placedTraps.push({
        item: trapItem,
        tickTimer: trapData.tickInterval || 0,
        activeDuration: trapData.activeDuration != null ? trapData.activeDuration : Infinity,
        affectedEnemies: new Set()
      });

    } else if (trapData.type === 'TRAP' && trapData.oneShot) {
      // One-shot traps arm in-place (not pickable)
      const C = GRID.CELL_SIZE;
      const cx = game.player.position.x + C / 2;
      const cy = game.player.position.y + C / 2;
      const placedTrapItem = new Item(droppedItem.char, game.player.position.x, game.player.position.y);
      placedTrapItem.isPlaced = true;
      placedTrapItem.plane = game.player.plane ?? 0;
      const entry = {
        item: placedTrapItem,
        tickTimer: trapData.tickInterval || 0,
        activeDuration: trapData.activeDuration != null ? trapData.activeDuration : Infinity,
        affectedEnemies: new Set()
      };
      if (trapData.remoteTrigger) { entry.blinkTimer = 0; entry.blinkVisible = true; }
      game.placedTraps.push(entry);
      game.particles.push(...createActivationBurst(cx, cy, trapData.color || '#ffffff'));
    }
    game.updateUI();
  }

}
