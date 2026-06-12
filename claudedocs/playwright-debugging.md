# Playwright In-Browser Debugging Method

Proven workflow for reproducing and root-causing live gameplay bugs that resist
static code reading (NaN corruption, render-skip states, physics flukes,
"player disappears" class). First used to crack bug #89 (yellow-zone NaN
cascade) after several hours of code reading found nothing.

## When to use

- Symptom is **emergent** (needs real frame loop, real spawns, real input timing).
- Headless Node simulation of isolated systems came back clean (always try that
  first — it's 10× cheaper; see "Escalation ladder" below).
- You need a **stack trace for a state corruption**, not just confirmation it happens.

## Escalation ladder

1. **Read the suspect path** — guards, divisions, normalizations, `?? fallbacks`.
2. **Headless Node repro** (`tmp-repro.mjs`): import the real modules
   (`Player`, `PhysicsSystem`, `SandstormSystem`, `RoomGenerator`, …) and pump
   frames with `dt = 1/60`. Most entity/system modules import cleanly in Node —
   only renderer/audio touch browser APIs. Generate real rooms via
   `new RoomGenerator({ generateExits: () => ({}) }).generateRoom(null, null, '<zone>')`.
3. **Browser repro** (this document) when the headless run is clean but the bug
   is real — the difference is usually cross-system interaction
   (enemy AI ↔ physics ↔ input) that the slim harness doesn't wire up.

## Setup

1. **Expose the game instance** (temporary — ALWAYS revert before commit):

   ```js
   // src/main.js, load listener:
   window.game = new Game(); // TEMP: exposed for bug repro — revert before commit
   ```

2. **Dev server on a dedicated port** (won't collide with a user-run server):

   ```bash
   npm run dev -- --port 5199 > /tmp/vite-dev.log 2>&1 &
   curl -s http://localhost:5199/ | head -3   # confirm up
   ```

3. **Playwright import** — no local install needed; reuse the global MCP server's copy:

   ```js
   import { chromium } from '/Users/thomaslarson/.npm-global/lib/node_modules/@executeautomation/playwright-mcp-server/node_modules/playwright/index.mjs';
   ```

   Browsers are already cached in `~/Library/Caches/ms-playwright`.

## tmp-script conventions

- Scripts live at repo root as `tmp-*.mjs`, each with a header comment ending in
  "Deleted after the investigation." They are **never committed**.
- One script per question (repro / trap / verify) — don't grow a monolith.
- Cleanup checklist when done:
  ```bash
  rm -f tmp-*.mjs
  pkill -f "vite.*5199"
  # revert the window.game line in src/main.js
  npm run build   # confirm arch check + build still pass
  ```

## Driving the game

```js
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
page.on('console', m => { /* filter for your marker, e.g. t.includes('NANTRAP') */ });
page.on('pageerror', e => console.log('[pageerror]', e.message));
await page.goto('http://localhost:5199/');
await page.waitForFunction(() => window.game && window.game.player, { timeout: 15000 });
```

- **State transitions directly** — skip the title screen and exits:
  `game.stateMachine.transition('REST')` → `transition('EXPLORE')` →
  `game.handleZoneTeleport('yellow')`. Note `handleZoneTeleport` only works in
  EXPLORE (silently no-ops otherwise — check `stateMachine.getCurrentState()` after).
- **Character swap**: `game.deadCharacters = []; game.swapWithCharacter('red')`.
  Cycle all of `['red','cyan','yellow','green','gray']` when the bug might be
  roll-type-specific (each has a different `dodgeRoll.type`).
- **Input**: dispatch real keyboard events so `setupInput` paths run:
  ```js
  const dispatch = (type, key) => window.dispatchEvent(new KeyboardEvent(type, { key, bubbles: true }));
  dispatch('keydown', 'ArrowLeft'); dispatch('keydown', 'Shift');   // dodge roll
  setTimeout(() => { dispatch('keyup', 'Shift'); dispatch('keyup', 'ArrowLeft'); }, 200);
  ```
- **Frame stepping**: `await new Promise(r => requestAnimationFrame(r))` inside
  the loop — one iteration per rendered frame.
- **Sample many rooms**: re-roll with `game.handleZoneTeleport('<zone>')` every
  ~600 frames; per-room hazards (storm direction, lightning rooms, river
  layout) are re-randomized each warp.

## NaN-trap instrumentation (the key trick)

Replace fields on live objects with traps that capture a **stack trace at the
moment of corruption**:

```js
function instrument(obj, label, keys) {
  const backing = {};
  for (const k of keys) {
    backing[k] = obj[k];
    Object.defineProperty(obj, k, {
      get() { return backing[k]; },
      set(v) {
        if (!Number.isFinite(v) && Number.isFinite(backing[k]) && traps.length < 6) {
          traps.push({ label, key: k, value: String(v), stack: new Error().stack });
        }
        backing[k] = v;
      },
      configurable: true
    });
  }
}
instrument(game.player.position, 'position', ['x', 'y']);
instrument(game.player.velocity, 'velocity', ['vx', 'vy']);
```

Caveats learned the hard way:

- **Re-arm after warps** — room/zone transitions can replace the instrumented
  objects.
- **Arm enemies every frame** (use a `WeakSet` to avoid double-arming) — they
  spawn mid-room.
- The trap only fires on **finite → non-finite transitions**. An entity that
  spawns already-NaN is invisible to it — pair the trap with a per-frame
  `Number.isFinite` scan over all entities when the trap stays silent but the
  bug reproduces.
- Trap the *propagation target* (player) first; the stack tells you the
  propagation site, then trap the *source* population (enemies) to find origin.

## Detecting "not rendered"

Pixel-sample the foreground canvas at the entity's position — catches silent
draw failures (NaN coords, zero alpha, skip branches) regardless of cause:

```js
const ctx = document.querySelectorAll('canvas')[1].getContext('2d'); // fg layer
const d = ctx.getImageData(p.x, p.y, CELL_SIZE, CELL_SIZE).data;
let visible = false;
for (let i = 3; i < d.length; i += 4) if (d[i] > 30) { visible = true; break; }
```

Require an **invisible streak** (~30 consecutive frames) before flagging —
single-frame misses are normal (blink frames, overlap, dither).

Alongside pixels, snapshot the cheap state every frame:
`position finite, inHut/inMaze/inDungeon, plane, char, hidden,
_concealmentAlpha, dodgeRoll.active/type, hp, state` — anomalies in these
usually explain the pixels.

## Known invisibility mechanisms (checklist before deep-diving)

- **NaN position** — `enforceGridBounds` is NaN-blind (`<`/`>` all false) and
  `fillText(NaN, …)` draws nothing; NaN is therefore *permanent*. A NaN'd enemy
  poisons the player through `resolveEntityContacts` unless guarded
  (`Math.sqrt(NaN) || 1` masks NaN distance as 1 — see bug #89).
- **Interior flags** — surface player draw is gated on
  `!inHut && !inMaze && !inDungeon` (ExploreRenderer); a stale flag with no
  active overlay = invisible everywhere.
- **Tall-grass concealment** — `_concealmentAlpha ≤ 0.005` skips the draw (by
  design; counts `|` chars only).
- Exceptions in update/render are NOT a player-only invisibility cause — the
  rAF loop has no try/catch, so an exception freezes the whole game.
