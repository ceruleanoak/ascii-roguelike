# ASCII Roguelike - Project Instructions

## Project Overview

Browser-based roguelike, vanilla JavaScript + Vite. `npm run dev` / `npm run build`. CheatMenu: press `\` in-game.

## Deploying

```
npm run deploy
```

Builds for production and pushes `dist/` to the `gh-pages` branch. Live at https://ceruleanoak.github.io/ascii-roguelike/

- Do not create GitHub Actions workflows or any other deploy mechanism — this script is the deploy motion.
- Run it directly whenever the user says "deploy", "publish", "push to pages", or similar.

## Design Philosophy

Pure roguelike — death is a full reset. The "save file" is mental: recipe memory, zone knowledge, pattern recognition.

**Core principles:**
- **Non-instructive UI**: Wire the player's brain naturally. No explicit tutorials.
- **Mental progression**: Growing knowledge is the loop, not grinding for unlocks.
- **Arcade purity**: Fast, repeatable. Death is acceptable; reset is part of the experience.
- **Color-coded zones**: Green → Yellow → Red = increasing danger. Each zone tracks depth independently.

**When adding features**: Ask whether the feature rewards player knowledge or shortcuts it.

## Known Bugs

**File**: `claudedocs/known-bugs.md` — **Read before touching any code.** Active bugs only.

Log immediately when you observe: unexpected behavior, user-reported bugs, revealed related issues, TODO/FIXME gaps, balance issues from design discussion.

Entry format: `| N | **Short title** — symptom + root cause | source/date | open |`
- P1 = confirmed broken. P2 = balance/missing implementation.
- **On fix**: move the row into `claudedocs/resolved-bugs.md` with `✅ fixed — <date> — <one-line summary>` in the status column. Do not leave a resolved stub in `known-bugs.md`.
- **Not a bug?** Drop the entry entirely (design decision, false positive, verification reminder). Track playtest/verification work in a TODO, not the bug list.
- Bug numbers are never reused.

## Zones and Rooms

- **Color reference** → ZoneSystem
- **Single letter reference** → RoomGenerator / letterTemplates data

## Game States

- **REST** (`GAME_STATES.REST`): Safe hub. Crafting, preparation. No enemies. Quick slots persist.
- **EXPLORE** (`GAME_STATES.EXPLORE`): Procedural combat rooms. N/E/W = deeper. S = back to REST. Inventory lost on death.
- **NEUTRAL** (`GAME_STATES.NEUTRAL`): Non-combat rooms (fishing, errands, NPCs). `NeutralRenderer.js` / `neutralRooms.js` / `NeutralRoomSystem.js`.

All modes share CombatSystem, PhysicsSystem, and entity classes.

## Critical UI Constraints

**Top status bar must stay a single horizontal line.** Never break HP | DEPTH | INVENTORY | QUICK SLOTS into multiple rows.

## Font Rules

- **VentureArcade**: UI labels only (`HP:`, `L`, `Q`, zone exit letters, "GAME OVER"). Limited glyph coverage — never use for item/enemy chars or slot placeholders.
- **Unifont**: Everything else (all canvas entity rendering, weapon/armor chars, slot placeholders). Complete Unicode coverage; safe default.

## Critical Technical Constraints

**NO localStorage, sessionStorage, or IndexedDB.** All state resets on page refresh and on death. This is intentional.

- `PersistenceSystem.js` exists but is permanently disabled (no-ops).
- If asked to add persistence, explain the design decision.

## Runtime-Fetched Assets Must Live in `public/`

Files loaded at runtime via `fetch()` (all audio, fonts loaded by JS, anything referenced through `${import.meta.env.BASE_URL}…`) **must** live under `public/`. Vite only copies `public/` into `dist/`; files in `assets/` are invisible to the production build unless referenced from `index.html` (which Vite processes and bundles, e.g. `assets/styles.css`).

- New audio → `public/assets/audio/`. New JS-loaded fonts → `public/assets/fonts/`.
- Symptom of getting this wrong: works on `npm run dev`, silently 404s on GitHub Pages (dev server serves project root; production serves only `dist/`).
- Don't add files to the top-level `assets/` directory for runtime use. That folder is legacy and only `styles.css` (bundled via `<link>` in `index.html`) belongs there.

### Placeholder SFX

Some SFX names are wired into gameplay code before the audio asset exists. Register them as `loadSFX('name', null)` — this marks the name as known, `playSFX('name')` silently no-ops, and the call site is greppable for future audio work: `grep -rn "loadSFX(.*null" src/`. Do **not** invent a filename for an asset you have not been shown.

## Architectural Maturity — Senior Dev Guidance

The project has established patterns and abstractions. Before implementing:

- If a change requires touching >10 items/enemies/objects, it likely signals a system-level solution.
- Present trade-offs: "Quick: 10 min, manual edits. Scalable: 20 min, future-proof."
- Frame as collaboration: "Would you prefer a system-level approach instead?"

**Intervene when**: manual edits to >10 definitions, repetitive patterns emerging, touching multiple unrelated systems, request breaks existing abstractions.

## Character Encoding Rule

**Two-tier system:**

| Tier | What | Char type |
|------|------|-----------|
| Raw ingredients | Enemy/environment drops — never crafted | Letter (`a–z`, `A–Z`) or digit (`0–9`) |
| Crafted items | Recipe output — weapons, armor, consumables | Unicode symbol (non-letter, non-digit) |

Rules:
- New ingredients → letter/digit only. New crafted items → Unicode symbol only.
- No emoji, no pure box-drawing chars, no Unicode escapes (`\uXXXX`) — embed literal glyphs.
- Background objects, enemies, particles, UI icons → printable ASCII.

See `claudedocs/reference.md` for the legacy violations table and background object char map.

## main.js — Orchestration Rules

`src/main.js` is the entry point and orchestrator only. No system or entity logic.

**Belongs in main.js**: `constructor()` wiring, `setupInput()`, `update()` / `render()` dispatch, `enterXxxState()` transitions, shared entity array declarations.

**Does NOT belong in main.js:**

| Category | Correct Location |
|----------|-----------------|
| Item/loot spawning | `LootSystem.js` |
| Trap placement/update | `TrapSystem.js` |
| Object interactions | `InteractionSystem.js` |
| Character type abilities | `CharacterSystem.js` |
| Menu open/close/select | `MenuSystem.js` |
| Consumable effects | `InventorySystem.js` |
| Companion behavior (bread-feed, tamed rats, crows) | `CompanionSystem.js` |
| Transient world effects (particles, puddles, goo blobs, shockwaves, debris, ember stacks) | `WorldEffectsSystem.js` |
| Room spawn helpers | `RoomGenerator.js` |
| Player geometry helpers | `Player.js` |
| Zone depth tracking | `ZoneSystem.js` |

**Adding a new system**: Create `src/systems/NewSystem.js` (takes `game` as constructor arg) → instantiate in `Game.constructor()` → call `update(dt)` in `updateXxxState()`.

### Code Placement Procedure (mandatory for net-new behavior)

main.js reached ~8,000 lines because behavior with "no obvious home" defaulted into the orchestrator. The default is now inverted — full risk register: `claudedocs/architecture-governance.md`.

1. **Name the owning file before writing any logic.** The table above routes known categories.
2. **No home exists? Create a system.** A 60-line `src/systems/XxxSystem.js` always beats 60 inline lines in main.js — there is no "too small for a system" threshold.
3. **Input handlers are dispatch-only for new code.** A new branch in `setupInput()` / `handleSpacePress()` / `handleShiftPress()` may only translate the input into a single system call. The behavior lives in the system.
4. **Extend, don't mirror.** If new code would "mirror the X pattern" inline (e.g. re-implementing the MagicSystem auto-cast lifecycle for a new weapon), extend system X or add a mechanic file (`entities/enemyMechanics/`-style composition) instead.
5. **Budgets are enforced.** `npm run build` runs `tools/check-architecture.js` against `tools/arch-budgets.json`. Budgets only ratchet down — after an extraction shrinks a file, run `node tools/check-architecture.js --update` to lock in the new ceiling. If the check fails, route the code out; never raise a budget to pass.

## Architectural Compromises

Do not "fix" these. Do not replicate them.

- **Menu state** (`menuOpen`, `menuItems`, `selectedMenuIndex`, `menuColumns`, `disabledColumns`) lives on `game` — every renderer reads `game.menuXxx` directly.
- **Trap state** (`placedTraps`, `inFlightTraps`, `trapCharging`) lives on `game` — 22+ references make moving it costly. TrapSystem owns the logic; game is just the data holder.
- **Companion state** (`tamedRats`, `companionCrows`, `followerCrows`, `fedCrowCount`, `breadTargetSelectors`) lives on `game` — renderers read the rosters directly. CompanionSystem owns the logic; game is just the data holder.
- **Weapon timing data is in "double-seconds"** — the held item ticks at `PHYSICS.WEAPON_TIMER_RATE` (= 2), so a weapon's effective cooldown/windup/reload/charge in seconds is its data value ÷ 2 (resolved bug #88: every weapon was tuned against an accidental double tick). Do not remove the multiplier without halving all timing data AND code-level fallbacks in the same pass. The playtesting simulator reads raw values — divide by 2 when comparing to real-game TTK.
- **Input handlers** — SHIFT/Tab/M/V key handlers in `setupInput()` still contain logic blocks that belong in their respective systems. Flagged, not yet delegated.

**Anti-patterns — do NOT replicate:**
- Monkey-patching method overrides on live entities at runtime. Use flags or state fields instead — `BackgroundObject.takeDamage` short-circuits on the `puzzleSignal` flag for dungeon glitter objects (sets `glitterHit`, restores HP), no per-instance override required.
- Lazy property initialization on plain objects at runtime. Initialize all fields in constructors or factory functions.
- Interior state split across game and system — if adding a 4th interior system, use a unified InteriorManager.

## Interior System Pattern

HutSystem, DungeonSystem, and MazeSystem all share this structure. Follow it exactly for any new interior:
- `generateXxxInterior()` — creates interior object stored on `game`
- `checkDoorEntry()` / `checkXxxExit()` — entry/exit detection
- Physics and enemies redirect to interior collision source on entry, unregister on exit
- PiP rendering via `src/rendering/ui/XxxInteriorOverlay.js`
- `player.inXxx` + `player.xxxExitPosition` initialized in `Player` constructor
- Interior reset in `enterRestState()`, `enterExploreState()`, and room transitions
- Entry point: always a door entity or background object trigger

## Entity Size Norms

Authoritative per-file ceilings live in `tools/arch-budgets.json` and are enforced by `npm run check:arch` (runs as part of `build`). Do not restate line counts here — they go stale and erode the rule.

Do not attempt to split these without tracing all shared-state dependencies:
- **`Enemy.js`**: AI, pathfinding, status effects, item usage — single cohesive domain. New behaviors go in `entities/enemyMechanics/` composition files, which is why the core file is allowed to be large but not to grow.
- **`Item.js`**: Attack pattern factory — size justified by pattern count, not tangled concerns.
- **`Player.js`**: Stat container + input response + dodge roll + status tracking — organized by comment sections.

---

*Content templates, system docs, directory structure, file reference: `claudedocs/reference.md`*
