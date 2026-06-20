# ASCII Roguelike — Zone Cosmology

The design framework behind the color zones. Read CLAUDE.md for the hard
constraints (zone colors, danger ordering, encoding rules); come **here** for
*why each zone exists* and what its identity is supposed to make the player feel.

This doc is a decision lens, not a spec. When adding a feature to a zone, check
it against that zone's **word** and **verb** below. If the feature doesn't say
the word, it probably belongs in a different zone — or nowhere.

---

## Core thesis: a color is a way of acting

A zone's identity is not a coat of paint. It is a **single word** (an *essence*)
that has to radiate coherently through three independent pillars:

| Pillar | The question it answers |
|--------|-------------------------|
| **Environment** | How does the world behave around you? |
| **Combat** | What kind of fighting does the zone reward? |
| **Puzzle** | What facet of the game's mystery does it reveal? |

A zone reads as *identity* (not biome) only when its word is legible in all
three pillars at once. The Storm Lands is the proof: **Storm = chaos + energy**,
and chaos+energy shows up in its environment, its magic-weighted combat, and its
element-essence puzzles simultaneously. The other zones have a *color*; the goal
is to give each one a *thesis*.

---

## The Power of 3 — the cosmology above the zones

*(Stated 2026-06-12. Supersedes the earlier "three endings / 3-slot rune"
structure from the foundation design — see the supersession notes at the end of
this section.)*

The zone cosmology below is the anatomy of the **world**. Above it sits the
anatomy of the **player**: three powers, plus one hidden. The whole game runs on
3s, and this is what the 3s *mean* — a commentary on how games are actually
played.

| Power | Player culture | What it is in play |
|-------|----------------|--------------------|
| **Experience** | The speedrunner | Mastery through repetition — recipe memory, route knowledge, deaths banked as learning. The game's "mental save file" made explicit. |
| **Instinct** | The roguelike player | Judgment under novelty — reflex and adaptation when nothing can be memorized, because every run is new. |
| **Convention** | Gaming in general | Genre literacy — axes chop trees, bosses guard exits, S goes home. Knowledge you brought *into* the game from every game before it. |

