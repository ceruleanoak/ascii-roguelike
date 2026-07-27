# Enemy Editor

A live, schema-driven dev tool for designing enemies for `src/data/enemies.js`.
Unlike the SFX editor (standalone Electron + JSON assets), enemies are
*behavioral* and live in hand-authored source, so this tool runs **inside the
Vite dev server** and imports the **real** `Enemy`, `PhysicsSystem`, and
mechanic code. You see the enemy actually move, telegraph, and attack a dummy
player — no logic is duplicated or stubbed.

## Run

```
npm run enemy-editor      # opens http://localhost:3000/tools/enemy-editor/index.html
```

(or just `npm run dev` and browse to that path).

## Layout

- **Left — form.** Every field in the enemy contract, grouped: identity, core
  combat, telegraph, visual, physics, behavior, movement archetype (config fields
  appear per style), interaction flags, elemental affinity, audio, and all ~20
  composable mechanics (toggle a mechanic to reveal its config). Driven entirely
  by `src/schema.js`, so it stays in sync with the data model.
  - **Telegraph** is a *gated* section — its heading is a checkbox, because the
    absence of a `telegraph` key is itself meaningful (the enemy keeps the legacy
    single-rect windup visual). Toggling it off removes the block entirely rather
    than zeroing it. Pick a shape preset + animation, or author an explicit
    `warnShape`/`hitShape`/`pulses`. The animation list filters to the motions the
    chosen shape declares support for, so a bad pairing is hard to make in the
    first place; an already-selected animation is never dropped by a shape switch,
    and an explicit shape (no preset) has nothing to pair against so all are
    offered. Authoring notes under the section report what the data compiles to
    (how many hits land, when, how hard) and flag the rest: an animation left on
    an incompatible shape, `pulses` fighting a declared animation, beat damage on
    a one-beat animation, dimensions under the legibility floor that read as a
    line rather than an area, and a hit shape reaching past its own warning.
- **Center — live sandbox.** The real `Enemy` instance against `@` (you). Move
  with the mouse (or WASD with mouse-follow off); Space pauses. Green ring =
  aggro range, red ring = attack range. Telegraphs (`!` windup, `?` memory,
  `...` trap) and emitted attacks/projectiles render exactly as the AI produces
  them. Spawning and split-on-damage spawn real children. `depth` rescales HP/damage.
  - **⚡ Telegraph** (or `T`) forces the melee windup the Telegraph rides on, so a
    shape can be reviewed without waiting for the AI to decide to swing. **speed**
    slows the whole sim — a beat's active window is 0.30 double-seconds (0.15s
    real), so 0.25× or slower is the only way to actually read a sweep.
- **Right — codegen.** A paste-ready `enemies.js` entry, keyed by char, with
  pixel fields factored to `GRID.CELL_SIZE * n` and default-valued optional
  fields pruned. **Copy** to clipboard.

## Persistence

- **Load preset** clones any existing enemy from the live `ENEMIES` registry to
  use as a starting point (never mutates the registry).
- **Save draft** writes the raw definition as JSON to `templates/<name>.json`
  (git-tracked) via a dev-only Vite middleware (`/api/enemy-drafts`). **Open
  draft** reloads one. Drafts are working state — the canonical home is still
  `src/data/enemies.js`, which you edit by pasting the generated entry.

## Architecture

| File | Role |
|------|------|
| `src/schema.js` | Single source of truth: fields, types, defaults, mechanics. |
| `src/telegraph.js` | Shape/animation options read off the real library + authoring validation. |
| `src/form.js` | Generic form generator from the schema. |
| `src/sandbox.js` | Live sim: real `Enemy` + `PhysicsSystem`, dummy player, attack/telegraph rendering. |
| `src/codegen.js` | Def → `enemies.js` literal (+ JSON draft round-trip). |
| `src/util.js` | Dotted-path get/set, default-def assembly. |
| `src/app.js` | Wires form ↔ sandbox ↔ codegen ↔ draft store. |

The draft middleware lives in the repo `vite.config.js` (`enemyEditorPlugin`),
dev-only — it never ships in `npm run build`.

### Keeping in sync

When the enemy contract changes in `src/data/enemies.js` / `Enemy.js` /
`entities/enemyMechanics/`, update `src/schema.js` to match. The sandbox uses
the real code, so behavior never drifts; only the form/codegen field catalog is
hand-maintained.

**A field's `default` is a contract with the runtime, not documentation.**
Codegen prunes any key equal to its default, so a default that disagrees with
what the game falls back to silently retunes the enemy on the way out of the
editor. Copy the fallback from the read site — write it as a function of the def
when the game derives it (`preferredRange` is `attackRange * 0.8`), and mark the
field `noPrune` when the game has no fallback at all and would read `undefined`.
A field that only applies to some enemies carries a `showIf`, which both hides it
in the form and prunes it from the output, so one archetype's parameters never
land on another's. `tools/debug/editor-roundtrip.mjs` checks all of this against
the whole registry.

Telegraph Areas and animations are the exception: `src/telegraph.js` imports
`AREA_PRESETS` / `ANIMATIONS` / `SIZES` from `src/game/TelegraphAnimation.js`, so
adding an Area or animation to the library makes it selectable here with no edit
to the editor. The validation notes read the same catalogs (an animation's own
`areas` list), so a compatibility rule is only ever stated once.
