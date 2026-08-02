// Enemy schema — single source of truth for the editor form, defaults, and
// codegen. Field shapes mirror src/data/enemies.js exactly; keep this in sync
// when the game's enemy contract changes.
//
// Field descriptor:
//   { key, label, type, default, min, max, step, options, help, px, showIf }
//
// types:
//   'number'  — plain numeric input
//   'px'      — pixels; codegen factors out GRID.CELL_SIZE when divisible.
//               Form shows px with a "= N cells" hint.
//   'text'    — string
//   'char'    — single glyph (enemy char / spawn char etc.)
//   'bool'    — checkbox
//   'color'   — hex color picker + text
//   'select'  — one-of options[]; add `numeric: true` when the options are
//               numbers, so the stored value is the number and not its text
//   'tags'    — comma-separated string[] (free)
//   'tagset'  — multi-select from options[] -> string[]
//   'list'    — an array of uniform rows, described by `itemFields: [...]`;
//               add/remove/reorder in the form. A column is an ordinary field
//               descriptor whose `key` is relative to the row. Reach for this
//               over 'json' whenever the array's shape is actually known —
//               a row is then authored with real widgets and cannot be
//               malformed. Rows are emitted whole; columns are never pruned.
//   'json'    — raw JSON value (objects too irregular for a widget)
//
// `px: true` is implied by type 'px'. `showIf(def)` hides a field unless true —
// and codegen prunes a hidden field outright, because a field the archetype
// doesn't apply to is not part of that enemy.
// `rerender: true` re-renders the form after an edit (for fields other fields
// or a section note depend on). `default: null` on a number marks it optional,
// so an empty box stays unset instead of reading as 0. `reconcile(def)` repairs
// other fields this one just invalidated; return true if it changed anything.
//
// `default` MUST equal the value the game falls back to when the key is absent,
// because codegen prunes a key that equals its default — so a default that
// disagrees with the runtime silently retunes the enemy on the way out of the
// editor. Where the runtime fallback is derived from another field (keeper
// preferred range is `attackRange * 0.8`), write `default` as a function of the
// def and it is resolved wherever a default is read.
//
// `noPrune: true` marks a field the runtime has NO fallback for — absent, it
// reads `undefined` and NaNs the velocity. Such a key is always emitted while
// its `showIf` holds.
//
// Section descriptor extras:
//   gate / bareGate  — same contract as MECHANICS below: the section is a block
//                      that can be absent entirely, with a presence toggle.
//   emitDefaults     — codegen keeps default-valued keys inside the block. For
//                      an optional block a default is load-bearing: pruning
//                      `telegraph.area: 'box'` would leave `telegraph: {}`,
//                      which means "no shape" and silently reverts to the
//                      legacy visual.
//   note(def)        — live authoring feedback rendered under the fields.

import {
  AREA_OPTIONS, SIZE_OPTIONS, TURN_OPTIONS, animationOptionsFor, reconcileAnimation,
  telegraphNotes,
} from './telegraph.js';
import { GRID } from '../../../src/game/GameConfig.js';

// Imported, never restated. Every px default below is a multiple of it, and
// codegen divides by it to emit `GRID.CELL_SIZE * n` — so a copy that drifted
// from the game's would silently rescale every range in the catalog.
export const GRID_CELL = GRID.CELL_SIZE;

export const AFFINITY_OPTIONS = [
  'beast', 'venom', 'goo', 'humanoid', 'aberration', 'fire', 'ice',
  'undead', 'electric', 'aquatic', 'gemstone', 'dragon'
];

export const EFFECT_OPTIONS = [
  'burn', 'freeze', 'zap', 'poison', 'wet', 'goo', 'stun', 'sleep',
  'charm', 'blind', 'dizzy', 'physical'
];

// 'custom' means the standard attack pipeline no-ops and a Mechanic drives the
// strike entirely (the Sniper). It is a real authored value, not a placeholder —
// without it in the list the Sniper loads showing 'melee' and the first touch of
// the form rewrites the def.
export const ATTACK_TYPES = ['melee', 'ranged', 'magic', 'fire', 'sap', 'tongue', 'none', 'custom'];
export const PROJECTILE_TYPES = ['', 'arrow', 'rock', 'potion', 'magic', 'fire'];
export const MOVEMENT_STYLES = ['chaser', 'keeper', 'kiter', 'jumper', 'ambusher'];
export const IDLE_BEHAVIORS = ['wander', 'stationary'];
export const WINDUP_MOVEMENTS = ['stop', 'advance', 'retreat'];
export const TIER_OPTIONS = ['weak', 'normal', 'elite', 'boss'];
export const GAME_ANIMAL_ROLES = ['moose', 'rabbit'];
export const RECOVER_VARIANTS = ['retreat', 'stationary', 'jumpBack', 'knockback', 'lockPlayer', 'hide'];

// Every State id, for the two fields that name one as a transition target
// (`search.onAbandon`, `withdraw.to`). `EnemyStateMachine.resolve()` walks
// FALLBACK from whatever is named here, so any of the eight is a valid target
// even for an enemy that does not declare it directly.
export const STATE_IDS = ['dormant', 'alert', 'approach', 'anticipate', 'strike', 'recover', 'search', 'withdraw', 'flee', 'lookback', 'useTrap'];

// The movement-verb vocabulary a State's `movement` key selects from
// (enemyMovement.js VERBS). No blank option: `applyStateMovement` resolves an
// unrecognized verb — including '' — to `moveStill` outright, it does not fall
// through to whatever the State would otherwise have picked (only an absent
// *key* does that, via `??`, and a list row can't emit "absent", only a value —
// see the Strike bands section). Every row's movement is therefore a real,
// working verb, never a silent freeze standing in for "unset".
export const MOVEMENT_VERBS = ['close', 'hold', 'orbit', 'back', 'still', 'wander', 'lungeBack', 'flee'];

// What a thrown potion applies on impact. All four are shipped on the Alchemist,
// but only two of them do anything: `Player.applyStatusEffect` returns early for
// any effect the player has no slot for, and the player's slots are goo, freeze,
// slimeBoost, dizzy. `confusion` works because CombatSystem intercepts it before
// that call. `burn` and `poison` land nothing — known bug #166. They stay
// selectable because they are authored in enemies.js today; dropping them would
// make the Alchemist load showing the wrong effect. POTION_NO_OP is what the
// section note reads to say so at authoring time.
export const POTION_EFFECTS = ['freeze', 'confusion', 'burn', 'poison'];
export const POTION_NO_OP = new Set(['burn', 'poison']);

// Effects that `dropLastThrown` can turn into an ingredient on death, mirroring
// the map at main.js:3304. An effect missing from here drops nothing.
export const POTION_DROPS = new Set(['burn', 'freeze', 'poison', 'confusion']);

const isKeeperKiter = (d) => d.movementStyle === 'keeper' || d.movementStyle === 'kiter';

