/**
 * Greek-substitution cipher used by the Spectacles item.
 *
 * Greek is not flavor — it represents the world's canonical underpinnings,
 * so the mapping must be the real English↔Greek equivalence in BOTH cases
 * for the translation to hold. One-to-one and case-paired: uppercase maps
 * to uppercase Greek, lowercase to lowercase ('R' → 'Ρ', 'r' → 'ρ').
 * It surfaces in three places:
 *
 *   1. Maze object covers — each cover is the cipher form of the ingredient
 *      letter beneath it. Breaking the cover reveals the ingredient and
 *      teaches one cipher pairing.
 *   2. Spectacles equipment — when ⊙ is equipped in the armor slot, every
 *      spectacles-aware render call site flips perception both ways: Greek
 *      glyphs decode to their Latin equivalent, Latin text encodes to Greek.
 *   3. Dungeon ciphered recipe hints — Greek-encoded recipe words like the
 *      DRAW sequence. (Wired in a later step.)
 *
 * The mapping is the standard English↔Greek equivalence (Beta Code, the
 * scheme English speakers use to type Greek): A-alpha, B-beta, C-xi,
 * D-delta, E-epsilon, F-phi, G-gamma, H-eta, I-iota, K-kappa, L-lambda,
 * M-mu, N-nu, O-omicron, P-pi, Q-theta, R-rho, S-sigma, T-tau, U-upsilon,
 * W-omega, X-chi, Y-psi, Z-zeta. The equivalences are shape- and
 * name-intuitive: ω↔w, χ↔x, ψ↔y, θ↔q. Only J and V have no standard
 * Greek letter: J takes yot (Ϳ/ϳ, the Greek letter for /j/) and V takes
 * digamma (Ϝ/ϝ, Beta Code's own V).
 *
 * Greek codepoints are reserved EXCLUSIVELY for this cipher. Game content
 * that previously used Greek glyphs was evacuated in Wave 1 of the glyph
 * canon migration (Ⲯ/ⲯ staffs, Ⲱ/ⲱ goo bosses, Ⲑ TurtleHead, ⲗ Chicken
 * Leg, ↯/Ꞩ lightning weapons, ⚲ Stingray Mantle, ѡ/𐤑 consumables, ∧ flow
 * tile) — see claudedocs/glyph-canon-migration.md. Do not introduce new
 * Greek-block chars outside this file.
 *
 * Trade-off accepted with the real alphabet: several uppercase Greek
 * glyphs are visually identical or near-identical to Latin (Α Β Ε Η Ι Κ
 * Μ Ν Ο Ρ Τ Υ Χ Ζ), so ciphered uppercase text reads as "wrong Latin"
 * rather than alien — exactly how real Greek looks. Lowercase forms are
 * the iconic, distinct ones.
 */

// English uppercase → Greek uppercase (Beta Code). Lowercase pairs are
// derived below via toLowerCase(), which maps every glyph here to its
// proper lowercase form (Σ→σ, Ϳ→ϳ, Ϝ→ϝ).
const UPPER_CIPHER = {
  A: 'Α',  B: 'Β',  C: 'Ξ',  D: 'Δ',
  E: 'Ε',  F: 'Φ',  G: 'Γ',  H: 'Η',
  I: 'Ι',  J: 'Ϳ',  K: 'Κ',  L: 'Λ',
  M: 'Μ',  N: 'Ν',  O: 'Ο',  P: 'Π',
  Q: 'Θ',  R: 'Ρ',  S: 'Σ',  T: 'Τ',
  U: 'Υ',  V: 'Ϝ',  W: 'Ω',  X: 'Χ',
  Y: 'Ψ',  Z: 'Ζ',
};

// Full case-paired table: 26 uppercase + 26 lowercase entries.
export const CIPHER = {};
for (const [latin, greek] of Object.entries(UPPER_CIPHER)) {
  CIPHER[latin] = greek;
  CIPHER[latin.toLowerCase()] = greek.toLowerCase();
}

// Inverse table built once. Greek → Latin, case preserved.
export const REVERSE_CIPHER = Object.fromEntries(
  Object.entries(CIPHER).map(([latin, greek]) => [greek, latin])
);

