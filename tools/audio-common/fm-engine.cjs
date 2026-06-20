// fm-engine.js — main-thread wrapper around dx7-worklet.js.
//
// Builds the DX7 patch param object the worklet expects from a 155-entry VCED
// param array (as produced by syx.cjs), loads the AudioWorklet, and exposes
// note on/off + patch loading. Works in the browser (window.FMEngine) and via
// require. Output-level / frequency-ratio mapping ported from dx7-synth-js (ISC).

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FMEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // DX7 operator output level (0-99) -> linear amplitude. From dx7-synth-js.
  var OUTPUT_LEVEL_TABLE = [
    0.000000,0.000337,0.000476,0.000674,0.000952,0.001235,0.001602,0.001905,0.002265,0.002694,
    0.003204,0.003810,0.004531,0.005388,0.006408,0.007620,0.008310,0.009062,0.010776,0.011752,
    0.013975,0.015240,0.016619,0.018123,0.019764,0.021552,0.023503,0.025630,0.027950,0.030480,
    0.033238,0.036247,0.039527,0.043105,0.047006,0.051261,0.055900,0.060960,0.066477,0.072494,
    0.079055,0.086210,0.094012,0.102521,0.111800,0.121919,0.132954,0.144987,0.158110,0.172420,
    0.188025,0.205043,0.223601,0.243838,0.265907,0.289974,0.316219,0.344839,0.376050,0.410085,
    0.447201,0.487676,0.531815,0.579948,0.632438,0.689679,0.752100,0.820171,0.894403,0.975353,
    1.063630,1.159897,1.264876,1.379357,1.504200,1.640341,1.788805,1.950706,2.127260,2.319793,
    2.529752,2.758714,3.008399,3.280683,3.577610,3.901411,4.254519,4.639586,5.059505,5.517429,
    6.016799,6.561366,7.155220,7.802823,8.509039,9.279172,10.11901,11.03486,12.03360,13.12273];

  function mapOutputLevel(v) {
    var idx = Math.max(0, Math.min(99, Math.floor(v)));
    return OUTPUT_LEVEL_TABLE[idx] * 1.27;
  }

  // Build the worklet patch object from a 155-entry VCED param array.
  // VCED stores operators OP6..OP1 (slots 0..5); the engine indexes OP1..OP6 (0..5).
  function patchFromVCED(v) {
    var operators = new Array(6);
    for (var i = 0; i < 6; i++) {
      var d = (5 - i) * 21; // OP(i+1) lives in VCED slot 5-i
      var oscMode = v[d + 17] & 1;
      var coarse = v[d + 18];
      var fine = v[d + 19];
      var freqRatio = (coarse === 0 ? 0.5 : coarse) * (1 + fine / 100);
      var freqFixed = Math.pow(10, coarse % 4) * (1 + (fine / 99) * 8.772);
      operators[i] = {
        enabled: true,
        rates: [v[d], v[d + 1], v[d + 2], v[d + 3]],
        levels: [v[d + 4], v[d + 5], v[d + 6], v[d + 7]],
        outputLevel: mapOutputLevel(v[d + 16]),
        oscMode: oscMode,
        freqRatio: freqRatio,
        freqFixed: freqFixed,
        detune: v[d + 20] - 7,          // VCED 0..14 -> -7..+7
        velocitySens: v[d + 15],
        lfoAmpModSens: v[d + 14]
      };
    }
    var name = '';
    for (var k = 0; k < 10; k++) {
      var c = v[145 + k] & 0x7f;
      name += (c >= 0x20 && c < 0x7f) ? String.fromCharCode(c) : ' ';
    }
    return {
      name: name.replace(/\s+$/, ''),
      algorithm: (v[134] & 0x1f) + 1,
      fbRatio: Math.pow(2, (v[135] & 7) - 7),
      operators: operators,
      pitchEGRates: [v[126], v[127], v[128], v[129]],
      pitchEGLevels: [v[130], v[131], v[132], v[133]],
      lfoSpeed: v[137], lfoDelay: v[138], lfoPitchModDepth: v[139], lfoAmpModDepth: v[140],
      lfoPitchModSens: v[143], lfoWaveform: v[142] & 7,
      controllerModVal: 0, aftertouchEnabled: 0
    };
  }

  function FMEngine() {
    this.ctx = null; this.node = null; this.master = null; this.ready = false;
  }

  // opts: { context?, workletSource? (JS text), workletUrl?, masterGain? }
  // Prefer workletSource (loaded via Blob URL) to avoid Electron file:// addModule quirks.
  FMEngine.prototype.init = function (opts) {
    opts = opts || {};
    var self = this;
    this.ctx = opts.context || new (self.AC || (window.AudioContext || window.webkitAudioContext))();
    var url = opts.workletUrl;
    if (opts.workletSource) {
      url = URL.createObjectURL(new Blob([opts.workletSource], { type: 'text/javascript' }));
    }
    this._workletURL = url; // reused by renderOffline on a fresh OfflineAudioContext
    return this.ctx.audioWorklet.addModule(url).then(function () {
      self.node = new AudioWorkletNode(self.ctx, 'dx7-processor', { outputChannelCount: [1] });
      self.master = self.ctx.createGain();
      self.master.gain.value = (opts.masterGain != null) ? opts.masterGain : 0.5;
      self.node.connect(self.master).connect(self.ctx.destination);
      self.ready = true;
      return self;
    });
  };

  FMEngine.prototype.resume = function () { return this.ctx && this.ctx.resume(); };
  FMEngine.prototype.loadPatch = function (patch) { if (this.node) this.node.port.postMessage({ type: 'patch', patch: patch }); };
  FMEngine.prototype.loadVCED = function (v) { this.loadPatch(patchFromVCED(v)); };
  FMEngine.prototype.noteOn = function (note, velocity) {
    if (this.node) this.node.port.postMessage({ type: 'noteOn', note: note, velocity: (velocity == null ? 100 : velocity) / 127 });
  };
  FMEngine.prototype.noteOff = function (note) { if (this.node) this.node.port.postMessage({ type: 'noteOff', note: note }); };
  FMEngine.prototype.allNotesOff = function () { if (this.node) this.node.port.postMessage({ type: 'allNotesOff' }); };
  FMEngine.prototype.setMod = function (value) { if (this.node) this.node.port.postMessage({ type: 'mod', value: value }); };
  FMEngine.prototype.setMasterGain = function (g) { if (this.master) this.master.gain.value = g; };

  // Render one note of `patch` to a 16-bit mono WAV (Uint8Array). Uses an
  // OfflineAudioContext + the dx7 worklet with sample-scheduled note on/off, so
  // the result is deterministic and matches live audition. spec: {note,dur,release}.
  FMEngine.prototype.renderOffline = function (patch, spec) {
    spec = spec || {};
    var note = spec.note != null ? spec.note : 60;
    var dur = spec.dur != null ? spec.dur : 1.2;
    var release = spec.release != null ? spec.release : 0.6;
    var sr = 44100;
    var total = Math.max(1, Math.ceil((dur + release) * sr));
    var url = this._workletURL;
    var off = new OfflineAudioContext(1, total, sr);
    return off.audioWorklet.addModule(url).then(function () {
      var node = new AudioWorkletNode(off, 'dx7-processor', { outputChannelCount: [1] });
      node.connect(off.destination);
      node.port.postMessage({ type: 'patch', patch: patch });
      node.port.postMessage({ type: 'noteOnAt', note: note, velocity: 100 / 127, at: 0 });
      node.port.postMessage({ type: 'noteOffAt', note: note, at: Math.floor(dur * sr) });
      return off.startRendering();
    }).then(function (buf) {
      return encodeWav(buf.getChannelData(0), sr);
    });
  };

  // Float32 mono -> 16-bit PCM WAV, peak-normalized to 0.95.
  function encodeWav(samples, sampleRate) {
    var n = samples.length, peak = 0;
    for (var i = 0; i < n; i++) { var a = Math.abs(samples[i]); if (a > peak) peak = a; }
    var scale = peak > 0 ? (0.95 / peak) : 1;
    var buffer = new ArrayBuffer(44 + n * 2);
    var view = new DataView(buffer);
    function wstr(o, s) { for (var i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); }
    wstr(0, 'RIFF'); view.setUint32(4, 36 + n * 2, true); wstr(8, 'WAVE');
    wstr(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true); view.setUint16(34, 16, true);
    wstr(36, 'data'); view.setUint32(40, n * 2, true);
    var o = 44;
    for (var j = 0; j < n; j++) { var s = Math.max(-1, Math.min(1, samples[j] * scale)); view.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true); o += 2; }
    return new Uint8Array(buffer);
  }

  FMEngine.prototype.renderVCED = function (v, spec) { return this.renderOffline(patchFromVCED(v), spec); };

  FMEngine.patchFromVCED = patchFromVCED;
  FMEngine.encodeWav = encodeWav;
  return FMEngine;
});
