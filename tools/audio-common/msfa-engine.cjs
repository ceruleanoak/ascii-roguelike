// msfa-engine.cjs — live FM engine backed by the REAL Dexed engine (msfa) via
// the vendored WebDX7 WASM (vendor/webdx7, MIT). Same interface as fm-engine.cjs
// (init/loadVCED/noteOn/noteOff/allNotesOff/resume/setMasterGain) so the app can
// swap engines transparently. Loads the 4 WebDX7 worklet scripts (wasm bytes →
// emscripten module → WAM processor base → DX7 processor) as Blob modules, then
// drives the "DX7" AudioWorkletNode with setPatch (128-byte packed voice) + MIDI.

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MsfaEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function blobURL(src) { return URL.createObjectURL(new Blob([src], { type: 'text/javascript' })); }

  // Web Worker that runs the same msfa module headless for sample-exact offline
  // render (workers permit synchronous WASM compile; the main thread does not).
  var MSFA_WORKER_SRC = [
    'var W, inst, audiobus, out0, BUF=128, on_patch, on_midi, on_process;',
    'self.onmessage=function(e){var d=e.data;try{',
    '  if(d.type==="init"){',
    '    self.AudioWorkletGlobalScope={};',
    '    (0,eval)(d.wasm); (0,eval)(d.dx7);',
    '    W=self.AudioWorkletGlobalScope.WAM.DX7;',
    '    var createModule=W.cwrap("createModule","number",[]);',
    '    var wam_init=W.cwrap("wam_init",null,["number","number","number","string"]);',
    '    on_patch=W.cwrap("wam_onpatch",null,["number","number","number"]);',
    '    on_midi=W.cwrap("wam_onmidi",null,["number","number","number","number"]);',
    '    on_process=W.cwrap("wam_onprocess","number",["number","number","number"]);',
    '    inst=createModule(); wam_init(inst,BUF,d.sr||44100,"");',
    '    var obufs=W._malloc(2*4); audiobus=W._malloc(2*4);',
    '    W.setValue(audiobus,0,"i32"); W.setValue(audiobus+4,obufs,"i32");',
    '    for(var c=0;c<2;c++){var b=W._malloc(BUF*4); W.setValue(obufs+c*4,b,"i32"); if(c===0)out0=b/4;}',
    '    self.postMessage({type:"ready"});',
    '  } else if(d.type==="render"){',
    '    on_midi(inst,0xB0,123,0);',                       // reset any lingering voices
    '    var pk=d.packed, pb=W._malloc(pk.length); for(var i=0;i<pk.length;i++) W.setValue(pb+i,pk[i],"i8"); on_patch(inst,pb,pk.length); W._free(pb);',
    '    on_midi(inst,0x90,d.note,d.vel);',
    '    var total=Math.ceil((d.dur+d.release)*d.sr), offN=Math.floor(d.dur*d.sr), pcm=new Float32Array(total), pos=0, off=false;',
    '    while(pos<total){ if(!off&&pos>=offN){on_midi(inst,0x80,d.note,0);off=true;} on_process(inst,audiobus,0); var blk=W.HEAPF32.subarray(out0,out0+BUF); for(var j=0;j<BUF&&pos<total;j++) pcm[pos++]=blk[j]; }',
    '    self.postMessage({type:"rendered",pcm:pcm},[pcm.buffer]);',
    '  }',
    '}catch(err){ self.postMessage({type:"error",message:String(err&&err.message||err)}); }};'
  ].join('\n');

  function MsfaEngine() { this.ctx = null; this.node = null; this.master = null; this.ready = false; }

  // opts: { context?, sources:{wasm,dx7,wamproc,awp}, masterGain? }
  MsfaEngine.prototype.init = function (opts) {
    opts = opts || {}; var self = this, s = opts.sources;
    // Run the engine at 48 kHz to match a typical Logic/Dexed session — FM aliasing
    // (and thus brightness on bright patches) is sample-rate dependent.
    this._sr = opts.sampleRate || 48000;
    this.ctx = opts.context || new (window.AudioContext || window.webkitAudioContext)({ sampleRate: this._sr });
    this._sr = this.ctx.sampleRate;  // actual (Chromium may clamp)
    this._sources = s;  // kept for the offline-render worker
    var aw = this.ctx.audioWorklet;
    // Order matters: wasm bytes → emscripten module (sync-instantiates) → WAM base → DX7 processor.
    return aw.addModule(blobURL(s.wasm))
      .then(function () { return aw.addModule(blobURL(s.dx7)); })
      .then(function () { return aw.addModule(blobURL(s.wamproc)); })
      .then(function () { return aw.addModule(blobURL(s.awp)); })
      .then(function () {
        self.node = new AudioWorkletNode(self.ctx, 'DX7', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [1] });
        self.master = self.ctx.createGain();
        self.master.gain.value = (opts.masterGain != null) ? opts.masterGain : 0.5;
        self.node.connect(self.master).connect(self.ctx.destination);
        self.ready = true;
        return self;
      });
  };

  MsfaEngine.prototype.resume = function () { return this.ctx && this.ctx.resume(); };
  MsfaEngine.prototype.loadVCED = function (v) {
    if (!this.node) return;
    var Syx = (typeof window !== 'undefined' && window.SyxParser) || (typeof self !== 'undefined' && self.SyxParser);
    this.node.port.postMessage({ type: 'patch', data: Syx.packVoice(v) }); // 128-byte packed voice
  };
  MsfaEngine.prototype.loadPatch = function (v) { this.loadVCED(v); };
  MsfaEngine.prototype.noteOn = function (note, vel) {
    if (this.node) this.node.port.postMessage({ type: 'midi', data: [0x90, note & 0x7f, (vel == null ? 100 : Math.max(1, Math.min(127, vel | 0)))] });
  };
  MsfaEngine.prototype.noteOff = function (note) { if (this.node) this.node.port.postMessage({ type: 'midi', data: [0x80, note & 0x7f, 0] }); };
  MsfaEngine.prototype.allNotesOff = function () { if (this.node) this.node.port.postMessage({ type: 'midi', data: [0xB0, 123, 0] }); };
  MsfaEngine.prototype.setMasterGain = function (g) { if (this.master) this.master.gain.value = g; };

  MsfaEngine.prototype._ensureRenderWorker = function () {
    var self = this;
    if (this._workerReady) return this._workerReady;
    var w = new Worker(blobURL(MSFA_WORKER_SRC));
    this._worker = w;
    this._workerReady = new Promise(function (resolve, reject) {
      w.onmessage = function (e) {
        var d = e.data;
        if (d.type === 'ready') resolve(w);
        else if (d.type === 'rendered' && self._pending) { var p = self._pending; self._pending = null; p.resolve(d.pcm); }
        else if (d.type === 'error' && self._pending) { var q = self._pending; self._pending = null; q.reject(new Error(d.message)); }
      };
      w.onerror = function (err) { reject(new Error('msfa render worker: ' + (err.message || 'error'))); };
      w.postMessage({ type: 'init', wasm: self._sources.wasm, dx7: self._sources.dx7, sr: self._sr || 48000 });
    });
    return this._workerReady;
  };
  // Render one note of a 155-param VCED voice → 16-bit mono WAV (Uint8Array), via msfa (parity).
  MsfaEngine.prototype.renderVCED = function (v, spec) {
    spec = spec || {}; var self = this, sr = this._sr || 48000;
    var Syx = (typeof window !== 'undefined' && window.SyxParser);
    var packed = Syx.packVoice(v);
    return this._ensureRenderWorker().then(function (w) {
      return new Promise(function (resolve, reject) {
        self._pending = { resolve: resolve, reject: reject };
        w.postMessage({ type: 'render', packed: packed,
          note: spec.note != null ? spec.note : 60, vel: spec.vel != null ? spec.vel : 100,
          dur: spec.dur != null ? spec.dur : 1.2, release: spec.release != null ? spec.release : 0.6, sr: sr });
      });
    }).then(function (pcm) { return window.FMEngine.encodeWav(pcm, sr); });
  };

  return MsfaEngine;
});
