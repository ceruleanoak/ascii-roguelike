// StatusEffectVisuals — computes the enemy glyph's round-robin status blink
// color and the stack-count pip rows drawn above it (StatusPipEffects.js).
// Split out of Enemy.js to keep that file under its architecture budget and
// to give the multi-effect visual language (round-robin blink, generic
// stack-driven blink speed) one home instead of a hand-duplicated fixed
// priority chain.

const DOT_BLINK_FREQUENCY = 0.2; // baseline blink period at 1 stack
const SLICE_DURATION = 0.6; // seconds each active effect gets the blink "turn"

// Representative "on" color per blink-capable effect — used both for the
// round-robin blink target and the stack-pip dots. Sleep's color depends on
// tier (see computeBlinkColor/computePipRows below) so it isn't listed here.
const EFFECT_COLORS = {
  burn: '#ff4400',
  poison: '#88ff00',
  zap: '#00ffff',
  stun: '#ffff00',
  charm: '#ff44ff',
  freeze: '#aaffff',
  wet: '#4488ff',
  dizzy: '#ddbb00'
};

const SLEEP_COLOR = '#ff66cc'; // pink, all three drowse tiers

// Live-filters effectApplicationOrder to effects that are still actually
// active — defensive against any bypass that flips `.active` directly
// without going through Enemy.applyStatusEffect (e.g. PhysicsSystem.js's
// water-extinguishes-burn), which would otherwise leak a stale entry into
// the round-robin/pip list forever.
function _activeOrderedEffects(enemy) {
  return enemy.effectApplicationOrder.filter(effect => enemy.statusEffects[effect]?.active);
}

// An enemy's glyph can only show one color at a time, so when multiple
// blink-capable effects are active simultaneously the blink round-robins
// between them in fixed time slices — giving each a turn instead of a fixed
// priority chain hiding everything but the "loudest" effect. With only one
// effect active this degenerates to exactly the old single-effect behavior.
export function computeBlinkColor(enemy) {
  const active = _activeOrderedEffects(enemy);
  if (active.length === 0) return null;

  const sliceIndex = Math.floor(enemy.dotBlinkTimer / SLICE_DURATION) % active.length;
  const effect = active[sliceIndex];
  const status = enemy.statusEffects[effect];
  const stacks = Math.max(1, status.stacks || 1);

  // Drowse tiers: 1 = slow blink, 2 = rapid blink, 3 = solid held (no blink at
  // all) — the one effect whose blink speed isn't the shared stacks formula,
  // since "solid at max stacks" is the user's explicit ask for full sleep.
  if (effect === 'sleep') {
    if (stacks >= 3) return SLEEP_COLOR;
    const period = stacks >= 2 ? 0.08 : 0.4;
    const blinkCycle = Math.floor(enemy.dotBlinkTimer / period);
    return blinkCycle % 2 === 0 ? SLEEP_COLOR : enemy.baseColor;
  }

  if (effect === 'freeze') {
    if (status.frozen) {
      if (status.shuddering) {
        // Rapid shudder flash between ice-white and ice-blue before breaking free
        const shudderCycle = Math.floor(enemy.dotBlinkTimer / 0.06);
        return shudderCycle % 2 === 0 ? '#ffffff' : '#aaffff';
      }
      return '#aaffff'; // Solid ice color — fully locked
    }
    // Puddle/slime slow: subtle cyan blink, stack-scaled like every other effect
    const period = DOT_BLINK_FREQUENCY / stacks;
    const blinkCycle = Math.floor(enemy.dotBlinkTimer / period);
    return blinkCycle % 2 === 0 ? '#00ffff' : enemy.baseColor;
  }

  // Every other blink-capable effect shares one frequency formula — more
  // stacks blinks faster, uniformly, rather than special-casing poison.
  const period = DOT_BLINK_FREQUENCY / stacks;
  const blinkCycle = Math.floor(enemy.dotBlinkTimer / period);
  return blinkCycle % 2 === 0 ? EFFECT_COLORS[effect] : enemy.baseColor;
}

// Returns [{effect, color, stacks}, ...] for every active blink-capable
// effect with at least 1 stack, in application order (oldest first).
// StatusPipEffects.js stacks rows upward from this order — first-applied
// closest to the glyph.
export function computePipRows(enemy) {
  const rows = _activeOrderedEffects(enemy)
    .map(effect => {
      const stacks = enemy.statusEffects[effect].stacks || 0;
      if (stacks < 1) return null;
      const color = effect === 'sleep' ? SLEEP_COLOR : EFFECT_COLORS[effect];
      return { effect, color, stacks };
    })
    .filter(Boolean);

  // Lava contact (PhysicsSystem.applyLiquidResults) reads as burning even
  // when the real burn DOT isn't active — lava deals its own damage tick, so
  // this is purely the visual signal, not a second damage source. Skipped
  // when burn is already actively tracked above to avoid a duplicate row.
  if (enemy.inDamagingLiquid && !enemy.statusEffects.burn?.active) {
    rows.push({ effect: 'burn', color: EFFECT_COLORS.burn, stacks: 1 });
  }

  return rows;
}

// Player-side counterpart to computePipRows, feeding the same
// StatusPipEffects.js renderer. The player doesn't stack effects or track
// per-effect application order the way Enemy.js does (no `stacks` field, no
// effectApplicationOrder), so this is a fixed-priority list of 1-dot rows
// instead of a generic stack-driven one. Reuses EFFECT_COLORS for the
// effects whose meaning matches the enemy version exactly (burn, poison,
// wet, dizzy); freeze and goo get their own colors because the player's
// "freeze" (statusEffects.freeze) is always the slow tier — matching the
// enemy's puddle-slow cyan, never the full ice-lock EFFECT_COLORS.freeze
// represents — and goo has no enemy equivalent at all, so its color mirrors
// the player's own gooey blink in Player.getDisplayColor().
const PLAYER_EFFECT_COLORS = {
  wet: EFFECT_COLORS.wet,
  burn: EFFECT_COLORS.burn,
  poison: EFFECT_COLORS.poison,
  dizzy: EFFECT_COLORS.dizzy,
  freeze: '#00ffff',
  goo: '#00ff00'
};

const PLAYER_PIP_ORDER = ['wet', 'burn', 'poison', 'freeze', 'goo', 'dizzy'];

function _isPlayerEffectActive(player, effect) {
  switch (effect) {
    case 'wet':    return player.isWet();
    // isBurning() is the real burn DOT; inDamagingLiquid is lava contact,
    // which deals its own damage tick (see PhysicsSystem.applyLiquidResults)
    // but should still read as burning for the pip.
    case 'burn':   return player.isBurning() || player.inDamagingLiquid;
    case 'poison': return player.isPoisoned();
    case 'freeze': return player.isFrozen();
    case 'goo':    return player.isGooey();
    case 'dizzy':  return player.isDizzy();
    default: return false;
  }
}

export function computePlayerPipRows(player) {
  return PLAYER_PIP_ORDER
    .filter(effect => _isPlayerEffectActive(player, effect))
    .map(effect => ({ effect, color: PLAYER_EFFECT_COLORS[effect], stacks: 1 }));
}
