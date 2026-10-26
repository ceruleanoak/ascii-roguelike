import { GAME_STATES } from '../game/GameConfig.js';

// How far chance can lift an item past a better one: a whole tier (or point
// of defense) and a half. Tier 3 usually wins over tier 1; tier 2 and 3 trade
// places often, which is what makes a repeated EQUIP worth casting.
const JITTER = 1.5;

/**
 * EQUIP Spell — in REST, the THREE dresses the player from everything they
 * own: three diverse weapons in the quick slots (the higher tiers preferred),
 * armor (the higher defense preferred) and consumables in every open slot.
 * Chance is part of every pick, so casting EQUIP again tries another loadout.
 *
 * Diverse means a different weapon type per slot (melee, bow, gun, wand)
 * while there are types to go round, then a different weapon subtype, then
 * at least a different weapon. One quick slot always holds a utility (a trap
 * or bomb) when the player owns one: a trap already slotted stays, else one
 * comes out of the chest. Everything not picked goes where the REST menus
 * put it: weapons into the Item Chest, armor and consumables into the
 * carried bag. Any other trap in a quick slot gives its slot up to a weapon
 * only when there is a weapon to fill it. Destroyed quick slots and
 * consumable slots the magic meter holds are left alone.
 *
 * Every move goes through InventorySystem's own equip calls, as the REST
 * chest, armor and consumable menus do (MenuSystem.handleMenuSelection).
 */
export class EquipSpellSystem {
  constructor(game) {
    this.game = game;
  }

  /** Spell response: null when the loadout was dressed (silent cast), else the THREE's refusal. */
  cast() {
    if (!this.canEquip()) return '...NOTHING.';
    const game = this.game;
    const inv = game.inventorySystem;
    this._equipWeapons();
    this._equipArmor();
    this._equipConsumables();
    inv.applyEquipmentEffectsToPlayer(game.player);
    game.player.equippedConsumables = [...inv.equippedConsumables];
    game.saveGameState();
    game.renderer.markBackgroundDirty();
    game.updateUI();
    return null;
  }

  /** Is there anything stored that EQUIP could put on? (LOOKHERE's YOU CAN EQUIP) */
  canEquip() {
    const game = this.game;
    if (!game.player || game.stateMachine?.getCurrentState() !== GAME_STATES.REST) return false;
    const inv = game.inventorySystem;
    return inv.itemChest.some(item => isWeapon(item) || isTrap(item))
      || inv.armorInventory.length > 0
      || (inv.consumableInventory.length > 0 && this._openConsumableSlots().length > 0);
  }

  _equipWeapons() {
    const game = this.game;
    const inv = game.inventorySystem;
    const player = game.player;
    const open = player.quickSlots.map((_, i) => i).filter(i => !player.destroyedSlots?.[i]);

    // Every weapon in hand goes back to the chest, so the pick is from all of them.
    for (const i of open) {
      if (isWeapon(player.quickSlots[i])) {
        inv.addToChest(player.quickSlots[i]);
        player.quickSlots[i] = null;
      }
    }

    // One slot always holds a utility (a trap or bomb) when the player owns
    // one: a trap already in hand keeps its slot (its charges stay as they
    // are), else one comes out of the chest, the higher tiers preferred.
    const trapSlots = open.filter(i => isTrap(player.quickSlots[i]));
    const kept = trapSlots[0];
    const chestTrap = kept === undefined
      ? byScore(inv.itemChest.filter(isTrap), trap => trap.data.tier ?? 0)[0]
      : undefined;
    const utility = kept !== undefined || chestTrap !== undefined;

    const picks = diverseWeapons(inv.itemChest.filter(isWeapon), open.length - (utility ? 1 : 0));
    // Empty slots fill first; any other trap gives its slot up only when a
    // pick is left over.
    const slots = [...open.filter(i => !player.quickSlots[i]),
      ...trapSlots.filter(i => i !== kept)];
    picks.forEach((pick, n) => {
      const i = slots[n];
      const item = inv.retrieveFromChest(pick);
      if (!item) return;
      if (player.quickSlots[i]) inv.addToChest(player.quickSlots[i]);
      player.quickSlots[i] = item;
    });
    if (chestTrap) {
      const i = open.find(j => !player.quickSlots[j]);
      const item = i === undefined ? null : inv.retrieveFromChest(chestTrap);
      if (item) player.quickSlots[i] = item;
    }
    if (!player.quickSlots[player.activeSlotIndex]) {
      const first = player.quickSlots.findIndex(Boolean);
      if (first !== -1) player.activeSlotIndex = first;
    }
  }

  _equipArmor() {
    const inv = this.game.inventorySystem;
    const pool = [inv.equippedArmor, ...inv.armorInventory].filter(Boolean);
    if (pool.length === 0) return;
    const best = byScore(pool, armor => armor.data?.defense ?? 0)[0];
    if (best !== inv.equippedArmor) inv.equipArmor(best);
  }

  _equipConsumables() {
    const inv = this.game.inventorySystem;
    const slots = this._openConsumableSlots();
    // Take everything off the open slots, then deal from the whole bag.
    for (const i of slots) {
      if (inv.equippedConsumables[i]) {
        inv.consumableInventory.push(inv.equippedConsumables[i]);
        inv.equippedConsumables[i] = null;
      }
    }
    const picks = [];
    for (const item of byScore(inv.consumableInventory, () => 0)) {
      if (picks.length === slots.length) break;
      if (picks.some(p => conflicts(p, item))) continue;
      picks.push(item);
    }
    picks.forEach((item, n) => inv.equipConsumable(slots[n], item));
  }

  // Consumable slot indices EQUIP may fill: unlocked, and not held by the magic meter.
  _openConsumableSlots() {
    const inv = this.game.inventorySystem;
    const meter = this.game.player?.magicMeter;
    const reserved = meter?.active ? (meter.slots ?? []) : [];
    return inv.equippedConsumables.map((_, i) => i)
      .filter(i => i < inv.maxConsumableSlots && !reserved.includes(i));
  }
}

function isWeapon(item) {
  return item?.data?.type === 'WEAPON';
}

function isTrap(item) {
  return item?.data?.type === 'TRAP';
}

// `items` best first, each scored by `value` plus chance.
function byScore(items, value) {
  return items
    .map(item => ({ item, score: value(item) + Math.random() * JITTER }))
    .sort((a, b) => b.score - a.score)
    .map(entry => entry.item);
}

// Up to `count` weapons, the higher tiers preferred, each as unlike the ones
// already picked as the pool allows: a new type, else a new subtype, else a
// new weapon.
function diverseWeapons(pool, count) {
  const remaining = byScore(pool, weapon => weapon.data.tier ?? 0);
  const picks = [];
  const differs = [
    w => !picks.some(p => p.data.weaponType === w.data.weaponType),
    w => !picks.some(p => p.data.weaponType === w.data.weaponType && p.data.weaponSubtype === w.data.weaponSubtype),
    w => !picks.some(p => p.char === w.char),
    () => true,
  ];
  while (picks.length < count && remaining.length > 0) {
    const test = differs.find(rule => remaining.some(rule));
    const idx = remaining.findIndex(test);
    picks.push(remaining.splice(idx, 1)[0]);
  }
  return picks;
}

// Two consumables can't be worn together: the same consumable twice (heals
// excepted, as InventorySystem.conflictingConsumableSlot allows), or two of
// one Exclusive Group.
function conflicts(a, b) {
  const group = a.data?.exclusiveGroup;
  if (group && b.data?.exclusiveGroup === group) return true;
  return a.char === b.char && a.data?.effect !== 'heal';
}
