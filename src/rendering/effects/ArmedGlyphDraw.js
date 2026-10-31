import { GRID } from '../../game/GameConfig.js';

// Armed Glyph — the Armed Consumable's glyph hovering over the player, so
// what SPACE will use next is always in view: a slot armed with keys 4-8 or a
// Bottle armed from the Bottles column (ConsumableTriggerSystem.armed).
// Bobs gently so it reads as held up, not dropped. Drawn above the Bomb Bag's
// ammo count (drawBombBagCount), which sits just over the player's head.
//
// Player-only overlay on every plane the player can be on — the armedGlyph
// Frame Pass.

const HOVER_CELLS = 1.05;    // glyph centre above the player's top edge
const BOB_PX = 2;
const BOB_PERIOD_MS = 500;
const GLYPH_SCALE = 0.8;

export function drawArmedGlyph(renderer, game) {
  const player = game.player;
  const armed = game.consumableTriggerSystem?.armed();
  if (!player || !armed) return;
  const C = GRID.CELL_SIZE;
  const bob = Math.sin(performance.now() / BOB_PERIOD_MS) * BOB_PX;
  renderer.drawEntityScaled(
    player.position.x + C / 2,
    player.position.y + C / 2 - C * HOVER_CELLS + bob,
    armed.item.char,
    armed.item.color || armed.item.data.color,
    GLYPH_SCALE
  );
}
