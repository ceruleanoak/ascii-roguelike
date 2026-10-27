import { GRID } from '../game/GameConfig.js';

/**
 * PoleVault — the spear's Pole Vault: roll the way a spear thrust is still
 * pointing, while the thrust is still out, and the roll carries the player
 * clean over one cell of Chasm instead of stopping at its edge.
 *
 * Not the Vault (the red V room) — the two share a word and nothing else.
 *
 * It is a property of the roll, not a move of its own: the roll starts as any
 * roll does (its i-frames, its hide, its cooldown), and this only decides
 * where its body goes. It is the answer to the red `gap_lock` Barricade, whose
 * plug is a Chasm in front of the exit letter. The yellow mage's blink crosses
 * the same Chasm without a spear; that is an accepted second answer.
 *
 * Rules, all checked once at roll start (tryPoleVault):
 *   - the weapon in hand is a spear, and one of its thrust's strikes is still
 *     out or still queued (CombatSystem.meleeAttacks / pendingMeleeAttacks);
 *   - the roll is cardinal and points the way the player faces;
 *   - the next cell that way holds a Chasm (`data.chasm`), and the cell past
 *     it is somewhere the player could stand. A vault that would land in a
 *     wall is no vault: the roll stays an ordinary roll and stops at the edge.
 * Then the roll eases the player from where they stood to the far cell over
 * its own duration, with background collision off (nothing else lies on the
 * path, which the check above guarantees), and lands them on the cell exactly.
 *
 * Only Chasm objects count. A dungeon Puzzle Room's Gap is a collision-map cell
 * rather than an object, and nothing yet asks to be vaulted there.
 */

/**
 * Called right after a roll starts (CharacterSystem). Returns whether the roll
 * became a vault.
 */
export function tryPoleVault(game, player, direction) {
  if (player.dodgeRoll.type === 'blink') return false;
  if (!holdsThrustingSpear(game, player)) return false;

  const dx = Math.sign(Math.round(direction.x));
  const dy = Math.sign(Math.round(direction.y));
  if (Math.abs(dx) + Math.abs(dy) !== 1) return false;
  if (Math.sign(player.facing?.x ?? 0) !== dx || Math.sign(player.facing?.y ?? 0) !== dy) return false;

  const cs = GRID.CELL_SIZE;
  const col = Math.floor((player.position.x + cs / 2) / cs);
  const row = Math.floor((player.position.y + cs / 2) / cs);
  const backgroundObjects = game._activeBackgroundObjects?.() ?? [];
  if (!chasmAt(backgroundObjects, col + dx, row + dy)) return false;

  const toCol = col + dx * 2;
  const toRow = row + dy * 2;
  if (toCol < 0 || toCol >= GRID.COLS || toRow < 0 || toRow >= GRID.ROWS) return false;
  const toX = toCol * cs;
  const toY = toRow * cs;
  const room = game.activeRoom ?? game.currentRoom ?? null;
  if (game.physicsSystem.overlapsSolid(player, toX, toY, backgroundObjects, room)) return false;

  player.dodgeRoll.vault = { fromX: player.position.x, fromY: player.position.y, toX, toY };
  player.ignoreBackgroundCollision = true;
  return true;
}

/**
 * One frame of an active vault (PlayerDodgeRollSystem.update): the body is
 * placed along the jump rather than pushed by velocity, so nothing the roll
 * would normally bump into can shorten it.
 */
export function stepPoleVault(player) {
  const vault = player.dodgeRoll.vault;
  const t = Math.min(1, Math.max(0, 1 - player.dodgeRoll.timer / player.dodgeRoll.duration));
  player.position.x = vault.fromX + (vault.toX - vault.fromX) * t;
  player.position.y = vault.fromY + (vault.toY - vault.fromY) * t;
  player.velocity.vx = 0;
  player.velocity.vy = 0;
}

/**
 * Land the vault on its far cell and give the body its collision back. Safe to
 * call for a roll that was cut short from outside (a polymorph, a reset): the
 * player still lands on the far side rather than inside the Chasm.
 */
export function endPoleVault(player) {
  const vault = player.dodgeRoll.vault;
  if (!vault) return;
  player.position.x = vault.toX;
  player.position.y = vault.toY;
  player.dodgeRoll.vault = null;
  player.ignoreBackgroundCollision = false;
}

function holdsThrustingSpear(game, player) {
  const weapon = player.heldItem;
  if (weapon?.data?.weaponSubtype !== 'spear') return false;
  const combat = game.combatSystem;
  if (!combat) return false;
  const isOurs = attack => attack.owner === player;
  return combat.meleeAttacks.some(isOurs) || combat.pendingMeleeAttacks.some(isOurs);
}

function chasmAt(backgroundObjects, col, row) {
  const cs = GRID.CELL_SIZE;
  return backgroundObjects.some(obj =>
    !obj.destroyed && obj.data?.chasm &&
    Math.floor(obj.position.x / cs) === col &&
    Math.floor(obj.position.y / cs) === row);
}
