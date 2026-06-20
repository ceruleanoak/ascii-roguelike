#!/usr/bin/env node
// render-verify.cjs — definitively flag SILENT patches by measured audio output.
// Renders every unique patch headlessly through the real dx7 worklet DSP at two
// notes and marks `flag:dead` when the peak is inaudible at both. Catches cases
// the param-heuristic misses (fixed-subsonic carriers, never-opening envelopes).
// Merges the result into preset-browser/library/derived-tags.json.
//
// Usage: node tools/audio-common/render-verify.cjs
var fs = require('fs'), path = require('path'), crypto = require('crypto');
var S = require('./syx.cjs'), FMEngine = require('./fm-engine.cjs');

var SR = 44100, BLOCK = 128, THRESH = 0.008, BLOCKS = 155; // ~0.45s
var ROOT = '/Users/thomaslarson/Library/Application Support/DigitalSuburban/Dexed/Cartridges';
var DERIVED = path.join(__dirname, '..', 'preset-browser', 'library', 'derived-tags.json');

function loadProcessor() {
  var src = fs.readFileSync(path.join(__dirname, 'dx7-worklet.js'), 'utf8');
  function AudioWorkletProcessor() { this.port = { postMessage: function () {}, onmessage: null }; }
  function registerProcessor() {}
  return new Function('AudioWorkletProcessor', 'registerProcessor', 'sampleRate', src + '\n;return DX7Processor;')(AudioWorkletProcessor, registerProcessor, SR);
}
var DX7Processor = loadProcessor();

function peakAt(patch, note) {
  var proc = new DX7Processor();
  proc.port.onmessage({ data: { type: 'patch', patch: patch } });
  proc.port.onmessage({ data: { type: 'noteOn', note: note, velocity: 100 / 127 } });
  var out = [[new Float32Array(BLOCK)]], ch = out[0][0], peak = 0;
  for (var b = 0; b < BLOCKS; b++) { proc.process([], out); for (var i = 0; i < BLOCK; i++) { var a = Math.abs(ch[i]); if (a > peak) peak = a; } }
  return peak;
}
function pidOf(p) { return crypto.createHash('sha1').update(Buffer.from(p.slice(0, 145))).digest('hex').slice(0, 16); }

// dedup
var uniq = new Map();
(function walk(d) { for (var e of fs.readdirSync(d, { withFileTypes: true })) { if (e.name === '.DS_Store') continue; var f = path.join(d, e.name); if (e.isDirectory()) walk(f); else if (/\.syx$/i.test(e.name)) { try { var r = S.parseSyx(fs.readFileSync(f)); for (var v of r.voices) { var pid = pidOf(v.params); if (!uniq.has(pid)) uniq.set(pid, v); } } catch (x) {} } } })(ROOT);

var t0 = Date.now(), dead = [], examples = [];
for (var [pid, v] of uniq) {
  var patch = FMEngine.patchFromVCED(v.params);
  var pk = peakAt(patch, 60);
  if (pk < THRESH) pk = Math.max(pk, peakAt(patch, 48)); // try a lower note before declaring dead
  if (pk < THRESH) { dead.push(pid); if (examples.length < 12) examples.push(v.name); }
}
console.log('rendered ' + uniq.size + ' unique patches in ' + ((Date.now() - t0) / 1000).toFixed(1) + 's');
console.log('measured DEAD (silent at C4 & C3): ' + dead.length + ' (' + (100 * dead.length / uniq.size).toFixed(2) + '%)');
console.log('examples: ' + examples.map(function (x) { return JSON.stringify(x); }).join(', '));

// merge flag:dead into derived-tags.json
var derived = {}; try { derived = JSON.parse(fs.readFileSync(DERIVED, 'utf8')); } catch (e) {}
var deadSet = new Set(dead);
for (var p in derived) derived[p] = derived[p].filter(function (t) { return t !== 'flag:dead'; }); // clear stale
dead.forEach(function (p) { derived[p] = (derived[p] || []); if (derived[p].indexOf('flag:dead') < 0) derived[p].push('flag:dead'); });
fs.writeFileSync(DERIVED, JSON.stringify(derived));
console.log('merged flag:dead into ' + path.relative(process.cwd(), DERIVED));
