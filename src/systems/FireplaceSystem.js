import { GRID } from '../game/GameConfig.js';
import { Item } from '../entities/Item.js';

/**
 * FireplaceSystem — operates the hut fireplace (mirrors PressSystem's shape).
 *
 * Players walk up to a `⌂` fireplace (or the C-room campfire, which is the
 * same station but always lit) and hit SPACE. An unlit fireplace only
 * accepts a Stick, which ignites it (recolors the instance, no state machine
 * beyond the one `burning` flag). Once burning, the menu opens up to Meat
 * (100% → Meat Jerky), Grain (100% → Bread), a held Fire Berry (100% → Mana), an equipped Bottle of
 * Water (100% → Bottle of Hot Water — a fourth parallel path to hot water
 * alongside the Caldera fill, the Fire Essence recipe, and the Fire Berry
 * recipe in recipes.js), Sand (100% → Empty Bottle), and Ore and Sticks,
 * both of which open a quantity submenu asking how many to feed at once,
 * then roll each independently for
 * a byproduct: Ore rolls Metal (30%) / Slag (rest, a whiff); Sticks roll Ash
 * (common) / Fire Essence (rare) — a whiff there just feeds the fire.
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

// Ore fed to an already-burning fireplace: smelting roll, Metal or a Slag whiff.
const ORE_METAL_CHANCE = 0.30;

const INTERACT_RADIUS = GRID.CELL_SIZE * 1.2;
const TORCH_CHAR = '♨';
const SAND_CHAR = 'D';
const EMPTY_BOTTLE_CHAR = 'B';
const GRAIN_CHAR = 'ψ';
const BREAD_CHAR = '⌬';

export class FireplaceSystem {
  constructor(game) {
    this.game = game;
  }

  /**
   * The nearby fireplace instance, or null. The C-room campfire counts as a
   * fireplace that is always burning (RoomGenerator sets `burning` on it).
   * When the CampNPC beside it is nearer to the player than the fire, SPACE
   * belongs to the NPC's coin offering instead.
   */
  _findFireplace() {
    const game = this.game;
    if (!game.player) return null;
    const C = GRID.CELL_SIZE;
    const px = game.player.position.x + C / 2;
    const py = game.player.position.y + C / 2;
    const distTo = (pos) => Math.hypot(px - (pos.x + C / 2), py - (pos.y + C / 2));
    for (const obj of game._activeBackgroundObjects()) {
      if ((obj.char !== '⌂' && !obj.isCampfire) || obj.destroyed) continue;
      const dist = distTo(obj.position);
      if (dist >= INTERACT_RADIUS) continue;
      const npc = obj.isCampfire ? (game.companion ?? game.currentRoom?.campNPC) : null;
      if (npc && distTo(npc.position) < dist) continue;
      return obj;
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
      const grainCount = game.inventorySystem.countIngredient(GRAIN_CHAR);
      if (grainCount > 0) {
        counts.set(GRAIN_CHAR, grainCount);
        items.push(GRAIN_CHAR);
      }
      const oreCount = game.inventorySystem.countIngredient('2');
      if (oreCount > 0) {
        counts.set('2', oreCount);
        items.push('2');
      }
      const sandCount = game.inventorySystem.countIngredient(SAND_CHAR);
      if (sandCount > 0) {
        counts.set(SAND_CHAR, sandCount);
        items.push(SAND_CHAR);
      }
      const berryCount = game.inventorySystem.consumableInventory.filter(it => it.char === '❋').length;
      if (berryCount > 0) {
        counts.set('❋', berryCount);
        items.push('❋');
      }
      const hasWaterBottle = game.player.equippedConsumables.some(s => s?.char === '🜉');
      if (hasWaterBottle) {
        counts.set('🜉', 1);
        items.push('🜉');
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
      game.menuSystem.announceItem(jerky.char);
    } else if (rawChar === GRAIN_CHAR) {
      if (!fireplace.burning || !game.removeIngredient(GRAIN_CHAR)) return;
      const bread = new Item(BREAD_CHAR, game.player.position.x, game.player.position.y);
      const stacked = game.inventorySystem.mergeStackableConsumable(bread);
      if (!stacked) game.inventorySystem.consumableInventory.push(bread);
      game.menuSystem.announceItem(bread.char);
    } else if (rawChar === SAND_CHAR) {
      if (!fireplace.burning || !game.removeIngredient(SAND_CHAR)) return;
      const bottle = new Item(EMPTY_BOTTLE_CHAR, game.player.position.x, game.player.position.y);
      const stacked = game.inventorySystem.mergeStackableConsumable(bottle);
      if (!stacked) game.inventorySystem.consumableInventory.push(bottle);
      game.menuSystem.announceItem(bottle.char);
    } else if (rawChar === '2') {
      // Ore, like Sticks, opens a quantity submenu rather than smelting one
      // implicit unit — see openOreQuantityMenu.
      if (!fireplace.burning) return;
      this.openOreQuantityMenu(fireplace);
      return;
    } else if (rawChar === '❋') {
      if (!fireplace.burning) return;
      const berry = game.inventorySystem.consumableInventory.find(it => it.char === '❋');
      if (!berry || !game.inventorySystem.removeFromConsumableInventory(berry)) return;
      game.addIngredient('𝑚');
      game.menuSystem.announceItem('𝑚');
    } else if (rawChar === '🜉') {
      if (!fireplace.burning) return;
      const idx = game.player.equippedConsumables.findIndex(s => s?.char === '🜉');
      if (idx === -1) return;
      game.inventorySystem.replaceConsumableSlot(idx, '🜊');
      // Reverts after 3 room exits, same decay as the Caldera fill — see
      // main.js's room-transition reset block.
      game.player.equippedConsumables[idx].hotWaterRoomsLeft = 3;
      game.menuSystem.announceItem('🜊');
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

  /** How many ore to smelt at once, 1..oreCount. Mirrors openStickQuantityMenu. */
  openOreQuantityMenu(fireplace) {
    const game = this.game;
    const oreCount = game.inventorySystem.countIngredient('2');
    if (oreCount === 0) return;

    const items = [];
    for (let n = 1; n <= oreCount; n++) {
      items.push({ action: 'qty', label: `2×${n}`, value: n });
    }

    game.menuOpen = true;
    game.currentMenuSlot = 'fireplace-ore-qty';
    game.selectedMenuIndex = 0;
    game.menuItems = items;
    this.activeFireplace = fireplace;
    game.renderController.menuOverlay.render(game);
    game.menuSystem.closeOnMovement = true;
  }

  /**
   * Commit an ore-quantity submenu pick: smelt that many ore, rolling each
   * independently for Metal (ORE_METAL_CHANCE) or a Slag whiff, and pop the
   * result out of the fireplace as a physical drop (LootSystem) instead of
   * straight-to-inventory — same shape as commitStickQuantity.
   */
  commitOreQuantity(count) {
    const game = this.game;
    const fireplace = this.activeFireplace;
    if (!fireplace || !fireplace.burning) return;

    const C = GRID.CELL_SIZE;
    const dropX = fireplace.position.x + C / 2;
    const dropY = fireplace.position.y + C / 2;

    for (let i = 0; i < count; i++) {
      if (!game.removeIngredient('2')) break;
      const char = Math.random() < ORE_METAL_CHANCE ? 'M' : '4';
      game.lootSystem.spawnIngredientDrop(char, dropX, dropY);
    }

    game.audioSystem?.playSFX?.('craft');
    game.closeMenu();
    game.updateUI();
  }
}