// ── SECTIONS ────────────────────────────────────────────────────────────────
// Three tiers, top to bottom:
//   1. Key data — identity + core combat stats, the essential definition of
//      the enemy.
//   2. Stateful data, in State-spine order (GLOSSARY "Enemy State": Dormant,
//      Alert, Approach, Anticipate, Strike, Recover, Search, Withdraw). Alert
//      alone has no dedicated section — it is just the archetype's wander,
//      nothing to tune. Every other State does: behavior (windupMovement /
//      windupImmune — Strike's own opening beat, not Anticipate's tell) +
//      movement (Approach archetype, plus the ambusher's Dormant wake) +
//      anticipate (the pre-strike tell) + telegraph (Strike's warned area) +
//      strike (distance bands) + recover (the post-strike window) + search
//      (last-known-position pursuit) + withdraw (disengaging on purpose).
//   3. Everything else — attributes that aren't tied to a specific State.
export const SECTIONS = [
  {
    id: 'identity',
    title: 'Identity',
    fields: [
      { key: 'char', label: 'Char (glyph)', type: 'char', default: 'r',
        help: 'Single Unicode char. Unifont renders it. Letters/digits OK for enemies.' },
      { key: 'name', label: 'Name', type: 'text', default: 'New Enemy' },
      { key: 'description', label: 'Description', type: 'text', default: '' },
      { key: 'spellDescription', label: 'Spell description', type: 'text', default: '',
        help: 'Short all-caps flavor for the spellbook entry.' },
      { key: 'tier', label: 'Tier', type: 'select', options: TIER_OPTIONS, default: 'normal' },
      { key: 'affinities', label: 'Affinities', type: 'tagset', options: AFFINITY_OPTIONS, default: ['beast'],
        help: 'Drives auto-immunity, loot/spawn tables. e.g. fire-affinity is auto burn-immune.' },
    ]
  },
  {
    id: 'core',
    title: 'Core combat',
    fields: [
      { key: 'hp', label: 'HP', type: 'number', min: 1, default: 3 },
      { key: 'speed', label: 'Speed (px/s)', type: 'number', min: 0, default: 60 },
      { key: 'damage', label: 'Damage', type: 'number', min: 0, default: 1 },
      { key: 'attackType', label: 'Attack type', type: 'select', options: ATTACK_TYPES, default: 'melee',
        help: "'custom' hands the whole strike to a mechanic — the standard windup/attack pipeline no-ops." },
      { key: 'attackRange', label: 'Attack range', type: 'px', default: GRID_CELL * 2 },
      { key: 'aggroRange', label: 'Aggro range', type: 'px', default: GRID_CELL * 8 },
      { key: 'attackCooldown', label: 'Attack cooldown (dbl-sec)', type: 'number', min: 0, step: 0.1, default: 1.5,
        help: 'Double-seconds (÷2 for real seconds). See ENEMY_TIMER_RATE.' },
      { key: 'attackWindup', label: 'Attack windup (dbl-sec)', type: 'number', min: 0, step: 0.1, default: 0.3 },
      { key: 'projectileType', label: 'Projectile type', type: 'select', options: PROJECTILE_TYPES, default: '',
        showIf: (d) => d.attackType === 'ranged',
        help: "For ranged: 'arrow' | 'rock' | 'potion' | blank (bullet)." },
      { key: 'isImpact', label: 'Impact (bypasses staff block)', type: 'bool', default: false },
    ]
  },
  {
    id: 'behavior',
    title: 'Behavior & decision',
    fields: [
      { key: 'decisionInterval', label: 'Decision interval (dbl-sec)', type: 'number', min: 0.05, step: 0.05, default: 0.5 },
      { key: 'idleBehavior', label: 'Idle behavior', type: 'select', options: IDLE_BEHAVIORS, default: 'wander' },
      { key: 'windupMovement', label: 'Windup movement', type: 'select', options: WINDUP_MOVEMENTS, default: 'stop' },
      { key: 'windupImmune', label: 'Windup immune (uninterruptible)', type: 'bool', default: false },
    ]
  },
  {
    id: 'movement',
    title: 'Movement archetype',
    fields: [
      { key: 'movementStyle', label: 'Movement style', type: 'select', options: MOVEMENT_STYLES, default: 'chaser' },
      // keeper / kiter — defaults mirror enemyMovement.moveKeeper / moveKiter exactly.
      { key: 'movementConfig.preferredRange', label: 'Preferred range', type: 'px',
        default: (d) => (d.attackRange ?? GRID_CELL * 2) * 0.8,
        showIf: isKeeperKiter,
        help: 'Unset falls back to attackRange × 0.8 (enemyMovement.moveKeeper).' },
      { key: 'movementConfig.rangeTolerance', label: 'Range tolerance', type: 'px', default: GRID_CELL * 1.5,
        showIf: isKeeperKiter },
      { key: 'movementConfig.retreatThreshold', label: 'Retreat threshold', type: 'px', default: GRID_CELL * 2,
        showIf: isKeeperKiter },
      { key: 'movementConfig.kiteDistance', label: 'Kite distance', type: 'px', default: GRID_CELL * 4,
        showIf: (d) => d.movementStyle === 'kiter' },
      { key: 'movementConfig.dive', label: 'Dive at player', type: 'bool', default: true,
        showIf: isKeeperKiter },
      // jumper — JumpMechanic has no numeric fallback for interval/speed/duration
      // (they chain to legacy `jumpBehavior`, then to undefined, which NaNs the
      // jump velocity), so those three are noPrune.
      { key: 'movementConfig.jumpInterval', label: 'Jump interval (dbl-sec)', type: 'number', min: 0.1, step: 0.1, default: 1.2,
        noPrune: true, showIf: (d) => d.movementStyle === 'jumper' },
      { key: 'movementConfig.jumpSpeed', label: 'Jump speed (px/s)', type: 'number', default: 220,
        noPrune: true, showIf: (d) => d.movementStyle === 'jumper' },
      { key: 'movementConfig.jumpDuration', label: 'Jump duration (dbl-sec)', type: 'number', min: 0.05, step: 0.05, default: 0.35,
        noPrune: true, showIf: (d) => d.movementStyle === 'jumper' },
      { key: 'movementConfig.zigzagStrength', label: 'Zigzag strength (0-1)', type: 'number', min: 0, max: 1, step: 0.05, default: 0.75,
        showIf: (d) => d.movementStyle === 'jumper' },
      { key: 'movementConfig.arcHeight', label: 'Arc height (px)', type: 'number', default: 0,
        showIf: (d) => d.movementStyle === 'jumper',
        help: 'Purely visual parabolic lift, peaking mid-flight. 0 = flat hop.' },
      // Optional water overrides — a jumper crossing water swims instead of
      // hopping. Unset, each falls back to its land counterpart.
      { key: 'movementConfig.waterJumpInterval', label: 'Water jump interval (dbl-sec)', type: 'number', min: 0.1, step: 0.1, default: null,
        showIf: (d) => d.movementStyle === 'jumper' },
      { key: 'movementConfig.waterJumpSpeed', label: 'Water jump speed (px/s)', type: 'number', default: null,
        showIf: (d) => d.movementStyle === 'jumper' },
      { key: 'movementConfig.waterJumpDuration', label: 'Water jump duration (dbl-sec)', type: 'number', min: 0.05, step: 0.05, default: null,
        showIf: (d) => d.movementStyle === 'jumper' },
      // ambusher
      { key: 'movementConfig.wakeRadius', label: 'Wake radius', type: 'px', default: GRID_CELL * 4,
        showIf: (d) => d.movementStyle === 'ambusher' },
      { key: 'movementConfig.burstSpeed', label: 'Burst speed (px/s)', type: 'number',
        default: (d) => (d.speed ?? 60) * 2.5,
        showIf: (d) => d.movementStyle === 'ambusher',
        help: 'Unset falls back to speed × 2.5.' },
      { key: 'movementConfig.burstDuration', label: 'Burst duration (dbl-sec)', type: 'number', min: 0.1, step: 0.1, default: 1.0,
        showIf: (d) => d.movementStyle === 'ambusher' },
    ]
  },
  {
    // The pre-strike tell (anticipate.js). Absent by default — nothing
    // hesitates before striking today, so Approach resolves straight through
    // to Strike; the old `attackWindup`/`windupMovement` above are Strike's
    // own opening beat and a different thing entirely.
    id: 'anticipate', title: 'Anticipate (pre-strike tell)', gate: 'anticipate', bareGate: true,
    note: anticipateNotes,
    fields: [
      { key: 'anticipate.tell', label: 'Tell glyph', type: 'char', default: '',
        help: 'Shown via enemy.stateTell while the enemy hesitates. Blank = no glyph.' },
      { key: 'anticipate.duration', label: 'Duration (dbl-sec)', type: 'number', min: 0, step: 0.1, default: 0,
        help: "How long the tell holds before Strike. An enemy that never resolves without breakIf firing (duration: Infinity, e.g. a Trap Goblin that never commits to the rush) isn't authorable here yet — hand-edit enemies.js for that case." },
      { key: 'anticipate.committed', label: 'Committed (uninterruptible)', type: 'bool', default: false,
        help: 'Off: the enemy can be punished for visibly hesitating. On: the hesitation is safe.' },
      { key: 'anticipate.requirePack', label: 'Require pack (min ready)', type: 'number', min: 1, step: 1, default: null,
        help: 'Minimum enraged packmates, including self, before Strike is allowed. Needs Pack coordination (Interaction flags) so enemy.packmates is actually populated.' },
      { key: 'anticipate.breakIf.targetLost', label: 'Break if target lost', type: 'bool', default: false,
        help: 'Break back to Approach if line of sight is lost mid-tell.' },
      { key: 'anticipate.breakIf.outOfBand', label: 'Break if out of band', type: 'bool', default: false,
        help: 'Break back to Approach if the target leaves attackRange mid-tell.' },
    ]
  },
  {
    // The projected warning Area of the melee windup, plus the animation whose
    // beats define when damage lands (GLOSSARY "Telegraph"). Optional: absent,
    // the enemy keeps the legacy single-rect windup, so the whole block is
    // presence-gated rather than defaulted on.
    id: 'telegraph',
    title: 'Telegraph',
    gate: 'telegraph',
    bareGate: true,
    emitDefaults: true,
    note: telegraphNotes,
    fields: [
      { key: 'telegraph.area', label: 'Area', type: 'select', options: AREA_OPTIONS,
        default: 'box', rerender: true, reconcile: reconcileAnimation,
        help: 'The warned region — a named warn/hit shape pair from AREA_PRESETS. (none) = author explicit shapes below.' },
      { key: 'telegraph.size', label: 'Size', type: 'select', options: SIZE_OPTIONS,
        default: '', rerender: true,
        help: 'box / circle / trapezoid only. Blank = small, one cell of ground. big is the AoE. The slices and the ring carry fixed dimensions and ignore this.' },
      { key: 'telegraph.animation', label: 'Animation', type: 'select', options: animationOptionsFor,
        default: 'blink', rerender: true,
        help: 'Choreography + beats, filtered to the ones the chosen Area supports. Declaring one compiles its own pulses. Blank = blink (the legacy four-phase look).' },
      { key: 'telegraph.attackShape', label: 'Attack shape', type: 'char', default: '', rerender: true,
        help: "One character the strike carries instead of the default hairline stroke, turned to face the swing (e.g. '/'). Blank = the stroke." },
      { key: 'telegraph.attackShapeTurn', label: 'Attack shape turn', type: 'select',
        options: TURN_OPTIONS, numeric: true, default: '', rerender: true,
        help: 'Quarter-turn of that glyph within the strike, in degrees — for characters that point somewhere, like a brace that should open up rather than sideways. Blank = upright.' },
      { key: 'telegraph.attackShapeCount', label: 'Attack shape count', type: 'number',
        min: 0, default: null, rerender: true,
        help: 'How many copies of that glyph the strike carries — teeth spaced around the ring for revolve (each one a full-size arc that damages), or how densely a radiating circle is sampled. Blank = each animation\'s own reading (one per mark, a character-width spacing round a circle).' },
      { key: 'telegraph.beatDamage', label: 'Beat damage ×', type: 'json', default: null, rerender: true,
        placeholder: '[1.0, 0.5]',
        help: 'One damage multiplier per beat, e.g. [1.0, 0.5]. Multi-beat animations only.' },
      { key: 'telegraph.warnShape', label: 'Warn shape (explicit)', type: 'json', default: null, rerender: true,
        placeholder: '{"kind":"rect","length":2,"width":2.5}',
        help: "Overrides the Area's warn shape. Dimensions are in cells. offset = cells out along facing. Kinds: rect, trapezoid, circle, ring, cone." },
      { key: 'telegraph.hitShape', label: 'Hit shape (explicit)', type: 'json', default: null, rerender: true,
        placeholder: '{"kind":"cone","angleDeg":60,"range":3}',
        help: "Overrides the Area's hit shape. Defaults to the warn shape when absent." },
      { key: 'telegraph.pulses', label: 'Pulses (no animation)', type: 'list', default: null, rerender: true,
        emptyLabel: '(no pulses — single hit)',
        help: 'Hand-authored rhythm for the animation-less form; delays are double-seconds. Conflicts with an animation. Row 1 is the activation hit.',
        itemFields: [
          { key: 'delay', label: 'Delay (dbl-sec)', type: 'number', step: 0.1, default: 0,
            help: 'Double-seconds after the activation hit. Row 1 is the hit itself, so its delay is 0.' },
          { key: 'damageMult', label: 'Damage ×', type: 'number', step: 0.1, default: 1 },
        ] },
    ]
  },
  {
    // The post-strike vulnerability window (recover.js). Absent entirely means
    // chaser/keeper archetypes still get the runtime's own retreat fallback
    // (stateDefaults.js) — this block only needs seeding to pick a different
    // variant, or to tune duration/speed on the default retreat.
    id: 'recover', title: 'Recover (post-strike window)', gate: 'recover', bareGate: true,
    fields: [
      { key: 'recover.variant', label: 'Variant', type: 'select', options: RECOVER_VARIANTS, default: 'retreat' },
      { key: 'recover.duration', label: 'Duration (dbl-sec)', type: 'number', min: 0, step: 0.1, default: 0.4 },
      { key: 'recover.speed', label: 'Speed (px/s or ×)', type: 'number', min: 0, step: 0.1, default: 0.5,
        help: 'Meaning depends on variant: retreat/jumpBack walk speed, knockback recoil speed. Unused by stationary/lockPlayer/hide.' },
    ]
  },
  {
    // Distance-banded attacks (strike.js `bands`). Empty by default — the
    // enemy strikes once, at the top-level attackRange/attackWindup/
    // attackCooldown. Authoring bands generalizes the five bespoke
    // distance-banded attacks already open-coded elsewhere in the roster
    // (LakeBoss, GooDragon, GooHead, Sniper, Giant Slime) into data.
    id: 'strike', title: 'Strike (distance bands)', gate: 'strike', bareGate: true,
    fields: [
      { key: 'strike.bands', label: 'Bands', type: 'list', default: [],
        emptyLabel: '(no bands — single attack at attackRange/attackWindup)',
        help: 'Evaluated nearest-first: the first band whose "within" contains the current distance wins, so author close-to-far. Picked once on entering Strike, not re-picked per frame.',
        itemFields: [
          { key: 'within', label: 'Within', type: 'px', default: GRID_CELL * 2 },
          { key: 'attack', label: 'Attack name', type: 'text', default: '',
            help: 'Authoring label only — shown on the sandbox range ring, not read by combat logic. The columns below are what actually differ per band.' },
          { key: 'windup', label: 'Windup (dbl-sec)', type: 'number', min: 0, step: 0.1, default: 0.3,
            help: "This band's own windup, overriding attackWindup while it's the picked band. Defaulted to a real number rather than 0 or attackWindup's own value — a list row is always emitted whole, key-for-key, so an unedited row would otherwise ship an instant, windup-less hit for that band." },
          { key: 'movement', label: 'Movement', type: 'select', options: MOVEMENT_VERBS, default: 'still',
            help: "This band's own verb while its windup is active. No inherit option — a list row always emits every column, so 'blank' would freeze the enemy (moveStill) rather than fall back to windupMovement." },
          { key: 'speed', label: 'Speed (px/s or ×)', type: 'number', step: 0.1, default: null },
          { key: 'damage', label: 'Damage', type: 'number', min: 0, step: 1, default: null,
            help: "This band's own damage, overriding getEffectiveDamage() while it's the picked band (Enemy.createMeleeAttack). Blank inherits the enemy's normal damage." },
          { key: 'knockback', label: 'Knockback (px/s)', type: 'number', min: 0, step: 10, default: null,
            help: "This band's own knockback, overriding the 300×knockbackMultiplier default. Blank inherits it." },
          { key: 'duration', label: 'Active duration (dbl-sec)', type: 'number', min: 0, step: 0.05, default: null,
            help: "How long this band's hitbox stays live once the windup ends, overriding the 0.30 default. Blank inherits it." },
        ] },
      { key: 'strike.duration', label: 'Post-windup duration (dbl-sec)', type: 'number', min: 0, step: 0.1, default: 0,
        help: "Extends the swing after the windup ends and before Recover, added to whichever windup was used (the picked band's, or attackWindup if no band matched)." },
    ]
  },
  {
    // Pursuit of the last known position after losing contact (search.js).
    // Every enemy already gets an empty Search — this block only tunes it
    // away from that State's own baked-in defaults, it does not turn Search
    // on or off.
    id: 'search', title: 'Search (last-known-position pursuit)', gate: 'search', bareGate: true,
    fields: [
      { key: 'search.moveDelay', label: 'Move delay (dbl-sec)', type: 'number', min: 0, step: 0.1, default: null,
        help: "Pause before setting off toward the mark. Unset falls back to the enemy's own memoryMoveDelay (1.0, not authorable here)." },
      { key: 'search.staleAfter', label: 'Stale after (dbl-sec)', type: 'number', min: 0, step: 0.1, default: null,
        help: 'How long a mark stays worth investigating. Unset applies two different literals depending on the moment read: 2.0 on entering Search (memory staleness), 5.0 when deciding whether to move on (search patience). Authoring a value here uses it for both.' },
      { key: 'search.abandonAfter', label: 'Abandon after (marks)', type: 'number', min: 1, step: 1, default: 1,
        help: 'Marks investigated and exhausted, not seconds, before the hunt is given up entirely.' },
      { key: 'search.onAbandon', label: 'On abandon → State', type: 'select', options: STATE_IDS, default: 'withdraw' },
    ]
  },
  {
    // Disengaging on purpose (withdraw.js). Absent by default — abandoning a
    // Search resolves straight to Alert, same as every enemy does today.
    // Authoring this only matters once something actually transitions here —
    // typically Search's onAbandon above.
    id: 'withdraw', title: 'Withdraw (disengaging)', gate: 'withdraw', bareGate: true,
    fields: [
      { key: 'withdraw.duration', label: 'Duration (dbl-sec)', type: 'number', min: 0, step: 0.1, default: 0 },
      { key: 'withdraw.to', label: 'Resolves to → State', type: 'select', options: STATE_IDS, default: 'alert' },
    ]
  },
  {
    // Running from a memory mark (flee.js). Wildcard: an enemy that declares
    // this but omits both Approach and Search has both of Alert's transition
    // doors fall through to it instead of hunting — the trap goblin's use.
    id: 'flee', title: 'Flee (running from a memory mark)', gate: 'flee', bareGate: true,
    note: fleeNotes,
    fields: [
      { key: 'flee.lookbackInterval', label: 'Lookback interval (dbl-sec)', type: 'number', min: 0, step: 0.5, default: 2,
        help: 'How often Flee hands off to the Lookback State to check whether the player can still see it. 2 dbl-sec ≈ every second at real speed. Running (moveFlee) already steers toward cover every frame; Lookback just confirms it worked.' },
      { key: 'flee.maxDuration', label: 'Max duration (dbl-sec)', type: 'number', min: 0, step: 0.5, default: 6,
        help: 'Safety net: gives up fleeing after this long even if the player is never lost.' },
      { key: 'flee.to', label: 'Resolves to → State', type: 'select', options: STATE_IDS, default: 'withdraw' },
    ]
  },
  {
    // The deliberate glance-back Flee hands off to on its lookbackInterval —
    // requires Flee itself (see fleeNotes: declaring Flee without this means
    // the glance-back FALLBACK silently resolves back to Flee's own current
    // state and never fires at all).
    id: 'lookback', title: 'Lookback (glance back while fleeing)', gate: 'lookback', bareGate: true,
    showIf: (d) => d.flee !== undefined,
    fields: [
      { key: 'lookback.pause', label: 'Pause (dbl-sec)', type: 'number', min: 0, step: 0.1, default: 0.4,
        help: "Held still once the glance-back confirms the player can't see it, before resuming Flee or (if Use Trap is declared) moving on to it." },
    ]
  },
  {
    // The cornered hold once Lookback confirms a barrier — paired with the
    // Trap layer Mechanic specifically (not every Flee/Lookback user; Bomb
    // flees and glances back but never lays a trap), since placing the trap
    // itself is that Mechanic's job, not this State's.
    id: 'useTrap', title: 'Use Trap (cornered, laying a trap)', gate: 'useTrap', bareGate: true,
    showIf: (d) => d.trapLayerMechanic?.enabled === true,
    fields: [
      { key: 'useTrap.clearAfter', label: 'Clear after (dbl-sec)', type: 'number', min: 0, step: 0.1, default: 1,
        help: 'Counts down after the Trap layer Mechanic places its trap, before breaking off.' },
      { key: 'useTrap.timeout', label: 'Timeout (dbl-sec)', type: 'number', min: 0, step: 0.5, default: 3,
        help: 'Safety net: breaks off even if no trap ever gets placed (Mechanic disabled or misconfigured).' },
      { key: 'useTrap.to', label: 'Resolves to → State', type: 'select', options: STATE_IDS, default: 'withdraw' },
    ]
  },
  // ── Everything else — not tied to a specific State ──────────────────────
  {
    id: 'visual',
    title: 'Visual',
    fields: [
      { key: 'color', label: 'Color', type: 'color', default: '#888888' },
    ]
  },
  {
    id: 'physics',
    title: 'Physics',
    fields: [
      { key: 'mass', label: 'Mass', type: 'number', min: 0.1, step: 0.1, default: 1,
        help: 'Inertia multiplier. 0.3 light, 5 heavy.' },
      { key: 'acceleration', label: 'Acceleration (px/s²)', type: 'number', min: 0, default: 600 },
      { key: 'knockbackMultiplier', label: 'Knockback multiplier', type: 'number', min: 0, step: 0.1, default: 1 },
      { key: 'knockbackResistance', label: 'Knockback resistance (0-1)', type: 'number', min: 0, max: 1, step: 0.05, default: 0,
        help: 'Fraction of incoming hit knockback absorbed. 1 = pinned in place (the training dummy on its stick).' },
    ]
  },
  {
    id: 'flags',
    title: 'Interaction flags',
    note: pacifistNotes,
    fields: [
      // The two flags that suppress whole systems rather than tune one. They sit
      // first because everything below them is conditional on the enemy actually
      // fighting or actually taking damage.
      { key: 'pacifist', label: 'Pacifist (never fights)', type: 'bool', default: false,
        help: 'Skips the aggro/chase/attack state machine entirely (Enemy.update). The enemy still moves — a mechanic has to drive it (gameAnimal, patrol).' },
      { key: 'isDummy', label: 'Dummy (takes no damage)', type: 'bool', default: false,
        help: 'takeDamage() zeroes the amount, so the enemy is indestructible and shows hit feedback only. The training post.' },
      { key: 'float', label: 'Float (over hazards)', type: 'bool', default: false },
      { key: 'lavaImmune', label: 'Lava immune', type: 'bool', default: false },
      { key: 'grassStealth', label: 'Grass stealth', type: 'bool', default: false },
      { key: 'shellCamouflage', label: 'Shell camouflage', type: 'bool', default: false },
      { key: 'waterAffinity', label: 'Water affinity (idle)', type: 'bool', default: false },
      { key: 'swimAffinity', label: 'Swim affinity', type: 'bool', default: false },
      { key: 'freezePermanent', label: 'Freeze permanent', type: 'bool', default: false },
      { key: 'packCoordination', label: 'Pack coordination', type: 'bool', default: false },
      { key: 'mistThicken', label: 'Mist thicken (cells)', type: 'number', min: 0, default: 0 },
    ]
  },
  {
    id: 'sap',
    title: 'Sap (drain)',
    showIf: (d) => d.attackType === 'sap',
    fields: [
      { key: 'sapDamage', label: 'Sap damage / tick', type: 'number', min: 0, default: 1 },
      { key: 'sapDamageInterval', label: 'Sap interval (dbl-sec)', type: 'number', min: 0.1, step: 0.1, default: 1.0 },
    ]
  },
  {
    id: 'elemental',
    title: 'Elemental affinity',
    fields: [
      { key: 'elementalAffinity.immunity', label: 'Immunity', type: 'tagset', options: EFFECT_OPTIONS, default: [] },
      { key: 'elementalAffinity.resistance', label: 'Resistance map', type: 'json', default: {},
        help: 'e.g. { "physical": 0.5 } — multiplier < 1 = takes less.' },
      { key: 'elementalAffinity.weakness', label: 'Weakness map', type: 'json', default: {},
        help: 'e.g. { "freeze": 2.0 } — multiplier > 1 = takes more.' },
    ]
  },
  {
    id: 'loot',
    title: 'Loot',
    note: lootNotes,
    fields: [
      // Default is the empty list, not null: LootSystem reads `drops && length`,
      // so an absent key and an authored empty list are the same instruction —
      // nothing fixed drops. Writing it that way lets codegen prune the marker
      // without the schema claiming a fallback the game doesn't have.
      { key: 'drops', label: 'Fixed drops', type: 'list', default: [], rerender: true,
        emptyLabel: '(none — loot comes from affinities + tier)',
        help: 'An explicit drop list, each rolled independently against its own chance (luck scales it). Only consulted when the affinity/tier generator has nothing to work with.',
        itemFields: [
          { key: 'char', label: 'Char', type: 'char', default: '',
            help: 'The ingredient or item glyph to drop. Anything that is neither is silently skipped.' },
          { key: 'chance', label: 'Chance (0-1)', type: 'number', min: 0, max: 1, step: 0.05, default: 1,
            help: 'Rolled on its own, so several rows can land from one kill. Luck multiplies it.' },
        ] },
    ]
  },
  {
    id: 'sfx',
    title: 'Audio (SFX)',
    fields: [
      { key: 'sfx.hit', label: 'Hit SFX', type: 'text', default: '' },
      { key: 'sfx.death', label: 'Death SFX', type: 'text', default: '',
        help: 'Single name, or comma list for random pick.' },
      { key: 'sfx.aggro', label: 'Aggro SFX', type: 'text', default: '',
        help: "Played the moment the enemy notices the player. Unset plays the shared 'aggro' cue." },
    ]
  },
];

