// StatusEffects — the one Status Effect model the player and every enemy
// share (GLOSSARY: Status Effect, Pip). One declaration table, one apply, one
// tick, one clear. The carrier layers on top only add what is genuinely
// carrier-specific:
//   - EnemyStatusEffects.js — DoT damage straight to hp, freeze's frozen/
//     shudder sub-states, the stun/zap item jolt.
//   - StatusEffectSystem.js — DoT damage through takeDamage (immunity and
//     i-frames), Frozen and the struggle out of it, the pip speed tables.
//
// Before this, the player tracked burn/poison/wet as loose fields with their
// own apply methods, held four other statuses in a separate table, and the
// enemy had a third shape again. Sources written against one side silently
// no-op'd on the other (#166: potions, steam scald, and poisoned water never
// burned or poisoned the player), and the two tick loops disagreed on rules
// nobody had decided (enemy DoT re-application reset the tick timer, so an
// enemy standing in poisoned water re-applied poison every frame and never
// took a tick).
//
// Where the two carriers still differ, the difference is data in the table
// below — side by side, where it can be seen and decided on — not a second
// code path.

export const MAX_PIPS = 3; // every stackable effect's Pip cap

// Movement multiplier per zap pip, shared by both carriers. Pip 3 is the
// lock — the carrier layers stop movement outright there.
export const ZAP_PIP_SPEED = [1, 0.6, 0.35, 0];

// Seconds each zap pip below the hit's own takes to drain (the cooldown).
const ZAP_PIP_DECAY = 1.0;

// Every Status Effect, and the fields each carrier's slot starts with. A
// carrier missing from an entry can't carry that effect: applying it is an
// authoring error and says so, once. All slots also get `active`/`duration`.
//
//   stacks         — Pip track (0–3). Present = the effect counts pips.
//   damage/tickRate/tickTimer — damage over time: `damage` every `tickRate`s.
//   stackTickRate  — tickRate becomes stackTickRate / pips (poison speeds up).
//   decayInterval  — on expiry, lose one pip and buy this much more time
//                    instead of falling off all at once.
//   durationPerStack — the applied duration is multiplied by the pip count.
//                    The default stage for any Pip track with no stage
//                    mechanic of its own: each pip makes it last longer.
//   immunity       — carrier field that refuses the effect outright.
//   cooldown       — while active, the effect can't be re-applied: its pips
//                    are a cooldown draining toward the next application.
const STATUS_EFFECTS = {
  burn: {
    // Enemy burn's first ignite lasts at least 5s — the slot's original
    // starting duration, kept as-is.
    enemy: { duration: 5, damage: 1, tickRate: 1.25, tickTimer: 0, stacks: 0, durationPerStack: true }, // ~4 ticks of 1 over 5s
    player: { damage: 1, tickRate: 1.5, tickTimer: 0, stacks: 0, durationPerStack: true }
  },
  poison: {
    // Each pip ticks faster, and pips drain one at a time. Same stages on
    // both sides; the player keeps its own faster pip-1 rate.
    enemy: { damage: 1, tickRate: 3.0, tickTimer: 0, stacks: 0, stackTickRate: 3.0, decayInterval: 3.0 },
    player: { damage: 1, tickRate: 1.5, tickTimer: 0, stacks: 0, stackTickRate: 1.5, decayInterval: 3.0 }
  },
  freeze: {
    // Enemy: one ice hit slows; ExtraOnHitEffects flips `frozen` for the full
    // lock. Player: pips 1–2 slow, pip 3 is Frozen (StatusEffectSystem).
    enemy: { slowAmount: 0.5, frozen: false, shuddering: false, stacks: 0 },
    player: { stacks: 0 },
    immunity: 'freezeImmune'
  },
  // Stun: a lock + disarm, on both sides. `disarm` (player) marks a held
  // item waiting to be knocked loose (StatusEffectSystem.applyPlayerDisarm).
  stun: { enemy: { stacks: 0, durationPerStack: true }, player: { stacks: 0, disarm: false, durationPerStack: true } },
  // Electric Pip track: pips 1–2 slow (ZAP_PIP_SPEED), pip 3 locks and
  // disarms. Once zapped, a body can't be zapped again until the pips drain:
  // the hit's pip holds for its duration, then one pip per ZAP_PIP_DECAY.
  // Wet holds the timer, and a zapped carrier is itself a live source one
  // pip weaker (ElectricitySystem.updateImbuedCurrent).
  zap: {
    enemy: { stacks: 0, decayInterval: ZAP_PIP_DECAY, cooldown: true },
    player: { stacks: 0, disarm: false, decayInterval: ZAP_PIP_DECAY, cooldown: true }
  },
  sleep: { enemy: { stacks: 0, durationPerStack: true } }, // tiers read by Enemy.isFullyAsleep/getSpeedMultiplier
  charm: { enemy: { stacks: 0, durationPerStack: true } },
  wet: { enemy: { stacks: 0 }, player: { stacks: 0 } }, // pips synced to wetPipCount (PhysicsSystem)
  knockback: { enemy: {} },
  // Enemy: attacks miss (0 damage). Player: a Pip track — each pip closes
  // vision in tighter (the cave-fog overlay — drawVisionFogOverlay in
  // torchLight.js).
  blind: { enemy: {}, player: { stacks: 0 } },
  dizzy: { enemy: { stacks: 0, durationPerStack: true }, player: { stacks: 0, durationPerStack: true } },
  goo: {
    enemy: { slowAmount: 0.8, stacks: 0, durationPerStack: true },
    player: { slowAmount: 0.8, stacks: 0, durationPerStack: true }, // heavy slow + prevents dodge roll
    immunity: 'slimeImmune'
  },
  slimeBoost: { player: { speedMult: 2.0 } } // slime puddle while wearing the slime suit; matches the slime enemy's 2x
};

