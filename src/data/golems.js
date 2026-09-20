// Golem companions — summoned at the REST Combine Station by pairing an
// ingredient with Mana. Unlike every other recipe, the "result" is not an
// inventory item: CraftingSystem.claimCraftedGolem() intercepts the crafted
// sentinel char and hands the type key straight to
// CompanionSystem.spawnGolem() instead of ever constructing an Item (see
// ITEMS['♟'] etc. in items.js — registered with type GOLEM purely so
// tools/check-data.js's recipe-resolves-to-something gate passes; they must
// never be spawned into the world or picked up).
//
// One data-driven GolemCompanion class (src/entities/GolemCompanion.js) reads
// this table rather than four subclasses — matches the Enemy "compose, don't
// subclass" convention (GLOSSARY.md's Enemy entry) even though golems aren't
// Enemies.
export const GOLEM_TYPES = {
  slag: {
    name: 'Slag Golem',
    resultChar: '♟',
    ingredientChar: '4',   // Slag
    maxHp: 2,
    color: '#5a4a42',      // matches Slag's own item color
    resurrect: false,
  },
  mud: {
    name: 'Mud Golem',
    resultChar: '♞',
    ingredientChar: '◐',   // Bottle of Mud (no raw Mud ingredient exists)
    maxHp: 1,
    color: '#664422',      // matches wet-mud color (zones.js mudColorWet)
    resurrect: true,
    // Indefinite revives, but never instantly — a long cooldown so a Mud
    // Golem dying mid-fight is a real (if temporary) loss of the body, not a
    // free unkillable meat shield.
    resurrectCooldown: 10,
  },
  rock: {
    name: 'Rock Golem',
    resultChar: '♜',
    ingredientChar: '0',   // Rock
    maxHp: 1,
    color: '#888888',      // matches Rock's own item color
    resurrect: false,
  },
  metal: {
    name: 'Metal Golem',
    resultChar: '♚',
    ingredientChar: 'M',   // Metal
    maxHp: 5,
    color: '#aaaaaa',      // matches Metal's own item color
    resurrect: false,
  },
};

// Total golems (any type combined) the player may have summoned at once.
// Crafting a recipe that would exceed this is a no-op — the ingredient/mana
// pairing is not consumed (CraftingSystem.claimCraftedGolem returns null).
export const GOLEM_CAP = 5;

// Reverse lookup: crafted sentinel char -> golem type key, or null. Used by
// CraftingSystem.claimCraftedGolem() so the crafting-center claim path never
// has to know the sentinel chars itself.
export function getGolemTypeForResult(resultChar) {
  for (const [key, def] of Object.entries(GOLEM_TYPES)) {
    if (def.resultChar === resultChar) return key;
  }
  return null;
}
