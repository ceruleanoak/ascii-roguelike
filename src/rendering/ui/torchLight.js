import { GRID } from '../../game/GameConfig.js';

/**
 * torchLight — shared "player is carrying a lit Torch" glow, reused by
 * HutInteriorOverlay (hut + dungeon), MazeInteriorOverlay, and ExploreRenderer's
 * underground fog-of-war. Purely cosmetic reinforcement of the Maze Torch
 * auto-lighting mechanic — carries no gameplay effect outside the underground
 * fog-radius boost applied where it's drawn. Also home to the vision fog that
 * cave darkness and the player's blind status share.
 */

const CS = GRID.CELL_SIZE;

export const PLAYER_TORCH_LIGHT_RADIUS = CS * 2;
export const PLAYER_TORCH_ALPHA_HIGH   = 0.4;
export const PLAYER_TORCH_ALPHA_LOW    = 0.15;
export const PLAYER_TORCH_PULSE_SPEED  = 2.2;
export const PLAYER_TORCH_COLOR        = '#ffaa33';

// Any quick slot carrying a Torch counts as "equipped" for the passive glow —
// mirrors the Fire Berry's equipped-regardless-of-active-slot semantics
// (InventorySystem.applyEquipmentEffectsToPlayer) rather than requiring the
// Torch to be the one currently held in hand (bug: torch should emit light
// if equipped regardless of whether its slot is active).
export function isWieldingTorch(game) {
  return !!game.player?.quickSlots?.some(slot => slot?.data?.name === 'Torch');
}

// True while a Torch is equipped in any quick slot OR while an equipped,
// unspent Fire Berry is providing its passive glow (player.fireBerryLit, set
// in InventorySystem.applyEquipmentEffectsToPlayer). Single source of truth
// for the 3 render call sites that gate torch-light on carrying one.
export function hasTorchLight(game) {
  return isWieldingTorch(game) || !!game.player?.fireBerryLit;
}

export function drawPlayerTorchLight(renderer, x, y) {
  const s = 0.5 + 0.5 * Math.sin((performance.now() / 1000) * PLAYER_TORCH_PULSE_SPEED);
  const alpha = PLAYER_TORCH_ALPHA_LOW + (PLAYER_TORCH_ALPHA_HIGH - PLAYER_TORCH_ALPHA_LOW) * s;
  renderer.drawCircle(x, y, PLAYER_TORCH_LIGHT_RADIUS, PLAYER_TORCH_COLOR, true, alpha);
}

// Vision fog: darken everything outside a radius around the player. Two
// things narrow the player's vision and both draw through here — the
// underground cave fog, and the player's blind Status Effect. Enemies carry
// blind as "attacks miss"; the player carries it from their own perspective,
// as the world closing in around them.
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

// Blind vision radius in cells, by Pip (index = pips): each pip closes the
// world in further, down to 3 at pip 3 — tighter than the cave's 5, so being
// fully blinded underground still reads as a change. A torch doesn't widen
// it: light doesn't help eyes that can't see.
const BLIND_FOG_RADIUS_CELLS = [Infinity, 6, 4.5, 3];

// Draw the fog around (px, py) on `ctx`, in whatever coordinate space ctx is
// currently in (canvas for the surface, interior-translated inside a PiP —
// the PiP clip bounds the slabs there).
function drawVisionFog(ctx, px, py, fogRadius) {
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
}

const blindFogRadius = (game) => {
  const blind = game.player?.statusEffects?.blind;
  if (!blind?.active) return Infinity;
  return BLIND_FOG_RADIUS_CELLS[Math.max(1, blind.stacks)] * CS;
};

// Surface pass (ExploreRenderer, drawn after all entities so it clips both fg
// content and the bg canvas beneath): underground cave fog and/or blind,
// whichever is tighter. Blind is skipped while the player is inside an
// interior — the PiP draws its own (drawInteriorVisionFogOverlay).
export function drawVisionFogOverlay(renderer, game, playerInInterior) {
  const player = game.player;
  if (!player) return;
  const underground = !!(game.currentRoom?.underground && player.plane === 1);
  const torchLit = underground && hasTorchLight(game);
  const caveRadius = underground
    ? (game.currentRoom.underground.caveFogRadius || 5) * CS * (torchLit ? 1.5 : 1)
    : Infinity;
  const fogRadius = Math.min(caveRadius, playerInInterior ? Infinity : blindFogRadius(game));
  if (fogRadius === Infinity) return;

  const px = player.position.x + CS / 2;
  const py = player.position.y + CS / 2;
  drawVisionFog(renderer.fgCtx, px, py, fogRadius);
  if (torchLit) drawPlayerTorchLight(renderer, px, py);
}

// Interior PiP pass (HutInteriorOverlay, MazeInteriorOverlay): blind only,
// drawn inside the overlay's interior translate + clip, after the player.
export function drawInteriorVisionFogOverlay(renderer, game) {
  const fogRadius = blindFogRadius(game);
  if (fogRadius === Infinity) return;
  const player = game.player;
  drawVisionFog(renderer.fgCtx, player.position.x + CS / 2, player.position.y + CS / 2, fogRadius);
}
