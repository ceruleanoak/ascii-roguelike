import { GRID } from '../game/GameConfig.js';
import { Item } from '../entities/Item.js';

/**
 * FireplaceSystem — operates the hut fireplace (mirrors PressSystem's shape).
 *
 * Players walk up to a `⌂` fireplace and hit SPACE. An unlit fireplace only
 * accepts a Stick, which ignites it (recolors the instance, no state machine
 * beyond the one `burning` flag). Once burning, the menu opens up to Meat
 * (100% → Meat Jerky), Ore (100% → Metal), a held Fire Berry (100% → Mana),
 * and further Sticks — picking Stick opens a quantity submenu asking how
 * many to contribute at once, then rolls each stick independently for a
 * byproduct (Ash, common; Fire Essence, rare — a whiff just feeds the fire).
 * Byproducts pop out of the fireplace as physical drops (LootSystem) rather
 * than landing straight in inventory, same as any other world pickup.
 * `burning` lives on the BackgroundObject instance, so it resets for free
 * every time HutSystem regenerates the hut.
 *
 * A Torch in any quick slot lights an unlit fireplace on approach, no
 * SPACE/stick needed — checked passively every frame via update().
 */

const UNLIT_COLOR = '#886655';
const LIT_COLOR = '#ff6622';

// Sticks fed to an already-burning fireplace: roll for a byproduct, in order.
// Neither hits → the stick just feeds the fire, no output.
const STOKE_ASH_CHANCE = 0.60;
const STOKE_ESSENCE_CHANCE = 0.10;

const INTERACT_RADIUS = GRID.CELL_SIZE * 1.2;
const TORCH_CHAR = '♨';

export class FireplaceSystem {
  constructor(game) {
    this.game = game;
  }

  /** The nearby fireplace instance, or null. */
  _findFireplace() {
    const game = this.game;
    if (!game.player?.inHut || !game.activeFloor) return null;
    const C = GRID.CELL_SIZE;
    const px = game.player.position.x + C / 2;
    const py = game.player.position.y + C / 2;
    for (const obj of game.activeFloor.backgroundObjects) {
      if (obj.char !== '⌂' || obj.destroyed) continue;
      const cx = obj.position.x + C / 2;
      const cy = obj.position.y + C / 2;
      const dx = px - cx, dy = py - cy;
      if (Math.sqrt(dx * dx + dy * dy) < INTERACT_RADIUS) return obj;
    }
    return null;
  }

  /**
   * Passive tick: a Torch parked in any quick slot (not necessarily the
   * held/active one — "equipped" mirrors TrapSystem's slot-presence check)
   * ignites an unlit fireplace the moment the player is in range, mirroring
   * how a real torch would light one without any menu interaction.
   */
  update() {
    const fireplace = this._findFireplace();
    if (!fireplace || fireplace.burning) return;
    const game = this.game;
    const hasTorch = game.player.quickSlots.some(slot => slot?.char === TORCH_CHAR);
    if (!hasTorch) return;

    fireplace.burning = true;
    fireplace.color = LIT_COLOR;
    fireplace.animationColor = LIT_COLOR;
    game.menuSystem.showPickupMessage('FIREPLACE LIT');
    game.audioSystem?.playSFX?.('craft');
  }

  /** SPACE near a fireplace → open its menu. */
  handleSpacePress() {
    const fireplace = this._findFireplace();
    if (!fireplace) return false;
    this.openFireplaceMenu(fireplace);
    return true;
  }

  openFireplaceMenu(fireplace) {
    const game = this.game;
    const counts = new Map();
    const items = [];

    const stickCount = game.inventorySystem.countIngredient('|');
    if (stickCount > 0) {
      counts.set('|', stickCount);
      items.push('|');
    }

    if (fireplace.burning) {
      const meatCount = game.inventorySystem.countIngredient('m');
      if (meatCount > 0) {
        counts.set('m', meatCount);
        items.push('m');
      }
      const oreCount = game.inventorySystem.countIngredient('2');
      if (oreCount > 0) {
        counts.set('2', oreCount);
        items.push('2');
      }
      const berryCount = game.inventorySystem.consumableInventory.filter(it => it.char === '❋').length;
      if (berryCount > 0) {
        counts.set('❋', berryCount);
        items.push('❋');
      }
    }

    if (items.length === 0) {
      game.menuSystem.showPickupMessage(fireplace.burning ? 'NOTHING TO ADD' : 'NEEDS A STICK');
      return;
    }

    game.menuOpen = true;
    game.currentMenuSlot = 'fireplace';
    game.selectedMenuIndex = 0;
    game.menuItems = items;
    game.ingredientCounts = counts;
    this.activeFireplace = fireplace; // instance field, not game-scoped — mirrors AlchemySystem.cauldronStage
    game.renderController.menuOverlay.render(game);
    game.menuSystem.closeOnMovement = true;
  }

