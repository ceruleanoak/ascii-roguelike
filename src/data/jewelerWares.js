// Jeweler's wares — what the Jeweler strings for the player, and the price.
// Pure data; JewelerSystem owns buying and delivery.
//
// The four Gem Necklaces are the same items String + gem crafts at REST
// (recipes.js); here the Jeweler's labor stands in for the String. The
// Rainbow Necklace has no recipe at all — the Jeweler is its only source,
// and its price is every elemental gem at once.
//
// `gems` lists ingredient chars spent one each; `coins` is the coin price.
// Rows never sell out: the Jeweler strings as many as the player can pay for.
export const JEWELER_WARES = [
  { char: 'ᑌ', gems: ['◈'], coins: 1 },                  // Ruby Necklace
  { char: 'ᑗ', gems: ['⬨'], coins: 1 },                  // Sapphire Necklace
  { char: 'ᑘ', gems: ['◇'], coins: 1 },                  // Topaz Necklace
  { char: 'ᑙ', gems: ['⬦'], coins: 1 },                  // Emerald Necklace
  { char: 'ᑚ', gems: ['◈', '⬨', '◇', '⬦'], coins: 3 },   // Rainbow Necklace
];

// What the Jeweler will drink: a Bottle of Water first, a Health Potion if
// that's all the player has. Order is the order JewelerSystem tries them.
export const JEWELER_DRINKS = ['🜉', 'H'];
