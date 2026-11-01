// Ingredients — the raw drops (letter/digit chars) and the crafted
// intermediates that are also ingredients (dual-registered with ITEMS).
//
// Each entry is an explicit record. `rarity` is one of the RARITY values in
// items.js ('common' | 'uncommon' | 'rare' | 'epic'); it sets the padding and
// tier an ingredient contributes to shop listings. `value` is the fractional
// worth of ONE unit. It prices items in two places (see shopPricing.js):
//   - Pawn: an item's payout is the floored sum of its recipe's ingredient values.
//   - Shop coin cost: the same sum, marked up and rounded up.
// Ingredients are never pawned directly. Values and rarities are placeholders
// (1, 'common') until they are authored; `npm run check:data` fails on a missing
// or non-numeric value and on an unknown rarity.

export const INGREDIENTS = {
  'f': { char: 'f', name: 'Fur', color: '#8b4513', value: 1, rarity: 'common' },
  't': { char: 't', name: 'Teeth', color: '#ffffff', value: 1, rarity: 'common' },
  'g': { char: 'g', name: 'Goo', color: '#00ff00', value: 1, rarity: 'common' },
  'w': { char: 'w', name: 'Wing', color: '#cccccc', value: 1, rarity: 'common' },
  'c': { char: 'c', name: 'Coin', color: '#ffff00', value: 1, rarity: 'common' },
  'b': { char: 'b', name: 'Bone', color: '#eeeeee', value: 1, rarity: 'common' },
  'm': { char: 'm', name: 'Meat', color: '#ff4444', value: 1, rarity: 'common' },
  's': { char: 's', name: 'Scale', color: '#ff00ff', value: 1, rarity: 'common' },
  'F': { char: 'F', name: 'Fire Essence', color: '#ff4400', value: 1, rarity: 'common' },
  'M': { char: 'M', name: 'Metal', color: '#aaaaaa', value: 1, rarity: 'common' },
  '2': { char: '2', name: 'Ore', color: '#8899aa', value: 1, rarity: 'common' },
  '4': { char: '4', name: 'Slag', color: '#5a4a42', value: 1, rarity: 'common' },
  'D': { char: 'D', name: 'Sand', color: '#d4a896', value: 1, rarity: 'common' },
  'N': { char: 'N', name: 'Paper', color: '#f0ead6', value: 1, rarity: 'common' },
  '~': { char: '~', name: 'String', color: '#cccccc', value: 1, rarity: 'common' },
  '|': { char: '|', name: 'Stick', color: '#8b4513', value: 1, rarity: 'common' },
  'a': { char: 'a', name: 'Ash', color: '#888888', value: 1, rarity: 'common' },
  'd': { char: 'd', name: 'Dust', color: '#bbbbaa', value: 1, rarity: 'common' },
  'e': { char: 'e', name: 'Eye', color: '#ffff00', value: 1, rarity: 'common' },
  'h': { char: 'h', name: 'Herb', color: '#44cc44', value: 1, rarity: 'common' },
  'i': { char: 'i', name: 'Ice', color: '#aaddff', value: 1, rarity: 'common' },
  'j': { char: 'j', name: 'Jaw', color: '#cccccc', value: 1, rarity: 'common' },
  'k': { char: 'k', name: 'Silk', color: '#cc88ff', value: 1, rarity: 'common' },
  'l': { char: 'l', name: 'Leaf', color: '#33aa33', value: 1, rarity: 'common' },
  '●': { char: '●', name: 'Pearl', color: '#f4f4f8', value: 1, rarity: 'common' },
  'r': { char: 'r', name: 'Root', color: '#996633', value: 1, rarity: 'common' },
  'v': { char: 'v', name: 'Venom', color: '#00ff44', value: 1, rarity: 'common' },
  '0': { char: '0', name: 'Rock', color: '#888888', value: 1, rarity: 'common' },
  '◇': { char: '◇', name: 'Topaz',    color: '#ffcc00', value: 1, rarity: 'common' },
  '⬥': { char: '⬥', name: 'Garnet',   color: '#cc2222', value: 1, rarity: 'common' },
  '⬦': { char: '⬦', name: 'Emerald',  color: '#00cc44', value: 1, rarity: 'common' },
  '⧫': { char: '⧫', name: 'Diamond',  color: '#eeeeff', value: 1, rarity: 'common' },
  '⬧': { char: '⬧', name: 'Onyx',     color: '#333344', value: 1, rarity: 'common' },
  '◈': { char: '◈', name: 'Ruby',     color: '#ff2244', value: 1, rarity: 'common' },
  '⬨': { char: '⬨', name: 'Sapphire', color: '#2244ff', value: 1, rarity: 'common' },
  '𝑚': { char: '𝑚', name: 'Mana', color: '#8866ff', value: 1, rarity: 'common' },

  '⚗': { char: '⚗', name: 'Slurry', color: '#6b8e23', value: 1, rarity: 'common' },

  '▤': { char: '▤', name: 'Cloth', color: '#d8ccb0', value: 1, rarity: 'common' },

  'ŝ': { char: 'ŝ', name: 'Sap',       color: '#a07040', value: 1, rarity: 'common' },
  'š': { char: 'š', name: 'Fire Sap',  color: '#ff4400', value: 1, rarity: 'common' },
  'ş': { char: 'ş', name: 'Frost Sap', color: '#88ddff', value: 1, rarity: 'common' },
  'ł': { char: 'ł', name: 'Pollen',    color: '#ffe566', value: 1, rarity: 'common' },
  'ψ': { char: 'ψ', name: 'Grain',     color: '#d8b860', value: 1, rarity: 'common' }, // grass cut (shares Pollen's band); a lit fireplace bakes it into Bread

  'p': { char: 'p', name: 'Pearl Shard',    color: '#ddeeff', value: 1, rarity: 'common' },
  'C': { char: 'C', name: 'Clam',           color: '#c8b89a', value: 1, rarity: 'common' },
  'n': { char: 'n', name: 'Sharkbone',      color: '#ccd8e8', value: 1, rarity: 'common' },

  'K': { char: 'K', name: 'Thick Fur', color: '#c9a876', value: 1, rarity: 'common' },

  '⊿': { char: '⊿', name: 'Axe head',        color: '#aaaaaa', value: 1, rarity: 'common' },
  '△': { char: '△', name: 'Arrowhead',       color: '#aaaaaa', value: 1, rarity: 'common' },
  '⚜': { char: '⚜', name: 'Artifact',        color: '#d4af37', value: 1, rarity: 'common' },
  '❦': { char: '❦', name: 'Moss',           color: '#5a8a3a', value: 1, rarity: 'common' }
};
