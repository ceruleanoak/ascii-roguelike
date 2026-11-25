# fm-au-plugin — Tool Dev Instructions

`FMVoice`: the DX7 FM engine from [`../audio-common/`](../audio-common/) as an **Audio Unit v2 instrument**, so the patches browsed in [`../preset-browser/`](../preset-browser/) can be played live in Logic Pro. Logic loads AU only — it has never supported VST/VST3.

Not published anywhere; personal tool, part of the `ascii-roguelike` repo.

## Why no Xcode.app, and what that forces

The whole build is Command Line Tools only (`clang++`, `cmake`, `codesign`, `auval` — `auval` lives at `/usr/bin/auval` and is **not** gated behind Xcode.app).

- **JUCE is ruled out.** Its CMake AU target shells out to `xcodebuild`, which ships only with the full Xcode.app.
- **Apple's `AudioUnitSDK`** (Apache-2.0) is used instead. It ships *only* an `.xcodeproj`, but its README explicitly sanctions adding its sources directly to your own target — that is what `CMakeLists.txt` does.
- **Never configure with `-G Xcode`.** CMakeLists hard-errors on it.
- **The `.component` bundle is assembled by hand** in a POST_BUILD step (`Contents/{Info.plist,PkgInfo,MacOS/FMVoice}` + ad-hoc `codesign`), because there is no Xcode packaging phase to do it.
- **`Info.plist` is hand-written and complete.** The SDK's demo plist is Xcode-variable-templated and omits the `AudioComponents` array entirely. `factoryFunction` must match the symbol `AUSDK_COMPONENT_ENTRY` generates: class name + `Factory` (`DX7AudioUnitFactory`).

### Two environment facts that will bite you

- **This machine's Command Line Tools install is partial**: `/Library/Developer/CommandLineTools/usr/include/c++/v1/` exists but contains only `__cxx_version`, so clang finds it, stops, and never falls back to the SDK's real libc++. Symptom: `'bitset' file not found` on a trivial program. CMakeLists detects this and injects `-isystem $(xcrun --show-sdk-path)/usr/include/c++/v1`. Don't "simplify" that block away.
- **`auval` caches component registrations.** After changing `Info.plist` or the 4-char codes you will get `Cannot get Component's Name strings` / `didn't find the component` until you run `killall -9 AudioComponentRegistrar`.

## Build / install / verify

```
cmake -B build && cmake --build build          # -> build/FMVoice.component
cmake --build build --target install-au        # -> ~/Library/Audio/Plug-Ins/Components/
cmake --build build --target validate          # auval -v aumu Fmv1 Cok1   (must PASS)
```

Identity: type `aumu`, subtype `Fmv1`, manufacturer `Cok1`. These live in **both** `Info.plist` and `CMakeLists.txt` — change both together.

## How patches get in — the live link

**The plugin has no patch browser and must never grow one.** All filtering, favorites, notes, tags, ratings and clustering stay in `preset-browser`, which remains the only writer of `library/*.json`. The plugin is a player.

### Logic does not deliver SysEx to instrument plugins

**Measured 2026-07-25 with `tests/host-test.cpp`, which drives the installed component through the AU C API.** All four patch-loading paths work *in the plugin* — SysEx, factory preset, and `.aupreset`/ClassInfo — and a SysEx-loaded patch renders bit-identically to the same patch from the preset menu. But in Logic the plugin still plays only its default, because Logic does not forward SysEx from a MIDI input to an AU instrument.

So **the primary way the library reaches Logic is `scripts/export-library.cjs`** (`.aupreset` files, path D), not the live link. preset-browser's **→ Logic** button runs it (`--clean --json`, forked from `main.js`); `--clean` removes only presets the exporter itself wrote (byte-identical regeneration check), never ones saved from Logic. Run `./build/host-test <voice.syx> <preset.aupreset>` before blaming the plugin for any future "patch won't load" report — it tells you which side is broken.

The live SysEx link still works and is kept for hosts that do route SysEx; it is not the Logic workflow.

### The live link (works, but not in Logic)

Selecting a voice in `preset-browser` pushes it to the running plugin as a **DX7 VCED SysEx dump over a virtual MIDI port** (macOS IAC Driver). Plumbing:

