// The climb (GraspSystem): the North Barrier, the scroll, Climb Scenery and
// the speed streaks.
//
// The room never moves. The climb moves the world through it instead: Climb
// Scenery is rock in pixel space that spawns above the top edge and travels
// down at `speed`. It blocks the Trine here (resolveBlockers), not through the
// collision map, so it moves smoothly instead of a cell at a time and never
// forces a background repaint. The border rows stay solid in the collision
// map throughout; only their drawing opens (northOpen / southOpen), so the
// Trine can't walk off the mountain.
import { GRID } from '../../game/GameConfig.js';
import {
  GRASP_TUNING as T, BARRIER_ROWS, SCENERY_SHAPES, SCENERY_GAP,
  STREAK_COUNT, STREAK_GLYPHS, STREAK_SPEED_MULT, ROCK_COLOR,
} from '../../data/grasp.js';

const CS = GRID.CELL_SIZE;
const FLOOR_TOP = (GRID.ROWS - 1) * CS;
const TOP_WALL = CS;
const LEFT_WALL = CS;
const RIGHT_WALL = (GRID.COLS - 1) * CS;

const randIn = ([lo, hi]) => lo + Math.random() * (hi - lo);

export function create() {
  return {
    barrier: false,       // North Barrier standing
    speed: 0,             // px/s the world moves down
    targetSpeed: 0,
    accel: T.SCROLL_ACCEL,
    spawning: true,
    sceneryKind: 'clutch',
    scenery: [],          // { x, y, w, h } px
    untilSpawn: 0,        // px left to scroll before the next piece
    streaks: [],
    northOpen: 0,         // share of the top border drawn open (1 = all)
    southOpen: 0,
  };
}

/** The full-width rock lip under the top border the Great Hands grip. */
export function raiseBarrier(grasp) {
  const map = grasp.room.collisionMap;
  for (let row = 1; row <= BARRIER_ROWS; row++) {
    for (let col = 1; col < GRID.COLS - 1; col++) map[row][col] = true;
  }
  grasp.climb.barrier = true;
  grasp.room.backgroundRepaint = true;
  returnStrays(grasp);
}

// An enemy cell is stray when it stands outside the border walls or inside
// solid rock. Flyers that pass over walls on purpose are left alone.
function isStray(enemy, map) {
  if (enemy.isGraspUnit || enemy.ignoreBackgroundCollision) return false;
  const col = Math.floor((enemy.position.x + CS / 2) / CS);
  const row = Math.floor((enemy.position.y + CS / 2) / CS);
  if (col < 1 || col > GRID.COLS - 2 || row < 1 || row > GRID.ROWS - 2) return true;
  return map[row][col] === true;
}

/**
 * Move every stray warm-up enemy to the nearest open cell inside the arena.
 * The North Barrier rises under whatever already stands on rows 1..3, and
 * physics then ejected such an enemy out through the side wall, where no
 * blow could reach it and the warm-up waited on it forever. Run as the
 * barrier rises and every warm-up frame after, so nothing the warm-up
 * counts can stay out of reach.
 */
export function returnStrays(grasp) {
  const map = grasp.room.collisionMap;
  for (const enemy of grasp.room.enemies) {
    if (!isStray(enemy, map)) continue;
    const startCol = Math.min(GRID.COLS - 2, Math.max(1, Math.floor((enemy.position.x + CS / 2) / CS)));
    const startRow = Math.min(GRID.ROWS - 2, Math.max(BARRIER_ROWS + 1, Math.floor((enemy.position.y + CS / 2) / CS)));
    const cell = nearestOpenCell(map, startCol, startRow);
    if (!cell) continue;
    enemy.position.x = cell.col * CS;
    enemy.position.y = cell.row * CS;
    if (enemy.velocity) { enemy.velocity.vx = 0; enemy.velocity.vy = 0; }
  }
}

