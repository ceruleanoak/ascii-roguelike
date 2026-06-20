// Node test for syx.js — run: node tools/audio-common/syx.test.js
// Zero-dependency. Verifies bit-packing round-trips and SysEx framing/checksums
// against synthetic voices (no real .syx files required).

var S = require('./syx.cjs');

var pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; } else { fail++; console.error('  FAIL: ' + msg); } }
function eq(a, b, msg) { ok(a === b, msg + ' (got ' + a + ', want ' + b + ')'); }

// Build a VCED param array exercising the full range of every packed field, so
// any bit-mask or offset error shows up as a round-trip mismatch.
function makeVoice(seed) {
  var v = new Array(155);
  for (var op = 0; op < 6; op++) {
    var d = op * 21;
    for (var i = 0; i < 8; i++) v[d + i] = (seed + op * 7 + i * 11) % 100; // EG rates/levels 0-99
    v[d + 8] = (seed + op) % 100;       // break point
    v[d + 9] = (seed + op + 3) % 100;   // left depth
    v[d + 10] = (seed + op + 6) % 100;  // right depth
    v[d + 11] = (op + 0) % 4;           // left curve 0-3
    v[d + 12] = (op + 1) % 4;           // right curve 0-3
    v[d + 13] = (op + 2) % 8;           // rate scaling 0-7
    v[d + 14] = (op + 1) % 4;           // amp mod sens 0-3
    v[d + 15] = (op + 3) % 8;           // key vel sens 0-7
    v[d + 16] = (seed + op * 9) % 100;  // output level 0-99
    v[d + 17] = op % 2;                 // osc mode 0-1
    v[d + 18] = (op * 5) % 32;          // freq coarse 0-31
    v[d + 19] = (seed + op * 13) % 100; // freq fine 0-99
    v[d + 20] = (op * 2) % 15;          // detune 0-14
  }
  for (var j = 0; j < 8; j++) v[126 + j] = (seed + j * 7) % 100; // pitch EG
  v[134] = (seed) % 32;     // algorithm 0-31
  v[135] = (seed) % 8;      // feedback 0-7
  v[136] = seed % 2;        // osc key sync
  v[137] = (seed + 1) % 100;
  v[138] = (seed + 2) % 100;
  v[139] = (seed + 3) % 100;
  v[140] = (seed + 4) % 100;
  v[141] = seed % 2;        // lfo sync
  v[142] = seed % 6;        // lfo waveform 0-5
  v[143] = (seed + 1) % 8;  // pitch mod sens 0-7
  v[144] = seed % 49;       // transpose 0-48
  var name = ('VOICE ' + (seed % 100)).slice(0, 10);
  while (name.length < 10) name += ' ';
  for (var k = 0; k < 10; k++) v[145 + k] = name.charCodeAt(k);
  return v;
}

// --- Test 1: pack -> unpack round-trip is lossless for all 155 params -------
(function () {
  for (var seed = 0; seed < 40; seed++) {
    var v = makeVoice(seed);
    var packed = S.packVoice(v);
    eq(packed.length, 128, 'seed ' + seed + ': packed length');
    var back = S.unpackVoice(packed, 0);
    for (var i = 0; i < 155; i++) {
      if (back[i] !== v[i]) { fail++; console.error('  FAIL: seed ' + seed + ' param ' + i + ' (got ' + back[i] + ', want ' + v[i] + ')'); break; }
    }
    pass++;
  }
})();

// --- Test 2: VMEM bank SysEx round-trips through parseSyx -------------------
(function () {
  var arrays = [];
  for (var i = 0; i < 32; i++) arrays.push(makeVoice(i + 1));
  var bank = S.buildBankSysEx(arrays);
  eq(bank.length, 4104, 'bank message length');
  eq(bank[0], 0xf0, 'bank starts F0');
  eq(bank[bank.length - 1], 0xf7, 'bank ends F7');

  var r = S.parseSyx(bank);
  eq(r.type, 'bank', 'detected bank');
  eq(r.count, 32, 'parsed 32 voices');
  eq(r.warnings.length, 0, 'no warnings (incl. checksum): ' + r.warnings.join('; '));
  // every voice param array matches the source
  var allMatch = true;
  for (var vi = 0; vi < 32; vi++) {
    for (var p = 0; p < 155; p++) if (r.voices[vi].params[p] !== arrays[vi][p]) { allMatch = false; break; }
  }
  ok(allMatch, 'all 32 voices param-exact after bank round-trip');
  eq(r.voices[5].name, 'VOICE 6', 'voice name parsed');
})();

// --- Test 3: VCED single-voice SysEx round-trips ----------------------------
(function () {
  var v = makeVoice(123);
  var msg = S.buildVoiceSysEx(v);
  eq(msg.length, 163, 'VCED message length');
  var r = S.parseSyx(msg);
  eq(r.type, 'voice', 'detected single voice');
  eq(r.count, 1, 'one voice');
  eq(r.warnings.length, 0, 'no warnings: ' + r.warnings.join('; '));
  var exact = true;
  for (var p = 0; p < 155; p++) if (r.voices[0].params[p] !== v[p]) { exact = false; break; }
  ok(exact, 'VCED params exact after round-trip');
})();

// --- Test 4: checksum mismatch is reported, not fatal -----------------------
(function () {
  var v = makeVoice(7);
  var msg = S.buildVoiceSysEx(v);
  msg[6 + 155] = (msg[6 + 155] + 1) & 0x7f; // corrupt checksum
  var r = S.parseSyx(msg);
  eq(r.count, 1, 'corrupt-checksum voice still parses');
  ok(r.warnings.some(function (w) { return /checksum/.test(w); }), 'checksum mismatch warned');
})();

// --- Test 5: struct view sanity ---------------------------------------------
(function () {
  var v = makeVoice(50);
  v[134] = 7;            // algorithm stored 0-31
  v[20] = 0;             // OP6 detune 0 -> -7
  var st = S.voiceToStruct(v);
  eq(st.algorithm, 8, 'algorithm presented 1-32');
  eq(st.operators.length, 6, 'six operators');
  eq(st.operators[5].detune, -7, 'OP6 detune 0 maps to -7');
})();

// --- Test 6: two concatenated messages in one payload -----------------------
(function () {
  var a = S.buildVoiceSysEx(makeVoice(1));
  var b = S.buildBankSysEx([makeVoice(2)]);
  var joined = new Uint8Array(a.length + b.length);
  joined.set(a, 0); joined.set(b, a.length);
  var r = S.parseSyx(joined);
  eq(r.count, 1 + 32, 'concatenated voice + bank parsed');
})();

console.log('\nsyx.js: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
