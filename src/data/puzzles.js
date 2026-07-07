/**
 * Per-zone P-room puzzle definitions.
 *
 * Each zone with an entry here gets a unique Level-2 puzzle in its P room
 * (PuzzleSystem owns generation and per-frame logic). Solving the puzzle
 * raises a PuzzleSpirit whose dialogue is a lore hint (see each `spirit.lines`).
 *
 * Zones without an entry fall back to a dormant stone circle.
 *
 * Nothing here persists between runs — the hint lives in the player's head.
 */

export const PUZZLES = {
  // ── Green: "The Listening Stones" ─────────────────────────────────────────
  // Five standing stones ring a mossy boulder. A firefly mote demonstrates a
  // 4-stone sequence on loop; striking the stones in that order solves it.
  // Wrong stone = fizzle + reset.
  green: {
    type: 'listening_stones',
    centerCol: 15,
    centerRow: 15,
    ringRadius: 4.5,
    stoneChar: '0',
    stoneColor: '#66cc66',
    stoneLitColor: '#aaffaa',
    sequenceLength: 4,
    demoStepSeconds: 1.1,   // firefly travel time between demonstrated stones
    demoPauseSeconds: 2.2,  // rest at the boulder between demonstration loops
    spirit: {
      char: 'Y',
      color: '#66ff66',
      lines: [
        'THE RUSALKA KEEPS A SWORD OF LETTERS.',
        'IT SLEEPS IN STONE PAST THE BLACK WATER.',
        'THE DEEP STAIRS LEND THE CROSSING.'
      ]
    }
  },

  // ── Yellow: "The Three Conductors" ────────────────────────────────────────
  // Three disconnected pools, each beside a metal rod. Ambient lightning
  // periodically strikes one pool — its rod latches lit for latchSeconds,
  // demonstrating the mechanic. Solve: all three rods lit at once (shock
  // weapon, Stingray Mantle swim, or kiting electric enemies through pools).
  yellow: {
    type: 'three_conductors',
    rodChar: 'I',
    rodColor: '#ccccdd',
    rodLitColor: '#ffffaa',
    latchSeconds: 5,
    strikeMinInterval: 8,
    strikeMaxInterval: 14,
    conductors: [
      { rod: { col: 10, row: 9 },  pool: [{ col: 10, row: 10 }, { col: 11, row: 10 }, { col: 10, row: 11 }, { col: 11, row: 11 }] },
      { rod: { col: 20, row: 9 },  pool: [{ col: 19, row: 10 }, { col: 20, row: 10 }, { col: 19, row: 11 }, { col: 20, row: 11 }] },
      { rod: { col: 15, row: 21 }, pool: [{ col: 14, row: 19 }, { col: 15, row: 19 }, { col: 14, row: 20 }, { col: 15, row: 20 }] }
    ],
    spirit: {
      char: '*',
      color: '#ffffcc',
      lines: [
        'THE STORM LEFT ITS EYES ON THE MARINER PATH.',
        'BEYOND THE BLACK WATER THEY WAIT.',
        'WOOD FROM THE DEEP STAIRS WILL CARRY YOU.'
      ]
    }
  }
};

// Inert gray stone ring for zones with no puzzle defined — flavorful,
// forward-compatible placeholder layout.
export const DORMANT_PUZZLE = {
  centerCol: 15,
  centerRow: 15,
  ringRadius: 4.5,
  stoneChar: '0',
  stoneColor: '#777777'
};
