/**
 * CanonStore — the one module allowed to touch browser storage (Path to
 * Canon, claudedocs/zone-cosmology.md).
 *
 * Holds Canon Edits only: what the player authored in the CLI, plus the
 * flag recording that they have left the game through EXIT. Runs never
 * persist — inventory, depth and unlocks earned in play must never be
 * written here. `npm run check:arch` fails on localStorage/sessionStorage/
 * indexedDB anywhere else in src/.
 *
 * Every read and write is wrapped: storage can be missing (private window),
 * full, or throw outright when the browser blocks site data. A missing or
 * corrupt value reads as an empty canon.
 */

const STORAGE_KEY = 'pure-rogue-canon-v1';
const DEFAULT_STORY = 'Once upon a time...';

function emptyCanon() {
  // weapons: { glyph: fields } — `authored: true` (+ `recipe: {left, right}`)
  // marks a weapon the player created; otherwise the fields override an
  // existing weapon's data. Applied at boot by CanonOverlay.
  // story: Story.md, one line per newline. It is never blank to begin with;
  // its first line is the player's to keep, rewrite, or delete.
  return { exited: false, story: DEFAULT_STORY, names: {}, cheats: {}, weapons: {} };
}

export const CanonStore = {
  /** The stored canon merged over an empty one, so every field exists. */
  load() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return emptyCanon();
      const parsed = JSON.parse(raw);
      const canon = emptyCanon();
      if (!parsed || typeof parsed !== 'object') return canon;
      // Keep each stored field only when it has the expected shape.
      for (const key of Object.keys(canon)) {
        const value = parsed[key];
        const expected = canon[key];
        if (typeof value === typeof expected && Array.isArray(value) === Array.isArray(expected) && value !== null) {
          canon[key] = value;
        }
      }
      return canon;
    } catch {
      return emptyCanon();
    }
  },

  /** Write the whole canon. Returns false when storage refused it. */
  save(canon) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(canon));
      return true;
    } catch {
      return false;
    }
  },

  /** Record that the player has left the game through EXIT. */
  setExited() {
    const canon = this.load();
    canon.exited = true;
    return this.save(canon);
  },

  hasExited() {
    return this.load().exited === true;
  },

  /** FORGET — erase every Canon Edit and the exited flag. */
  forget() {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
      return true;
    } catch {
      return false;
    }
  },
};
