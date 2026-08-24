# Dungeon Boss — Green: The Hoardmaw

The first **Layer 2** encounter (`boss-design.md` §Layer 2) — the definitive delve-capper inside a
Dungeon Interior. Read `boss-design.md` for the ratified governing principle (*observe and learn to
access the path to victory*), `zone-cosmology.md` for Green's word (**Greed** / *Acquire*), and
`legend-of-three.md` for Green's triad (★ Lucky Coin / Compass / ⌬ Bread).

Status markers follow `boss-design.md`: **Ratified** = user decision captured in substance;
**Open** = awaiting authorship.

---

## Identity — Ratified

- **Name:** The Hoardmaw.
- **One-line truth:** *the treasure you descended for is the thing that eats you.* The zone's word
  spoken as a monster: its HP is its wealth, its weapon is your appetite, and it is only ever
  vulnerable **in the act of taking**.
- **Zelda lineage (mild):** mimic-chest ambush + Dodongo's feed-the-mouth punishment.
- **Glyph policy:** like every coded boss, the Hoardmaw renders as a full large composite body —
  never a single glyph. `₮` exists only as the internal data placeholder exactly the way
  `LakeBoss` uses `~` (registered char, render fully owned by the boss-composite renderer).
- **Distinctness:** must not read as a second Goo Dragon (multi-head composite is taken),
  Giant Slime (splitter), or Goblin Army (formation).

## Placement & access — Ratified

- The vault sits **beyond the Pyramid**: solving the Pyramid's Legend-of-Three offering reveals
  the descent (consuming the uncapped floor-graph extension point from ADR-backlog 2026-08-13).
  Flow: Entrance → Corridor → Branch → Pyramid (offering) → **Vault (Hoardmaw)**.
- **Once per run** per delve; knowledge carries across runs, nothing else does.

## Arena — Ratified

A cramped square chamber. The body mass fills the north half; there is nowhere to kite, and
projectiles **ping off** (ricochet spark, zero damage) until scales are stripped. Close quarters is
not suggested, it is compelled. Slam safe-cells hug the flanks — proximity rewarded, not just
punished.

## Prologue ambush — Ratified

It rests as the room's centerpiece pile; every gaming instinct says loot it. First approach/SPACE:
the lid snaps shut on the player — one heavy survivable hit plus knockback. Ambush reveal rides the
`MimicMechanic` disguise-reveal seams; the transformation into the full composite body *is* the
reveal. **Repeat-visit beat:** a slowly approaching player is not snapped at — the ambush can be
skipped entirely once known.

## Anatomy (composite body) — Ratified

~10×6-cell mass. Structure mirrors the existing bosses exactly: bespoke core entity +
child entities, excluded from the generic enemy loop / physics separation / offscreen indicators,
dedicated draw section on fgCtx with HP bar above the body (precedents: `GooDragon`+`GooHead`,
`TurtleShell`+`TurtleHead`+legs, `BossRenderer.renderBossComposite`).

| Part | Behavior |
|------|----------|
| **Lid** | Animated plank row: sealed vs gape states exposing dark mouth-interior cells; slams close over the ring telegraph |
| **Scale field** | Rows of `$` chips over bare hide; each chip an `ArmorMechanic` chunk keyed by offset (not ~60 entities); chipped cells expose hide until re-armored |
| **Mouth interior** | Visible only in gape; hosts the coin-slot seam cell; originates the inhale |
| **Keyhole `◉`** | One cell within the body block — the phase-2 weak point, migrating on a fixed cycle |
| **Tongue** | Travelling grab strip (`HoardmawTongue`, `GooHead` grab precedent); face-melee breaks the grip |

## The three phases — Ratified

| Phase | Name | State | The lock |
|-------|------|-------|----------|
| 1 | **Scaled** | Full coin-scale armor | Hits chip `$` pickups loose. Collecting a scale **mints +1 coin**. Left on the floor, swept scales are re-absorbed and **re-armor** the maw — claim your damage. *Acquire*, enforced mechanically. |
| 2 | **Glinting** | Bare hide; true glint among fakes | Fakes sparkle arrhythmically; the true `◉` pulses **in rhythm with the maw's breathing** and brightens two pulses when it reaches to grab. Wrong spot = `ting` ricochet. Reading the rhythm is the skill. Roams a fixed 3-position cycle (third-visit mastery: pre-positioning ends the phase in seconds). |
| 3 | **The Bribe** | It goes still and pushes out a mound of real coins/ingredients | Grabbing = lid slam (massive hit). **Refuse three times**, then strike the offered pile into its own mouth: choke, lid hangs open, `◉` exposed for the kill window. |

