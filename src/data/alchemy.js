import { applyCipher } from './cipher.js';

// Alchemy ingredient sets — which raw ingredient letters produce which
// starter potion when combined with a Bottle of Water at the Cauldron.
// Shared between AlchemySystem (player-crafted starter potions) and
// LootSystem (found starter potions, which also need a hidden ingredient
// stamped on spawn).

export const BASE_POTION_INGREDIENTS = new Set(['b', 'd', 'l', 'r']);   // Bone, Dust, Leaf, Root -> Base Potion '🜄'
export const PURIFIED_POTION_INGREDIENTS = new Set(['s', 'a', 'h']);    // Scale, Ash, Herb -> Purified Potion
export const UNSTABLE_POTION_INGREDIENTS = new Set(['e', 'v', 'w', '⚗']);    // Eye, Venom, Wing, Slurry -> Unstable Potion

export const STARTER_POTION_CHARS = new Set(['🜄', '🜅', '🜆']);

// Bottle of Hot Water — shared by HutSystem (Alchemist hut-presence gate)
// and roomFeatures (roaming-placement gate). Single source of truth so the
// char never drifts between the two "currently carrying" checks.
export const HOT_WATER_CHAR = '🜊';

// Union of every raw ingredient that can seed a starter potion — the
// "1st ingredients" the Quagmire's decor drops from. Shared between
// AlchemySystem (cauldron ingredient menu) and the Quagmire drop override.
export const ALL_STARTER_INGREDIENTS = new Set([
  ...BASE_POTION_INGREDIENTS,
  ...PURIFIED_POTION_INGREDIENTS,
  ...UNSTABLE_POTION_INGREDIENTS
]);

/** Uniform random pick from the 1st-ingredients pool (Quagmire decor drops). */
export function pickQuagmireIngredient() {
  const pool = [...ALL_STARTER_INGREDIENTS];
  return pool[Math.floor(Math.random() * pool.length)];
}

export function starterPotionIngredientsFor(starterChar) {
  if (starterChar === '🜄') return BASE_POTION_INGREDIENTS;
  if (starterChar === '🜅') return PURIFIED_POTION_INGREDIENTS;
  if (starterChar === '🜆') return UNSTABLE_POTION_INGREDIENTS;
  return null;
}

export function starterPotionForIngredient(ingredientChar) {
  if (BASE_POTION_INGREDIENTS.has(ingredientChar)) return '🜄';
  if (PURIFIED_POTION_INGREDIENTS.has(ingredientChar)) return '🜅';
  if (UNSTABLE_POTION_INGREDIENTS.has(ingredientChar)) return '🜆';
  return null;
}

// Any raw ingredient that can be combined at the Cauldron to start a potion —
// the "Components" designation used by the Tab inventory overlay.
export function isPotionIngredient(ingredientChar) {
  return starterPotionForIngredient(ingredientChar) !== null;
}

// Ingredient letter → Greek symbol using the game's cipher system
export function ingredientToGreek(char) {
  return applyCipher(char);
}

/**
 * The Alchemist's Path — a potion's color/purity is fixed at the starter
 * tier and must persist through to the true potion it becomes, rather than
 * resetting to a fixed per-recipe color. Maps every starter char (water-path
 * 🜄/🜅/🜆 plus the liquid-path charge/burn/primal starters !/«/∿) to the
 * `potionModifier` it stamps, and each modifier to its canonical color.
 */
export const POTION_STARTER_MODIFIERS = {
  '🜄': null,          // Base — unmodified
  '🜅': 'buff',        // Purified
  '🜆': 'unstable',    // Unstable
  '!': 'charge',       // Charged (Electrified Water path)
  '«': 'burn',         // Burning (Magma path)
  '∿': 'primal'        // Primal (Mud path)
};

export const POTION_MODIFIER_COLORS = {
  base: '#3355ff',      // blue
  buff: '#ffffff',      // purified — devoid of color
  unstable: '#8833cc',  // violet
  charge: '#ffdd33',    // yellow
  burn: '#ff3333',      // red
  primal: '#33cc33'     // green
};

/**
 * Stamps a crafted item with the potionModifier and color implied by the
 * starter char that produced it. Called wherever a true potion (or a
 * re-stamped starter) is constructed — the Cauldron's _commitTrue and the
 * REST Combine Station's claimCraftedItem.
 */
export function applyPotionModifierColor(item, starterChar) {
  const modifier = POTION_STARTER_MODIFIERS[starterChar] ?? null;
  item.potionModifier = modifier;
  item.color = POTION_MODIFIER_COLORS[modifier ?? 'base'];
  return item;
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

  // 'x' - Stone Skin: halves incoming damage (rounded down) while active — a
  // fixed effect with no magnitude to scale (see PlayerDamageSystem.applyDamage),
  // so purification differentiates by duration instead of amount. The general
  // rule going forward: purification scales magnitude for additive effects
  // (heal/haste/damage/regen amount above), duration for non-additive ones.
  'x': {
    base: { duration: 10 },
    buff: { duration: 16 },                       // Purified: longer protection window
    unstable: { isRandom: true, min: 4, max: 20 }  // Random duration, bad roll = brief protection
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
      else if (baseDef.damageBonus !== undefined) baselineValue = baseDef.damageBonus;
      else if (baseDef.regenAmount !== undefined) baselineValue = baseDef.regenAmount;
      else if (baseDef.duration !== undefined) baselineValue = baseDef.duration;

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
        else if (baseDef.damageBonus !== undefined) params.damageBonus = Math.round(rollValue);
        else if (baseDef.regenAmount !== undefined) params.regenAmount = Math.round(rollValue);
        else if (baseDef.duration !== undefined) params.duration = Math.round(rollValue);
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
