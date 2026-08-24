// Shell form (tortoise + shell-armored enemies). Starts in shell with 80%
// knockback resistance. Damage handler elsewhere triggers re-emergence; the
// timer here counts down to drop the shell. For ambushers, exiting the shell
// also triggers a burst.
//
// Optional shell launch (Tortoise): being struck doesn't just re-tuck the
// enemy — after a short coiled pause it erupts out of the shell as a rolling
// rush toward the striker, in miniature of the Red zone boss's ricochet roll
// (TurtleShell). Rather than inventing a second dash pipeline, the launch
// DRIVES the existing chargeMechanic FSM: it injects `chargeState = 'windup'`
// and lets ChargeMechanic own everything from there (locked direction,
// velocity override, contact hit, wall stun, cooldown). Requires the enemy to
// carry both `shellCamouflage` (gates init, where all fields below are
// created) and a `chargeMechanic` block (supplies the launch's tuning).

import { GRID } from '../../game/GameConfig.js';

export const ShellFormMechanic = {
  isEnabled(enemy) {
    return enemy.data.shellCamouflage === true;
  },

  init(enemy) {
    enemy.inShellForm = true;
    enemy.shellFormTimer = 0;
    enemy.knockbackResistance = 0.8;
    // Shell-launch bookkeeping (only read when data.shellLaunch.enabled).
    enemy.shellLaunchWasActive = true;   // spawns shelled — no phantom arm on frame one
    enemy.shellLaunchTimer = 0;
  },

  update(enemy, ctx) {
    const launch = enemy.data.shellLaunch;
    const active = enemy.inShellForm === true;

    if (launch?.enabled) {
      // Rising edge into the shell (spawn excepted via init above): arm the
      // coil. Tracked every frame so the re-tuck from takeDamage is never
      // missed, even mid-emerge.
      if (active && !enemy.shellLaunchWasActive) {
        enemy.shellLaunchTimer = launch.delay ?? 0.45;
      }
      enemy.shellLaunchWasActive = active;
    }

    if (!active || enemy.shellFormTimer <= 0) return;
    const { deltaTime } = ctx;

    // Coiled: hold the ordinary re-emerge timer while the launch counts down —
    // the tense pause IS the tell, and popping out passively mid-coil would
    // swallow it. If launch conditions fail at coil end, the timer falls
    // through to the normal countdown below (passive re-emerge).
    if (launch?.enabled && enemy.shellLaunchTimer > 0) {
      enemy.shellLaunchTimer -= deltaTime;
      if (enemy.shellLaunchTimer <= 0) this._launchFromShell(enemy, launch);
      return;
    }

    enemy.shellFormTimer -= deltaTime;
    if (enemy.shellFormTimer > 0) return;

    enemy.inShellForm = false;
    enemy.knockbackResistance = 0;
    if (enemy.movementStyle === 'ambusher') {
      enemy.burstActive = true;
      enemy.burstTimer = enemy.movementConfig.burstDuration ?? 1.0;
    }
  },

  _launchFromShell(enemy, launch) {
    const cfg = enemy.data.chargeMechanic;
    const target = enemy.target;
    // An unseen launch is an unfair hit — same on-screen rule ChargeMechanic
    // itself enforces before starting a charge. Wet/frozen shells have no
    // traction (same no-traction rule ChargeMechanic aborts on); a stunned or
    // already-charging enemy doesn't get hijacked mid-state.
    if (!cfg?.enabled || !target || enemy.chargeState !== 'idle') return;
    if (enemy.isStunned() || enemy.isFrozen() || enemy.isWet()) return;
    if (!enemy.game?.cameraZoomSystem?.isEntityOnScreen(enemy)) return;
    const dx = target.position.x - enemy.position.x;
    const dy = target.position.y - enemy.position.y;
    if (Math.sqrt(dx * dx + dy * dy) > (launch.range ?? GRID.CELL_SIZE * 6)) return;
    // Cone ignored: the striker may have hit from any side; a reactive launch
    // doesn't require first turning to face them.
    if (!enemy.hasVision(enemy.position, target.position, enemy.visionLength, { ignoreCone: true })) return;

    // The shell opens straight into the rolling rush.
    enemy.inShellForm = false;
    enemy.knockbackResistance = 0;
    enemy.chargeState = 'windup';
    enemy.chargeWindupTimer = cfg.chargeWindup;
  }
};
