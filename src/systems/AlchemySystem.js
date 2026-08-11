import { GRID } from '../game/GameConfig.js';
import { Item } from '../entities/Item.js';
import { findRecipe } from '../data/recipes.js';
import {
  ALL_STARTER_INGREDIENTS,
  starterPotionForIngredient,
  ingredientToGreek,
  applyPotionModifierColor
} from '../data/alchemy.js';

/**
 * AlchemySystem — operates the Water Trough, Cauldron, and Condenser inside
 * the Alchemy Hut. Modeled on PressSystem's proximity → menu → commit shape.
 *
 * Cauldron supports two paths:
 *
 *   PATH 1: Bottle of Water (3 stages)
 *   'water'   — select an equipped Bottle of Water to place in the cauldron
 *   'starter' — select a held ingredient to brew a starter potion (Base /
 *               Purified / Unstable), which stays in the cauldron
 *   'true'    — select a held ingredient matching the starter's existing
 *               true-potion recipes; result is handed to the player
 *
 *   PATH 2: Starter Potion (2 stages, skips starter creation)
 *   'input'   — select an equipped Bottle of Water or Starter Potion
 *   'true'    — select a held ingredient matching the starter's existing
 *               true-potion recipes; result is handed to the player
 *
 * Condenser reveal (hiddenIngredient) is visual-only this phase — drawn by
 * HutInteriorOverlay reading `game.activeFloor.condenserReveal`.
 */

const INTERACT_RADIUS = GRID.CELL_SIZE * 1.2;
// Bottle-filling sources (trough, hot spring) use a tighter "one cell" radius —
// filling is now an armed-slot action (see tryFillArmedBottle) rather than a
// bare SPACE press, so the looser station radius isn't needed here.
const LIQUID_SOURCE_RADIUS = GRID.CELL_SIZE;
const STARTER_POTION_CHARS = new Set(['🜄', '🜅', '🜆']);
const LIQUID_BOTTLE_CHARS = new Set(['🜉', 'ε', '◆', '◐']);  // Water, Electrified, Magma, Mud

// Map liquid tile states to liquid bottle types
const LIQUID_TILE_TO_BOTTLE = {
  'normal': '🜉',        // Normal water → Bottle of Water
  'electrified': 'ε',    // Electrified water → Bottle of Electrified Water
  'lava': '◆',          // Magma/Lava → Bottle of Magma
  'mud_wet': '◐',       // Mud → Bottle of Mud
  'mud_dry': '◐'        // Dry mud → Bottle of Mud
};

const STARTER_NAMES = {
  '🜄': 'BASE POTION',
  '🜅': 'PURIFIED POTION',
  '🜆': 'UNSTABLE POTION'
};

// Single source of truth for pickup-message names — used by fillLiquidBottle
// below; previously duplicated in InteractionSystem's now-removed
// _discoverLiquidBottle (the old heldItem-based bottling path this replaces).
const LIQUID_BOTTLE_NAMES = {
  '🜉': 'BOTTLE OF WATER',
  'ε': 'BOTTLE OF ELECTRIFIED WATER',
  '◆': 'BOTTLE OF MAGMA',
  '◐': 'BOTTLE OF MUD'
};

export class AlchemySystem {
  constructor(game) {
    this.game = game;
    this.cauldronStage = 'input';
    this.cauldronInputType = null; // 'liquid' or 'starter'
    this.cauldronLiquidType = null; // '🜉', 'ε', '◆', or '◐' (only when inputType is 'liquid')
    this.cauldronStarterChar = null;
    this.cauldronSlotIndex = -1;
  }

  _nearStation(char, radius = INTERACT_RADIUS) {
    const game = this.game;
    if (!game.player?.inHut || !game.activeFloor) return false;
    const C = GRID.CELL_SIZE;
    const px = game.player.position.x + C / 2;
    const py = game.player.position.y + C / 2;
    for (const obj of game.activeFloor.backgroundObjects) {
      if (obj.char !== char || obj.destroyed) continue;
      const cx = obj.position.x + C / 2;
      const cy = obj.position.y + C / 2;
      const dx = px - cx, dy = py - cy;
      if (Math.sqrt(dx * dx + dy * dy) < radius) return true;
    }
    return false;
  }

  nearTrough() { return this._nearStation('≈', LIQUID_SOURCE_RADIUS); }
  nearCauldron() { return this._nearStation('Ω'); }
  nearCondenser() { return this._nearStation('Ψ'); }

