import { GRID } from '../game/GameConfig.js';
import { Item } from '../entities/Item.js';

/**
 * PressSystem — operates the oil press inside huts.
 *
 * Players walk up to a `⊓` press, hit SPACE, and pick a raw oil from the
 * pop-up list. The raw is consumed and a pressed oil is added to the
 * consumable inventory.
 */

const PRESS_TABLE = {
  'ŝ': '🜁',  // Sap        → Slick Oil
  'š': '🜂',  // Fire Sap   → Fire Oil
  'ş': '🜄',  // Frost Sap  → Frost Oil
  'ł': '🜔',  // Pollen     → Drowse Oil
};

const INTERACT_RADIUS = GRID.CELL_SIZE * 1.2;

export class PressSystem {
  constructor(game) {
    this.game = game;
  }

  /** True if the player is adjacent to a press object inside the active hut. */
  nearPress() {
    const game = this.game;
    if (!game.player?.inHut || !game.hutInterior) return false;
    const C = GRID.CELL_SIZE;
    const px = game.player.position.x + C / 2;
    const py = game.player.position.y + C / 2;
    for (const obj of game.hutInterior.backgroundObjects) {
      if (obj.char !== '⊓' || obj.destroyed) continue;
      const cx = obj.position.x + C / 2;
      const cy = obj.position.y + C / 2;
      const dx = px - cx, dy = py - cy;
      if (Math.sqrt(dx * dx + dy * dy) < INTERACT_RADIUS) return true;
    }
    return false;
  }

  /** SPACE near a press → open the press menu. */
  handleSpacePress() {
    if (!this.nearPress()) return false;
    this.openPressMenu();
    return true;
  }

  openPressMenu() {
    const game = this.game;
    const counts = new Map();
    const pressable = [];
    for (const ch of game.player.inventory) {
      if (!PRESS_TABLE[ch]) continue;
      counts.set(ch, (counts.get(ch) ?? 0) + 1);
      if (!pressable.includes(ch)) pressable.push(ch);
    }

    if (pressable.length === 0) {
      game.menuSystem.showPickupMessage('NOTHING TO PRESS');
      return;
    }

    game.menuOpen = true;
    game.currentMenuSlot = 'press';
    game.selectedMenuIndex = 0;
    game.menuItems = pressable;
    game.ingredientCounts = counts;
    game.renderController.menuOverlay.render(game);
    game.menuSystem.closeOnMovement = true;
  }

  /** Commit the press: consume one raw, drop pressed oil into consumables. */
  commitSelection(rawChar) {
    const game = this.game;
    const oilChar = PRESS_TABLE[rawChar];
    if (!oilChar) return;

    if (!game.player.inventory.includes(rawChar)) return;
    game.player.removeIngredient(rawChar);

    const oil = new Item(oilChar, game.player.position.x, game.player.position.y);
    game.inventorySystem.consumableInventory.push(oil);

    game.menuSystem.showPickupMessage(oil.data.name);
    game.audioSystem?.playSFX?.('craft');
    game.closeMenu();
    game.updateUI();
  }
}
