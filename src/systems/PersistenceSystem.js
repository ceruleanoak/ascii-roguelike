export class PersistenceSystem {
  constructor() {
    this.storageKey = 'ascii-roguelike-save';
  }

  saveRestState(craftingSystem, characterData = null) {
    const state = {
      crafting: craftingSystem.getState(),
      // Character system (persists across deaths)
      characters: characterData ? {
        unlocked: characterData.unlocked,
        active: characterData.active,
        queue: characterData.queue
      } : null,
      // Depth is NOT saved - always starts at 0 on page refresh
      // Do not persist itemChest, armor, or consumables for true roguelike
      timestamp: Date.now()
    };

    try {
      localStorage.setItem(this.storageKey, JSON.stringify(state));
      return true;
    } catch (e) {
      console.error('Failed to save state:', e);
      return false;
    }
  }

  loadRestState() {
    try {
      const data = localStorage.getItem(this.storageKey);
      if (!data) return null;

      return JSON.parse(data);
    } catch (e) {
      console.error('Failed to load state:', e);
      return null;
    }
  }

  clearSave() {
    try {
      localStorage.removeItem(this.storageKey);
      return true;
    } catch (e) {
      console.error('Failed to clear save:', e);
      return false;
    }
  }

  hasSave() {
    return localStorage.getItem(this.storageKey) !== null;
  }
}