  /**
   * SPACE near a station → cauldron opens its menu, condenser reveals.
   * Bottle-filling is NOT handled here — it requires the Bottle slot to be
   * armed first (number key), then fires through tryFillArmedBottle(), which
   * main.js checks ahead of the generic consumable-fire path.
   */
  handleSpacePress() {
    if (this.nearCauldron()) {
      this.openCauldronMenu();
      return true;
    }
    if (this.nearCondenser()) {
      this.revealCondenser();
      return true;
    }
    return false;
  }

  // Red Zone caldera hot spring — outdoor equivalent of the hut trough.
  // Unlike _nearStation, this checks the active outdoor/interior background
  // objects directly (not hut-gated) for a '~' tile with typeId 'hot_water'.
  nearHotSpring() {
    const game = this.game;
    const C = GRID.CELL_SIZE;
    const px = game.player.position.x + C / 2;
    const py = game.player.position.y + C / 2;
    for (const obj of game._activeBackgroundObjects()) {
      if (obj.typeId !== 'hot_water' || obj.destroyed) continue;
      const cx = obj.position.x + C / 2;
      const cy = obj.position.y + C / 2;
      const dx = px - cx, dy = py - cy;
      if (Math.sqrt(dx * dx + dy * dy) < LIQUID_SOURCE_RADIUS) return true;
    }
    return false;
  }

  /**
   * SPACE with the Bottle slot armed (selected via number key) and the player
   * within one cell of a liquid source. Must be checked BEFORE
   * ConsumableTriggerSystem.fireSelected() — an armed Empty Bottle has no
   * consumable effect of its own, so the generic fire path would just
   * silently swallow the SPACE press and clear the selection.
   */
  tryFillArmedBottle() {
    const game = this.game;
    const idx = game.player?.selectedConsumableIndex ?? -1;
    if (idx < 0) return false;
    const slots = game.player.equippedConsumables;
    if (slots?.[idx]?.char !== 'B') return false;

    if (this.nearTrough()) {
      this.fillBottle(idx);
      game.player.selectedConsumableIndex = -1;
      return true;
    }
    if (this.nearHotSpring()) {
      this.fillHotWaterBottle(idx);
      game.player.selectedConsumableIndex = -1;
      return true;
    }
    const worldLiquid = this._nearWorldLiquid();
    if (worldLiquid) {
      this.fillLiquidBottle(idx, worldLiquid);
      game.player.selectedConsumableIndex = -1;
      return true;
    }
    return false;
  }

  // ─── World liquid tiles (open water, electrified water, lava, mud) ────────
  // The armed-slot mechanic's third source, alongside the trough and hot
  // spring: any in-world liquid background object, not just the hut's
  // dedicated stations. Replaces the old heldItem-based discovery path
  // (formerly InteractionSystem._isLiquidTile/_getLiquidType/
  // _discoverLiquidBottle) — that path checked `player.heldItem`, the 3-slot
  // weapon loadout, but Empty Bottle is a CONSUMABLE and is never routed
  // into that loadout (InventorySystem.tryPickupItem), so it was already
  // unreachable dead code.

  _liquidStateOf(obj) {
    if (obj.destroyed) return null;
    if (obj.isLava?.()) return 'lava';
    if (obj.isMud?.()) return obj.typeId === 'mud_dry' ? 'mud_dry' : 'mud_wet';
    if (obj.isWater?.()) return obj.waterState === 'electrified' ? 'electrified' : 'normal';
    return null;
  }

  /** Nearest in-world liquid tile within one cell — returns the bottle char to fill, or null. */
  _nearWorldLiquid() {
    const game = this.game;
    const C = GRID.CELL_SIZE;
    const px = game.player.position.x + C / 2;
    const py = game.player.position.y + C / 2;
    for (const obj of game._activeBackgroundObjects()) {
      const state = this._liquidStateOf(obj);
      if (!state) continue;
      const cx = obj.position.x + C / 2;
      const cy = obj.position.y + C / 2;
      const dx = px - cx, dy = py - cy;
      if (Math.sqrt(dx * dx + dy * dy) < LIQUID_SOURCE_RADIUS) return LIQUID_TILE_TO_BOTTLE[state];
    }
    return null;
  }

