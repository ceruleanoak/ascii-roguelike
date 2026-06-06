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
- **Puzzle** — *(open)* likely transformation/consequence: irreversible,
  in-the-moment.

**Red is the Mage's mirror:** both turn environmental hazards into weapons, but
Yellow does it by *deliberate placement* (premeditated, essence-driven) and Red
does it by *reflexive redirection* (in the instant). Same materials, opposite
mind.

**Build status:** Red is already the most environmentally-developed zone — the
*only* one with a real `environmentalFeatures` block (`zones.js`): lava
(`liquidType`, `liquidDamage`), `mudBeds`, `rockVariants`, `grassDensity`.
Rolling rocks / spreading lava / spewing craters are those **static features
turned kinetic** — design intent, not yet built. The deflect beat can reuse the
`ChargeMechanic` / `ParryMechanic` seams.

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

**Open question:** do the overlaps become *transition rooms*, *hybrid character
classes* (note `Cryomancer`, `Storm Caller` already in the character roster), or
both?

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
