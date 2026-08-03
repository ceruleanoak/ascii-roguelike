// requirePursuit gate — shared by any State config that wants to distinguish
// "the target is genuinely closing in" from "the target merely remained
// visible or in range."
//
// Raw distance-to-target cannot make that distinction on its own: it changes
// with EITHER party's motion, and several States that want this gate
// (Alert's wander, Withdraw's backing-off) move the enemy itself every frame
// they hold it armed. An enemy that randomly wanders toward a target
// standing dead still would read its own footwork as "they're pursuing me"
// and re-arm exactly the behavior the gate exists to suppress (Trap Goblin:
// a stationary player re-triggering endless trap-laying cycles).
//
// The fix is to anchor the comparison to the enemy's position at the moment
// the gate was armed, and measure only how the TARGET's position has moved
// relative to that fixed point since. The enemy's own subsequent motion
// never enters the comparison.
const PURSUIT_MARGIN = 4; // px slack — frame-to-frame jitter/rounding noise

/**
 * Arm the gate. Call once from a State's `enter()`. `ctx` may be null (the
 * one-time construction-time entry in EnemyStateMachine's constructor, before
 * any per-frame context exists) — the gate reads straight from `enemy.target`
 * instead of `ctx`, so that call is handled the same as any other.
 */
export function armPursuitGate(enemy, key) {
  const anchor = { x: enemy.position.x, y: enemy.position.y };
  const dist = enemy.target
    ? Math.hypot(enemy.target.position.x - anchor.x, enemy.target.position.y - anchor.y)
    : Infinity;
  enemy[key] = { anchor, dist };
}

/**
 * Has the target closed real distance toward the enemy's position at arm
 * time? `cfg.requirePursuit` falsy makes this always true (opt-in gate —
 * every enemy that doesn't declare it is unaffected).
 */
export function isPursuing(enemy, key, cfg) {
  if (!cfg?.requirePursuit) return true;
  const gate = enemy[key];
  if (!gate || !enemy.target) return false;
  const dx = enemy.target.position.x - gate.anchor.x;
  const dy = enemy.target.position.y - gate.anchor.y;
  const distFromAnchor = Math.hypot(dx, dy);
  return distFromAnchor <= gate.dist - PURSUIT_MARGIN;
}
