// Maze-Pathing Mechanic — `data.mazePathing`: the enemy walks the Maze cell by
// cell, along the corridor BFS the Ghost uses (systems/mazePath.js), instead
// of the open-room vector navigation. The Maze Rat is the consumer: released
// by a Rat Nest, it runs the corridors to the player rather than pressing
// into the nearest wall.
//
// Runs after the State spine has written targetVelocity for the frame. While
// the enemy's spine State (stateMachine.current, not the legacy `state` name)
// is closing (`approach`) or hunting its mark (`search`), the goal is
// its last known position of the target — Approach refreshes that every frame
// it can see — and targetVelocity is replaced with a heading for the centre of
// the next cell on the BFS path. The path is recomputed only when the enemy's
// own cell or the goal's cell changes. Every other State (windup, strike,
// recover, alert) keeps the velocity it wrote. Knockback is never clamped.
//
// The grid is the enemy's own collisionMap (true = solid). An enemy without
// one, or whose goal is unreachable, keeps the State spine's velocity. No
// suspend signal — writes velocity only.

import { GRID } from '../../game/GameConfig.js';
import { bfsPath } from '../../systems/mazePath.js';

const CS = GRID.CELL_SIZE;
const PATHING_STATES = new Set(['approach', 'search']);

const cellOf = (x, y) => ({ col: Math.floor(x / CS), row: Math.floor(y / CS) });

export const MazePathingMechanic = {
  isEnabled(enemy) {
    return enemy.data?.mazePathing === true;
  },

  init(enemy) {
    // A Maze corridor (and a Rat Nest) is exactly one body wide, so entering
    // one needs PhysicsSystem's corner slip, as the player has.
    enemy.slipsCorners = true;
    // The last BFS result and the two cells it was computed between.
    enemy.mazePath = null;
    enemy.mazePathFrom = null;
    enemy.mazePathGoal = null;
  },

  update(enemy) {
    if (!this.isEnabled(enemy) || enemy.isKnockedBack()) return;
    const map = enemy.collisionMap;
    const goalPos = enemy.lastKnownPosition;
    if (!map || !goalPos || !PATHING_STATES.has(enemy.stateMachine?.current)) return;

    const cx = enemy.position.x + enemy.width / 2;
    const cy = enemy.position.y + enemy.height / 2;
    const from = cellOf(cx, cy);
    const goal = cellOf(goalPos.x + CS / 2, goalPos.y + CS / 2);
    if (map[from.row]?.[from.col] !== false || map[goal.row]?.[goal.col] !== false) return;

    if (!sameCell(enemy.mazePathFrom, from) || !sameCell(enemy.mazePathGoal, goal)) {
      enemy.mazePath = bfsPath(map, from.col, from.row, goal.col, goal.row);
      enemy.mazePathFrom = from;
      enemy.mazePathGoal = goal;
    }
    const path = enemy.mazePath;
    if (!path) return;

    // In the goal's cell already: head for the mark itself. Otherwise head
    // for the centre of the next cell, which keeps the body square in the
    // corridor through every turn.
    const next = path[0];
    const tx = next ? next.col * CS + CS / 2 : goalPos.x + CS / 2;
    const ty = next ? next.row * CS + CS / 2 : goalPos.y + CS / 2;
    const dx = tx - cx;
    const dy = ty - cy;
    const dist = Math.hypot(dx, dy);
    if (dist < 1) return;
    enemy.targetVelocity.vx = (dx / dist) * enemy.speed;
    enemy.targetVelocity.vy = (dy / dist) * enemy.speed;
  },
};

function sameCell(a, b) {
  return !!a && a.col === b.col && a.row === b.row;
}
