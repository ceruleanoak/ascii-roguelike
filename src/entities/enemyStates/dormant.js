// Dormant — asleep until something wakes it.
//
// Today this is `state === 'rest'`, which only ambushers ever enter and which
// every status guard in the ladder destroys: a stun overwrites `'rest'` with
// `'idle'` and the ambush is gone for the rest of the room. Here an interrupt
// never changes which State is current, so being stunned while dormant leaves
// the enemy dormant.
//
// Also the home for the Sniper's `hidden` and the Flock's `perch` once those
// private FSMs collapse into the spine — both are "not participating yet", which
// is one concept, not three.
import { GRID } from '../../game/GameConfig.js';
import { moveStill } from '../enemyMovement.js';

export default {
  id: 'dormant',

  update(enemy, ctx, machine) {
    moveStill(enemy);
  },

  next(enemy, ctx, machine) {
    const cfg = machine.configFor('dormant') ?? {};
    const wake = cfg.wake ?? {};
    // Damage wakes it regardless of distance, if the enemy declares that — an
    // ambusher shot from across the room should not keep sleeping.
    if (wake.onDamage && enemy.lastDamageTime === machine.elapsed) {
      return { id: 'approach', cause: 'woken by damage' };
    }
    const radius = wake.radius ?? GRID.CELL_SIZE * 4;
    if (ctx.distance < radius && ctx.samePlane) {
      return { id: 'approach', cause: `target within ${Math.round(radius)}px` };
    }
    return null;
  },

  exit(enemy, ctx, machine) {
    // Waking is what arms the ambusher's burst — the one-shot speed window that
    // makes the ambush worth the wait.
    enemy.enraged = true;
    const cfg = machine.configFor('dormant') ?? {};
    if (cfg.burst) {
      enemy.hasBeenActivated = true;
      enemy.burstActive = true;
      enemy.burstTimer = cfg.burst.duration ?? 1.0;
    }
    if (enemy.inShellForm !== undefined) {
      enemy.inShellForm = false;
      enemy.knockbackResistance = 0;
    }
  },

  thresholds(enemy, cfg) {
    const radius = cfg?.wake?.radius ?? GRID.CELL_SIZE * 4;
    return [{ label: 'wake', px: radius, color: '#cc9933' }];
  },
};