  fillLiquidBottle(slotIndex, liquidChar) {
    const game = this.game;
    game.inventorySystem.replaceConsumableSlot(slotIndex, liquidChar);
    game.menuSystem.showPickupMessage(LIQUID_BOTTLE_NAMES[liquidChar] ?? 'LIQUID');
    game.audioSystem?.playSFX?.('pickup');
    game.updateUI();
  }

  // ─── Trough ──────────────────────────────────────────────────────────────

  fillBottle(slotIndex = null) {
    const game = this.game;
    const slots = game.player.equippedConsumables;
    const idx = slotIndex ?? (slots?.findIndex(s => s?.char === 'B') ?? -1);
    if (idx === -1) {
      game.menuSystem.showPickupMessage('NO EMPTY BOTTLE EQUIPPED');
      return;
    }
    game.inventorySystem.replaceConsumableSlot(idx, '🜉');
    game.menuSystem.showPickupMessage('BOTTLE OF WATER');
    game.audioSystem?.playSFX?.('pickup');
    game.updateUI();
  }

  // ─── Caldera Hot Spring ──────────────────────────────────────────────────

  fillHotWaterBottle(slotIndex = null) {
    const game = this.game;
    const slots = game.player.equippedConsumables;
    const idx = slotIndex ?? (slots?.findIndex(s => s?.char === 'B') ?? -1);
    if (idx === -1) {
      game.menuSystem.showPickupMessage('NO EMPTY BOTTLE EQUIPPED');
      return;
    }
    game.inventorySystem.replaceConsumableSlot(idx, '🜊');
    // Reverts to a regular Bottle of Water after 3 room exits — decremented
    // in main.js's room-transition reset block.
    game.player.equippedConsumables[idx].hotWaterRoomsLeft = 3;
    game.menuSystem.showPickupMessage('BOTTLE OF HOT WATER');
    game.audioSystem?.playSFX?.('pickup');
    game.updateUI();
  }

  // ─── Cauldron ────────────────────────────────────────────────────────────

  openCauldronMenu() {
    const game = this.game;
    this.cauldronStage = 'input';
    this.cauldronInputType = null;
    this.cauldronStarterChar = null;
    this.cauldronSlotIndex = -1;
    this._openInputMenu();
  }

  _openInputMenu() {
    const game = this.game;
    const slots = game.player.equippedConsumables;
    const validIndices = [];
    (slots ?? []).forEach((s, i) => {
      if (LIQUID_BOTTLE_CHARS.has(s?.char) || STARTER_POTION_CHARS.has(s?.char)) {
        validIndices.push(i);
      }
    });

    if (validIndices.length === 0) {
      game.menuSystem.showPickupMessage('NO BOTTLE OR STARTER POTION');
      return;
    }

    game.menuOpen = true;
    game.currentMenuSlot = 'alchemy';
    game.alchemyMenuTitle = 'CAULDRON';
    game.selectedMenuIndex = 0;
    game.menuItems = validIndices.map(i => slots[i]);
    game.renderController.menuOverlay.render(game);
    game.menuSystem.closeOnMovement = true;
  }

  _openIngredientMenu(validSet, title) {
    const game = this.game;
    const counts = new Map();
    const valid = [];
    for (const ch of game.getIngredients()) {
      if (!validSet.has(ch)) continue;
      counts.set(ch, (counts.get(ch) ?? 0) + 1);
      if (!valid.includes(ch)) valid.push(ch);
    }

    if (valid.length === 0) {
      game.menuSystem.showPickupMessage('NO VALID INGREDIENTS');
      game.closeMenu();
      return;
    }

    game.menuOpen = true;
    game.currentMenuSlot = 'alchemy';
    game.alchemyMenuTitle = title;
    game.selectedMenuIndex = 0;
    game.menuItems = valid;
    game.ingredientCounts = counts;
    game.renderController.menuOverlay.render(game);
    game.menuSystem.closeOnMovement = true;
  }

  /** Dispatches a cauldron selection based on the current stage. */
  commitSelection(selectedItem) {
    if (this.cauldronStage === 'input') this._commitInput(selectedItem);
    else if (this.cauldronStage === 'starter') this._commitStarter(selectedItem);
    else if (this.cauldronStage === 'true') this._commitTrue(selectedItem);
  }

