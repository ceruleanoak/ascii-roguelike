// The runner for the Enemy State spine.
//
// One closed set of named States, one current State at a time, and a runner that
// owns entry and exit. That ownership is the whole point: the meta-state machine
// deleted in `baba4f0` failed because it ran *beside* the core, so both machines
// wrote flags and neither cleaned them up — bats stuck showing '...' forever. A
// State here cannot leak, because leaving it calls its exit and nothing else can
// be current at the same time.
//
// STATE NAMES ARE PROVISIONAL. Dormant / Alert / Approach / Anticipate / Strike /
// Recover / Search / Withdraw are working names pending the GLOSSARY.md entries
// the user authors. They live in exactly two places — the STATES map below and
// the enemyStates/ filenames — and nothing outside this directory references them
// yet, so renaming is a find-and-replace plus the glossary.
//
// Nothing calls this yet. `USE_STATE_SPINE` is false and the legacy ladder in
// Enemy.update() is still the live path; the parity harness is the only consumer
// until it proves the two agree across all 56 enemies.
import dormant from './enemyStates/dormant.js';
import alert from './enemyStates/alert.js';
import approach from './enemyStates/approach.js';
import anticipate from './enemyStates/anticipate.js';
import strike from './enemyStates/strike.js';
import recover from './enemyStates/recover.js';
import search from './enemyStates/search.js';
import withdraw from './enemyStates/withdraw.js';

// Flipping this is commit 5, and only once the parity harness is green.
export const USE_STATE_SPINE = false;

export const STATES = { dormant, alert, approach, anticipate, strike, recover, search, withdraw };

// Where a transition lands when its target State is not one this enemy declares.
//
// This is the skip semantics: an undeclared State is not an error and not a
// dead-end, it is simply absent, and the runner walks forward until it finds
// something declared. Each list is ordered by what the absence *means* — an
// enemy with no Anticipate has no hesitation before a strike (today's behavior
// for all 56), and an enemy with no Search does not investigate, so losing
// contact means disengaging rather than standing still.
const FALLBACK = {
  dormant:    ['alert'],
  alert:      ['approach'],
  approach:   ['alert'],
  anticipate: ['strike'],
  strike:     ['approach'],
  recover:    ['approach'],
  search:     ['withdraw', 'alert'],
  withdraw:   ['alert'],
};

// Conditions that preempt whatever State is current, in the order they are
// tested. This replaces ten hand-ordered early returns in `Enemy.update()` whose
// precedence was encoded as nothing but source-line position.
//
// `hard: true` means the interrupt wins even against a committed State. Damage
// is the soft case — a committed Strike absorbs it and swings anyway — while
// being frozen mid-swing is not something commitment should survive. That
// distinction is the generalization of `DAGGER_INTERRUPTIBLE` in SniperMechanic,
// which is the codebase's only existing interruptibility declaration.
export const INTERRUPTS = [
  { id: 'frozen',  hard: true,  test: (e) => e.frozen || e.freezeTimer > 0 },
  { id: 'stunned', hard: true,  test: (e) => e.stunTimer > 0 },
  { id: 'asleep',  hard: true,  test: (e) => e.sleepTimer > 0 },
  { id: 'knocked', hard: true,  test: (e) => e.knockbackTimer > 0 },
  { id: 'carried', hard: true,  test: (e) => e.carriedBySpear },
];

const LOG_SIZE = 10;

export class EnemyStateMachine {
  // `declared` is the enemy's states block — the per-enemy data that says which
  // States it uses and how. A State absent from it is skipped; a State present
  // with an empty config uses that State's own defaults.
  constructor(enemy, declared) {
    this.declared = declared ?? {};
    // Start dormant if the enemy declares it, otherwise the first thing forward
    // of it that exists. An ambusher's whole identity is that it starts asleep;
    // everything else opens its eyes already.
    this.current = this.resolve('dormant') ?? 'alert';
    this.timer = 0;
    this.elapsed = 0;
    // A bounded ring the sandbox reads for its transition log. The machine owns
    // it so nothing has to be added to Enemy.js to make transitions observable —
    // EnemyDebug's console STATE line fires once per frame at the end of
    // update(), which collapses intra-frame transitions and records no cause.
    this.log = [];
    this.interrupt = null;
    STATES[this.current]?.enter?.(enemy, null, this);
  }

  // The config an enemy authored for a State, or null if it does not declare it.
  configFor(id) {
    return this.declared[id] ?? null;
  }

  has(id) {
    return this.declared[id] != null;
  }

  // Walk forward from `id` until a declared State turns up. Returns null only if
  // the enemy declares nothing reachable from here, which the caller reads as
  // "stay put" rather than as an error.
  resolve(id, seen = new Set()) {
    if (id == null || seen.has(id)) return null;
    if (this.has(id)) return id;
    seen.add(id);
    for (const next of FALLBACK[id] ?? []) {
      const found = this.resolve(next, seen);
      if (found) return found;
    }
    return null;
  }

  // `cause` is recorded, not just the destination — "why did it stop chasing" is
  // the question the log exists to answer, and a bare from→to cannot answer it.
  transition(enemy, ctx, to, cause) {
    const target = this.resolve(to);
    if (!target || target === this.current) return false;
    STATES[this.current]?.exit?.(enemy, ctx, this);
    this.log.push({ from: this.current, to: target, cause, elapsed: this.elapsed });
    if (this.log.length > LOG_SIZE) this.log.shift();
    this.current = target;
    this.timer = 0;
    STATES[target]?.enter?.(enemy, ctx, this);
    return true;
  }

  // Evaluated before any State update, which is what fixes the ordering bugs the
  // legacy ladder has: leap triggers currently run *above* every status guard, so
  // a stunned enemy completes a leap, and windupTimer ticks above them too, so a
  // stunned enemy transitions windup→attack and is then overwritten.
  checkInterrupts(enemy) {
    const committed = this.isCommitted();
    for (const it of INTERRUPTS) {
      if (!it.test(enemy)) continue;
      if (committed && !it.hard) continue;
      return it;
    }
    return null;
  }

  isCommitted() {
    const state = STATES[this.current];
    const cfg = this.configFor(this.current);
    return cfg?.committed ?? state?.committed ?? false;
  }

  // `ctx` carries the per-frame facts every State needs and none of them should
  // recompute: distance, the effective ranges after status/terrain modifiers,
  // whether vision is clear, and the speed multiplier.
  update(enemy, dt, ctx) {
    this.timer += dt;
    this.elapsed += dt;

    const hit = this.checkInterrupts(enemy);
    if (hit) {
      // An interrupt does not change which State is current. That is what makes
      // dormancy survive a stun: today every status guard overwrites `'rest'`
      // with `'idle'`, permanently destroying an ambusher's ambush.
      this.interrupt = hit.id;
      enemy.targetVelocity.vx = 0;
      enemy.targetVelocity.vy = 0;
      return;
    }
    this.interrupt = null;

    const state = STATES[this.current];
    state?.update?.(enemy, ctx, this);
    const to = state?.next?.(enemy, ctx, this);
    if (to) this.transition(enemy, ctx, to.id ?? to, to.cause ?? 'condition');
  }

  // Every distance threshold this enemy actually uses, for the sandbox's range
  // rings. Returned as data so the sandbox stays schema-agnostic — it draws what
  // it is handed rather than knowing which archetype has which parameters.
  thresholds(enemy) {
    const out = [];
    for (const id of Object.keys(this.declared)) {
      const from = STATES[id]?.thresholds?.(enemy, this.configFor(id), this);
      if (from) out.push(...from);
    }
    return out;
  }
}
