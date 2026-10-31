/**
 * WingsSystem.js
 *
 * Says the Wings' Passive Indicator. PlayerDamageSystem spends the room's dodge
 * but has no game to float a word with, so it leaves player.wingsDodgePending
 * and this picks it up on the next tick.
 */

import { GRID } from '../game/GameConfig.js';
import { ITEMS } from '../data/items.js';

export class WingsSystem {
  constructor(game) {
    this.game = game;
  }

  update() {
    const player = this.game.player;
    if (!player?.wingsDodgePending) return;
    player.wingsDodgePending = false;

    const wings = ITEMS['∞'];
    this.game.combatSystem.createDamageNumber(
      wings.passiveIndicator, player.position.x, player.position.y - GRID.CELL_SIZE,
      wings.color, 1, 1.2
    );
  }
}