  _commitInput(inputItem) {
    const game = this.game;
    const slots = game.inventorySystem.equippedConsumables;
    const slotIndex = slots.indexOf(inputItem);
    if (slotIndex === -1) return;

    const inputChar = inputItem.char;

    if (LIQUID_BOTTLE_CHARS.has(inputChar)) {
      // Liquid bottle path (water, electrified, magma, mud): 3-stage
      // liquid → starter ingredient → starter potion → true ingredient → final potion
      const counts = new Map();
      const valid = [];
      for (const ch of game.getIngredients()) {
        if (!ALL_STARTER_INGREDIENTS.has(ch)) continue;
        counts.set(ch, (counts.get(ch) ?? 0) + 1);
        if (!valid.includes(ch)) valid.push(ch);
      }

      if (valid.length === 0) {
        game.menuSystem.showPickupMessage('NO VALID INGREDIENTS');
        return;
      }

      // Consume liquid bottle and proceed to starter ingredient selection
      slots[slotIndex] = null;
      this.cauldronSlotIndex = slotIndex;
      this.cauldronInputType = 'liquid';
      this.cauldronLiquidType = inputChar; // Store the liquid type for starter creation
      this.cauldronStage = 'starter';
      this._openIngredientMenu(ALL_STARTER_INGREDIENTS, 'CAULDRON');
      game.updateUI();
    } else if (STARTER_POTION_CHARS.has(inputChar)) {
      // Starter potion path: 2-stage (starter potion → select ingredient → final potion)
      this.cauldronSlotIndex = slotIndex;
      this.cauldronInputType = 'starter';
      this.cauldronStarterChar = inputChar;
      this.cauldronStage = 'true';
      this._openIngredientMenu(ALL_STARTER_INGREDIENTS, STARTER_NAMES[inputChar] ?? 'CAULDRON');
      game.updateUI();
    }
  }

  _commitStarter(ingredientChar) {
    const game = this.game;
    if (!game.hasIngredient(ingredientChar)) return;

    let starterChar;
    if (this.cauldronInputType === 'liquid') {
      if (this.cauldronLiquidType === '🜉') {
        // Plain Water: category-aware — Base/Purified/Unstable depends on the ingredient
        starterChar = starterPotionForIngredient(ingredientChar);
      } else {
        // Electrified/Magma/Mud: still liquid-determined, ingredient-agnostic
        const liquidToStarter = { 'ε': '!', '◆': '«', '◐': '∿' };
        starterChar = liquidToStarter[this.cauldronLiquidType];
      }
    } else {
      // Starter potion path (legacy) - use the standard starter potion mapping
      starterChar = starterPotionForIngredient(ingredientChar);
    }

    if (!starterChar) return;

    game.removeIngredient(ingredientChar);
    this._pendingBaseIngredient = ingredientChar;
    this._pendingHiddenIngredient = ingredientChar;

    // Create the starter potion and place it in the equipped slot
    const starterPotion = new Item(starterChar, game.player.position.x, game.player.position.y);
    starterPotion.baseIngredient = ingredientChar;
    starterPotion.hiddenIngredient = ingredientChar;
    game.inventorySystem.equippedConsumables[this.cauldronSlotIndex] = starterPotion;

    this.cauldronStarterChar = starterChar;
    this.cauldronStage = 'true';
    this._openIngredientMenu(ALL_STARTER_INGREDIENTS, STARTER_NAMES[starterChar] ?? 'CAULDRON');
    game.audioSystem?.playSFX?.('craft');
    game.updateUI();
  }

  _commitTrue(ingredientChar) {
    const game = this.game;
    if (!game.hasIngredient(ingredientChar)) return;
    const recipe = findRecipe(this.cauldronStarterChar, ingredientChar);
    if (!recipe) return;

    game.removeIngredient(ingredientChar);

    const result = new Item(recipe.result, game.player.position.x, game.player.position.y);

    // The Alchemist's Path — color/purity is fixed at the starter tier and
    // persists to the true potion, rather than resetting to a static color.
    applyPotionModifierColor(result, this.cauldronStarterChar);

    if (this.cauldronInputType === 'liquid') {
      // Liquid path: use pending ingredients from starter creation
      result.hiddenIngredient = this._pendingHiddenIngredient;
      result.baseIngredient = this._pendingBaseIngredient;
    } else if (this.cauldronInputType === 'starter') {
      // Starter potion path: use the starter potion's own ingredient data
      const starterPotion = game.inventorySystem.equippedConsumables[this.cauldronSlotIndex];
      result.hiddenIngredient = starterPotion?.hiddenIngredient || null;
      result.baseIngredient = starterPotion?.baseIngredient || null;
    }

    result.secondaryIngredient = ingredientChar;

    // Place the true potion in the equipped slot
    game.inventorySystem.equippedConsumables[this.cauldronSlotIndex] = result;
    game.menuSystem.showPickupMessage(result.data.name);
    game.audioSystem?.playSFX?.('craft');

    this.cauldronStage = 'input';
    this.cauldronInputType = null;
    this.cauldronLiquidType = null;
    this.cauldronStarterChar = null;
    this.cauldronSlotIndex = -1;
    this._pendingHiddenIngredient = null;
    this._pendingBaseIngredient = null;
    game.closeMenu();
    game.updateUI();
  }

