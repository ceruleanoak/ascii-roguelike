import { GRID, PHYSICS } from '../game/GameConfig.js';
import { Enemy } from '../entities/Enemy.js';
import { ENEMIES } from '../data/enemies.js';
import { inSamePlane, tagInteriorPlane } from './PlaneSystem.js';

/** The Hex Witch enemy whose curse the Witch companion casts, aimed at enemies instead. */
const HEX_WITCH = ENEMIES['H'];
/** What a hexed enemy becomes. */
const FROG_CHAR = 'g';
/** How close an enemy must be to be hexed — the Hex Witch's curse range. */
const HEX_RANGE = HEX_WITCH.attackRange;
/** Seconds between hexes: the Hex Witch's windup + cooldown, in real seconds (enemy data is double-seconds). */
const HEX_INTERVAL = (HEX_WITCH.attackWindup + HEX_WITCH.attackCooldown) / PHYSICS.ENEMY_TIMER_RATE;

/**
 * HexSystem — the Witch companion's Hex (claudedocs/three-voice-plan.md §8,
 * "The Witch on a Cursed Run"). A companion with `hexes` set turns the
 * nearest enemy within the Hex Witch's curse range into a Frog, once every
 * Hex Witch attack cycle. Bosses, Frogs, and enemies already turned to the
 * player's side (commanded or charmed) are never hexed.
 *
 * CampNPCSystem calls update() from the companion's own tick, so the Hex runs
 * wherever the companion does. The cooldown lives on the companion
 * (`hexCooldown`), so nothing here needs a reset.
 */
export class HexSystem {
  constructor(game) {
    this.game = game;
  }

  update(dt, companion) {
    if (!companion?.hexes) return;
    companion.hexCooldown = Math.max(0, companion.hexCooldown - dt);
    if (companion.hexCooldown > 0) return;
    const enemy = this._nearestHexable(companion);
    if (!enemy) return;
    this.frog(enemy);
    companion.hexCooldown = HEX_INTERVAL;
  }

  _nearestHexable(companion) {
    const game = this.game;
    const commanded = game.commandedEnemies ?? [];
    let nearest = null;
    let nearestDist = HEX_RANGE;
    for (const enemy of game._activeEnemies() ?? []) {
      if (enemy.isDying || enemy.hp <= 0 || enemy.char === FROG_CHAR) continue;
      if (enemy.isBoss || enemy.isBossEntity || enemy.data?.tier === 'boss') continue;
      if (commanded.includes(enemy) || enemy.isCharmed?.()) continue;
      if (!inSamePlane(enemy, companion)) continue;
      const dist = Math.hypot(enemy.position.x - companion.position.x, enemy.position.y - companion.position.y);
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
    return frog;
  }
}
