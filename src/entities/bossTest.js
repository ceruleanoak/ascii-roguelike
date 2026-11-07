// The one test for "is this enemy a Boss, or a part of one". Every rule that
// treats a Boss differently from an ordinary Enemy asks this: it doesn't
// falter, blinks near death, shrugs the bolo off, can't be hexed into a frog,
// and can't be transmuted. One predicate so a new Boss (or Boss part) can't
// be covered by some of those rules and slip through another.
//
// A Boss shows up three ways, and any one counts:
// - `isBoss` on the instance (the roomFeatures Boss spawns) or its data
//   (createBossEnemy, the Centipede head) — #215 reads the instance first;
// - `isBossEntity`, set by every Boss-owned body that runs outside the
//   generic enemy pipeline (Great Hands, Clutch hands and Fingers, the
//   turtle's parts, the Storm Eye, the Hoardmaw...);
// - `tier: 'boss'` in its data (the Grasp's parts, the Centipede head).

export function countsAsBoss(enemy) {
  return !!(enemy.isBoss || enemy.isBossEntity ||
            enemy.data?.isBoss || enemy.data?.tier === 'boss');
}
