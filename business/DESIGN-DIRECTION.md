# Pure Rogue — Enemy & Zone Design Direction

*Companion to `business/STRATEGY.md`. Grounded in `claudedocs/zone-cosmology.md` and the live data schema (`src/data/enemies.js`, `zones.js`). Last assembled 2026-06-09.*

**Premise (from the brief): treat everything currently in place as placeholder.** The engine is mature and the cosmology is excellent, but the *content* — which enemy means what, what each zone makes you feel — is mechanically wired and thematically generic. This file is the design layer that turns the cosmology's four words into concrete, buildable enemies and zones. It is written as **briefs the dev side implements**, not code. Each brief maps onto the real enemy schema so it's drop-in.

These are design proposals made autonomously to keep content moving ahead of the dev schedule. They're meant to be edited, not obeyed — push back on anything that fights the feel.

---

## 1. The design test every enemy and room must pass

From the cosmology, four questions (do not add content that fails them):

1. **Which word does it say?** Greed / Storm / Reaction / Stillness. An enemy that doesn't express its zone's word belongs in another zone or nowhere.
2. **Which verb does it reward?** Acquire / Channel / React / Anticipate. The enemy's *threat pattern* should make the player perform that verb to win. This is the core move: **the enemy is a teacher of the zone's verb.**
3. **Does it reward knowledge or shortcut it?** Patterns the player learns and internalizes — never stat checks or RNG walls.
4. **Is it non-instructive?** It teaches through behavior and telegraph, never text. Every enemy needs a *readable tell* before its threat.

