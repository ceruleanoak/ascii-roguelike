// msfa-test.cjs — drive the vendored msfa (WebDX7) WASM engine headless in Node
// to validate true Dexed parity before wiring it into Electron.
// Replicates wam-processor.js's C-call sequence: createModule → wam_init →
// wam_onpatch(128-byte packed voice) → wam_onmidi(noteOn) → wam_onprocess loop.
var fs = require('fs'), path = require('path'), vm = require('vm');
var S = require('./syx.cjs');

var V = path.join(__dirname, 'vendor', 'webdx7');
global.AudioWorkletGlobalScope = {};
function loadScript(p) {
  var code = fs.readFileSync(p, 'utf8');
  // supply Node globals the emscripten glue references; AudioWorkletGlobalScope is on `global`
  new Function('__dirname', 'require', 'module', 'process', code)(path.dirname(p), require, { exports: {} }, process);
}
loadScript(path.join(V, 'dx7.wasm.js'));   // sets AudioWorkletGlobalScope.WAM.DX7.wasmBinary
loadScript(path.join(V, 'dx7.js'));        // emscripten module — instantiates wasm synchronously
var WAM = global.AudioWorkletGlobalScope.WAM.DX7;
if (!WAM || !WAM.cwrap) { console.error('msfa module did not initialize'); process.exit(1); }

var createModule = WAM.cwrap('createModule', 'number', []);
var wam_init     = WAM.cwrap('wam_init', null, ['number', 'number', 'number', 'string']);
var wam_onpatch  = WAM.cwrap('wam_onpatch', null, ['number', 'number', 'number']);
var wam_onmidi   = WAM.cwrap('wam_onmidi', null, ['number', 'number', 'number', 'number']);
var wam_onprocess= WAM.cwrap('wam_onprocess', 'number', ['number', 'number', 'number']);

var SR = 44100, BUF = 128;
var inst = createModule();
wam_init(inst, BUF, SR, '');

// audio bus (mirror wam-processor.js): 1 output, 2 channels allocated, mono used
var numChannels = 2;
var obufs = WAM._malloc(numChannels * 4);
var audiobus = WAM._malloc(2 * 4);
WAM.setValue(audiobus, 0, 'i32');        // no inputs
WAM.setValue(audiobus + 4, obufs, 'i32');
var outPtr = [];
for (var c = 0; c < numChannels; c++) { var b = WAM._malloc(BUF * 4); WAM.setValue(obufs + c * 4, b, 'i32'); outPtr.push(b / 4); }

function setPatch(packed) {
  var buf = WAM._malloc(packed.length);
  for (var i = 0; i < packed.length; i++) WAM.setValue(buf + i, packed[i], 'i8');
  wam_onpatch(inst, buf, packed.length);
  WAM._free(buf);
}
function block() {  // render one 128-sample mono block → Float32Array
  wam_onprocess(inst, audiobus, 0);
  return WAM.HEAPF32.subarray(outPtr[0], outPtr[0] + BUF);
}

// --- find DESCENT, pack its voice, load it ---
var ROOT = '/Users/thomaslarson/Library/Application Support/DigitalSuburban/Dexed/Cartridges', found = null;
(function walk(d) { for (var e of fs.readdirSync(d, { withFileTypes: true })) { if (found) return; if (e.name === '.DS_Store') continue; var f = path.join(d, e.name); if (e.isDirectory()) walk(f); else if (/\.syx$/i.test(e.name)) { try { var r = S.parseSyx(fs.readFileSync(f)); for (var v of r.voices) if (/^descent/i.test((v.name || '').trim())) { found = v; return; } } catch (x) {} } } })(ROOT);
if (!found) { console.error('DESCENT not found'); process.exit(1); }

setPatch(S.packVoice(found.params));        // 128-byte packed voice
wam_onmidi(inst, 0x90, 60, 100);            // note on C4

var N = Math.ceil(1.2 * SR), buf = new Float32Array(N), pos = 0, peak = 0, nan = false;
while (pos < N) { var blk = block(); for (var i = 0; i < BUF && pos < N; i++) { var x = blk[i]; if (!isFinite(x)) nan = true; var a = Math.abs(x); if (a > peak) peak = a; buf[pos++] = x; } }
function zc(a, b) { var c = 0; for (var i = a + 1; i < b; i++) if ((buf[i - 1] < 0) !== (buf[i] < 0)) c++; return c / ((b - a) / SR); }
var early = zc(Math.floor(0.12 * SR), Math.floor(0.17 * SR));
var late = zc(Math.floor(0.90 * SR), Math.floor(0.95 * SR));

console.log('msfa engine initialized ✓');
console.log('DESCENT: peak=' + peak.toFixed(4) + (nan ? '  ⚠ NaN!' : '  finite ✓'));
console.log('pitch (zero-cross/s): early(0.12s)=' + early.toFixed(0) + '  late(0.90s)=' + late.toFixed(0) +
            '  => ' + (late < early ? 'DOWN ✓ (descent)' : 'not descending'));
