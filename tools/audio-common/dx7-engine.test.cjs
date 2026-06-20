// Headless DSP smoke test for dx7-worklet.js — runs the worklet processor in
// Node with stubbed Web Audio globals, feeds it real DX7 patches, and checks
// the synthesis is non-silent, finite, bounded, and decays after note-off.
// Run: node tools/audio-common/dx7-engine.test.cjs
var fs = require('fs');
var path = require('path');
var S = require('./syx.cjs');
var FMEngine = require('./fm-engine.cjs');

var SR = 44100;
var BLOCK = 128;

// --- load the worklet processor class into Node with stubbed globals ---
function loadProcessor() {
  var src = fs.readFileSync(path.join(__dirname, 'dx7-worklet.js'), 'utf8');
  function AudioWorkletProcessor() { this.port = { postMessage: function () {}, onmessage: null }; }
  function registerProcessor() {}
  var factory = new Function('AudioWorkletProcessor', 'registerProcessor', 'sampleRate',
    src + '\n;return DX7Processor;');
  return factory(AudioWorkletProcessor, registerProcessor, SR);
}

var DX7Processor = loadProcessor();
var pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  FAIL: ' + m); } }

function render(proc, blocks) {
  var out = [[new Float32Array(BLOCK)]]; // [bus][channel] per Web Audio process() contract
  var ch = out[0][0];
  var peak = 0, sumsq = 0, n = 0, nan = false;
  for (var b = 0; b < blocks; b++) {
    proc.process([], out);
    for (var i = 0; i < BLOCK; i++) {
      var x = ch[i];
      if (!isFinite(x)) nan = true;
      var a = Math.abs(x); if (a > peak) peak = a;
      sumsq += x * x; n++;
    }
  }
  return { peak: peak, rms: Math.sqrt(sumsq / n), nan: nan };
}

var cartDir = '/Users/thomaslarson/Library/Application Support/DigitalSuburban/Dexed/Cartridges';
var rom1a = path.join(cartDir, 'rom1a.syx');
if (!fs.existsSync(rom1a)) { console.error('rom1a.syx not found — skipping real-patch test'); process.exit(0); }

var bank = S.parseSyx(fs.readFileSync(rom1a));
ok(bank.count === 32, 'ROM1A parsed 32 voices');

// --- Test 1: BRASS 1 produces audible, finite, bounded sound on a held note ---
(function () {
  var proc = new DX7Processor();
  var patch = FMEngine.patchFromVCED(bank.voices[0].params); // BRASS 1
  proc.port.onmessage({ data: { type: 'patch', patch: patch } });
  proc.port.onmessage({ data: { type: 'noteOn', note: 60, velocity: 100 / 127 } });
  var r = render(proc, 170); // ~0.5s
  ok(!r.nan, 'BRASS 1: no NaN/Inf samples');
  ok(r.peak > 0.01, 'BRASS 1: audible (peak ' + r.peak.toFixed(4) + ')');
  ok(r.peak <= 1.0, 'BRASS 1: within range after soft-clip (peak ' + r.peak.toFixed(4) + ')');
  ok(r.rms > 0.001, 'BRASS 1: non-trivial RMS (' + r.rms.toFixed(5) + ')');
  console.log('  BRASS 1 held: peak=' + r.peak.toFixed(4) + ' rms=' + r.rms.toFixed(5));
})();

// --- Test 2: note-off leads to decay toward silence ---
(function () {
  var proc = new DX7Processor();
  var patch = FMEngine.patchFromVCED(bank.voices[0].params);
  proc.port.onmessage({ data: { type: 'patch', patch: patch } });
  proc.port.onmessage({ data: { type: 'noteOn', note: 60, velocity: 1 } });
  render(proc, 86); // ~0.25s sustain
  proc.port.onmessage({ data: { type: 'noteOff', note: 60 } });
  render(proc, 1300);                 // ~3.8s into release (discard)
  var end = render(proc, 60);         // measure the final ~0.17s
  ok(end.peak < 0.02, 'note-off decays toward silence (final peak ' + end.peak.toFixed(5) + ')');
  console.log('  release final peak=' + end.peak.toFixed(5));
})();

// --- Test 3: all 32 ROM1A voices render finite & bounded (algorithm coverage) ---
(function () {
  var bad = [];
  for (var vi = 0; vi < 32; vi++) {
    var proc = new DX7Processor();
    var patch = FMEngine.patchFromVCED(bank.voices[vi].params);
    proc.port.onmessage({ data: { type: 'patch', patch: patch } });
    proc.port.onmessage({ data: { type: 'noteOn', note: 64, velocity: 1 } });
    var r = render(proc, 90);
    if (r.nan || r.peak > 100) bad.push(bank.voices[vi].name + ' (alg ' + patch.algorithm + ', peak ' + r.peak.toFixed(1) + ')');
  }
  ok(bad.length === 0, '32 voices finite & bounded; bad: ' + bad.join(', '));
})();

// --- Test 4: polyphony — 3 simultaneous notes louder than 1, still finite ---
(function () {
  var proc = new DX7Processor();
  var patch = FMEngine.patchFromVCED(bank.voices[7].params); // PIANO 1
  proc.port.onmessage({ data: { type: 'patch', patch: patch } });
  ['60','64','67'].forEach(function (n) { proc.port.onmessage({ data: { type: 'noteOn', note: +n, velocity: 1 } }); });
  var r = render(proc, 120);
  ok(!r.nan && r.peak > 0.001 && r.peak < 100, 'chord renders finite & audible (peak ' + r.peak.toFixed(3) + ')');
})();

console.log('\ndx7-worklet DSP: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
