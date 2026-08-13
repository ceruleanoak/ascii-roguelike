// Legend of Three — per-zone pyramid content for the Dungeon's Floor 4.
//
// Source of truth for *what* goes in each zone's pyramid is
// claudedocs/legend-of-three.md — this file is the code-facing lookup, keyed
// by zone, of exactly one item char per register (Justice/Truth/Help). Not a
// pool: DungeonFloorGenerator deposits exactly these three chars into the
// pyramid's three slots for a given zone.
//
// Zones with no entry get DungeonFloorGenerator's dormant/inert pyramid
// fallback (no crash, no content) — same shape as puzzles.js's
// DORMANT_PUZZLE for zones without an authored puzzle yet.

export const LEGEND_OF_THREE = {
  green: {
    justice: '★', // Lucky Coin — consumable slot
    truth:   '⌖', // Compass — weapon slot
    help:    '⌬', // Bread — weapon slot
  },
};

/** Returns { justice, truth, help } chars for a zone, or null if unauthored. */
export function getLegendOfThree(zone) {
  return LEGEND_OF_THREE[zone] || null;
}