// Breadth-first from (col, row) over the arena interior for a clear cell.
function nearestOpenCell(map, col, row) {
  const seen = new Set([`${col},${row}`]);
  const queue = [{ col, row }];
  while (queue.length > 0) {
    const cell = queue.shift();
    if (!map[cell.row][cell.col]) return cell;
    for (const [dc, dr] of [[0, 1], [1, 0], [-1, 0], [0, -1]]) {
      const c = cell.col + dc;
      const r = cell.row + dr;
      if (c < 1 || c > GRID.COLS - 2 || r < 1 || r > GRID.ROWS - 2 || seen.has(`${c},${r}`)) continue;
      seen.add(`${c},${r}`);
      queue.push({ col: c, row: r });
    }
  }
  return null;
}

/** Rock specks shaken loose from the lip. */
export function rimDebris(grasp, count) {
  const x = LEFT_WALL + Math.random() * (RIGHT_WALL - LEFT_WALL);
  grasp.burst(x, (BARRIER_ROWS + 1) * CS, count, ROCK_COLOR);
}

/**
 * End of phase 1: the North Barrier crumbles, the room's own walls become
 * Climb Scenery (they ride the scroll down and away) and its background
 * objects shatter. Both borders open.
 */
export function breakLoose(grasp) {
  const c = grasp.climb;
  const room = grasp.room;
  const map = room.collisionMap;

  if (c.barrier) {
    for (let col = 1; col < GRID.COLS - 1; col += 2) {
      grasp.burst(col * CS + CS / 2, (1 + Math.random() * BARRIER_ROWS) * CS, 6, ROCK_COLOR);
    }
    c.barrier = false;
  }
  // Every interior wall cell, merged into horizontal runs, rides the climb.
  for (let row = 1; row < GRID.ROWS - 1; row++) {
    let start = -1;
    for (let col = 1; col <= GRID.COLS - 1; col++) {
      const solid = col < GRID.COLS - 1 && map[row][col];
      if (solid && start < 0) start = col;
      if (!solid && start >= 0) {
        if (row > BARRIER_ROWS) c.scenery.push({ x: start * CS, y: row * CS, w: (col - start) * CS, h: CS });
        start = -1;
      }
      if (col < GRID.COLS - 1) map[row][col] = false;
    }
  }
  // Background objects are cleared in place: physics and every enemy hold
  // this same array.
  for (const obj of room.backgroundObjects) {
    grasp.burst(obj.position.x + CS / 2, obj.position.y + CS / 2, 5, obj.color ?? ROCK_COLOR);
  }
  room.backgroundObjects.length = 0;
  room.backgroundRepaint = true;

  c.northOpen = 1;
  c.southOpen = 1;
  c.untilSpawn = CS * 2;
  grasp.game.renderController?.screenShake.trigger(6, 0.6);
}

function spawnScenery(c) {
  const shapes = SCENERY_SHAPES[c.sceneryKind];
  const shape = shapes[Math.floor(Math.random() * shapes.length)];
  const w = shape.w * CS;
  const h = shape.h * CS;
  const x = shape.side === 'left' ? LEFT_WALL
    : shape.side === 'right' ? RIGHT_WALL - w
    : shape.col * CS;
  c.scenery.push({ x, y: -h, w, h });
  c.untilSpawn = randIn(SCENERY_GAP[c.sceneryKind]) * CS + h;
}

function respawnStreak(streak, fromTop) {
  streak.x = LEFT_WALL + Math.random() * (RIGHT_WALL - LEFT_WALL);
  streak.y = fromTop ? -Math.random() * CS * 4 : Math.random() * FLOOR_TOP;
  streak.glyph = STREAK_GLYPHS[Math.floor(Math.random() * STREAK_GLYPHS.length)];
}

export function update(grasp, dt) {
  const c = grasp.climb;
  if (c.speed < c.targetSpeed) c.speed = Math.min(c.targetSpeed, c.speed + c.accel * dt);
  else if (c.speed > c.targetSpeed) c.speed = Math.max(c.targetSpeed, c.speed - c.accel * dt);
  if (c.speed <= 0) return;

  const dy = c.speed * dt;
  for (const piece of c.scenery) piece.y += dy;
  c.scenery = c.scenery.filter(piece => piece.y < FLOOR_TOP);
  rideClimb(grasp, dy);
  if (c.spawning) {
    c.untilSpawn -= dy;
    if (c.untilSpawn <= 0) spawnScenery(c);
  }

  if (c.streaks.length === 0) {
    for (let i = 0; i < STREAK_COUNT; i++) {
      const s = {};
      respawnStreak(s, false);
      c.streaks.push(s);
    }
  }
  for (const s of c.streaks) {
    s.y += dy * STREAK_SPEED_MULT;
    if (s.y > FLOOR_TOP) respawnStreak(s, true);
  }
}

