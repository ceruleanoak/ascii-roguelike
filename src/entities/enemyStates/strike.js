// Strike — the attack, from its opening beat to its last.
//
// Collapses `'windup'` and `'attack'`, which are two state ids for one event and
// the source of the messiest corner of the legacy ladder: `attack → idle` has
// three closers, one of them dead; melee actually closes via
// `Telegraph.syncWindupVisual` rather than through the ladder at all; non-melee
// never leaves `'attack'` on its own; and `Enemy.attack()` has zero callers.
// Here the runner owns closure — Strike ends when its beats end.
//
// `bands` is the answer to "do attacks differ based on distance". Evaluated
// nearest-first, it generalizes the five bespoke versions currently open-coded
// in LakeBoss, GooDragon, GooHead, Sniper, and Giant Slime, and gives the eleven
// different names for "a distance threshold" scattered across enemies.js one
// shape to share.
import { applyStateMovement } from '../enemyMovement.js';

export default {
  id: 'strike',
  // A swing that damage can cancel is not a swing the player has to respect.
  committed: true,

  enter(enemy, ctx, machine) {
    const cfg = machine.configFor('strike') ?? {};
    // Which band the distance falls in is decided once, at commitment, not
    // re-picked per frame — otherwise backing away mid-swing would silently
    // swap which attack lands.
    machine.band = pickBand(cfg.bands, ctx.effectiveDistance);
    enemy.windupTimer = machine.band?.windup ?? enemy.attackWindup;
    if (enemy.target && !enemy.markedTargetPosition) {
      enemy.markedTargetPosition = { x: enemy.target.position.x, y: enemy.target.position.y };
    }
  },

  update(enemy, ctx, machine) {
    const cfg = machine.configFor('strike') ?? {};
    const move = machine.band?.movement ?? cfg.movement ?? 'still';
    applyStateMovement(enemy, { ...cfg, movement: move }, ctx.speedMultiplier, ctx.targetPos, ctx.deltaTime);
    if (enemy.windupTimer > 0) enemy.windupTimer -= ctx.deltaTime;
  },

  next(enemy, ctx, machine) {
    if (enemy.windupTimer > 0) return null;
    const cfg = machine.configFor('strike') ?? {};
    // The whole event is over once the windup and the attack's own duration have
    // both elapsed. Recover is skipped when undeclared, resolving to Approach,
    // which is what every enemy does today.
    const total = (machine.band?.windup ?? enemy.attackWindup) + (cfg.duration ?? 0);
    if (machine.timer < total) return null;
    return { id: 'recover', cause: 'strike complete' };
  },

  exit(enemy, ctx, machine) {
    enemy.attackTimer = enemy.attackCooldown;
    enemy.markedTargetPosition = null;
    machine.band = null;
  },

  thresholds(enemy, cfg) {
    return (cfg?.bands ?? []).map((b, i) => ({
      label: b.attack ?? `band ${i + 1}`,
      px: b.within,
      color: '#e0664a',
    }));
  },
};

// Nearest-first: the first band whose `within` contains the distance wins, so
// bands are authored close-to-far and a bite beats a pounce at point blank.
function pickBand(bands, distance) {
  if (!Array.isArray(bands) || bands.length === 0) return null;
  const sorted = [...bands].sort((a, b) => (a.within ?? Infinity) - (b.within ?? Infinity));
  return sorted.find(b => distance <= (b.within ?? Infinity)) ?? sorted[sorted.length - 1];
}
