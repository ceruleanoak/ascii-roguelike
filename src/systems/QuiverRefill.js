import { GRID } from '../game/GameConfig.js';

// New room = fresh arrows: every quick-slot bow (and wand) refills, then a
// worn Fletch of Arrows tops each bow past its quiver by its bonusArrows.
// Returns the Fletch that acted, or null, so the caller can float its
// Passive Indicator once the room swap has settled (announceQuiverFull).
export function refillQuiversForNewRoom(player) {
  for (const item of player.quickSlots) item?.resetUses?.();
  const fletch = player.equippedConsumables?.find(c => c?.data?.bonusArrows);
  if (!fletch) return null;
  let acted = false;
  for (const item of player.quickSlots) {
    if (item?.data?.weaponType !== 'BOW' || item.maxUses === null) continue;
    item.usesRemaining = item.maxUses + fletch.data.bonusArrows;
    acted = true;
  }
  return acted ? fletch : null;
}

// The Fletch's Passive Indicator, floated over the player the way the
// Compass floats FIND IT (CompassSystem.announceFind).
export function announceQuiverFull(game, fletch) {
  const player = game.player;
  if (!player) return;
  const data = fletch.data;
  game.combatSystem?.createDamageNumber?.(
    data.passiveIndicator, player.position.x, player.position.y - GRID.CELL_SIZE, data.color, 1, 1.2
  );
}
