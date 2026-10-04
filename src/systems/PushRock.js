import { GRID } from '../game/GameConfig.js';
import { BackgroundObject } from '../entities/BackgroundObject.js';

/**
 * PushRock — the Push Rock trigger kind ('push'): a rock that looks exactly
 * like the stubborn Cavern Rocks around it and gives way, one cell, to a
 * player who leans on it from the right side. Zelda 1's pushable block.
 *
 * It is a triggerMachine trigger like a switch or a panel, so whatever already
 * gates on "every trigger active" (a Barricade's plug, a dungeon Puzzle Room's
 * stairs) takes one with no wiring of its own — the same rock, wired to
 * whichever gate placed it. It only ever appears where such a gate exists:
 * the rock is never a secret on its own, only the answer to a locked thing.
 *
 * Rules:
 *   - Pushing is input, not contact: the player must be lined up with the
 *     rock, touching its face, and holding the one cardinal direction into it
 *     for PUSH_HOLD_SECONDS. Brushing past or a diagonal never moves it.
 *   - It slides exactly one cell, only into a cell the world leaves open
 *     (no wall, no solid object, nothing the caller reserves), then never
 *     moves again. Its activation is always permanent.
 *   - A push into a blocked cell does nothing — the rock reads as every
 *     other rock until it is leaned on from a side that has room.
 */

// Lean time before the rock gives — long enough that walking into it while
// fighting does not shove it, short enough that a deliberate push feels firm.
const PUSH_HOLD_SECONDS = 0.35;

// The slide itself, so the move reads as the rock travelling rather than
// teleporting a cell over.
const SLIDE_SECONDS = 0.3;

// How far off the rock's row/column (px) the player may stand and still be
// "lined up" with it.
const ALIGN_TOLERANCE = 5;

// How close the player's leading edge must be to the rock's cell face (px).
// Negative reach covers the ellipse hitbox the '0' glyph earns, which lets
// the player sink a few px into the cell before stopping.
const FACE_GAP_MAX = 3;
const FACE_GAP_MIN = -8;

/**
 * Build a Push Rock at a cell. Every field the push read touches is declared
 * here, so the object never grows state lazily at runtime.
 */
export function createPushRock(col, row) {
  const cs = GRID.CELL_SIZE;
  const obj = BackgroundObject.createVariant('push_rock', col * cs, row * cs);
  obj.kind = 'push';
  obj.activation = 'permanent';
  obj.neutralizeSeconds = 0;
  obj.active = false;
  obj._timer = 0;
  obj.pulseTimer = 0;
  obj.pushHold = 0;
  obj.pushDir = null; // the direction pushHold has been accumulating along
  obj.slide = null; // { fromX, fromY, toX, toY, t } while travelling
  obj.structural = true;
  return obj;
}

/**
 * triggerMachine's per-kind read for 'push'. True on the frame the slide
 * lands — a one-time pulse, held forever by the permanent activation.
 *
 * `world` is what the push needs and triggerMachine does not know:
 *   collisionMap        the plane's wall grid (absent on an open surface room)
 *   backgroundObjects   the objects that can occupy the destination cell
 *   isReserved(c, r)    optional — cells the caller forbids (exit letters)
 *   onMove()            optional — called each frame the rock travels, for a
 *                       caller whose background layer is cached
 */
export function readPushRock(rock, dt, player, world) {
  if (rock.active || !world) return false;

  if (rock.slide) return advanceSlide(rock, dt, world);

  const dir = pushDirection(rock, player);
  // A lean only counts while it is unbroken and along one direction — a
  // change of side starts the hold over.
  if (!dir || !rock.pushDir || dir.x !== rock.pushDir.x || dir.y !== rock.pushDir.y) {
    rock.pushHold = 0;
    rock.pushDir = dir;
    if (!dir) return false;
  }
  rock.pushHold += dt;
  if (rock.pushHold < PUSH_HOLD_SECONDS) return false;
  rock.pushHold = 0;

  const cs = GRID.CELL_SIZE;
  const col = Math.floor(rock.position.x / cs) + dir.x;
  const row = Math.floor(rock.position.y / cs) + dir.y;
  if (!cellOpen(rock, col, row, world)) return false;

  rock.slide = {
    fromX: rock.position.x, fromY: rock.position.y,
    toX: col * cs, toY: row * cs,
    t: 0
  };
  return false;
}

function advanceSlide(rock, dt, world) {
  const s = rock.slide;
  s.t = Math.min(1, s.t + dt / SLIDE_SECONDS);
  rock.position.x = s.fromX + (s.toX - s.fromX) * s.t;
  rock.position.y = s.fromY + (s.toY - s.fromY) * s.t;
  world.onMove?.();
  if (s.t < 1) return false;
  rock.slide = null;
  return true;
}

// The one cardinal direction the player is leaning into the rock along, or
// null when they are not lined up, not touching, or not pressing exactly that
// way.
function pushDirection(rock, player) {
  const input = player?.inputState;
  if (!input) return null;
  const x = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  const y = (input.down ? 1 : 0) - (input.up ? 1 : 0);
  if ((x !== 0) === (y !== 0)) return null; // idle or diagonal

  const cs = GRID.CELL_SIZE;
  const px = player.position.x, py = player.position.y;
  const rx = rock.position.x, ry = rock.position.y;
  const pw = player.width || cs, ph = player.height || cs;

  let gap, offAxis;
  if (x === 1)       { gap = rx - (px + pw); offAxis = py - ry; }
  else if (x === -1) { gap = px - (rx + cs); offAxis = py - ry; }
  else if (y === 1)  { gap = ry - (py + ph); offAxis = px - rx; }
  else               { gap = py - (ry + cs); offAxis = px - rx; }

  if (Math.abs(offAxis) > ALIGN_TOLERANCE) return null;
  if (gap > FACE_GAP_MAX || gap < FACE_GAP_MIN) return null;
  return { x, y };
}

// Whether the rock may slide into this cell: inside the wall grid (or the
// screen when there is none), not a wall, not reserved, and not holding a
// solid object other than the rock itself.
function cellOpen(rock, col, row, world) {
  const cs = GRID.CELL_SIZE;
  const map = world.collisionMap;
  if (map) {
    const wall = map[row]?.[col];
    if (wall === undefined || wall) return false; // off the grid, or a wall
  } else if (col < 0 || row < 0 || (col + 1) * cs > GRID.WIDTH || (row + 1) * cs > GRID.HEIGHT) {
    return false;
  }
  if (world.isReserved?.(col, row)) return false;

  for (const obj of world.backgroundObjects || []) {
    if (obj === rock || obj.destroyed) continue;
    if (Math.floor(obj.position.x / cs) !== col || Math.floor(obj.position.y / cs) !== row) continue;
    const d = obj.data || {};
    if (d.solid || d.bulletInteraction === 'block' || d.bulletInteraction === 'interact-preserve') return false;
  }
  return true;
}
