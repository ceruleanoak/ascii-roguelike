import { GRID } from '../game/GameConfig.js';
import { Enemy } from '../entities/Enemy.js';
import { getZoneRandomEnemy, ENEMIES } from '../data/enemies.js';
import { applyZoneCombatModifiers } from '../data/zones.js';

/**
 * RoundCombatSystem — escalating wave combat for rooms that request it
 * (currently the Quagmire / Q room; see data/letterTemplates.js `roundCombat`).
 *
 * Round 1 is the normal generateCombatRoom spawn. When the room's counted
 * enemies fall to zero, the main clear hook calls advanceIfPending(): if rounds
 * remain it spawns the next (larger) wave and the room stays "uncleared" with
 * exits locked; on the final round it returns false and the normal clear runs.
 */
const DEFAULT_ROUNDS = 3;
const ROOM_ENEMY_CAP = 10; // matches EnemySpawnSystem

export class RoundCombatSystem {
  constructor(game) {
    this.game = game;
  }

  /** Record round state on a freshly generated round-combat room (round 1 already seeded). */
  initRoom(room, rounds = DEFAULT_ROUNDS) {
    room.roundCombat = { total: Math.max(1, rounds | 0), current: 1 };
  }

  /**
   * Called the frame a round-combat room's counted enemies hit zero. Spawns the
   * next escalating wave when rounds remain (returns true → caller keeps the room
   * locked/uncleared); returns false once the final round is down (caller clears).
   */
  advanceIfPending(room) {
    const rc = room?.roundCombat;
    if (!rc) return false;
    if (rc.current >= rc.total) {
      // Final round down — the Rusalka surfaces once, then the room clears normally.
      if (!rc.rusalkaSpawned) { rc.rusalkaSpawned = true; this._spawnRusalka(); }
      return false;
    }
    rc.current++;
    this._spawnWave(room, this._waveSize(rc.current));
    this.game.audioSystem?.playSFX?.('aggro');
    return true;
  }

  /**
   * The Quagmire Rusalka, post-combat. A frog player gets the silent healer
   * (cure on contact, via PolymorphSystem); anyone else faces the lethal lure
   * (reusing FishingSystem's Rusalka slot for update/render/cleanup).
   */
  _spawnRusalka() {
    const game = this.game;
    if (game.player?.polymorphed) {
      game.polymorphSystem?.spawnCureRusalka(game);
    } else {
      const x = GRID.WIDTH  / 2 - GRID.CELL_SIZE / 2;
      const y = GRID.HEIGHT / 2 - GRID.CELL_SIZE / 2;
      game.fishingSystem?.spawnRusalkaAt(game, x, y);
    }
  }

  /** Each round fields more bodies than the last; base scales with depth. */
  _waveSize(roundNum) {
    const depth = this.game?.getCurrentZoneDepth?.() ?? 1;
    const base = Math.min(1 + Math.floor(depth / 2), 4);
    return base + roundNum; // round 2 → base+2, round 3 → base+3
  }

  /**
   * Spawn a wave into the already-active room, fully wired for live play
   * (physics, target, room) — mirrors the runtime registration in
   * RoomGenerator.spawnEnemiesFrom — placed away from the live player so a wave
   * never materializes on top of them.
   */
  _spawnWave(room, count) {
    const game = this.game;
    const gen = game.roomGenerator;
    const depth = game?.getCurrentZoneDepth?.() ?? 1;
    const avoid = game?.player?.position
      ? { x: game.player.position.x, y: game.player.position.y }
      : room.playerStartPos;
    for (let i = 0; i < count; i++) {
      if (room.enemies.length >= ROOM_ENEMY_CAP) break;
      const enemyChar = getZoneRandomEnemy(depth, room.zone);
      if (!enemyChar || enemyChar === '^') continue; // bats spawn as flocks, not singles
      const allowLiquid = ENEMIES[enemyChar]?.waterAffinity === true;
      const pos = gen.getRandomPosition(room.collisionMap, room.enemies, avoid, room.backgroundObjects, allowLiquid);
      if (!pos) continue;
      const enemy = new Enemy(enemyChar, pos.x, pos.y, depth);
      enemy.setCollisionMap(room.collisionMap);
      enemy.setBackgroundObjects(room.backgroundObjects);
      enemy.setSteamClouds?.(game.steamClouds);
      enemy.setTarget?.(game.player);
      enemy.setGame?.(game);
      enemy.setRoom?.(room);
      applyZoneCombatModifiers(enemy, room.zone);
      if (enemy.plane === 1) room.enemiesPlane1.push(enemy);
      else room.enemiesPlane0.push(enemy);
      room.enemies.push(enemy);
      game.physicsSystem.addEntity(enemy);
    }
  }
}