// Which carrier built each table, so clear/tick can restore the right
// defaults without every caller having to say.
const tableCarrier = new WeakMap();

// One console.error per carrier+effect, not one per frame.
const unsupportedWarned = new Set();

/** A fresh `statusEffects` table for `carrier` ('player' | 'enemy'). */
export function createStatusEffects(carrier) {
  const table = {};
  for (const [name, decl] of Object.entries(STATUS_EFFECTS)) {
    if (decl[carrier]) table[name] = { active: false, duration: 0, ...decl[carrier] };
  }
  tableCarrier.set(table, carrier);
  return table;
}

// Removes an effect from the enemy's round-robin blink/pip order. Carriers
// without an order (the player) are a no-op. StatusEffectVisuals also
// live-filters by `.active` as a backstop.
export function clearEffectOrder(entity, effect) {
  const order = entity.effectApplicationOrder;
  if (!order) return;
  const idx = order.indexOf(effect);
  if (idx !== -1) order.splice(idx, 1);
}

/**
 * Apply `effect` for `duration`. Returns the slot, or null if the entity can't
 * carry it (or is immune, or it's a cooldown effect still running). `pips` raises the Pip track to at least that level
 * — the shape for per-frame refreshers and all-at-once hits; without it a
 * stackable effect gains one pip per application. Duration is last-hit-wins
 * (Math.max), never additive.
 */
export function applyStatusEffect(entity, effect, duration = 3.0, pips = null) {
  const slot = entity.statusEffects?.[effect];
  if (!slot) {
    const carrier = tableCarrier.get(entity.statusEffects) ?? entity.constructor?.name;
    const key = `${carrier}:${effect}`;
    if (!unsupportedWarned.has(key)) {
      unsupportedWarned.add(key);
      console.error(
        `[status-effects] ${carrier} can't carry '${effect}' — applyStatusEffect('${effect}') no-ops. ` +
        `Declare it for this carrier in STATUS_EFFECTS (StatusEffects.js) or route the source elsewhere (known-bugs #166).`
      );
    }
    return null;
  }

  const immunity = STATUS_EFFECTS[effect]?.immunity;
  if (immunity && entity[immunity]) return null;
  // A cooldown effect refuses re-application until it has fully drained.
  if (slot.cooldown && slot.active) return null;

  const wasActive = slot.active;
  slot.active = true;
  // A DoT's first tick lands one tickRate after it starts; re-applying while
  // it's already burning doesn't push the next tick back.
  if (slot.tickRate !== undefined && !wasActive) slot.tickTimer = slot.tickRate;

  if (slot.stacks !== undefined) {
    slot.stacks = pips == null
      ? Math.min(MAX_PIPS, slot.stacks + 1)
      : Math.max(slot.stacks, Math.min(MAX_PIPS, pips));
    if (slot.stackTickRate !== undefined) {
      slot.tickRate = slot.stackTickRate / Math.max(1, slot.stacks);
      // A pip that speeds the DoT up doesn't wait out the slower timer.
      slot.tickTimer = Math.min(slot.tickTimer, slot.tickRate);
    }
    if (!wasActive && entity.effectApplicationOrder) entity.effectApplicationOrder.push(effect);
  }

  const effectiveDuration = slot.durationPerStack && slot.stacks ? duration * slot.stacks : duration;
  slot.duration = Math.max(slot.duration, effectiveDuration);
  return slot;
}

/**
 * End `effect` now: inactive, zero time, zero pips, every other field back to
 * the carrier's declared default. Safe on any entity and any effect name.
 */
export function clearStatusEffect(entity, effect) {
  const slot = entity.statusEffects?.[effect];
  if (!slot) return;
  const defaults = STATUS_EFFECTS[effect]?.[tableCarrier.get(entity.statusEffects)];
  if (defaults) Object.assign(slot, defaults);
  slot.active = false;
  slot.duration = 0;
  if (slot.stacks !== undefined) slot.stacks = 0;
  if (slot.tickTimer !== undefined) slot.tickTimer = 0;
  clearEffectOrder(entity, effect);
}

/**
 * Count every active effect down by `deltaTime`: DoT ticks, pip decay, expiry.
 * Returns the DoT ticks that fired as `[{ effect, damage }]` — resolving them
 * into damage is the carrier's job. Optional `hooks` let a carrier bend the
 * countdown for one of its own sub-states:
 *   holdsTimer(effect, slot) — true = don't count this one down this frame
 *   afterCountdown(effect, slot) — runs after the countdown, before expiry
 *   onExpire(effect, slot) — runs just before the slot is cleared
 */
export function tickStatusEffects(entity, deltaTime, hooks = {}) {
  const dotTicks = [];
  for (const [effect, slot] of Object.entries(entity.statusEffects)) {
    if (!slot.active) continue;

    if (!hooks.holdsTimer?.(effect, slot)) slot.duration -= deltaTime;

    if (slot.tickRate !== undefined) {
      slot.tickTimer -= deltaTime;
      if (slot.tickTimer <= 0) {
        slot.tickTimer = slot.tickRate;
        dotTicks.push({ effect, damage: slot.damage });
      }
    }

    hooks.afterCountdown?.(effect, slot);
    if (slot.duration > 0) continue;

    if (slot.decayInterval !== undefined && slot.stacks > 1) {
      slot.stacks -= 1;
      if (slot.stackTickRate !== undefined) slot.tickRate = slot.stackTickRate / slot.stacks;
      slot.duration = slot.decayInterval;
      continue;
    }
    hooks.onExpire?.(effect, slot);
    clearStatusEffect(entity, effect);
  }
  return dotTicks;
}
