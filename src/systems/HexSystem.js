import { GRID, PHYSICS, ZOOM } from '../game/GameConfig.js';
import { Enemy } from '../entities/Enemy.js';
import { ENEMIES } from '../data/enemies.js';
import { inSamePlane, tagInteriorPlane } from './PlaneSystem.js';
import { MAX_PIPS, hasStatusImmunity } from './StatusEffects.js';

/** The Hex Witch enemy whose curse the Witch companion casts, aimed at enemies instead. */
const HEX_WITCH = ENEMIES['H'];
/** What a hexed enemy becomes. */
const FROG_CHAR = 'g';
/** How close an enemy must be to be hexed — the Hex Witch's curse range. */
const HEX_RANGE = HEX_WITCH.attackRange;
/** Seconds between hexes: the Hex Witch's windup + cooldown, in real seconds (enemy data is double-seconds). */
const HEX_INTERVAL = (HEX_WITCH.attackWindup + HEX_WITCH.attackCooldown) / PHYSICS.ENEMY_TIMER_RATE;

/** How close an enemy must be for the HEX spell to reach it, in px. */
const SPELL_RANGE = ZOOM.TRIGGER_RANGE_CELLS * GRID.CELL_SIZE;
/** Enemy-timer seconds before the HEX spell can touch the same enemy again (5 real seconds). */
const SPELL_COOLDOWN = 5 * PHYSICS.ENEMY_TIMER_RATE;
/** Chance a HEX spell turns on its caster: the frog curse, not the target's roll. */
const SPELL_BACKFIRE_CHANCE = 0.05;

// What the HEX spell can do to its target. All land at full pips. `duration`
// is what applyStatusEffect takes: enemy-timer seconds (double-seconds), which
// durationPerStack effects multiply by the pips. Freeze's time is the Frozen
// lock, and poison and goo keep draining a pip at a time after it.
const SPELL_HEXES = [
  { effect: 'burn',   weight: 10, duration: 2 },
  { effect: 'poison', weight: 10, duration: 1 },
  { effect: 'goo',    weight: 10, duration: 2 },
  { effect: 'dizzy',  weight: 10, duration: 2 },
  { effect: 'blind',  weight: 10, duration: 6 },
  { effect: 'stun',   weight: 10, duration: 1 },
  { effect: 'sleep',  weight: 10, duration: 3 },
  { effect: 'freeze', weight: 10, duration: 1 },
  { effect: 'charm',  weight: 5,  duration: 3 },
  { frog: true,       weight: 5 }
];

/**
 * HexSystem — every Hex the player's side casts. Bosses and Frogs never become
 * Frogs, and enemies already turned to the player's side (commanded or
 * charmed) are never hexed.
 *
 * The Witch companion's Hex (claudedocs/three-voice-plan.md §8, "The Witch on
 * a Cursed Run"): a companion with `hexes` set turns the nearest enemy within
 * the Hex Witch's curse range into a Frog, once every Hex Witch attack cycle.
 * CampNPCSystem calls update() from the companion's own tick, so the Hex runs
 * wherever the companion does. The cooldown lives on the companion
 * (`hexCooldown`), so nothing here needs a reset.
 *
 * The HEX spell (cast()): the nearest enemy in range the spell hasn't touched
 * in the last 5 seconds takes one random Hex from SPELL_HEXES. That cooldown
 * is the enemy's own `hexed` Status Effect, so it needs no reset either.
 */
export class HexSystem {
  constructor(game) {
    this.game = game;
  }

  update(dt, companion) {
    if (!companion?.hexes) return;
    companion.hexCooldown = Math.max(0, companion.hexCooldown - dt);
    if (companion.hexCooldown > 0) return;
    const enemy = this._nearestHexable(companion, HEX_RANGE, candidate => this._canBecomeFrog(candidate));
    if (!enemy) return;
    this.frog(enemy);
    companion.hexCooldown = HEX_INTERVAL;
  }

