import { GAME_STATES, PHYSICS } from '../game/GameConfig.js';
import { canReachLoot } from './PlaneSystem.js';
import { INGREDIENT_STACK_CAP } from './ingredientPile.js';
import { settlePickup } from './pickupSettlement.js';

// How fast loot flies to the player while TAKEALL pulls it (px/s). Well past
// walking speed, so even a far corner arrives in about a second.
const PULL_SPEED = 420;

// Item types TAKEALL takes. A Cursed scroll is read where it lies, not taken.
const TAKEN_TYPES = new Set(['ARMOR', 'CONSUMABLE', 'WEAPON', 'TRAP', 'KEY', 'BLESSING', 'NEUTRAL']);

/**
 * TAKEALL Spell — every ingredient and item lying on the player's layer flies
 * to the player and is taken on arrival. Only once the room is safe: no
 * counted enemy and the exits open (REST always is).
 *
 * Ingredients are collected as an ordinary attraction pickup
 * (LootSystem.collectIngredient). Items go through the ground pickup
 * (InventorySystem.tryPickupItem) on a one-item scratch array, as a purchase
 * does; where that pickup would ask for a slot choice, TAKEALL stows instead
 * of opening the menu: armor and consumables into the carried inventory, a
 * weapon or trap into the Item Chest (deferred in the field, as a displaced
 * weapon is).
 *
 * Loot the player can't reach stays put: another plane or layer, vault coins
 * (`noGravitate`), and ingredients whose pile is already full.
 */
export class TakeAllSystem {
  constructor(game) {
    this.game = game;
    this.active = false;
    // Loot whose take was refused on arrival (a full pile, a pickup still
    // cooling down); it stops being pulled so the spell can end.
    this.refused = new Set();
  }

  /** Spell response: null when the pull starts (silent cast), else the THREE's refusal. */
  cast() {
    const game = this.game;
    const state = game.stateMachine?.getCurrentState();
    if (state !== GAME_STATES.REST && state !== GAME_STATES.EXPLORE && state !== GAME_STATES.NEUTRAL) return '...NOTHING.';
    const room = game.currentRoom;
    if (!game.player || !room) return '...NOTHING.';
    if (room.exitsLocked || game._countedEnemies(room.enemies ?? []).length > 0) return 'NOT YET.';
    this.refused.clear();
    if (this._pulled().length === 0) return '...NOTHING.';
    this.active = true;
    return null;
  }

  /** Pull this frame's loot toward the player and take what has arrived. */
  update(deltaTime) {
    if (!this.active) return;
    const pulled = this._pulled();
    if (pulled.length === 0) { this.reset(); return; }

    const player = this.game.player;
    const px = player.position.x, py = player.position.y;
    for (const loot of pulled) {
      const dx = px - loot.position.x, dy = py - loot.position.y;
      const dist = Math.hypot(dx, dy);
      loot.velocity.vx = 0;
      loot.velocity.vy = 0;
      loot.acceleration = { ax: 0, ay: 0 };
      if (dist < PHYSICS.PICKUP_RADIUS) {
        this._take(loot);
        continue;
      }
      const step = Math.min(dist, PULL_SPEED * deltaTime);
      loot.position.x += (dx / dist) * step;
      loot.position.y += (dy / dist) * step;
    }
  }

  /** End the pull (Reset Registry, room scope). */
  reset() {
    this.active = false;
    this.refused.clear();
  }

  // Everything TAKEALL can pull right now.
  _pulled() {
    const game = this.game;
    const player = game.player;
    const reachable = loot => !loot.consumed && !this.refused.has(loot) && !loot.noGravitate && canReachLoot(game, player, loot);
    const ingredients = game.ingredients.filter(ing => reachable(ing)
      && (ing.char === 'c' || game.countIngredient(ing.char) < INGREDIENT_STACK_CAP));
    const items = game.items.filter(item => reachable(item) && TAKEN_TYPES.has(item.data?.type));
    return [...ingredients, ...items];
  }

  _take(loot) {
    const game = this.game;
    if (game.ingredients.includes(loot)) {
      if (!game.lootSystem.collectIngredient(loot)) this.refused.add(loot);
      return;
    }
    loot.pickupReadyAt = 0; // a weapon the player just swapped out comes back too
    const result = game.inventorySystem.tryPickupItem(
      [loot], game.placedTraps, game.player, game.physicsSystem,
      true, 0, game.selectedWeaponSlotIndex, game.renderer
    );
    const settled = result.needsSlotChoice ? this._stow(loot) : result;
    if (!settled.success) { this.refused.add(loot); return; }
    this._removeFromGround(loot);
    settlePickup(game, settled);
  }

  // Where the pickup would have asked for a slot: into the bag, never the menu.
  _stow(item) {
    const game = this.game;
    const inv = game.inventorySystem;
    const type = item.data.type;
    if (type === 'ARMOR') inv.armorInventory.push(item);
    else if (type === 'CONSUMABLE') inv.consumableInventory.push(item);
    else if (game.stateMachine.getCurrentState() === GAME_STATES.REST) inv.addToChest(item);
    else inv.deferToChest(item);
    item.consumed = true;
    return { success: true, droppedItem: null, message: item.data.name, pickedUpType: type, pickedUpChar: item.char };
  }

  // The scratch-array pickup splices only the scratch array; the world array
  // and the physics registry still hold the item.
  _removeFromGround(item) {
    const game = this.game;
    game.physicsSystem.removeEntity(item);
    const idx = game.items.indexOf(item);
    if (idx !== -1) game.items.splice(idx, 1);
  }
}
