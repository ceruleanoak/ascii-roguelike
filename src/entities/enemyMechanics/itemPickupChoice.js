// Item Pickup Choice — which nearby world item an item-using Enemy
// (`data.itemUsage`: Goblins and kin) walks over to pick up. Called through
// Enemy.evaluateItemPickup (which LakeBoss overrides to opt out) from
// EnemyUpdateSystem's item-seek step.
import { inSamePlane } from '../../systems/PlaneSystem.js';

// A weapon's power for swap decisions: its raw damage. Non-weapons are -1.
export function weaponPower(item) {
  if (!item || item.data?.type !== 'WEAPON') return -1;
  return item.data.damage ?? 0;
}

export function chooseItemPickup(enemy, items, pickupRange) {
  const usage = enemy.itemUsage;
  if (!usage || !usage.canPickup) return null;

  const hasSpace = enemy.inventory.length < usage.maxItems;
  const equippedPower = weaponPower(enemy.equippedWeapon);

  let bestItem = null;
  let bestScore = 0;

  for (const item of items) {
    if (!inSamePlane(enemy, item)) continue;
    const distance = Math.hypot(
      item.position.x - enemy.position.x,
      item.position.y - enemy.position.y
    );
    if (distance > pickupRange) continue;
    if (!usage.preferredItems.includes(item.char)) continue;

    const isWeapon = item.data?.type === 'WEAPON';

    if (!hasSpace) {
      // Inventory full → only swap to a strictly stronger weapon
      if (!isWeapon) continue;
      if (weaponPower(item) <= equippedPower) continue;
    }

    // Weapon score scales with raw damage so goblins prefer the strongest
    // blade nearby; non-weapons (e.g. health pots) keep a modest baseline.
    let score = isWeapon ? (10 + (item.data.damage ?? 1) * 4) : 5;
    score *= (1.0 - (distance / pickupRange));

    if (score > bestScore) {
      bestScore = score;
      bestItem = item;
    }
  }

  return bestItem;
}
