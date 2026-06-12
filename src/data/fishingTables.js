// Zone-specific fishing catch tables for the Lake ('L') room
// Each catch: { name, char, color, drops[], weight }
// 'char' is always 'ծ' (Armenian Da) — name/color distinguish catches visually
// 'drops' are ingredient chars spawned when the reward object is melee-hit
// 'specialDrops' (optional) are ITEMS keys spawned alongside ingredient drops —
// FishingSystem looks these up via spawnItemFn so non-ingredient items (e.g.
// empty bottle, fairy) can come out of catches. Distinct from 'drops' because
// drops use the INGREDIENTS char namespace and would collide otherwise.

export const FISHING_TABLES = {
  green: {
    rusalkaChance: 0.04,
    catches: [
      { name: 'Frog',        char: 'ծ', color: '#66ff44', drops: ['g', 'v'],        weight: 30 },
      { name: 'Perch',       char: 'ծ', color: '#aaddff', drops: ['s', 'm'],        weight: 25 },
      { name: 'Crayfish',    char: 'ծ', color: '#ff9966', drops: ['b'],             weight: 20 },
      { name: 'Newt',        char: 'ծ', color: '#44ffaa', drops: ['v'],             weight: 15 },
      { name: 'Giant Turtle',char: 'ծ', color: '#88cc44', drops: ['b', 's', 'm'],   weight: 10 },
      { name: 'Empty Bottle',char: 'ծ', color: '#aaccee', drops: [], specialDrops: ['B'], weight: 4 },
      // Blue-zone supply line: rare catches that gate the water-armor recipes.
      // Drop weights are low; the blue-zone Pearl Cache gives a bundle as the
      // bootstrap source.
      { name: 'Oyster Husk', char: 'ծ', color: '#ddeeff', drops: ['p'],             weight: 3 },
      { name: 'Sharkbone',   char: 'ծ', color: '#ccd8e8', drops: ['n'],             weight: 1 },
      { name: 'Ray Tail',    char: 'ծ', color: '#aabbcc', drops: ['Y'],             weight: 1 }
    ]
  },

  // Ocean ('O') rooms — any zone. Saltwater creatures plus a meaningfully
  // fatter blue-zone supply line (p/n/Y) than green lakes: the ocean is the
  // overworld face of Tidefall, and the fisherman's pearl legend points here.
  ocean: {
    rusalkaChance: 0,
    catches: [
      { name: 'Mackerel',     char: 'ծ', color: '#88bbee', drops: ['m', 's'],       weight: 30 },
      { name: 'Blue Crab',    char: 'ծ', color: '#4477cc', drops: ['b', 'g'],       weight: 22 },
      { name: 'Jellyfish',    char: 'ծ', color: '#ccaaff', drops: ['v', 'g'],       weight: 18 },
      { name: 'Oyster',       char: 'ծ', color: '#ddeeff', drops: ['p'],            weight: 12 },
      { name: 'Sharkbone',    char: 'ծ', color: '#ccd8e8', drops: ['n'],            weight: 5 },
      { name: 'Ray Tail',     char: 'ծ', color: '#aabbcc', drops: ['Y'],            weight: 5 },
      { name: 'Empty Bottle', char: 'ծ', color: '#aaccee', drops: [], specialDrops: ['B'], weight: 4 }
    ]
  },

  red: {
    rusalkaChance: 0,
    catches: [
      { name: 'Salamander',  char: 'ծ', color: '#ff6600', drops: ['F', 'a'],        weight: 30 },
      { name: 'Lava Eel',    char: 'ծ', color: '#ff3300', drops: ['s', 'F'],        weight: 25 },
      { name: 'Charfish',    char: 'ծ', color: '#cc4400', drops: ['a', 'm'],        weight: 25 },
      { name: 'Ember Toad',  char: 'ծ', color: '#ff8800', drops: ['F', 'g'],        weight: 20 },
      { name: 'Empty Bottle',char: 'ծ', color: '#aaccee', drops: [], specialDrops: ['B'], weight: 4 }
    ]
  },

  cyan: {
    rusalkaChance: 0,
    catches: [
      { name: 'Ice Fish',       char: 'ծ', color: '#aaddff', drops: ['i', 's'],     weight: 30 },
      { name: 'Frost Crab',     char: 'ծ', color: '#cceeff', drops: ['i', 'b'],     weight: 25 },
      { name: 'Glacial Carp',   char: 'ծ', color: '#88ccff', drops: ['s', 'm'],     weight: 25 },
      { name: 'Snow Salamander',char: 'ծ', color: '#eeeeff', drops: ['i', 'v'],     weight: 20 },
      { name: 'Empty Bottle',   char: 'ծ', color: '#aaccee', drops: [], specialDrops: ['B'], weight: 4 }
    ]
  },

  yellow: {
    rusalkaChance: 0,
    catches: [
      { name: 'Storm Eel',      char: 'ծ', color: '#ffff44', drops: ['1', 's'],     weight: 30 },
      { name: 'Thunder Toad',   char: 'ծ', color: '#ffffaa', drops: ['g', '1'],     weight: 25 },
      { name: 'Charged Catfish',char: 'ծ', color: '#ffee00', drops: ['1'],          weight: 25 },
      { name: 'Spark Minnow',   char: 'ծ', color: '#ccff44', drops: ['k', '1'],     weight: 20 },
      { name: 'Empty Bottle',   char: 'ծ', color: '#aaccee', drops: [], specialDrops: ['B'], weight: 4 }
    ]
  },

  gray: {
    rusalkaChance: 0,
    catches: [
      { name: 'Bone Fish',   char: 'ծ', color: '#dddddd', drops: ['b', 'b'],        weight: 30 },
      { name: 'Soul Carp',   char: 'ծ', color: '#aaaacc', drops: ['e', 'b'],        weight: 25 },
      { name: 'Phantom Eel', char: 'ծ', color: '#8888aa', drops: ['d', 'e'],        weight: 25 },
      { name: 'Dead Weight', char: 'ծ', color: '#666677', drops: ['b', 'd'],        weight: 20 },
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
