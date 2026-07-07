# Quagmire Feature — Handover & Revised Plan

**For a fresh context.** Build is currently green, but the Pond/underwater work (Phase 2)
is **wrong and must be rebuilt**. Phase 0 and Phase 1 are solid and user-verified.

Related: `docs/adr/0001-unified-interior-manager.md`, `~/.claude/plans/streamed-stargazing-gizmo.md`,
memory `quagmire_feature.md`. This doc supersedes the Phase 2 section of the original plan.

---

## 0. CLARIFIED REQUIREMENTS (2026-06-28) — authoritative; override anything below

The underwater interior is the **Aquifer** (canonical name; rename all pond-interior code).
"Pond" remains the **surface entrance** only.

1. **Lighting = parity with the underground/tunnel lighting system.** Reuse that render path.
   **PiP is not required — if full-screen is easier, do full-screen.** (PiP was the wrong instinct.)
2. **The Aquifer HAS collision — it is underwater *platforming*.** My earlier removal of walls was
   **WRONG and unwarranted.** The original feedback was that collisions *were supposed to exist but
   were never implemented* (on plane 1 the standard collisionMap is ignored — collision must come
   from `tunnelWall`-style solid objects). Implement real walls.
3. **Layout must be free-form / organic — NOT square.** Making it a square grid was **against
   instructions.** Think branching underground rivers / caverns.
4. **Movement = flowing, not stagnant hopping.** The frog should glide/stroke continuously and feel
   *liberating*; cadence may stay similar but it must not read as discrete land-hops with dead stops.
   (The current "longer hops" swim state is still too hoppy — make it flowing.)
5. **Enemies = static or simple fixed-pattern hazards that deal damage** (underwater platforming),
   e.g. an **eel** moving on a strict point-based path. Not full combat AI.
6. **Key Item: any key item is fine for now** (`§` or `⊙`).

Net shape: a **free-form, walled, plane-1 Aquifer** with **underground lighting**, **flowing
swim**, and **fixed-pattern hazards** to platform around toward discoveries. Full-screen is fine.

---

## 1. What was done successfully (KEEP — do not redo)

### Phase 0 — Unified `InteriorManager` (ADR-0001) ✅ user-verified
- `src/systems/InteriorManager.js` hosts the interior lifecycle; Hut/Dungeon/Maze are registered
  controllers. Single `player._activeInteriorKind` field; `inHut/inDungeon/inMaze` are derived
  accessors defined on `Player.prototype` in InteriorManager.js.
- One PiP dispatch (`src/rendering/ui/InteriorOverlay.js`) + shared frame (`interiorFrame.js`).
- `isInteriorActive` (PlaneSystem) uses the canonical `_activeInteriorKind`.
- **This is good architecture and should remain.** Only the *pond-specific* additions to it are
  suspect (see §3).

### Phase 1 — Quagmire (Q) room ✅ user-verified
- `exitLetters.js` `'Q'` (rare, green-only). `letterTemplates.js` `Q` template (dispersed
  `lakeZone` pools, `roundCombat`, `quagmire: true`).
- `src/systems/RoundCombatSystem.js` — 3 escalating waves; round 1 from `generateCombatRoom`,
  later waves via the room-cleared hook in `main.js` (`advanceIfPending`, exits stay locked).
- Rusalka after the final round (frog → cure via `PolymorphSystem.spawnCureRusalka`; non-frog →
  lethal lure via `fishingSystem.spawnRusalkaAt`).

### Removed earlier (KEEP removed) ✅
- The deep-water Key Item puzzle apparatus (green L-room sword islet, yellow O-room spectacles
  shore, deep-water object, dungeon floor-2 Platform `=` reward, `KeyItemSystem.js`). `§`/`⊙`
  item defs kept but currently unobtainable — intended to re-home in the underwater tunnel.

### Salvageable from the pond work (probably keep)
- **Player frog swim state** in `PolymorphSystem._updateFrogMovement`: in liquid/pond the frog
  uses long agile strides (speed 190, dur 0.30, interval 1.3/3) vs. land hop (130/0.17/0.85/3),
  mirroring the `'g'` enemy (which already swims via `JumpMechanic` `onWater`). Reusable.
- **Pond surface entrance** concept in `roomFeatures.placePondEntries`: a disc of `~` water
  objects with a dark center tile (`room.pondEntry`). The *entrance* idea is roughly right.
- **Key Item pool** concept (`§`/`⊙`, one per visit).

---

## 2. What failed — the Pond (Phase 2) and why

**Verdict (user): "The pond, as a whole, is wrong and bad."** Root cause: it was built as a
**PiP overlay + maze-style walled interior** via the InteriorManager controller model. That is
the wrong architecture. The underwater area was supposed to be **like the underground tunnels**.

Specific defects, mapped to feedback:

| # | Feedback | What's wrong |
|---|----------|--------------|
| 1 | "'Pond' is not the underwater tunnel" | Concept inverted. **Pond = the surface entrance** (a body of water shaped from bg objects with a dark center). The space below is the **underwater tunnel**. Code named the *interior* `PondSystem`. |
| 2 | "vision not in parity with underground vision" | Used a bespoke PiP fog instead of the real underground cave-fog render path. |
| 3 | interior should be like "underground rivers / tunnels" | Built a square PiP maze with its own collisionMap. Should be plane-1, open, underground-style. |
| 4 | "did not encounter collision" | Collisions were **supposed to exist but were never implemented**: `plane = 1` ignores the collisionMap (plane-1 collides only with `tunnelWall` objects), and the maze walls were collisionMap-only → no collision. **Correct fix = `tunnelWall` walls, NOT removing walls.** (A later "rework" that deleted the walls was wrong — see §0.) |
| 5 | "frog not swimming speedily… hopping" | Player frog had no swim state (now added — salvageable). Enemy already swam. |
| 6 | "'e' not interactive, no rare item" | Discoveries were unreachable (narrow maze + hopping) and/or pickup didn't fire. Symptom of the wrong interior model. |

