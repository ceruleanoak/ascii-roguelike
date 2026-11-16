// Trap-Shy Mechanic — the enemy walks around placed traps that would go off
// under it. Lava-Shy's counterpart for traps: a Trap Goblin knows what a trap
// on the floor is, so another goblin's trap (or the player's) is a place it
// steers around rather than a place it blunders into. Its own traps are left
// out: a one-shot trap never fires for its owner (TrapSystem's `entry.owner`
// exemption), and moveFlee already spaces it from them.
//
// On by default for every enemy that lays traps itself (`trapLayerMechanic`):
// what lays traps knows them. `data.trapShy` overrides that default either
// way. Run from EnemyUpdateSystem right after the enemy's tick, once the State
// spine has written targetVelocity, and blended in on the next tick the way
// Lava-Shy's footing is. No suspend signal — it writes velocity only:
//   - Steering: inside a look-ahead ring around a trap's trigger radius, the
//     part of targetVelocity heading into the trap is removed, so the enemy
//     slides along the ring's edge at the same speed instead of crossing it.
//   - Recovery: one already inside the keep-out (knocked, spawned, or a trap
//     armed beside it) walks straight out.
// Knockback is never clamped: a hit can still throw it onto a trap.
//
// The distance is measured the way the trigger measures it (enemyHitTest's
// corner anchor against the trap item's position), so "outside the keep-out"
// means "outside what sets the trap off" plus a margin.

import { GRID } from '../../game/GameConfig.js';
import { enemyNearestPoint } from '../../systems/enemyHitTest.js';
import { isInteriorActive } from '../../systems/PlaneSystem.js';

// Kept clear of the trigger radius itself, so steering error never grazes it.
const KEEP_OUT_MARGIN = GRID.CELL_SIZE * 0.5;
// How far past the keep-out the enemy starts bending its path.
const LOOK_AHEAD = GRID.CELL_SIZE * 1.5;

export const TrapShyMechanic = {
  isEnabled(enemy) {
    const explicit = enemy.data?.trapShy;
    if (explicit !== undefined) return explicit === true;
    return enemy.data?.trapLayerMechanic?.enabled === true;
  },

  update(enemy) {
    if (!this.isEnabled(enemy) || enemy.isKnockedBack()) return;
    const game = enemy.game;
    if (!game?.placedTraps?.length) return;
    const interior = isInteriorActive(game);
    const tv = enemy.targetVelocity;

    for (const entry of game.placedTraps) {
      if (entry.owner === enemy) continue;
      if ((entry.interior === true) !== interior) continue;
      const data = entry.item.data;
      // A remote bomb waits for the player's word, not for feet.
      if (!data || data.remoteTrigger) continue;
      const trigger = data.triggerRadius ?? data.effectRadius ?? GRID.CELL_SIZE;
      const keepOut = trigger + KEEP_OUT_MARGIN;

      const tx = entry.item.position.x;
      const ty = entry.item.position.y;
      const near = enemyNearestPoint(enemy, tx, ty, 'corner', keepOut + LOOK_AHEAD);
      if (!(near.dist < keepOut + LOOK_AHEAD)) continue;

      // Unit vector from the trap out toward the enemy.
      let ox = near.x - tx, oy = near.y - ty;
      const len = Math.hypot(ox, oy);
      if (len === 0) { ox = 1; oy = 0; } else { ox /= len; oy /= len; }

      if (near.dist < keepOut) {
        const speed = enemy.speed ?? GRID.CELL_SIZE;
        tv.vx = ox * speed;
        tv.vy = oy * speed;
        continue;
      }

      // Heading in: drop the inward part and keep the speed along the ring.
      const inward = tv.vx * ox + tv.vy * oy;
      if (inward >= 0) continue;
      const speed = Math.hypot(tv.vx, tv.vy);
      let sx = tv.vx - inward * ox, sy = tv.vy - inward * oy;
      const slide = Math.hypot(sx, sy);
      if (slide === 0) { sx = -oy; sy = ox; } else { sx /= slide; sy /= slide; }
      tv.vx = sx * speed;
      tv.vy = sy * speed;
    }
  },
};
