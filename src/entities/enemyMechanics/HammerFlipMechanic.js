// Hammer flip (Tortoise) — `data.hammerFlip`: a hammer blow flips the enemy
// onto its back. The shell that makes it immune to every other hit is exactly
// what a blunt overhead blow can tip over — the Ancient Turtle's flip (zone
// boss, P2) in miniature, earned by the right tool instead of by HP.
//
//   hammerFlip: {
//     duration,  // real seconds spent upside down (stunned, out of its shell)
//   }
//
// Called from Enemy.takeDamage BEFORE the shell-form immunity check, so the
// blow that lands on a tucked shell still flips it. While flipped the enemy is
// out of its shell and stunned (no launch, no charge, no strike), and the
// usual re-tuck-on-damage is suppressed — the punish window stays open for the
// whole flip. Rights itself when the stun expires.

import { PHYSICS } from '../../game/GameConfig.js';

export const HammerFlipMechanic = {
  isEnabled(enemy) {
    return !!enemy.data?.hammerFlip;
  },

  init(enemy) {
    enemy.flipped = false;
  },

  // Returns true when this hit flipped the enemy.
  tryFlip(enemy, weaponSubtype) {
    if (!this.isEnabled(enemy) || weaponSubtype !== 'hammer' || enemy.flipped) return false;
    enemy.flipped = true;
    enemy.inShellForm = false;
    enemy.shellFormTimer = 0;
    enemy.shellLaunchTimer = 0;
    enemy.knockbackResistance = 0;
    enemy.burstActive = false;
    enemy.chargeState = 'idle';
    // Status effects tick on the enemy's double-second clock.
    enemy.applyStatusEffect('stun', enemy.data.hammerFlip.duration * PHYSICS.ENEMY_TIMER_RATE);
    return true;
  },

  update(enemy) {
    if (enemy.flipped && !enemy.isStunned()) enemy.flipped = false;
  },
};
