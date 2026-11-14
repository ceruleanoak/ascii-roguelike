# CLI Enemies — Enemies as a Canon Edit

Planned 2026-11-13. Replaces the planning-inbox entry "Dev tools → CLI migration" for its enemy slice; the rest of that entry stays in the inbox as a later slice.

## Vision (user, 2026-11-13)
Enemies are exposed the way weapons are: a Canon Edit the player writes in the CLI, stored in localStorage by `CanonStore` and applied at boot by the Canon Overlay. Schema access is **limited on purpose**: too many options is debilitating, as it is with weapons.

So this does not migrate `tools/enemy-editor`. That editor stays as the dev tool for shipped enemies, sandbox and codegen included. The CLI gets a small player-facing slice that follows the Weapons table pattern.

## Ratified terms (write their GLOSSARY entries in the commit that adds them to code)
- **Enemy Style**: a named behavior preset, read off a shipped enemy. It is the counterpart of a Weapon Style. The CLI row that picks one is labelled **BEHAVIOR**.
- **Disabled Enemy**: an enemy switched out of random spawns in CUSTOMIZE. It is the counterpart of a Disabled Weapon.

**Glossary gap:** Canon Edit, Canon Overlay, Weapon Style and Disabled Weapon have no GLOSSARY entries yet. Backfill them in Phase 1, because the two new entries are defined against them.

## The model: the Weapons table, mapped to enemies

| Weapons (`cliTables.js`) | Enemies |
|---|---|
| ADD A WEAPON: GLYPH, NAME, TYPE, DAMAGE, STYLE | ADD AN ENEMY: GLYPH, NAME, BEHAVIOR, HP, DAMAGE, SPEED, COLOR, ZONE, DEPTH |
| Weapon Style copies keys off a shipped weapon (`weaponStyles.js`) | Enemy Style copies whole blocks off a shipped enemy (`enemyStyles.js`) |
| RECIPE: how an authored weapon enters a run | ZONE + DEPTH: which `ZONE_SPAWN_TABLES` band it joins |
| EDIT A WEAPON: overrides on a shipped weapon, plus RESTORE | EDIT AN ENEMY: NAME, COLOR, HP, DAMAGE, SPEED on a shipped enemy, plus RESTORE |
| CUSTOMIZE: Disabled Weapon, with stand-ins | CUSTOMIZE: Disabled Enemy, cut from the spawn tables |

**The player authors six values:** glyph, name, color, HP, damage and speed. On top of those come one behavior pick and one placement. Everything complex arrives by copy from the Enemy Style's source enemy (`structuredClone`) and is never authored in the CLI. That covers movement style and config, attack type, telegraph, mechanic blocks, affinities and drops.

That decision makes the json/list/tags field kinds moot for this slice.

## Enemy Styles (proposal; the names are the user's to adjust)
The sources are self-contained spawn-table enemies with no char-keyed code. Today only `M`, `6`, `I` and `B` are checked by char in `src/`.

Excluded as sources:
- bosses and minibosses (Centipede, Grasp);
- NPC-like enemies;
- anything wired through its own system.

| Style | Source | What it carries |
|---|---|---|
| CHASER | `S` Skeleton | plain melee chase |
| BRUTE | `O` Ogre | heavy melee |
| CHARGER | `b` Boar | `chargeMechanic` |
| THIEF | `r` Rat | `thiefMechanic` |
| ARCHER | `G` Goblin | ranged keeper |
| CASTER | `W` Wizard | magic keeper |
| HOPPER | `g` Frog | jumper, tongue |
| PROWLER | `w` Frost Wolf | melee kiter |

Like `weaponStyles.js`, each Style names its source and the keys it copies, so it keeps up with tuning on the source. HP, damage and speed are never copied; the player steps them.

## Rows
- **GLYPH**: a step list, not the glyph globe. The pool is printable ASCII (enemies stay ASCII) minus every `ENEMIES` key, every ingredient glyph and every background-object glyph. It is computed at module load, the way `craftableGlyphs()` is. Today that leaves about 25 punctuation glyphs (`!"#$'()+,-./:;<>?[\]_\`{}` before the background-object cut), so authored enemies read as punctuation.
- **HP / DAMAGE / SPEED**: stepped arrays, as `DAMAGE` is in `cliTables.js`. `stepValue` already snaps shipped values that aren't in the array.
- **COLOR**: the shared `PALETTE`.
- **ZONE**: green, red, cyan, yellow or gray.
- **DEPTH**: steps the chosen zone's band keys (green 0/3/6/9/12; the others 0/3/6/9). The enemy joins that band **and every deeper band**. That is an inference: bands are rewritten per depth, so joining one band alone would make it vanish deeper down. Confirm when Phase 3 lands.
- **EDIT AN ENEMY** lists the 51 spawn-table enemies only. Boss and scripted enemies aren't listed.
- **CUSTOMIZE** lists the same 51 plus authored enemies. Turning one OFF removes it from every `ZONE_SPAWN_TABLES` / `SPAWN_TABLES` band. The toggle refuses to empty a band: the last enemy in a band can't be switched off. Scripted placements (bosses, summons, set rooms) are unaffected, and the plan says so. A Disabled Enemy only leaves random spawns.

