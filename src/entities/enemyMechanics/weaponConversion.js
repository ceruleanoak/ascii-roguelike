// Weapon Conversion — what equipping a weapon does to an item-using Enemy
// (Goblins, and anything else with `data.itemUsage`). A ranged weapon keeps
// the Enemy's native spacing; a melee weapon converts it into a chaser for as
// long as it holds one. Close Quarters (CloseQuartersMechanic) opts out of
// the melee conversion and keeps the weapon in reserve instead.
//
// Called from Enemy.equipWeapon (convert), Enemy.resolveStrike
// (holdStrikeForWeapon) and leaveCowardice (syncApproachToWeapon).
import { GRID } from '../../game/GameConfig.js';

export const WeaponConversion = {
  convert(enemy, item) {
    // Capture native speed once so melee/ranged swaps can toggle the boost cleanly.
    if (enemy._baseSpeed === undefined) enemy._baseSpeed = enemy.speed;

    if (item.data.weaponType === 'GUN' || item.data.weaponType === 'BOW') {
      enemy.attackType = 'item_ranged';
      // Restore keeper distance-hold behavior for ranged loadouts.
      if (enemy.data.movementStyle) enemy.movementStyle = enemy.data.movementStyle;
      enemy.leapOnAttack = false;
      enemy.attackRange = enemy.itemUsage.useRange;
      enemy.speed = enemy._baseSpeed;
      enemy.attackWindup = enemy.data.attackWindup ?? 0;
    } else {
      enemy.attackType = 'item_melee';
      // Melee weapon → close the distance instead of holding bow range, then
      // commit a forward leap when the swing fires (see windup → attack
      // transition in Enemy.update()). attackRange is tightened so melee
      // goblins don't try to swing from across the room. Fall back to the same
      // range default Item.createMeleeAttack uses (20) — spear has no `range`
      // field and would otherwise produce NaN here, leaving the goblin unable
      // to ever register being in attack range.
      enemy.movementStyle = 'chaser';
      enemy.leapOnAttack = true;
      const wpnRange = item.data.range ?? 20;
      enemy.attackRange = Math.max(GRID.CELL_SIZE * 1.5, wpnRange * 1.2);
      // Melee-wielders get a +30% speed boost so they can actually close the
      // gap and commit a swing. Without this, ranged-archetype enemies who
      // grabbed a melee weapon kept their original (slower) chase speed and
      // were trivially kited.
      enemy.speed = enemy._baseSpeed * 1.3;
      // The state machine's declared States are fixed at construction from
      // this enemy's original archetype (stateDefaults.js), so a kiter/jumper/
      // ambusher whose native attack isn't melee was never given a Recover —
      // there was nothing to overlap and whiff on. Now that it is wielding a
      // swung weapon, it needs the exact same overlap protection a born
      // melee enemy gets, and there is no later point that re-derives
      // declared States to pick it up on its own.
      if (!enemy.stateMachine.has('recover')) {
        enemy.stateMachine.declared.recover = { duration: 0.4, variant: 'retreat', speed: 0.5 };
      }
      // The swung weapon's own windup (Item `data.windup`) is the telegraph.
      // Stacking the native Strike windup in front of it (the Goblin's 1.0 is
      // tuned for drawing a bow) made a melee goblin stand in reach of the
      // player for a full beat with no visual before even starting the swing.
      enemy.attackWindup = 0;
    }
    WeaponConversion.syncApproachToWeapon(enemy);
  },

  /**
   * Points the declared Approach verb at the equipped weapon. Like Recover
   * above, declared States are fixed at construction from the native
   * archetype, so a keeper (Goblin) that picked up a sword kept its 'hold'
   * Approach — it stood at bow range and never reached melee reach. A melee
   * weapon closes; a ranged weapon restores the native verb. Also called by
   * leaveCowardice, whose restore would otherwise put back a pre-flip verb
   * from before a mid-flight weapon swap.
   */
  syncApproachToWeapon(enemy) {
    const approach = enemy.stateMachine.declared.approach;
    if (!approach || !enemy.equippedWeapon) return;
    if (enemy.attackType === 'item_melee') {
      if (enemy._nativeApproachMovement == null) enemy._nativeApproachMovement = approach.movement;
      enemy.stateMachine.declared.approach = { ...approach, movement: 'close' };
    } else if (enemy._nativeApproachMovement != null) {
      enemy.stateMachine.declared.approach = { ...approach, movement: enemy._nativeApproachMovement };
    }
  },

  /**
   * Enemy.resolveStrike hook. An item wielder can't swing again until its
   * weapon is ready, so don't let Approach commit a Strike before then:
   * createAttack would return null, and that empty Strike still charged a full
   * attackCooldown — a Goblin's 2.0 itemUseCooldown outlasting its 1.8
   * attackCooldown wasted every other cycle, doubling the gap between swings.
   * The next Strike's own windup also runs before it fires, so only the part
   * of the wait it doesn't cover is added (a bow's 1.0 windup already covers
   * the Goblin's gap).
   */
  holdStrikeForWeapon(enemy) {
    if (!enemy.equippedWeapon || !enemy.attackType?.startsWith('item_')) return;
    const readyIn = Math.max(enemy.itemUseCooldown ?? 0, enemy.equippedWeapon.cooldownTimer ?? 0);
    enemy.attackTimer = Math.max(enemy.attackTimer, readyIn - (enemy.attackWindup ?? 0));
  },
};
