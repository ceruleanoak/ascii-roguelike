import { GRID } from '../game/GameConfig.js';
import { getExitSlotPosition } from './ExitSystem.js';

// Pack reinforcement: an Enemy type that declares `data.reinforcement` brings
// one more of itself in at a random exit once its aggro has lasted `after`
// continuous seconds. The timer is per type, not per Enemy: it runs while at
// least one of that type is aggroed (`enraged`) and resets to zero when none
// are. After a reinforcement lands the timer restarts, so a fight that stays
// hot keeps adding one every `after` seconds.
//
// Surface rooms only (EnemyUpdateSystem calls this outside interior floors),
// since interior floors have no exits to arrive through. The timers are
// room-scoped and cleared by the Reset Registry on every room change.

// The cell just inside each exit slot, as a step from the slot.
const INWARD = {
  north: [0, 1],
  south: [0, -1],
  east: [-1, 0],
  west: [1, 0]
};

// Same open-exit test as findNearbyOpenExitDirection: north/east/west need a
// letter, south is a plain doorway.
function exitIsPresent(room, direction) {
  const exit = room.exits?.[direction];
  return direction === 'south' ? !!exit : !!exit?.letter;
}

export class PackReinforcementSystem {
  constructor(game) {
    this.game = game;
    this._aggroTimers = new Map(); // enemy char -> seconds of continuous aggro
  }

  reset() {
    this._aggroTimers.clear();
  }

  update(deltaTime, enemies) {
    const room = this.game.currentRoom;
    if (!room) return;

    // One aggroed Enemy per reinforcing type stands in for the whole type.
    const aggroed = new Map();
    for (const enemy of enemies) {
      if (!enemy.data?.reinforcement || enemy.isDying || !enemy.enraged) continue;
      if (!aggroed.has(enemy.char)) aggroed.set(enemy.char, enemy);
    }

    for (const char of this._aggroTimers.keys()) {
      if (!aggroed.has(char)) this._aggroTimers.delete(char);
    }

    for (const [char, enemy] of aggroed) {
      const elapsed = (this._aggroTimers.get(char) ?? 0) + deltaTime;
      if (elapsed < enemy.data.reinforcement.after) {
        this._aggroTimers.set(char, elapsed);
        continue;
      }
      this._aggroTimers.set(char, 0);
      this._queueAtRandomExit(room, enemy);
    }
  }

  _queueAtRandomExit(room, spawner) {
    const directions = Object.keys(INWARD).filter(dir => exitIsPresent(room, dir));
    if (directions.length === 0) return;

    const direction = directions[Math.floor(Math.random() * directions.length)];
    const slot = getExitSlotPosition(direction);
    const [dx, dy] = INWARD[direction];
    const cs = GRID.CELL_SIZE;

    this.game.enemySpawnSystem.queueRequest(spawner, {
      spawnChar: spawner.char,
      spawnCount: 1,
      spawnRange: cs * 2,
      spawnerPosition: { x: (slot.col + dx) * cs, y: (slot.row + dy) * cs }
    });
  }
}
