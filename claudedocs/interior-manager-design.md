# InteriorManager — Phase 0 Design (per ADR-0001)

Status: **for review** (no code written yet). Implements ADR-0001 "Unified interior
layer under a single InteriorManager." Scope chosen: **full strategy rewrite incl.
rendering**. Bar: **zero discernible player behavior change** — verifiable only by
manual playtest (browser game; `npm run build` covers syntax + arch budgets only).

---

## Current state (what exists today)

Three systems, each owning a full but **non-uniform** lifecycle:

| Concern | Hut | Dungeon | Maze |
|---|---|---|---|
| Active state field | `game.activeFloor` + `hut.interiorState` cache | `game.activeFloor` + `game.dungeonFloors[]` + `game.dungeonCurrentFloor` | `game.mazeInterior` (separate) |
| Player flag | `player.inHut` | `player.inDungeon` | `player.inMaze` |
| Entry cooldown | `_hutEntryCooldown` | `_hutEntryCooldown` (shared w/ hut) | `_mazeEntryCooldown` |
| Exit trigger | SPACE near interior door | SPACE near floor-0 door / stairs | walk off bottom edge |
| Freeze/thaw | `PlaneSystem.freeze/thawSurfaceRoom` (already shared) | same | same |
| Overlay | `HutInteriorOverlay` (generic, auto-sizes) | `HutInteriorOverlay` (same file) | `MazeInteriorOverlay` (bespoke) |

Scattered coupling in `main.js`:
- Active-source accessors `activeRoom` / `_activeBackgroundObjects()` / `_activeEnemies()` /
  `activeGridBounds()` (2232–2261) each open-code the `inMaze ? … : (inHut||inDungeon) ? … : surface` ternary.
- Reset block (`mazeInterior=null; dungeonFloors=[]; dungeonCurrentFloor=-1; activeFloor=null` +
  player flags) duplicated at 1172, 1552, 1987, 5363.
- Update dispatch: three calls (3805–3807).
- SPACE dispatch: `dungeon`(4588) → `press` → `alchemy` → `hut`(4591) → `maze`(4592); plus a
  frog-form variant (4565–4567). SHIFT: dungeon only (4995).
- Render dispatch: `hutInteriorOverlay` if `inHut||inDungeon` (1073), `mazeInteriorOverlay` if
  `inMaze` (1078).
- `PlaneSystem.isInteriorActive()` already centralizes the boolean OR.

---

## Target architecture

### 1. Single source of truth: `activeInteriorKind`

Add `player._activeInteriorKind` (`null | 'hut' | 'dungeon' | 'maze' | 'pond'`). Convert
`inHut`/`inDungeon`/`inMaze` to **getter/setter pairs** on `Player` backed by it:

```js
get inHut() { return this._activeInteriorKind === 'hut'; }
set inHut(v) { this._activeInteriorKind = v ? 'hut' : (this._activeInteriorKind === 'hut' ? null : this._activeInteriorKind); }
// identical for inDungeon / inMaze
```

Every existing `player.inX = true/false` and read keeps working unchanged — zero call-site
churn — while state collapses to one field. `_activeInteriorKind` initialized in the
constructor and in `Player.reset()` (replaces the 3 boolean inits at 94–117 / 1276–1281).
`PlaneSystem.isInteriorActive()` stays correct (reads the derived getters).

### 2. `src/systems/InteriorManager.js` — the host

Owns an ordered **controller registry**. Each interior system registers as a controller
implementing one interface:

```
key                       'hut' | 'dungeon' | 'maze' | 'pond'
nearExteriorDoor()        → bool   (entry affordance, already exists on each)
handleSpacePress()        → bool   (already exists on each)
handleShiftPress?()       → bool   (dungeon only today)
update(dt)                (already exists on each)
getActiveRoom()           → interior object | null   (NEW thin accessor)
getBackgroundObjects()    → array                     (NEW; maze returns [])
getEnemies()              → array                     (NEW; maze returns [])
getGridBounds()           → {cols,rows,collisionMap}  (NEW)
getViewport()             → {panelW,panelH,offsetX,offsetY,borderColor,label}
drawInteriorContents(game, ctx, rc)   (NEW; the per-interior draw body)
drawInteriorHud(game, ctx, vp)        (NEW; label/timer in absolute coords)
```

InteriorManager methods:
- `get active()` → controller whose key === `player._activeInteriorKind`, else null.
- `update(dt)` → tick shared cooldowns once, then call each controller's `update(dt)` in the
  current order (hut, dungeon, maze, pond). (Per-frame no-op when inactive, as today.)
- `handleSpacePress()` → loop controllers in priority order, return on first `true`.
- `handleShiftPress()` → same.
- `activeRoom` / `activeBackgroundObjects()` / `activeEnemies()` / `activeGridBounds()` →
  delegate to `active?.getX() ?? surface fallback`. `game`'s existing accessors become
  one-line delegations (preserves every call site).
- `reset()` → clears all interior state (`activeFloor`, `mazeInterior`, `dungeonFloors`,
  `dungeonCurrentFloor`, `player._activeInteriorKind`). Replaces the 4 duplicated blocks.