// ── MECHANICS ───────────────────────────────────────────────────────────────
// The "more specific options" tier: every optional block gated by a presence
// toggle that isn't tied to a specific State. `gate` is the path that turns it
// on ('<key>.enabled' for most; bare presence for a few).
export const MECHANICS = [
  {
    id: 'chargeMechanic', title: 'Charge', gate: 'chargeMechanic.enabled',
    fields: [
      { key: 'chargeMechanic.chargeSpeed', label: 'Charge speed (px/s)', type: 'number', default: 300 },
      { key: 'chargeMechanic.chargeWindup', label: 'Windup (dbl-sec)', type: 'number', step: 0.1, default: 0.8 },
      { key: 'chargeMechanic.chargeDuration', label: 'Duration (dbl-sec)', type: 'number', step: 0.1, default: 0.5 },
      { key: 'chargeMechanic.cooldown', label: 'Cooldown (dbl-sec)', type: 'number', step: 0.1, default: 3 },
      { key: 'chargeMechanic.wallStunDuration', label: 'Wall stun (dbl-sec)', type: 'number', step: 0.1, default: 1.5 },
      { key: 'chargeMechanic.chargeRange', label: 'Charge range', type: 'px', default: GRID_CELL * 7 },
      { key: 'chargeMechanic.initialDelay', label: 'Initial delay (dbl-sec)', type: 'number', step: 0.1, default: 0 },
    ]
  },
  {
    id: 'spawning', title: 'Spawning', gate: 'spawning.enabled',
    fields: [
      { key: 'spawning.spawnChar', label: 'Spawn char', type: 'char', default: 'r' },
      { key: 'spawning.spawnCooldown', label: 'Cooldown (dbl-sec)', type: 'number', step: 0.1, default: 5 },
      { key: 'spawning.maxSpawns', label: 'Max active', type: 'number', default: 3 },
      { key: 'spawning.maxLifetimeSpawns', label: 'Max lifetime', type: 'number', default: 10 },
      { key: 'spawning.spawnRange', label: 'Spawn range', type: 'px', default: GRID_CELL * 2 },
      { key: 'spawning.spawnWindup', label: 'Windup (dbl-sec)', type: 'number', step: 0.1, default: 0.8 },
      { key: 'spawning.spawnCount', label: 'Spawn count', type: 'number', default: 1 },
      { key: 'spawning.spawnOnDeath', label: 'Spawn on death', type: 'bool', default: false },
      { key: 'spawning.spawnOnDeathCount', label: 'On-death count', type: 'number', default: 0 },
    ]
  },
  {
    id: 'itemUsage', title: 'Item usage', gate: 'itemUsage.enabled',
    fields: [
      { key: 'itemUsage.canPickup', label: 'Can pick up', type: 'bool', default: true },
      { key: 'itemUsage.pickupRange', label: 'Pickup range', type: 'px', default: GRID_CELL * 3 },
      { key: 'itemUsage.preferredItems', label: 'Preferred items', type: 'tags', default: [] },
      { key: 'itemUsage.useRange', label: 'Use range', type: 'px', default: GRID_CELL * 6 },
      { key: 'itemUsage.useCooldown', label: 'Use cooldown (dbl-sec)', type: 'number', step: 0.1, default: 1.5 },
      { key: 'itemUsage.maxItems', label: 'Max items', type: 'number', default: 1 },
      { key: 'itemUsage.dropOnDeath', label: 'Drop on death', type: 'bool', default: true },
      { key: 'itemUsage.useConsumablesAt', label: 'Use potions at HP frac', type: 'number', min: 0, max: 1, step: 0.05, default: 0.4 },
    ]
  },
  {
    id: 'spawnEquipment', title: 'Spawn equipment', gate: 'spawnEquipment',
    bareGate: true,
    fields: [
      { key: 'spawnEquipment.chance', label: 'Chance (0-1)', type: 'number', min: 0, max: 1, step: 0.05, default: 0.5 },
      { key: 'spawnEquipment.weapons', label: 'Weapons', type: 'tags', default: [] },
    ]
  },
  {
    id: 'parryMechanic', title: 'Parry', gate: 'parryMechanic.enabled',
    fields: [
      { key: 'parryMechanic.parryArcDegrees', label: 'Arc (deg)', type: 'number', default: 90 },
      { key: 'parryMechanic.parryDuration', label: 'Duration (dbl-sec)', type: 'number', step: 0.1, default: 0.5 },
      { key: 'parryMechanic.parryCooldown', label: 'Cooldown (dbl-sec)', type: 'number', step: 0.1, default: 2 },
      { key: 'parryMechanic.parryWindup', label: 'Windup (dbl-sec)', type: 'number', step: 0.1, default: 0.3 },
      { key: 'parryMechanic.reflectDamage', label: 'Reflect damage', type: 'bool', default: false },
      { key: 'parryMechanic.counterAttack', label: 'Counter attack', type: 'bool', default: false },
      { key: 'parryMechanic.chargeOnParry', label: 'Charge on parry', type: 'bool', default: false },
      { key: 'parryMechanic.parryColor', label: 'Parry color', type: 'color', default: '#ffffff' },
    ]
  },
  {
    id: 'reflectShield', title: 'Reflect shield', gate: 'reflectShield.enabled',
    fields: [
      { key: 'reflectShield.arcDegrees', label: 'Arc (deg)', type: 'number', default: 120 },
      { key: 'reflectShield.shieldDuration', label: 'Duration (dbl-sec)', type: 'number', step: 0.1, default: 1.5 },
      { key: 'reflectShield.shieldCooldown', label: 'Cooldown (dbl-sec)', type: 'number', step: 0.1, default: 2 },
      { key: 'reflectShield.reflectDamageBonus', label: 'Reflect dmg bonus', type: 'number', step: 0.1, default: 1 },
      { key: 'reflectShield.shieldPhaseMovement', label: 'Retreat while shielded', type: 'bool', default: false },
      { key: 'reflectShield.shieldColor', label: 'Shield color', type: 'color', default: '#88ccff' },
    ]
  },
  {
    id: 'rallyCall', title: 'Rally call (leader)', gate: 'rallyCall.enabled',
    fields: [
      { key: 'rallyCall.triggerDistance', label: 'Trigger distance', type: 'px', default: GRID_CELL * 5 },
      { key: 'rallyCall.cooldown', label: 'Cooldown (dbl-sec)', type: 'number', step: 0.1, default: 5 },
      { key: 'rallyCall.indicatorDuration', label: 'Indicator duration (dbl-sec)', type: 'number', step: 0.1, default: 1 },
      { key: 'rallyCall.indicatorChar', label: 'Indicator char', type: 'char', default: '!' },
      { key: 'rallyCall.indicatorColor', label: 'Indicator color', type: 'color', default: '#ff0000' },
      { key: 'rallyCall.followerBoostMultiplier', label: 'Follower boost ×', type: 'number', step: 0.1, default: 1.3 },
      { key: 'rallyCall.followerBoostDuration', label: 'Boost duration (dbl-sec)', type: 'number', step: 0.1, default: 3 },
    ]
  },
  {
    id: 'followLeader', title: 'Follow leader', gate: 'followLeader.enabled',
    fields: [
      { key: 'followLeader.formationRadius', label: 'Formation radius', type: 'px', default: GRID_CELL * 3 },
      { key: 'followLeader.nearPlayerRange', label: 'Near-player range', type: 'px', default: GRID_CELL * 2 },
      { key: 'followLeader.orbitSpeed', label: 'Orbit speed (rad/s)', type: 'number', step: 0.1, default: 1 },
    ]
  },
  {
    id: 'trailMechanic', title: 'Trail', gate: 'trailMechanic.enabled',
    fields: [
      { key: 'trailMechanic.trailType', label: 'Trail type', type: 'text', default: 'fire' },
      { key: 'trailMechanic.trailInterval', label: 'Interval (dbl-sec)', type: 'number', step: 0.1, default: 0.5 },
      { key: 'trailMechanic.trailDuration', label: 'Duration (dbl-sec)', type: 'number', step: 0.1, default: 3 },
      { key: 'trailMechanic.trailRadius', label: 'Radius', type: 'px', default: GRID_CELL * 1 },
    ]
  },
  {
    id: 'deathExplosion', title: 'Death explosion', gate: 'deathExplosion.enabled',
    fields: [
      { key: 'deathExplosion.projectileCount', label: 'Projectile count', type: 'number', default: 8 },
      { key: 'deathExplosion.projectileType', label: 'Projectile type', type: 'text', default: 'fire' },
      { key: 'deathExplosion.speed', label: 'Speed (px/s)', type: 'number', default: 150 },
      { key: 'deathExplosion.damage', label: 'Damage', type: 'number', default: 1 },
      { key: 'deathExplosion.deathDelay', label: 'Death delay (dbl-sec)', type: 'number', step: 0.1, default: 0 },
      { key: 'deathExplosion.spreadAngle', label: 'Spread angle (deg)', type: 'number', default: 360 },
    ]
  },
  {
    id: 'leapAttack', title: 'Leap attack', gate: 'leapAttack.enabled',
    fields: [
      { key: 'leapAttack.triggerRangeMin', label: 'Trigger range min', type: 'px', default: GRID_CELL * 3 },
      { key: 'leapAttack.triggerRangeMax', label: 'Trigger range max', type: 'px', default: GRID_CELL * 8 },
      { key: 'leapAttack.cooldown', label: 'Cooldown (dbl-sec)', type: 'number', step: 0.1, default: 4 },
      { key: 'leapAttack.windupTime', label: 'Windup (dbl-sec)', type: 'number', step: 0.1, default: 0.8 },
      { key: 'leapAttack.airTime', label: 'Air time (dbl-sec)', type: 'number', step: 0.1, default: 0.6 },
      { key: 'leapAttack.arcLift', label: 'Arc lift (px)', type: 'number', default: 24 },
      { key: 'leapAttack.landRadius', label: 'Land radius', type: 'px', default: GRID_CELL * 1 },
      { key: 'leapAttack.landDamage', label: 'Land damage', type: 'number', default: 3 },
      { key: 'leapAttack.landKnockback', label: 'Land knockback', type: 'number', default: 300 },
      { key: 'leapAttack.shockwaveMaxRadius', label: 'Shockwave radius', type: 'px', default: GRID_CELL * 3 },
      { key: 'leapAttack.shockwaveSpeed', label: 'Shockwave speed', type: 'number', default: 200 },
      { key: 'leapAttack.shockwaveDamage', label: 'Shockwave damage', type: 'number', default: 0 },
      { key: 'leapAttack.shockwaveKnockback', label: 'Shockwave knockback', type: 'number', default: 100 },
      { key: 'leapAttack.trailDropOnLanding', label: 'Trail on landing', type: 'bool', default: false },
    ]
  },
  {
    id: 'gooSpewCone', title: 'Goo spew cone', gate: 'gooSpewCone.enabled',
    fields: [
      { key: 'gooSpewCone.damageThreshold', label: 'Damage threshold', type: 'number', default: 10 },
      { key: 'gooSpewCone.chargeUpTime', label: 'Charge-up (dbl-sec)', type: 'number', step: 0.1, default: 1 },
      { key: 'gooSpewCone.coneAngle', label: 'Cone angle (rad)', type: 'number', step: 0.1, default: 1.88 },
      { key: 'gooSpewCone.blobCount', label: 'Blob count', type: 'number', default: 6 },
      { key: 'gooSpewCone.blobSpeed', label: 'Blob speed', type: 'number', default: 160 },
      { key: 'gooSpewCone.blobDecel', label: 'Blob decel', type: 'number', default: 80 },
    ]
  },
  {
    id: 'splitOnDamage', title: 'Split on damage', gate: 'splitOnDamage.enabled',
    fields: [
      { key: 'splitOnDamage.spawnChar', label: 'Spawn char', type: 'char', default: 'o' },
      { key: 'splitOnDamage.mergeCooldown', label: 'Merge cooldown (dbl-sec)', type: 'number', step: 0.1, default: 10 },
    ]
  },
  {
    id: 'mimicMechanic', title: 'Mimic', gate: 'mimicMechanic.enabled',
    fields: [
      { key: 'mimicMechanic.revealRadius', label: 'Reveal radius', type: 'px', default: GRID_CELL * 2 },
      { key: 'mimicMechanic.revealFlashDuration', label: 'Reveal flash (dbl-sec)', type: 'number', step: 0.1, default: 0.3 },
      { key: 'mimicMechanic.disguiseChars', label: 'Disguise chars', type: 'tags', default: ['⊞'] },
      { key: 'mimicMechanic.redisguiseCooldown', label: 'Re-disguise cfg', type: 'json', default: {},
        help: '{ "reDisguiseDistance": 48, "redisguiseDuration": 2 }' },
    ]
  },
  {
    id: 'lureMechanic', title: 'Lure', gate: 'lureMechanic.enabled',
    fields: [
      { key: 'lureMechanic.lureRadius', label: 'Lure radius', type: 'px', default: GRID_CELL * 5 },
      { key: 'lureMechanic.lurePullForce', label: 'Pull force', type: 'number', default: 100 },
      { key: 'lureMechanic.lureChannelTime', label: 'Channel (dbl-sec)', type: 'number', step: 0.1, default: 1.5 },
      { key: 'lureMechanic.lureCooldown', label: 'Cooldown (dbl-sec)', type: 'number', step: 0.1, default: 3 },
      { key: 'lureMechanic.lureIndicatorChar', label: 'Indicator char', type: 'char', default: '~' },
    ]
  },
  {
    id: 'steamCloud', title: 'Steam cloud', gate: 'steamCloud.enabled',
    fields: [
      { key: 'steamCloud.cloudRadius', label: 'Cloud radius', type: 'px', default: GRID_CELL * 2 },
      { key: 'steamCloud.scaldDuration', label: 'Scald (dbl-sec)', type: 'number', step: 0.1, default: 1 },
      { key: 'steamCloud.slowDuration', label: 'Slow (dbl-sec)', type: 'number', step: 0.1, default: 2 },
      { key: 'steamCloud.clearIceTiles', label: 'Clear ice tiles', type: 'bool', default: false },
    ]
  },
  {
    id: 'potionMechanic', title: 'Potion thrower', gate: 'potionMechanic.enabled', note: potionNotes,
    fields: [
      { key: 'potionMechanic.potionTable', label: 'Potion table', type: 'list', default: [],
        emptyLabel: '(no potions — the thrower has nothing to throw)',
        help: 'One row is rolled per throw. The colour tints the projectile; the effect is what lands on the player.',
        itemFields: [
          { key: 'color', label: 'Color', type: 'color', default: '#ff4400' },
          { key: 'effect', label: 'Effect', type: 'select', options: POTION_EFFECTS, default: 'freeze',
            help: "Applied via Player.applyStatusEffect on impact, except 'confusion', which CombatSystem handles on its own." },
          { key: 'label', label: 'Label', type: 'text', default: '',
            help: 'Authoring note only — nothing reads it. The effect alone decides what the potion does and what it drops.' },
        ] },
      { key: 'potionMechanic.aoeRadius', label: 'AoE radius', type: 'px', default: GRID_CELL * 2 },
      { key: 'potionMechanic.dropLastThrown', label: 'Drop last thrown', type: 'bool', default: false },
    ]
  },
  {
    // Purely reactive — the cornered hold is the Use Trap State's job; this
    // Mechanic only watches for that State becoming current and turns it into
    // an actual trap once per visit. See the Use Trap section above for the
    // timing knobs (clearAfter, timeout).
    id: 'trapLayerMechanic', title: 'Trap layer', gate: 'trapLayerMechanic.enabled',
    fields: [
      { key: 'trapLayerMechanic.trapTypes', label: 'Trap types', type: 'tags', default: ['slow'] },
    ]
  },
  {
    id: 'buffMechanic', title: 'Buff (support)', gate: 'buffMechanic.enabled',
    fields: [
      { key: 'buffMechanic.buffRadius', label: 'Buff radius', type: 'px', default: GRID_CELL * 4 },
      { key: 'buffMechanic.buffCooldown', label: 'Cooldown (dbl-sec)', type: 'number', step: 0.1, default: 5 },
      { key: 'buffMechanic.buffWindup', label: 'Windup (dbl-sec)', type: 'number', step: 0.1, default: 0.8 },
      { key: 'buffMechanic.buffs', label: 'Buffs', type: 'tags', default: ['speed'] },
      { key: 'buffMechanic.speedMultiplier', label: 'Speed ×', type: 'number', step: 0.1, default: 1.6 },
      { key: 'buffMechanic.damageMultiplier', label: 'Damage ×', type: 'number', step: 0.1, default: 1.5 },
      { key: 'buffMechanic.buffDuration', label: 'Buff duration (dbl-sec)', type: 'number', step: 0.1, default: 4 },
    ]
  },
  {
    id: 'flockBehavior', title: 'Flock (bats)', gate: 'flockBehavior',
    bareGate: true,
    fields: [
      { key: 'flockBehavior.perchChance', label: 'Perch chance', type: 'number', min: 0, max: 1, step: 0.05, default: 0.5 },
      { key: 'flockBehavior.perchObjects', label: 'Perch objects', type: 'tags', default: ['&', 'Y'] },
      { key: 'flockBehavior.perchSearchRadius', label: 'Perch search radius', type: 'px', default: GRID_CELL * 6 },
      { key: 'flockBehavior.rePerchChance', label: 'Re-perch chance/s', type: 'number', min: 0, max: 1, step: 0.01, default: 0.1 },
      { key: 'flockBehavior.swirlRadius', label: 'Swirl radius', type: 'px', default: GRID_CELL * 2 },
      { key: 'flockBehavior.swirlTurnRate', label: 'Swirl turn rate (rad/s)', type: 'number', step: 0.1, default: 2 },
      { key: 'flockBehavior.swirlSpeed', label: 'Swirl speed (px/s)', type: 'number', default: 80 },
      { key: 'flockBehavior.sweepPlayerEvery', label: 'Sweep player every', type: 'number', default: 3 },
      { key: 'flockBehavior.sweepOvershoot', label: 'Sweep overshoot (px)', type: 'number', default: 40 },
      { key: 'flockBehavior.sweepJitter', label: 'Sweep jitter (px)', type: 'number', default: 20 },
      { key: 'flockBehavior.sweepWeaveRatio', label: 'Sweep weave (0-1)', type: 'number', min: 0, max: 1, step: 0.05, default: 0.3 },
    ]
  },
  {
    id: 'riseAgain', title: 'Rise again', gate: 'riseAgain',
    bareGate: true,
    fields: [
      { key: 'riseAgain.riseDelay', label: 'Rise delay (dbl-sec)', type: 'number', step: 0.1, default: 3 },
      { key: 'riseAgain.riseHpFraction', label: 'Rise HP fraction', type: 'number', min: 0, max: 1, step: 0.05, default: 0.5 },
      { key: 'riseAgain.pileChar', label: 'Pile char', type: 'char', default: '8' },
    ]
  },
  {
    id: 'hexMechanic', title: 'Hex (curses)', gate: 'hexMechanic.enabled',
    fields: [
      { key: 'hexMechanic.curseTypes', label: 'Curse types', type: 'tags', default: ['invert', 'dim', 'silence'] },
      { key: 'hexMechanic.curseDuration', label: 'Curse duration (dbl-sec)', type: 'number', step: 0.1, default: 3 },
      { key: 'hexMechanic.learnSpellOnDeath', label: 'Learn spell on death', type: 'text', default: 'HEX' },
    ]
  },
  {
    id: 'armorMechanic', title: 'Armor', gate: 'armorMechanic.enabled',
    fields: [
      { key: 'armorMechanic.armorChunks', label: 'Armor chunks', type: 'number', default: 3 },
    ]
  },
  {
    // Waypoint path-follower. The waypoints themselves are not authored here —
    // the spawning system writes `enemy.patrolWaypoints` in pixel space (the
    // Aquifer eel), so this block only tunes how the path is walked.
    id: 'patrol', title: 'Patrol path', gate: 'patrol',
    bareGate: true,
    fields: [
      { key: 'patrol.speed', label: 'Patrol speed (px/s)', type: 'number', min: 0,
        default: (d) => d.speed ?? 60,
        help: 'Unset cruises at the enemy\'s own speed.' },
      { key: 'patrol.loop', label: 'Loop (else ping-pong)', type: 'bool', default: false },
      { key: 'patrol.arriveGap', label: 'Arrive gap', type: 'px', default: GRID_CELL * 0.5,
        help: 'How close counts as having reached a waypoint.' },
    ]
  },
  {
    // Huntable game — flee behavior for animals the player stalks rather than
    // fights. Pairs with `pacifist`, which is what keeps the combat FSM out of
    // the way so this mechanic owns the movement.
    id: 'gameAnimal', title: 'Game animal (huntable)', gate: 'gameAnimal',
    bareGate: true,
    fields: [
      { key: 'gameAnimal.role', label: 'Role', type: 'select', options: GAME_ANIMAL_ROLES, default: 'moose', rerender: true,
        help: 'moose bolts for the nearest exit on sight. rabbit runs, then burrows until you hold still — until its first wound, after which it flees like the moose.' },
      { key: 'gameAnimal.fleeSpeedMult', label: 'Flee speed ×', type: 'number', min: 0, step: 0.1, default: 1.4 },
      { key: 'gameAnimal.preBurrowRunTime', label: 'Pre-burrow run (dbl-sec)', type: 'number', min: 0, step: 0.1, default: 1.0,
        showIf: (d) => d.gameAnimal?.role === 'rabbit',
        help: 'How long the rabbit runs before it goes to ground.' },
      { key: 'gameAnimal.idleTwitch', label: 'Idle twitch (small hops)', type: 'bool', default: false,
        help: 'Brief hops every couple of seconds while idling, overriding a stationary idle for that window.' },
    ]
  },
  {
    // The Sniper's whole behavior: it suspends the core FSM every frame and owns
    // velocity, position, and state outright, so every knob it reads lives here
    // rather than in the core sections. Timers are double-seconds like the rest.
    id: 'sniperMechanic', title: 'Sniper', gate: 'sniperMechanic.enabled',
    fields: [
      { key: 'sniperMechanic.visionRange', label: 'Vision range', type: 'px', default: GRID_CELL * 40 },
      { key: 'sniperMechanic.visionLockTime1', label: 'Track → aim (dbl-sec)', type: 'number', min: 0, step: 0.1, default: 2.0,
        help: 'Obstructed line of sight builds this 3× slower but never resets it — breaking sight delays the lock, it does not break it.' },
      { key: 'sniperMechanic.visionLockTime2', label: 'Aim → fire (dbl-sec)', type: 'number', min: 0, step: 0.1, default: 1.0 },
      { key: 'sniperMechanic.reticuleSpeed', label: 'Reticule speed (px/s)', type: 'number', min: 0, default: 220,
        help: 'How fast the aim point chases the player. Above player walk speed (180) and below a dodge roll (~297) is what makes rolling the answer.' },
      { key: 'sniperMechanic.telegraphTime', label: 'Telegraph (dbl-sec)', type: 'number', min: 0, step: 0.1, default: 0.5,
        help: 'Committed — the shot cannot be interrupted once this starts.' },
      { key: 'sniperMechanic.beamDamage', label: 'Beam damage', type: 'number', min: 0, default: 4 },
      { key: 'sniperMechanic.beamFadeTime', label: 'Beam fade (sec)', type: 'number', min: 0, step: 0.1, default: 0.6,
        help: 'Purely the VFX lifetime of the fired beam. Real seconds — the beam is a game-side effect, not an enemy timer.' },
      { key: 'sniperMechanic.cooldownAfterFire', label: 'Cooldown after fire (dbl-sec)', type: 'number', min: 0, step: 0.1, default: 2.0 },
      { key: 'sniperMechanic.nearRange', label: 'Near range (vanish trigger)', type: 'px', default: GRID_CELL * 5,
        help: 'Closer than this and the Sniper hides rather than shoots.' },
      { key: 'sniperMechanic.hideDelay', label: 'Hide delay (dbl-sec)', type: 'number', min: 0, step: 0.1, default: 0.5 },
      { key: 'sniperMechanic.hiddenMoveSpeed', label: 'Hidden move speed (px/s)', type: 'number', min: 0,
        default: (d) => (d.speed ?? 60) * 3,
        help: 'Speed while invisible and repositioning. Unset falls back to speed × 3.' },
      { key: 'sniperMechanic.disturbRadius', label: 'Disturb radius', type: 'px', default: GRID_CELL * 2,
        help: 'Background objects it brushes past while hidden shake — the only tell for where it went.' },
      { key: 'sniperMechanic.meleeRange', label: 'Melee range', type: 'px', default: GRID_CELL * 1.5,
        help: 'Below half HP, a player inside this range triggers the cornered dagger instead.' },
      { key: 'sniperMechanic.daggerDamage', label: 'Dagger damage', type: 'number', min: 0, default: 3 },
      { key: 'sniperMechanic.daggerWindup', label: 'Dagger windup (dbl-sec)', type: 'number', min: 0, step: 0.1, default: 0.4 },
      { key: 'sniperMechanic.daggerCooldown', label: 'Dagger cooldown (dbl-sec)', type: 'number', min: 0, step: 0.1, default: 1.2 },
    ]
  },
  {
    // Flee → grow-through-four-stages → permanent chaser → blink → detonate.
    // Growth advances on a Flee lookback that finds the player out of sight,
    // or on being attacked (interruptible mid-attempt); never regresses once
    // locked. See Enemy.js's RipenMechanic for the full lifecycle.
    id: 'ripenMechanic', title: 'Ripen (grow & detonate)', gate: 'ripenMechanic.enabled',
    fields: [
      { key: 'ripenMechanic.growDuration', label: 'Grow duration (dbl-sec)', type: 'number', step: 0.1, default: 3.0 },
      { key: 'ripenMechanic.waggleAngle', label: 'Waggle angle (deg)', type: 'number', default: 15 },
      { key: 'ripenMechanic.waggleCycles', label: 'Waggle cycles', type: 'number', default: 3 },
      { key: 'ripenMechanic.growthScales', label: 'Growth scales', type: 'json', default: [1.0, 1.2, 1.45, 1.75],
        help: 'One scale per stage (0-3) — stage 3 is the locked, fully-grown size.' },
      { key: 'ripenMechanic.blinkDelay', label: 'Blink delay (dbl-sec)', type: 'number', step: 0.1, default: 1.0 },
      { key: 'ripenMechanic.detonateRange', label: 'Detonate range', type: 'px', default: GRID_CELL * 1.25 },
      { key: 'ripenMechanic.detonateDamage', label: 'Detonate damage', type: 'number', default: 8 },
      { key: 'ripenMechanic.shockwaveMaxRadius', label: 'Shockwave radius', type: 'px', default: GRID_CELL * 5 },
      { key: 'ripenMechanic.shockwaveSpeed', label: 'Shockwave speed', type: 'number', default: 220 },
      { key: 'ripenMechanic.shockwaveDamage', label: 'Shockwave damage', type: 'number', default: 6 },
      { key: 'ripenMechanic.shockwaveKnockback', label: 'Shockwave knockback', type: 'number', default: 320 },
      { key: 'ripenMechanic.burnDuration', label: 'Burn duration (real sec)', type: 'number', step: 0.1, default: 3.0,
        help: 'Ignites entities caught in the point-blank hit or shockwave sweep. 0/omitted = no burn.' },
    ]
  },
];

