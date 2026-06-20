# DX7 Preset Browser

A desktop **librarian + player** for Yamaha DX7 `.syx` patches, built to replace the
Logic Pro + Dexed workflow for sourcing game audio. It indexes an entire `.syx`
library, lets you audition / favorite / tag / rate / collect patches, and renders
chosen voices straight to game WAV assets — all through the **real Dexed engine**
(msfa, "Mark I") for true sonic parity.

Part of the `ascii-roguelike/tools/` suite. Shares synthesis/parsing code with
`../audio-common/` (also used by `../sfx-editor/`).

---

## Running

```bash
cd tools/preset-browser
npm start          # → ../sfx-editor/node_modules/.bin/electron .
```

It reuses the Electron binary from `../sfx-editor/node_modules` (no separate install).
On launch it parses every `.syx` under your Dexed cartridges folder:
`~/Library/Application Support/DigitalSuburban/Dexed/Cartridges`
(use **Open .syx…** to load a bank from elsewhere, **Reindex** to rescan).

---

## The engine (Dexed parity)

Audition and render both run **msfa**, the same C++ FM engine Dexed is built on,
compiled to WebAssembly and run in an AudioWorklet. The vendored build uses Dexed's
**Mark I** engine (`EngineMkI`) — Dexed's *default* — so patches match what you hear
in Logic. A pure-JS engine (`fm-engine.cjs`, derived from dx7-synth-js) remains only
as an automatic fallback if the WASM fails to load.

