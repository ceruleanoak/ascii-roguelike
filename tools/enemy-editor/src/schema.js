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
//   'select'  — one-of options[]
//   'tags'    — comma-separated string[] (free)
//   'tagset'  — multi-select from options[] -> string[]
//   'json'    — raw JSON value (objects/arrays too irregular for a widget)
//
// `px: true` is implied by type 'px'. `showIf(def)` hides a field unless true.

export const GRID_CELL = 16;

export const AFFINITY_OPTIONS = [
  'beast', 'venom', 'goo', 'humanoid', 'aberration', 'fire', 'ice',
  'undead', 'electric', 'aquatic', 'gemstone', 'dragon'
];

export const EFFECT_OPTIONS = [
  'burn', 'freeze', 'zap', 'poison', 'wet', 'goo', 'stun', 'sleep',
  'charm', 'blind', 'dizzy', 'physical'
];

export const ATTACK_TYPES = ['melee', 'ranged', 'magic', 'fire', 'sap', 'tongue', 'none'];
export const PROJECTILE_TYPES = ['', 'arrow', 'rock', 'potion', 'magic', 'fire'];
export const MOVEMENT_STYLES = ['chaser', 'keeper', 'kiter', 'jumper', 'ambusher'];
export const IDLE_BEHAVIORS = ['wander', 'stationary'];
export const WINDUP_MOVEMENTS = ['stop', 'advance', 'retreat'];
export const TIER_OPTIONS = ['weak', 'normal', 'elite', 'boss'];

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
      { key: 'attackType', label: 'Attack type', type: 'select', options: ATTACK_TYPES, default: 'melee' },
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
      // keeper / kiter
      { key: 'movementConfig.preferredRange', label: 'Preferred range', type: 'px', default: GRID_CELL * 5,
        showIf: isKeeperKiter },
      { key: 'movementConfig.rangeTolerance', label: 'Range tolerance', type: 'px', default: GRID_CELL * 1,
        showIf: isKeeperKiter },
      { key: 'movementConfig.retreatThreshold', label: 'Retreat threshold', type: 'px', default: GRID_CELL * 3,
        showIf: isKeeperKiter },
      { key: 'movementConfig.kiteDistance', label: 'Kite distance', type: 'px', default: GRID_CELL * 4,
        showIf: (d) => d.movementStyle === 'kiter' },
      { key: 'movementConfig.dive', label: 'Dive at player', type: 'bool', default: true,
        showIf: isKeeperKiter },
      // jumper
      { key: 'movementConfig.jumpInterval', label: 'Jump interval (dbl-sec)', type: 'number', min: 0.1, step: 0.1, default: 1.2,
        showIf: (d) => d.movementStyle === 'jumper' },
      { key: 'movementConfig.jumpSpeed', label: 'Jump speed (px/s)', type: 'number', default: 220,
        showIf: (d) => d.movementStyle === 'jumper' },
      { key: 'movementConfig.jumpDuration', label: 'Jump duration (dbl-sec)', type: 'number', min: 0.05, step: 0.05, default: 0.35,
        showIf: (d) => d.movementStyle === 'jumper' },
      { key: 'movementConfig.zigzagStrength', label: 'Zigzag strength (0-1)', type: 'number', min: 0, max: 1, step: 0.05, default: 0.5,
        showIf: (d) => d.movementStyle === 'jumper' },
      { key: 'movementConfig.arcHeight', label: 'Arc height (px)', type: 'number', default: 6,
        showIf: (d) => d.movementStyle === 'jumper' },
      // ambusher
      { key: 'movementConfig.wakeRadius', label: 'Wake radius', type: 'px', default: GRID_CELL * 3,
        showIf: (d) => d.movementStyle === 'ambusher' },
      { key: 'movementConfig.burstSpeed', label: 'Burst speed (px/s)', type: 'number', default: 200,
        showIf: (d) => d.movementStyle === 'ambusher' },
      { key: 'movementConfig.burstDuration', label: 'Burst duration (dbl-sec)', type: 'number', min: 0.1, step: 0.1, default: 0.6,
        showIf: (d) => d.movementStyle === 'ambusher' },
    ]
  },
  {
    id: 'flags',
    title: 'Interaction flags',
    fields: [
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
    id: 'sfx',
    title: 'Audio (SFX)',
    fields: [
      { key: 'sfx.hit', label: 'Hit SFX', type: 'text', default: '' },
      { key: 'sfx.death', label: 'Death SFX', type: 'text', default: '',
        help: 'Single name, or comma list for random pick.' },
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
];
