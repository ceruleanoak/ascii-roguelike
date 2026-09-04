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

// True while wielding a Torch OR while an equipped, unspent Fire Berry is
// providing its passive glow (player.fireBerryLit, set in
// InventorySystem.applyEquipmentEffectsToPlayer). Single source of truth for
// the 3 render call sites that gate torch-light on wielding alone.
export function hasTorchLight(game) {
  return isWieldingTorch(game) || !!game.player?.fireBerryLit;
}

export function drawPlayerTorchLight(renderer, x, y) {
  const s = 0.5 + 0.5 * Math.sin((performance.now() / 1000) * PLAYER_TORCH_PULSE_SPEED);
  const alpha = PLAYER_TORCH_ALPHA_LOW + (PLAYER_TORCH_ALPHA_HIGH - PLAYER_TORCH_ALPHA_LOW) * s;
  renderer.drawCircle(x, y, PLAYER_TORCH_LIGHT_RADIUS, PLAYER_TORCH_COLOR, true, alpha);
}

// Underground fog-of-war overlay: darken everything outside the player's
// visibility radius. Drawn after all entities so it clips both fg content and
// the bg canvas beneath.
//
// The fog is drawn CELL BY CELL rather than as one circular hole: each cell
// gets a black wash whose alpha ramps from clear at the player to solid at the
// radius, so an enemy standing at the edge of vision is dim but readable
// instead of being cut in half by a hard circle. Retro alpha quantization
// (installRetroAlphaQuantization) rounds each cell's alpha to a 10% step, which
// is what turns the ramp into the intended banded, grid-shaped falloff instead
// of a smooth gradient.
//
// The wash is pure black, not the zone's ground color: underground is its own
// dark place, and tinting the fog with the surface palette let the zone's
// daylight ground read through the dark.
const FOG_COLOR = '#000000';

// Fraction of the radius that stays fully lit before the ramp starts. Below
// this the player's own cell and its immediate neighbours are unwashed.
const FOG_CORE_FRACTION = 0.35;

export function drawUndergroundFogOverlay(renderer, game) {
  if (!(game.currentRoom?.underground && game.player?.plane === 1)) return;
  const torchLit = hasTorchLight(game);
  const fogRadius = (game.currentRoom.underground.caveFogRadius || 5) * CS * (torchLit ? 1.5 : 1);
  const px = game.player.position.x + CS / 2;
  const py = game.player.position.y + CS / 2;
  const ctx = renderer.fgCtx;

  ctx.save();
  ctx.fillStyle = FOG_COLOR;

  // Everything outside the lit square is solid black, painted as four slabs
  // rather than thousands of individually-filled cells.
  const minCol = Math.max(0, Math.floor((px - fogRadius) / CS));
  const maxCol = Math.min(GRID.COLS - 1, Math.floor((px + fogRadius) / CS));
  const minRow = Math.max(0, Math.floor((py - fogRadius) / CS));
  const maxRow = Math.min(GRID.ROWS - 1, Math.floor((py + fogRadius) / CS));
  const boxX = minCol * CS;
  const boxY = minRow * CS;
  const boxW = (maxCol - minCol + 1) * CS;
  const boxH = (maxRow - minRow + 1) * CS;
  ctx.globalAlpha = 1;
  ctx.fillRect(0, 0, GRID.WIDTH, boxY);
  ctx.fillRect(0, boxY + boxH, GRID.WIDTH, GRID.HEIGHT - (boxY + boxH));
  ctx.fillRect(0, boxY, boxX, boxH);
  ctx.fillRect(boxX + boxW, boxY, GRID.WIDTH - (boxX + boxW), boxH);

  // Inside the lit square, one wash per cell keyed to that cell's centre.
  const core = fogRadius * FOG_CORE_FRACTION;
  const ramp = Math.max(1, fogRadius - core);
  for (let row = minRow; row <= maxRow; row++) {
    for (let col = minCol; col <= maxCol; col++) {
      const dx = col * CS + CS / 2 - px;
      const dy = row * CS + CS / 2 - py;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const alpha = Math.min(1, Math.max(0, (dist - core) / ramp));
      if (alpha <= 0) continue;
      ctx.globalAlpha = alpha;
      ctx.fillRect(col * CS, row * CS, CS, CS);
    }
  }

  ctx.globalAlpha = 1;
  ctx.restore();
  if (torchLit) drawPlayerTorchLight(renderer, px, py);
}