| Where | What |
|---|---|
| `preset-browser/index.html` | `→ AU` port picker; `sendToPlugin()` called from `selectVoice`'s `show()` |
| `preset-browser/main.js` | `voice-sysex` IPC handler (reuses `syx.cjs` `buildVoiceSysEx`) + Web MIDI sysex permission grant |
| `Source/PluginEntry.cpp` | `HandleSysEx` → `readSysExBank` → load |

A 32-voice **VMEM bank** sent the same way replaces the plugin's factory-preset list, so Logic's own preset menu browses it — still zero custom UI. Logic's native *Save/Load Setting…* also works, because `SaveState`/`RestoreState` carry the 155-byte VCED array under the `vcedData` key.

## Keeping the port honest

`Source/DX7Voice.cpp` is a class-by-class, name-for-name port of `../audio-common/dx7-worklet.js`, and `DX7Patch.cpp` ports `patchFromVCED` from `fm-engine.cjs` plus `syx.cjs`'s VCED/VMEM readers. **Change one, change the other**, and keep them diffable.

- **Lookup tables are generated, never hand-copied**: `node scripts/gen-tables.cjs` extracts `ALGORITHMS`, `ENV_OUTLEVEL`, `ENV_STATICS`, `LFO_FREQ`, `PE_RATE`, `PE_TAB`, `OUTPUT_LEVEL_TABLE` from the JS into `Source/generated/*.inc` (committed, so the build needs no Node). `ENV_LUT` is emitted as V8's computed floats (`DX7EnvLut.inc`) rather than recomputed with libm `pow()`, which rounds a couple of entries differently.
- **The envelope is Dexed's** (msfa `env.cc`, `ACCURATE_ENVELOPE`): Q24 integer level stepped per 64-sample block with a linear gain ramp, static holds for flat segments, rates referenced to 44.1 kHz and rescaled to the host rate. It is verified against the vendored Dexed WASM (attack/decay times and all 77 static-hold rates). Keyboard rate/level scaling and velocity's share of the absolute level are still not modelled. Note the preset-browser's own msfa engine (vendored WebDX7) does **not** rescale for sample rate, so at 48 kHz it plays envelopes ~9% faster than FMVoice.
- **Prove it still matches** after any DSP edit:
  ```
  cmake --build build --target parity-render && node scripts/parity-check.cjs [bank.syx]
  ```
  This renders the same patch through both engines and diffs sample-for-sample. Baseline over the 8 ROM cartridges (256 voices, since the Dexed envelope port 2026-11-24): **219 bit-identical**, 24 same-level micro-phase differences, 10 excluded (sample-and-hold LFO uses a different RNG), 3 high-feedback patches whose level differs by 1–5% (CLAV 2, and one each in ROM3A/3B; earliest divergence sample 53).
- **Expect divergence only from feedback.** V8's `Math.sin`/`Math.pow` and Apple's libm differ by under 1 ULP; every DX7 algorithm routes one operator back into itself, so a hot feedback operator is a chaotic oscillator that amplifies that noise. A patch that diverges **at sample 0**, or a `NON-FINITE` result, is a real bug — that is what the check gates on.

### Deliberate divergences from the JS

| Change | Why |
|---|---|
| Voices preallocated, re-armed via `start()` | No allocation on the audio thread |
| `sanitizeVCED()` clamps every byte on ingest | Out-of-range bytes were a silent `NaN` in JS but an out-of-bounds table read in C++ |
| `sampleRate` is a member, not a global | An AU learns its rate from the host and can be re-initialized |
| xorshift instead of `Math.random()` | Sample-and-hold LFO needs an RT-safe RNG |

Anything the JS engine doesn't implement, this doesn't either: keyboard level/rate scaling, transpose, osc key sync, LFO sync, pitch bend, aftertouch. `patchFromVCED` simply never reads those bytes. Don't add them here first — add them to the JS engine, then port.

## Threading

Everything that mutates live engine state happens on the render thread. `HandleSysEx` parses into `pendingBank_` and raises an atomic flag that `Render()` consumes; the preset-name `CFString` cache is rebuilt lazily in `GetPresets` (a main-thread property call) because allocating CFStrings on the audio thread is not RT-safe. Keep new state changes on that pattern.

`vendor/` and `build/` are gitignored; the SDK is fetched by CMake at a pinned tag, not committed.
