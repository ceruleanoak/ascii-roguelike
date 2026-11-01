// Ingredients — the raw drops (letter/digit chars) and the crafted
// intermediates that are also ingredients (dual-registered with ITEMS).
//
// Each entry is an explicit record. `value` is the fractional worth of ONE
// unit. It prices items in two places (see shopPricing.js):
//   - Pawn: an item's payout is the floored sum of its recipe's ingredient values.
//   - Shop coin cost: the same sum, marked up and rounded up.
// Ingredients are never pawned directly. Values are placeholders (1) until
// they are authored; `npm run check:data` fails on a missing or non-numeric value.

export const INGREDIENTS = {
  'f': { char: 'f', name: 'Fur', color: '#8b4513', value: 1 },
  't': { char: 't', name: 'Teeth', color: '#ffffff', value: 1 },
  'g': { char: 'g', name: 'Goo', color: '#00ff00', value: 1 },
  'w': { char: 'w', name: 'Wing', color: '#cccccc', value: 1 },
  'c': { char: 'c', name: 'Coin', color: '#ffff00', value: 1 },
  'b': { char: 'b', name: 'Bone', color: '#eeeeee', value: 1 },
  'm': { char: 'm', name: 'Meat', color: '#ff4444', value: 1 },
  's': { char: 's', name: 'Scale', color: '#ff00ff', value: 1 },
  'F': { char: 'F', name: 'Fire Essence', color: '#ff4400', value: 1 },
  'M': { char: 'M', name: 'Metal', color: '#aaaaaa', value: 1 },
  '2': { char: '2', name: 'Ore', color: '#8899aa', value: 1 },
  '4': { char: '4', name: 'Slag', color: '#5a4a42', value: 1 },
  'D': { char: 'D', name: 'Sand', color: '#d4a896', value: 1 },
  'N': { char: 'N', name: 'Paper', color: '#f0ead6', value: 1 },
  '~': { char: '~', name: 'String', color: '#cccccc', value: 1 },
  '|': { char: '|', name: 'Stick', color: '#8b4513', value: 1 },
  'a': { char: 'a', name: 'Ash', color: '#888888', value: 1 },
  'd': { char: 'd', name: 'Dust', color: '#bbbbaa', value: 1 },
  'e': { char: 'e', name: 'Eye', color: '#ffff00', value: 1 },
  'h': { char: 'h', name: 'Herb', color: '#44cc44', value: 1 },
  'i': { char: 'i', name: 'Ice', color: '#aaddff', value: 1 },
  'j': { char: 'j', name: 'Jaw', color: '#cccccc', value: 1 },
  'k': { char: 'k', name: 'Silk', color: '#cc88ff', value: 1 },
  'l': { char: 'l', name: 'Leaf', color: '#33aa33', value: 1 },
  '●': { char: '●', name: 'Pearl', color: '#f4f4f8', value: 1 },
  'r': { char: 'r', name: 'Root', color: '#996633', value: 1 },
  'v': { char: 'v', name: 'Venom', color: '#00ff44', value: 1 },
  '0': { char: '0', name: 'Rock', color: '#888888', value: 1 },
  '◇': { char: '◇', name: 'Topaz',    color: '#ffcc00', value: 1 },
  '⬥': { char: '⬥', name: 'Garnet',   color: '#cc2222', value: 1 },
  '⬦': { char: '⬦', name: 'Emerald',  color: '#00cc44', value: 1 },
  '⧫': { char: '⧫', name: 'Diamond',  color: '#eeeeff', value: 1 },
  '⬧': { char: '⬧', name: 'Onyx',     color: '#333344', value: 1 },
  '◈': { char: '◈', name: 'Ruby',     color: '#ff2244', value: 1 },
  '⬨': { char: '⬨', name: 'Sapphire', color: '#2244ff', value: 1 },
  '𝑚': { char: '𝑚', name: 'Mana', color: '#8866ff', value: 1 },

  '⚗': { char: '⚗', name: 'Slurry', color: '#6b8e23', value: 1 },

  '▤': { char: '▤', name: 'Cloth', color: '#d8ccb0', value: 1 },

  'ŝ': { char: 'ŝ', name: 'Sap',       color: '#a07040', value: 1 },
  'š': { char: 'š', name: 'Fire Sap',  color: '#ff4400', value: 1 },
  'ş': { char: 'ş', name: 'Frost Sap', color: '#88ddff', value: 1 },
  'ł': { char: 'ł', name: 'Pollen',    color: '#ffe566', value: 1 },
  'ψ': { char: 'ψ', name: 'Grain',     color: '#d8b860', value: 1 }, // grass cut (shares Pollen's band); a lit fireplace bakes it into Bread

  'p': { char: 'p', name: 'Pearl Shard',    color: '#ddeeff', value: 1 },
  'C': { char: 'C', name: 'Clam',           color: '#c8b89a', value: 1 },
  'n': { char: 'n', name: 'Sharkbone',      color: '#ccd8e8', value: 1 },

  'K': { char: 'K', name: 'Thick Fur', color: '#c9a876', value: 1 },

  '⊿': { char: '⊿', name: 'Axe head',        color: '#aaaaaa', value: 1 },
  '△': { char: '△', name: 'Arrowhead',       color: '#aaaaaa', value: 1 },
  '⚜': { char: '⚜', name: 'Artifact',        color: '#d4af37', value: 1 },
  '❦': { char: '❦', name: 'Moss',           color: '#5a8a3a', value: 1 }
};