  /** The HEX spell. The return value is the THREE's line. */
  cast() {
    const game = this.game;
    const player = game.player;
    const enemy = this._nearestHexable(player, SPELL_RANGE, candidate => !game._isHiddenEnemy(candidate) && !candidate.statusEffects.hexed.active);
    if (!enemy) return '...NOTHING.';

    // A frog has no further to fall, so the cast just lands.
    if (!player.polymorphed && Math.random() < SPELL_BACKFIRE_CHANCE) {
      game.polymorphSystem.activatePolymorph(game, true);
      return 'YOU BECOME A FROG.';
    }

    const hex = this._rollSpellHex(enemy);
    if (!hex) return '...NOTHING.';
    if (hex.frog) {
      this.frog(enemy)?.applyStatusEffect('hexed', SPELL_COOLDOWN);
    } else {
      enemy.applyStatusEffect('hexed', SPELL_COOLDOWN);
      enemy.applyStatusEffect(hex.effect, hex.duration, MAX_PIPS);
      this._burst(enemy.position);
    }
    return 'HEXED.';
  }

  /** A weighted pick from what `enemy` can actually take; null when it can take nothing. */
  _rollSpellHex(enemy) {
    const hexes = SPELL_HEXES.filter(hex => (hex.frog
      ? this._canBecomeFrog(enemy)
      : enemy.shouldApplyStatusEffect(hex.effect) && !hasStatusImmunity(enemy, hex.effect)));
    let roll = Math.random() * hexes.reduce((sum, hex) => sum + hex.weight, 0);
    for (const hex of hexes) {
      roll -= hex.weight;
      if (roll < 0) return hex;
    }
    return null;
  }

  _canBecomeFrog(enemy) {
    return enemy.char !== FROG_CHAR
      && !enemy.isBoss && !enemy.isBossEntity && enemy.data?.tier !== 'boss';
  }

  /** The nearest living enemy opposing the player within `range` of `caster` that `accepts` passes. */
  _nearestHexable(caster, range, accepts) {
    const game = this.game;
    const commanded = game.commandedEnemies ?? [];
    let nearest = null;
    let nearestDist = range;
    for (const enemy of game._activeEnemies() ?? []) {
      if (enemy.isDying || enemy.hp <= 0 || !accepts(enemy)) continue;
      if (commanded.includes(enemy) || enemy.isCharmed?.()) continue;
      if (!inSamePlane(enemy, caster)) continue;
      const dist = Math.hypot(enemy.position.x - caster.position.x, enemy.position.y - caster.position.y);
      if (dist <= nearestDist) {
        nearest = enemy;
        nearestDist = dist;
      }
    }
    return nearest;
  }

  /** `enemy` becomes a Frog where it stands, in its room or floor. */
  frog(enemy) {
    const game = this.game;
    const enemies = game._activeEnemies();
    const index = enemies.indexOf(enemy);
    if (index === -1) return null;
    enemies.splice(index, 1);
    game.physicsSystem.removeEntity(enemy);

    const { x, y } = enemy.position;
    const frog = new Enemy(FROG_CHAR, x, y, game.getCurrentZoneDepth());
    frog.setCollisionMap(enemy.collisionMap);
    frog.setBackgroundObjects(game._activeBackgroundObjects());
    frog.setSteamClouds(game.steamClouds);
    frog.setTarget(game.player);
    frog.setGame(game);
    frog.setRoom(game.activeRoom);
    frog.plane = enemy.plane;
    game.physicsSystem.addEntity(frog);
    enemies.push(frog);
    this._burst(frog.position);
    return frog;
  }

  /** The ring of sparks that marks a Hex landing. */
  _burst({ x, y }) {
    const game = this.game;
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2;
      game.particles.push(tagInteriorPlane(game, {
        x: x + GRID.CELL_SIZE / 2,
        y: y + GRID.CELL_SIZE / 2,
        vx: Math.cos(angle) * 70,
        vy: Math.sin(angle) * 70,
        life: 0.5,
        maxLife: 0.5,
        char: '*',
        color: HEX_WITCH.color,
        isImpact: true
      }));
    }
  }
}
