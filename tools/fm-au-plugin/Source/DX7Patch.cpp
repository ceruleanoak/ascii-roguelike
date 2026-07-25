// DX7Patch.cpp — VCED param array -> Patch, plus a single-voice .syx reader.
// Port of patchFromVCED() from tools/audio-common/fm-engine.cjs and of the
// format-0 (VCED) path of tools/audio-common/syx.cjs.

#include "DX7Patch.h"

#include <cmath>
#include <cstring>

namespace fmau {

namespace {

// DX7 operator output level (0-99) -> linear amplitude, from fm-engine.cjs.
#include "generated/DX7OutputLevels.inc"

double mapOutputLevel(int v) {
  const int idx = v < 0 ? 0 : (v > 99 ? 99 : v);
  return kOutputLevelTable[idx] * 1.27;
}

void clampByte(uint8_t& b, int hi) {
  if (b > hi) b = static_cast<uint8_t>(hi);
}

// DX7 checksum: 7-bit masked two's complement of the byte sum. From syx.cjs.
uint8_t calcChecksum(const uint8_t* bytes, size_t len) {
  int sum = 0;
  for (size_t i = 0; i < len; i++) sum += bytes[i];
  return static_cast<uint8_t>((0x80 - (sum & 0x7f)) & 0x7f);
}

} // namespace

void sanitizeVCED(uint8_t* v) {
  for (int op = 0; op < 6; op++) {
    uint8_t* d = v + op * 21;
    for (int i = 0; i < 4; i++) clampByte(d[i], 99);      // EG rates R1..R4
    for (int i = 4; i < 8; i++) clampByte(d[i], 99);      // EG levels L1..L4
    clampByte(d[8], 99);                                  // kbd level scaling break point
    clampByte(d[9], 99);                                  // ... left depth
    clampByte(d[10], 99);                                 // ... right depth
    clampByte(d[11], 3);                                  // ... left curve
    clampByte(d[12], 3);                                  // ... right curve
    clampByte(d[13], 7);                                  // kbd rate scaling
    clampByte(d[14], 3);                                  // amp mod sensitivity
    clampByte(d[15], 7);                                  // key velocity sensitivity
    clampByte(d[16], 99);                                 // operator output level
    clampByte(d[17], 1);                                  // osc mode
    clampByte(d[18], 31);                                 // osc freq coarse
    clampByte(d[19], 99);                                 // osc freq fine
    clampByte(d[20], 14);                                 // osc detune (0..14 -> -7..+7)
  }
  for (int i = 126; i < 134; i++) clampByte(v[i], 99);    // pitch EG rates + levels
  clampByte(v[134], 31);                                  // algorithm
  clampByte(v[135], 7);                                   // feedback
  clampByte(v[136], 1);                                   // osc key sync
  clampByte(v[137], 99);                                  // LFO speed
  clampByte(v[138], 99);                                  // LFO delay
  clampByte(v[139], 99);                                  // LFO pitch mod depth
  clampByte(v[140], 99);                                  // LFO amp mod depth
  clampByte(v[141], 1);                                   // LFO sync
  // Waveform is masked to 0..7 rather than the DX7's legal 0..5, because the JS
  // switch routes 5/6/7 alike to sample-and-hold via its `default` branch.
  clampByte(v[142], 7);                                   // LFO waveform
  clampByte(v[143], 7);                                   // pitch mod sensitivity
  clampByte(v[144], 48);                                  // transpose
  for (int i = 145; i < 155; i++) clampByte(v[i], 127);   // name
}

void patchFromVCED(const uint8_t* v, Patch& out) {
  for (int i = 0; i < 6; i++) {
    const int d = (5 - i) * 21; // OP(i+1) lives in VCED slot 5-i
    const int oscMode = v[d + 17] & 1;
    const int coarse = v[d + 18];
    const int fine = v[d + 19];
    OperatorParams& o = out.operators[i];
    o.enabled = true;
    for (int r = 0; r < 4; r++) o.rates[r] = v[d + r];
    for (int l = 0; l < 4; l++) o.levels[l] = v[d + 4 + l];
    o.outputLevel = mapOutputLevel(v[d + 16]);
    o.oscMode = oscMode;
    o.freqRatio = (coarse == 0 ? 0.5 : static_cast<double>(coarse)) * (1 + fine / 100.0);
    o.freqFixed = std::pow(10.0, coarse % 4) * (1 + (fine / 99.0) * 8.772);
    o.detune = v[d + 20] - 7; // VCED 0..14 -> -7..+7
    o.velocitySens = v[d + 15];
    o.lfoAmpModSens = v[d + 14];
  }
  out.algorithm = (v[134] & 0x1f) + 1;
  out.fbRatio = std::pow(2.0, (v[135] & 7) - 7);
  for (int i = 0; i < 4; i++) {
    out.pitchEGRates[i] = v[126 + i];
    out.pitchEGLevels[i] = v[130 + i];
  }
  out.lfoSpeed = v[137];
  out.lfoDelay = v[138];
  out.lfoPitchModDepth = v[139];
  out.lfoAmpModDepth = v[140];
  out.lfoPitchModSens = v[143];
  out.lfoWaveform = v[142] & 7;
  out.controllerModVal = 0.0;
  vcedName(v, out.name);
}

void vcedName(const uint8_t* v, char* out) {
  for (int i = 0; i < 10; i++) {
    const int c = v[145 + i] & 0x7f;
    out[i] = (c >= 0x20 && c < 0x7f) ? static_cast<char>(c) : ' ';
  }
  out[10] = '\0';
  for (int i = 9; i >= 0 && out[i] == ' '; i--) out[i] = '\0'; // trim trailing spaces
}

void unpackVoice(const uint8_t* p, uint8_t* v) {
  for (int op = 0; op < 6; op++) {
    const uint8_t* o = p + op * 17; // packed source offset
    uint8_t* d = v + op * 21;       // VCED dest offset
    for (int i = 0; i < 11; i++) d[i] = o[i] & 0x7f;    // R1..R4 L1..L4 BP LD RD
    d[11] = o[11] & 0x03;                               // KBD scale LEFT curve
    d[12] = (o[11] >> 2) & 0x03;                        // KBD scale RIGHT curve
    d[13] = o[12] & 0x07;                               // KBD rate scaling
    d[14] = o[13] & 0x03;                               // amp mod sensitivity
    d[15] = (o[13] >> 2) & 0x07;                        // key velocity sensitivity
    d[16] = o[14] & 0x7f;                               // operator output level
    d[17] = o[15] & 0x01;                               // osc mode (0=ratio,1=fixed)
    d[18] = (o[15] >> 1) & 0x1f;                        // osc freq coarse
    d[19] = o[16] & 0x7f;                               // osc freq fine
    d[20] = (o[12] >> 3) & 0x0f;                        // osc detune
  }
  for (int j = 0; j < 8; j++) v[126 + j] = p[102 + j] & 0x7f; // pitch EG rates+levels
  v[134] = p[110] & 0x1f;        // algorithm
  v[135] = p[111] & 0x07;        // feedback
  v[136] = (p[111] >> 3) & 0x01; // oscillator key sync
  v[137] = p[112] & 0x7f;        // LFO speed
  v[138] = p[113] & 0x7f;        // LFO delay
  v[139] = p[114] & 0x7f;        // LFO pitch mod depth
  v[140] = p[115] & 0x7f;        // LFO amp mod depth
  v[141] = p[116] & 0x01;        // LFO sync
  v[142] = (p[116] >> 1) & 0x07; // LFO waveform
  v[143] = (p[116] >> 4) & 0x07; // pitch mod sensitivity
  v[144] = p[117] & 0x7f;        // transpose
  for (int k = 0; k < 10; k++) v[145 + k] = p[118 + k] & 0x7f; // name
}

namespace {

// Copy one already-unpacked VCED voice into slot `slot` of the bank.
void addVoice(Bank& out, int slot, const uint8_t* vced) {
  uint8_t* dst = out.voices[slot];
  for (int p = 0; p < kVcedParams; p++) dst[p] = vced[p] & 0x7f;
  sanitizeVCED(dst);
  vcedName(dst, out.names[slot]);
}

constexpr size_t kDataStart = 6; // after F0 43 ss ff bc_ms bc_ls
constexpr size_t kVmemData = static_cast<size_t>(kVmemPacked) * kVmemVoices; // 4096

} // namespace

bool readSysExBank(const uint8_t* bytes, size_t length, Bank& out) {
  out.count = 0;

  // Framed: scan for an F0..F7 Yamaha block in a recognised format.
  for (size_t i = 0; i < length; i++) {
    if (bytes[i] != 0xf0) continue;
    size_t end = i + 1;
    while (end < length && bytes[end] != 0xf7) end++;
    if (end >= length) break; // unterminated — stop
    const uint8_t* msg = bytes + i;
    const size_t msgLen = end - i + 1;
    if (msgLen > kDataStart + 2 && msg[1] == 0x43) {
      const int format = msg[3] & 0x7f;
      if (format == 0 && msgLen >= kDataStart + kVcedParams + 2) {
        // Checksums are computed but not enforced, matching syx.cjs (warn-only).
        (void)calcChecksum(msg + kDataStart, kVcedParams);
        addVoice(out, 0, msg + kDataStart);
        out.count = 1;
        return true;
      }
      if (format == 9 && msgLen >= kDataStart + kVmemData + 2) {
        (void)calcChecksum(msg + kDataStart, kVmemData);
        for (int vi = 0; vi < kVmemVoices; vi++) {
          uint8_t vced[kVcedParams];
          unpackVoice(msg + kDataStart + static_cast<size_t>(vi) * kVmemPacked, vced);
          addVoice(out, vi, vced);
        }
        out.count = kVmemVoices;
        return true;
      }
    }
    i = end;
  }

  // Unframed payloads, identified by length — same fallbacks as syx.cjs.
  if (length == static_cast<size_t>(kVcedParams)) {
    addVoice(out, 0, bytes);
    out.count = 1;
    return true;
  }
  if (length == kVmemData || length == kVmemData + 1) {
    for (int vi = 0; vi < kVmemVoices; vi++) {
      uint8_t vced[kVcedParams];
      unpackVoice(bytes + static_cast<size_t>(vi) * kVmemPacked, vced);
      addVoice(out, vi, vced);
    }
    out.count = kVmemVoices;
    return true;
  }
  if (length == static_cast<size_t>(kVmemPacked)) {
    uint8_t vced[kVcedParams];
    unpackVoice(bytes, vced);
    addVoice(out, 0, vced);
    out.count = 1;
    return true;
  }
  return false;
}

} // namespace fmau
