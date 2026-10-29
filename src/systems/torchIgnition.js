import { GRID } from '../game/GameConfig.js';

/**
 * torchIgnition — the one rule for lighting an unlit torch: a fire attack
 * (`onHit === 'burn'`, or a burn oil riding on a shot) has to touch its cell.
 * Holding the Torch nearby does nothing; swinging it does, and so does any
 * other fire weapon or burning arrow.
 *
 * Shared by every torch that waits to be lit: Maze Torches (MazeSystem),
 * decorative Puzzle Torches and torch-kind triggers (DungeonPuzzleSystem /
 * triggerMachine). Only the player's attacks count; enemy fire never lights
 * a torch.
 */

const CS = GRID.CELL_SIZE;

function isFire(attack) {
  return attack.onHit === 'burn' || !!attack.extraOnHit?.includes?.('burn');
}

function overlapsCell(attack, cx, cy) {
  const w = attack.width || CS;
  const h = attack.height || CS;
  return attack.position.x < cx + CS && attack.position.x + w > cx
      && attack.position.y < cy + CS && attack.position.y + h > cy;
}

// True when a live player fire attack overlaps the torch's cell this frame.
export function fireStrikesTorch(combat, torch) {
  if (!combat || !torch?.position) return false;
  const { x, y } = torch.position;
  for (const list of [combat.meleeAttacks, combat.projectiles]) {
    for (const attack of list ?? []) {
      if (attack?.position && isFire(attack) && overlapsCell(attack, x, y)) return true;
    }
  }
  return false;
}