// ── SECTION NOTES ───────────────────────────────────────────────────────────

// Both suppression flags hide a whole system, and each one is only coherent in
// company: a pacifist with nothing driving it stands still forever, and a dummy
// that can still fight is a training post that hits back.
function pacifistNotes(def) {
  const notes = [];
  if (def.pacifist && !def.gameAnimal && !def.patrol) {
    notes.push({
      level: 'warn',
      text: 'Pacifist with no gameAnimal or patrol block — the combat FSM is skipped and nothing else moves this enemy, so it will idle in place.',
    });
  }
  if (def.isDummy && !def.pacifist) {
    notes.push({
      level: 'warn',
      text: 'Dummy without pacifist — it takes no damage but still chases and attacks.',
    });
  }
  return notes;
}

// `lookback` undeclared is not a safe degrade the way `useTrap` undeclared
// is — EnemyStateMachine's FALLBACK resolves Flee's lookback fallback back to
// `flee` itself, and a transition to the already-current state silently
// no-ops, so the enemy would never glance back at all (see EnemyStateMachine's
// FALLBACK comment for the full asymmetry).
function fleeNotes(def) {
  if (def.flee && !def.lookback) {
    return [{
      level: 'warn',
      text: 'Flee is set but Lookback is not — the periodic glance-back silently never fires (fallback resolves back to Flee itself, which is a no-op transition). Declare Lookback too.',
    }];
  }
  return [];
}

