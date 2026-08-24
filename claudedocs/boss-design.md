# Boss Design

The design lens for the **required stages of the delve** — the gated encounters a run must pass
through. Sits alongside `zone-cosmology.md` (which supplies each zone's word and verb) and
`enemy-combat-design.md` (which covers ordinary enemy behavior). `legend-of-three.md` supplies the
per-zone item triad that the *second* layer draws on.

Read this before touching `BossSystem.js`, any boss entity, `BOSS_ENCOUNTERS`, or the miniboss
gate in `roomFeatures.js`.

Status of each section is marked: **Ratified** (the user's decision, captured verbatim in
substance), **Observed** (read off the code as it stands), **Open** (gap awaiting the user's
authorship — do not fill it in).

---

## The governing principle — Ratified 2026-08-23

> **Observe and learn to access the path to victory.**

A boss is not an HP bar with more HP. A boss is a **closed door with a visible lock**. The fight
teaches the player where the lock is, and the win condition is having *learned the access*, not
having ground the number down. Damage is what you spend once you have access; access is the puzzle.

This is why every coded zone boss gates damage behind a discovered channel rather than accepting
hits anywhere:

| Zone | The lock | The learned access |
|------|----------|--------------------|
| Green | Body accepts hits, but the fight is a war of attrition without the trick | Reflect the dragon's own projectile back — stuns for 6s, opens the real damage window |
| Red | Shell rejects every direct hit in phase 1 (`TurtleShell.takeDamage` returns false unless `source === 'head'`) | Damage routes only through the extended head; phase 2 flips the shell and exposes the whole body |
| Cyan | Boss is `invulnerabilityTimer = 9999` while underwater and while slamming | Only the surfaced window is real; the player must read the tell and be in position for it |

The principle is the through-line, and it generalizes past the current three. It is the reason a
boss earns its gate at all — a required stage that only asked for damage output would be a wall,
not a stage.

**This is ADR territory.** A candidate row is filed in `docs/adr/BACKLOG.md` (surfaced 2026-08-23);
the ADR's reasoning is the user's to author.

---

## Two layers — Ratified 2026-08-23

### Layer 1 — Zone Bosses (coded)

The conventional victory. One per zone, gated at `zones.js` `bossDepth`, preceded by a required
**Miniboss** at depth 9 (`ZoneSystem.isMinibossRequired`, gray excluded) and a forced-north
pre-boss gate at `bossDepth - 1` (`ExitSystem`). Defeat is recorded per-run in
`ZoneSystem.defeatedBosses`.

### Layer 2 — Dungeon Bosses — **Open**

> "the definitive '2nd layer' of the game"

**Nothing exists.** `grep -rn -i "dungeon boss\|dungeonBoss" claudedocs/ src/ docs/` returns zero
hits — no code, no data, no prior documentation. This section is a deliberate stub.

What is established:

- The **Legend of Three** trophy payload (Justice / Truth / Help, per zone) belongs **here**, not
  to zone bosses. `legend-of-three.md` already states its intended consumption is "what shows up as
  notable finds inside Dungeon interiors (`DungeonSystem`)."
- The Dungeon floor graph is already branching and uncapped — `DungeonSystem`'s `floor.descents[]`
  destination-graph model has no `MAX_FLOOR_INDEX`; the Pyramid (floor index 3) is terminal only
  because its own `descents` is empty. A Floor 5/6 is added as a new descent, and the ADR backlog
  row for that rework (2026-08-13) already names the blocker as "user-authored boss/legendary-weapon
  content."

Everything else — what a Dungeon Boss *is*, how many, how they gate, what the trophy does — is the
user's to write. Do not invent it.

> **Correction on record:** an earlier analysis (2026-08-23) claimed the zone-boss reward
> (`BossSystem._grantBossReward` → +1 consumable slot) fails to deliver the Legend of Three trophy
> the cosmology asks for. That was built on a wrong premise. The uniform slot reward is the
> *conventional* victory's payout; the trophy is layer 2's. The zone-boss reward is not, on that
> basis, a defect.

---

## Per-zone direction

Each zone boss must express its zone's **word and verb** from `zone-cosmology.md`. That is the
test: a boss whose lock has nothing to do with its zone's verb is a boss in the wrong zone.

### Green — Greed / *Acquire* — Ratified 2026-08-23

**The Goo Dragon predates the cosmology.** It was coded before `zone-cosmology.md` was written, and
its reflect-the-projectile lock was not authored against Greed. The reframe that reconciles it:

- **Getting close early — being impatient — is the greed.** The fight already punishes proximity
  (side heads grab; phase 3 detaches them into DVD-bounce goo shooters; `floatCenter` drifts toward
  the player at 5.6 px/s). Reading that pressure as *greed for a fast kill* makes the existing
  mechanic express the zone's word without inventing a new one.
- **End the fight with a boon of coins and treasure.** On theme for a dragon (a hoard), and on
  theme for Greed — the zone's word is finally *paid out* rather than only punished.
- **Purpose of the boon: make green the natural first "achievement."** Zone choice is open from the
  start, so the zones compete for the player's first delve. A treasure payout is the incentive that
  makes green the one they pick first.

Note the treasure boon would be the **second** encounter-specific reward in the whole boss system
(the first is the Centipede's `¬` gun drop, `roomFeatures.spawnCentipedeGunDrop`). Every other boss
grants the same uniform `_grantBossReward()`. That is a system-shape decision worth surfacing when
it is implemented, not a blocker on the ideal.

### Yellow — Storm / *Channel* — Ratified 2026-08-23 (concept)

Yellow is still early in development. Current state (Observed): **yellow has no boss of its own.**
`BossSystem.activate()` falls through its `else` branch to `GooDragon`, so yellow inherits green's
boss verbatim. `zones.js` also gives yellow **no `bossPool`**, so its required depth-9 miniboss
falls to the generic `createBossEnemy()` doubling (2× hp, 2× damage, magenta tint) rather than an
authored encounter.

The direction:

- **A boss that changes affinity and color throughout the fight.**
- **It may assume mana access and awareness have been exposed by 10 rooms.** By `bossDepth: 10` the
  player has had a full zone to meet the magic meter; the boss is allowed to require that literacy
  rather than teach it.

Read against the governing principle: the shifting affinity *is* the lock. Access is not a fixed
channel to find once — it is a channel that keeps moving, and the player must read the current
color to know which answer is live. That is *Channel* as a verb.

### Red — Reaction / *React* — Ratified 2026-08-23 (fixes)

The lock (damage routes only through the head in phase 1) is correct and expresses *React*. Two
game-feel defects undercut it:

1. **The head's emergence needs a delay.** It is currently instant on the shell stopping —
   `TurtleShell._updateRolling` sets `headRevealPending = true` in the same frame it zeroes
   `ricochetVx/Vy`. There is no beat between "it stopped" and "the head is out," so there is nothing
   to react *to*; the reaction window and the tell are the same instant.
2. **The shell has no sense of momentum.** Movement is raw `position += ricochetV * deltaTime` with
   hard axis-flip bounces, and the stop is an assignment to zero. No acceleration, no deceleration,
   no weight. An "Ancient Shell" that reaches full speed and full stop in one frame reads as a
   sprite being teleported, and it removes the wind-down the player would otherwise use to
   anticipate the stop.

Both are logged as P2 entries in `known-bugs.md` (#213, #214).

The connection between the two is the point: **decel is the telegraph.** A shell that visibly slows
before stopping tells the player the head is coming, and the emergence delay is the window they
were given to act on that reading. Fixing either alone gets half the value.

### Cyan — Stillness / *Anticipate* — Ratified 2026-08-23 (phase 2 rework)

Current state (Observed): **cyan has no real phase 2.** `LakeBoss`'s `ENRAGED_THRESHOLD` (40% HP)
changes color and nothing else. The whole fight is one loop — `_pickNewTarget()` selects a
**random** water tile at least 5 cells away, the boss surfaces there, slams, and submerges; the
only escalation is `_getAttackCooldown()` tightening from 12s to 4s as HP falls. Randomness is the
wrong pressure for *Anticipate*: you cannot anticipate a coin flip.

The rework — a real phase 2, and a very powerful escalation:

- **The boss freezes the whole of the water.** The board flips. Note this is the *inverse* of the
  current ice hammer, which sets `pendingIceBreak` and expands a shockwave that **thaws** frozen
  water. Phase 2 runs the mechanic backwards.
- **It actively hunts the player's position** instead of emerging at random. This is the core of the
  change — the threat becomes readable, and therefore anticipatable.
- **A greater delay while the player slips around on the ice.** The frozen board changes the
  player's movement contract (slick, low control) at the same moment the boss's approach becomes
  legible. Longer delay is not mercy; it is the anticipation window, and the ice is what makes
  spending it correctly hard.
- **It crashes up through the ice.** The emergence is a break, not a surfacing.
- **It ends close, vulnerable, and enraged** — with **only a sliver of water as a gap** separating
  the player (on the ice) from the emergent boss.

The final image is the design: the reward for anticipating correctly is being *dangerously close to
a vulnerable, enraged boss*, with a hand's width of water between you. Access earned, and the price
of holding it made vivid.

### Gray — Observed, no direction on record

Gray has **no `bossDepth`** — it ends at `maxDepth: 10` with the mist-out, not a boss. It carries a
`bossPool` (`bone_legion`, `grave_tyrant`) but is explicitly excluded from
`isMinibossRequired`. Whether the terminal zone should have a required stage at all is an open
authorial question, not a gap to fill mechanically.

### Blue — Observed, out of scope

Four linear rooms, neither `bossDepth` nor `bossPool`. Per `blue_zone_design`, blue's job is to
train water-activation for export to other zones; a required stage is not obviously part of that.

---

## Vocabulary gap

The code uses **Miniboss** throughout (`room.isMiniboss`, `ZoneSystem.isMinibossRequired`,
`defeatedMinibossEncounters`, `BOSS_ENCOUNTERS`) but `GLOSSARY.md` defines only **Boss**, and
defines it broadly enough to cover both tiers. The two tiers are structurally different — a
Miniboss is a data-driven composition of ordinary `Enemy` instances, a zone Boss is a bespoke
entity class driven by `BossSystem` — and if **Dungeon Boss** becomes a third, the glossary will
need to name all three. Flagged for the user; not resolved here.
