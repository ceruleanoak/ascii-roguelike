# RENDERING LAYER REVIEW

**Reviewed:** 2026-05-15  
**Files examined:** 17 (all rendering/* files)  
**Total rendering LOC:** ~4,900 (ExploreRenderer alone is 2,404)

---

## Architecture Validation

The 3-tier architecture (Game → RenderController → StateRenderers + UIComponents) is broadly followed. Key observations:

**Compliant:**
- `RenderController` correctly instantiates all state renderers and UI components, routes calls, and owns the `ScreenShake` + spell-response state.
- All state renderers receive `game` and route to `ASCIIRenderer` primitives only.
- `backgroundDirty` optimization is correctly implemented in `TitleRenderer`, `RestRenderer`, `ExploreRenderer`, `GameOverRenderer`, and `NeutralRenderer`.
- UI components are standalone and passed `renderer` only at construction; they read `game` per-call.

**Violations:**
- `TitleRenderer.render()` writes `game.launchButtonBounds` (lines 286–291 and 334–340). This is a game state mutation inside a renderer. It is plausible as a layout measurement side effect, but it breaks the read-only contract. The bounds should be computed once on title entry by the game/system layer, not the renderer.
- `RenderController.renderCleanseWave()` sets `game.cleanseWave = null` (line 100) and `RenderController.renderBossDefeatFlash()` sets `game.bossDefeatFlash = null` (line 138) and `renderSpellResponse()` sets `game.spellResponse = null` (line 180). These are lifecycle mutations — "effect is over, clear it" — done inside the renderer. The pattern is common and mostly harmless, but strictly violates read-only. They should instead return a signal or let the game system expire these on the next update tick.
- `MenuOverlay.render()` mutates DOM directly (`game.ui.menu.innerHTML`, `classList.remove('hidden')`, `.scrollIntoView()`). This is an architectural outlier — it's a DOM overlay, not a canvas renderer. This is acceptable if intentional, but the class name `MenuOverlay` implies canvas and misleads reviewers. A rename to `MenuDOM` or moving it out of `src/rendering/ui/` would be cleaner.

---

## Method Catalog

| File | Method | Line | Purpose | Issues |
|------|--------|------|---------|--------|
| ASCIIRenderer | constructor | 4 | Canvas setup + DPR scaling | None |
| ASCIIRenderer | setupContext | 29 | Default font/align/smoothing | Sets Unifont as default — correct |
| ASCIIRenderer | createDitherPattern | 38 | Lazily creates checkerboard pattern | Cached — fine |
| ASCIIRenderer | clearBackground | 60 | Full bg fill | None |
| ASCIIRenderer | clearForeground | 65 | Full fg clear | None |
| ASCIIRenderer | drawCell | 70 | Grid-aligned char on bg | Caller must set bgCtx font before calling outside dirty gate (see RestRenderer) |
| ASCIIRenderer | drawFilledCell | 79 | Solid color fill on bg | None |
| ASCIIRenderer | drawEntity | 85 | Pixel-positioned char on fg | None |
| ASCIIRenderer | drawEntityScaled | 90 | Scaled char on fg | save/restore balanced |
| ASCIIRenderer | drawEntityVA | 100 | VentureArcade char on fg | save/restore balanced |
| ASCIIRenderer | drawEntityRotated | 109 | Rotated char on fg | save/restore balanced |
| ASCIIRenderer | drawEntityRotatedDithered | 120 | Rotated + dithered | save/restore balanced; sets globalCompositeOperation inside save — correct |
| ASCIIRenderer | drawEntityDithered | 138 | Dithered char on fg | save/restore balanced |
| ASCIIRenderer | drawTextWithAlphaDithered | 158 | Alpha + dithered | save/restore balanced |
| ASCIIRenderer | drawWrappedText | 180 | Word-wrap text | No save/restore — caller must set font/color |
| ASCIIRenderer | drawTextWithAlpha | 204 | Alpha text on fg | save/restore balanced |
| ASCIIRenderer | drawBorder | 213 | Draws room border with exit gaps | Only creates one-cell gaps — relies on RoomGenerator centering |
| ASCIIRenderer | drawGrid | 243 | Debug grid overlay | Dead code — nothing calls this |
| ASCIIRenderer | highlightCell | 263 | Highlights a bg cell | Called from RestRenderer via drawRect |
| ASCIIRenderer | drawRect | 269 | Rectangle on fg | None |
| ASCIIRenderer | drawLine | 281 | Line on fg | None |
| ASCIIRenderer | drawCircle | 290 | Circle on fg | save/restore balanced |
| ASCIIRenderer | gridToPixel | 310 | Coordinate helper | Never called externally (renderers inline the math) |
| ASCIIRenderer | pixelToGrid | 318 | Coordinate helper | Never called externally |
| ASCIIRenderer | markBackgroundDirty | 325 | Sets dirty flag | Used correctly |
| RenderController | constructor | 31 | Wires all renderers/components | None |
| RenderController | applyShake | 65 | CSS transform shake on both canvases | None |
| RenderController | renderTitleState | 72 | Routes to TitleRenderer | None |
| RenderController | renderRestState | 76 | Routes to RestRenderer | None |
| RenderController | renderExploreState | 80 | Routes to ExploreRenderer | None |
| RenderController | renderNeutralState | 84 | Routes to NeutralRenderer | None |
| RenderController | renderGameOverState | 88 | Routes to GameOverRenderer | None |
| RenderController | renderCleanseWave | 92 | Animated white tile sweep | Mutates game.cleanseWave = null |
| RenderController | renderBossDefeatFlash | 130 | Full-screen white flash | Mutates game.bossDefeatFlash = null |
| RenderController | renderSpellResponse | 154 | Per-char dissolve-in spell text | Mutates game.spellResponse = null; reinitializes _spellDissolves Array.from per text change (intended) |
| TextEffects | ScreenShake | 25 | Sine-decay horizontal shake | None |
| TextEffects | SplitReveal | 85 | Sliding door panels for exit gaps | None — elegant stateful effect |
| TextEffects | PixelatedDissolve | 190 | Bayer-dither dissolve in/out | Creates offscreen canvas lazily — fine; reads pixel data per frame when alpha < 1 (intentional) |
| TitleRenderer | render | 19 | Full animated title sequence | Mutates game.launchButtonBounds |
| TitleRenderer | renderPreIntroScreen | 314 | Pre-animation placeholder | Mutates game.launchButtonBounds |
| TitleRenderer | hexToRgb | 352 | Color parsing helper | Per-frame allocation concern: called for every non-transparent char during fade phase |
| RestRenderer | render | 29 | Full REST state render | WASD key indicators draw to bgCtx each frame outside dirty gate — see Performance Concerns |
| RestRenderer | _drawLitLabel | 595 | Flash-on-keypress label | None |
| RestRenderer | _renderTombstonePopup | 615 | Animated tombstone popup | None |
| RestRenderer | _renderSlotPopup | 682 | Animated slot popup | None |
| ExploreRenderer | constructor | 29 | Sets up dissolve + split effects | None |
| ExploreRenderer | render | 49 | Dispatches to bg/fg passes | None |
| ExploreRenderer | renderBackground | 56 | Background redraw with dirty-flag tracking | None |
| ExploreRenderer | renderForeground | 163 | All foreground entity rendering | 2,200+ lines; z-order correct; inHut/inMaze guards thorough |
| ExploreRenderer | _renderWellRitual | 1241 | Spinning coin arc + flash | shadowBlur set without clear-on-restore — canvas state LEAK |
| ExploreRenderer | _renderCampNPCs | 1283 | Camp NPC + companion + coin arc | Same shadowBlur leak from coin arc |
| ExploreRenderer | _renderExitSplits | 1343 | SplitReveal door animations | None |
| ExploreRenderer | renderEnemy | 1393 | Per-enemy char + indicators | Boss char 'M' hardcoded special case — fragile if Boss Slime char changes |
| ExploreRenderer | _renderDetectionVisuals | 1714 | Debug vision rings | Only shown when game.showVectors — correct guard |
| ExploreRenderer | shouldRenderEntity | 1787 | Plane-based entity visibility | None |
| ExploreRenderer | shouldRenderBackgroundObject | 1813 | Plane-based bg object visibility | None |
| ExploreRenderer | renderBossComposite | 1845 | Routes to appropriate boss renderer | None |
| ExploreRenderer | renderTurtleBossComposite | 1907 | Turtle shell + head + legs | None |
| ExploreRenderer | _renderFlameChargeCone | 1977 | Flame cone telegraph | save/restore balanced |
| ExploreRenderer | _renderTurtleHeadP1 | 2013 | Phase 1 turtle head | ctx param accepted but not used — leftover parameter |
| ExploreRenderer | _renderTurtleHeadP2 | 2025 | Phase 2 orbiting head | ctx param accepted but not used — leftover parameter |
| ExploreRenderer | renderLakeBossComposite | 2039 | Lake boss (cyan zone) | None |
| ExploreRenderer | _drawBossNeck | 2117 | Sinusoidal neck chain | None |
| ExploreRenderer | _bossHeadHealthColor | 2155 | Health-based color lerp | None |
| ExploreRenderer | _drawBossHead | 2163 | 3-char head composite | None |
| ExploreRenderer | _renderBridgePanel | 2211 | Bridge donation UI panel | Font string `Unifont` missing quotes — see Font Violations |
| ExploreRenderer | _renderKnownSpellHints | 2304 | Known spell hints above player | None |
| ExploreRenderer | _renderWellCoinHint | 2353 | Coin hint above player in well room | None |
| ExploreRenderer | _renderDoorPrompts | 2380 | "SPACE ENTER" door prompt | None |
| NeutralRenderer | render | 14 | Dispatches to bg/fg passes | None |
| NeutralRenderer | renderBackground | 21 | bg pass for neutral rooms | None |
| NeutralRenderer | renderForeground | 43 | fg pass for neutral rooms | Hardcodes player char as `'@'` (line 101) — ignores game.player.char; inventory trigger uses game.showInventory but ExploreRenderer uses game.keys.tab — inconsistency |
| GameOverRenderer | render | 20 | Death room + death text | None — correctly defers interior to HutInteriorOverlay |
| ArrowKeyIndicators | render | 19 | Arrow key feedback on REST | Draws to bgCtx each frame; restore() exists |
| BowChargeIndicator | render | 24 | Bow/wand/gun charge bar | No guard for inHut/inMaze — overlay calls this and so does ExploreRenderer |
| CraftingStation | render | 19 | Background pass for crafting slots | None |
| CraftingStation | renderForeground | 48 | Animated cycling center slot | None |
| EquipmentSlots | render | 22 | Equipment slot blink animations | Draws to bgCtx each frame outside dirty gate (intentional by comment) |
| GreenRangerIndicator | render | 17 | Green ranger charge bar | None |
| HutInteriorOverlay | render | 25 | Full PiP for hut + dungeon | Font manually re-set after inner save/restore at lines 144, 344, 370 without save — context state leak risk |
| MazeInteriorOverlay | render | 35 | Full PiP for maze | Ghost rendering restores font manually after save/restore (line 144) — same pattern |
| InventoryOverlay | render | 19 | Inventory list panel | Does not save/restore fgCtx around textAlign mutations |
| MenuOverlay | render | 16 | DOM-based menu popup | Not a canvas renderer — DOM mutation only; misplaced in rendering/ui/ |
| MenuOverlay | render3Column | 63 | 3-column chest menu | Same — DOM only |

---

## Game-State Mutation Violations

| Location | Line(s) | Mutation | Severity |
|----------|---------|----------|----------|
| `TitleRenderer.render()` | 286–291 | `game.launchButtonBounds = { ... }` | Low — one-time write after first text measure, but still a read violation |
| `TitleRenderer.renderPreIntroScreen()` | 334–340 | `game.launchButtonBounds = { ... }` | Same as above |
| `RenderController.renderCleanseWave()` | 100 | `game.cleanseWave = null` | Medium — effect lifecycle cleared by renderer instead of game system |
| `RenderController.renderBossDefeatFlash()` | 138 | `game.bossDefeatFlash = null` | Medium — same pattern |
| `RenderController.renderSpellResponse()` | 180, 182 | `game.spellResponse = null`, `this._spellDissolves = []` | Medium — same pattern |
| `MenuOverlay.render()` | 56–60, 153–157 | `game.ui.menu.innerHTML = ...`, `classList.remove('hidden')`, `scrollIntoView()` | Low — DOM overlay, not canvas; architecturally different but technically a side effect |

---

## Font Usage Violations

| Location | Line | Issue |
|----------|------|-------|
| `ExploreRenderer._renderBridgePanel()` | 2239 | `ctx.font = '...Unifont, monospace'` — missing quotes around font name; should be `'Unifont'`. Will fall back to system monospace in strict parsers. |
| `ExploreRenderer._renderBridgePanel()` | 2288 | Same unquoted `Unifont, monospace` in smaller font size line. |
| `ExploreRenderer._renderCampNPCs()` | 1334 | `'VentureArcade', Unifont, monospace` — Unifont missing quotes; same issue. |
| `ExploreRenderer.renderForeground()` | 1227 | `'VentureArcade', Unifont, monospace` — Unifont missing quotes in pickupMessage font string. |
| `NeutralRenderer.renderForeground()` | 137 | `ctx.font = '...Unifont...'` — pickup message uses Unifont but the label `FINDINGS`/`INVENTORY` in InventoryOverlay (line 43) uses `drawEntity` which inherits the current fgCtx font without setting it — the displayed font depends on what was last set, not on a consistent rule. |
| `RestRenderer._renderTombstonePopup()` | 671 | `ctx.font = '11px 'Unifont', monospace'` — hardcoded 11px pixel size that does not scale with GRID.CELL_SIZE or DPR. |
| `InventoryOverlay.render()` | 43–46 | `drawEntity()` is called for the overlay title (`FINDINGS`/`INVENTORY`) — this inherits whatever fgCtx font was set by the caller. VentureArcade is specified in the CLAUDE.md rules for prominent UI labels, but the inventory title uses `drawEntity` which relies on the context's current font without explicitly setting it. |
| `HutInteriorOverlay` WiseFellow hint | 136 | `ctx.font = '8px 'VentureArcade', monospace'` — hardcoded 8px, not scaled to GRID.CELL_SIZE. Also VentureArcade used for hint text content (not just a label) — borderline per the font rules. |
| `MazeInteriorOverlay` timer | 210 | Uses `⌛` with Unifont — correct for entity chars, but the timer is a UI label and the hourglass emoji may render inconsistently per the CLAUDE.md emoji warning. |

---

## Missing Render Paths

| Entity / Effect | Expected renderer | Status |
|----------------|-------------------|--------|
| `Puddle` entities (`game.puddles`) | GameOverRenderer, RestRenderer | Not rendered in GAME_OVER or REST states. Puddles persist across room transitions; if a player dies in a room with puddles they won't appear on the death screen. |
| `SteamCloud` entities (`game.steamClouds`) | GameOverRenderer | Not rendered on death screen. Cloud may still be active when player dies. |
| `GooBlob` entities | GameOverRenderer | Not rendered on death screen. |
| `game.playerShockwave` | GameOverRenderer | Not rendered on death screen. |
| Wand AOE effects, chain lightning arcs | GameOverRenderer | Not rendered on death screen — these are transient so acceptable, but chain arc timer may still be running. |
| Fishing entities (bobber, fish, reward objects) in GAME_OVER | GameOverRenderer | Not rendered — transient, acceptable. |
| `game.cureRusalka` | NeutralRenderer | The cure Rusalka (used in Lake rooms) is rendered only in ExploreRenderer. Lake rooms can be EXPLORE state, so this is correct — but if a Lake room is ever routed to NEUTRAL state, Rusalka would be invisible. |
| `ErrandCharacter` NPCs in REST | RestRenderer | `game.neutralCharacters` is cleared on REST entry — correct, but worth noting ErrandCharacters are EXPLORE-only by design. |
| `game.companion` | NeutralRenderer | Companion is not rendered in NEUTRAL state. If a companion follows the player into a neutral room, it becomes invisible. |
| `game.restBundle` | RestRenderer only | Correct — bundle exists only in REST. |
| `BridgeWorker` entity | ExploreRenderer via neutralCharacters | Rendered via `neutralChar.render()` in ExploreRenderer. NeutralRenderer does not call this pass — if a RIDGE room were classified as NEUTRAL, BridgeWorker would be invisible. |
| `ASCIIRenderer.drawGrid()` | Nothing | Dead method — never called. Was presumably used for debugging. |
| `ASCIIRenderer.gridToPixel()` / `pixelToGrid()` | Nothing external | Unused — all renderers inline the math. Could be removed or used to reduce duplication. |

---

## Redundancies Across Renderers

| Redundancy | Locations | Notes |
|-----------|-----------|-------|
| Particle rendering (dual Particle/plain-object branch) | ExploreRenderer L931, GameOverRenderer L107, RestRenderer L173, HutInteriorOverlay L266, MazeInteriorOverlay L175 | Identical `if (particle.getAlpha) ... else life/maxLife` branch copied verbatim in 5 places. Should be a helper in ASCIIRenderer or a standalone utility. |
| Projectile rendering loop | ExploreRenderer L684, HutInteriorOverlay L149, MazeInteriorOverlay L152 | Same `proj.drawAngle != null ? drawEntityRotated : drawEntity` pattern duplicated. |
| Melee attack rendering loop | ExploreRenderer L720, HutInteriorOverlay L195, MazeInteriorOverlay L161 | Same pattern with alpha/flashWhite; slightly different per-overlay. |
| Chain lightning arc drawing | ExploreRenderer L887, HutInteriorOverlay L230 | Identical jagged-bolt bezier loop with the same jitter math, segment count, and save/restore. |
| Damage number rendering | ExploreRenderer L919, HutInteriorOverlay L256, MazeInteriorOverlay L170 | Same `ctx.save / font / fillText / restore` block. |
| Player rendering (alpha + dither check) | ExploreRenderer L971, HutInteriorOverlay L284, MazeInteriorOverlay L184 | Same `getVisibilityAlpha / getDisplayColor / drawTextWithAlpha` pattern. |
| `BowChargeIndicator.render()` call | RestRenderer L280, ExploreRenderer L1179, HutInteriorOverlay L303, MazeInteriorOverlay L192 | Called in 4 places — correct and intentional (shared indicator). |
| `GreenRangerIndicator.render()` call | RestRenderer L283, ExploreRenderer L1182, HutInteriorOverlay L306, MazeInteriorOverlay L193 | Same — intentional. |
| Key-flash lit-label rendering | RestRenderer `_drawLitLabel()`, ExploreRenderer "REST" label at L186, ExploreRenderer "CRAFT" label in RestRenderer at L394 | The lit-letter logic is duplicated between `_drawLitLabel` in RestRenderer and the inline CRAFT/REST label blocks in ExploreRenderer. Should unify into a shared helper. |
| Pickup message block | ExploreRenderer L1224, NeutralRenderer L134, RestRenderer L526 | Identical `ctx.save / font / fillStyle / drawWrappedText / restore` block in 3 renderers. |
| Well coin arc animation | ExploreRenderer `_renderWellRitual` L1244, ExploreRenderer `_renderCampNPCs` coin arc L1306 | The coin arc parabola math (peak, arcLift, spinPhase, shadowBlur) is duplicated. The camp NPC coin arc was extracted from the well ritual but the helper wasn't shared. |

---

## Performance Concerns

| Concern | Location | Details |
|---------|----------|---------|
| Per-frame background canvas writes outside dirty gate | `RestRenderer` L421–511, `ArrowKeyIndicators`, `EquipmentSlots` | WASD keys, arrow indicators, and equipment slots all write to `bgCtx` every frame. The comment on EquipmentSlots says this is intentional for blink animation. But `drawCell` writes to the _background_ canvas — overwriting previously-cleared area each frame, which negates the entire `backgroundDirty` optimization for those regions. Either move these to `fgCtx` or use a local dirty flag per animation cycle. |
| `TitleRenderer.hexToRgb()` per-character per-frame | `TitleRenderer` L229 | During the fade phase, `hexToRgb()` is called for every non-transparent character of the title art every frame (potentially hundreds of calls). The result only changes when `baseColor` changes. Could be memoized with a simple 6-entry object. |
| `_hintCandidates` array allocated per frame | `RestRenderer` L110 | `const _hintCandidates = []` followed by `.push()` and `.sort()` runs every frame in REST state. Since the candidate set is at most 3 items, this is negligible but unnecessary. |
| `Math.random()` in chain lightning rendering | `ExploreRenderer` L906, `HutInteriorOverlay` L244 | Per-segment random jitter is called 4 times per arc per frame. The bolt shifts position each frame, which may be intentional for a flickering effect, but means the geometry is never stable — two renders of the same frame would differ. |
| `Math.random()` in steam cloud rendering | `ExploreRenderer` L961–962 | 4 scatter points per cloud re-randomized every frame — clouds shift position visibly each frame. Intentional for "steam" feel, but expensive if many clouds are present. |
| `Math.random()` in gem wand shake | `ExploreRenderer` L1034–1035 | Jitter recomputed per frame — 2 Math.random calls on every charge frame. Acceptable. |
| `PixelatedDissolve.render()` getImageData per frame | `TextEffects` L258 | During dissolve transition, reads then writes a full ImageData object on the offscreen canvas each frame. This is inherently pixel-level and can be slow on large font sizes, but is bounded by text width and unavoidable for the effect. Acceptable given it's used for UI labels only. |
| `ExploreRenderer.renderForeground()` loop over all backgroundObjects 3× | `ExploreRenderer` L291, L307, L319 | The method iterates `game.backgroundObjects` three times (animating objects, campfires, water tiles) in separate loops. Could be combined into a single loop with conditionals. Minor at typical room densities. |
| Steam cloud re-randomized scatter points render at positions outside the circle | `ExploreRenderer` L961–966 | The code generates random jitter then checks `dx*dx + dy*dy <= radius*radius` to reject out-of-circle points, but still allocates 4 positions even when all are rejected. Low impact. |

---

## Canvas State Leaks

| Location | Line(s) | Issue |
|----------|---------|-------|
| `ExploreRenderer._renderWellRitual()` | 1266–1268 | Sets `ctx.shadowColor` and `ctx.shadowBlur = 6` inside `ctx.save()` — correct. However, the save/restore is balanced (line 1262/1269), so this is fine. **But**: the same method sets shadow at L1262 save, then at L1272 a second `if` block uses the same `ctx` (not via save) before checking `wellFlashTimer`. If shadow state persists between the two `if` blocks on the same frame, the flash fill rect would also receive shadow blur. Needs verification — shadow should be cleared to 0 at the start of the well flash block or within its own save. |
| `ExploreRenderer._renderCampNPCs()` | 1320–1327 | Sets `ctx.shadowColor` and `ctx.shadowBlur = 6` inside `ctx.save()/ctx.restore()` — balanced, but same concern as well ritual. If `_renderCampNPCs` and `_renderWellRitual` both run in the same frame without a full fgCtx clear between them, the shadow would already be reset by restore. Canvas clear (`clearForeground`) at the top of `renderForeground` resets all state — this is safe. |
| `HutInteriorOverlay.render()` | 133–144 | Inside the WiseFellow hint `ctx.save()`, the font is changed at line 136. After `ctx.restore()` at 143, a manual font reassignment `ctx.font = '...'` is made at line 144 — this is redundant because restore() already reverts the font. The manual reset is harmless but suggests the author didn't trust the save/restore. Repeated at lines 337–344 (staircase prompt) and 359–370 (exit prompt): manual font resets after `ctx.restore()` in each block. Not a leak, but wasteful. |
| `MazeInteriorOverlay.render()` | 144 | Ghost rendering loop: `ctx.font` is reset manually at line 144 after `ctx.restore()` inside the phasesWalls branch. Same redundancy as HutInteriorOverlay. Also at line 121 in maze object adjacent-reveal section. |
| `InventoryOverlay.render()` | 71–73, 97–100, 112–114, 129–132, 144–146, 162–165 | Multiple `fgCtx.textAlign = 'left'` / `fgCtx.textAlign = 'center'` mutations without wrapping the method in `save/restore`. The inventory overlay leaves `textAlign` in whatever state the last rendered section left it (`'center'` if consumables is last). This persists into the next frame's rendering that uses `fgCtx` without explicitly setting textAlign. This is a **real canvas state leak** — any renderer drawing to `fgCtx` after `InventoryOverlay.render()` without resetting textAlign will inherit a potentially wrong value. |
| `ArrowKeyIndicators.render()` | 67–85 | Calls `fg.save() / fg.restore()` for the scaled overlay pass — balanced. However, the method also calls `this.renderer.drawCell()` which writes to `bgCtx`, not `fgCtx`. The bgCtx font is only set inside the `bgCtx.save()` at RestRenderer line 421 before calling `ArrowKeyIndicators.render()`. This is safe but the dependency on caller to save bgCtx is fragile. |

---

## Cross-Reference Notes

**ROLL_CHARS shadowing (ExploreRenderer line 1170):**  
`ExploreRenderer` imports `ROLL_CHARS` from `../../entities/TurtleShell.js` at line 25 for use in `renderTurtleBossComposite`. At line 1170, a `const ROLL_CHARS = ['O', 'o', '0', 'Q']` is declared locally for boulder animation. This shadows the import only within its block scope (`for ... of rocks`), but it will confuse maintainers and IDEs. The local array should be named `BOULDER_ROLL_CHARS` or similar.

**`_renderTurtleHeadP1` and `_renderTurtleHeadP2` unused `ctx` parameter:**  
Both methods accept `ctx` as first parameter (line 2013, 2025) but neither uses it — all drawing goes through `this.renderer.drawEntity()`. The parameter should be removed to avoid confusion.

**`game.showInventory` vs `game.keys.tab` inconsistency:**  
`NeutralRenderer` checks `game.showInventory` (line 146) to show the inventory overlay.  
`ExploreRenderer` checks `game.keys.tab` directly (line 1206).  
`RestRenderer` checks `game.keys.tab` (line 586).  
These should use the same trigger. If `game.showInventory` is the canonical flag, the other two should use it; if `keys.tab` is canonical, NeutralRenderer should use it. A mismatch means the inventory overlay may behave differently depending on which state the player is in (e.g., if `showInventory` can be true without tab being held, or vice versa).

**NeutralRenderer hardcodes `'@'` as player char (line 101):**  
The player's character can change depending on the active character type (e.g., different character roster entries). All other renderers use `game.player.char`. NeutralRenderer ignores this and always draws `'@'`. The player will appear as the wrong character in neutral rooms for any non-default character.

**`BowChargeIndicator` and `GreenRangerIndicator` have no interior guard:**  
Both indicators are called by `HutInteriorOverlay` (lines 303, 306) and `MazeInteriorOverlay` (lines 192, 193) after `ctx.translate(offsetX, offsetY)`. The indicators draw relative to `game.player.position`, which — inside the PiP — is in interior coordinates already shifted by the translate. This is **correct** because the translate is applied to ctx before the draw calls. However, the indicators use `this.renderer.drawRect()` which calls `fgCtx.fillRect()` — after the translate, this will be correctly offset. Verified: no issue here, but it requires awareness that indicator draws respect the current transform.

**`cleanseWave` and `bossDefeatFlash` not shown during NEUTRAL state:**  
The main.js render dispatch (line 5751) calls `renderCleanseWave` and `renderBossDefeatFlash` only when `state !== GAME_STATES.TITLE && state !== GAME_STATES.GAME_OVER`. NEUTRAL state is included. This means if a cleanse or boss defeat flash triggers while the player is in a neutral room (unlikely but possible during state transitions), it will overlay correctly.

**`renderSpellResponse` fires on GAME_OVER:**  
`renderSpellResponse` is called for all states except TITLE (line 5755). This means a spell response that was in-flight when the player died will continue rendering over the GAME_OVER death screen. This is cosmetically odd — a spell text ("HEAL" or "FROG") dissolving over the death scene. Consider adding GAME_OVER to the exclusion list.

**`ASCIIRenderer.drawGrid()` dead code:**  
The `drawGrid()` method (line 243) is never called from any renderer. It was presumably a debug aid from earlier development. It is safe to remove.

**`ASCIIRenderer.gridToPixel()` / `pixelToGrid()` uncalled:**  
Both coordinate helpers are defined but never called externally — all renderers inline `x * GRID.CELL_SIZE + GRID.CELL_SIZE / 2`. These exist as helpers but are not used. Either document them as utilities or remove to avoid confusion about whether they should be used.

**NeutralRenderer missing non-background entity passes:**  
NeutralRenderer renders items, ingredients, and script hooks, but has no explicit render path for:
- Particle effects (`game.particles`) — if a particle spawns in a neutral room (e.g., from an onRender hook), it will not appear unless the script's `onRender` handles it.
- The player bow charge indicator — BowChargeIndicator is not called in NeutralRenderer. If the player has a bow drawn in a neutral room, there is no charge feedback.
- Debris — no debris pass in neutral rooms. Likely intentional since there's no combat.

**`ExploreRenderer.renderForeground()` does not guard `game.boulderSystem`:**  
Line 1150 checks `if (!inHut && !inMaze && game.boulderSystem)` — correct optional chaining. However line 1152 then calls `game.boulderSystem.getRenderData()` — if `getRenderData` doesn't exist on the system, this would throw. The current BoulderSystem likely implements this, but there is no fallback. Acceptable but worth noting.

**Sapping enemy indicators are drawn twice for non-boss sapping enemies (ExploreRenderer lines 1091–1121):**  
The sapping block at lines 1091–1121 draws sapping enemies _and_ their sapping indicators. However, `renderEnemy()` is also called for all non-sapping enemies at lines 666–676, and `renderEnemy()` itself also draws `enemy.getSappingIndicator()` at lines 1588–1597. Sapping enemies skip the first block (`if (enemy.sapping) continue`), so they are rendered exclusively in the second block at lines 1091–1121. The sapping indicator inside `renderEnemy()` would _also_ fire for any sapping enemy whose `renderEnemy()` is called from elsewhere (e.g., HutInteriorOverlay). This is fine in the main explore pass but could produce double indicators in the hut overlay if a sapping enemy is ever placed inside a hut.

---

*End of review. Total issues found: 3 confirmed state mutations, 4 unquoted font strings, 1 player char hardcode, 1 InventoryOverlay textAlign leak, 3 dead methods, 1 ROLL_CHARS variable shadow, 1 showInventory/keys.tab inconsistency, and 6 major areas of duplicated rendering logic.*
