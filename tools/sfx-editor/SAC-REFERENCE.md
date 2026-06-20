# Super Audio Cart — recreation reference

Notes from the actual SAC Kontakt library (read-only, at
`~/Documents/Super Audio Cart/`) used to recreate its sounds in this editor for
**WAV asset creation**. We never modify the original install.

## What SAC actually is

Two master Kontakt instruments, **4,127 snapshots** total:

- **Super Audio Cart** — the consoles: `2600, C64, FC, GB, GEN, NES, SMS, SNES`
- **Super Audio Cart PC** — computer sources: `Adlib, Aegis, Amiga, MSX, Pokey, Tracker, WinGroove`

Samples live in encrypted `.nkx` monoliths (~6.4 GB). They are **not** extractable
to WAV and are licensed commercial content — so we recreate *character*, not content.

### SAC engine (from the manual, for reference)
Up to **4 layers (A–D)**, each with: sound source, volume/pan/pitch, **filter**
(LP/HP/BP/Notch + reso + cutoff env), **ADSR** volume / pitch / filter envelopes,
vibrato, portamento, mono/poly, keytracking, note-length. Per-layer **arp/sequencer**
with independent tables (Pitch, Volume, Length, **Wave** = duty-cycling, Cutoff, Pan,
Mod). **5 FX racks** (per-layer + global): EQ, delay, bitcrush, etc. A **mod matrix**.
A `RAW` mode bypasses everything for the 100% authentic chip source.

This editor is one-shot (WAV-focused) and maps the *sources* + the most useful
processing (filter, crush, envelopes, echo) — not the full mod-matrix/host-sync rig.

### Layers — the core SAC value (composite instruments)

FamiStudio already covers bit-accurate single-chip NES; SAC's real value is **stacking
authentic sources into one composite voice**, even across consoles (e.g. NES pulse +
SNES saw-string an octave down + a short-noise attack transient). So the editor supports
**up to 4 layers (A–D)** — `appState.sfx.layers[]`. Each layer is one stacked voice:

```
{ instrument, volumeEnvelope, pitchEnvelope, octave, detune (cents), mute, solo }
```

- `notes` and `echo` stay **shared** (one performance); every note triggers all *playable*
  layers, summed. `playableLayers()` = soloed layers if any are soloed, else all unmuted.
- **Editing targets the active layer** (`appState.activeLayer`, the Layer strip A–D);
  the Chip/Source/waveform panel and both envelope editors all act on it. **Audition**
  (PLAY / MIDI / on-screen keyboard) plays the **full stack**.
- Per-layer **octave + detune** fold into a `pitchMult = 2^octave · 2^(detune/1200)`
  applied to the voice (and the LFSR noise clock); per-layer level is `instrument.masterGain`.
- **Backward compatible:** `normalizeSfx()` wraps any legacy `{instrument, volumeEnvelope,
  pitchEnvelope}` sfx into `layers[0]`, applied at every entry point (load, preset, render).
  The 66 SAC templates + game SFX load unchanged; new saves are layered.

### Chip → Sound Source selection (mirrors SAC)

SAC's model: pick a **system** (console) → cycle its **sound sources** (◀ ▶) →
shape with one generic engine identical across consoles (authenticity lives in the
source; `RAW` proves the engine is otherwise transparent). We mirror this:

- The **Chip** dropdown selects a system and loads that chip's default source.
- The **Source** ◀ ▶ cycler steps through `CHIP_SOURCES[chip]` (in `index.html`),
  each entry applying only the voice-defining fields (see `VOICE_FIELDS`:
  `type, duty, wavetable, fm, noiseType, noiseFilterFreq, filterFreq, filterQ, crushBits`)
  while preserving `masterGain`, envelopes, echo, and notes.
- Hand-editing a waveform/param re-resolves the source (`detectSource`); if it no
  longer matches a catalog source it shows **"(custom)"**. `instrument.source` stores
  the active source name (render-inert; legacy templates without it are auto-detected).
- This is **not** a per-console output DSP — `instrument.chip` does not recolor
  arbitrary voices, exactly as in SAC.

## NES — true parity (chip-synthesizable)

SAC's NES sources are the literal 2A03 channels, and they map exactly onto this
editor's engine:

| SAC NES source        | editor instrument                        |
|-----------------------|------------------------------------------|
| Pulse 12.5 / 25 / 50% | `square` + `duty` 0.125 / 0.25 / 0.5      |
| Pulse *Hack* / X-Hack | thin/extreme duty + pitch scoop          |
| Triangle              | `wave` wavetable `nesTri` (4-bit 16-step staircase) |
| Long Noise            | `noise` `lfsr` (long tap → hiss)         |
| Short Noise           | `noise` `metallic` (short tap → tonal)   |
| FDS custom wave        | `wave` wavetable `fds`                    |
| DPCM Drumkits         | synth approximations (`nes/drums/*`)     |

Templates: `templates/sac/nes/{pulse,triangle,noise,fds,drums,fx}/`.

## SNES — synth approximations only

SAC's ~300 SNES patches are **recorded multisamples** (PIANO Acoustic, STRINGS
Cello/Fiddle/Pizz/Section, Guitar, Brass, Choir, Voice, Winds, Ethnic, Mallet…).
With the samples locked, this editor can only **imitate** them: saw/FM/wave voices +
lowpass `filterFreq` + `crushBits` 12 for the warm, grainy 16-bit/32 kHz feel.
These are labeled approximations, mirroring SAC's category tree under
`templates/sac/snes/{piano,strings,brass,guitar,choir,voice,winds,mallet,organ,bass,keys,synth,perc}/`.

**For bit-perfect SNES WAVs** there is only one real route: render them out of
Kontakt itself (load a snapshot → export audio, or batch-export), then drop the WAVs
into `public/assets/audio/`. That's outside this tool by design.

## Engine additions backing this (in `index.html`)

`instrument.type`: `square` (duty), `triangle`, `sawtooth`, `sine`, `wave`
(`wavetable` names a `WAVE_TABLES` entry incl. `nesTri`, `fds`), `fm`
(`{ratio,index,carrier,modWave}`), `noise` (`white/pink/metallic/lfsr`).
Optional per-voice `filterFreq`/`filterQ` (lowpass) and `crushBits` (bit-crush).
`instrument.chip` tags the console and `instrument.source` names the active
sound source (see "Chip → Sound Source selection" above). The sfx holds
`layers[]` (each a voice with its own instrument + envelopes + octave/detune/mute/solo);
`normalizeSfx()` migrates legacy single-instrument sfx. All additive — original
behavior preserved.