The **engine badge** in the top bar shows what's actually running:
`Dexed Mark I @ 48k` (good) or `JS fallback` (WASM didn't load).

### Parity checklist (if a patch sounds different from Dexed)
1. **Velocity** — DX7 brightness is velocity-sensitive (often via *modulators*). Match
   it with the `vel` slider; it sets a global play velocity used by audition + keys.
2. **Sample rate** — match your Logic session with the `SR` toggle (48k default). Bright
   patches alias differently at 44.1 vs 48 kHz.
3. **Engine type** — Dexed defaults to **Mark I**, which this app runs. If your Dexed is
   set to Modern/OPL, that's a deliberately different sound.
4. **Note / register** — especially for transposed/bass patches.
5. **Dexed Cutoff/Reso** — that filter is Dexed-only (not in the DX7 engine); keep it
   maxed for raw-engine parity.

---

## UI guide

Three panes + a keyboard:

- **Left sidebar** — views (**All**, **★ Favorites**, **★ Rated ≥4**), chip filters grouped
  by dimension (**My tags**, **Real-world instrument**, **Synthesis class**, **Character**,
  **Authors**), and the **Collections** tree.
- **Center** — search box + a **virtualized** voice list (all ~34k unique patches scroll;
  no cap). Each row: ★ favorite, name, derived-tag chips, `n★` rating, `×N` bank-count.
  Search supports `name` text plus `inst:` / `class:` / `author:` / `flag:` / `tag:` terms.
- **Right** — patch detail (algorithm/feedback/LFO/operators + ⚠ silent/slow warnings),
  **tag editor**, **rating**, **notes**, **More like this** (feature k-NN), **Add to
  collection**, and the on-screen piano.
- **Top bar** — Open/Reindex, engine badge, auto-audition, hide dead/unnamed, `⌨ keys play`,
  test-note, `vel`, octave ±, `SR`, master volume, Panic.

### Keyboard
- **↑ / ↓** — scan the list (auto-auditions each on select).
- **F** favorite · **T** tag · **C** add-to-collection · **1–5** rate (0 clears) · **Space** panic.
- **⌨ keys play** (checkbox) or **`` ` ``** (backtick) — toggle the computer keyboard between
  *browse shortcuts* (above) and *playing the synth*. When playing:
  - bottom row `z x c v b n m` = lower-octave white keys; `s d  g h j` = its sharps.
  - top row `q w e r t y u i` = upper-octave white keys; `2 3  5 6 7` = its sharps.
  - **− / =** shift octave; Ctrl = max velocity.
- **− / =** octave and **`` ` ``** toggle work in both modes. Text fields (search/tag/notes)
  capture typing normally; everything else lets the keys through.
- On-screen piano: click, or **click-and-drag** for glissando. A MIDI keyboard works too
  (real per-note velocity).

---

## Library data & curation

Favorites, tags, ratings, notes and collections persist as **git-trackable JSON** under
`library/`:

```
library/
  favorites.json     [pid, …]
  tags.json          { pid: [tag, …] }      (your manual tags)
  ratings.json       { pid: 1–5 }
  notes.json         { pid: "text" }
  derived-tags.json  { pid: [class/flag/inst/author tags] }   (from analysis, regenerable)
  features.json      { pid: [vector] }        (for "More like this")
  taxonomy.json      { class: {count, exemplars} }
  collections/**.json  { name, voices: [{pid, name}] }         (folders = nesting)
```

**Identity (`pid`)** = SHA-1 of a voice's synthesis params *excluding the name bytes*, so
re-labeled duplicate patches across banks collapse to one entry (138k voices → ~34k unique).
Favoriting/tagging applies to every copy, and survives file moves.

### Data-derived tags
`flag:` / `class:` / `inst:` tags come from analyzing the **patch data**, not just names:

```bash
node ../audio-common/analyze-library.cjs    # regenerates derived-tags/features/taxonomy
```
It extracts synthesis features (carriers, brightness, attack/sustain, inharmonicity, LFO,
register…), clusters them, and labels by signature (`class:bright-pluck`, etc.) plus per-patch
`flag:`s (`percussive`, `metallic`, `sustained`, `fixed-pitch`, `non-pitched`, `silent`,
`slow-attack`, `no-name`, …). `inst:` (e.g. `inst:bass`, `inst:bells`) is inferred from the
voice-name corpus. **Run this after adding cartridges.**

The **hide dead/unnamed** toggle hides `silent` / measured-`dead` / `no-name` patches (an
explicit name search overrides it).

---

## Rendering to game assets

Open a collection → **Render → WAV** → choose a folder. Each voice renders through msfa
(Web Worker, sample-exact, at the chosen note/velocity/sample-rate) to a 16-bit WAV. Because
audition and render share the engine, the asset matches what you previewed.

---

## File structure

```
preset-browser/
  main.js        Electron main: voice index (+pid dedup), load-voice, library JSON store,
                 collection path-escaped tree, write-wav, msfa/source IPC
  preload.js     contextBridge `api` surface
  index.html     the whole renderer (UI + logic), single file
  library/**     metadata store (committed)
../audio-common/
  syx.cjs            DX7 SysEx parser (VCED + VMEM), packVoice, struct
  features.cjs       synthesis feature extractor + descriptors + playability
  analyze-library.cjs offline classification → derived tags
  fm-engine.cjs      pure-JS FM engine (fallback) + WAV encoder
  msfa-engine.cjs    msfa (Dexed) engine wrapper: live worklet + Web-Worker offline render
  dx7-worklet.js     JS-engine AudioWorklet (fallback)
  vendor/webdx7/     vendored msfa WASM (MIT) rebuilt with Dexed EngineMkI (Apache-2.0)
```

### Rebuilding the msfa (Mark I) WASM
Requires `emscripten` (`brew install emscripten`). The vendored build was produced by:
cloning `webaudiomodules/webdx7`, adding Dexed's `EngineMkI.cpp/.h` to `src/c/`, making
`FmCore::render` virtual, setting `controllers_.core = new EngineMkI()` in the SynthUnit
ctor, adding `HEAPF32` to `EXPORTED_RUNTIME_METHODS`, then `cd build && make CC=em++` →
`node encode-wasm.js dx7.wasm`. Copy `dx7.js` + `dx7.wasm.js` into `vendor/webdx7/`.
See `vendor/webdx7/MARKI-BUILD-NOTES.txt`.

---

## Licensing / attribution
- msfa engine + `EngineMkI`: Apache-2.0 (Google; Pascal Gauthier / Dexed).
- WebDX7 WAM wrapper: MIT (Jari Kleimola).
- Do **not** commit Yamaha factory ROM `.syx` patches; users supply their own cartridges.
