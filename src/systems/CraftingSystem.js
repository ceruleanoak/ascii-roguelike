import { findRecipe, findCursedRecipe, requiresForge } from '../data/recipes.js';
import { Item } from '../entities/Item.js';
import { WEAPON_TIERS, ITEMS, isIngredient } from '../data/items.js';
import { POTION_STARTER_MODIFIERS, applyPotionModifierColor } from '../data/alchemy.js';
import { getGolemTypeForResult, GOLEM_CAP } from '../data/golems.js';

/**
 * Returns the next-tier pool for a given weapon char, or null if none exists.
 * Returns null if the char is at the top tier or not in any tier list.
 */
export function getNextTierPool(char) {
  for (const [, tiers] of Object.entries(WEAPON_TIERS)) {
    for (let i = 0; i < tiers.length; i++) {
      if (tiers[i].includes(char)) {
        // If already top tier, no upgrade available
        if (i + 1 >= tiers.length) return null;
        return tiers[i + 1];
      }
    }
  }
  return null;
}

export class CraftingSystem {
  // `game` is read only for game.cursedRun (cursed recipes); optional so
  // headless harnesses can still build one bare.
  // `forge: true` makes this the Dragon Forge's station (ForgeSystem): it
  // crafts Forge Recipes only — no tier-up cycles, no cursed recipes. The
  // default REST station refuses Forge Recipes and raises the ember tell.
  // `pairMemory`: another CraftingSystem whose identified/failed pair maps
  // this one shares — which pairs were tried is the player's knowledge, not
  // the station's, so the forge reads and writes the REST station's memory.
  constructor(game = null, { forge = false, pairMemory = null } = {}) {
    this.game = game;
    this.forge = forge;
    this.leftSlot = null;
    this.rightSlot = null;
    this.centerSlot = null;
    // REST only: the item (Item, or ingredient char) placed into the centre
    // slot to Dismantle it, while
    // its recipe pair still sits in left/right untouched. Taking either side
    // slot commits the Dismantle; walking away cancels it (cancelDismantle).
    // The slots alone can't tell this apart from an ordinary craft.
    this.dismantleItem = null;
    this.cycleState = null; // { pool, predeterminedResult, cyclingStartTime }
    // REST only: the pair is a Forge Recipe. Drawn as a dim, unclaimable ember
    // in the centre slot — the pair means something, just not here. Not
    // centre content: claiming does nothing.
    this.emberTell = false;
    this.discoveredPairs = pairMemory?.discoveredPairs ?? new Map(); // ingredientChar → Set<ingredientChar>
    this.failedPairs = pairMemory?.failedPairs ?? new Map();         // ingredientChar → Set<ingredientChar>
  }

  setLeftSlot(item) {
    this.leftSlot = item;
    this.updateCrafting();
  }

  setRightSlot(item) {
    this.rightSlot = item;
    this.updateCrafting();
  }

  clearLeftSlot() {
    const item = this.leftSlot;
    this.leftSlot = null;
    this._cancelCycling();
    this.updateCrafting();
    return item;
  }

  clearRightSlot() {
    const item = this.rightSlot;
    this.rightSlot = null;
    this._cancelCycling();
    this.updateCrafting();
    return item;
  }

  /**
   * Place `item` in the centre to Dismantle it into `recipe`'s pair. `item`
   * is the live Item (kept so cancelling returns it with its uses/colour
   * intact), or a bare char for an ingredient-result recipe.
   */
  stageDismantle(item, recipe) {
    this.leftSlot = recipe.left;
    this.rightSlot = recipe.right;
    this.centerSlot = typeof item === 'string' ? item : item.char;
    this.dismantleItem = item;
  }

  /**
   * Undo a staged Dismantle: empty the station and hand back the staged item
   * (not the pair — that would complete the Dismantle for free). Null when
   * no Dismantle is staged.
   */
  cancelDismantle() {
    const item = this.dismantleItem;
    if (!item) return null;
    this.leftSlot = null;
    this.rightSlot = null;
    this.centerSlot = null;
    this.dismantleItem = null;
    return item;
  }

  clearCenterSlot() {
    const item = this.centerSlot;
    this.centerSlot = null;
    return item;
  }

  _cancelCycling() {
    this.cycleState = null;
  }

  updateCrafting() {
    this.centerSlot = null;
    this.dismantleItem = null;
    this.emberTell = false;
    this._cancelCycling();

    if (!this.leftSlot || !this.rightSlot) return;

    // The Dragon Forge crafts Forge Recipes and nothing else. A pair that is
    // something at the REST station (a recipe, a cursed recipe, a tier-up
    // pair) leaves the centre empty and is recorded nowhere; a pair that is
    // nothing anywhere is a failed pair, same as at REST.
    if (this.forge) {
      const recipe = findRecipe(this.leftSlot, this.rightSlot);
      if (requiresForge(recipe)) {
        this.centerSlot = recipe.result;
        this._recordPair(this.discoveredPairs);
      } else if (!recipe && !this._isRestOnlyPair()) {
        this._recordPair(this.failedPairs);
      }
      return;
    }

    // Normal recipe takes priority
    const recipe = findRecipe(this.leftSlot, this.rightSlot)
      ?? (this.game?.cursedRun ? findCursedRecipe(this.leftSlot, this.rightSlot) : null);

    // A Forge Recipe at the REST station: ember tell, neither discovered nor
    // failed — the pair is right, the station is wrong.
    if (requiresForge(recipe)) {
      this.emberTell = true;
      return;
    }

    if (recipe) {
      this.centerSlot = recipe.result;
      // Flag both ingredients as identified partners
      this._recordPair(this.discoveredPairs);
      return;
    }

    // Duplicate weapon upgrade — always return early, never record in pair maps
    if (this.leftSlot === this.rightSlot) {
      const pool = getNextTierPool(this.leftSlot);
      if (pool && pool.length > 0) {
        this.cycleState = {
          pool,
          predeterminedResult: pool[Math.floor(Math.random() * pool.length)],
          cyclingStartTime: performance.now()
        };
      }
      return;
    }

    // Both slots filled, no recipe, no cycle → failed pair
    this._recordPair(this.failedPairs);
  }