Shared enter/exit **primitives** (called by each controller, replacing copy-pasted lines):
- `enterCommon({kind, collisionMap, spawn})` → `combatSystem.clear()`, set player collision
  map + position, set kind, `freezeSurfaceRoom`, companion snap, `backgroundDirty`.
- `exitCommon({restorePosition, cooldownField})` → `combatSystem.clear()`, restore position +
  surface collision map, set cooldown, clear kind, `thawSurfaceRoom`, companion snap,
  `backgroundDirty`.
- Interior-specific work (dungeon floor swap, hut item drain, maze door seal, loot-plane
  cleanup) stays in the owning controller, wrapped around these primitives.

### 3. Rendering convergence

Introduce `src/rendering/ui/InteriorOverlay.js` as the **single PiP entry point**:

```
render(game):
  const c = game.interiorManager.active; if (!c) return;
  const vp = c.getViewport();
  draw dim veil + panel + border (vp.borderColor)         // shared frame
  ctx.translate(offset); ctx.clip(panel); set Unifont      // shared
  c.drawInteriorContents(game, ctx, this.renderController)  // per-interior body
  ctx.restore()
  c.drawInteriorHud(game, ctx, vp)                          // per-interior label/HUD
```

- The **frame** (dim 0.55, panel fill, border, translate, clip, font, centered label slot) is
  defined once — true PiP parity for every interior incl. pond by construction.
- The **bodies move verbatim**: current `HutInteriorOverlay.render` body → hut/dungeon
  controllers' `drawInteriorContents`/`drawInteriorHud`; `MazeInteriorOverlay.render` body →
  maze controller's. This is relocation, not logic change (low risk). Maze content stays
  bespoke (ghosts, timer, reveal) — it is *not* force-fit into the shared draw-helper path;
  "convergence" here means one frame + one dispatch + per-interior content hooks, which is the
  honest ceiling without behavior risk.
- `ExploreRenderer` dispatch (1073–1080) collapses to one `interiorOverlay.render(game)`.
  Old `HutInteriorOverlay`/`MazeInteriorOverlay` classes are absorbed (their bodies relocate);
  `RenderController` wires the single `InteriorOverlay`.

### 4. main.js shrinkage
- 3805–3807 → `this.interiorManager.update(dt)`
- 4565–4567 and 4588–4592 → `this.interiorManager.handleSpacePress()` (single call)
- 4995 → `this.interiorManager.handleShiftPress()`
- 2232–2261 accessors → delegate to `interiorManager`
- 1172/1552/1987/5363 reset blocks → `this.interiorManager.reset()`
- `activeFloor` / `mazeInterior` / `dungeonFloors` / `dungeonCurrentFloor` remain on `game`
  as the data holders the controllers read/write (documented compromise, like trap/companion
  state) — the manager owns lifecycle, game holds data.

---

## The one accepted behavioral delta

Today SPACE order is `dungeon → press → alchemy → hut → maze`. The unified
`handleSpacePress()` groups interiors as `dungeon → hut → maze` and runs **before**
`press`/`alchemy`. This only matters if the player could stand within interaction range of an
interior transition **and** an oil press / alchemy station **simultaneously** — geometrically
impossible given their fixed, separated interior positions. Flagged as the single knowing
deviation; everything else is byte-for-byte behavior.

---

## Migration order (each step ends on green `npm run build`)

1. Player: `_activeInteriorKind` + accessor properties (no other change). Build.
2. InteriorManager skeleton: registry, `active`, `update`, `reset`, accessor delegation.
   Wire into `Game.constructor`; register the 3 existing systems. Replace main.js update +
   reset + accessors. Build. **(Playtest gate A: all 3 interiors still enter/exit/fight.)**
3. Move SPACE/SHIFT dispatch into the manager. Build. **(Playtest gate B: entry/exit/stairs/
   item-slot/maze-object-hit via SPACE; dungeon SHIFT sacrifice.)**
4. Add the controller accessor/viewport/draw methods; introduce `InteriorOverlay`; relocate the
   two overlay bodies; collapse render dispatch. Build. **(Playtest gate C: visual parity of
   hut, dungeon multi-floor, maze incl. ghosts/timer.)**
5. `node tools/check-architecture.js --update` to re-baseline budgets after extraction.

## Manual playtest checklist (the part the build cannot verify)
- Hut: enter/exit; oil press; alchemy hut brew; witch frog-curse; bread pickup; companion follows in/out.
- Dungeon: enter; descend/ascend all floors; each unlock condition (key enemy, glitter object,
  item slot SHIFT, green companion-switch); floor-2 plank reward; artifact on floor 5; exit + re-enter (loot persists).
- Maze: enter; break objects → ingredient drop; timer → ghost spawns → doom phasing; walk-off exit + door seals.
- Cross-cutting: combat freeze of surface enemies on entry/thaw on exit; loot abandoned on exit;
  no projectile ghosting across the transition; REST/death/room-change resets interior cleanly.

## What this unblocks
PondSystem (Phase 2) becomes a 4th registered controller: implement the interface, get
lifecycle + active-source + PiP frame + reset + dispatch for free, parity guaranteed.
