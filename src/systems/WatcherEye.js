import { GRID } from '../game/GameConfig.js';
import { BackgroundObject } from '../entities/BackgroundObject.js';

/**
 * WatcherEye — the Watcher Eye trigger kind ('eye'): an eye set in front of a
 * red Barricade that shuts the moment it sees the player coming, and a blade
 * landed on it while it is open is the only thing that opens the plug.
 *
 * It is a triggerMachine trigger like a switch or a Push Rock, so the
 * Barricade's "every trigger active" poll lifts the plug with no wiring of its
 * own. What makes it a mastery gate is the timing: walk up to it and it is
 * shut long before any swing arrives; roll up to it and it has not looked yet,
 * so the dagger's roll-end stab (CharacterSystem.triggerDaggerRollAttack)
 * lands while it is still open. Anything the enemies cannot see (the Cyan
 * roll's hide, the Moss Cloak) the eye cannot see either.
 *
 * Rules:
 *   - It notices a player within NOTICE_CELLS who is not rolling, hidden or
 *     cloaked — the same exemptions enemyVision gives — and shuts once it has
 *     been looking for REACT_SECONDS.
 *   - Shut, it stays shut until the player has been out of its notice for
 *     REOPEN_SECONDS, so a player who walked in cannot roll the last cell.
 *   - Only a melee hit counts, and only on an open eye (strikeWatcherEye, from
 *     CombatSystem's melee loop). It is indestructible and blocks shots, and it
 *     is not a puzzleSignal object, so bullets, arrows, thrown weapons,
 *     boomerangs, bombs and rolling rocks all go off it without a mark.
 *   - Once struck it stays struck: the activation is always permanent.
 */

// How near the player may come, cell centre to cell centre, before the eye
// sees them. Wider than a dagger, a spear or a sword reaches, so nobody stands
// outside it and still lands a blow; the 2-cell roll is what crosses it.
const NOTICE_CELLS = 3;

// How long the eye looks before it shuts. Shorter than any walk across the
// notice ring plus a swing, longer than the frame or two between a roll's end
// and the stab it fires.
const REACT_SECONDS = 0.2;

// How long the player must be out of sight before a shut eye opens again.
const REOPEN_SECONDS = 1.0;

const OPEN_CHAR = 'o';
const SHUT_CHAR = '-';
const STRUCK_CHAR = '*';
const OPEN_COLOR = '#ff4444';
const SHUT_COLOR = '#884444';
const STRUCK_COLOR = '#ffcc44';

/**
 * Build a Watcher Eye at a cell. Every field the read touches is declared
 * here, so the object never grows state lazily at runtime.
 */
export function createWatcherEye(col, row) {
  const cs = GRID.CELL_SIZE;
  const obj = BackgroundObject.createVariant('watcher_eye', col * cs, row * cs);
  obj.kind = 'eye';
  obj.activation = 'permanent';
  obj.neutralizeSeconds = 0;
  obj.active = false;
  obj._timer = 0;
  obj.pulseTimer = 0;
  obj.eyeShut = false;
  obj.eyeWatchTimer = 0;   // seconds the eye has been looking at the player
  obj.eyeAwayTimer = 0;    // seconds the player has been out of its sight
  obj.eyeStruck = false;   // a melee hit landed on it open; consumed by the read
  obj.structural = true;
  paintEye(obj);
  return obj;
}

/**
 * triggerMachine's per-kind read for 'eye'. True on the frame a strike lands
 * on it open — a one-time pulse, held forever by the permanent activation.
 */
export function readWatcherEye(eye, dt, player) {
  if (eye.active) return false;
  if (eye.eyeStruck) {
    eye.eyeStruck = false;
    eye.eyeShut = false;
    paintEye(eye, true);
    return true;
  }

  if (sees(eye, player)) {
    eye.eyeAwayTimer = 0;
    eye.eyeWatchTimer += dt;
    if (!eye.eyeShut && eye.eyeWatchTimer >= REACT_SECONDS) {
      eye.eyeShut = true;
      paintEye(eye);
    }
  } else {
    eye.eyeWatchTimer = 0;
    eye.eyeAwayTimer += dt;
    if (eye.eyeShut && eye.eyeAwayTimer >= REOPEN_SECONDS) {
      eye.eyeShut = false;
      paintEye(eye);
    }
  }
  return false;
}

/**
 * A melee attack reached a background object. If it is a Watcher Eye, the
 * blow is spent on it: the player's blade on an open, unstruck eye leaves the
 * mark; anything else (a shut eye, an enemy's swing) only makes it flinch.
 * Returns whether the object was an eye.
 */
export function strikeWatcherEye(obj, byPlayer) {
  if (obj.kind !== 'eye') return false;
  if (byPlayer && !obj.active && !obj.eyeShut) obj.eyeStruck = true;
  else obj._playAnimation('shake');
  return true;
}

function sees(eye, player) {
  if (!player?.position) return false;
  if (player.dodgeRoll?.active || player.hidden || player.mossCloakActive) return false;
  const cs = GRID.CELL_SIZE;
  const dx = (player.position.x + cs / 2) - (eye.position.x + cs / 2);
  const dy = (player.position.y + cs / 2) - (eye.position.y + cs / 2);
  const reach = NOTICE_CELLS * cs;
  return dx * dx + dy * dy <= reach * reach;
}

function paintEye(eye, struck = false) {
  const char = struck ? STRUCK_CHAR : (eye.eyeShut ? SHUT_CHAR : OPEN_CHAR);
  const color = struck ? STRUCK_COLOR : (eye.eyeShut ? SHUT_COLOR : OPEN_COLOR);
  eye.char = char;
  eye.color = color;
  eye.animationChar = char;
  eye.animationColor = color;
}
