import { GRID, COLORS } from '../../game/GameConfig.js';
import { FORGE_SLOT_OFFSETS } from '../../systems/ForgeSystem.js';

// Dragon Forge render helper (ForgeSystem), split out of ExploreRenderer.js to
// stay under its architecture budget — standalone function taking `renderer`,
// matching drawSinkholes. Surface-only: the forge stands in the zone boss
// room, which has no interior plane, so there is no PiP pass to mirror.
//
// Drawn on the foreground every frame: the bracket triad in the REST
// station's shape, its brackets flickering between two ember tones, slot
// contents in item colour, and the nearest-slot highlight. No labels — the
// glyphs speak for themselves.

const EMBER_TONES = ['#ff6600', '#cc3300'];
const FLICKER_MS = 250;

export function drawDragonForge(renderer, game) {
  const forge = game.currentRoom?.dragonForge;
  if (!forge) return;
  const C = GRID.CELL_SIZE;
  const half = C / 2;
  const cy = forge.row * C + half;
  const cellX = col => col * C + half;

  // Brackets: '[' before each slot glyph and one closing ']' — the REST
  // station's overlapping bracket pattern, ember instead of chrome.
  const tone = EMBER_TONES[Math.floor(performance.now() / FLICKER_MS) % EMBER_TONES.length];
  const { left, center, right } = FORGE_SLOT_OFFSETS;
  for (const offset of [left, center, right]) {
    renderer.drawEntity(cellX(forge.col + offset - 1), cy, '[', tone);
  }
  renderer.drawEntity(cellX(forge.col + right + 1), cy, ']', tone);

  const state = game.forgeSystem.crafting.getState();
  if (state.leftSlot) renderer.drawEntity(cellX(forge.col + left), cy, state.leftSlot, COLORS.ITEM);
  if (state.centerSlot) renderer.drawEntity(cellX(forge.col + center), cy, state.centerSlot, COLORS.ITEM);
  if (state.rightSlot) renderer.drawEntity(cellX(forge.col + right), cy, state.rightSlot, COLORS.ITEM);

  const nearest = game.forgeSystem.getNearestSlot();
  if (nearest) renderer.drawRect(nearest.col * C, nearest.row * C, C, C, COLORS.HIGHLIGHT, true);
}
