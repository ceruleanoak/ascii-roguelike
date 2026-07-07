import { findRecipe } from '../data/recipes.js';
import { Item } from '../entities/Item.js';
import { WEAPON_TIERS, ITEMS, isIngredient } from '../data/items.js';

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
  constructor() {
    this.leftSlot = null;
    this.rightSlot = null;
    this.centerSlot = null;
    this.cycleState = null; // { pool, predeterminedResult, cyclingStartTime }
    this.discoveredPairs = new Map(); // ingredientChar → Set<ingredientChar>
    this.failedPairs = new Map();    // ingredientChar → Set<ingredientChar>
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
    this._cancelCycling();

    if (!this.leftSlot || !this.rightSlot) return;

    // Normal recipe takes priority
    const recipe = findRecipe(this.leftSlot, this.rightSlot);
    if (recipe) {
      this.centerSlot = recipe.result;
      // Flag both ingredients as identified partners
      if (!this.discoveredPairs.has(this.leftSlot)) this.discoveredPairs.set(this.leftSlot, new Set());
      if (!this.discoveredPairs.has(this.rightSlot)) this.discoveredPairs.set(this.rightSlot, new Set());
      this.discoveredPairs.get(this.leftSlot).add(this.rightSlot);
      this.discoveredPairs.get(this.rightSlot).add(this.leftSlot);
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
    if (!this.failedPairs.has(this.leftSlot)) this.failedPairs.set(this.leftSlot, new Set());
    if (!this.failedPairs.has(this.rightSlot)) this.failedPairs.set(this.rightSlot, new Set());
    this.failedPairs.get(this.leftSlot).add(this.rightSlot);
    this.failedPairs.get(this.rightSlot).add(this.leftSlot);
  }

  getIdentifiedPartners(char) {
    return this.discoveredPairs.get(char) ?? new Set();
  }

  getFailedPartners(char) {
    return this.failedPairs.get(char) ?? new Set();
  }

  resetDiscoveries() {
    this.discoveredPairs = new Map();
    this.failedPairs = new Map();
  }

  hasCenterContent() {
    return !!(this.centerSlot || this.cycleState);
  }

  /**
   * Claim a center-slot result that is itself a raw ingredient (e.g. Mana) —
   * these bank straight into inventory rather than becoming an equippable
   * Item, since ingredients have no equipment slot to occupy. Returns the
   * ingredient char, or null if the center slot holds a real crafted item.
   */
  claimCraftedIngredient() {
    if (this.cycleState || !this.centerSlot || !isIngredient(this.centerSlot)) return null;
    const char = this.centerSlot;
    this.leftSlot = null;
    this.rightSlot = null;
    this.centerSlot = null;
    return char;
  }

  claimCraftedItem(x, y) {
    if (this.cycleState) {
      const result = this.cycleState.predeterminedResult;
      this._cancelCycling();
      this.leftSlot = null;
      this.rightSlot = null;
      this.centerSlot = null;
      return new Item(result, x, y);
    }

    if (!this.centerSlot) return null;

    const item = new Item(this.centerSlot, x, y);
    this.leftSlot = null;
    this.rightSlot = null;
    this.centerSlot = null;
    return item;
  }

  getState() {
    return {
      leftSlot: this.leftSlot,
      rightSlot: this.rightSlot,
      centerSlot: this.centerSlot,
      cycleState: this.cycleState
    };
  }

  setState(state) {
    this.leftSlot = state.leftSlot || null;
    this.rightSlot = state.rightSlot || null;
    this.centerSlot = state.centerSlot || null;
    this.cycleState = null; // cycling is transient, never serialized
  }
}