## Attack set (all close-range, all readable) — Ratified

- **Lid slam** — telegraphed ring Area; safe cells hug its sides.
- **Inhale** — vacuum pull toward the mouth (`LureMechanic` pull math); swallow costs big + wall
  spit. Counterplay: anchored dodge-roll or bracing against debris. Drags **all** loose pickups —
  chipped scales *and* the player's pre-staged goods.
- **Scale fan** — chipped scales flung as shrapnel cones when it lurches; lost wealth defends itself.
- **Tongue reel** — mid-range grab-and-pull (`MimicMechanic` tongue reuse); same escape grammar as
  Goo Dragon head grabs (learned behavior transfers).
- Ranged deflection until stripped (`ReflectShieldMechanic` bounce logic).

## Coin economy — Ratified

The fight is a closed greed loop: chip armor → collect minted scales → coins fill the cursed
slots → feed them back through the seam → more windows → more chips.

- Raw coin `c` only (Infused Coin `¤` stays a crafting component).
- Scales swept back by the inhale re-absorb as armor (its own wealth returns to it).
- **Player-staged coins caught by the inhale are devoured and gone** — visible gulp, no heal, no
  mechanical punishment beyond loss (Ratified). Careless staging is wasted greed; lane-aware
  staging is repeat-visit mastery.

## Gold Breath curse — Ratified

On the Scaled→Glinting transition the maw exhales a gold-dust sweep across the arena. Until the
kill:

- Every consumable quick slot **renders `c` wired to the coin tally** — the slots become coins.
- SPACE and SHIFT each discharge one coin (throw arc, lands as pickup).
- Consumable use is suspended — *your remedies are hoarded too*. Stated consequence, deliberate.
- The breath curses your remedies and gilds nothing itself; companion gilding triggers on vault
  arrival (below). One theme, two faces of Greed touching two systems.

## SHIFT Toss (game-wide prerequisite) — Ratified

- Keys 4–8 arm a consumable slot (existing `selectedConsumableIndex`). **SHIFT with a consumable
  armed tosses it** — charge-on-press/release-on-keyup along the existing `TrapSystem` drop-throw
  pipeline ('drop' mode extended with a source descriptor); lands as a ground pickup with
  `pickupReadyAt`. Weapon-held SHIFT behavior unchanged.
- Tossed items persist on dungeon floors while cached within a delve; wiped on delve reset
  (no-persistence law holds — staging is per-delve effort).
- DemoSystem replay parity is free (Shift already in `ACTION_KEYS`).
- New domain term proposed for glossary: **Toss**.

### How prep eases the fight — Ratified

The vault's dormant prologue is free time: scatter `c` beside the seam cell, stage `⌬` along lunge
lanes *before* waking the maw. Windows become grab-and-go instead of mid-fight fumbling. Post-curse,
pre-staged bread is the **only** mid-fight Help route (slots are coins), making preemptive staging
load-bearing rather than optional garnish.

## Legend-of-Three register windows (soft) — Ratified

Never hard inventory gates — inventory dies with the player; hard gates would punish the
knowledgeless run and violate the arcade-purity guardrail. Each triad item opens a superior window:

