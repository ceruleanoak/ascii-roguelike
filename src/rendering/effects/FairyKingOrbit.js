import { GRID } from '../../game/GameConfig.js';

// FairyKingOrbit — while an equipped healOnHit consumable (Fairy King in a
// Bottle) is ready (unspent, cooldown 0), a small fairy '*' circles the
// player in the item's colour. It vanishes the moment the heal fires and
// returns when the cooldown ends — the orbit IS the cooldown readout, so
// no HUD text is needed (non-instructive UI).
//
// Player-only overlay, drawn on every plane the player can be on (render-
// helper rule): ExploreRenderer (surface), HutInteriorOverlay and
// MazeInteriorOverlay (interior PiP), and RestRenderer.

const ORBIT_RADIUS = GRID.CELL_SIZE * 0.75;
const ORBIT_SQUASH = 0.55;   // flattened ellipse — reads as circling the body, not a halo
const ORBIT_PERIOD = 1.6;    // seconds per lap
const GLYPH_SCALE = 0.6;

function readyHealOnHitColor(game) {
  const inv = game.inventorySystem;
  const slots = inv?.equippedConsumables;
  if (!slots) return null;
  for (let i = 0; i < slots.length; i++) {
    const item = slots[i];
    if (!item?.data?.healOnHit) continue;
    if (inv.spentConsumableSlots?.[i]) continue;
    if ((inv.consumableCooldowns?.[i] ?? 0) > 0) continue;
    return item.color || item.data.color;
  }
  return null;
}

export function drawFairyKingOrbit(renderer, game) {
  const player = game.player;
  if (!player) return;
  const color = readyHealOnHitColor(game);
  if (!color) return;

  const theta = (performance.now() / 1000 / ORBIT_PERIOD) * Math.PI * 2;
  const cx = player.position.x + GRID.CELL_SIZE / 2;
  const cy = player.position.y + GRID.CELL_SIZE / 2;
  renderer.drawEntityScaled(
    cx + Math.cos(theta) * ORBIT_RADIUS,
    cy + Math.sin(theta) * ORBIT_RADIUS * ORBIT_SQUASH,
    '*',
    color,
    GLYPH_SCALE
  );
}
