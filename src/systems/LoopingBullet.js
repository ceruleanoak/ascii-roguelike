// Orbital looping bullet (Fester's Gun's shot): the bullet revolves around a
// centre point that advances along the straight firing line.
//
//   pos(t) = origin + fwd*(ls*t + R - R*cos(ω*t)) + perp*R*sin(ω*t)
//   vel(t) = fwd*(ls + R*ω*sin(ω*t)) + perp*R*ω*cos(ω*t)   →  at t=0: fwd*ls + perp*R*ω
//
// One home for both halves so every shooter loops the same way: the player's
// gun (Item.js), an Enemy holding that gun, and an Enemy whose own magic
// authors the loop (Necromancer). CombatSystem steps both projectile lists
// through `stepLoopingBullet`; before this lived here only the player list
// stepped it, so an enemy-fired loop flew off at its t=0 velocity, crooked.

/**
 * Arms `proj` to loop along `angle`. `loop` carries the authored fields
 * (`loopOmega`, `loopRadius`, `loopLinearSpeed`), the same names on an ITEMS
 * entry or an ENEMIES entry.
 */
export function armLoopingBullet(proj, angle, loop) {
  const fwd = { x: Math.cos(angle), y: Math.sin(angle) };
  const perp = { x: -fwd.y, y: fwd.x };
  const R = loop.loopRadius || 30;
  const ls = loop.loopLinearSpeed || 130;
  const omega = loop.loopOmega;
  proj.velocity.vx = fwd.x * ls + perp.x * R * omega;
  proj.velocity.vy = fwd.y * ls + perp.y * R * omega;
  proj.loopOmega = omega;
  proj.loopRadius = R;
  proj.loopLinearSpeed = ls;
  proj.loopForward = fwd;
  proj.loopPerp = perp;
  proj.loopTime = 0;
}

/**
 * Re-derives a looping bullet's velocity for this frame. No-op on any other
 * projectile, and on a loop that has been turned (`reflected` — a deflector,
 * a reflect, a ricochet): its orbit was about the old firing line, so
 * re-deriving would undo the turn and send it back the way it came. A turned
 * loop flies straight on.
 */
export function stepLoopingBullet(proj, deltaTime) {
  if (!proj.loopOmega || proj.reflected) return;
  const t = proj.loopTime;
  const { loopForward: fwd, loopPerp: perp, loopRadius: R, loopLinearSpeed: ls, loopOmega: omega } = proj;
  proj.velocity.vx = fwd.x * (ls + R * omega * Math.sin(omega * t)) + perp.x * R * omega * Math.cos(omega * t);
  proj.velocity.vy = fwd.y * (ls + R * omega * Math.sin(omega * t)) + perp.y * R * omega * Math.cos(omega * t);
  proj.drawAngle = Math.atan2(proj.velocity.vy, proj.velocity.vx);
  proj.loopTime += deltaTime;
}
