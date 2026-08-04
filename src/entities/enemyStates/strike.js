// Strike — the attack, from its opening beat to its last.
//
// Collapses `'windup'` and `'attack'`, which are two state ids for one event and
// were the messiest corner of the legacy ladder: `attack → idle` had three
// closers that disagreed, one of them dead. Here Strike ends when its beats end,
// and the one thing that happens outside those beats — paying for the swing —
// happens in `Enemy.resolveStrike()`, at the single moment the attack becomes
// real.
//
// `bands` is the answer to "do attacks differ based on distance". Evaluated
// nearest-first, it generalizes the five bespoke versions currently open-coded
// in LakeBoss, GooDragon, GooHead, Sniper, and Giant Slime, and gives the eleven
// different names for "a distance threshold" scattered across enemies.js one
// shape to share. A band can override `windup`/`movement`/`speed` (read here)
// and `damage`/`knockback`/`duration` (read at the point the attack itself is
// built — Enemy.createMeleeAttack/createWindupAttackVisual — since those are
// properties of the swing, not of standing still before it).
import { applyStateMovement } from '../enemyMovement.js';

// `windupMovement` was the one place the codebase already let a State pick its
// own verb — it just did it with a private three-value enum and a hardcoded 40%
// instead of the shared vocabulary. Mapping it here is what makes the roster's
// existing windup behavior expressible as a normal `{movement, speed}` pair, so
// a re-authored enemy can say `strike: { movement: 'orbit', speed: 0.6 }` and
// nothing about the plumbing has to change to accept it.
const WINDUP_VERB = { stop: 'still', advance: 'close', retreat: 'back' };
const WINDUP_SPEED = 0.4;

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
    machine.struck = false;
    enemy.windupTimer = machine.band?.windup ?? enemy.attackWindup ?? 0;
    // Total for this windup, captured once at entry so Enemy.isInCritWindow()
    // can scale the guaranteed-crit back half to it as windupTimer counts down.
    enemy.windupDuration = enemy.windupTimer;
    if (enemy.target && !enemy.markedTargetPosition) {
      enemy.markedTargetPosition = { x: enemy.target.position.x, y: enemy.target.position.y };
    }
  },

  update(enemy, ctx, machine) {
    const cfg = machine.configFor('strike') ?? {};

    // `windupTimer` is ticked by Enemy.update() above the spine call, so Strike
    // must not tick it too — doing both retires the opening beat a frame early
    // and every telegraph reads short. The countdown has exactly one owner.

    // The enemy plants its feet before it swings. `machine.timer` is exactly 0
    // only on the frame Strike was entered, so this is that frame and no other:
    // whatever the approach was doing stops dead, and the windup verb starts
    // steering from the next frame. Losing this beat makes every attack look
    // like it slides out of the chase instead of committing to a stance.
    if (machine.timer === 0) {
      enemy.targetVelocity.vx = 0;
      enemy.targetVelocity.vy = 0;
      return;
    }

    if (enemy.windupTimer > 0) {
      const move = machine.band?.movement ?? cfg.movement ?? WINDUP_VERB[enemy.windupMovement] ?? 'still';
      const speed = machine.band?.speed ?? cfg.speed ?? WINDUP_SPEED;
      applyStateMovement(enemy, { ...cfg, movement: move, speed }, ctx.speedMultiplier, ctx.targetPos, ctx.deltaTime);
      return;
    }

    // Past the opening beat, the strike itself does not steer. Velocity is left
    // exactly where the windup put it rather than zeroed, because zeroing here
    // would put a dead stop in the middle of every lunging attack.
    if (cfg.movement || machine.band?.movement) {
      applyStateMovement(enemy, { ...cfg, movement: machine.band?.movement ?? cfg.movement }, ctx.speedMultiplier, ctx.targetPos, ctx.deltaTime);
    }
  },

  next(enemy, ctx, machine) {
    // The player has no rendered telegraph to read for an enemy the zoomed
    // viewport is clipping out — bail out rather than let the windup or the
    // swing itself resolve unseen. `enter()` always rolls a fresh windup on
    // re-entry, so nothing needs to be reset here.
    if (!ctx.onScreen) return { id: 'approach', cause: 'offscreen' };

    if (enemy.windupTimer > 0) return null;
    const cfg = machine.configFor('strike') ?? {};

    // The frame the swing lands belongs to the swing. Telegraph resolves the
    // attack after Enemy.update() returns, so leaving Strike on the same frame
    // the windup expires would hand control back to Approach before the hit has
    // been evaluated — the enemy would already be repositioning for its next
    // move on the frame it was supposed to be connecting. Holding one frame is
    // what the legacy ladder does by accident (`'attack'` survives a frame
    // before CombatSystem closes it) and what this does on purpose.
    if (!machine.struck) { machine.struck = true; return null; }
    // The whole event is over once the windup and the attack's own duration have
    // both elapsed. Recover is skipped when undeclared, resolving to Approach,
    // which is what every enemy does today.
    const total = (machine.band?.windup ?? enemy.attackWindup ?? 0) + (cfg.duration ?? 0);
    if (machine.timer < total) return null;
    return { id: 'recover', cause: 'strike complete' };
  },

  exit(enemy, ctx, machine) {
    // The cooldown is deliberately not charged here, and this is the one place
    // that distinction is visible. `Enemy.resolveStrike()` charges it, on the
    // single path where the swing actually became an attack — so a windup the
    // target walked out of costs the enemy nothing and it may immediately try
    // again. Charging on exit instead would tax every aborted swing, which is a
    // balance change wearing a refactor's clothes.
    enemy.markedTargetPosition = null;
    machine.band = null;
    machine.struck = false;
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