### Encoding & schema rules (hard constraints, already in CLAUDE.md)
- **Enemies are printable ASCII letters/digits** (`a–z`, `A–Z`, `0–9`). Crafted items are Unicode symbols — never use those for enemies. No emoji, no box-drawing.
- **Drops are raw ingredients** = letters/digits only (they're never crafted). Each enemy should drop something its zone's economy actually uses.
- Design levers available on every enemy (from the schema): `hp`, `speed`, `acceleration` (darty vs. floaty), `mass` (knockback resistance), `damage`, `attackRange`, `aggroRange`, `attackCooldown`, `attackWindup` (**the telegraph** — bigger = more readable), `attackType`, `decisionInterval` (how "smart"/reactive), plus per-enemy flags like `grassStealth`. **Tune the verb through these, not through new code where possible.**
- Movement profiles live at the **zone** level (`movementProfiles: ['chaser','keeper','kiter','ambusher',…]`) and the spawner assigns them. Design enemies to fit their zone's declared profiles; propose a new profile only when the verb demands it.

### Telegraph is the whole game
Real-time + permadeath means **every death must feel earned**, which means every threat must be *seen coming*. Design rule: the more damage an attack does, the longer and more distinct its `attackWindup` tell. The skill the player banks (their "save file") is *pattern recognition of telegraphs*. Cheap, un-telegraphed damage is the one unforgivable design sin here — it converts skill into luck and breaks the permadeath contract.

---

## 2. Green — Verdant Wilds · word **Greed** · verb **Acquire**

**Finish the identity.** Green is the teacher of *want*. It's already the most-built zone (the give-to-get ritual economy: well, fountain, crow, gems). The enemies' job is to **make acquisition feel risky and tempting** — they should guard, hoard, or *become* loot. Green is also the tutorial zone, so its roster must teach the three base combat reads (melee chaser, ranged keeper, pack kiter) cleanly, with generous telegraphs.

**Environment direction:** lush, legible, safe-feeling but not safe. Tall grass that hides things (the `grassStealth` flag already exists — lean into it as Green's signature: the wilds conceal). Green's danger is *temptation*, not pressure.

**Designed roster (de-placeholdering the current weak/normal set):**

| Glyph | Name | Profile | Verb it teaches | Mechanical hook | Drops |
|------|------|---------|-----------------|-----------------|-------|
| `r` | **Pack Rat** | chaser | Basic melee read | Fast, darty (`acceleration` high, low `hp`), `grassStealth` — teaches "the grass is dangerous." Comes in pairs. Long enough windup to dodge. | fur, teeth |
| `k` | **Magpie** | kiter | Greed, literally | *Steals* a held ingredient on contact and flees toward the room edge; kill it to reclaim the drop + a bonus shiny. The crow's hostile cousin — greed turned against you. | coin, shiny |
| `b` | **Bristleboar** | chaser | Commit vs. retreat | Telegraphed charge (big `attackWindup`, high `mass` so it doesn't get knocked); sidestep the charge, punish the recovery. The first "real" pattern. | meat, hide |
| `j` | **Sap Slinger** (jelly) | keeper | Ranged spacing | Lobs slow sap globs that leave a brief slow-puddle; teaches "respect zoned ground." | goo |
| `h` | **Hoarder Beetle** | ambusher | The loot-guard | Sits *on* a gem/chest node disguised as a rock (`0`-like) until approached, then wakes. Reward for clearing it is the node it guarded. Pure Green: the treasure bites back. | gem, carapace |

**Boss — the Greed test.** Keep the existing `BOSS_ENCOUNTERS.giant_slime` / `goblin_army` slots but reframe one as a **greed dilemma**: e.g. the **Goblin Chief** sits on a visible hoard; the longer you take, the more followers rally — so the boss *rewards the player who already banked enough knowledge to kill fast* and punishes the greedy who over-extend. The boss says the word.

---

## 3. Red — Scorched Wastes · word **Reaction** · verb **React**

**Finish the identity.** Red is the only path where **the environment has agency** — it comes at you. It's already the most environmentally-developed zone (lava, mud beds, rock variants, the BoulderSystem). The enemies must reinforce *react*: short tells, decisive force, hazards that double as weapons. **No kiting, no hovering** — the zone's declared profiles are chaser / keeper / ambusher, and that's correct. Red is loud and fast.

**Environment direction:** lava rivers, rolling boulders, spewing craters, spreading flame. The signature loop is *provoke → react with the right tool → the hazard becomes your weapon* (canonical: hammer-deflect a boulder into a cave wall). Enemies should plug into that loop, not sit beside it.

**Designed roster:**

| Glyph | Name | Profile | Verb it teaches | Mechanical hook | Drops |
|------|------|---------|-----------------|-----------------|-------|
| `E` | **Ember Sprite** | chaser | Fast read, low cost | Cheap, fast, low-hp swarm-let; trivial alone, dangerous while you're handling a hazard. Teaches "react under pressure." | ash, spark |
| `p` | **Pyroclast** | keeper | Read incoming arcs | Spews telegraphed lobs that leave fire tiles; punishes standing still — the anti-camper. | cinder, sulfur |
| `0` | **Living Rock / Magma Slug** | ambusher | Hazard-as-enemy | Disguised as terrain (`0`), erupts when stepped near; can be **knocked into lava** or **hit by a deflected boulder** for an instant kill — the enemy *is* a hazard you redirect. | stone, ore |
| `f` | **Fire Bat** | chaser | Reflex dodge | Fast diving attacker with a sharp, short tell — the pure "react in the instant" enemy. | wing, ember |
| `R` | **Rockwarden** (mini-boss) | ambusher | Mastery of the loop | Guards the breakable cave; immune to normal hits but **takes lethal damage from an empowered/deflected boulder** — the enemy that forces the player to execute Red's signature puzzle to win. | rare gem |

**Boss — the Reaction test.** `BossSystem` already rains boulders. The boss room *is* the exam: a player who learned the hammer-deflect turns the boss's own barrage into the kill. Don't add a separate gimmick — let mastery of the zone's hazard be the win condition. The boss says the word by *being* the hazard at maximum volume.

---

## 4. Yellow — Stormlands · word **Storm (energy)** · verb **Channel**

**Finish the identity.** Yellow's thesis is **chaos + energy**, and the player *is* the storm — combat arcs lightning through conductive objects (`CombatSystem.createChainLightning` exists; conductive object weights exist). The gap: it currently reads as "emergent storm" (palette + chain lightning) rather than an identity. Enemies must make **conductivity a decision** — the player should *want* to position enemies and objects so their energy chains.

**Environment direction:** conductive clutter (crystal `*`, metal box `B`, electrified puddle `~`) as the medium you channel through. The full ambient weather (always-blowing wind + lightning strikes) lives on a branch — design assumes it lands. Wind that pushes, water that conducts, strikes that punish open ground.

**Designed roster (Yellow is the most under-themed — biggest design opportunity):**

| Glyph | Name | Profile | Verb it teaches | Mechanical hook | Drops |
|------|------|---------|-----------------|-----------------|-------|
| `e` | **Spark** | chaser | Conductive basics | Low-hp, but **standing in a puddle or near crystal when it dies arcs to nearby enemies** — teaches "energy chains; group them." | spark, charge |
| `c` | **Conductor** (cell) | keeper | Positioning | Periodically *electrifies the nearest conductive object*, turning safe ground hostile; teaches reading the conductive map. | wire, coil |
| `W` | **Storm Wisp** | hover | Channel through medium | Floats, immune to direct hits while airborne, but **a chained arc through water/metal grounds and stuns it** — you must *channel*, not swing. (Justifies a `hover` profile for Yellow.) | essence, static |
| `B` | **Charged Husk** | chaser | Risk/reward conductivity | Slow, armored, but **conducts** — hit it next to other enemies and the arc cascades. High `mass`, telegraphed slam. | metal, core |
| `K` | **Tempest Caller** (elite) | keeper | Storm mastery | Summons a moving lightning-strike telegraph (read the ground flash, leave the tile) while weaving conductive hazards — the channel exam in miniature. | stormgem |

**Boss — the Channel test.** A boss that is *only* vulnerable while the player routes energy through the room's conductive objects into it (immune to direct hits at range, like the Storm Wisp scaled up). The player wins by *wielding the world*, which is the verb. This is the zone most worth investing design time in because it currently has the least identity for the most built mechanics.

---

## 5. Cyan — Frozen Peaks · word **Stillness** · verb **Anticipate**

**Finish the identity.** Cyan is currently *palette only* (lowest build-readiness) — so it's the cleanest slate and the most thematically important, because **knowledge is the game's only real save file** and Cyan themes the whole game's philosophy. Stillness is a *discipline the zone trains*: restraint, observation, read-and-punish. The reward for patience is *seeing what the hurried miss*.

**Environment direction:** phenomena that reveal to the patient and hide from motion — tracks that resolve when you stop, frost patterns that finish drawing, things under translucent ice, creatures that freeze when you move. **Guardrail (critical): never gate progress on standing still.** The reward must be visible and *optional* — the impatient player passes through and loses nothing they needed; the scholar notices and gets a bonus. Waiting must feel like anticipation, never a loading screen.

**Designed roster (read-and-punish, control, precision):**

| Glyph | Name | Profile | Verb it teaches | Mechanical hook | Drops |
|------|------|---------|-----------------|-----------------|-------|
| `t` | **Tortoise / Frostback** | keeper | Patience | Armored front (immune from ahead), soft from behind; **only turns slowly** — anticipate its facing, don't rush it. | shell, frost |
| `w` | **Wraith** | hover | Read the tell | Phases in and out on a fixed rhythm; only damageable (and only dangerous) while solid — punish on the beat you *anticipated*, not on reflex. | ectoplasm |
| `i` | **Icestalker** | ambusher | Stillness as info | Invisible while *you* move; its outline resolves when you hold still for a beat — the hostile mirror of the rabbit. Optional to engage, lethal if ignored. | ice shard |
| `s` | **Snow Sentinel** | keeper | Precision window | Long, very readable wind-up to a heavy strike that's lethal if you flinch early and free if you wait — trains the held breath. | stone, frost |
| `d` | **Duelist (Frozen)** (elite) | keeper | Anticipate + React | Mirrors player movement; the **parry** (`ParryMechanic` exists) is the intended answer — anticipate the thrust, release into the counter. This is the Red×Cyan "Hunter" overlap made flesh. | steel, rime |

**The rabbit (neutral, not an enemy — but design it here for completeness).** Belongs in `NeutralRoomSystem`. Burrows when the player moves, reemerges when the player holds still; rewards observation with a dug-up cache. It's the deliberate inverse of the crow (crow reacts to aggression on *its* timer; rabbit reacts to motion on *your* discipline). Zero text. It is Cyan's mascot and the single clearest expression of the whole game's thesis — **build it early as the zone's signature.**

**Boss — the Anticipate test.** A boss with a fully readable but punishing pattern — no RNG, all rhythm — that is unbeatable by mashing and trivial once *read*. The boss is a pattern to be learned, which is literally the zone's currency (knowledge).

---

## 6. Gray — Realm of the Dead · the terminus (Death)

Gray is **not a path** — it's the sink where every drive drains (`hardMode`, `noRest`, no persistence). Design it as a *remix*, not a new roster: it should feel like the other zones' enemies stripped of their rewards. Undead echoes of earlier foes (the spawn table is already `['undead','boss']`) — same telegraphs the player learned, now with no loot to acquire, no hazard to exploit, just the patterns themselves. **Gray is the final exam in pure pattern recognition** — the punchline that *only what you learned survives.* Keep it short, brutal, and reverent. Don't over-design it; its power is thematic.

---

## 7. Blue — Tidefall (secret, outside the cosmology)

A special **linear** 4-room zone (Shallows → Reef Walk → Wake → …), not a path. Treat it as an authored set-piece / easter egg, not a system to scale. Its job is *surprise and reward the curious* — it's a marketing asset (a "did you find the secret zone?" hook for the community) more than a core loop. Design effort here is low-priority but high community-delight per hour.

---

## 8. Cross-cutting: the six characters should embody the six paths

The roster (`Gold Hero`, `Green Ranger`, `Red Warrior`, `Cyan Rogue`, `Yellow Mage`, `Gray Assassin`) already maps to the cosmology. Finish the mapping so **character choice expresses a verb**: the Red Warrior should *want* to react (bonus to parries/deflects), the Yellow Mage to channel (bonus to chain/conductivity), the Cyan Rogue to anticipate (bonus on read-and-punish), the Gold/Green to acquire (bonus to loot/economy). A character that doesn't reward its path's verb is placeholder. This is the cheapest, highest-leverage de-placeholdering available — it's tuning, not new systems.

---

## 9. Build order (design-readiness × impact)

Ordered to put the most identity on screen for the least new code, matching the cosmology's build-readiness ranking:

1. **Green roster finish** (most built; tutorial zone; the Magpie + Hoarder Beetle make greed *legible* immediately). High impact, low cost.
2. **Red Rockwarden + hazard-as-enemy** (BoulderSystem already exists; ties enemies into the signature puzzle). High impact, low cost.
3. **Character-verb tuning** (six characters, pure tuning, makes the whole cosmology playable). Highest leverage per hour.
4. **The rabbit** (Cyan's mascot, neutral, the clearest thesis statement; great devlog/marketing beat). Medium cost, high brand value.
5. **Yellow conductivity enemies** (Spark/Conductor/Storm Wisp turn emergent storm into identity; most under-themed-for-most-built). Medium cost, high impact.
6. **Cyan read-and-punish roster** (clean slate; needs the most new behavior). Higher cost, do after Yellow.
7. **Gray remix + Blue polish** (thematic capstones; low urgency).

**Marketing note (cross-ref `STRATEGY.md` §4/§6):** items 1, 2, and 4 each make a *visible, explainable* change — exactly the kind of thing the weekly social-cut and devlog jobs turn into content. Sequence design and marketing together: every de-placeholdered piece is also a post.
