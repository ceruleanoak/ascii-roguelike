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

/**
 * captureExploreRoomForRest(game)
 *
 * Snapshots the current EXPLORE room — via saveExploreRoomState above, plus
 * the legacy game-level mirror fields (`savedExploreEnemies`/
 * `savedExploreBackgroundObjects`/`savedExploreCaptives`) enterExploreState's
 * restore branch actually reads — before the player leaves EXPLORE for REST.
 * Shared by every EXPLORE→REST exit that should resume the same room
 * verbatim rather than generate a new one on the way back in (the anti
 * room-cycling-cheat this file exists for): the voluntary south exit, and a
 * character-swap death (still others living) that returns to REST via
 * `CharacterSystem.switchToCharacterAtRest`. A full game-over (all
 * characters dead) skips
 * this — `_resetRunToRest` discards the whole run anyway.
 */
export function captureExploreRoomForRest(game) {
  saveExploreRoomState(
    game.inventorySystem,
    game.currentRoom,
    game.items,
    game.ingredients,
    game.placedTraps,
    game.currentRoom.enemies,
    game.currentRoom.backgroundObjects,
    game.captives
  );
  game.savedExploreEnemies = [...game.currentRoom.enemies];
  game.savedExploreBackgroundObjects = [...game.backgroundObjects];
  game.savedExploreCaptives = [...game.captives];
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
