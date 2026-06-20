// syx.js — Yamaha DX7 SysEx (.syx) parser.
//
// Decodes the two formats the original DX7 emits and that Dexed reads:
//   • VCED  — single voice dump, 163-byte SysEx (155 unpacked param bytes)
//   • VMEM  — 32-voice bank dump, 4104-byte SysEx (32 × 128 packed bytes = 4096)
//
// Returns voices as the canonical 155-entry VCED parameter array (the order the
// DX7 "single voice dump" uses), plus a friendly nested struct. The 155-byte VCED
// array is exactly what the msfa / Dexed engine consumes, so there's no lossy
// translation step between this parser and the FM engine.
//
// Byte/bit layout is taken verbatim from the canonical DX7 Data Format sheet
// (asb2m10/dexed Documentation/sysex-format.txt, sections D & F). Notably the
// packed (VMEM) operator block is 17 bytes with this bit packing:
//   b11: [3:2]=R.curve [1:0]=L.curve
//   b12: [6:3]=detune  [2:0]=rate-scale
//   b13: [4:2]=key-vel-sens [1:0]=amp-mod-sens
//   b15: [5:1]=freq-coarse  [0]=osc-mode
//   b110:[4:0]=algorithm   b111:[3]=osc-key-sync [2:0]=feedback
//   b116:[6:4]=pitch-mod-sens [3:1]=lfo-wave [0]=lfo-sync
//
// Zero-dependency. Works in Node (CommonJS) and the browser (window.SyxParser).

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SyxParser = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VCED_PARAMS = 155;       // unpacked single-voice param count
  var VMEM_PACKED = 128;       // packed bytes per voice in a bank
  var VMEM_VOICES = 32;        // voices per bank
  var VMEM_DATA = VMEM_PACKED * VMEM_VOICES; // 4096

  var LFO_WAVES = ['triangle', 'saw-down', 'saw-up', 'square', 'sine', 'sample-hold'];

  // ---- low-level helpers --------------------------------------------------

  function toBytes(input) {
    if (input instanceof Uint8Array) return input;
    if (typeof Buffer !== 'undefined' && Buffer.isBuffer && Buffer.isBuffer(input)) {
      return new Uint8Array(input.buffer, input.byteOffset, input.length);
    }
    if (input instanceof ArrayBuffer) return new Uint8Array(input);
    if (Array.isArray(input)) return Uint8Array.from(input);
    throw new TypeError('syx: expected Uint8Array, Buffer, ArrayBuffer or number[]');
  }

  // DX7 checksum: 7-bit masked two's complement of the byte sum.
  function calcChecksum(bytes, start, len) {
    var sum = 0;
    for (var i = 0; i < len; i++) sum += bytes[start + i];
    return (0x80 - (sum & 0x7f)) & 0x7f;
  }

  function cleanName(bytes, start) {
    var s = '';
    for (var i = 0; i < 10; i++) {
      var c = bytes[start + i] & 0x7f;
      s += (c >= 0x20 && c < 0x7f) ? String.fromCharCode(c) : ' ';
    }
    return s.replace(/\s+$/, '');
  }

  // ---- packed (VMEM) <-> unpacked (VCED) ----------------------------------

  // Expand one 128-byte packed voice into the 155-entry VCED param array.
  function unpackVoice(p, off) {
    off = off || 0;
    var v = new Array(VCED_PARAMS);
    for (var op = 0; op < 6; op++) {
      var o = off + op * 17; // packed source offset
      var d = op * 21;       // VCED dest offset
      for (var i = 0; i < 11; i++) v[d + i] = p[o + i] & 0x7f; // R1..R4 L1..L4 BP LD RD
      v[d + 11] = p[o + 11] & 0x03;          // KBD scale LEFT curve
      v[d + 12] = (p[o + 11] >> 2) & 0x03;   // KBD scale RIGHT curve
      v[d + 13] = p[o + 12] & 0x07;          // KBD rate scaling
      v[d + 14] = p[o + 13] & 0x03;          // amp mod sensitivity
      v[d + 15] = (p[o + 13] >> 2) & 0x07;   // key velocity sensitivity
      v[d + 16] = p[o + 14] & 0x7f;          // operator output level
      v[d + 17] = p[o + 15] & 0x01;          // osc mode (0=ratio,1=fixed)
      v[d + 18] = (p[o + 15] >> 1) & 0x1f;   // osc freq coarse
      v[d + 19] = p[o + 16] & 0x7f;          // osc freq fine
      v[d + 20] = (p[o + 12] >> 3) & 0x0f;   // osc detune
    }
    for (var j = 0; j < 8; j++) v[126 + j] = p[off + 102 + j] & 0x7f; // pitch EG rates+levels
    v[134] = p[off + 110] & 0x1f;            // algorithm
    v[135] = p[off + 111] & 0x07;            // feedback
    v[136] = (p[off + 111] >> 3) & 0x01;     // oscillator key sync
    v[137] = p[off + 112] & 0x7f;            // LFO speed
    v[138] = p[off + 113] & 0x7f;            // LFO delay
    v[139] = p[off + 114] & 0x7f;            // LFO pitch mod depth
    v[140] = p[off + 115] & 0x7f;            // LFO amp mod depth
    v[141] = p[off + 116] & 0x01;            // LFO sync
    v[142] = (p[off + 116] >> 1) & 0x07;     // LFO waveform
    v[143] = (p[off + 116] >> 4) & 0x07;     // pitch mod sensitivity
    v[144] = p[off + 117] & 0x7f;            // transpose
    for (var k = 0; k < 10; k++) v[145 + k] = p[off + 118 + k] & 0x7f; // name
    return v;
  }

  // Inverse of unpackVoice: 155 VCED params -> 128 packed bytes. Used to build
  // banks and to round-trip test the bit packing.
  function packVoice(v) {
    var p = new Uint8Array(VMEM_PACKED);
    for (var op = 0; op < 6; op++) {
      var o = op * 17, d = op * 21;
      for (var i = 0; i < 11; i++) p[o + i] = v[d + i] & 0x7f;
      p[o + 11] = ((v[d + 12] & 0x03) << 2) | (v[d + 11] & 0x03);
      p[o + 12] = ((v[d + 20] & 0x0f) << 3) | (v[d + 13] & 0x07);
      p[o + 13] = ((v[d + 15] & 0x07) << 2) | (v[d + 14] & 0x03);
      p[o + 14] = v[d + 16] & 0x7f;
      p[o + 15] = ((v[d + 18] & 0x1f) << 1) | (v[d + 17] & 0x01);
      p[o + 16] = v[d + 19] & 0x7f;
    }
    for (var j = 0; j < 8; j++) p[102 + j] = v[126 + j] & 0x7f;
    p[110] = v[134] & 0x1f;
    p[111] = ((v[136] & 0x01) << 3) | (v[135] & 0x07);
    p[112] = v[137] & 0x7f;
    p[113] = v[138] & 0x7f;
    p[114] = v[139] & 0x7f;
    p[115] = v[140] & 0x7f;
    p[116] = ((v[143] & 0x07) << 4) | ((v[142] & 0x07) << 1) | (v[141] & 0x01);
    p[117] = v[144] & 0x7f;
    for (var k = 0; k < 10; k++) p[118 + k] = v[145 + k] & 0x7f;
    return p;
  }

  // ---- friendly struct ----------------------------------------------------

  // Turn the flat 155-param array into a readable nested object (for UI / engine).
  function voiceToStruct(v) {
    var ops = [];
    // VCED stores operators OP6..OP1; expose them as op[0]=OP1 .. op[5]=OP6 for sanity.
    for (var idx = 0; idx < 6; idx++) {
      var srcOp = 5 - idx;          // OP6 first in the array
      var d = srcOp * 21;
      ops[idx] = {
        op: idx + 1,
        egRate: [v[d], v[d + 1], v[d + 2], v[d + 3]],
        egLevel: [v[d + 4], v[d + 5], v[d + 6], v[d + 7]],
        kbdLevelScaling: { breakPoint: v[d + 8], leftDepth: v[d + 9], rightDepth: v[d + 10],
                           leftCurve: v[d + 11], rightCurve: v[d + 12] },
        kbdRateScaling: v[d + 13],
        ampModSens: v[d + 14],
        keyVelSens: v[d + 15],
        outputLevel: v[d + 16],
        oscMode: v[d + 17] ? 'fixed' : 'ratio',
        freqCoarse: v[d + 18],
        freqFine: v[d + 19],
        detune: v[d + 20] - 7         // 0..14 maps to -7..+7
      };
    }
    return {
      name: cleanNameFromParams(v),
      algorithm: v[134] + 1,          // present 1-32 (stored 0-31)
      feedback: v[135],
      oscKeySync: !!v[136],
      pitchEG: { rate: [v[126], v[127], v[128], v[129]], level: [v[130], v[131], v[132], v[133]] },
      lfo: { speed: v[137], delay: v[138], pitchModDepth: v[139], ampModDepth: v[140],
             sync: !!v[141], waveform: LFO_WAVES[v[142]] || 'triangle', pitchModSens: v[143] },
      transpose: v[144] - 24,         // 0..48 maps to -24..+24 semitones
      operators: ops
    };
  }

  function cleanNameFromParams(v) {
    var s = '';
    for (var i = 0; i < 10; i++) {
      var c = v[145 + i] & 0x7f;
      s += (c >= 0x20 && c < 0x7f) ? String.fromCharCode(c) : ' ';
    }
    return s.replace(/\s+$/, '');
  }

  // ---- message scanning ---------------------------------------------------

  // Pull individual SysEx messages (F0..F7) out of a byte stream. A single file
  // can legitimately hold several concatenated dumps.
  function extractSysExMessages(bytes) {
    var msgs = [];
    var i = 0, n = bytes.length;
    while (i < n) {
      if (bytes[i] !== 0xf0) { i++; continue; }
      var end = i + 1;
      while (end < n && bytes[end] !== 0xf7) end++;
      if (end < n) { msgs.push(bytes.subarray(i, end + 1)); i = end + 1; }
      else break; // unterminated — stop
    }
    return msgs;
  }

  function parseMessage(msg, warnings) {
    // msg: one F0..F7 SysEx block
    if (msg[1] !== 0x43) { warnings.push('non-Yamaha SysEx ignored (id 0x' + msg[1].toString(16) + ')'); return []; }
    var format = msg[3] & 0x7f;
    var dataStart = 6; // after F0 43 ss ff bc_ms bc_ls

    if (format === 0) {              // single voice (VCED)
      if (msg.length < dataStart + VCED_PARAMS + 2) { warnings.push('truncated VCED message'); return []; }
      var sum = calcChecksum(msg, dataStart, VCED_PARAMS);
      if (sum !== msg[dataStart + VCED_PARAMS]) warnings.push('VCED checksum mismatch');
      var params = [];
      for (var i = 0; i < VCED_PARAMS; i++) params[i] = msg[dataStart + i] & 0x7f;
      return [makeVoice(params, 0)];
    }
    if (format === 9) {              // 32-voice bank (VMEM)
      if (msg.length < dataStart + VMEM_DATA + 2) { warnings.push('truncated VMEM bank'); return []; }
      var csum = calcChecksum(msg, dataStart, VMEM_DATA);
      if (csum !== msg[dataStart + VMEM_DATA]) warnings.push('VMEM checksum mismatch');
      var out = [];
      for (var vi = 0; vi < VMEM_VOICES; vi++) {
        out.push(makeVoice(unpackVoice(msg, dataStart + vi * VMEM_PACKED), vi));
      }
      return out;
    }
    warnings.push('unsupported SysEx format ' + format + ' (only 0=VCED, 9=VMEM)');
    return [];
  }

  function makeVoice(params, index) {
    return { index: index, name: cleanNameFromParams(params), params: params,
             struct: voiceToStruct(params) };
  }

  // ---- public entry point -------------------------------------------------

  // Parse any .syx payload. Tolerant of: SysEx-framed single/bank messages,
  // multiple concatenated messages, and raw (unframed) 4096-byte bank /
  // 128-byte packed voice / 155-byte VCED dumps.
  function parseSyx(input) {
    var bytes = toBytes(input);
    var warnings = [];
    var voices = [];

    var msgs = extractSysExMessages(bytes);
    if (msgs.length) {
      for (var m = 0; m < msgs.length; m++) voices = voices.concat(parseMessage(msgs[m], warnings));
    } else {
      // No SysEx framing — guess from length.
      if (bytes.length === VMEM_DATA || bytes.length === VMEM_DATA + 1) {
        for (var vi = 0; vi < VMEM_VOICES; vi++) voices.push(makeVoice(unpackVoice(bytes, vi * VMEM_PACKED), vi));
        warnings.push('raw (unframed) 32-voice bank assumed');
      } else if (bytes.length === VMEM_PACKED) {
        voices.push(makeVoice(unpackVoice(bytes, 0), 0));
        warnings.push('raw (unframed) packed single voice assumed');
      } else if (bytes.length === VCED_PARAMS) {
        var params = [];
        for (var i = 0; i < VCED_PARAMS; i++) params[i] = bytes[i] & 0x7f;
        voices.push(makeVoice(params, 0));
        warnings.push('raw (unframed) VCED voice assumed');
      } else {
        warnings.push('unrecognized .syx payload (' + bytes.length + ' bytes, no SysEx framing)');
      }
    }

    var type = voices.length > 1 ? 'bank' : (voices.length === 1 ? 'voice' : 'unknown');
    return { type: type, count: voices.length, voices: voices, warnings: warnings };
  }

  // Build a VMEM 32-voice SysEx message from up to 32 VCED param arrays.
  // (Used by tests and could back an "export bank" feature later.)
  function buildBankSysEx(voiceParamArrays) {
    var data = new Uint8Array(VMEM_DATA);
    for (var vi = 0; vi < VMEM_VOICES; vi++) {
      var src = voiceParamArrays[vi] || voiceParamArrays[vi % voiceParamArrays.length];
      data.set(packVoice(src), vi * VMEM_PACKED);
    }
    var msg = new Uint8Array(6 + VMEM_DATA + 2);
    msg.set([0xf0, 0x43, 0x00, 0x09, 0x20, 0x00], 0);
    msg.set(data, 6);
    msg[6 + VMEM_DATA] = calcChecksum(msg, 6, VMEM_DATA);
    msg[6 + VMEM_DATA + 1] = 0xf7;
    return msg;
  }

  function buildVoiceSysEx(params) {
    var msg = new Uint8Array(6 + VCED_PARAMS + 2);
    msg.set([0xf0, 0x43, 0x00, 0x00, 0x01, 0x1b], 0);
    for (var i = 0; i < VCED_PARAMS; i++) msg[6 + i] = params[i] & 0x7f;
    msg[6 + VCED_PARAMS] = calcChecksum(msg, 6, VCED_PARAMS);
    msg[6 + VCED_PARAMS + 1] = 0xf7;
    return msg;
  }

  return {
    parseSyx: parseSyx,
    unpackVoice: unpackVoice,
    packVoice: packVoice,
    voiceToStruct: voiceToStruct,
    calcChecksum: calcChecksum,
    buildBankSysEx: buildBankSysEx,
    buildVoiceSysEx: buildVoiceSysEx,
    LFO_WAVES: LFO_WAVES,
    VCED_PARAMS: VCED_PARAMS,
    VMEM_PACKED: VMEM_PACKED,
    VMEM_VOICES: VMEM_VOICES
  };
});
