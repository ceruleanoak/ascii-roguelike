import { GRID } from '../../game/GameConfig.js';

// Patrol movement (data.patrol): drive the enemy along a fixed list of waypoints
// at constant speed — no targeting, no windup, no chase. A strict point-based
// path for fixed-pattern hazards (the Aquifer eel). The spawner sets
// `enemy.patrolWaypoints` (pixel-space {x,y} points); this mechanic ping-pongs
// along them, stamping targetVelocity over whatever the idle AI produced (runs
// in the end-of-update mechanic block, like FlockMechanic.updateSwirl).
//
// Movement only — contact damage is the spawner's concern (AquiferSystem), so
// the mechanic stays a reusable pure path-follower.
//
// Config (data.patrol, all optional — defaults shown):
//   speed     = enemy.speed       (patrol cruise speed)
//   loop      = false             (true = wrap to start; false = ping-pong)
//   arriveGap = GRID.CELL_SIZE*0.5 (distance that counts as "reached a waypoint")
export const PatrolMechanic = {
  isEnabled(enemy) {
    return !!enemy.data?.patrol;
  },

  init(enemy) {
    enemy.patrolWaypoints = enemy.patrolWaypoints || [];
    enemy.patrolIndex = 0;
    enemy.patrolDir = 1; // +1 forward, -1 back (ping-pong)
  },

  update(enemy, { deltaTime }) {
    const cfg = enemy.data?.patrol;
    const wps = enemy.patrolWaypoints;
    if (!cfg || !wps || wps.length < 2) return;
    if (enemy.isFrozen?.() || enemy.isStunned?.() || enemy.isZapped?.()) return;

    const speed = cfg.speed ?? enemy.speed ?? 60;
    const arriveGap = cfg.arriveGap ?? GRID.CELL_SIZE * 0.5;
    const wp = wps[enemy.patrolIndex];

    const dx = wp.x - enemy.position.x;
    const dy = wp.y - enemy.position.y;
    const dist = Math.hypot(dx, dy);

    if (dist <= arriveGap) {
      // Advance to the next waypoint (loop or ping-pong off the ends).
      if (cfg.loop) {
        enemy.patrolIndex = (enemy.patrolIndex + 1) % wps.length;
      } else {
        let next = enemy.patrolIndex + enemy.patrolDir;
        if (next >= wps.length) { enemy.patrolDir = -1; next = wps.length - 2; }
        else if (next < 0) { enemy.patrolDir = 1; next = 1; }
        enemy.patrolIndex = next;
      }
      return;
    }

    enemy.targetVelocity.vx = (dx / dist) * speed;
    enemy.targetVelocity.vy = (dy / dist) * speed;
    if (enemy.facing) { enemy.facing.x = Math.sign(dx); enemy.facing.y = Math.sign(dy); }
  }
};
