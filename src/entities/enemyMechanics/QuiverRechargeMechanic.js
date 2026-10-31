// Quiver Recharge — an archer that runs dry turns coward until it can shoot
// again. Enemy-held bows share the player's per-room magazine (`maxUses`,
// e.g. the Bow's 10 arrows), so without this a Goblin that emptied its bow
// kept its ranged spacing for the rest of the room and simply never fired.
//
// While the equipped bow is empty the Enemy flees (shared cowardice flip —
// it never bites back, it has nothing to bite with) and a recharge clock
// runs; when it fills, the bow refills to its full magazine and the Enemy
// returns to hunting. Picking up a different weapon mid-flight (Goblins swap
// to any better weapon they find) ends the flight early — it has something
// to fight with again — and leaves the recharge for if it ever runs dry again.
//
// A disarmed archer (whip disarm, or a zap jolt shaking its gear loose) gets
// the same flip with no clock: its arrows came from the bow, so with nothing
// in hand it runs until it picks a weapon back up. Its `data.attackType` is
// still 'ranged', which is why Enemy.createAttack asks `isDisarmed` too.
//
// Unlike the Thief flip, the coward still counts toward room-clear: it will
// be back, so the room isn't cleared until it's dealt with.
import { enterCowardice, leaveCowardice } from './cowardice.js';

const DEFAULT_RECHARGE_TIME = 20.0; // double-seconds — 10 real seconds

function hasEmptyBow(enemy) {
  const bow = enemy.equippedWeapon;
  return bow?.data?.weaponType === 'BOW' && bow.maxUses !== null && bow.usesRemaining <= 0;
}

export const QuiverRechargeMechanic = {
  isEnabled(enemy) {
    return enemy.data.quiverRecharge?.enabled === true;
  },

  isDisarmed(enemy) {
    return QuiverRechargeMechanic.isEnabled(enemy) && !enemy.equippedWeapon;
  },

  init(enemy) {
    enemy.quiverEmpty = false;
    enemy.quiverRechargeTimer = 0;
    enemy._quiverPreFlipStates = null;
  },

  update(enemy, ctx) {
    if (!QuiverRechargeMechanic.isEnabled(enemy)) return;

    const disarmed = QuiverRechargeMechanic.isDisarmed(enemy);

    if (!enemy.quiverEmpty) {
      // Never yank a shot already in motion out from under Strike. A disarmed
      // Enemy has no shot in motion: the bow left with its hands.
      if (!disarmed && (enemy.stateMachine.current === 'strike' || !hasEmptyBow(enemy))) return;
      enemy.quiverEmpty = true;
      enemy.quiverRechargeTimer = 0;
      enemy._quiverPreFlipStates = enterCowardice(enemy, ctx, { cornered: false, reason: disarmed ? 'disarmed' : 'quiver empty' });
      return;
    }

    if (disarmed) return;

    if (!hasEmptyBow(enemy)) {
      QuiverRechargeMechanic._rearm(enemy, ctx);
      return;
    }

    const rechargeTime = enemy.data.quiverRecharge.rechargeTime ?? DEFAULT_RECHARGE_TIME;
    enemy.quiverRechargeTimer += ctx.deltaTime;
    if (enemy.quiverRechargeTimer >= rechargeTime) {
      enemy.equippedWeapon.usesRemaining = enemy.equippedWeapon.maxUses;
      QuiverRechargeMechanic._rearm(enemy, ctx);
    }
  },

  _rearm(enemy, ctx) {
    enemy.quiverEmpty = false;
    enemy.quiverRechargeTimer = 0;
    leaveCowardice(enemy, ctx, enemy._quiverPreFlipStates, 'quiver recharged');
    enemy._quiverPreFlipStates = null;
  },
};