/**
 * Canon lineage layer: Greek letter → Phoenician ancestor
 * (en.wikipedia.org/wiki/Phoenician_alphabet, Unicode block U+10900–1091F).
 *
 * This is ancestry, not a cipher — it is deliberately many-to-one and has
 * no reverse table. Phoenician is caseless, so both Greek cases share one
 * ancestor (lowercase keys added below). Three lineages are shared:
 *   𐤅 waw  → Ϝ digamma AND Υ upsilon
 *   𐤏 ayin → Ο omicron AND Ω omega
 *   𐤉 yodh → Ι iota    AND Ϳ yot (yodh is the /j/ consonant)
 * Greek innovations Φ, Χ, Ψ have NO Phoenician ancestor (English F, X, Y
 * are therefore canon-rootless). 𐤑 tsade and 𐤒 qoph fathered no letter in
 * this cipher — they are free canon glyphs for future content.
 *
 * NOTE: Phoenician codepoints are astral-plane (SMP) — two UTF-16 units.
 * Iterate with `for...of`, never index with str[i]. Base Unifont does not
 * cover the block; rendering them in-game requires a font with Phoenician
 * coverage first (see claudedocs/glyph-canon-migration.md).
 */
const GREEK_TO_PHOENICIAN_UPPER = {
  'Α': '𐤀', // aleph  U+10900
  'Β': '𐤁', // beth   U+10901
  'Γ': '𐤂', // gimel  U+10902
  'Δ': '𐤃', // daleth U+10903
  'Ε': '𐤄', // he     U+10904
  'Ζ': '𐤆', // zayin  U+10906
  'Η': '𐤇', // heth   U+10907
  'Θ': '𐤈', // teth   U+10908
  'Ι': '𐤉', // yodh   U+10909
  'Ϳ': '𐤉', // yodh   U+10909 (shared with iota)
  'Κ': '𐤊', // kaph   U+1090A
  'Λ': '𐤋', // lamedh U+1090B
  'Μ': '𐤌', // mem    U+1090C
  'Ν': '𐤍', // nun    U+1090D
  'Ξ': '𐤎', // samekh U+1090E
  'Ο': '𐤏', // ayin   U+1090F
  'Ω': '𐤏', // ayin   U+1090F (shared with omicron)
  'Π': '𐤐', // pe     U+10910
  'Ρ': '𐤓', // resh   U+10913
  'Σ': '𐤔', // shin   U+10914
  'Τ': '𐤕', // taw    U+10915
  'Υ': '𐤅', // waw    U+10905
  'Ϝ': '𐤅', // waw    U+10905 (shared with upsilon)
  // Φ Χ Ψ — Greek innovations, no ancestor.
};

export const GREEK_TO_PHOENICIAN = {};
for (const [greek, phoenician] of Object.entries(GREEK_TO_PHOENICIAN_UPPER)) {
  GREEK_TO_PHOENICIAN[greek] = phoenician;
  GREEK_TO_PHOENICIAN[greek.toLowerCase()] = phoenician;
}

/**
 * Full canon chain for an English letter: English → Greek (cipher) →
 * Phoenician (ancestor). Returns undefined for canon-rootless letters
 * (F, X, Y → Greek innovations) and non-letters.
 */
export function phoenicianFor(englishCh) {
  return GREEK_TO_PHOENICIAN[CIPHER[englishCh]];
}

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
 * Encode a single Latin letter (either case) to its Greek cipher form.
 * Returns the input unchanged if no mapping exists (non-letters, digits).
 */
export function applyCipher(ch) {
  return CIPHER[ch] ?? ch;
}

/**
 * Decode a single Greek glyph to its Latin equivalent, case preserved.
 * Returns the input unchanged if not a known cipher glyph.
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
 * Both directions are live: wearing the spectacles relabels Latin surfaces
 * to Greek and decodes Greek surfaces (maze covers, ciphered hints) to Latin.
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
 * Maze cover for an ingredient char. Letters get their case-matched Greek
 * cipher form; everything else (gems, digits, '?') gets the catch-all rune.
 */
export function coverFor(ingredientChar) {
  return CIPHER[ingredientChar] ?? NON_LETTER_COVER;
}
