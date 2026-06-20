// diag-silence.cjs — render a sample of unique patches headlessly and report
// how many are silent at the default test note, plus what the silent ones share.
var fs = require('fs'), path = require('path'), crypto = require('crypto');
var S = require('./syx.cjs'), FMEngine = require('./fm-engine.cjs'), F = require('./features.cjs');

var SR = 44100, BLOCK = 128;
function loadProcessor() {
  var src = fs.readFileSync(path.join(__dirname, 'dx7-worklet.js'), 'utf8');
  function AudioWorkletProcessor() { this.port = { postMessage: function () {}, onmessage: null }; }
  function registerProcessor() {}
  return new Function('AudioWorkletProcessor', 'registerProcessor', 'sampleRate', src + '\n;return DX7Processor;')(AudioWorkletProcessor, registerProcessor, SR);
}
var DX7Processor = loadProcessor();

function renderPeak(patch, note, blocks) {
  var proc = new DX7Processor();
  proc.port.onmessage({ data: { type: 'patch', patch: patch } });
  proc.port.onmessage({ data: { type: 'noteOn', note: note, velocity: 100 / 127 } });
  var out = [[new Float32Array(BLOCK)]], ch = out[0][0], peak = 0;
  for (var b = 0; b < blocks; b++) { proc.process([], out); for (var i = 0; i < BLOCK; i++) { var a = Math.abs(ch[i]); if (a > peak) peak = a; } }
  return peak;
}

// collect unique patches
var ROOT = '/Users/thomaslarson/Library/Application Support/DigitalSuburban/Dexed/Cartridges';
function pidOf(p) { return crypto.createHash('sha1').update(Buffer.from(p.slice(0, 145))).digest('hex').slice(0, 16); }
var uniq = new Map();
(function walk(d) { for (var e of fs.readdirSync(d, { withFileTypes: true })) { if (e.name === '.DS_Store') continue; var f = path.join(d, e.name); if (e.isDirectory()) walk(f); else if (/\.syx$/i.test(e.name)) { try { var r = S.parseSyx(fs.readFileSync(f)); for (var v of r.voices) { var pid = pidOf(v.params); if (!uniq.has(pid)) uniq.set(pid, v); } } catch (x) {} } } })(ROOT);
var all = [...uniq.values()];
var SAMPLE = 1500, step = Math.max(1, Math.floor(all.length / SAMPLE));
var sample = []; for (var i = 0; i < all.length; i += step) sample.push(all[i]);

var silent60 = 0, silentAll = 0, audible = 0;
var traits = { fixedCarrier: 0, allFixedCarrier: 0, lowMaxOut: 0, slowAttack: 0 };
var examples = [];
var CARR = F.CARRIERS;
for (var s = 0; s < sample.length; s++) {
  var v = sample[s];
  var patch = FMEngine.patchFromVCED(v.params);
  var p60 = renderPeak(patch, 60, 170);
  if (p60 >= 0.01) { audible++; continue; }
  silent60++;
  // try other registers
  var pAny = Math.max(p60, renderPeak(patch, 36, 170), renderPeak(patch, 72, 170), renderPeak(patch, 84, 170));
  if (pAny < 0.01) silentAll++;
  // diagnose
  var carriers = CARR[patch.algorithm - 1] || [0];
  var cOps = carriers.map(function (ci) { return patch.operators[ci]; });
  var fixedC = cOps.filter(function (o) { return o.oscMode === 1; }).length;
  var maxOut = Math.max.apply(null, cOps.map(function (o) { return o.outputLevel; }));
  var attack = cOps.reduce(function (a, o) { return a + o.rates[0]; }, 0) / cOps.length;
  if (fixedC > 0) traits.fixedCarrier++;
  if (fixedC === carriers.length) traits.allFixedCarrier++;
  if (maxOut < 0.05) traits.lowMaxOut++;
  if (attack < 30) traits.slowAttack++;
  if (examples.length < 14) examples.push(v.name + '  alg' + patch.algorithm + ' carr=' + carriers.length + ' fixedC=' + fixedC + ' maxOut=' + maxOut.toFixed(3) + ' atk=' + attack.toFixed(0) + ' p60=' + p60.toFixed(4) + ' pAny=' + pAny.toFixed(3));
}
console.log('sample=' + sample.length + ' (of ' + all.length + ' unique)');
console.log('audible@C4=' + audible + '  silent@C4=' + silent60 + ' (' + (100 * silent60 / sample.length).toFixed(1) + '%)  silent@allRegisters=' + silentAll);
console.log('silent traits: ' + JSON.stringify(traits));
console.log('examples:\n  ' + examples.join('\n  '));
