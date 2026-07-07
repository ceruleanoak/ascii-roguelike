import { GRID } from '../../game/GameConfig.js';

/**
 * torchLight — shared "player is carrying a lit Torch" glow, reused by
 * HutInteriorOverlay (hut + dungeon), MazeInteriorOverlay, and ExploreRenderer's
 * underground fog-of-war. Purely cosmetic reinforcement of the Maze Torch
 * auto-lighting mechanic — carries no gameplay effect outside the underground
 * fog-radius boost applied where it's drawn.
 */

const CS = GRID.CELL_SIZE;

export const PLAYER_TORCH_LIGHT_RADIUS = CS * 2;
export const PLAYER_TORCH_ALPHA_HIGH   = 0.4;
export const PLAYER_TORCH_ALPHA_LOW    = 0.15;
export const PLAYER_TORCH_PULSE_SPEED  = 2.2;
export const PLAYER_TORCH_COLOR        = '#ffaa33';

export function isWieldingTorch(game) {
  return game.player?.heldItem?.data?.name === 'Torch';
}

export function drawPlayerTorchLight(renderer, x, y) {
  const s = 0.5 + 0.5 * Math.sin((performance.now() / 1000) * PLAYER_TORCH_PULSE_SPEED);
  const alpha = PLAYER_TORCH_ALPHA_LOW + (PLAYER_TORCH_ALPHA_HIGH - PLAYER_TORCH_ALPHA_LOW) * s;
  renderer.drawCircle(x, y, PLAYER_TORCH_LIGHT_RADIUS, PLAYER_TORCH_COLOR, true, alpha);
}
