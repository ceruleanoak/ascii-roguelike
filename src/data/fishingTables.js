// Zone-specific fishing catch tables for the Lake ('L') room
// Each catch: { name, char, color, drops[], weight }
// 'char' is always 'ծ' (Armenian Da). Every fish is just 'Fish' — one name, one
// color; a table's drops are the only thing that tells catches apart.
// 'drops' are ingredient chars spawned when the reward object is melee-hit
// 'specialDrops' (optional) are ITEMS keys spawned alongside ingredient drops —
// FishingSystem looks these up via spawnItemFn so non-ingredient items (e.g.
// empty bottle, fairy) can come out of catches. Distinct from 'drops' because
// drops use the INGREDIENTS char namespace and would collide otherwise.
// 'directPickupItem' (optional) is an ITEMS key granted straight to the
// player on SPACE — the one exception to "a blade opens the catch" (Fish:
// cutting it wastes it instead, same as any other catch with no drops).

export const FISHING_TABLES = {
  green: {
    rusalkaChance: 0.04,
    catches: [
      { name: 'Fish',        char: 'ծ', color: '#7ec8e3', drops: ['g', 'v'],        weight: 30 },
      { name: 'Fish',       char: 'ծ', color: '#7ec8e3', drops: ['m'],             weight: 25 },
      { name: 'Fish',    char: 'ծ', color: '#7ec8e3', drops: ['b'],             weight: 20 },
      { name: 'Fish',        char: 'ծ', color: '#7ec8e3', drops: ['v'],             weight: 15 },
      { name: 'Fish',char: 'ծ', color: '#7ec8e3', drops: ['b', 'm'],        weight: 10 },
      { name: 'Fish',        char: 'ծ', color: '#7ec8e3', drops: [], directPickupItem: '♓', weight: 20 },
      { name: 'Empty Bottle',char: 'ծ', color: '#aaccee', drops: [], specialDrops: ['B'], weight: 4 },
      // Sea supply line: rare catches for the pearl recipes (Pearl weapons).
      { name: 'Fish', char: 'ծ', color: '#7ec8e3', drops: ['p'],             weight: 3 }
    ]
  },

  // Ocean ('O') rooms — any zone. Saltwater creatures plus a meaningfully
  // fatter sea supply line (p/n) than green lakes; the fisherman's pearl
  // legend points here.
  ocean: {
    rusalkaChance: 0,
    catches: [
      { name: 'Fish',     char: 'ծ', color: '#7ec8e3', drops: ['m'],            weight: 30 },
      { name: 'Fish',    char: 'ծ', color: '#7ec8e3', drops: ['b', 'g'],       weight: 22 },
      { name: 'Fish',    char: 'ծ', color: '#7ec8e3', drops: ['v', 'g'],       weight: 18 },
      { name: 'Fish',       char: 'ծ', color: '#7ec8e3', drops: ['p'],            weight: 12 },
      { name: 'Fish',         char: 'ծ', color: '#7ec8e3', drops: [], directPickupItem: '♓', weight: 20 },
      { name: 'Empty Bottle', char: 'ծ', color: '#aaccee', drops: [], specialDrops: ['B'], weight: 4 }
    ]
  },

  red: {
    rusalkaChance: 0,
    catches: [
      { name: 'Fish',  char: 'ծ', color: '#7ec8e3', drops: ['F', 'a'],        weight: 30 },
      { name: 'Fish',    char: 'ծ', color: '#7ec8e3', drops: ['F'],             weight: 25 },
      { name: 'Fish',    char: 'ծ', color: '#7ec8e3', drops: ['a', 'm'],        weight: 25 },
      { name: 'Fish',  char: 'ծ', color: '#7ec8e3', drops: ['F', 'g'],        weight: 20 },
      { name: 'Fish',        char: 'ծ', color: '#7ec8e3', drops: [], directPickupItem: '♓', weight: 20 },
      { name: 'Empty Bottle',char: 'ծ', color: '#aaccee', drops: [], specialDrops: ['B'], weight: 4 }
    ]
  },

  cyan: {
    rusalkaChance: 0,
    catches: [
      { name: 'Fish',       char: 'ծ', color: '#7ec8e3', drops: ['i'],          weight: 30 },
      { name: 'Fish',     char: 'ծ', color: '#7ec8e3', drops: ['i', 'b'],     weight: 25 },
      { name: 'Fish',   char: 'ծ', color: '#7ec8e3', drops: ['m'],          weight: 25 },
      { name: 'Fish',char: 'ծ', color: '#7ec8e3', drops: ['i', 'v'],     weight: 20 },
      { name: 'Fish',           char: 'ծ', color: '#7ec8e3', drops: [], directPickupItem: '♓', weight: 20 },
      { name: 'Empty Bottle',   char: 'ծ', color: '#aaccee', drops: [], specialDrops: ['B'], weight: 4 }
    ]
  },

  yellow: {
    rusalkaChance: 0,
    catches: [
      { name: 'Fish',      char: 'ծ', color: '#7ec8e3', drops: ['1'],          weight: 30 },
      { name: 'Fish',   char: 'ծ', color: '#7ec8e3', drops: ['g', '1'],     weight: 25 },
      { name: 'Fish',char: 'ծ', color: '#7ec8e3', drops: ['1'],          weight: 25 },
      { name: 'Fish',   char: 'ծ', color: '#7ec8e3', drops: ['k', '1'],     weight: 20 },
      { name: 'Fish',           char: 'ծ', color: '#7ec8e3', drops: [], directPickupItem: '♓', weight: 20 },
      { name: 'Empty Bottle',   char: 'ծ', color: '#aaccee', drops: [], specialDrops: ['B'], weight: 4 }
    ]
  },

  gray: {
    rusalkaChance: 0,
    catches: [
      { name: 'Fish',   char: 'ծ', color: '#7ec8e3', drops: ['b', 'b'],        weight: 30 },
      { name: 'Fish',   char: 'ծ', color: '#7ec8e3', drops: ['e', 'b'],        weight: 25 },
      { name: 'Fish', char: 'ծ', color: '#7ec8e3', drops: ['d', 'e'],        weight: 25 },
      { name: 'Fish', char: 'ծ', color: '#7ec8e3', drops: ['b', 'd'],        weight: 20 },
      { name: 'Fish',        char: 'ծ', color: '#7ec8e3', drops: [], directPickupItem: '♓', weight: 20 },
      { name: 'Empty Bottle', char: 'ծ', color: '#aaccee', drops: [], specialDrops: ['B'], weight: 4 }
    ]
  },

  // Fountain ('F') room — fairies are the headline catch; the empty bottle
  // shows up here too so a patient angler can self-source the bottle without
  // wandering. No fish, no rusalka — this water is something else.
  fountain: {
    rusalkaChance: 0,
    catches: [
      { name: 'Fairy',        char: 'ծ', color: '#ffaaff', drops: [], specialDrops: ['fairy'], weight: 60 },
      { name: 'Empty Bottle', char: 'ծ', color: '#aaccee', drops: [], specialDrops: ['B'],     weight: 25 },
      { name: 'Petal',        char: 'ծ', color: '#ffccee', drops: ['l'],                       weight: 15 }
    ]
  }
};

/**
 * Pick a weighted-random catch from the zone table.
 * Returns a catch entry (copy), or null if zone not found.
 */
export function pickRandomCatch(zone) {
  const table = FISHING_TABLES[zone];
  if (!table) return null;

  const totalWeight = table.catches.reduce((sum, c) => sum + c.weight, 0);
  let roll = Math.random() * totalWeight;

  for (const entry of table.catches) {
    roll -= entry.weight;
    if (roll <= 0) return { ...entry };
  }

  return { ...table.catches[table.catches.length - 1] };
}