  /** Commit the fireplace menu selection. */
  commitSelection(rawChar) {
    const game = this.game;
    const fireplace = this.activeFireplace;
    if (!fireplace) return;

    if (rawChar === '|') {
      if (!fireplace.burning) {
        if (!game.removeIngredient('|')) return;
        fireplace.burning = true;
        fireplace.color = LIT_COLOR;
        fireplace.animationColor = LIT_COLOR;
        game.menuSystem.showPickupMessage('FIREPLACE LIT');
      } else {
        // Already burning — how many sticks to feed it is a separate
        // quantity submenu rather than a single implicit stick.
        this.openStickQuantityMenu(fireplace);
        return;
      }
    } else if (rawChar === 'm') {
      if (!fireplace.burning || !game.removeIngredient('m')) return;
      const jerky = new Item('ᒧ', game.player.position.x, game.player.position.y);
      const stacked = game.inventorySystem.mergeStackableConsumable(jerky);
      if (!stacked) game.inventorySystem.consumableInventory.push(jerky);
      game.menuSystem.showPickupMessage(jerky.data.name);
    } else if (rawChar === '2') {
      if (!fireplace.burning || !game.removeIngredient('2')) return;
      game.addIngredient('M');
      game.menuSystem.showPickupMessage('Metal');
    } else if (rawChar === '❋') {
      if (!fireplace.burning) return;
      const berry = game.inventorySystem.consumableInventory.find(it => it.char === '❋');
      if (!berry || !game.inventorySystem.removeFromConsumableInventory(berry)) return;
      game.addIngredient('𝑚');
      game.menuSystem.showPickupMessage('Mana');
    } else {
      return;
    }

    game.audioSystem?.playSFX?.('craft');
    game.closeMenu();
    game.updateUI();
  }

  /** How many sticks to feed the already-burning fireplace, 1..stickCount. */
  openStickQuantityMenu(fireplace) {
    const game = this.game;
    const stickCount = game.inventorySystem.countIngredient('|');
    if (stickCount === 0) return;

    const items = [];
    for (let n = 1; n <= stickCount; n++) {
      items.push({ action: 'qty', label: `|×${n}`, value: n });
    }

    game.menuOpen = true;
    game.currentMenuSlot = 'fireplace-stoke-qty';
    game.selectedMenuIndex = 0;
    game.menuItems = items;
    this.activeFireplace = fireplace;
    game.renderController.menuOverlay.render(game);
    game.menuSystem.closeOnMovement = true;
  }

  /**
   * Commit a stick-quantity submenu pick: consume that many sticks, roll
   * each independently for Ash/Fire Essence, and pop any hits out of the
   * fireplace as physical drops (LootSystem) instead of straight-to-inventory.
   */
  commitStickQuantity(count) {
    const game = this.game;
    const fireplace = this.activeFireplace;
    if (!fireplace || !fireplace.burning) return;

    const C = GRID.CELL_SIZE;
    const dropX = fireplace.position.x + C / 2;
    const dropY = fireplace.position.y + C / 2;

    for (let i = 0; i < count; i++) {
      if (!game.removeIngredient('|')) break;
      const roll = Math.random();
      if (roll < STOKE_ASH_CHANCE) {
        game.lootSystem.spawnIngredientDrop('a', dropX, dropY);
      } else if (roll < STOKE_ASH_CHANCE + STOKE_ESSENCE_CHANCE) {
        game.lootSystem.spawnIngredientDrop('F', dropX, dropY);
      }
    }

    game.audioSystem?.playSFX?.('craft');
    game.closeMenu();
    game.updateUI();
  }
}
