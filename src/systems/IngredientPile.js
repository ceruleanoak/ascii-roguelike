/**
 * IngredientPile.js
 *
 * The ingredient pile's own read/write operations, pulled out of
 * InventorySystem as free functions taking `inv` (an InventorySystem
 * instance) — same pattern as itemCostDispatch.js and TrapSystem's
 * chest-array helpers — to keep InventorySystem itself thin. The pile
 * (`inv.ingredients`) stays a flat array on InventorySystem; this file is
 * just the logic that touches it.
 */

// Per-char stack cap on the pile — see addIngredient().
export const INGREDIENT_STACK_CAP = 10;

export function getIngredients(inv) {
  return inv.ingredients;
}

export function hasIngredient(inv, char) {
  return inv.ingredients.includes(char);
}

export function countIngredient(inv, char) {
  let n = 0;
  for (const c of inv.ingredients) if (c === char) n++;
  return n;
}

// Each distinct char caps at INGREDIENT_STACK_CAP. Returns whether the
// ingredient was actually added, so ground-pickup callers can leave a
// capped-out ingredient sitting in the world instead of vanishing it.
export function addIngredient(inv, char) {
  if (countIngredient(inv, char) >= INGREDIENT_STACK_CAP) return false;
  inv.ingredients.push(char);
  return true;
}

// Spends one. Returns whether there was one to spend, so callers that pay a
// cost can bail instead of handing out the reward for free.
export function removeIngredient(inv, char) {
  const idx = inv.ingredients.indexOf(char);
  if (idx === -1) return false;
  inv.ingredients.splice(idx, 1);
  return true;
}

// Removes and returns one random ingredient's char from the pile, or null if
// empty. For callers (Monkey's satchel theft) that eject ingredients without
// knowing which char they'll get ahead of time.
export function removeRandomIngredient(inv) {
  if (inv.ingredients.length === 0) return null;
  const idx = Math.floor(Math.random() * inv.ingredients.length);
  return inv.ingredients.splice(idx, 1)[0];
}

// ─── Coin-or-ingredient dispatch ────────────────────────────────────────────
// Coins ('c') live in the passive wallet rather than the pile (spendable at
// wells / NPCs / crafting, never stack-capped); everything else is a pile
// char. Game's hasIngredient/countIngredient/addIngredient/removeIngredient
// delegate here so main.js stays dispatch-only.
export function hasIngredientOrCoin(inv, char) {
  if (char === 'c') return inv.getCoinCount() > 0;
  return hasIngredient(inv, char);
}

export function countIngredientOrCoin(inv, char) {
  if (char === 'c') return inv.getCoinCount();
  return countIngredient(inv, char);
}

export function addIngredientOrCoin(inv, char) {
  if (char === 'c') { inv.addCoin(); return true; }
  return addIngredient(inv, char);
}

export function removeIngredientOrCoin(inv, char) {
  if (char === 'c') return inv.removeCoin();
  return removeIngredient(inv, char);
}
