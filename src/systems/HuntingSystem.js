/**
 * HuntingSystem — game encounter for any room whose letter template sets
 * `huntableGame: true` (see data/letterTemplates.js).
 *
 * As soon as an eligible room has no live enemies (whether it never had any,
 * or the player just cleared it), a huntable game animal (Moose or Rabbit —
 * see MOOSE/RABBIT in data/enemies.js and GameAnimalMechanic for their
 * flee/burrow behavior) spawns once the player stands still for
 * `requiredStillness` seconds — a single value rolled once per hunt from
 * [STILLNESS_MIN, STILLNESS_MAX], not something that greets the player the
 * instant they walk in. GameAnimalMechanic makes it flee (moose) or
 * dash-and-burrow (rabbit) the moment it gets line of sight on the player.
 * One hunt per room visit (`currentRoom.huntResolved`), same shape as
 * `fairySpawned`.
 *
 * `requiredStillness` also gates the rabbit's post-burrow re-emergence check
 * (GameAnimalMechanic._updateRabbitBurrow reads `stillnessTimer` and
 * `requiredStillness` directly) — the initial spawn and the reappear-after-
 * burrow are the same "hold still and it reveals itself" beat, so they share
 * one number instead of each having their own tuned constant.
 */

import { GRID } from '../game/GameConfig.js';
import { getExitSlotPosition } from './ExitSystem.js';
import { MOOSE, RABBIT } from '../data/enemies.js';
import { Enemy } from '../entities/Enemy.js';
import { LETTER_TEMPLATES } from '../data/letterTemplates.js';

const STILLNESS_MIN = 10;
const STILLNESS_MAX = 20;

export class HuntingSystem {
  constructor(game) {
    this.game = game;
    this.stillnessTimer = 0;
    this.lastGridPos = null;
    this.activeGameAnimal = null;
    this.requiredStillness = this._rollRequiredStillness();
  }

  _rollRequiredStillness() {
    return STILLNESS_MIN + Math.random() * (STILLNESS_MAX - STILLNESS_MIN);
  }

  // Call on every room transition (and run reset). A game animal that's still
  // alive (idling, fleeing, burrowed) when the player leaves the room gets
  // dropped along with the old room's entities, but without this the stale
  // reference would keep blocking all future hunts via the activeGameAnimal
  // guard in update() below.
  reset() {
    this.activeGameAnimal = null;
    this.stillnessTimer = 0;
    this.lastGridPos = null;
    this.requiredStillness = this._rollRequiredStillness();
  }

  update(dt) {
    const game = this.game;

    // Sweep for a game animal that fled off-room or died — actual removal
    // deferred here since GameAnimalMechanic.update() runs mid-iteration over
    // the enemies array.
    if (this.activeGameAnimal?.shouldRemove) {
      const enemy = this.activeGameAnimal;
      const list = game.currentRoom?.enemies;
      const idx = list ? list.indexOf(enemy) : -1;
      if (idx !== -1) list.splice(idx, 1);
      game.physicsSystem.removeEntity(enemy);
      this.activeGameAnimal = null;
    }

    if (!game.player || !game.currentRoom) return;
    if (game.player.inHut || game.player.inDungeon || game.player.inMaze) return;
    if (game.currentRoom.zone !== 'cyan') return;
    if (!LETTER_TEMPLATES[game.currentRoom.exitLetter]?.huntableGame) return;

    const gridPos = game.player.getGridPosition();
    if (this.lastGridPos && gridPos.x === this.lastGridPos.x && gridPos.y === this.lastGridPos.y) {
      this.stillnessTimer += dt;
    } else {
      this.stillnessTimer = 0;
    }
    this.lastGridPos = gridPos;

    if (game.currentRoom.huntResolved) return;
    if (this.activeGameAnimal) return;
    if (game._countedEnemies(game.currentRoom.enemies || []).length > 0) return;
    if (this.stillnessTimer < this.requiredStillness) return;

    if (this._spawnGameAnimal()) {
      game.currentRoom.huntResolved = true;
    }
    // Spawn-position search failed (crowded terrain) — leave huntResolved
    // unset so the next frame's tick retries with fresh random points,
    // instead of silently locking the room out of its hunt forever.
  }

  _spawnGameAnimal() {
    const game = this.game;
    const isMoose = Math.random() < 0.5;
    const data = isMoose ? MOOSE : RABBIT;
    const spawnPos = isMoose ? this._farthestExitSpawnPoint() : this._randomOpenPoint();
    if (!spawnPos) return false;

    const enemy = new Enemy(data.char, spawnPos.x, spawnPos.y, game.getCurrentZoneDepth(), data);
    enemy.setCollisionMap(game.currentRoom.collisionMap);
    enemy.setBackgroundObjects(game.currentRoom.backgroundObjects);
    enemy.setTarget(game.player);
    enemy.setGame(game);
    enemy.setRoom(game.currentRoom);
    game.physicsSystem.addEntity(enemy);
    game._activeEnemies().push(enemy);
    this.activeGameAnimal = enemy;
    return true;
  }

  _farthestExitSpawnPoint() {
    const game = this.game;
    const room = game.currentRoom;
    const player = game.player;
    const candidates = [{
      x: Math.floor(GRID.COLS / 2) * GRID.CELL_SIZE,
      y: (GRID.ROWS - 3) * GRID.CELL_SIZE
    }];
    if (room?.exits) {
      for (const dir of ['north', 'east', 'west']) {
        if (!room.exits[dir]?.letter) continue;
        const slot = getExitSlotPosition(dir);
        if (slot) candidates.push({ x: slot.col * GRID.CELL_SIZE, y: slot.row * GRID.CELL_SIZE });
      }
    }
    let best = candidates[0], bestDist = -1;
    for (const c of candidates) {
      const d = Math.hypot(c.x - player.position.x, c.y - player.position.y);
      if (d > bestDist) { bestDist = d; best = c; }
    }
    return best;
  }

  _randomOpenPoint() {
    const game = this.game;
    const center = { x: (GRID.COLS / 2) * GRID.CELL_SIZE, y: (GRID.ROWS / 2) * GRID.CELL_SIZE };
    const range = Math.min(GRID.COLS, GRID.ROWS) * GRID.CELL_SIZE * 0.4;
    return game.roomGenerator.findSpawnPosition(center, range, game.currentRoom.collisionMap, game.currentRoom.enemies);
  }
}
