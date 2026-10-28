import { RECIPES, CURSED_RECIPES, requiresForge } from '../data/recipes.js';
import { getGolemTypeForResult, GOLEM_CAP } from '../data/golems.js';
import { GAME_STATES } from '../game/GameConfig.js';
import { CraftingSystem } from './CraftingSystem.js';

/**
 * CRAFT Spell — crafts one random Recipe out of what the player has on hand,
 * in REST or EXPLORE. The pair is spent exactly as if it had been placed at
 * the REST station, and the result is claimed through the station's own
 * claim path (MenuSystem.claimCenter), so golems, ingredient results, armor,
 * consumables and weapons route the same way, slot-replacement prompt
 * included. The pair is recorded in the REST station's pair memory: the
 * player saw what came out, and what went missing.
 *
 * What counts as on hand mirrors the crafting menu: the ingredient pile,
 * coins, meter Mana, every carried weapon/armor/consumable, and the Item
 * Chest in REST only (it is out of reach in the field, as at the Dragon
 * Forge). Forge Recipes are never chosen; a golem Recipe is skipped at
 * GOLEM_CAP, where the station would refuse the claim.
 */
export class CraftSpellSystem {
  constructor(game) {
    this.game = game;
  }

  /** Spell response: null when something was crafted (the pickup box answers). */
  cast() {
    const game = this.game;
    const state = game.stateMachine?.getCurrentState();
    if (state !== GAME_STATES.REST && state !== GAME_STATES.EXPLORE) return '...NOTHING.';
    if (!game.player) return '...NOTHING.';

    const onHand = this._onHand(state === GAME_STATES.REST);
    const craftable = this._craftableRecipes(onHand);
    if (craftable.length === 0) return '...NOTHING.';

    const recipe = craftable[Math.floor(Math.random() * craftable.length)];
    this._spend(recipe.left, onHand);
    this._spend(recipe.right, onHand);

    // A scratch station sharing the REST station's pair memory: it resolves
    // the pair (cursed recipes included on a Cursed run) and records it.
    const station = new CraftingSystem(game, { pairMemory: game.craftingSystem });
    station.leftSlot = recipe.left;
    station.setRightSlot(recipe.right);
    game.menuSystem.claimCenter(station);
    game.saveGameState();
    return null;
  }

  /** Would CRAFT make something right now? (LOOKHERE's YOU CAN CRAFT) */
  canCraft() {
    const game = this.game;
    const state = game.stateMachine?.getCurrentState();
    if (state !== GAME_STATES.REST && state !== GAME_STATES.EXPLORE) return false;
    if (!game.player) return false;
    return this._craftableRecipes(this._onHand(state === GAME_STATES.REST)).length > 0;
  }

  /**
   * Everything the player could put in a crafting slot right now:
   * `pile` counts per char (ingredients, coins, meter Mana) and `items`
   * lists live Items per char, unequipped copies first so a spare is spent
   * before the one in hand.
   */
  _onHand(includeChest) {
    const game = this.game;
    const inv = game.inventorySystem;

    const pile = new Map();
    for (const char of game.getIngredients()) pile.set(char, (pile.get(char) ?? 0) + 1);
    const coins = inv.getCoinCount?.() ?? 0;
    if (coins > 0) pile.set('c', coins);
    const meterMana = game.magicSystem.craftableManaCount(game.player);
    if (meterMana > 0) pile.set('𝑚', (pile.get('𝑚') ?? 0) + meterMana);

    const items = new Map();
    const unequipped = [
      ...(includeChest ? inv.itemChest : []),
      ...inv.pendingChestDeposits, // swapped out this trip — still carried
      ...inv.armorInventory,
      ...inv.consumableInventory,
    ];
    const equipped = [...game.player.quickSlots, inv.equippedArmor, ...inv.equippedConsumables];
    for (const item of [...unequipped, ...equipped]) {
      if (!item) continue;
      if (!items.has(item.char)) items.set(item.char, []);
      items.get(item.char).push(item);
    }
    return { pile, items };
  }

  _craftableRecipes({ pile, items }) {
    const game = this.game;
    const count = char => (pile.get(char) ?? 0) + (items.get(char)?.length ?? 0);
    const recipes = game.cursedRun ? [...RECIPES, ...CURSED_RECIPES] : RECIPES;
    const golemsFull = game.golems.length >= GOLEM_CAP;
    return recipes.filter(r => {
      if (requiresForge(r)) return false;
      if (golemsFull && getGolemTypeForResult(r.result)) return false;
      if (r.left === r.right) return count(r.left) >= 2;
      return count(r.left) >= 1 && count(r.right) >= 1;
    });
  }

  /** Take one `char` out of the pile (Mana falls back to the meter) or the carried items. */
  _spend(char, { pile, items }) {
    const game = this.game;
    if ((pile.get(char) ?? 0) > 0) {
      pile.set(char, pile.get(char) - 1);
      if (!game.removeIngredient(char) && char === '𝑚') game.magicSystem.spendCraftMana(game.player);
      return;
    }
    game.menuSystem.takeFromInventory(items.get(char).shift());
  }
}