Net: the **render model (PiP), the collision model (collisionMap on plane 1), and the spatial
model (square maze)** are all wrong for an underwater tunnel.

---

## 3. Revised plan — build the **Aquifer** on the UNDERGROUND system

**Principle: do not invent. Reuse the existing underground (U-room) tunnel system**, which already
solves plane-1 movement, cave-fog lighting, `tunnelWall` collision, and plane-1 entity rendering —
**full-screen** (no PiP).

### Step A — Study the underground system first (read, don't guess)
- `ROOM_TYPES.UNDERGROUND`; `RoomGenerator` underground generation (`room.underground` metadata:
  `caveFogRadius`, `entrances`, `entranceAxis`; `tunnelWall` bg objects on plane 1).
- `PhysicsSystem.updatePlane(entity, tunnelData)` (~line 865) — how entrances flip plane 0↔1.
- `PhysicsSystem` `tunnelWall` collision (~624, ~1097) — **solid on plane 1; this is how Aquifer
  walls must work** (collisionMap is ignored on plane 1).
- `ExploreRenderer` cave fog (~1046, gated `room.underground && plane===1`) + plane-1 entity
  visibility (`renderOnlyOnPlane`, `objectOnPlane`, ~1884–1924). **This is the lighting to match.**

### Step B — Interior model (RESOLVED: full-screen, reuse underground rendering/physics)
Dive at a Pond → flip the player to **plane 1** in an **Aquifer**: a **free-form, organic**
(NOT square) layout of `tunnelWall` passages with `caveFogRadius` lighting. Surfacing returns to
plane 0 at the Pond. Whether the Aquifer is generated in-place on the Quagmire room or as a
dedicated generated plane-1 layout, **it must render through the underground path** (tunnelWall +
cave fog), full-screen.

### Step C — Pond entrance (surface) — mostly correct already
- `placePondEntries`: a body of water with a dark center = the unique entrance.
- SPACE on the dark center while a Frog → dive into the Aquifer (flip to plane 1).

### Step D — Layout, collision, content (this is underwater PLATFORMING)
- **Free-form / organic** branching passages — not a square grid.
- **Real walls via `tunnelWall` objects** (solid on plane 1). The player navigates around them.
- **Hazard enemies:** static or **simple fixed-pattern** movers that deal contact damage —
  e.g. an **eel** on a strict point-based path. Not full combat AI; this is platforming.
- **Discoveries** at passage ends: rare Ingredients + **one Key Item** (any is fine). Must be
  plane-1 entities that render and are collectible on plane 1 (check how underground plane-1 loot
  renders/picks up).

### Step E — Movement: FLOWING swim (rework needed)
- The current player swim state (longer hops) is **still too hoppy**. In the Aquifer the frog must
  move **continuously / gliding** — flowing and liberating, not start-stop. Same rough cadence is
  fine, but no dead stops between strokes. Rework `PolymorphSystem` frog movement for the Aquifer
  (likely: continuous velocity control with a gentle stroke pulse, not the jump-burst FSM).
- `'g'` enemy already swims (JumpMechanic `onWater`); only relevant if frog-type enemies appear.

### Step F — Naming (glossary) — RESOLVED: **Aquifer**
- "Pond" = surface entrance. **"Aquifer" = the plane-1 underwater interior.**
- Rename `PondSystem`→`AquiferSystem`, `pondInterior`→`aquifer`, `pondPlane`→`aquiferPlane`,
  `inPond`→`inAquifer`, etc. (`placePondEntries` / `room.pondEntry` can stay — they're the Pond.)

---

## 4. Code to remove / replace when rebuilding

**Remove (wrong approach):**
- `src/systems/PondSystem.js` (PiP maze interior)
- `src/rendering/ui/PondInteriorOverlay.js` (PiP overlay)

**Reconsider (pond-specific InteriorManager additions — likely remove if going underground-model):**
- `InteriorManager.js`: `inPond` membership, pond branches in `activeRoom`/`activeBackgroundObjects`/
  `activeEnemies`/`activeGridBounds`/`reset`, and `register(pondSystem)`.
- `main.js`: `PondSystem` import + instantiation + `interiorManager.register(this.pondSystem)`;
  the frog SPACE path change; `RenderController` + `InteriorOverlay` pond registration; the
  `!player.inPond` guard on the clear hook (re-evaluate under the new model).

**Keep:**
- `placePondEntries` (the Pond entrance), Key Item pool idea, the `Q` room + `quagmire` template
  flag + `RoundCombatSystem`, all of Phase 0/1.

**Keep but REWORK:**
- Player swim state in `PolymorphSystem` — keep the in-water trigger, but make movement **flowing/
  continuous** (current version is still hoppy). See §3 Step E.

---

## 5. Open questions — RESOLVED (2026-06-28)
1. **Interior model:** full-screen, reuse the underground render/physics path (no PiP). ✓
2. **Name:** **Aquifer.** ✓
3. **Key Item:** any key item is fine for now. ✓
4. **Enemies:** yes — static or simple fixed-pattern hazards (e.g. eel on a point path); underwater
   platforming, not full AI. ✓

Remaining judgement call (implementer's discretion): generate the Aquifer in-place on the Quagmire
room vs. as a dedicated plane-1 layout — either is fine as long as it renders via the underground
path and is free-form + walled.

---

## 6. Note on environment
`main.js` (and occasionally other files) were being **edited concurrently by an external
process** during this work (edits intermittently failed with "modified since read" / didn't
persist). The fresh context should re-read before every edit and watch for this.
