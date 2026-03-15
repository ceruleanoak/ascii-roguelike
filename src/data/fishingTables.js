// Zone-specific fishing catch tables for the Lake ('L') room
// Each catch: { name, char, color, drops[], weight }
// 'char' is always 'ծ' (Armenian Da) — name/color distinguish catches visually
// 'drops' are ingredient chars spawned when the reward object is melee-hit

export const FISHING_TABLES = {
  green: {
    rusalkaChance: 0.04,
    catches: [
      { name: 'Frog',        char: 'ծ', color: '#66ff44', drops: ['g', 'v'],        weight: 30 },
      { name: 'Perch',       char: 'ծ', color: '#aaddff', drops: ['s', 'm'],        weight: 25 },
      { name: 'Crayfish',    char: 'ծ', color: '#ff9966', drops: ['b'],             weight: 20 },
      { name: 'Newt',        char: 'ծ', color: '#44ffaa', drops: ['v'],             weight: 15 },
      { name: 'Giant Turtle',char: 'ծ', color: '#88cc44', drops: ['b', 's', 'm'],   weight: 10 }
    ]
  },

  red: {
    rusalkaChance: 0,
    catches: [
      { name: 'Salamander',  char: 'ծ', color: '#ff6600', drops: ['F', 'a'],        weight: 30 },
      { name: 'Lava Eel',    char: 'ծ', color: '#ff3300', drops: ['s', 'F'],        weight: 25 },
      { name: 'Charfish',    char: 'ծ', color: '#cc4400', drops: ['a', 'm'],        weight: 25 },
      { name: 'Ember Toad',  char: 'ծ', color: '#ff8800', drops: ['F', 'g'],        weight: 20 }
    ]
  },

  cyan: {
    rusalkaChance: 0,
    catches: [
      { name: 'Ice Fish',       char: 'ծ', color: '#aaddff', drops: ['i', 's'],     weight: 30 },
      { name: 'Frost Crab',     char: 'ծ', color: '#cceeff', drops: ['i', 'b'],     weight: 25 },
      { name: 'Glacial Carp',   char: 'ծ', color: '#88ccff', drops: ['s', 'm'],     weight: 25 },
      { name: 'Snow Salamander',char: 'ծ', color: '#eeeeff', drops: ['i', 'v'],     weight: 20 }
    ]
  },

  yellow: {
    rusalkaChance: 0,
    catches: [
      { name: 'Storm Eel',      char: 'ծ', color: '#ffff44', drops: ['M', 's'],     weight: 30 },
      { name: 'Thunder Toad',   char: 'ծ', color: '#ffffaa', drops: ['g', 'M'],     weight: 25 },
      { name: 'Charged Catfish',char: 'ծ', color: '#ffee00', drops: ['M'],          weight: 25 },
      { name: 'Spark Minnow',   char: 'ծ', color: '#ccff44', drops: ['k', 'M'],     weight: 20 }
    ]
  },

  gray: {
    rusalkaChance: 0,
    catches: [
      { name: 'Bone Fish',   char: 'ծ', color: '#dddddd', drops: ['b', 'b'],        weight: 30 },
      { name: 'Soul Carp',   char: 'ծ', color: '#aaaacc', drops: ['e', 'b'],        weight: 25 },
      { name: 'Phantom Eel', char: 'ծ', color: '#8888aa', drops: ['d', 'e'],        weight: 25 },
      { name: 'Dead Weight', char: 'ծ', color: '#666677', drops: ['b', 'd'],        weight: 20 }
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