| Register | Act | Effect |
|----------|-----|--------|
| **Justice ★** | Toss `c` landing in the seam cell during gape | Instant stagger — currency judged |
| **Truth ⌖** | Carried Compass pulses toward the true glint | Cuts the phase-2 search cost (extends the Compass's existing dungeon-beep scope; see ADR-backlog 2026-08-13 Compass row) |
| **Help ⌬** | Ground bread within lunge reach during a lunge beat | Redirects the lunge — decoy save, drags the true glint into reach |

Nothing on screen names the registers. The acts are the statement.

## Companions — mortal descent, gilded arrival — Ratified

Pets enter dungeons game-wide (new capability; ADR-backlog row filed):

- **Floors 0 → vault:** pets descend **mortal** — escort risk. Enemies and Tomb Ghosts can hurt or
  lose them; arrive shorthanded and the fight runs without helpers.
- **Vault arrival:** every living pet flips **gilded** — HP-less (damage intake skipped, death
  checks bypassed), gold-tinted render, reverting on dungeon exit alongside the collision-map
  restore path. Duration: rest of the delve only; surface taming economy untouched.
- **In-fight elevation:** crow dive-pecks auto-target the true glint (a living Compass — green's
  mascot teaching the lock); rat gnaws the tongue root through stagger/reel windows; crow ferries
  chipped scales back before re-absorption sweeps reclaim them.
- Solo arrival stays fully viable — soft bonus, never a gate.
- Scope: dungeon floors only; hut/maze unchanged (maze Ghost economy deliberately pet-free).

**Game Changer note:** gilded is the template's first proof — each zone's dungeon boss earns a
*game changer*: a rule-bending state the delve itself pays for, reshaping the fight's contract
(mortal→gilded escorts; slot-cursing breath). Yellow/red/cyan changers are **Open**.

## Earned win — Ratified

Phase 3 *is* the earned win: the boss's last weapon is the player's greed, and the winning move is
refusal — three refusals, then turning its own bribe into its grave.

- WiseFellow rare saying (existing pattern): **"THE HOARD YIELDS TO AN EMPTY HAND."**
- Death: the hoard collapses into a genuine payout shower — coins, gems, tiered weapon roll,
  guaranteed Mana (#215 fix required so authored bosses receive boss-tier drops). Acquisition,
  properly earned.
- Optional captive: the previous delver the maw had swallowed, via the `spawnCaptive` pattern —
  **Open** (include or not).
- Behind the corpse-pile: a sealed inner-vault door facing **south** that never opens. The
  suspicion-of-further-south rule, planted.

## Rewarding repeat visits — Ratified

Death resets everything; repeats happen across runs and knowledge is the progression:

1. Visit 1: survive the ambush, learn chip-and-claim, glimpse the glint rhythm.
2. Visit 2+: slow-approach skips the ambush; route straight chip → glint → refuse.
3. Mastery: the glint's fixed 3-position cycle allows pre-positioning; inhale-lane knowledge makes
   staging safe; faster kills, cleaner payouts.

## Template (how this generalizes) — spine Ratified, per-zone content Open

New `src/systems/DungeonBossSystem.js` + per-zone spec (`src/data/dungeonBosses/*.js`):

- **Every dungeon boss is a three-phase fight whose windows key to that zone's
  `legendOfThree` triad, capped by a temptation finale won by refusing, carrying one Game
  Changer.**
- Zone-flavored temptation tables (green: coins; yellow: mana; red: power; cyan: knowledge).
- Shared scaffolding: ambush reveal, armor/glint weak-point system, bait/bribe finale, payout
  table, companion hooks, WiseFellow hint slot.
- Green authors the mold; yellow/red/cyan should be data + art, not new systems. Their phases,
  finales, and changers are each **Open**.

## Implementation map

| Need | Seam |
|------|------|
| Armor chip | `ArmorMechanic` (dormant plumbing; whip-immunity contract per ADR-backlog 2026-07-22) |
| Ambush reveal / tongue reel | `MimicMechanic` |
| Inhale pull | `LureMechanic` math |
| Slam/ring telegraphs | Telegraph Areas + Beat system (`ring`/`circle`) |
| Projectile deflection | `ReflectShieldMechanic` logic |
| Composite rendering | `BossRenderer.renderBossComposite` pattern |
| Throw pipeline | `TrapSystem` 'drop' mode + `pickupReadyAt` cooldown |
| Post-win hint | WiseFellow `rareSayings` |
| Captive reward | `CharacterSystem.spawnCaptive` |

**Prerequisites:** #215 (authored bosses miss boss-tier loot flags), #208/#141 (companion
interior pathing/collision — hard prereqs for pet descent), #130/#131 layer-leak discipline (route
all interior combat/effects through `_activeEnemies()` / `_activeBackgroundObjects()` from day
one).

## Glossary terms pending user authorship

**Dungeon Boss** · **Toss** · **Gold Breath** · **Gilded** · **Game Changer** (proposed; entries
are the user's to write per CLAUDE.md).