  // ─── Condenser ───────────────────────────────────────────────────────────

  /**
   * Reveals a potion's base ingredient (starter) or base + secondary (true potion)
   * as Greek symbols above the condenser. Shows a menu if multiple potions equipped.
   */
  revealCondenser() {
    const game = this.game;
    const slots = game.player.equippedConsumables ?? [];

    // Find all equipped potions with ingredient data (starter or true potions)
    const potionsWithData = slots.filter(s =>
      s && (s.baseIngredient || (s.hiddenIngredient && ['🜄', '🜅', '🜆'].includes(s.char)))
    );

    if (potionsWithData.length === 0) {
      game.menuSystem.showPickupMessage('NO POTION EQUIPPED');
      return;
    }

    if (potionsWithData.length === 1) {
      this._revealSinglePotion(potionsWithData[0]);
    } else {
      this._openCondenserMenu(potionsWithData);
    }
  }

  _revealSinglePotion(potion) {
    const game = this.game;

    // Show the base ingredient (stored in baseIngredient for true potions, hiddenIngredient for starters)
    const baseIng = potion.baseIngredient || potion.hiddenIngredient;
    if (baseIng) {
      const baseGreek = ingredientToGreek(baseIng);
      const condenser = game.activeFloor.backgroundObjects.find(o => o.char === 'Ψ' && !o.destroyed);
      const startY = condenser ? condenser.position.y - GRID.CELL_SIZE / 2 : 0;

      game.activeFloor.condenserReveal = {
        baseChar: baseGreek,
        x: condenser ? condenser.position.x + GRID.CELL_SIZE / 2 : 0,
        y: startY,
        alpha: 1.0,
        timer: 0,
        duration: 2.5,
        riseSpeed: 40,  // pixels per second
        color: '#cc88ff'
      };
    }
  }

  _openCondenserMenu(potions) {
    const game = this.game;
    game.menuOpen = true;
    game.currentMenuSlot = 'condenser';
    game.alchemyMenuTitle = 'CONDENSER';
    game.selectedMenuIndex = 0;
    game.menuItems = potions;
    this.condenserMenuItems = potions;
    game.renderController.menuOverlay.render(game);
    game.menuSystem.closeOnMovement = true;
  }

  commitCondenserSelection(selectedPotion) {
    this._revealSinglePotion(selectedPotion);
  }

  /**
   * Called when a menu is closed without making a selection (e.g., player presses Shift).
   * Restores items to their correct form based on the current cauldron stage.
   */
  cancelCauldron() {
    const game = this.game;

    // If in starter ingredient selection stage, restore the liquid bottle
    if (this.cauldronStage === 'starter' && this.cauldronInputType === 'liquid' && this.cauldronSlotIndex >= 0) {
      const liquidBottle = new Item(this.cauldronLiquidType, game.player.position.x, game.player.position.y);
      game.inventorySystem.equippedConsumables[this.cauldronSlotIndex] = liquidBottle;
    }
    // If in true ingredient selection stage and input type is starter,
    // the potion stays in slot (being crafted into result, so correct behavior)
    // If in input selection stage, nothing was consumed yet (correct behavior)

    // Reset cauldron state
    this.cauldronStage = 'input';
    this.cauldronInputType = null;
    this.cauldronLiquidType = null;
    this.cauldronStarterChar = null;
    this.cauldronSlotIndex = -1;
    this._pendingHiddenIngredient = null;
    this._pendingBaseIngredient = null;
  }

  update(dt) {
    const reveal = this.game.activeFloor?.condenserReveal;
    if (reveal) {
      reveal.timer += dt;
      reveal.y -= reveal.riseSpeed * dt;
      reveal.alpha = Math.max(0, 1 - (reveal.timer / reveal.duration));

      if (reveal.timer >= reveal.duration) {
        this.game.activeFloor.condenserReveal = null;
      }
    }
  }
}
