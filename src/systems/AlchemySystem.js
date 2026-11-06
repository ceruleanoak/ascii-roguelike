import { GRID } from '../game/GameConfig.js';
import { Item } from '../entities/Item.js';
import { findRecipe } from '../data/recipes.js';
import { isInteriorActive } from './PlaneSystem.js';
import {
  ALL_STARTER_INGREDIENTS,
  starterPotionForIngredient,
  ingredientToGreek,
  applyPotionModifierColor,
  HOT_WATER_CHAR,
  POISONED_WATER_CHAR,
  SLIME_BOTTLE_CHAR,
  DEMO_BASE,
  DEMO_SUPPLEMENT
} from '../data/alchemy.js';

/**
 * AlchemySystem — operates the Water Trough, Cauldron, and Condenser inside
 * the Alchemy Hut. Modeled on PressSystem's proximity → menu → commit shape.
 *
 * SPACE at the cauldron opens a top-level BREW / INFUSE choice first (mirrors
 * ShopSystem's WARES/PAWN front menu) — the old single merged bottle-or-
 * starter list conflated two different questions the player is asking
 * ("start a new potion" vs. "finish one I already started") behind one
 * ambiguous list, and gave no feedback about which ingredients a given
 * choice would need until after committing. Picking a mode up front filters
 * the very next menu down to only the carried Bottles that mode can use, and
 * a mode with nothing valid is unselectable.
 *
 * Every carried Bottle is an input — Bottles (one entry per stack) and the
 * equipped slots alike. The chosen Bottle is held as a Bottle Ref
 * (BottlesSystem), and the brew lands back where it came from: a Bottle from
 * Bottles brews into Bottles, a slot Bottle into its slot.
 *
 *   BREW   (liquid path — makes a starter potion and stops there)
 *   'mode'    — top choice: BREW
 *   'input'   — select a liquid Bottle (Water/Hot Water/Poisoned Water/Slime/
 *               Electrified/Magma/Mud)
 *   'starter' — select a held ingredient to brew a starter potion (Base /
 *               Purified / Unstable / Charged / Burning / Primal); it replaces
 *               the liquid where it sat, the pickup box names it, and the
 *               menu closes. The liquid is only spent here, so backing out of
 *               the ingredient list leaves it untouched
 *
 *   INFUSE (finishes a starter potion)
 *   'mode'    — top choice: INFUSE
 *   'input'   — select a starter potion that a held ingredient
 *               has a recipe with
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
// Base / Purified / Unstable (plain water) and Charged / Burning / Primal
// (electrified water, magma, mud) — every BREW result INFUSE can finish.
const STARTER_POTION_CHARS = new Set(['🜄', '🜅', '🜆', '!', '«', '¿']);
const LIQUID_BOTTLE_CHARS = new Set(['🜉', HOT_WATER_CHAR, POISONED_WATER_CHAR, SLIME_BOTTLE_CHAR, 'ε', '◆', '◐']);  // Water, Hot Water, Poisoned Water, Slime, Electrified, Magma, Mud
const PURIFIED_POTION_CHAR = '🜅';
const UNSTABLE_POTION_CHAR = '🜆';
const CAULDRON_COLOR = '#ffffff';

// Map liquid tile states to liquid bottle types
const LIQUID_TILE_TO_BOTTLE = {
  'normal': '🜉',        // Normal water → Bottle of Water
  'electrified': 'ε',    // Electrified water → Bottle of Electrified Water
  'heated': '🜊',        // Heated Water → Bottle of Hot Water (WaterLavaHitMechanic.burnWater)
  'poisoned': POISONED_WATER_CHAR, // Poisoned water → Bottle of Poisoned Water
  'lava': '◆',          // Magma/Lava → Bottle of Magma
  'mud_wet': '◐',       // Mud → Bottle of Mud
  'mud_dry': '◐'        // Dry mud → Bottle of Mud
};

// Water states that bottle as their own liquid; any other bottles plain.
const BOTTLED_WATER_STATES = new Set(['electrified', 'heated', 'poisoned']);

const STARTER_NAMES = {
  '🜄': 'BASE POTION',
  '🜅': 'PURIFIED POTION',
  '🜆': 'UNSTABLE POTION',
  '!': 'CHARGED POTION',
  '«': 'BURNING POTION',
  '¿': 'PRIMAL POTION'
};

// Single source of truth for pickup-message names — used by fillLiquidBottle
// below; previously duplicated in InteractionSystem's now-removed
// _discoverLiquidBottle (the old heldItem-based bottling path this replaces).
const LIQUID_BOTTLE_NAMES = {
  '🜉': 'BOTTLE OF WATER',
  [POISONED_WATER_CHAR]: 'BOTTLE OF POISONED WATER',
  [SLIME_BOTTLE_CHAR]: 'BOTTLE OF SLIME',
  'ε': 'BOTTLE OF ELECTRIFIED WATER',
  '◆': 'BOTTLE OF MAGMA',
  '◐': 'BOTTLE OF MUD'
};

export class AlchemySystem {
  constructor(game) {
    this.game = game;
    this.cauldronStage = 'mode';
    this.cauldronInputType = null; // 'liquid' or 'starter'
    this.cauldronLiquidType = null; // '🜉', 'ε', '◆', or '◐' (only when inputType is 'liquid')
    this.cauldronStarterChar = null;
    this.cauldronRef = null; // Bottle Ref of the liquid/starter chosen at the 'input' stage
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

  // A potion with ingredient data, starter or true: what the Condenser reads.
  _isPotion(item) {
    return !!item && !!(item.baseIngredient || (item.hiddenIngredient && STARTER_POTION_CHARS.has(item.char)));
  }

  /**
   * An Armed Consumable that is a potion, while the player stands in the
   * Alchemy Lab; else null. A potion armed here is for the Condenser: it
   * neither fires (ConsumableTriggerSystem.fireSelected) nor tosses
   * (TossSystem.handleShiftPress).
   */
  armedPotionInLab() {
    const game = this.game;
    if (!game.player?.inHut || !game.activeFloor) return null;
    const inLab = game.activeFloor.backgroundObjects.some(o => (o.char === 'Ω' || o.char === 'Ψ') && !o.destroyed);
    if (!inLab) return null;
    const item = game.consumableTriggerSystem.armed()?.item;
    return this._isPotion(item) ? item : null;
  }

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
   * SPACE with an Empty Bottle armed (a slot via number key, or a Bottle from
   * the Bottles column) and the player within one cell of a liquid source.
   * Must be checked BEFORE ConsumableTriggerSystem.fireSelected() — an armed
   * Empty Bottle has no consumable effect of its own, so the generic fire
   * path would just silently swallow the SPACE press and clear the selection.
   */
  tryFillArmedBottle() {
    const game = this.game;
    const triggers = game.consumableTriggerSystem;
    const ref = triggers.armed();
    if (ref?.item.char !== 'B') return false;

    let filled = !!game.fountainSystem?.tryFillArmedBottle(ref);
    if (!filled && this.nearTrough()) filled = this.fillTroughBottle(ref);
    if (!filled && this.nearHotSpring()) filled = this.fillHotWaterBottle(ref);
    if (!filled) filled = this.fillSlimeBottle(ref);
    if (!filled) {
      const worldLiquid = this._nearWorldLiquid();
      if (worldLiquid) filled = this.fillLiquidBottle(ref, worldLiquid);
    }
    if (filled) triggers.disarm();
    return filled;
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

  /** The bottle an in-world liquid tile fills (LIQUID_TILE_TO_BOTTLE), or null when it isn't one. */
  liquidBottleFor(obj) {
    const state = this._liquidStateOf(obj);
    return state ? LIQUID_TILE_TO_BOTTLE[state] : null;
  }

  _liquidStateOf(obj) {
    if (obj.destroyed) return null;
    if (obj.isTrough) return obj.troughState;
    if (obj.isLava?.()) return 'lava';
    if (obj.isMud?.()) return obj.typeId === 'mud_dry' ? 'mud_dry' : 'mud_wet';
    if (obj.isWater?.()) return BOTTLED_WATER_STATES.has(obj.waterState) ? obj.waterState : 'normal';
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

  // The fill helpers below each take a Bottle Ref (BottlesSystem) naming the
  // Empty Bottle to fill — the armed one, or the GET spell's pick — and
  // return whether they filled it.
  fillLiquidBottle(ref, liquidChar) {
    const game = this.game;
    // Heated Water bottles the same Hot Water the hot spring gives, cooling and all.
    if (liquidChar === '🜊') return this.fillHotWaterBottle(ref);
    if (!game.bottlesSystem.replaceAt(ref, liquidChar)) return false;
    game.menuSystem.announceItem(liquidChar, LIQUID_BOTTLE_NAMES[liquidChar]);
    game.audioSystem?.playSFX?.('pickup');
    game.updateUI();
    return true;
  }

  // ─── Trough ──────────────────────────────────────────────────────────────

  // The Alchemy Lab trough's water: what fire or poison last made of it
  // (WaterLavaHitMechanic), else plain water.
  fillTroughBottle(ref) {
    const trough = this.game.activeFloor?.backgroundObjects?.find(obj => obj.isTrough);
    return trough ? this.fillLiquidBottle(ref, this.liquidBottleFor(trough)) : this.fillBottle(ref);
  }

  fillBottle(ref) {
    const game = this.game;
    if (!game.bottlesSystem.replaceAt(ref, '🜉')) return false;
    game.menuSystem.announceItem('🜉');
    game.audioSystem?.playSFX?.('pickup');
    game.updateUI();
    return true;
  }

  // ─── Goo Blob ────────────────────────────────────────────────────────────

  // Scoop the nearest goo blob within one cell into the bottle; the blob is gone.
  fillSlimeBottle(ref) {
    const game = this.game;
    const C = GRID.CELL_SIZE;
    const px = game.player.position.x + C / 2;
    const py = game.player.position.y + C / 2;
    const interior = isInteriorActive(game);
    const blob = game.gooBlobs.find(b => !b.expired &&
      !!b.hutPlane === interior && (b.plane ?? 0) === (game.player.plane ?? 0) &&
      Math.hypot(b.position.x - px, b.position.y - py) < LIQUID_SOURCE_RADIUS);
    if (!blob || !this.fillLiquidBottle(ref, SLIME_BOTTLE_CHAR)) return false;
    game.gooBlobs.splice(game.gooBlobs.indexOf(blob), 1);
    return true;
  }

  // ─── Caldera Hot Spring ──────────────────────────────────────────────────

  fillHotWaterBottle(ref) {
    const game = this.game;
    const hotWater = game.bottlesSystem.replaceAt(ref, '🜊');
    if (!hotWater) return false;
    // Reverts to a regular Bottle of Water after 3 room exits — decremented
    // in main.js's room-transition reset block.
    hotWater.hotWaterRoomsLeft = 3;
    game.menuSystem.announceItem('🜊');
    game.audioSystem?.playSFX?.('pickup');
    game.updateUI();
    return true;
  }

  // ─── Cauldron ────────────────────────────────────────────────────────────

  openCauldronMenu() {
    this.cauldronStage = 'mode';
    this.cauldronInputType = null;
    this.cauldronStarterChar = null;
    this.cauldronRef = null;
    this._openModeMenu();
  }

  /**
   * Carried Bottles matching `isValid` as menu entries: each equipped slot
   * Bottle, then one per Bottles stack. Stacks key on glyph plus ingredient
   * data, so two starters brewed from different ingredients stay apart.
   */
  _bottleChoices(isValid) {
    const choices = [];
    const seen = new Set();
    const refs = this.game.bottlesSystem.allRefs();
    for (const ref of [...refs.filter(r => r.source === 'slot'), ...refs.filter(r => r.source === 'bottles')]) {
      const item = this.game.bottlesSystem.itemAt(ref);
      if (!isValid(item)) continue;
      if (ref.source === 'bottles') {
        const key = `${item.char}|${item.baseIngredient ?? ''}|${item.hiddenIngredient ?? ''}|${item.secondaryIngredient ?? ''}`;
        if (seen.has(key)) continue;
        seen.add(key);
      }
      choices.push(item);
    }
    return choices;
  }

  /** Held ingredients (deduped, in pile order) that finish `starterChar`
   * into a true potion — the INFUSE ingredient list. */
  _infusionIngredients(starterChar) {
    const valid = [];
    for (const ch of this.game.getIngredients()) {
      if (!valid.includes(ch) && findRecipe(starterChar, ch)) valid.push(ch);
    }
    return valid;
  }

  _canInfuse(slot) {
    return STARTER_POTION_CHARS.has(slot?.char) && this._infusionIngredients(slot.char).length > 0;
  }

  /** Top-level BREW / INFUSE choice — see class doc. Both options always show,
   * but each is `disabled` (dimmed by MenuOverlay, unselectable in
   * MenuSystem) when the player can't complete it: BREW needs any of the 4
   * liquid bottle types plus a held starter ingredient, INFUSE needs a
   * starter potion plus a held ingredient it has a recipe with. */
  _openModeMenu() {
    const game = this.game;
    const canBrew = this._bottleChoices(b => LIQUID_BOTTLE_CHARS.has(b?.char)).length > 0
      && game.getIngredients().some(ch => ALL_STARTER_INGREDIENTS.has(ch));
    const canInfuse = this._bottleChoices(b => this._canInfuse(b)).length > 0;

    game.menuOpen = true;
    game.currentMenuSlot = 'alchemy';
    game.alchemyMenuTitle = 'CAULDRON';
    game.menuItems = [
      { action: 'brew', label: 'BREW', disabled: !canBrew },
      { action: 'infuse', label: 'INFUSE', disabled: !canInfuse },
    ];
    game.selectedMenuIndex = Math.max(0, game.menuItems.findIndex(item => !item.disabled));
    game.renderController.menuOverlay.render(game);
    game.menuSystem.closeOnMovement = true;
  }

  _openInputMenu(validCharSet, title) {
    const game = this.game;
    // INFUSE lists only starters a held ingredient can finish.
    const choices = this._bottleChoices(b => validCharSet.has(b?.char)
      && (validCharSet !== STARTER_POTION_CHARS || this._canInfuse(b)));

    if (choices.length === 0) {
      game.menuSystem.showPickupMessage(
        validCharSet === LIQUID_BOTTLE_CHARS ? 'NO BOTTLE' : 'NO STARTER POTION'
      );
      game.closeMenu();
      return;
    }

    game.menuOpen = true;
    game.currentMenuSlot = 'alchemy';
    game.alchemyMenuTitle = title;
    game.selectedMenuIndex = 0;
    game.menuItems = choices;
    game.renderController.menuOverlay.render(game);
    game.menuSystem.closeOnMovement = true;
  }

  _openIngredientMenu(isValid, title) {
    const game = this.game;
    const counts = new Map();
    const valid = [];
    for (const ch of game.getIngredients()) {
      if (!isValid(ch)) continue;
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
    if (this.cauldronStage === 'mode') this._commitMode(selectedItem);
    else if (this.cauldronStage === 'input') this._commitInput(selectedItem);
    else if (this.cauldronStage === 'starter') this._commitStarter(selectedItem);
    else if (this.cauldronStage === 'true') this._commitTrue(selectedItem);
  }

  _commitMode(modeItem) {
    this.cauldronStage = 'input';
    if (modeItem.action === 'brew') {
      this._openInputMenu(LIQUID_BOTTLE_CHARS, 'BREW');
    } else if (modeItem.action === 'infuse') {
      this._openInputMenu(STARTER_POTION_CHARS, 'INFUSE');
    }
  }

  _commitInput(inputItem) {
    const game = this.game;
    const ref = game.bottlesSystem.refOf(inputItem);
    if (!ref) return;

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

      // Proceed to starter ingredient selection; the liquid is spent when
      // the starter is brewed (_commitStarter), so a cancel costs nothing.
      this.cauldronRef = ref;
      this.cauldronInputType = 'liquid';
      this.cauldronLiquidType = inputChar; // Store the liquid type for starter creation
      this.cauldronStage = 'starter';
      this._openIngredientMenu(ch => ALL_STARTER_INGREDIENTS.has(ch), 'BREW');
      game.updateUI();
    } else if (STARTER_POTION_CHARS.has(inputChar)) {
      // Starter potion path: 2-stage (starter potion → select ingredient → final potion)
      this.cauldronRef = ref;
      this.cauldronInputType = 'starter';
      this.cauldronStarterChar = inputChar;
      this.cauldronStage = 'true';
      this._openIngredientMenu(ch => !!findRecipe(inputChar, ch), STARTER_NAMES[inputChar] ?? 'CAULDRON');
      game.updateUI();
    }
  }

  _commitStarter(ingredientChar) {
    const game = this.game;
    if (!game.hasIngredient(ingredientChar)) return;
    if (game.bottlesSystem.itemAt(this.cauldronRef)?.char !== this.cauldronLiquidType) return;

    let starterChar;
    if (this.cauldronInputType === 'liquid') {
      if (this.cauldronLiquidType === '🜉') {
        // Plain Water: category-aware — Base/Purified/Unstable depends on the ingredient
        starterChar = starterPotionForIngredient(ingredientChar);
      } else if (this.cauldronLiquidType === HOT_WATER_CHAR) {
        // Hot Water purifies any base — the Alchemist's lesson.
        starterChar = PURIFIED_POTION_CHAR;
      } else if (this.cauldronLiquidType === POISONED_WATER_CHAR || this.cauldronLiquidType === SLIME_BOTTLE_CHAR) {
        // Poison and slime guarantee Unstable, whatever the ingredient.
        starterChar = UNSTABLE_POTION_CHAR;
      } else {
        // Electrified/Magma/Mud: still liquid-determined, ingredient-agnostic
        const liquidToStarter = { 'ε': '!', '◆': '«', '◐': '¿' };
        starterChar = liquidToStarter[this.cauldronLiquidType];
      }
    } else {
      // Starter potion path (legacy) - use the standard starter potion mapping
      starterChar = starterPotionForIngredient(ingredientChar);
    }

    if (!starterChar) return;

    game.removeIngredient(ingredientChar);

    // The starter potion takes the liquid's place. BREW ends here —
    // finishing it into a true potion is INFUSE's job, a separate pick.
    const starterPotion = new Item(starterChar, game.player.position.x, game.player.position.y);
    starterPotion.baseIngredient = ingredientChar;
    starterPotion.hiddenIngredient = ingredientChar;
    game.bottlesSystem.putAt(this.cauldronRef, starterPotion);

    this._resetCauldron(); // before closeMenu, which runs cancelCauldron
    game.closeMenu();
    game.menuSystem.announceCrafted(starterChar);
    game.audioSystem?.playSFX?.('craft');
    game.updateUI();
  }

  _commitTrue(ingredientChar) {
    const game = this.game;
    if (!game.hasIngredient(ingredientChar)) return;
    const recipe = findRecipe(this.cauldronStarterChar, ingredientChar);
    if (!recipe) return;
    const starterPotion = game.bottlesSystem.itemAt(this.cauldronRef);
    if (starterPotion?.char !== this.cauldronStarterChar) return;

    game.removeIngredient(ingredientChar);

    const result = this._finishPotion(recipe, starterPotion, ingredientChar);

    // The true potion takes the starter's place
    game.bottlesSystem.putAt(this.cauldronRef, result);
    game.menuSystem.announceCrafted(result.char);
    game.audioSystem?.playSFX?.('craft');

    this._resetCauldron();
    game.closeMenu();
    game.updateUI();
  }

  /** The true potion `recipe` makes of `starterPotion` and its supplement. */
  _finishPotion(recipe, starterPotion, supplementChar) {
    const { position } = this.game.player;
    const result = new Item(recipe.result, position.x, position.y);

    // The Alchemist's Path — color/purity is fixed at the starter tier and
    // persists to the true potion, rather than resetting to a static color.
    applyPotionModifierColor(result, starterPotion.char);

    // Carry the starter potion's own ingredient data onto the result.
    result.hiddenIngredient = starterPotion.hiddenIngredient || null;
    result.baseIngredient = starterPotion.baseIngredient || null;

    result.secondaryIngredient = supplementChar;
    return result;
  }

  _resetCauldron() {
    this.cauldronStage = 'mode';
    this.cauldronInputType = null;
    this.cauldronLiquidType = null;
    this.cauldronStarterChar = null;
    this.cauldronRef = null;
  }

  // ─── Condenser ───────────────────────────────────────────────────────────

  /**
   * Reveals a potion's base ingredient (starter) or base + secondary (true potion)
   * as Greek symbols above the condenser. Shows a menu if several carried
   * potions (slots or Bottles) hold ingredient data.
   */
  revealCondenser() {
    const game = this.game;

    // The potion the player armed goes in without asking which.
    const armedPotion = this.armedPotionInLab();
    if (armedPotion) {
      this.revealPotion(armedPotion);
      return;
    }

    // Every carried potion with ingredient data (starter or true potions)
    const potionsWithData = this._bottleChoices(s => this._isPotion(s));

    if (potionsWithData.length === 0) {
      game.menuSystem.showPickupMessage('NO POTION');
      return;
    }

    if (potionsWithData.length === 1) {
      this.revealPotion(potionsWithData[0]);
    } else {
      this._openCondenserMenu(potionsWithData);
    }
  }

  /** Color the Cauldron with what's in it, or back to its own white. */
  tintCauldron(color = CAULDRON_COLOR) {
    const cauldron = this.game.activeFloor.backgroundObjects.find(o => o.char === 'Ω' && !o.destroyed);
    if (cauldron) cauldron.animationColor = color;
  }

  /**
   * The Alchemist's brew in the Hot Water demo (scriptedEvents.js): the BREW
   * and INFUSE the player does at this Cauldron, from the Alchemist's own
   * stock — Hot Water purifies the base, the supplement finishes it. Returns
   * the finished potion, unplaced — the event hands it over.
   */
  brewForDemo() {
    const starter = new Item(PURIFIED_POTION_CHAR, 0, 0);
    starter.baseIngredient = DEMO_BASE;
    starter.hiddenIngredient = DEMO_BASE;
    this.tintCauldron();
    this.game.audioSystem?.playSFX?.('craft');
    return this._finishPotion(findRecipe(PURIFIED_POTION_CHAR, DEMO_SUPPLEMENT), starter, DEMO_SUPPLEMENT);
  }

  /** Float `potion`'s base ingredient, as its Greek letter, up off the Condenser. */
  revealPotion(potion) {
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
    this.revealPotion(selectedPotion);
  }

  /**
   * Called when a menu is closed without making a selection (e.g., player
   * presses Shift). Nothing to restore: the chosen liquid or starter is only
   * replaced when its brew commits.
   */
  cancelCauldron() {
    this._resetCauldron();
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