// `requirePack` reads `enemy.packmates`, which only gets populated by
// EnemyUpdateSystem when Pack coordination is on (or a packBehavior mechanic
// this editor doesn't author) — without it the gate compares against an empty
// list forever and Strike can never fire.
function anticipateNotes(def) {
  if (def.anticipate?.requirePack && !def.packCoordination) {
    return [{
      level: 'warn',
      text: 'requirePack is set but Pack coordination (Interaction flags) is off — enemy.packmates stays empty, so the pack gate can never pass.',
    }];
  }
  return [];
}

// The affinity/tier generator and the fixed list are alternatives, not a blend:
// an enemy carrying both affinities and a tier never reaches its `drops`.
function lootNotes(def) {
  if (!Array.isArray(def.drops) || def.drops.length === 0) return [];
  const affinities = def.affinities?.length ? def.affinities : (def.dropTable ? [def.dropTable] : null);
  const tier = def.tier || def.rarityProfile;
  if (affinities && tier) {
    return [{
      level: 'warn',
      text: `Affinities + tier are set, so loot is generated from them and this fixed list never rolls. Clear the affinities or the tier to use it.`,
    }];
  }
  return [];
}

// Two of the four shipped potion effects land nothing on the player (bug #166).
// The editor is the only place that can say so before the potion is thrown, so
// it says so here rather than letting a new thrower inherit the same dud.
function potionNotes(def) {
  const table = def.potionMechanic?.potionTable;
  if (!Array.isArray(table) || table.length === 0) return [];
  const notes = [];
  const dud = [...new Set(table.map(p => p.effect).filter(e => POTION_NO_OP.has(e)))];
  if (dud.length) {
    notes.push({
      level: 'warn',
      text: `${dud.join(' and ')} land no status on the player — Player.applyStatusEffect has no slot for ${dud.length > 1 ? 'them' : 'it'} and returns early (bug #166). ${dud.length > 1 ? 'Those potions' : 'That potion'} still deals damage and knockback.`,
    });
  }
  // The death drop is keyed off the effect through a map hardcoded in main.js,
  // so an effect outside that map yields no drop at all — silently, at the one
  // moment the player was promised one.
  if (def.potionMechanic?.dropLastThrown) {
    const unmapped = [...new Set(table.map(p => p.effect).filter(e => e && !POTION_DROPS.has(e)))];
    if (unmapped.length) {
      notes.push({
        level: 'warn',
        text: `Drop-last-thrown is on, but ${unmapped.join(' and ')} ${unmapped.length > 1 ? 'have' : 'has'} no ingredient in main.js's effect→ingredient map, so dying on ${unmapped.length > 1 ? 'those throws' : 'that throw'} drops nothing.`,
      });
    }
  }
  return notes;
}
