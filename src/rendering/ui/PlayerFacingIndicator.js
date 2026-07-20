/**
 * PlayerFacingIndicator - small '^' orbiting tight around the player,
 * rotated to reflect the current facing/attack direction, every frame.
 *
 * Visibility follows the held weapon's attack phase: white during windup
 * (telegraphing the coming swing), hidden during the attack itself and its
 * recovery/cooldown, and the player's own display color otherwise.
 */

import { GRID } from '../../game/GameConfig.js';

const OFFSET = GRID.CELL_SIZE * 0.55;

export function drawPlayerFacingIndicator(renderer, game) {
  const heldItem = game.player.heldItem;
  if (heldItem?.windupActive) {
    drawIndicator(renderer, game, '#ffffff');
  } else if (heldItem?.cooldownTimer > 0) {
    return;
  } else {
    drawIndicator(renderer, game, game.player.getDisplayColor());
  }
}

function drawIndicator(renderer, game, color) {
  const facingAngle = Math.atan2(game.player.facing.x, -game.player.facing.y);
  const cx = game.player.position.x + GRID.CELL_SIZE / 2 + Math.sin(facingAngle) * OFFSET;
  const cy = game.player.position.y + GRID.CELL_SIZE / 2 - Math.cos(facingAngle) * OFFSET;
  renderer.drawEntityRotated(cx, cy, '^', color, facingAngle);
}
