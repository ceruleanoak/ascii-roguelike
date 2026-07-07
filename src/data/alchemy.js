import { applyCipher } from './cipher.js';

// Alchemy ingredient sets — which raw ingredient letters produce which
// starter potion when combined with a Bottle of Water at the Cauldron.
// Shared between AlchemySystem (player-crafted starter potions) and
// LootSystem (found starter potions, which also need a hidden ingredient
// stamped on spawn).

export const BASE_POTION_INGREDIENTS = new Set(['b', 'd', 'l', 'r']);   // Bone, Dust, Leaf, Root -> Base Potion 'G'
export const PURIFIED_POTION_INGREDIENTS = new Set(['s', 'a', 'h']);    // Scale, Ash, Herb -> Purified Potion
export const UNSTABLE_POTION_INGREDIENTS = new Set(['e', 'v', 'w']);    // Eye, Venom, Wing -> Unstable Potion

export const STARTER_POTION_CHARS = new Set(['G', '🜅', '🜆']);

export function starterPotionIngredientsFor(starterChar) {
  if (starterChar === 'G') return BASE_POTION_INGREDIENTS;
  if (starterChar === '🜅') return PURIFIED_POTION_INGREDIENTS;
  if (starterChar === '🜆') return UNSTABLE_POTION_INGREDIENTS;
  return null;
}

export function starterPotionForIngredient(ingredientChar) {
  if (BASE_POTION_INGREDIENTS.has(ingredientChar)) return 'G';
  if (PURIFIED_POTION_INGREDIENTS.has(ingredientChar)) return '🜅';
  if (UNSTABLE_POTION_INGREDIENTS.has(ingredientChar)) return '🜆';
  return null;
}

// Ingredient letter → Greek symbol using the game's cipher system
export function ingredientToGreek(char) {
  return applyCipher(char);
}

/**
 * Potion modifier effects — define how purified (+) and unstable (?) versions
 * of each potion differ from the base.
 *
 * Purified (+): Enhanced, more powerful version
 * Unstable (?): Volatile, risky version with random outcomes (bad roll possibility)
 *
 * Several potions reworked to be "permanent while in room" instead of duration-based.
 * These expire on room exit.
 */
export const POTION_MODIFIERS = {
  // 'H' - Health Potion: heal amount (random for unstable)
  // Only triggers when player HP <= 3 (red blinking state)
  'H': {
    base: { amount: 3 },
    buff: { amount: 5 },                    // Stronger healing
    unstable: { isRandom: true, min: -2, max: 7 } // Random outcome: heal 0-7 or damage 2
  },

  // 'q' - Haste Draught: reworked to "amount of haste" (permanent until room exit)
  // Permanent while in room, benefit is the amount/intensity of haste applied
  'q': {
    base: { hasteAmount: 1.25 },            // 25% speed increase
    buff: { hasteAmount: 1.50 },            // 50% speed increase
    unstable: { isRandom: true, min: 1.10, max: 1.60 } // Random: -10% to +60% (bad roll = slow)
  },

  // 'x' - Stone Skin: reworked to permanent until room exit
  // Benefit is the defense bonus amount
  'x': {
    base: { defenseBonus: 3 },
    buff: { defenseBonus: 5 },
    unstable: { isRandom: true, min: 1, max: 6 } // Random defense bonus, bad roll = minimal protection
  },

  // 'u' - Battle Elixir: reworked to permanent until room exit
  // Benefit is the damage bonus amount
  'u': {
    base: { damageBonus: 2 },
    buff: { damageBonus: 3 },
    unstable: { isRandom: true, min: -1, max: 4 } // Random damage bonus, bad roll = weakness
  },

  // 'z' - Mending Brew: reworked to permanent until room exit
  // Benefit is the regen rate (HP per tick), unstable ranges from 0 to better than purified
  'z': {
    base: { regenAmount: 1 },                // 1 HP per tick
    buff: { regenAmount: 2 },                // 2 HP per tick
    unstable: { isRandom: true, min: 0, max: 3 } // Random: 0-3 HP per tick, bad roll = nothing
  }
};

/**
 * Get the effect parameters for a potion based on its modifier.
 * Returns the base parameters adjusted by the potion modifier (buff/unstable).
 * For unstable potions with random effects, rolls the random value.
 *
 * Returns object with effect params, plus { isUnstableBadRoll, unstableRoll } if applicable
 */
export function getPotionEffectParams(potionChar, modifier = null) {
  const modifiers = POTION_MODIFIERS[potionChar];
  if (!modifiers) return null;

  let params;
  let isUnstableBadRoll = false;
  let unstableRoll = null;

  if (modifier === 'buff' && modifiers.buff) {
    params = modifiers.buff;
  } else if (modifier === 'unstable' && modifiers.unstable) {
    const unstableSpec = modifiers.unstable;
    if (unstableSpec.isRandom) {
      // Roll a random value between min and max
      unstableRoll = unstableSpec.min + Math.random() * (unstableSpec.max - unstableSpec.min);

      // Determine if this is a "bad roll" (worse than base, or significantly worse than purified)
      const baseDef = modifiers.base;
      const buffDef = modifiers.buff;

      // Get baseline value to compare against
      let baselineValue = null;
      let rollValue = unstableRoll;

      // Try to extract the main numeric parameter
      if (baseDef.amount !== undefined) baselineValue = baseDef.amount;
      else if (baseDef.hasteAmount !== undefined) baselineValue = baseDef.hasteAmount;
      else if (baseDef.defenseBonus !== undefined) baselineValue = baseDef.defenseBonus;
      else if (baseDef.damageBonus !== undefined) baselineValue = baseDef.damageBonus;
      else if (baseDef.regenAmount !== undefined) baselineValue = baseDef.regenAmount;

      // Bad roll = significantly less than base
      if (baselineValue !== null && rollValue < baselineValue * 0.5) {
        isUnstableBadRoll = true;
      }

      // Return the rolled value as a parameter object
      params = { ...unstableSpec };
      delete params.isRandom;
      delete params.min;
      delete params.max;

      // Apply the rolled value to the appropriate parameter
      if (unstableSpec.min !== undefined && typeof unstableSpec.min === 'number') {
        // Find which parameter was being rolled
        if (baseDef.amount !== undefined) params.amount = rollValue;
        else if (baseDef.hasteAmount !== undefined) params.hasteAmount = rollValue;
        else if (baseDef.defenseBonus !== undefined) params.defenseBonus = Math.round(rollValue);
        else if (baseDef.damageBonus !== undefined) params.damageBonus = Math.round(rollValue);
        else if (baseDef.regenAmount !== undefined) params.regenAmount = Math.round(rollValue);
      }
    } else {
      params = unstableSpec;
    }
  } else {
    params = modifiers.base;
  }

  return {
    ...params,
    isUnstableBadRoll,
    unstableRoll,
    modifier
  };
}
