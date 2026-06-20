# Known Bugs

Active bugs only. Review at the start of every session. When a bug is fixed, move its row into `resolved-bugs.md` (do not leave a stub here).

**Categories**: recurring root-cause families get a `[category]` tag in the bug title so new reports can be pattern-matched to a known fix shape. Check this list before debugging. Active categories:

- `[warp-divergence]` — any path that swaps `currentRoom` outside `enterExploreState` (cheat warps, demo setup, test rooms) drifting from natural room entry. Canonical fix: route the swap through `Game.applyRoomSwap()` / `wireRoomEnemies()` / `switchZoneMusic()` (main.js); never hand-copy room-entry steps into a warp. Origin: resolved #93.
- `[layer-leak]` — combat/effect code spawns into the surface world (`currentRoom.backgroundObjects`, `game.backgroundObjects`, or open-coded `GRID.COLS/ROWS` bounds) while the player is inside a hut/dungeon interior, so effects appear on the surface at the relative position instead of in the active layer. Canonical fix: route every runtime combat spawn through `game._activeBackgroundObjects()` / `game._activeEnemies()` / `game.activeRoom` / `game.activeGridBounds()` — never reference the surface room directly, never keep a divergent private copy of the routing. Enforced by the combat-file guard in `tools/check-architecture.js`. Generation code (RoomGenerator/HutSystem/DungeonSystem/etc.) is exempt — it builds a specific room. Origin: resolved #107.

---

## P1 — Confirmed Broken

| # | Bug | Source | Status |
|---|-----|--------|--------|
| 65 | **Weak-tier RARE drops are mathematically impossible** — `RARITY_PROFILES.weak.RARE = 0.02` in `items.js:2335`; combined with `RARITY_WEIGHTS[RARE] = 10`, `getWeightedRandomFromPool` computes `Math.round(10 * 0.02) = 0` per RARE item, zeroing out the entire RARE pool for every weak enemy. Any RARE entry in any affinity pool is dead code from weak-tier enemy drops. Fix options: raise `weak.RARE` to ≥0.05 (so `round = 1`), or bump `RARITY_WEIGHTS[RARE]` to ≥20 so the rounded weight survives. | self-spotted 2026-05-27 | open |
| 55 | **Throw reticule (X) shows incorrect distance for weapons** — `getTrapReticulePos()` uses the weapon-specific `maxDist` profile but the visual position doesn't account for wall obstruction, so the X can appear beyond room walls. The actual throw is clamped by wall collision, creating a mismatch between indicator and landing site. | user 2026-05-15 | open |
| 15 | **Path Amulet announcement never visible** — the amulet tracks zone path history and is only meaningful in EXPLORE (where zones exist), but rendering is only implemented in `RestRenderer`; `ExploreRenderer` has no code for `game.pathAnnouncement`, so the display is always dropped at the one moment it matters | parity review 2026-03-09 | open |

---

## P2 — Balance / Missing Implementations

| # | Issue | Source | Status |
|---|-------|--------|--------|
| 101 | **Gray Assassin character has no unlock path** — `characters.js` defines 'gray' (Gray Assassin) but captives only spawn for non-gray zones (`ZoneSystem.shouldSpawnCaptive` returns false for gray; `spawnCaptive(currentZone)` never passes 'gray'), so the character is defined-but-unreachable. Likely home: the future 5-character good-ending route (gray L10 snapshots now exist as `game.graySnapshots` / `game.lostCharacters`, built 2026-06-11). | self-spotted 2026-06-11 (gray build-out) | open |
| 102 | **Gray zone roster needs playtest tuning** — Risen (Z) rise timing/HP fraction, Mourner (A) mistThicken stacking with multiple Mourners, Gravejumper (J) zigzag pressure, Barrow Tyrant (Y) windup-immune ranged pacing, and the `bone_legion`/`grave_tyrant` encounters are first-pass values tuned only via simulator TTK (ratios 1.01–1.07 under hardMode). 'Y' enemy glyph also collides with the 'Y' stump background object (mitigated by bright bone color `#ffffcc` vs dark stumps; drop the enemy if confusing in play). | self 2026-06-11 | open |
| 94 | **[warp-divergence] Warp paths still skip natural-entry side steps** — remaining known diffs vs `enterExploreState` after the #93 `applyRoomSwap` consolidation: (1) `handleZoneTeleport`/`handleDepthJump`/`handleBossTest` never call `preloadRoomPreviews()`, so exit previews can show the previous room; (2) `handleBossTest` doesn't run `audioSystem.scheduleBossSequence()` (the natural zone-boss trigger does), so cheat boss fights keep normal zone music; (3) natural entry updates `setLayer2Enabled(hasEnemies)` — warps don't, so the bassline layer can be stale until the next natural transition. All cheat-only; fix by folding into `applyRoomSwap` or calling at the warp sites. | self-spotted 2026-06-10 (audit during #93) | open |
| 8 | **Flail attack speed too high** — continuous attack while holding down is noted as potentially OP; needs a rate cap | devlog v0.3→v0.4 | open |
| 9 | **Skeletons too easy** — need a difficulty pass; possibly a new attack or increased aggro range | devlog v0.3→v0.4 | open |
| 10 | **Blunt weapons don't break rocks** — flail and other blunt weapons should be able to break rocks; not yet coded | devlog v0.3→v0.4 | open |
| 90 | **Crystal `*` mineral-formation drops are dead code** — `generateMineralFormations` assigns `dropTable: 'basic'` to default-formation rocks/crystals, but `'basic'` is not an `AFFINITY_POOLS` key, so the generic dropTable branch in `handleObjectEffect` intercepts `destroyObject:` effects and `generateEnemyDrops('basic')` yields nothing — depth-10+ crystals never pay out their intended `spawnIngredient:M` dropEffect (same interception pattern as resolved #-series dropTable bugs) | self-spotted 2026-06-10 | open |
| 67 | **Green boss-encounter pool needs playtest tuning** — `BOSS_ENCOUNTERS.giant_slime` (split count, goo spew threshold/blob count, reform timer) and `BOSS_ENCOUNTERS.goblin_army` (chief HP/charge cooldown, follower formation radius, rally trigger distance) are first-pass values. Verify in-play: Giant Slime should feel beatable with blades + slime suit; Goblin Army formation should hold near chief and break when player runs distant. | self 2026-05-28 | open |
