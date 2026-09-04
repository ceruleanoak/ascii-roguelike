/**
 * ContextHints — the three small marks EXPLORE draws near the player to say
 * "something here responds to you": the known-spell letters above the head,
 * the coin-in-pocket 'c' in a live Well room, and the SPACE ENTER prompt at an
 * exterior hut/dungeon/maze door.
 *
 * They live together because they share a spot on screen (stacked above the
 * player, one row apart) and a rule: each one shows only that the player HAS
 * something, never what to do with it. Extracted from ExploreRenderer, which
 * calls all three from its foreground pass — they read no renderer state
 * beyond the fg canvas, so they never belonged to the render loop itself.
 */

import { GRID, ROOM_TYPES } from '../../game/GameConfig.js';
import { spectaclesTransform, spectaclesTransformString, isSpectaclesActive } from '../../data/cipher.js';

// Hint rows stack upward from just above the player's head.
const HINT_ROW_H = GRID.CELL_SIZE * 0.82;
const HINT_BASE_OFFSET = GRID.CELL_SIZE * 0.9;

/**
 * Renders each known spell word above the player, one row per word, with the
 * leading letters the player has already typed lit green and the rest dim —
 * so a half-typed spell shows its own progress without a progress bar.
 */
export function drawKnownSpellHints(renderer, game) {
  const knownSpells = game.knownSpells;
  if (!knownSpells?.size) return;

  const C = GRID.CELL_SIZE;
  const keyBuffer = game.keyBuffer ?? [];
  const ctx = renderer.fgCtx;

  ctx.save();
  ctx.font = `${Math.round(C * 0.65)}px 'Unifont', monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const charW = ctx.measureText('M').width;
  const spacing = charW * 1.35;
  const cx = game.player.position.x + C / 2;
  const baseY = game.player.position.y - HINT_BASE_OFFSET;

  let row = 0;
  for (const word of knownSpells) {
    const totalW = spacing * (word.length - 1);
    const startX = cx - totalW / 2;
    const cy = baseY - row * HINT_ROW_H;

    // Count how many leading letters of this word are in the buffer tail
    let progress = 0;
    for (let len = Math.min(keyBuffer.length, word.length); len >= 1; len--) {
      const suffix = keyBuffer.slice(keyBuffer.length - len).join('');
      if (word.startsWith(suffix)) { progress = len; break; }
    }

    const specOn = isSpectaclesActive(game);
    for (let i = 0; i < word.length; i++) {
      ctx.fillStyle = i < progress ? '#88ff88' : '#333333';
      ctx.fillText(spectaclesTransform(word[i], specOn), startX + i * spacing, cy);
    }

    row++;
  }

  ctx.restore();
}

/**
 * Renders a small dim 'c' above the player when they're in a W (well) room
 * holding at least one Coin ingredient. Only shown while the well is still
 * usable. Mirrors the spell-hint style so the player reads it as "you have
 * something" without explanation.
 */
export function drawWellCoinHint(renderer, game) {
  const room = game.currentRoom;
  if (!room || room.type !== ROOM_TYPES.WELL) return;
  if (!room.well || room.well.consumed) return;
  if (!game.inventorySystem?.hasCoin()) return;

  const C = GRID.CELL_SIZE;
  const ctx = renderer.fgCtx;
  const cx = game.player.position.x + C / 2;
  // Sit above any existing spell hints by a row.
  const knownCount = game.knownSpells?.size || 0;
  const cy = game.player.position.y - HINT_BASE_OFFSET - knownCount * HINT_ROW_H;

  ctx.save();
  ctx.font = `${Math.round(C * 0.65)}px 'Unifont', monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffff66';
  ctx.globalAlpha = 0.55;
  ctx.fillText(spectaclesTransform('c', isSpectaclesActive(game)), cx, cy);
  ctx.restore();
}

/**
 * Renders a "SPACE  ENTER" prompt above the door glyph when the player
 * is within interaction range of an exterior hut, dungeon, or maze door.
 */
export function drawDoorPrompts(renderer, game) {
  if (!game.player) return;

  let doorPosition = null;
  if (game.hutSystem?.nearExteriorDoor()) {
    doorPosition = game.currentRoom?.hut?.doorPosition;
  } else if (game.dungeonSystem?.nearExteriorDoor()) {
    doorPosition = game.currentRoom?.dungeon?.doorPosition;
  } else if (game.mazeSystem?.nearExteriorDoor()) {
    doorPosition = game.currentRoom?.maze?.doorPosition;
  }

  if (!doorPosition) return;

  const C = GRID.CELL_SIZE;
  const ctx = renderer.fgCtx;
  ctx.save();
  ctx.font = `10px 'Unifont', monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ccccaa';
  ctx.fillText(
    spectaclesTransformString('SPACE  ENTER', isSpectaclesActive(game)),
    doorPosition.col * C + C / 2,
    doorPosition.row * C - C * 0.75
  );
  ctx.restore();
}
