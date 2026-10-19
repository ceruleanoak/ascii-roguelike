// Falter — a beat where an Enemy stops and doesn't commit, rolled on its
// decision frames while it is in Approach or Flee.
//
// Not a State, and not a sub-state beside the machine. It is a piece of the
// two States that use it: each one rolls it in its own `update()`, holds still
// while it runs, and clears it on `exit()`, so leaving the State ends the beat
// and nothing can outlive it (the failure the deleted hover meta-state had).
// No indicator either; the stop itself is what the player reads.
//
// Different from Anticipate, which is a tell that always comes before a
// Strike when the Enemy declares it. A Falter is a chance roll, comes before
// nothing in particular, and is what breaks up an otherwise steady approach
// or a steady flight.
//
// Authoring, per State (`data.states.approach.falter` / `data.states.flee.falter`):
//   absent             → roster default below
//   false              → never falters in this State
//   { chance, duration } → either key overrides its default; `duration` is in
//                        double-seconds like every other enemy timer
// Bosses never falter unless their data authors a `falter` block on purpose.
export const FALTER_DEFAULT_CHANCE = 0.15;

// Same boss test as Enemy.getNearDeathBlinkColor.
function isBoss(enemy) {
  return enemy.isBoss || enemy.isBossEntity || enemy.data?.tier === 'boss';
}

function falterConfig(enemy, cfg) {
  const authored = cfg?.falter;
  if (authored === false) return null;
  if (authored == null && isBoss(enemy)) return null;
  return {
    chance: authored?.chance ?? FALTER_DEFAULT_CHANCE,
    // One thinking beat by default, so a slow Enemy falters for longer than a
    // sharp one, the same way it is slower to notice things.
    duration: authored?.duration ?? enemy.decisionInterval,
  };
}

/**
 * Advance or roll the Falter for this frame. Returns true while the Enemy is
 * faltering, in which case the caller holds it still instead of moving it.
 */
export function updateFalter(enemy, ctx, cfg) {
  if (enemy.falterTimer > 0) {
    enemy.falterTimer -= ctx.deltaTime;
    return enemy.falterTimer > 0;
  }
  if (!ctx.decisionFrame) return false;
  const falter = falterConfig(enemy, cfg);
  if (!falter || Math.random() >= falter.chance) return false;
  enemy.falterTimer = falter.duration;
  return true;
}

export function isFaltering(enemy) {
  return enemy.falterTimer > 0;
}

export function clearFalter(enemy) {
  enemy.falterTimer = 0;
}
