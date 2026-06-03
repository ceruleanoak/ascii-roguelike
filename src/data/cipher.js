/**
 * Greek-substitution cipher used by the Spectacles item.
 *
 * The cipher is a one-to-one map between Latin letters (A–Z subset) and Greek
 * glyphs. It surfaces in three places:
 *
 *   1. Maze object covers — each cover is the cipher form of the ingredient
 *      letter beneath it. Breaking the cover reveals the ingredient and
 *      teaches one cipher pairing.
 *   2. Spectacles equipment — when ⊙ is equipped in the armor slot, the
 *      render hooks below toggle the cipher OFF wherever it's applied. Greek
 *      glyphs render as their Latin equivalent; ciphered Latin in UI labels
 *      renders Latin-but-already-Latin (no-op for plaintext surfaces, decode
 *      for Greek surfaces).
 *   3. Dungeon ciphered recipe hints — Greek-encoded recipe words like the
 *      DRAW sequence. (Wired in a later step.)
 *
 * Catch-all glyph `◊` represents a non-letter ingredient (gem chars, digits,
 * punctuation) — it has no Latin decoding and stays unchanged through the
 * spectacles transform.
 *
 * Avoided Greek glyphs (already used elsewhere; cognitive overlap too high):
 *   Ψ   — Thick Staff           (item, frequently equipped)
 *   Ω ω — Goo Dragon, Goo Head  (enemies + Floating Boots)
 *   λ   — Chicken Leg           (background object)
 *
 * Accepted collisions (rare items in distinct contexts):
 *   Θ — TurtleHead enemy (vs. cipher A in UI labels)
 *   ψ — Trident item     (vs. cipher N in UI labels)
 */

// Latin → Greek. Phonetic transliteration where possible (Δ-D, Σ-S, Χ-X, etc.);
// arbitrary-but-distinct otherwise. Visually-confusable glyphs (η~n, ν~v, ρ~p,
// τ~t, α~a, ε~e, ο~o) are deliberately avoided so the cipher always reads as
// "not Latin" at a glance.
export const CIPHER = {
  A: 'Θ',  B: 'β',  C: 'ζ',  D: 'Δ',
  E: 'θ',  F: 'Φ',  G: 'Γ',  H: 'χ',
  I: 'ι',  K: 'κ',  L: 'Λ',  M: 'μ',
  N: 'ψ',  O: 'σ',  P: 'Π',  R: 'ξ',
  S: 'Σ',  T: 'π',  U: 'γ',  V: 'δ',
  W: 'φ',  X: 'Ξ',
};

// Inverse table built once. Greek → Latin.
export const REVERSE_CIPHER = Object.fromEntries(
  Object.entries(CIPHER).map(([latin, greek]) => [greek, latin])
);

// Catch-all for non-letter ingredients (gems, digits, punctuation) — has no
// Latin decoding, never transformed by spectacles.
export const NON_LETTER_COVER = '◊';

// Unifont renders ~30% smaller than VentureArcade at the same nominal px size
// because VA is a pixel font with full-cell caps while Unifont uses a larger
// em box. Ciphered Greek text is always Unifont (VA lacks Greek coverage),
// so we scale up to keep visual parity with surrounding VA UI.
export const CIPHER_FONT_SCALE = 1.4;

/**
 * Build a font string sized appropriately for ciphered vs. plain text. When
 * `active` is true, returns Unifont scaled up by CIPHER_FONT_SCALE; otherwise
 * returns the original family at base size.
 */
export function cipherFont(basePx, active, family = 'VentureArcade') {
  if (active) {
    return `${Math.round(basePx * CIPHER_FONT_SCALE)}px 'Unifont', monospace`;
  }
  return `${basePx}px '${family}', 'Unifont', monospace`;
}

/**
 * Encode a single Latin letter to its Greek cipher form. Returns the input
 * unchanged if no mapping exists (including non-letters and lowercase Latin —
 * cipher operates on uppercase only by design).
 */
export function applyCipher(ch) {
  return CIPHER[ch] ?? ch;
}

/**
 * Decode a single Greek glyph to its Latin equivalent. Returns the input
 * unchanged if not a known cipher glyph.
 */
export function reverseCipher(ch) {
  return REVERSE_CIPHER[ch] ?? ch;
}

/**
 * Bidirectional transform used at every spectacles-aware render call site.
 *
 *   active=false → return ch unchanged.
 *   active=true  → if ch is a Latin cipher key, encode to Greek;
 *                  if ch is a Greek cipher value, decode to Latin;
 *                  otherwise return ch unchanged.
 *
 * The "encode Latin to Greek" direction is currently unused (every Latin
 * surface stays Latin without spectacles), but is included so the helper can
 * be reused symmetrically when ciphered surfaces get a plaintext fallback.
 */
export function spectaclesTransform(ch, active) {
  if (!active) return ch;
  if (CIPHER[ch]) return CIPHER[ch];
  if (REVERSE_CIPHER[ch]) return REVERSE_CIPHER[ch];
  return ch;
}

/**
 * Apply the bidirectional transform across every character of a string.
 * Used by multi-character labels (REST, SPACE ENTER) where wrapping per-glyph
 * at the call site would be noisy.
 */
export function spectaclesTransformString(str, active) {
  if (!active) return str;
  let out = '';
  for (const ch of str) out += spectaclesTransform(ch, true);
  return out;
}

/**
 * Spectacles state lives on the equipped-armor slot — wearing the ⊙ item is
 * the only way to activate. Unequip (swap to other armor or empty) deactivates.
 */
export function isSpectaclesActive(game) {
  return game?.inventorySystem?.equippedArmor?.char === '⊙';
}

/**
 * Maze cover for an ingredient char. Letters get their Greek cipher form;
 * everything else (gems, digits, '?') gets the catch-all rune.
 */
export function coverFor(ingredientChar) {
  return CIPHER[ingredientChar?.toUpperCase?.()] ?? NON_LETTER_COVER;
}
