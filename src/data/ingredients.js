// Ingredients — the raw drops (letter/digit chars) and the crafted
// intermediates that are also ingredients (dual-registered with ITEMS).
//
// Each entry is an explicit record. `rarity` is one of the RARITY values in
// items.js ('common' | 'uncommon' | 'rare' | 'epic'); it sets the padding and
// tier an ingredient contributes to shop listings. `value` is the fractional
// worth of ONE unit. It prices items in two places (see shopPricing.js):
//   - Pawn: an item's payout is the rounded sum of its recipe chain's ingredient values.
//   - Shop coin cost: double the same chain, each crafting step counting at least a coin.
// Ingredients are never pawned directly. Values and rarities are placeholders
// (1, 'common') until they are authored; `npm run check:data` fails on a missing
// or non-numeric value and on an unknown rarity.

export const INGREDIENTS = {
  // ── Common ────────────────────────────────────────────────────────────────
  'f': { char: 'f', name: 'Fur', color: '#8b4513', value: 0.2, rarity: 'common' },
  'g': { char: 'g', name: 'Goo', color: '#00ff00', value: 0.2, rarity: 'common' },
  'b': { char: 'b', name: 'Bone', color: '#eeeeee', value: 0.2, rarity: 'common' },
  'm': { char: 'm', name: 'Meat', color: '#ff4444', value: 0.4, rarity: 'common' },
  '2': { char: '2', name: 'Ore', color: '#8899aa', value: 0.3, rarity: 'common' },
  'D': { char: 'D', name: 'Sand', color: '#d4a896', value: 0.1, rarity: 'common' },
  '~': { char: '~', name: 'String', color: '#cccccc', value: 1, rarity: 'common' },
  '|': { char: '|', name: 'Stick', color: '#8b4513', value: 0.1, rarity: 'common' },
  '0': { char: '0', name: 'Rock', color: '#888888', value: 0.1, rarity: 'common' },
  'ł': { char: 'ł', name: 'Pollen',    color: '#ffe566', value: 0.1, rarity: 'common' },

  // ── Uncommon ──────────────────────────────────────────────────────────────
  't': { char: 't', name: 'Teeth', color: '#ffffff', value: 0.2, rarity: 'uncommon' },
  'w': { char: 'w', name: 'Wing', color: '#cccccc', value: 0.2, rarity: 'uncommon' },
  'c': { char: 'c', name: 'Coin', color: '#ffff00', value: 1, rarity: 'uncommon' },
  '4': { char: '4', name: 'Slag', color: '#5a4a42', value: 0.1, rarity: 'uncommon' },
  'N': { char: 'N', name: 'Paper', color: '#f0ead6', value: 0.3, rarity: 'uncommon' },
  'a': { char: 'a', name: 'Ash', color: '#888888', value: 0.1, rarity: 'uncommon' },
  'd': { char: 'd', name: 'Dust', color: '#bbbbaa', value: 0.1, rarity: 'uncommon' },
  'i': { char: 'i', name: 'Ice', color: '#aaddff', value: 0.4, rarity: 'uncommon' },
  'l': { char: 'l', name: 'Leaf', color: '#33aa33', value: 0.1, rarity: 'uncommon' },
  '𝑚': { char: '𝑚', name: 'Mana', color: '#8866ff', value: 1.5, rarity: 'uncommon' },
  '⚗': { char: '⚗', name: 'Slurry', color: '#6b8e23', value: 0.4, rarity: 'uncommon' },
  '▤': { char: '▤', name: 'Cloth', color: '#d8ccb0', value: 0.5, rarity: 'uncommon' },
  'ŝ': { char: 'ŝ', name: 'Sap',       color: '#a07040', value: 0.2, rarity: 'uncommon' },
  'ψ': { char: 'ψ', name: 'Grain',     color: '#d8b860', value: 0.1, rarity: 'uncommon' }, // grass cut (shares Pollen's band); a lit fireplace bakes it into Bread,
  'C': { char: 'C', name: 'Clam',           color: '#c8b89a', value: 0.2, rarity: 'uncommon' },
  'K': { char: 'K', name: 'Thick Fur', color: '#c9a876', value: 0.5, rarity: 'uncommon' },
  '⊿': { char: '⊿', name: 'Axe head',        color: '#aaaaaa', value: 0.3, rarity: 'uncommon' },
  '△': { char: '△', name: 'Arrowhead',       color: '#aaaaaa', value: 0.2, rarity: 'uncommon' },
  '❦': { char: '❦', name: 'Moss',           color: '#5a8a3a', value: 0.1, rarity: 'uncommon' },

  // ── Rare ──────────────────────────────────────────────────────────────────
  'F': { char: 'F', name: 'Fire Essence', color: '#ff4400', value: 0.7, rarity: 'rare' },
  'M': { char: 'M', name: 'Metal', color: '#aaaaaa', value: 1, rarity: 'rare' },
  'e': { char: 'e', name: 'Eye', color: '#ffff00', value: 0.4, rarity: 'rare' },
  'h': { char: 'h', name: 'Herb', color: '#44cc44', value: 0.5, rarity: 'rare' },
  'j': { char: 'j', name: 'Jaw', color: '#cccccc', value: 0.3, rarity: 'rare' },
  'k': { char: 'k', name: 'Silk', color: '#cc88ff', value: 1.3, rarity: 'rare' },
  '●': { char: '●', name: 'Pearl', color: '#f4f4f8', value: 2, rarity: 'rare' },
  'r': { char: 'r', name: 'Root', color: '#996633', value: 0.3, rarity: 'rare' },
  '◇': { char: '◇', name: 'Topaz',    color: '#ffcc00', value: 4, rarity: 'rare' },
  '⬥': { char: '⬥', name: 'Garnet',   color: '#cc2222', value: 3, rarity: 'rare' },
  '⬦': { char: '⬦', name: 'Emerald',  color: '#00cc44', value: 3, rarity: 'rare' },
  '⬧': { char: '⬧', name: 'Onyx',     color: '#333344', value: 2, rarity: 'rare' },
  '◈': { char: '◈', name: 'Ruby',     color: '#ff2244', value: 4, rarity: 'rare' },
  '⬨': { char: '⬨', name: 'Sapphire', color: '#2244ff', value: 4, rarity: 'rare' },
  'š': { char: 'š', name: 'Fire Sap',  color: '#ff4400', value: 0.7, rarity: 'rare' },
  'ş': { char: 'ş', name: 'Frost Sap', color: '#88ddff', value: 0.7, rarity: 'rare' },
  'p': { char: 'p', name: 'Pearl Shard',    color: '#ddeeff', value: 0.2, rarity: 'rare' },
  '⚜': { char: '⚜', name: 'Artifact',        color: '#d4af37', value: 2, rarity: 'rare' },

  // ── Epic ──────────────────────────────────────────────────────────────────
  's': { char: 's', name: 'Scale', color: '#ff00ff', value: 2.5, rarity: 'epic' },
  'v': { char: 'v', name: 'Venom', color: '#00ff44', value: 1.5, rarity: 'epic' },
  '⧫': { char: '⧫', name: 'Diamond',  color: '#eeeeff', value: 5, rarity: 'epic' },
};
