import { findRecipe } from '../data/recipes.js';
import { Item } from '../entities/Item.js';

export class CraftingSystem {
  constructor() {
    this.leftSlot = null;
    this.rightSlot = null;
    this.centerSlot = null;
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
    this.updateCrafting();
    return item;
  }

  clearRightSlot() {
    const item = this.rightSlot;
    this.rightSlot = null;
    this.updateCrafting();
    return item;
  }

  clearCenterSlot() {
    const item = this.centerSlot;
    this.centerSlot = null;
    return item;
  }

  updateCrafting() {
    // Clear center slot
    this.centerSlot = null;

    // Check if both slots filled
    if (!this.leftSlot || !this.rightSlot) return;

    // Try to find recipe
    const recipe = findRecipe(this.leftSlot, this.rightSlot);
    if (recipe) {
      // Consume ingredients and create result
      this.centerSlot = recipe.result;
    }
  }

  claimCraftedItem(x, y) {
    if (!this.centerSlot) return null;

    const item = new Item(this.centerSlot, x, y);

    // Consume ingredients
    this.leftSlot = null;
    this.rightSlot = null;
    this.centerSlot = null;

    return item;
  }

  getState() {
    return {
      leftSlot: this.leftSlot,
      rightSlot: this.rightSlot,
      centerSlot: this.centerSlot
    };
  }

  setState(state) {
    this.leftSlot = state.leftSlot || null;
    this.rightSlot = state.rightSlot || null;
    this.centerSlot = state.centerSlot || null;
  }
}
