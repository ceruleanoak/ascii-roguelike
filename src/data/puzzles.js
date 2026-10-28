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
  // Two stone circles and a diamond around the room's center, outer to inner.
  // A ring turns a quarter when the player leans on one of its stones off its
  // cardinal line (the lean's torque picks the way), and the player walks the
  // turn with it. Every settled turn rewrites the room's own exits — the
  // letter and color rings are plain stone, so the exits are the only place
  // their turning shows:
  //   letters  each visible exit takes the letter the ring holds on its side;
  //            solved when S sits south (the side that never shows a letter)
  //   colors   each visible exit takes the color the ring holds on its side;
  //            the gray one turns its letter to R on the north and to N
  //            (North, the red herring) on the east or west, but an S keeps
  //            its letter; solved when gray is north
  //   symbols  the diamond, whose corners carry each direction's meaning;
  //            solved when every symbol faces its own way
  // All three solved → the Compass. The exits never close.
  green: {
    type: 'compass_rose',
    centerCol: 15,
    centerRow: 15,
    clearRadius: 9,
    // shape: 'circle' is every cell whose distance from the center rounds to
    // radius; 'diamond' is every cell `radius` steps away. gap: the one cell
    // (offset from the center) left open so the inner rings and the center
    // stay reachable — off every cardinal, where the markers sit. It turns
    // with its ring. turnSeconds grows with the ring, so the player walks
    // every quarter turn at about the same pace.
    rings: [
      { kind: 'letters', shape: 'circle',  radius: 8, gap: { dx: 2, dy: -8 }, turnSeconds: 1.2 },
      { kind: 'colors',  shape: 'circle',  radius: 5, gap: { dx: -5, dy: -2 }, turnSeconds: 0.9 },
      // Tokens by home corner [north, east, south, west]: the pyramid ▲
      // (Ridge, toward Gray), the sea ~ (Ocean), the flower ❀ (REST), the open
      // book ◫ (Canon, the written — its meaning waits on West's rule).
      { kind: 'symbols', shape: 'diamond', radius: 2, gap: { dx: 1, dy: 1 }, turnSeconds: 0.6, tokens: ['▲', '~', '❀', '◫'] }
    ],
    stoneColor: '#6a8a6a',
    markerColor: '#e8e8d0',
    pushHoldSeconds: 0.35, // the Push Rock lean (PushRock.PUSH_HOLD_SECONDS)
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
