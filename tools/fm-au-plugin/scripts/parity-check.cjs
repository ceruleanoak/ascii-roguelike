#!/usr/bin/env node
// parity-check.cjs — prove the C++ port matches the JS reference engine.
//
// Renders the same patch, same note, same sample rate through both engines and
// diffs the output sample for sample:
//
//   JS  — dx7-worklet.js loaded headlessly with stubbed Web Audio globals
//         (the loadProcessor pattern from audio-common/dx7-engine.test.cjs)
//   C++ — build/parity-render, which mirrors DX7Processor.process() exactly
//
// Run:  cmake --build build --target parity-render && node scripts/parity-check.cjs
//
// Two classes of patch cannot be bit-identical, for reasons that are properties
// of the algorithm rather than of the port, so they are reported separately:
//
//   * Sample-and-hold LFO — the JS calls Math.random(), the port uses a seeded
//     xorshift. Different noise by construction.
//   * Feedback-loop algorithms (4, 6, 18, …) — an operator modulates itself or
//     sits in a cycle, so the loop has gain and amplifies any difference. V8's
//     Math.sin and Apple's libm sin differ by well under 1 ULP, and that is
//     enough to seed a visible wobble after a few hundred samples. Both renders
//     are equally valid; neither is "the" right answer.
//
// Comparing raw sample differences is therefore the wrong gate: a waveform
// shifted by a fraction of a sample is the same sound but has a large pointwise
// difference. The gates that actually mean something are:
//
//   * the two engines must agree exactly at first (a difference at sample 0 means
//     wrong constants or wrong logic — a real porting bug), and
//   * the resulting signals must have the same level: same RMS to within
//     RMS_TOLERANCE and same peak to within PEAK_TOLERANCE.
//
// A patch that satisfies both is the same sound rendered by two libms.

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const AUDIO_COMMON = path.join(__dirname, '..', '..', 'audio-common');
const S = require(path.join(AUDIO_COMMON, 'syx.cjs'));
const FMEngine = require(path.join(AUDIO_COMMON, 'fm-engine.cjs'));

const BINARY = path.join(__dirname, '..', 'build', 'parity-render');
const SR = 44100;
const BLOCK = 128;
const BLOCKS = 200;    // ~0.58 s
const OFF_BLOCK = 120; // note-off ~0.35 s in, so the release is compared too
const NOTE = 60;
const VELOCITY = 100;
// Note on why a cheap "is this algorithm acyclic?" shortcut does not exist:
// every one of the 32 DX7 algorithms routes one operator back into itself (the
// feedback operator), so all 32 contain a cycle and every patch has some
// amplification path. How much it amplifies is a property of the patch — the
// feedback amount and that operator's output level — not of the algorithm. Hence
// the level-based gate below rather than a per-algorithm rule.
const RMS_TOLERANCE = 0.01;  // 1% — level must match even if micro-phase does not
const PEAK_TOLERANCE = 0.05; // 5% — peaks wander more than RMS under phase wobble

const bankPath = process.argv[2] || path.join(os.homedir(),
  'Library', 'Application Support', 'DigitalSuburban', 'Dexed', 'Cartridges', 'rom1a.syx');

if (!fs.existsSync(BINARY)) {
  console.error('missing ' + BINARY + '\n  build it: cmake --build build --target parity-render');
  process.exit(2);
}
if (!fs.existsSync(bankPath)) {
  console.error('bank not found: ' + bankPath);
  process.exit(2);
}

// ---- JS reference engine, headless -----------------------------------------
function loadProcessor() {
  const src = fs.readFileSync(path.join(AUDIO_COMMON, 'dx7-worklet.js'), 'utf8');
  function AudioWorkletProcessor() { this.port = { postMessage() {}, onmessage: null }; }
  function registerProcessor() {}
  const factory = new Function('AudioWorkletProcessor', 'registerProcessor', 'sampleRate',
    src + '\n;return DX7Processor;');
  return factory(AudioWorkletProcessor, registerProcessor, SR);
}
const DX7Processor = loadProcessor();

function renderJS(params) {
  const proc = new DX7Processor();
  const patch = FMEngine.patchFromVCED(params);
  proc.port.onmessage({ data: { type: 'patch', patch } });
  proc.port.onmessage({ data: { type: 'noteOn', note: NOTE, velocity: VELOCITY / 127 } });
  const out = [[new Float32Array(BLOCK)]];
  const samples = new Float32Array(BLOCKS * BLOCK);
  for (let b = 0; b < BLOCKS; b++) {
    if (b === OFF_BLOCK) proc.port.onmessage({ data: { type: 'noteOff', note: NOTE } });
    proc.process([], out);
    samples.set(out[0][0], b * BLOCK);
  }
  return { samples, patch };
}

