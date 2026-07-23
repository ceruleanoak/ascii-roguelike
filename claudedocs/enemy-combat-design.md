# Enemy Combat Design — Pattern-Family Baseline

The design lens for enemy behavior work, sitting alongside `zone-cosmology.md` (read that
first for zone words/verbs). Established 2026-07-22 from a full survey of the enemy AI,
weapon rhythm, and the enemy editor.

## The problem this baseline answers

Combat rhythm is one-sided. Enemies threaten only through telegraphed attack objects, and
the player's loop — **read telegraph → dodge (~0.65s near-free i-frames on a 0.5s
cooldown) → punish** — is never contested. Weapons are mature and each class demands a
discipline; no enemy attacks any of those disciplines:

| Weapon class | Discipline it demands | Currently contested by |
|---|---|---|
| Gun | Self-slow while firing; magazine/reload downtime | nothing |
| Bow | Hold-to-charge exposure; ammo economy; speed-falloff spacing | nothing |
| Dagger | Point-blank aggression; hit resets weapon + roll cooldowns | nothing |
| Spear | Exact max-range spacing (3rd-hitbox `distanceCrit`) | nothing |
| Whip | 5-cell line + stun from safety; slow commit | nothing |
| Wand | Long vulnerable charge; mana budget | nothing |
| Stealth (dagger/rogue) | Undetected approach → backstab multiplier | nothing |

Of ~54 roster enemies, ~20 are pure stat-variants of the generic chaser/keeper AI. The
mechanics that do exist (25 modules) are spread thin — many are one-enemy one-offs.

**The move**: mature a small set of *pattern families* — composable Mechanics any enemy can
adopt via data — so that every zone can field enemies that contest specific player
disciplines, and per-enemy uniqueness ("memorable chars") is then built by *combining and
tuning* families rather than authoring bespoke AI.

## The pattern families

Each family names the player discipline it contests, its natural adopters, and its zone fit
per the cosmology verbs.

### 1. Rage (`RageMechanic`)
- **Contests**: reckless engagement; low-commitment chip damage. The first hit is now a
  decision, not a freebie.
- **Shape**: after first hit (or HP threshold), speed/damage/cooldown multipliers shift and
  the enemy visibly changes state (color override + indicator). Distinct field `rageActive`
  (`enraged` is the aggro flag).
- **Adopters**: Troll (slow → terrifying when provoked), Ogre, Boar (stacks with Charge),
  Yeti. Any "don't poke the bear" enemy.
- **Zone fit**: Red (*React* — the zone that assaults you) primary; Green Troll as the early
  lesson.

### 2. Sprint (`SprintMechanic`)
- **Contests**: gun/bow self-root and reload windows; the assumption that combat is optional
  once spotted. Once alerted, you cannot be outrun — commit or fight.
- **Shape**: continuous speed ramp 1→max over rampTime while engaged with vision; decays
  when vision breaks. Deliberately not an FSM — Charge is the discrete dash, Sprint is
  sustained pursuit.
