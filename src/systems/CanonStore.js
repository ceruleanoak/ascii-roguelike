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

function emptyCanon() {
  return { exited: false, story: '', names: {}, cheats: {}, weapons: {}, recipes: [] };
}

export const CanonStore = {
  /** The stored canon merged over an empty one, so every field exists. */
  load() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return emptyCanon();
      const parsed = JSON.parse(raw);
      return { ...emptyCanon(), ...(parsed && typeof parsed === 'object' ? parsed : {}) };
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
