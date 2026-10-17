import { GRID } from '../game/GameConfig.js';
import { Enemy } from '../entities/Enemy.js';
import { Particle } from '../entities/Particle.js';
import { getZoneRandomEnemy } from '../data/enemies.js';
import { applyZoneCombatModifiers } from '../data/zones.js';
import { tagInteriorPlane } from './PlaneSystem.js';

// A floor never holds more enemies than this, vents included — the same
// 10-per-room ceiling the surface spawners respect.
const FLOOR_ENEMY_CAP = 10;

/** A vent that can still spawn: not broken, not mid-crack. */
function isStanding(vent) {
  const { obj } = vent;
  return !obj.destroyed && !obj.destroyAfterAnimation && obj.hp > 0;
}

/**
 * Does this floor still have a Spawn Vent standing? Shutters stay shut and a
 * Trap Room stays sealed while one does (DungeonPuzzleSystem).
 */
export function hasStandingVent(floor) {
  return (floor?.spawnVents ?? []).some(isStanding);
}

/**
 * SpawnVentSystem — ticks a dungeon floor's Spawn Vents (the template's
 * `spawners` list, built into `floor.spawnVents` by DungeonFloorGenerator).
 * Each vent keeps up to `maxAlive` of its own enemies alive at once, adding
 * one every `interval` seconds while under the cap, each born on the vent's
 * own cell. The cap counts enemies alive now, not lifetime spawns: kill one
 * and the vent replaces it. Breaking the vent stops it for good.
 *
 * Owned by DungeonSystem and called from its update() for the active floor
 * only — a floor the player has left keeps its vents' timers where they were.
 */
export class SpawnVentSystem {
  constructor(game) {
    this.game = game;
  }

  update(floor, dt) {
    for (const vent of floor.spawnVents ?? []) {
      if (!isStanding(vent)) continue;
      vent.alive = vent.alive.filter(e => e.hp > 0 && floor.enemies.includes(e));
      vent.timer += dt;
      if (vent.alive.length >= vent.maxAlive) continue;
      if (vent.timer < vent.interval) continue;
      if (floor.enemies.length >= FLOOR_ENEMY_CAP) continue;
      vent.timer = 0;
      this._spawnFrom(floor, vent);
    }
  }

  // Same setup as DungeonFloorGenerator._spawnEnemies gives a floor's own
  // enemies, plus physics registration (the floor is already active) and
  // spawn iframes, as RoomGenerator.spawnEnemiesFrom gives a spawner's child.
  _spawnFrom(floor, vent) {
    const { game } = this;
    const enemyChar = vent.enemyChar ?? getZoneRandomEnemy(vent.depth, vent.zone);
    if (!enemyChar) return;
    const { x, y } = vent.obj.position;
    const enemy = new Enemy(enemyChar, x, y, vent.depth);
    enemy.setCollisionMap(floor.collisionMap);
    enemy.setBackgroundObjects(floor.backgroundObjects);
    applyZoneCombatModifiers(enemy, vent.zone);
    enemy.invulnerabilityTimer = 1.0;
    game.physicsSystem.addEntity(enemy);
    floor.enemies.push(enemy);
    vent.alive.push(enemy);
    vent.obj._playAnimation('shake');
    this._spawnPuff(vent.obj);
  }

  _spawnPuff(obj) {
    const { game } = this;
    const sx = obj.position.x + GRID.CELL_SIZE / 2;
    const sy = obj.position.y + GRID.CELL_SIZE / 2;
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2 + Math.random() * 0.5;
      const speed = 20 + Math.random() * 20;
      game.particles.push(tagInteriorPlane(game, new Particle(
        sx, sy, '.', obj.color,
        { vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 10 },
        0.5 + Math.random() * 0.3
      )));
    }
  }
}