/**
 * What lands on the mountain after it breaks loose — background objects made
 * mid-fight, items and ingredients dropped on the ground — is part of the world, so it rides
 * the climb down with the scenery and is gone past the floor, instead of
 * hanging still while the rock streams by.
 */
function rideClimb(grasp, dy) {
  const room = grasp.room;
  const objects = room.backgroundObjects;
  if (objects.length > 0) {
    for (const obj of objects) obj.position.y += dy;
    // Spliced in place: physics and every enemy hold this same array.
    for (let i = objects.length - 1; i >= 0; i--) {
      if (objects[i].position.y >= FLOOR_TOP) objects.splice(i, 1);
    }
    room.backgroundRepaint = true;
  }
  const game = grasp.game;
  for (const list of ['items', 'ingredients']) {
    if (game[list].length === 0) continue;
    game[list] = game[list].filter(drop => {
      drop.position.y += dy;
      if (drop.position.y < FLOOR_TOP) return true;
      game.physicsSystem.removeEntity(drop);
      return false;
    });
  }
}

/**
 * Push one body out of every blocker it overlaps (scenery and Fingers), along
 * the shallowest axis that keeps it inside the walls and below the top wall
 * (a Finger hangs from the top edge, so "up" out of one left the arena). A
 * body wedged between a blocker and a side wall, with no shallow way out, is
 * pinned against the wall rather than shoved the length of the rock: a
 * lilting Finger leans half a cell into a one-cell wall gap. A body driven
 * into the south edge is crushed: it takes a hit and is shunted to whichever
 * side of the blocker is nearer.
 */
export function resolveBlockers(grasp, body, blockers) {
  const bw = body.width ?? CS;
  const bh = body.height ?? CS;
  for (const r of blockers) {
    const p = body.position;
    const ox = Math.min(p.x + bw, r.x + r.w) - Math.max(p.x, r.x);
    const oy = Math.min(p.y + bh, r.y + r.h) - Math.max(p.y, r.y);
    if (ox <= 0 || oy <= 0) continue;

    const all = [
      { axis: 'y', d: r.y + r.h - p.y },  // down
      { axis: 'y', d: -(p.y + bh - r.y) }, // up
      { axis: 'x', d: -(p.x + bw - r.x) }, // left
      { axis: 'x', d: r.x + r.w - p.x },   // right
    ];
    const inside = (push) => push.axis === 'y'
      ? p.y + push.d >= TOP_WALL
      : p.x + push.d >= LEFT_WALL && p.x + push.d + bw <= RIGHT_WALL;
    const pushes = all.filter(inside);
    pushes.sort((a, b) => Math.abs(a.d) - Math.abs(b.d));
    const wallSide = all.slice(2).find(push => !inside(push));
    let push = pushes[0];
    if (wallSide && Math.abs(push.d) > CS) {
      push = { axis: 'x', d: wallSide.d < 0 ? LEFT_WALL - p.x : RIGHT_WALL - bw - p.x };
    }
    if (push.axis === 'x') { p.x += push.d; body.velocity.vx = 0; }
    else { p.y += push.d; body.velocity.vy = 0; }

    if (p.y + bh > FLOOR_TOP) {
      p.y = FLOOR_TOP - bh;
      const toLeft = r.x - bw;
      const toRight = r.x + r.w;
      const leftOk = toLeft >= LEFT_WALL;
      const rightOk = toRight + bw <= RIGHT_WALL;
      if (leftOk && (!rightOk || p.x - toLeft < toRight - p.x)) p.x = toLeft;
      else if (rightOk) p.x = toRight;
      grasp.hurt(body, T.CRUSH_DAMAGE, { x: p.x + bw / 2, y: r.y });
    }
  }
}