- **Adopters**: wolves (pack pursuit), Miner, any predator-flavored chaser.
- **Zone fit**: Red (*React*); Cyan hunters (a Frost Wolf pack that cannot be outrun makes
  stillness/anticipation the counter, which is Cyan's whole thesis).

### 3. Circling striker (kiter `orbit` config + dive Telegraph)
- **Contests**: target prioritization; turret-style play. Stays out of melee, strikes on its
  own cadence, forces the player to either track it or accept unexpected hits.
- **Shape**: mature `_moveKiter` with `movementConfig.orbit {direction, flipInterval,
  orbitSpeed}` for a readable circle; the dive gets a line Telegraph along the locked dive
  vector before commit. Dive cadence remains `attackCooldown`.
- **Adopters**: Bat, Frost Wolf, Volt Spider — every current kiter inherits the readability
  upgrade for free once configured.
- **Zone fit**: cross-zone (kiters exist everywhere); the readable dive telegraph is the
  Red×Cyan read-and-answer beat.

### 4. Telegraph shapes (`Telegraph` module — see GLOSSARY)
- **Contests**: the 1:1 "warning = hitbox" read that makes every melee dodge trivially
  solvable. Warning aids *anticipation*; it is not a damage outline.
- **Shape**: `telegraph: {warnShape, hitShape, pulses}` — warn may be wider than hit
  (Troll: wide cone warning, committed swing). Shapes: rect/cone/ring/circle. Absent data =
  legacy single-rect behavior, byte-identical.
- **Adopters**: Troll first (the motivating case); then every melee elite/boss.
- **Zone fit**: system-level, all zones.

### 5. Anti-dodge (`pulses` + ring shapes)
- **Contests**: the near-free dodge roll (i-frame window ~0.65s ÷ 2 real, cooldown 0.5 ÷ 2).
  Slime goo taught "preserve your dodge" passively; these contest it actively.
- **Shape** (two concrete forms):
  - **Two-pulse melee**: pulse 2 lands after one i-frame window expires — a single
    reflex-dodge eats pulse 1 and gets clipped by pulse 2; the answer is dodging *late* or
    *out of the shape*.
  - **Ring with inner-safe zone**: the safe answer is dodging *into* the enemy —
    knowledge-rewarding, terrifying the first time, trivial once learned (the game's core
    test: rewards knowledge).
- **Adopters**: elites and bosses only at first — this family raises the skill floor and
  should stay rare below elite tier.
- **Zone fit**: Red (*React*) for pulse timing; Cyan (*Anticipate*) for the inner-safe ring.

### 6. Parry readability (`ParryMechanic` extension)
- **Contests / teaches**: attack timing itself. The Duelist idea is good; the window is
  currently unreadable. Projected "timing moments" make the fight memorable.
- **Shape**: `getParryIndicator()` + a cone Telegraph of `parryArcDegrees` during
  windup/active, blinking with the same cadence as melee windups so the existing read
  transfers.
- **Adopters**: Duelist now; Knight is the natural second (armor + parry = the full
  "fight properly" exam).
- **Zone fit**: Red×Cyan overlap (*the parry is Anticipate + React fused* — cosmology's own
  words).

### 7. Urgency — Bomb Carrier, Thief, summoner escalation
- **Contests**: free target selection; the habit of killing whatever is closest. The
  Necromancer already proves priority-forcing works; these generalize it.
- **Shapes**:
  - **Bomb Carrier** (`BombCarrierMechanic`): fuse starts on aggro, countdown digit overhead
    (non-instructive — a ticking number explains itself), chases; detonation reuses
    `deathExplosion`.
  - **Thief** (`ThiefMechanic`): steals held weapon on contact → flees → despawns in ~5
    dbl-sec with the item; kill it to get the weapon back. The sharpest urgency in the game
    because the stake is the player's build, not HP.
  - **Summoner escalation**: existing `spawning` block gains ramp fields (cooldown shrinks /
    cap grows) so ignoring a summoner compounds.
- **Zone fit**: Green (*Acquire*, inverted — the Thief steals from the hoarder; greed as
  threat) for Thief; Yellow/Gray for Bomb Carrier and summoners.

### 8. Armor / chip (`ArmorMechanic` — logic to be written; only `init()` exists)
- **Contests**: fast low-damage weapons (dagger, machine gun) and **hard-counters whips**
  (design constraint: whips never chip — clink, no number). Rewards heavy single hits
  (hammer, laser cannon, charged bow).
- **Shape**: while `armorChunks > 0`, HP untouchable; a hit with damage ≥ `chipThreshold`
  removes one chunk. Requires the `takeDamage` source contract (weapon identity at the
  damage sink).
- **Adopters**: Knight (obvious), Living Rock/Rockwarden (stacks with shell), gray-zone
  elites.
- **Zone fit**: Red (metal is Red's mineral) and Gray.

### 9. Watcher (`WatcherMechanic`)
- **Contests**: the backstab-from-stealth economy (Cyan Rogue burst is currently
  uncountered). Marks the player on sight — clearing backstab eligibility via the
  `detectionIndicatorTimer` gate — and alerts roommates.
- **Shape**: wide vision, weak or harmless in itself; its weapon is information. Kill it
  first or fight a room that sees you.
- **Zone fit**: Cyan (*Anticipate*, inverted — the zone that trains observation fields an
  enemy that observes *you*).

### 10. Crowder (`CrowderMechanic`)
- **Contests**: spear `distanceCrit` tip and the whip band — max-range camping. Holds
  sub-melee distance (~0.5 cell) with high acceleration; the answer is repositioning
  weapons, dagger play, or knockback tools.
- **Adopters**: swarm-flavored enemies (rats, spiders as variants); a Green mid-tier lesson.
- **Zone fit**: Green/Red.

## Composition is the point

Memorable chars come from *combinations*: Knight = Armor + Parry; enraging Boar = Rage +
Charge; a pack of Sprint wolves with one Watcher crow; a Bomb Carrier escorted by a Crowder
swarm. The families are the alphabet; enemies are the words. Per-enemy authoring happens in
the enemy editor (`npm run enemy-editor`) against draft JSONs — see CLAUDE.md "Dev & Debug
Tools".

## Verification caveats

- **The playtesting simulator is positioning-blind** (`TTK = ceil(hp/dmg) × cooldown`; no
  geometry, no dodge). Only Rage and Armor produce simulator-visible TTK deltas. Sprint,
  Crowder, circling, Telegraph shapes, anti-dodge, Watcher, and urgency behavior are
  **invisible to it** — a green simulator run validates nothing about them. Behavioral
  validation happens in the enemy-editor sandbox and in-game via CheatMenu spawns.
- All new timer fields are in **double-seconds** (`ENEMY_TIMER_RATE = 2`), same as weapon
  data.