  /**
   * Forge only: the recipe-less current pair still means something at the
   * REST station — a cursed recipe this run, or a duplicate weapon's tier-up
   * cycle — so the forge must not record it as failed in the shared memory.
   */
  _isRestOnlyPair() {
    if (this.game?.cursedRun && findCursedRecipe(this.leftSlot, this.rightSlot)) return true;
    return this.leftSlot === this.rightSlot && !!getNextTierPool(this.leftSlot)?.length;
  }

  /** Record the current left/right pair as mutual partners in `pairs`. */
  _recordPair(pairs) {
    if (!pairs.has(this.leftSlot)) pairs.set(this.leftSlot, new Set());
    if (!pairs.has(this.rightSlot)) pairs.set(this.rightSlot, new Set());
    pairs.get(this.leftSlot).add(this.rightSlot);
    pairs.get(this.rightSlot).add(this.leftSlot);
  }

  getIdentifiedPartners(char) {
    return this.discoveredPairs.get(char) ?? new Set();
  }

  getFailedPartners(char) {
    return this.failedPairs.get(char) ?? new Set();
  }

  // Cleared in place, never replaced: the Dragon Forge's CraftingSystem holds
  // references to these same maps (pairMemory), and new Maps would quietly
  // split the two stations' memory after the first run reset.
  resetDiscoveries() {
    this.discoveredPairs.clear();
    this.failedPairs.clear();
  }

  hasCenterContent() {
    return !!(this.centerSlot || this.cycleState);
  }

  /**
   * Claim a center-slot result that is itself a raw ingredient (e.g. Mana) —
   * these land straight in the ingredient pile rather than becoming an equippable
   * Item, since ingredients have no equipment slot to occupy. Returns the
   * ingredient char, or null if the center slot holds a real crafted item.
   */
  claimCraftedIngredient() {
    if (this.cycleState || !this.centerSlot || !isIngredient(this.centerSlot)) return null;
    const char = this.centerSlot;
    this.leftSlot = null;
    this.rightSlot = null;
    this.centerSlot = null;
    this.dismantleItem = null;
    return char;
  }

  /**
   * Claim a center-slot result that summons a golem companion (e.g. Slag +
   * Mana) rather than yielding an inventory item — same shape as
   * claimCraftedIngredient, just against the golem sentinel table instead of
   * the ingredient registry. `currentGolemCount` is the live roster size
   * (GOLEM_CAP is a combined cap across all golem types); at cap the craft
   * is a no-op and the ingredient/mana pairing is left in the slots
   * unconsumed. Returns the golem type key ('slag', 'mud', …), or null if
   * the center slot holds a real crafted item/ingredient, or the cap is full.
   */
  claimCraftedGolem(currentGolemCount) {
    if (this.cycleState || !this.centerSlot) return null;
    const golemType = getGolemTypeForResult(this.centerSlot);
    if (!golemType) return null;
    if (currentGolemCount >= GOLEM_CAP) return null;
    this.leftSlot = null;
    this.rightSlot = null;
    this.centerSlot = null;
    this.dismantleItem = null;
    return golemType;
  }

  claimCraftedItem(x, y) {
    // The Alchemist's Path — a potion's color/purity is fixed at the starter
    // tier and persists to the true potion, rather than resetting to a
    // static per-recipe color. Applies to both the cycling and direct paths.
    const starterChar = [this.leftSlot, this.rightSlot].find(ch => ch in POTION_STARTER_MODIFIERS);

    if (this.cycleState) {
      const result = this.cycleState.predeterminedResult;
      this._cancelCycling();
      this.leftSlot = null;
      this.rightSlot = null;
      this.centerSlot = null;
      this.dismantleItem = null;
      const item = new Item(result, x, y);
      if (starterChar) applyPotionModifierColor(item, starterChar);
      return item;
    }

    if (!this.centerSlot) return null;

    const item = new Item(this.centerSlot, x, y);
    this.leftSlot = null;
    this.rightSlot = null;
    this.centerSlot = null;
    this.dismantleItem = null;
    if (starterChar) applyPotionModifierColor(item, starterChar);
    return item;
  }

  getState() {
    return {
      leftSlot: this.leftSlot,
      rightSlot: this.rightSlot,
      centerSlot: this.centerSlot,
      cycleState: this.cycleState,
      emberTell: this.emberTell
    };
  }

  setState(state) {
    this.leftSlot = state.leftSlot || null;
    this.rightSlot = state.rightSlot || null;
    this.centerSlot = state.centerSlot || null;
    this.dismantleItem = null;
    this.emberTell = false;
    this.cycleState = null; // cycling is transient, never serialized
  }
}
