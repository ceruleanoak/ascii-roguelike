/**
 * RoomStatePersistence.js
 *
 * Free functions backing InventorySystem's EXPLORE<->REST room/ingredient
 * snapshot persistence (the anti room-cycling-cheat: a saved room is
 * restored verbatim rather than regenerated). They operate directly on an
 * InventorySystem instance's own fields (`inv`) — there is no other owner
 * of this state, so it stays a plain field on InventorySystem rather than
 * moving to `game`. Extracted purely to keep InventorySystem.js under its
 * architecture budget; InventorySystem.js's saveExploreRoom/
 * getSavedExploreRoomData/clearSavedExploreRoom/saveRestIngredients/
 * getSavedRestIngredients/clearSavedRestIngredients methods are thin
 * wrappers around these, so every external call site is unaffected.
 */

export function saveExploreRoomState(inv, currentRoom, items, ingredients, placedTraps, enemies = [], backgroundObjects = [], captives = []) {
  inv.savedExploreRoom = currentRoom;
  inv.savedExploreItems = [...items];
  inv.savedExploreIngredients = [...ingredients];
  inv.savedExplorePlacedTraps = [...placedTraps];
  inv.savedExploreEnemies = [...enemies];
  inv.savedExploreBackgroundObjects = [...backgroundObjects];
  inv.savedExploreCaptives = [...captives];
}

export function getSavedExploreRoomState(inv) {
  if (!inv.savedExploreRoom) return null;

  return {
    room: inv.savedExploreRoom,
    items: [...inv.savedExploreItems],
    ingredients: [...inv.savedExploreIngredients],
    placedTraps: [...inv.savedExplorePlacedTraps],
    enemies: [...inv.savedExploreEnemies],
    backgroundObjects: [...inv.savedExploreBackgroundObjects],
    captives: [...inv.savedExploreCaptives]
  };
}

export function clearSavedExploreRoomState(inv) {
  inv.savedExploreRoom = null;
  inv.savedExploreItems = [];
  inv.savedExploreIngredients = [];
  inv.savedExplorePlacedTraps = [];
  inv.savedExploreEnemies = [];
  inv.savedExploreBackgroundObjects = [];
  inv.savedExploreCaptives = [];
}

export function saveRestIngredientsState(inv, ingredients) {
  inv.savedRestIngredients = [...ingredients];
}

export function getSavedRestIngredientsState(inv) {
  return [...inv.savedRestIngredients];
}

export function clearSavedRestIngredientsState(inv) {
  inv.savedRestIngredients = [];
}
