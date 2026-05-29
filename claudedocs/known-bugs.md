# Known Bugs

Active bugs only. Review at the start of every session. When a bug is fixed, move its row into `resolved-bugs.md` (do not leave a stub here).

---

## P1 — Confirmed Broken

| # | Bug | Source | Status |
|---|-----|--------|--------|
| 65 | **Weak-tier RARE drops are mathematically impossible** — `RARITY_PROFILES.weak.RARE = 0.02` in `items.js:2335`; combined with `RARITY_WEIGHTS[RARE] = 10`, `getWeightedRandomFromPool` computes `Math.round(10 * 0.02) = 0` per RARE item, zeroing out the entire RARE pool for every weak enemy. Any RARE entry in any affinity pool is dead code from weak-tier enemy drops. Fix options: raise `weak.RARE` to ≥0.05 (so `round = 1`), or bump `RARITY_WEIGHTS[RARE]` to ≥20 so the rounded weight survives. | self-spotted 2026-05-27 | open |
| 62 | **Cut grass never drops pollen (or any cut-effect drop)** — `BackgroundObject.takeDamage(isBlade=true)` on cuttable grass returns `{ destroyed: false, effect: 'cutGrass' }`, but `CombatSystem.js:687` only queues the event when `result.destroyed && result.effect`. The `destroyed: false` path is silently dropped, so `InteractionSystem.handleObjectEffect('cutGrass')` (which rolls 15% for `'ł'` pollen at line 216) is never reached from melee blade attacks. Destroying grass (via `destroyObject:*` effects) works because those paths return `destroyed: true`. Same gate also blocks any future cut-only effects (e.g. fairy spawn from `fairyBush`). Fix: change CombatSystem.js:687 gate to `if (result.effect)` — downstream `dropChance` logic in `main.js:3790` already gates destroy effects properly, and grass has no `dropChance`. | user 2026-05-26 | open |
| 55 | **Throw reticule (X) shows incorrect distance for weapons** — `getTrapReticulePos()` uses the weapon-specific `maxDist` profile but the visual position doesn't account for wall obstruction, so the X can appear beyond room walls. The actual throw is clamped by wall collision, creating a mismatch between indicator and landing site. | user 2026-05-15 | open |
| 15 | **Path Amulet announcement never visible** — the amulet tracks zone path history and is only meaningful in EXPLORE (where zones exist), but rendering is only implemented in `RestRenderer`; `ExploreRenderer` has no code for `game.pathAnnouncement`, so the display is always dropped at the one moment it matters | parity review 2026-03-09 | open |

---

## P2 — Balance / Missing Implementations

| # | Issue | Source | Status |
|---|-------|--------|--------|
| 8 | **Flail attack speed too high** — continuous attack while holding down is noted as potentially OP; needs a rate cap | devlog v0.3→v0.4 | open |
| 9 | **Skeletons too easy** — need a difficulty pass; possibly a new attack or increased aggro range | devlog v0.3→v0.4 | open |
| 10 | **Blunt weapons don't break rocks** — flail and other blunt weapons should be able to break rocks; not yet coded | devlog v0.3→v0.4 | open |
| 67 | **Green boss-encounter pool needs playtest tuning** — `BOSS_ENCOUNTERS.giant_slime` (split count, goo spew threshold/blob count, reform timer) and `BOSS_ENCOUNTERS.goblin_army` (chief HP/charge cooldown, follower formation radius, rally trigger distance) are first-pass values. Verify in-play: Giant Slime should feel beatable with blades + slime suit; Goblin Army formation should hold near chief and break when player runs distant. | self 2026-05-28 | open |