Every player is a blend of the three; every victory in this game is some mix of
them. The zone paths *resonate* with the triad (Instinct ↔ Red/React,
Experience ↔ Cyan/Anticipate, Convention ↔ Yellow/Channel-the-system, with
Green's greed underwriting why you play at all) — but the triad is about the
player, not the world. Treat the zone mapping as resonance, not law.

### The 4th hidden power: Canon

**Canon is the source code** — the designed truth all three powers derive from.
No matter how excellent the player is across experience, instinct, and
convention, all three are derivations of the greater power: what the author
actually wrote. True mastery is entirely dependent on it.

Hard representation rules:

- **Never named, personified, or itemized in-world.** No fourth slot, no dev
  room, no meta text, no lore entry. Breaking this rule cheapens the entire
  cosmology.
- **Indirect signatures only**: the alphabet (letter rooms, letter templates,
  typed glyphs), the typing mechanics, the systems and layouts, the fixed
  puzzle solutions. The *orderliness of the world* is canon's presence — rooms
  spell words because someone wrote the alphabet.
- **Geometric nod**: a triangle has 3 vertices and 1 implied center. The center
  is never given a slot.
- **The one near-direct appearance: the credits.** The authors' names — and
  they roll only at the true ending, after the player's agency has fully
  drained out of the game.

### The Triangle Room (hidden neutral room)

The power of 3 made into a place: a **hidden neutral room** containing **3
slots arranged in a triangle**, which accept **only 3 specific items** — one
per power. Everything else is silently refused (non-instructive: the slot
simply doesn't take it; no message).

**Proof-item rule — each item can only be earned by *exercising* the power it
represents.** Its provenance is its meaning; that is the whole discovery. No
riddle text anywhere. Proposed acquisition shapes (concrete items TBD):

| Power | Earned by | Proposed home |
|-------|-----------|---------------|
| **Instinct** | Pure execution no knowledge can substitute for | Red's boulder-deflect mastery (the Phase-3 cave alcove / Rockwarden) |
| **Experience** | Cross-run knowledge that cannot be stumbled into | Cyan/gray — a multi-zone recipe chain or stillness-revealed cache |
| **Convention** | Doing what games have always asked | A zone-boss trophy — the conventional victory |

On completion: **a single mark appears at the triangle's center.** Nothing
explains it. The center is canon's seat — implied by the three, never slotted.
This is the only in-world acknowledgment the 4th power ever gets.

*Supersedes the 3-slot rune item from the foundation design — the rune became a
room.* Open question: does completion also unlock the 2nd-Quest transform
(letter chars → rune glyphs — i.e. the alphabet rewritten, canon's loudest
indirect signature)? Recommended yes, as a transformed *mode*, not an ending.

### The True Ending — the Mist Battle

- **Trigger**: the **3rd** character mists out at gray depth 10. Three of the
  roster — *not all*. (Supersedes the 5-character threshold; the hooks already
  exist: `game.graySnapshots` carries each lost character's exact loadout,
  `game.lostCharacters` the roster, both run-scoped in GrayZoneSystem/main.js.)
- Instead of switching to the next survivor, the three lost characters appear
  in an arena with their snapshotted equipment. **The player has no input.**
  Auto-battle, last one standing → credits roll.
- **The player authors but does not control.** *Which* three characters you
  lost, with *what* gear, decides the field — then canon resolves it. The
  battle should be deterministic (seeded — the mulberry32/DemoSystem seam
  exists): the verdict was written the moment the third character was lost.
- This is the commentary made mechanical: the player's three powers contend
  without the player, every swing resolved by code they never touched — and
  when the last one falls, the authors' names appear. The game ends by showing
  its source.

### Endings restructure (supersedes the foundation design's three-endings list)

Still three endings — now one per *relationship with the game*:

1. **Win it** (Convention): defeat all 3 zone bosses in a single run — the
   natural Outrun conclusion. (Unchanged from the old "bad ending.")
2. **Know it** (Experience): complete the Triangle Room — the revelation beat.
   Recommended credits-less (a revelation that reframes the other endings),
   reserving the credits exclusively for the true ending.
3. **Yield to it** (True): the Mist Battle.

What's gone: the 5-character good ending (threshold is now 3 and it is the
*true* ending), and the rune-as-item (now the Triangle Room). The 2nd-Quest
transform survives only as a candidate Triangle Room unlock, no longer an
ending path.

### Death's inevitability — and the Infinite Loop

The game's initial hypothesis — the one every system teaches — is the obvious
one: **death is inevitable and a lesson; there is no escape.** Permadeath, no
persistence, gray as the sink where every path drains. The world states it as
law.

**Canon implies otherwise.** Code does not have to halt. The real-world
precedent is Pac-Man's level 256: a win state achieved where one was never
intended — players outlived an unbeatable game not through its rules but
through its arithmetic. The deepest reading of canon finds the seam where the
world's one absolute law breaks.

**The Infinite Loop** is this game's level 256: a hidden state in which the
run simply does not end. It is not an ending — it is the refusal of all
endings, and it completes the geometry: three endings are the vertices, and
the loop is the center — belonging to canon, never listed, never acknowledged,
never intended. *In fiction.*

Design rules:

- **It must read as a glitch, not a feature.** Discovered the way kill screens
  were: by pushing past where the design ends. No achievement, no text, no
  acknowledgment anywhere in or out of the game.
- **Corruption is its aesthetic.** As the loop deepens, canon's signatures
  degrade: the alphabet breaks down, letter templates render garbage glyphs —
  at depth 256, half the room is noise (the direct homage). The world decays;
  the player persists.
- **Death is suspended because death was designed.** Past the design's edge
  the world can no longer execute its own law — threats generate inert, broken,
  glyph-garbage. The player is immortal not by blessing but by the world's
  failure. The kill screen kills the *game*, not the player.
- **The only exit is voluntary.** Turning back, or the refresh that resets
  everything (no-persistence law holds — the loop is run-scoped). The one death
  canon cannot suspend is the player's real-world choice to stop. Outlive the
  design and mortality is handed back to the only place it ever really lived.
- **The double irony is the message.** Pac-Man's 256 was genuinely unintended;
  this one is *designed unintendedness*. Even the escape from canon's law is
  canon. No matter how far outside the rules you go, you are still inside the
  author.

**Trigger — open decision.** Two candidate shapes, recommended in combination:
(a) *endurance* — push a zone's depth far past the designed band, faithful to
the homage (255 levels of just not stopping); (b) *knowledge seam* — a
deliberately planted overflow/off-by-one in a depth counter or exit-letter
sequence, findable only by canon-level reading of the systems. Recommended:
the seam that opens the corridor is knowledge; walking it is endurance.

### The true power: Choice

Above the triad, above even canon: **freedom of choice — wielded alone by the
player, granted by the designer.** Canon restricts the player absolutely, but
only *as long as they choose to play*. Every moment of play is consent
renewed; quitting was never an escape from the game — it is the exercise of
the one power the game never owned.

This resolves the hierarchy into a circle:

- The **triad** are powers *of* playing — derivations of canon.
- **Canon** is the power of the design — absolute inside the game, void
  outside it.
- **Choice** is the power of *whether* — and the designer's deepest act of
  authorship is granting a power that outranks authorship. The restriction is
  the gift: choice with nothing to push against means nothing. Canon restricts
  *so that* choosing to play means something.

Two forms, only one of them free: every in-game decision (which exit, whether
to toss the coin, whether to keep walking the loop) is choice exercised
*within* canon's walls — choosing among options the designer wrote. The
unbounded form is the one outside the walls: keep playing, or stop.

Geometry: the triad are the vertices, canon the implied center — and choice
has no *point* on the figure because it is not a location. It is a
**direction: SOUTH.** The compass repeats the figure: three ways deeper
(N/E/W, into canon's world), one way out — and where the triangle's +1 (the
center) belongs to the designer, the compass's +1 (south) belongs to the
player.

**South is the freedom axis.** Every step south is more freedom. A combat
room offers N/E/W deeper or S back — continue or stop, asked again every
room, answered without words. REST is the first true station: the gameplay
loop genuinely paused — no enemies, no clock. And the axis must not stop
there:

- **Design rule — always a suspicion of further south.** Every south station
  should hint, without ever confirming, that further freedom is gated further
  south. The axis must never visibly terminate: south-facing geometry that
  reads as a sealed passage, a gate with no key, a road that leaves the map.
  The asymptote of the axis is the screen edge — the southernmost point is
  the player's own chair, and that final gate can never open in-game because
  the player is already standing outside it.
- **Sustain the suspicion economy.** A suspicion never once rewarded
  eventually dies. Recommended: at least one real "further south" exists — a
  deeper rest, a revelation room (candidate home for hidden neutral rooms,
  the Triangle Room included) — discovered rarely and unforgettably. And *it*
  hints south too.

Representation rules otherwise mirror canon's — never named, never itemized,
no meta text — with the remaining signatures already live in the design:

- **Arcade purity is the grant made generous**: no autosave, no lock-in,
  instant reset — leaving is always free, returning always costless. The
  no-persistence law is not just roguelike discipline; it is the designer
  refusing to hold anything hostage.
- **The Infinite Loop is its proof-chamber**: with death suspended and endings
  refused, choice is the only force still operating ("the only exit is
  voluntary," above).
- **The Mist Battle honors it in the negative**: the true ending is the one
  where choice is finally surrendered — no input — and only then does the
  designer appear, in the credits. The player's power and the designer's power
  meet exactly once, at the end: one yields, the other signs.

The commentary completes: the triad is *how* people play, canon is *what* they
play, and choice is *why* — nobody is compelled to play a game, and that
freedom is what makes any of the mastery mean anything at all.

---

## The four paths

The four colored zones are not biomes — they are **paths**, each defined by a
human drive and a *mode of acting in the world*. Green sits at the center;
red / yellow / cyan are the three petals around it.

| Zone | Name | Path | Word | Verb | The chase | "Class" | Mascot / anchor |
|------|------|------|------|------|-----------|---------|-----------------|
| **Green** | Verdant Wilds | **Verdant** | **Greed** | *Acquire* | Gold | Hoarder / Merchant | The crow + the well |
| **Yellow** | Stormlands | **Mage** | **Storm** (energy) | **Channel** | Power | Mage | Conductive storm |
| **Red** | Scorched Wastes | **Warrior** | **Reaction** (impulse) | **React** | Glory / strength | Warrior | Kinetic hazards |
| **Cyan** | Frozen Peaks | **Scholar** | **Stillness** | **Anticipate** | Knowledge | Scholar | The rabbit |

**Gold · Power · Glory · Knowledge** — the four oldest reasons anyone walks into
a dungeon.

### The spine: three relationships with time

Red's word is the keystone, because naming it reveals what the petals *are*.
Each path is a different answer to the question **"how do you act?"**

| Path | Verb | When you act | Tempo | Agency |
|------|------|--------------|-------|--------|
| **Cyan / Scholar** | **Anticipate** | *Before* — observe, wait, the world reveals | Slow; you set it | You yield to the world |
| **Red / Warrior** | **React** | *During* — the world hurls, you answer in the instant | Fast; it sets it | The world assaults you |
| **Yellow / Mage** | **Channel** | *Through* — manipulate essence, the world is your medium | Chaotic; co-created | You wield the world |

Greed (green) underwrites all three — there is reward to take in every mode.
Death (gray) ends all three equally.

---

## Green — the Verdant path (Greed) · CENTRAL

Greed is the **gateway drive**: the easiest motivation to feel, so the starting
zone uses it to teach the player to *want*. Green overlaps every other path
because all dungeon-delving is partly acquisitive.

**This is already the most-built theme in the game** — a give-to-get *ritual
economy of offering*, not just "pick up coins":

- **Coin** ingredient (`c`, `hasCoin()`) → crafted **Infused Coin** (`¤`),
  **Lucky Coin**.
- **The Well** (W room): throw a coin in → luck / crit ritual (`wellCoinAnim`,
  spinning-coin arc + flash).
- **The Fountain** (F room): throw a weapon to the fairies → upgrade or refusal.
- **Gems**: glittering rocks shatter into gemstones (`spawnGemstone`); gem wand.
- **Camp NPC**: pay a coin → hint or hire (`CampNPCSystem`, well-style arc).
- **The crow**: a literal hoarder that surrenders its shiny when startled, or
  bonds as a companion when fed (`Crow.js`).

Greed runs **both directions** — the urge to hoard *and* the rite of spending.
The crow is its mascot: greed you can hold in your hand and bribe.

### The permadeath koan

The game has **no persistence** — death resets everything (by design;
`PersistenceSystem` is permanently disabled). So Greed-to-*keep* is a trap the
game can never reward. The only wealth that survives a run is the *knowledge of
how to convert it* (coin→luck, weapon→upgrade, gem→power). Green teaches you to
want; the other paths teach you the hoard was never the point. Green and Cyan
are secretly the same lesson from opposite ends.

---

## Yellow — the Mage's path (Storm) · CHANNEL

**Storm = chaos + energy.** The player *is* the storm: the zone stacks
conductive objects and combat arcs lightning through them.

- **Environment** — forces act *on* you (wind, rivers push, lightning). *Note:
  the full ambient storm — always-blowing wind + occasional lightning strikes —
  currently lives on a separate branch, not main.*
- **Combat** — magic-weighted: energy, chain, ranged.
- **Puzzle** — the *essence & nature of the elements*; conductivity, element
  interactions; the connective thread into the game's larger mystery.

**Build status (this branch):** spawn tables `['lightning','storm']`,
conductive `objectWeights` (crystal `*`, metal box `B`, electrified puddle `~`),
and combat chain lightning (`CombatSystem.createChainLightning`,
`ExploreRenderer.drawChainArcs`) all exist. The "storm" feeling is currently
**emergent** from those — combat lightning + palette + naming — rather than an
ambient weather system.

---

## Red — the Warrior's path (Reaction) · REACT

The only path where **the environment has agency.** It doesn't wait to be
observed (Cyan) or channeled (Yellow) — it *comes at you*. Mastery is the
split-second answer.

**Signature loop:** `provoke → react with the right tool → the hazard becomes
your weapon.`

- **Environment** — kinetic hazards that double as weapons: rolling rocks
  deflected back with the matched tool; spreading lava lured across; spewing
  craters read and exploited.
- **Combat** — decisive force, reflex, confrontation.
- **Puzzle** — **kinetic redirection.** Inject a hazard + a tool-match into a
  room and the reactive answer *is* the solution. Canonical example: deflect a
  **rolling boulder** with a **hammer** (`INTERACTION_TYPES.BLUNT` — the "right
  tool"; a blade or bullet won't turn it) into a **blocked cave**, smashing it
  open. Built by **augmenting Green's U room** (Underground — passive foraging)
  into an active forced entry; the cave yields gems (an R-room drop), making it
  the **Green × Red "Raider"** overlap in room form. See *Augmentation* below.

**Red is the Mage's mirror:** both turn environmental hazards into weapons, but
Yellow does it by *deliberate placement* (premeditated, essence-driven) and Red
does it by *reflexive redirection* (in the instant). Same materials, opposite
mind.

**Build status:** Red is already the most environmentally-developed zone — the
*only* one with a real `environmentalFeatures` block (`zones.js`): lava
(`liquidType`, `liquidDamage`), `mudBeds`, `rockVariants`, `grassDensity`. And
**`BoulderSystem` already rolls cardinal-direction boulders in red rooms**
(contact damage + knockback, red-zone-gated, already wired into `BossSystem`
via `triggerBoulderRain`).

### Boulder deflect — confirmed mechanic & build arc

The canonical Red puzzle, fully specified:

- **Hammer hit** (`attack.canSmash` — the "right tool") **redirects + empowers**
  a rolling boulder: snaps its heading to the cardinal axis away from the player
  and doubles **speed and damage**. The hazard becomes the player's weapon.
- **Deflector rocks** turn a boulder 90° on contact — **intrinsic to the
  boulder, empowered or not.** Normal boulders bounce to *teach* the rule;
  empowered boulders bounce so a charged one can be *routed*.
- **The cave wall's HP is the gate:** above a normal boulder's damage, at/below
  an empowered one's — so only a hammer-charged boulder breaks through. The
  deflector rocks teach *routing*; the cave's toughness teaches *empowerment*.
  No tutorial text.
- **Reward:** breaking the cave opens a **deeper underground alcove with
  chests** — a bigger payoff for the harder route (the Green × Red "Raider").
- **Mastery payoff = the boss room.** `BossSystem` already rains boulders, so a
  player who learned the deflect turns the boss's own barrage into the kill.
  Arc: *introduce → bounce teaches routing → cave teaches empowerment → boss
  rewards mastery.*

**Build status:** Phase 1 (deflect + empower) and Phase 2 (deflector rocks)
**built** in `BoulderSystem`. Boulders carry `vx/vy/empowered/lastDeflector`;
hammer strike redirects + empowers; 4 elbow deflectors (`7`/`r`/`L`/`J` =
NE/NW/SE/SW, in `BACKGROUND_OBJECTS`) bend a boulder 90° between their two open
sides or stop it on a solid side. Not yet built: breakable cave wall + chest
alcove (Phase 3), red-augmented U-room layout that places the puzzle (Phase 4),
and in-room **placement** of deflectors (currently no spawn path — needs Phase 4
or a cheat-spawn to test). The deflect reuses the `ChargeMechanic` /
`ParryMechanic` knockback seams.

---

## Cyan — the Scholar's path (Stillness) · ANTICIPATE

Stillness here is **not** a threat — it is a discipline the zone trains:
**restraint, observation, focus.** The reward for stillness is *seeing what the
hurried miss*. Cyan's currency is **knowledge**, which is also the game's only
real save file — making Cyan the zone that themes the whole game's philosophy.

Cyan **most emphasizes the Environment pillar**: the world is a field of
mysteries that hide from motion and open to stillness.

- **Environment** — phenomena that only reveal to the patient observer: tracks
  that resolve when you stop; frost patterns that finish drawing; things under
  translucent ice; creatures that freeze when you move.
- **Combat** — control, precision, patience (stasis / read-and-punish).
- **Puzzle** — preservation: thaw to release what time froze; read frozen
  tableaux; "COLD AND ANCIENT."

### The rabbit — the Scholar's mascot (design intent)

A **neutral** creature (belongs in `NeutralRoomSystem` — enemies demand motion,
observation demands safety) that burrows when the player **moves** and reemerges
when the player holds **still**. It is the deliberate inverse of the crow:

| | **Crow** (Green / antechamber) | **Rabbit** (Cyan / Scholar) |
|---|---|---|
| Reacts to | Your **aggression** | Your **motion** |
| Returns when | A **timer** elapses (its clock) | *You* hold still (your discipline) |
| Rewards | **Generosity** → companionship | **Observation** → discovery |
| Lesson | "The world responds to how you treat it" | "The world reveals to those who hold still" |

Both teach with **zero text** (non-instructive, per CLAUDE.md). The crow returns
on *its* schedule; the rabbit returns on *yours* — that single difference is the
whole Scholar's path: the player, not the world, holds the key, and the key is
restraint.

**Arcade-purity guardrail:** never gate progress on standing still. The reward
must be **visible and optional** — the impatient player passes through and loses
nothing they needed; the scholar *notices*, waits a beat, and gets a bonus.
Waiting must feel like anticipation, never a loading screen.

---

## The Venn — overlaps between paths

The zones already blend mechanically: `ZoneSystem.getBlendedEnvironmentColors()`
cross-fades palettes on transition, and each zone lists `alternativeZones` it
bleeds into. So the overlap regions are real — the **transition rooms** where
one path is becoming another.

### The three petal-overlaps (secondary archetypes)

| Overlap | Blend | Archetype | Feel | Existing seam |
|---------|-------|-----------|------|---------------|
| **Red × Yellow** | Force + Power | **Spellblade** (*Fury*) | Two "loud" paths fused → overwhelming offense; the blade that carries the storm | Gem wand, elemental/infused weapons |
| **Yellow × Cyan** | Power + Knowledge | **Sage / Arcanist** (*Mastery*) | The quiet caster; power through comprehension, not raw channeling | Conductivity / essence puzzles |
| **Red × Cyan** | Force + Observation | **Hunter / Duelist** (*Discipline*) | The held breath before the kill; **the parry** = anticipate-then-react | **`ParryMechanic` already exists** |

Red × Cyan is the richest because Red and Cyan are *tempo opposites* (loud/fast
vs quiet/slow). Their overlap is built from contradiction: coiled stillness
releasing into force. **The parry is literally Anticipate + React fused.**

### Green's overlaps (greed in everything)

- **Green × Red** → **the Raider** — take wealth by force.
- **Green × Yellow** → **the Artificer / Alchemist** — *make* value (gem wand,
  Infused Coin; lead into gold).
- **Green × Cyan** → **the Treasure-Hunter** — *find* hidden wealth by looking
  (the rabbit that digs up a cache lives here).

### Overlaps as room augmentations

The concrete answer to *"what **is** an overlap, mechanically?"*: a petal does
not invent room types from scratch — it **augments an existing Green archetype
by injecting its verb.** Same room, new stance. This reuses the letter-template
system (`letter-template-system.md`) instead of hand-building rooms, exactly the
system-level move CLAUDE.md asks for.

Worked on Green's **U room** (Underground — passive foraging):

| Augment U with… | Verb | The beat | Overlap |
|---|---|---|---|
| **Red** (kinetic hazard + tool-match) | React | Deflect a boulder into the blocked cave to break it open | **Raider** — take buried wealth by force |
| **Cyan** (reveal-on-stillness) | Anticipate | The cave opens only to the patient (the rabbit digs it out) | **Treasure-Hunter** — find hidden wealth by looking |
| **Yellow** (conductive medium) | Channel | Chain lightning through the cave to crack it | **Artificer** — make value through power |

So the Venn overlaps and the room-augmentations are the **same idea at two
scales**: a Green room wearing a petal's verb. Reusable rule — to build a petal
puzzle, start from a Green archetype and add the petal's verb as the solution.

**Still open:** do the overlaps *also* surface as **hybrid character classes**
(note `Cryomancer`, `Storm Caller` already in the character roster), or only as
augmented rooms?

---

## Gray — the terminus (Death)

Gray (Realm of the Dead) is **not a petal** — it is the *sink* beyond the
diagram, where every path drains. Death is the one thing all four drives share,
and the engine already enforces it: `hardMode`, `noRest`, no persistence.

The Raider's plunder, the Sage's mastery, the Hunter's discipline, the hoarder's
gold — gray takes all of it equally. It is the thematic punchline: the paths
spend the whole game arguing about what's worth chasing, and gray answers *none
of it survives — only what you learned*. That loops the endgame back to the
Scholar's currency (memory) and the game's one real save file. The cosmology
closes on itself.

*(This is the game's stated law — its initial hypothesis, not its verdict.
Canon implies otherwise: see "Death's inevitability — and the Infinite Loop"
in the Power of 3 section above.)*

*(Blue / Tidefall sits outside the cosmology too — a special linear zone, not a
path. Not everything should be a path.)*

---

## How to use this doc

When proposing a zone feature, ask:

1. **Which word does it say?** If it doesn't say the zone's word, reconsider the
   zone — or the feature.
2. **Which verb does it reward?** Anticipate / React / Channel / Acquire. A
   feature that rewards the wrong verb fights the zone's tempo.
3. **Does it reward knowledge or shortcut it?** (CLAUDE.md core test.) Cyan and
   the permadeath koan make this the spine of the whole game.
4. **Non-instructive?** Teach through behavior, like the crow and the rabbit —
   never through text.

**Build-readiness, highest to lowest:** Green (greed economy largely built) →
Red (only zone with `environmentalFeatures`; kinetic hazards are extensions) →
Yellow (emergent storm exists; ambient weather on a separate branch) → Cyan
(palette only; rabbit, sliding, thaw all design intent).
