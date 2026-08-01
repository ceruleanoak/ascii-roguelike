# audio-common — Tool Dev Instructions

Shared DX7/FM synthesis library. Not a standalone app — no `package.json`, no build step, zero runtime dependencies. Consumed by [`../preset-browser/`](../preset-browser/) and [`../sfx-editor/`](../sfx-editor/) via relative `require('../audio-common/xxx.cjs')`. Part of the `ascii-roguelike` repo (no separate GitHub repo); lives under version control at the main project root.

## Module Map

| File | Role |
|------|------|
| `syx.cjs` | DX7 SysEx (.syx) parser/writer. VCED (163-byte single voice) + VMEM (4104-byte 32-voice bank) ↔ canonical 155-entry VCED param array + friendly nested struct. Zero dependencies, CJS + browser global (`window.SyxParser`). |
| `features.cjs` | Extracts a numeric feature vector (algorithm-aware: carriers, ratios, envelope shape, LFO) from a parsed patch struct. Used for clustering and "more like this". Describes the *sound*, never the name. |
| `fm-engine.cjs` | Main-thread wrapper around `dx7-worklet.js`. Builds the worklet's patch param object from a 155-entry VCED array, drives note on/off. Custom-built synthesis engine (not msfa). |
| `dx7-worklet.js` | The actual DX7 FM synthesis DSP (AudioWorkletProcessor). Loaded as source text and `new Function`'d in both the browser (as a real worklet) and headless test/CLI scripts (with stubbed `AudioWorkletProcessor`/`registerProcessor` globals). |
| `msfa-engine.cjs` | Alternate engine: same interface as `fm-engine.cjs` but backed by the vendored **real Dexed** engine (`vendor/webdx7`, WASM) for ground-truth parity checks. Swappable with `fm-engine.cjs` transparently. |
| `vendor/webdx7/` | Vendored WebDX7 (MIT) — emscripten/WASM build of the actual Dexed C++ engine. Do not hand-edit; treat as third-party. |

## Test/Diagnostic Scripts

All are plain Node CLI scripts (`node <file>.cjs [args]`), no test runner/framework:

- `syx.test.cjs` — round-trip bit-packing + SysEx framing/checksum tests against synthetic voices. No real `.syx` files needed.
- `dx7-engine.test.cjs` — headless DSP smoke test for `dx7-worklet.js`: loads the worklet in Node with stubbed Web Audio globals, verifies synthesis is non-silent, finite, bounded, and decays after note-off.
- `msfa-test.cjs` — drives the vendored msfa/WebDX7 WASM engine headless to validate true Dexed parity.
- `diag-silence.cjs` / `render-verify.cjs` — batch-render every unique patch in a local Dexed cartridge library (`~/Library/Application Support/DigitalSuburban/Dexed/Cartridges`, hardcoded path, machine-specific) and flag silent/dead patches by measured peak output. `render-verify.cjs` merges `flag:dead` into `preset-browser/library/derived-tags.json`.
- `analyze-library.cjs` — data-driven classification: dedups the cartridge library by content hash, extracts features, z-normalizes, k-means clusters, labels clusters from voice names (names label, never drive, the clusters). Writes `derived-tags.json`/`features.json`/`taxonomy.json` into `../preset-browser/library/`.
- `syx-dump.cjs` — inspect `.syx` file(s)/directory contents via the parser (`--names` to list voice names).

Run any test directly: `node <script>.cjs`. There is no aggregate "run all tests" command — run each one you touched.

## Working in This Directory

- **Zero-dependency by design.** Don't add `npm` packages or a `package.json` here — both consuming tools (`preset-browser`, `sfx-editor`) `require()` these files directly by relative path with no install step. If a real dependency becomes unavoidable, that's a signal to raise it with the user before adding one.
- **Dual CJS/browser export pattern.** `syx.cjs`, `features.cjs`, `fm-engine.cjs`, `msfa-engine.cjs` all use the `(root, factory) => module.exports || root.Xxx` UMD-lite wrapper at the top. Preserve it when editing — these files run unmodified in both Node (tests/CLI) and the browser (via `<script>` or bundled into the sfx-editor/preset-browser Electron apps).
- **`dx7-worklet.js` is loaded as source text, not `require`'d**, in every headless script (see the `loadProcessor()` helper repeated in `diag-silence.cjs`, `render-verify.cjs`, `dx7-engine.test.cjs`). If you change its top-level structure, check that pattern still works — it stubs `AudioWorkletProcessor`/`registerProcessor` and does `new Function(...)(stubs..., src + ';return DX7Processor;')`.
- **155-entry VCED param array is the canonical patch representation** passed between `syx.cjs` → `features.cjs`/`fm-engine.cjs`. Don't introduce a second patch shape — extend the struct/array, don't replace it.
- **`vendor/webdx7/` is third-party (MIT).** Treat it as read-only vendored code; don't refactor it to match this repo's style. If it needs a fix, prefer patching at the call site in `msfa-engine.cjs`/`msfa-test.cjs`.
- **Hardcoded cartridge library path** (`~/Library/Application Support/DigitalSuburban/Dexed/Cartridges`) in `diag-silence.cjs`/`render-verify.cjs`/`analyze-library.cjs` (the last takes it as `argv[2]`) is machine-specific (this dev's Dexed install) — expected, not a bug to fix.
- Follow the root [`CLAUDE.md`](../../CLAUDE.md) for repo-wide conventions (character encoding, ADRs, git workflow) where applicable — most of it targets the game itself and doesn't apply to this standalone tool library.
