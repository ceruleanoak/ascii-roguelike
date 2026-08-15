import { GRID } from '../game/GameConfig.js';
import { Enemy } from '../entities/Enemy.js';
import { getZoneRandomEnemy, ENEMIES } from '../data/enemies.js';
import { applyZoneCombatModifiers } from '../data/zones.js';
import { AlchemistNPC } from '../entities/AlchemistNPC.js';

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
      // Final round down — one weighted outcome surfaces once, then the room
      // clears normally (see _spawnFinalEncounter).
      if (!rc.finalEncounterSpawned) { rc.finalEncounterSpawned = true; this._spawnFinalEncounter(room); }
      return false;
    }
    rc.current++;
    this._spawnWave(room, this._waveSize(rc.current));
    this.game.audioSystem?.playSFX?.('aggro');
    return true;
  }

  /**
   * The Quagmire's final-round outcome. A frog player gets the silent healer
   * (cure on contact, via PolymorphSystem) unconditionally — that branch is
   * deterministic and never rolled. Anyone else draws from a weighted table:
   * the rescued Alchemist (the game's namesake NPC finally freed), the Hag
   * who kept him (a hostile roaming-style enemy, see enemies.js 'Q'), or the
   * lethal Rusalka lure (reusing FishingSystem's Rusalka slot for
   * update/render/cleanup) — the original, pre-Alchemist behavior.
   */
  _spawnFinalEncounter(room) {
    const game = this.game;
    if (game.player?.polymorphed) {
      game.polymorphSystem?.spawnCureRusalka(game);
      return;
    }
    const x = GRID.WIDTH  / 2 - GRID.CELL_SIZE / 2;
    const y = GRID.HEIGHT / 2 - GRID.CELL_SIZE / 2;
    const outcome = this._rollQuagmireFinalEncounter();
    if (outcome === 'alchemist') this._spawnAlchemistRescue(x, y);
    else if (outcome === 'hag') this._spawnHag(room, x, y);
    else game.fishingSystem?.spawnRusalkaAt(game, x, y);
  }

  /**
   * Weighted roll over the Quagmire's final-round outcomes. First-pass
   * weights, needs playtest tuning. 'alchemist' drops out once he's already
   * been rescued (a one-time event) — the remaining two entries renormalize
   * automatically since the roll is bounded by their own summed weight.
   */
  _rollQuagmireFinalEncounter() {
    const weights = { hag: 0.3, rusalka: 0.2 };
    if (!this.game.alchemistNPC?.rescued) weights.alchemist = 0.5;
    const total = Object.values(weights).reduce((sum, w) => sum + w, 0);
    let roll = Math.random() * total;
    for (const [outcome, weight] of Object.entries(weights)) {
      if (roll < weight) return outcome;
      roll -= weight;
    }
    return 'rusalka'; // fallback (floating-point edge case)
  }

  /**
   * Rescue outcome — creates the AlchemistNPC singleton (once, ever) and
   * drops him into the room as a plain dialogue NPC, mirroring how the
   * Rusalka slot places its own entity. He delivers his rescue dialogue the
   * next time the player opens him (AlchemistNPC.getDialogueLines).
   */
  _spawnAlchemistRescue(x, y) {
    const game = this.game;
    game.alchemistNPC = new AlchemistNPC(x, y);
    game.alchemistNPC.rescued = true;
    game.alchemistNPC.placement = null;
    game.neutralCharacters.push(game.alchemistNPC);
  }

  /**
   * Hag outcome — a hostile 'Q' enemy ("the Hag keeps whatever wanders too
   * far south"), wired identically to _spawnWave's per-enemy block. `uncounted`
   * keeps her out of `_countedEnemies` so the room stays cleared and exits stay
   * open despite her being alive (matches the existing lethal-Rusalka precedent
   * of a post-clear hazard that outlives the clear flag) — without this she'd
   * trip the generic "counted enemy appeared → re-lock exits" check in
   * main.js's updateExploreState and trap the player in with her.
   */
  _spawnHag(room, x, y) {
    const game = this.game;
    const depth = game?.getCurrentZoneDepth?.() ?? 1;
    const enemy = new Enemy('Q', x, y, depth);
    enemy.setCollisionMap(room.collisionMap);
    enemy.setBackgroundObjects(room.backgroundObjects);
    enemy.setSteamClouds?.(game.steamClouds);
    enemy.setTarget?.(game.player);
    enemy.setGame?.(game);
    enemy.setRoom?.(room);
    applyZoneCombatModifiers(enemy, room.zone);
    enemy.uncounted = true; // post-clear hazard — see doc comment above
    if (enemy.plane === 1) room.enemiesPlane1.push(enemy);
    else room.enemiesPlane0.push(enemy);
    room.enemies.push(enemy);
    game.physicsSystem.addEntity(enemy);
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
