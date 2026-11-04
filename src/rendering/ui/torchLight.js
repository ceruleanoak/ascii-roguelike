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

// Any quick slot carrying a Torch (or a Lantern — every torch read goes by
// weaponSubtype 'torch') counts as "equipped" for the passive glow —
// mirrors the Fire Berry's equipped-regardless-of-active-slot semantics
// (InventorySystem.applyEquipmentEffectsToPlayer) rather than requiring the
// Torch to be the one currently held in hand (bug: torch should emit light
// if equipped regardless of whether its slot is active).
export function isWieldingTorch(game) {
  return !!game.player?.quickSlots?.some(slot => slot?.data?.weaponSubtype === 'torch');
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

// The Lantern throws its light ahead instead of all around: the lit shape is
// a small circle around the player plus a cone in the facing direction, its
// sides the tangents from that circle out to the cone's far arc (the convex
// hull of the circle and the arc). The cone reaches LANTERN_CONE_REACH times
// as far as the light's round glow would; the circle is what the player
// sees unlit, never less than the torch glow.
const LANTERN_CONE_REACH = 1.5;
const LANTERN_CONE_HALF_ANGLE = Math.PI / 6;

// The Lantern is the light with a caged flame (`lightsUnderwater`, items.js) —
// a Torch in any slot still lights all around.
export function isCarryingLantern(game) {
  return isLightingUnderwater(game);
}

// Distance from the player to the lit shape's edge along `angle`: the far arc
// inside the cone, the tangent line between arc end and circle, else the
// circle. `cone` = { facing, radius, reach, halfAngle } (radians/px).
function coneEdgeDistance(cone, angle) {
  let off = Math.abs(angle - cone.facing) % (Math.PI * 2);
  if (off > Math.PI) off = Math.PI * 2 - off;
  if (off <= cone.halfAngle) return cone.reach;
  // The tangent from the arc's end touches the circle `tangentSpan` further
  // round; the tangent line sits `radius` from the player, its normal
  // pointing at the touch point.
  const tangentSpan = Math.acos(cone.radius / cone.reach);
  if (off < cone.halfAngle + tangentSpan) {
    return cone.radius / Math.cos(off - cone.halfAngle - tangentSpan);
  }
  return cone.radius;
}

// The Lantern's cone for a light whose round glow would reach `litRadius`
// and whose dark leaves `unlitRadius` visible. Facing comes from the player.
function lanternCone(game, litRadius, unlitRadius) {
  const facing = game.player.facing;
  const reach = litRadius * LANTERN_CONE_REACH;
  return {
    facing: Math.atan2(facing.y, facing.x),
    radius: Math.min(reach, Math.max(unlitRadius, PLAYER_TORCH_LIGHT_RADIUS)),
    reach,
    halfAngle: LANTERN_CONE_HALF_ANGLE
  };
}

// Draw the fog around (px, py) on `ctx`, in whatever coordinate space ctx is
// currently in (canvas for the surface, interior-translated inside a PiP —
// the PiP clip bounds the slabs there). With a `cone` (Lantern), the lit
// shape is the cone and `fogRadius` is ignored.
function drawVisionFog(ctx, px, py, fogRadius, cone = null) {
  if (cone) fogRadius = cone.reach;
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
  // The ramp runs to the lit shape's edge in that cell's direction: the
  // radius itself for a circle, coneEdgeDistance for the Lantern.
  for (let row = minRow; row <= maxRow; row++) {
    for (let col = minCol; col <= maxCol; col++) {
      const dx = col * CS + CS / 2 - px;
      const dy = row * CS + CS / 2 - py;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const edge = cone ? coneEdgeDistance(cone, Math.atan2(dy, dx)) : fogRadius;
      const core = edge * FOG_CORE_FRACTION;
      const ramp = Math.max(1, edge - core);
      const alpha = Math.min(1, Math.max(0, (dist - core) / ramp));
      if (alpha <= 0) continue;
      ctx.globalAlpha = alpha;
      ctx.fillRect(col * CS, row * CS, CS, CS);
    }
  }

  ctx.globalAlpha = 1;
  ctx.restore();
}

// Underwater (a room flagged `underwater`, e.g. the Sunken Hold): the dark is
// near-total — the player sees little past their own cell. A Torch is out the
// moment it goes under, so its widening doesn't apply; only a quick slot
// holding something with `lightsUnderwater` (the Lantern) pushes the dark back.
const UNDERWATER_FOG_RADIUS_CELLS = 1.25;
const UNDERWATER_LIT_FOG_RADIUS_CELLS = 5;

export function isLightingUnderwater(game) {
  return !!game.player?.quickSlots?.some(slot => slot?.data?.lightsUnderwater);
}

export function underwaterFogRadius(game) {
  if (!game.currentRoom?.underwater) return Infinity;
  return (isLightingUnderwater(game) ? UNDERWATER_LIT_FOG_RADIUS_CELLS : UNDERWATER_FOG_RADIUS_CELLS) * CS;
}

const blindFogRadius = (game) => {
  const blind = game.player?.statusEffects?.blind;
  if (!blind?.active) return Infinity;
  return BLIND_FOG_RADIUS_CELLS[Math.max(1, blind.stacks)] * CS;
};

// Surface pass (ExploreRenderer and NeutralRenderer, drawn after all entities
// so it clips both fg content and the bg canvas beneath): underground cave
// fog, underwater dark and/or blind, whichever is tighter. Blind is skipped
// while the player is inside an interior — the PiP draws its own
// (drawInteriorVisionFogOverlay).
/**
 * How far the player can see on the surface pass, in px from their center —
 * the tighter of cave fog, underwater dark and blind (Infinity = no fog).
 * The fog overlay draws exactly this radius; gameplay that asks "can the
 * player see it?" (e.g. the Sea Serpents' boss music) reads it too.
 */
export function surfaceVisionRadius(game, playerInInterior = false) {
  const player = game.player;
  if (!player) return Infinity;
  const underground = !!(game.currentRoom?.underground && player.plane === 1);
  const torchLit = underground && hasTorchLight(game);
  const caveRadius = underground
    ? (game.currentRoom.underground.caveFogRadius || 5) * CS * (torchLit ? 1.5 : 1)
    : Infinity;
  return Math.min(caveRadius, underwaterFogRadius(game),
    playerInInterior ? Infinity : blindFogRadius(game));
}

export function drawVisionFogOverlay(renderer, game, playerInInterior) {
  const player = game.player;
  if (!player) return;
  const underground = !!(game.currentRoom?.underground && player.plane === 1);
  const torchLit = underground && hasTorchLight(game);
  const underwaterRadius = underwaterFogRadius(game);
  const fogRadius = surfaceVisionRadius(game, playerInInterior);
  if (fogRadius === Infinity) return;

  // The Lantern shapes the dark only while its light is what sets the radius
  // — blind closes in round, whatever is carried.
  const blindBinds = !playerInInterior && blindFogRadius(game) <= fogRadius;
  let cone = null;
  if (!blindBinds && isCarryingLantern(game)) {
    if (underwaterRadius === fogRadius) {
      cone = lanternCone(game, fogRadius, UNDERWATER_FOG_RADIUS_CELLS * CS);
    } else if (torchLit) {
      cone = lanternCone(game, fogRadius, (game.currentRoom.underground.caveFogRadius || 5) * CS);
    }
  }

  const px = player.position.x + CS / 2;
  const py = player.position.y + CS / 2;
  drawVisionFog(renderer.fgCtx, px, py, fogRadius, cone);
  const lanternLit = underwaterRadius !== Infinity && isLightingUnderwater(game);
  if (torchLit || lanternLit) drawPlayerTorchLight(renderer, px, py);
}

// Interior PiP pass (HutInteriorOverlay, MazeInteriorOverlay): the floor's own
// cave fog (`caveFogRadius`, e.g. the Aquifer — widened by a lit torch, as
// underground) and/or blind, whichever is tighter. Drawn inside the overlay's
// interior translate + clip, after the player.
export function drawInteriorVisionFogOverlay(renderer, game) {
  const caveCells = game.activeFloor?.caveFogRadius;
  const caveRadius = caveCells ? caveCells * CS * (hasTorchLight(game) ? 1.5 : 1) : Infinity;
  const blindRadius = blindFogRadius(game);
  const fogRadius = Math.min(caveRadius, blindRadius);
  if (fogRadius === Infinity) return;
  const cone = blindRadius > caveRadius && isCarryingLantern(game)
    ? lanternCone(game, caveRadius, caveCells * CS)
    : null;
  const player = game.player;
  drawVisionFog(renderer.fgCtx, player.position.x + CS / 2, player.position.y + CS / 2, fogRadius, cone);
}