## Phases
1. **Glossary + catalogue.** Backfill the Canon Edit, Canon Overlay, Weapon Style and Disabled Weapon entries. Add the Enemy Style and Disabled Enemy entries. Write `src/data/enemyStyles.js` (a catalogue, not budgeted) with `ENEMY_STYLE_FIELDS`.
2. **Store + overlay.** In `CanonStore`, add `enemies: {}` and `disabledEnemies: {}` to `emptyCanon()`; the shape check in `load()` already covers new fields. In `CanonOverlay`, add an `ENEMY_FIELDS` whitelist (the curated keys plus `ENEMY_STYLE_FIELDS`) and treat stored values as untrusted. An authored enemy never replaces an existing `ENEMIES` key. Spawn-band placement goes here, then the Disabled Enemy cut. Applied before the Game is constructed, as weapons are.
3. **CLI tables.** New `src/systems/cliEnemyTables.js` holds ADD AN ENEMY (a draft form, as `addWeapon` is), EDIT AN ENEMY and CUSTOMIZE. Add an `ENEMIES` row to `LIST` in `cliTables.js`.
4. **Headless check.** `tools/check-canon-enemies.mjs` boots with a seeded canon and asserts:
   - an authored enemy spawns in its zone at its band and deeper;
   - a Disabled Enemy never spawns randomly;
   - a corrupt or hostile store entry (unknown style, taken glyph, bad zone) is skipped;
   - `FORGET` restores the shipped tables.

## ADR
This widens the existing P1 backlog row on Canon Edits: the overlay now also writes `ENEMIES` and the spawn tables. The row is extended rather than duplicated. The *why* is the user's to write.

## Out of scope
- `tools/enemy-editor` changes. It stays the dev tool; no schema move, no codegen.
- Authoring telegraphs, mechanics, drops or any `json`/`list`/`tags` field.
- Stand-ins for scripted placements of a Disabled Enemy.
- The rest of the old inbox entry (dungeon recipes; tools that aren't table-shaped). It stays in `planning-inbox.md`.
- The CheatMenu (user, 2026-11-13: not migrating).

## Critical files
- **Data:** new `src/data/enemyStyles.js`; `src/data/enemies.js` (`ENEMIES`, `ZONE_SPAWN_TABLES`, `SPAWN_TABLES`), which is read only, never edited.
- **Systems:** `src/systems/CanonStore.js`, `src/systems/CanonOverlay.js`, new `src/systems/cliEnemyTables.js`, `src/systems/cliTables.js` (the LIST row).
- **Tools:** new `tools/check-canon-enemies.mjs`.
- **Docs:** `GLOSSARY.md`, `docs/adr/BACKLOG.md`, `claudedocs/planning-inbox.md`.

## As built (2026-11-13)
- **DEPTH confirmed:** an authored enemy joins its band and every deeper band (`addEnemy()` in `CanonOverlay.js`).
- **DEPTH → TIER (user, 2026-11-14):** "enemies need a zone, and strength tier (what level they spawn)". The raw DEPTH row is now a TIER row: WEAK, NORMAL or ELITE (`STRENGTH_TIERS` in `enemyStyles.js`). It sets the enemy's `tier`, which drives drops and is no longer copied from the style, and it sets where the enemy first spawns (depth 0, 3 or 9). ZONE and TIER now come right after NAME. Entries stored with the old `depth` field fail the tier check and are skipped until a TIER is stepped.
- **No `ENEMY_STYLE_FIELDS`:** only the style's name is stored, and the overlay copies that style's `keys`. A field whitelist over style keys had nothing to guard.
- **GLYPH steps** over the free glyphs, and ADD AN ENEMY opens straight onto NAME with the first free glyph already set. The pool comes to **9 glyphs** (`'():;?\_` and the backtick) once background objects are cut, which caps a canon at 9 authored enemies. Widening it means freeing ASCII glyphs from background objects (rulebook G1/G2 lets those use any BMP glyph), and that is the user's call.
- **Row model** moved to `src/systems/cliRows.js`, which both table modules share, so `cliTables` ↔ `cliEnemyTables` don't import each other.
- **The check is in `build`** as `npm run check:canon`. It also drives CUSTOMIZE's refusal to empty a band.

## Verification
- `npm run build` after every phase (`check:arch`, `check:data`, `check:frames`, `check:warps`).
- `node tools/check-reset-parity.mjs`. There's no run state here, so it should be untouched.
- `node tools/check-canon-enemies.mjs` (Phase 4).
- Manual: EXITGAME → LIST → ENEMIES → add a CHARGER in green at depth 0 → ☠ → it appears in an early green room; FORGET → it's gone.
