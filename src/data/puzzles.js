/**
 * Per-zone P-room puzzle definitions.
 *
 * Each zone with an entry here gets its own puzzle in its P room
 * (PuzzleSystem owns generation and per-frame logic). P is green-only and
 * offered on the L3/L6/L9 beat (ExitSystem.getLetterWeightsForZone), so in
 * play only the green entry is ever met; a P reached any other way (a cheat
 * warp) falls back to a dormant stone circle.
 *
 * The green Listening Stones and the yellow Three Conductors lived here until
 * the Compass Rose replaced them; both are in git history.
 *
 * Nothing here persists between runs — the lesson lives in the player's head.
 */

export const PUZZLES = {
  // ── Green: "The Compass Rose" ─────────────────────────────────────────────
  // Three square stone rings around the room's center, outer to inner. A
  // ring turns a quarter when the player leans on one of its stones off its
  // middle (the lean's torque picks the way); every settled turn rewrites the
  // room's own exits, so the room teaches what an exit is made of:
  //   letters  each visible exit shows the letter token on its side; solved
  //            when S sits south (the side that never shows a letter)
  //   colors   each visible exit wears the color token on its side; the gray
  //            token turns its letter to R on the north and to N (North, the
  //            red herring) on the east or west, but an S keeps its letter;
  //            solved when gray is north
  //   symbols  each direction's meaning; solved when every symbol faces its
  //            own way
  // All three solved → the Compass. The exits never close.
  green: {
    type: 'compass_rose',
    centerCol: 15,
    centerRow: 15,
    clearRadius: 8,
    // gapIndex: the one perimeter cell left open (clockwise from the ring's
    // top-left corner) so the inner rings and the center stay reachable. It
    // turns with its ring.
    rings: [
      { kind: 'letters', radius: 6, gapIndex: 11 },
      { kind: 'colors',  radius: 4, gapIndex: 23 },
      // Tokens by home side [north, east, south, west]: the pyramid (Ridge,
      // toward Gray), the sea (Ocean), the flower (REST), the book (Canon,
      // the written — a placeholder glyph until West has its rule).
      { kind: 'symbols', radius: 2, gapIndex: 3, tokens: ['^', '~', '*', '='] }
    ],
    stoneColor: '#6a8a6a',
    markerColor: '#e8e8d0',
    pushHoldSeconds: 0.35, // the Push Rock lean (PushRock.PUSH_HOLD_SECONDS)
    turnSeconds: 0.6,
    rewardChar: '⌖'
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
