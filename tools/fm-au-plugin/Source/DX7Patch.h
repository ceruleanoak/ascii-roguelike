// DX7Patch.h — VCED param array -> Patch, plus a single-voice .syx reader.
//
// Ports patchFromVCED() and OUTPUT_LEVEL_TABLE from tools/audio-common/fm-engine.cjs,
// and just enough of tools/audio-common/syx.cjs to read a 163-byte single-voice
// (VCED, format 0) SysEx message. Bank (VMEM) parsing is deliberately NOT ported —
// preset-browser owns that.
//
// The 155-entry VCED array stays the canonical patch representation, same as in
// the JS pipeline: syx -> VCED[155] -> Patch.

#pragma once

#include "DX7Voice.h"

#include <cstddef>
#include <cstdint>

namespace fmau {

constexpr int kVcedParams = 155;  // unpacked single-voice param count
constexpr int kVmemPacked = 128;  // packed bytes per voice in a bank
constexpr int kVmemVoices = 32;   // voices per bank

// A parsed .syx payload: either one voice (count == 1) or a full 32-voice bank.
// Voices are stored as canonical, already-sanitized VCED param arrays.
struct Bank {
  int count = 0;
  uint8_t voices[kVmemVoices][kVcedParams] = {};
  char names[kVmemVoices][11] = {};
};

// Clamp every entry of a raw 155-byte VCED array to the range its parameter is
// documented to occupy, in place.
//
// This has no counterpart in the JS. There, an out-of-range byte indexes past a
// lookup table, yields `undefined`, and quietly poisons the voice with NaN. In
// C++ the same byte is an out-of-bounds read, so ingest is the one place to make
// every downstream table lookup in-bounds by construction. Well-formed patches
// from syx.cjs are unaffected — its unpackVoice already masks to these ranges.
void sanitizeVCED(uint8_t* v);

// Build the engine patch from a 155-entry VCED array. Direct port of
// patchFromVCED(); VCED stores operators OP6..OP1 (slots 0..5) while the engine
// indexes OP1..OP6 (0..5).
void patchFromVCED(const uint8_t* v, Patch& out);

// Expand one 128-byte packed (VMEM) voice into a 155-entry VCED array.
// Port of unpackVoice() from syx.cjs.
void unpackVoice(const uint8_t* packed, uint8_t* vced);

// Parse a .syx byte stream into `out`. Handles the two formats the DX7 emits and
// that preset-browser already reads: format 0 (single voice, VCED) and format 9
// (32-voice bank, VMEM). Tolerates leading/trailing junk and raw unframed 155-byte
// or 4096-byte payloads. Checksums are computed but a mismatch is not fatal,
// matching syx.cjs's warn-only behavior. Returns false if nothing parseable.
//
// This is the live-link entry point: preset-browser sends the selected patch as a
// VCED SysEx message over a virtual MIDI port, and the plugin loads it instantly,
// so all filtering/favorites/tags/notes/clustering stays in preset-browser.
bool readSysExBank(const uint8_t* bytes, size_t length, Bank& out);

// The 10-character patch name carried in VCED bytes 145..154, trimmed, as a
// NUL-terminated string. `out` must have room for 11 bytes.
void vcedName(const uint8_t* v, char* out);

} // namespace fmau
