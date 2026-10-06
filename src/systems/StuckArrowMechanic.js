import { GRID } from '../game/GameConfig.js';
import { BoomerangMechanic } from './BoomerangMechanic.js';

// Per-frame upkeep for CombatSystem.stuckArrows — arrows (and lodged
// boomerangs) resting in the world after a shot: expire on lifetime, follow
// the host they're stuck to (enemy/object/player) and drop or vanish when it
// dies, refund ammo to the matching bow when the player walks over a
// pickupable one, and run down the burning-arrow fire timer. `combat` is the
// CombatSystem instance (damage-number popups). Mutates `stuckArrows` in place.
export function updateStuckArrows(stuckArrows, deltaTime, player, combat) {
  for (let i = stuckArrows.length - 1; i >= 0; i--) {
    const arrow = stuckArrows[i];

    // Expire after lifetime
    arrow.lifetime -= deltaTime;
    if (arrow.lifetime <= 0) {
      BoomerangMechanic.releaseStuck(arrow);
      stuckArrows.splice(i, 1);
      continue;
    }

    // If stuck to something, check if target is dead and remove arrow
    if (arrow.stuckTo) {
      const targetDead = (arrow.stuckTo.hp !== undefined && arrow.stuckTo.hp <= 0) ||
                        arrow.stuckTo.destroyed;
      if (targetDead && arrow.boomerang) {
        // A lodged boomerang never vanishes with its host — it falls where it was.
        BoomerangMechanic.dropStuckToGround(arrow);
      } else if (targetDead) {
        // Small chance for an arrow stuck in a slain enemy to drop for re-pickup
        if (arrow.stuckType === 'enemy' && arrow.weaponChar && Math.random() < 0.25) {
          arrow.stuckTo = null;
          arrow.stuckType = 'ground';
          arrow.pickupable = true;
          arrow.lifetime = 8.0;
          arrow.offset = { x: 0, y: 0 };
        } else {
          stuckArrows.splice(i, 1);
          continue;
        }
      } else {
        // Update position to follow target
        arrow.position.x = arrow.stuckTo.position.x + arrow.offset.x;
        arrow.position.y = arrow.stuckTo.position.y + arrow.offset.y;
      }
    }
    // If on ground (stuckTo === null), arrow stays at fixed position

    // Player can pick up ground arrows to refund ammo to the matching bow —
    // only on the layer they're standing on: interior coordinates overlap the
    // surface Room's, so an arrow left on the surface would otherwise refund
    // from inside a hut.
    if (arrow.pickupable && arrow.weaponChar && player && !player.isDead &&
        arrow.hutPlane === combat.activeHutPlane()) {
      const ax = arrow.position.x + GRID.CELL_SIZE / 2;
      const ay = arrow.position.y + GRID.CELL_SIZE / 2;
      const px = player.position.x + player.width / 2;
      const py = player.position.y + player.height / 2;
      const inReach = Math.abs(ax - px) < GRID.CELL_SIZE && Math.abs(ay - py) < GRID.CELL_SIZE;
      if (inReach && arrow.boomerang) {
        // Boomerang pickup: same refund as a catch, no '+1' popup.
        if (BoomerangMechanic._refundAmmo(arrow)) {
          stuckArrows.splice(i, 1);
          continue;
        }
      } else if (inReach) {
        const bow = (player.quickSlots || []).find(slot =>
          slot &&
          slot.data?.weaponType === 'BOW' &&
          slot.char === arrow.weaponChar &&
          slot.maxUses !== null &&
          slot.usesRemaining < slot.maxUses
        );
        if (bow) {
          bow.usesRemaining++;
          if (bow.cooldownTimer > 1000) bow.cooldownTimer = 0; // Clear depletion lock
          combat.createDamageNumber('+1', arrow.position.x, arrow.position.y, arrow.color || '#ffffff');
          stuckArrows.splice(i, 1);
          continue;
        }
      }
    }

    // Advance fire generator timer; expire after 3 seconds
    if (arrow.isBurning) {
      arrow.fireGenTimer += deltaTime;
      if (arrow.fireGenTimer >= 3.0) {
        arrow.isBurning = false;
      }
    }
  }
}
