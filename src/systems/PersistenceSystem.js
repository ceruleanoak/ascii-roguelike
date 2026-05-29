// PersistenceSystem — permanently disabled.
//
// CLAUDE.md states: "This game does NOT use localStorage for any persistence."
// All methods are no-ops so that any stale call sites fail silently rather than
// reading/writing localStorage and causing cross-session state bugs.
export class PersistenceSystem {
  constructor() {
    this.storageKey = 'ascii-roguelike-save';
  }

  saveRestState(_craftingSystem, _characterData = null) {
    // No-op: persistence is disabled for true roguelike design.
    return false;
  }

  loadRestState() {
    // No-op: always returns null so callers treat every session as fresh.
    return null;
  }

  clearSave() {
    // No-op: nothing to clear.
    return true;
  }

  hasSave() {
    // No-op: always reports no save so load paths are never triggered.
    return false;
  }
}
