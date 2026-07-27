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
//   'json'    — raw JSON value (objects/arrays too irregular for a widget)
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

export const GRID_CELL = 16;

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

const isKeeperKiter = (d) => d.movementStyle === 'keeper' || d.movementStyle === 'kiter';

// ── CORE / VISUAL / STAT SECTIONS ──────────────────────────────────────────
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
      { key: 'telegraph.pulses', label: 'Pulses (no animation)', type: 'json', default: null, rerender: true,
        placeholder: '[{"delay":0},{"delay":1.5,"damageMult":0.5}]',
        help: 'Hand-authored rhythm for the animation-less form; delays are double-seconds. Conflicts with an animation.' },
    ]
  },
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
      { key: 'drops', label: 'Fixed drops', type: 'json', default: [],
        placeholder: '[{"char":"m","chance":0.5}]',
        help: 'An explicit drop list, each rolled independently against its own chance (luck scales it). Only consulted when the affinity/tier generator has nothing to work with.' },
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
// Each mechanic is a collapsible block gated by a toggle. `gate` is the path
// that turns it on ('<key>.enabled' for most; bare presence for a few).
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
    id: 'potionMechanic', title: 'Potion thrower', gate: 'potionMechanic.enabled',
    fields: [
      { key: 'potionMechanic.potionTable', label: 'Potion table', type: 'json', default: [],
        help: '[{ "color":"#ff4400", "effect":"burn", "label":"Fire" }]' },
      { key: 'potionMechanic.aoeRadius', label: 'AoE radius', type: 'px', default: GRID_CELL * 2 },
      { key: 'potionMechanic.dropLastThrown', label: 'Drop last thrown', type: 'bool', default: false },
    ]
  },
  {
    id: 'trapLayerMechanic', title: 'Trap layer', gate: 'trapLayerMechanic.enabled',
    fields: [
      { key: 'trapLayerMechanic.trapTypes', label: 'Trap types', type: 'tags', default: ['slow'] },
      { key: 'trapLayerMechanic.trapCooldown', label: 'Cooldown (dbl-sec)', type: 'number', step: 0.1, default: 4 },
      { key: 'trapLayerMechanic.trapCooldownVisibleMult', label: 'Visible cooldown ×', type: 'number', step: 0.1, default: 0.4 },
      { key: 'trapLayerMechanic.trapWindup', label: 'Windup (dbl-sec)', type: 'number', step: 0.1, default: 0.6 },
      { key: 'trapLayerMechanic.trapSafeRange', label: 'Safe range', type: 'px', default: GRID_CELL * 2 },
      { key: 'trapLayerMechanic.fleeSpeedMult', label: 'Flee speed ×', type: 'number', step: 0.1, default: 1.5 },
      { key: 'trapLayerMechanic.postTrapBurstDuration', label: 'Burst duration (dbl-sec)', type: 'number', step: 0.1, default: 1 },
      { key: 'trapLayerMechanic.postTrapBurstSpeed', label: 'Burst speed ×', type: 'number', step: 0.1, default: 1.4 },
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