function renderCpp(voiceIndex, tmpFile) {
  execFileSync(BINARY,
    [bankPath, String(voiceIndex), String(NOTE), String(VELOCITY), String(BLOCKS),
      String(OFF_BLOCK), tmpFile],
    { stdio: ['ignore', 'ignore', 'ignore'] });
  const buf = fs.readFileSync(tmpFile);
  return new Float32Array(buf.buffer, buf.byteOffset, buf.length / 4);
}

// ---- compare ----------------------------------------------------------------
const bank = S.parseSyx(fs.readFileSync(bankPath));
console.log('bank: ' + path.basename(bankPath) + ' (' + bank.count + ' voices)');
console.log('note ' + NOTE + ' vel ' + VELOCITY + ', ' + (BLOCKS * BLOCK) + ' samples @ ' + SR + 'Hz\n');

const tmpFile = path.join(os.tmpdir(), 'fmvoice-parity-' + process.pid + '.f32');
const identical = [];
const amplified = [];
const structural = [];
const sampleHold = [];

for (let vi = 0; vi < bank.count; vi++) {
  const params = bank.voices[vi].params;
  const name = bank.voices[vi].name || '(unnamed)';
  const js = renderJS(params);
  const cpp = renderCpp(vi, tmpFile);

  let maxDiff = 0, peak = 0, peakCpp = 0, sumJs = 0, sumCpp = 0, nonFinite = false;
  let seedIndex = -1;
  const n = Math.min(js.samples.length, cpp.length);
  for (let i = 0; i < n; i++) {
    const a = js.samples[i], b = cpp[i];
    if (!Number.isFinite(b)) nonFinite = true;
    const d = Math.abs(a - b);
    if (d > 0 && seedIndex < 0) seedIndex = i;
    if (d > maxDiff) maxDiff = d;
    if (Math.abs(a) > peak) peak = Math.abs(a);
    if (Math.abs(b) > peakCpp) peakCpp = Math.abs(b);
    sumJs += a * a;
    sumCpp += b * b;
  }
  const rmsJs = Math.sqrt(sumJs / n);
  const rmsCpp = Math.sqrt(sumCpp / n);
  const rmsErr = rmsJs > 0 ? Math.abs(rmsCpp - rmsJs) / rmsJs : (rmsCpp > 0 ? 1 : 0);
  const peakErr = peak > 0 ? Math.abs(peakCpp - peak) / peak : (peakCpp > 0 ? 1 : 0);

  const row = { vi, name, maxDiff, peak, nonFinite, seedIndex, rmsErr, peakErr,
    algorithm: js.patch.algorithm };
  if ((params[142] & 7) >= 5) sampleHold.push(row);
  else if (seedIndex < 0) identical.push(row);
  else if (nonFinite || seedIndex === 0) structural.push(row);
  else if (rmsErr <= RMS_TOLERANCE && peakErr <= PEAK_TOLERANCE) amplified.push(row);
  else structural.push(row);
}
fs.rmSync(tmpFile, { force: true });

function fmt(r) {
  return '  ' + String(r.vi).padStart(2) + '  ' + r.name.padEnd(11) +
    ' alg ' + String(r.algorithm).padStart(2) +
    '  peak ' + r.peak.toFixed(4) +
    '  maxdiff ' + r.maxDiff.toExponential(2) +
    (r.seedIndex >= 0 ? '  diverges @' + r.seedIndex : '') +
    '  rms err ' + (r.rmsErr * 100).toFixed(3) + '%' +
    '  peak err ' + (r.peakErr * 100).toFixed(2) + '%' +
    (r.nonFinite ? '  NON-FINITE' : '');
}

console.log('BIT-IDENTICAL: ' + identical.length + ' voices');
if (amplified.length) {
  console.log('\nSAME SOUND, MICRO-PHASE DIFFERS (feedback/pitch-EG amplifying libm ULP noise):' +
    ' ' + amplified.length);
  amplified.forEach((r) => console.log(fmt(r)));
}
if (sampleHold.length) {
  console.log('\nSAMPLE-AND-HOLD LFO (different RNG by construction): ' + sampleHold.length);
  sampleHold.forEach((r) => console.log(fmt(r)));
}
if (structural.length) {
  console.log('\nLEVEL DIFFERS — inspect these by ear: ' + structural.length);
  console.log('  (a high-feedback operator is a chaotic oscillator, so two libms can');
  console.log('   land on genuinely different noise; a divergence at sample 0 is a bug)');
  structural.forEach((r) => console.log(fmt(r)));
}

const failed = structural.length > 0;
console.log('\n' + (failed ? 'PARITY FAILED' : 'PARITY OK') +
  ' — ' + identical.length + ' bit-identical, ' + amplified.length + ' amplified-from-noise, ' +
  sampleHold.length + ' S&H, ' + structural.length + ' structural');
process.exit(failed ? 1 : 0);
