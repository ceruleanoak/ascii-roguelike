// dx7-worklet.js — DX7 6-operator FM synthesis AudioWorkletProcessor.
//
// DSP ported from dx7-synth-js by Matt Montag (ISC license) — operator FM loop,
// the msfa-derived envelope (music-synthesizer-for-android), the 32 DX7
// algorithm routing matrix, and the LFO. Restructured here into a single,
// dependency-free AudioWorklet so it runs in both live and OfflineAudioContext.
// Original: https://github.com/mmontag/dx7-synth-js  (see NOTICE)
//
// Monotimbral (one patch at a time) with polyphonic voices — matching how the
// DX7 / Dexed work. The main thread sends messages: {type:'patch'|'noteOn'|
// 'noteOff'|'allNotesOff'|'bend'|'mod'}. Audio is summed to mono and written to
// every output channel.

const PERIOD = Math.PI * 2;
const PERIOD_HALF = PERIOD / 2;
const PERIOD_RECIP = 1 / PERIOD;
const OCTAVE_1024 = 1.0006771307; // 2^(1/1024) — detune step
const LFO_SAMPLE_PERIOD = 100;
const MAX_VOICES = 24;
// DX7 operator output levels are FM modulation-index-scaled (carriers reach ~16),
// so the summed voice output needs attenuation before the DAC. Real DX7/Dexed
// rely on a master stage for this; we scale here and soft-clip (tanh) to keep
// polyphonic stacks from hard-clipping.
const OUTPUT_GAIN = 0.05;

// outputMix = carrier operator indices; modulationMatrix[i] = ops that modulate op i.
// Operator index 0 = OP1 ... 5 = OP6. Self-reference => feedback.
const ALGORITHMS = [
  { outputMix: [0,2],         modulationMatrix: [[1], [], [3], [4], [5], [5]] },
  { outputMix: [0,2],         modulationMatrix: [[1], [1], [3], [4], [5], []] },
  { outputMix: [0,3],         modulationMatrix: [[1], [2], [], [4], [5], [5]] },
  { outputMix: [0,3],         modulationMatrix: [[1], [2], [], [4], [5], [3]] },
  { outputMix: [0,2,4],       modulationMatrix: [[1], [], [3], [], [5], [5]] },
  { outputMix: [0,2,4],       modulationMatrix: [[1], [], [3], [], [5], [4]] },
  { outputMix: [0,2],         modulationMatrix: [[1], [], [3,4], [], [5], [5]] },
  { outputMix: [0,2],         modulationMatrix: [[1], [], [3,4], [3], [5], []] },
  { outputMix: [0,2],         modulationMatrix: [[1], [1], [3,4], [], [5], []] },
  { outputMix: [0,3],         modulationMatrix: [[1], [2], [2], [4,5], [], []] },
  { outputMix: [0,3],         modulationMatrix: [[1], [2], [], [4,5], [], [5]] },
  { outputMix: [0,2],         modulationMatrix: [[1], [1], [3,4,5], [], [], []] },
  { outputMix: [0,2],         modulationMatrix: [[1], [], [3,4,5], [], [], [5]] },
  { outputMix: [0,2],         modulationMatrix: [[1], [], [3], [4,5], [], [5]] },
  { outputMix: [0,2],         modulationMatrix: [[1], [1], [3], [4,5], [], []] },
  { outputMix: [0],           modulationMatrix: [[1,2,4], [], [3], [], [5], [5]] },
  { outputMix: [0],           modulationMatrix: [[1,2,4], [1], [3], [], [5], []] },
  { outputMix: [0],           modulationMatrix: [[1,2,3], [], [2], [4], [5], []] },
  { outputMix: [0,3,4],       modulationMatrix: [[1], [2], [], [5], [5], [5]] },
  { outputMix: [0,1,3],       modulationMatrix: [[2], [2], [2], [4,5], [], []] },
  { outputMix: [0,1,3,4],     modulationMatrix: [[2], [2], [2], [5], [5], []] },
  { outputMix: [0,2,3,4],     modulationMatrix: [[1], [], [5], [5], [5], [5]] },
  { outputMix: [0,1,3,4],     modulationMatrix: [[], [2], [], [5], [5], [5]] },
  { outputMix: [0,1,2,3,4],   modulationMatrix: [[], [], [5], [5], [5], [5]] },
  { outputMix: [0,1,2,3,4],   modulationMatrix: [[], [], [], [5], [5], [5]] },
  { outputMix: [0,1,3],       modulationMatrix: [[], [2], [], [4,5], [], [5]] },
  { outputMix: [0,1,3],       modulationMatrix: [[], [2], [2], [4,5], [], []] },
  { outputMix: [0,2,5],       modulationMatrix: [[1], [], [3], [4], [4], []] },
  { outputMix: [0,1,2,4],     modulationMatrix: [[], [], [3], [], [5], [5]] },
  { outputMix: [0,1,2,5],     modulationMatrix: [[], [], [3], [4], [4], []] },
  { outputMix: [0,1,2,3,4],   modulationMatrix: [[], [], [], [], [5], [5]] },
  { outputMix: [0,1,2,3,4,5], modulationMatrix: [[], [], [], [], [], [5]] }
];

// ---- Envelope (msfa-derived) ----------------------------------------------
const ENV_OUTLEVEL = [0,5,9,13,17,20,23,25,27,29,31,33,35,37,39,41,42,43,45,46,
  48,49,50,51,52,53,54,55,56,57,58,59,60,61,62,63,64,65,66,67,68,69,70,71,72,73,
  74,75,76,77,78,79,80,81,82,83,84,85,86,87,88,89,90,91,92,93,94,95,96,97,98,99,
  100,101,102,103,104,105,106,107,108,109,110,111,112,113,114,115,116,117,118,
  119,120,121,122,123,124,125,126,127];
const ENV_LUT = new Float32Array(4096);
for (let i = 0; i < 4096; i++) ENV_LUT[i] = Math.pow(20, ((i - 3824) * 0.0235) / 20);

class EnvelopeDX7 {
  constructor(levels, rates) {
    this.levels = levels; this.rates = rates;
    this.level = 0; this.down = true; this.advance(0);
  }
  render() {
    if (this.state < 3 || (this.state < 4 && !this.down)) {
      let lev = this.level;
      if (this.rising) {
        lev += this.decayIncrement * (2 + (this.targetlevel - lev) / 256);
        if (lev >= this.targetlevel) { lev = this.targetlevel; this.advance(this.state + 1); }
      } else {
        lev -= this.decayIncrement;
        if (lev <= this.targetlevel) { lev = this.targetlevel; this.advance(this.state + 1); }
      }
      this.level = lev;
    }
    return ENV_LUT[Math.max(0, Math.min(4095, Math.floor(this.level)))];
  }
  advance(newstate) {
    this.state = newstate;
    if (this.state < 4) {
      const newlevel = this.levels[this.state];
      this.targetlevel = Math.max(0, (ENV_OUTLEVEL[newlevel] << 5) - 224);
      this.rising = (this.targetlevel - this.level) > 0;
      const qr = Math.min(63, ((this.rates[this.state] * 41) >> 6));
      this.decayIncrement = Math.pow(2, qr / 4) / 2048;
    }
  }
  noteOff() { this.down = false; this.advance(3); }
  isFinished() { return this.state === 4; }
}

// ---- LFO (per-operator instance; shared globals object G) ------------------
const LFO_FREQ = [0.062506,0.124815,0.311474,0.435381,0.619784,0.744396,0.930495,1.116390,1.284220,1.496880,1.567830,1.738994,1.910158,2.081322,2.252486,2.423650,2.580668,2.737686,2.894704,3.051722,3.208740,3.366820,3.524900,3.682980,3.841060,3.999140,4.159420,4.319700,4.479980,4.640260,4.800540,4.953584,5.106628,5.259672,5.412716,5.565760,5.724918,5.884076,6.043234,6.202392,6.361550,6.520044,6.678538,6.837032,6.995526,7.154020,7.300500,7.446980,7.593460,7.739940,7.886420,8.020588,8.154756,8.288924,8.423092,8.557260,8.712624,8.867988,9.023352,9.178716,9.334080,9.669644,10.005208,10.340772,10.676336,11.011900,11.963680,12.915460,13.867240,14.819020,15.770800,16.640240,17.509680,18.379120,19.248560,20.118000,21.040700,21.963400,22.886100,23.808800,24.731500,25.759740,26.787980,27.816220,28.844460,29.872700,31.228200,32.583700,33.939200,35.294700,36.650200,37.812480,38.974760,40.137040,41.299320,42.461600,43.639800,44.818000,45.996200,47.174400];
const LFO_PITCH_MOD = [0,0.0264,0.0534,0.0889,0.1612,0.2769,0.4967,1];

class LfoDX7 {
  constructor(opParams, G) {
    this.opParams = opParams; this.G = G;
    this.phase = 0; this.pitchVal = 1; this.counter = 0;
    this.ampVal = 1; this.ampValTarget = 1; this.ampIncrement = 0;
    this.delayVal = 0; this.delayState = 0;
  }
  render() {
    const G = this.G, p = G.patch;
    if (this.counter % LFO_SAMPLE_PERIOD === 0) {
      let amp;
      switch (p.lfoWaveform) {
        case 0: amp = (this.phase < PERIOD_HALF) ? 4*this.phase*PERIOD_RECIP-1 : 3-4*this.phase*PERIOD_RECIP; break;
        case 1: amp = 1 - 2*this.phase*PERIOD_RECIP; break;
        case 2: amp = 2*this.phase*PERIOD_RECIP - 1; break;
        case 3: amp = (this.phase < PERIOD_HALF) ? -1 : 1; break;
        case 4: amp = Math.sin(this.phase); break;
        default: amp = G.sampleHoldRandom; break;
      }
      if (this.delayState < 2) {
        this.delayVal += G.delayIncrements[this.delayState];
        if (this.counter / LFO_SAMPLE_PERIOD > G.delayTimes[this.delayState]) {
          this.delayState++; this.delayVal = (this.delayState === 2) ? 1 : 0;
        }
      }
      amp *= this.delayVal;
      const pitchModDepth = 1 + LFO_PITCH_MOD[p.lfoPitchModSens] * (p.controllerModVal + p.lfoPitchModDepth / 99);
      this.pitchVal = Math.pow(pitchModDepth, amp);
      const ampSensDepth = Math.abs(this.opParams.lfoAmpModSens) * 0.333333;
      const phase = (this.opParams.lfoAmpModSens > 0) ? 1 : -1;
      this.ampValTarget = 1 - ((G.ampModDepth + p.controllerModVal) * ampSensDepth * (amp * phase + 1) * 0.5);
      this.ampIncrement = (this.ampValTarget - this.ampVal) / LFO_SAMPLE_PERIOD;
      this.phase += G.phaseStep;
      if (this.phase >= PERIOD) { G.sampleHoldRandom = 1 - Math.random() * 2; this.phase -= PERIOD; }
    }
    this.counter++;
    return this.pitchVal;
  }
  renderAmp() { this.ampVal += this.ampIncrement; return this.ampVal; }
}

// ---- Pitch envelope (faithful port of msfa PitchEnv, Apache-2.0) -----------
// Global per-voice pitch sweep (risers/zaps/descents). Level 50 = no shift;
// pitchenv_tab maps 0-99 -> signed value, scaled 12/32 semitones.
const PE_RATE = [1,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,12,12,13,13,14,14,15,16,16,17,18,18,19,20,21,22,23,24,25,26,27,28,30,31,33,34,36,37,38,39,41,42,44,46,47,49,51,53,54,56,58,60,62,64,66,68,70,72,74,76,79,82,85,88,91,94,98,102,106,110,115,120,125,130,135,141,147,153,159,165,171,178,185,193,202,211,232,243,254,255];
const PE_TAB = [-128,-116,-104,-95,-85,-76,-68,-61,-56,-52,-49,-46,-43,-41,-39,-37,-35,-33,-32,-31,-30,-29,-28,-27,-26,-25,-24,-23,-22,-21,-20,-19,-18,-17,-16,-15,-14,-13,-12,-11,-10,-9,-8,-7,-6,-5,-4,-3,-2,-1,0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,38,40,43,46,49,53,58,65,73,82,92,103,115,127];
const PE_UNIT = (1 << 24) / (21.3 * sampleRate);  // per-sample increment unit
const OCT = 1 << 24;                               // 1 octave in pitch fixed-point
class PitchEnvDX7 {
  constructor(rates, levels) {
    this.rates = rates || [99,99,99,99]; this.levels = levels || [50,50,50,50];
    this.level = (PE_TAB[this.levels[3]] || 0) << 19; this.down = true; this.advance(0);
  }
  getsample() {
    if (this.ix < 3 || (this.ix < 4 && !this.down)) {
      if (this.rising) { this.level += this.inc; if (this.level >= this.target) { this.level = this.target; this.advance(this.ix + 1); } }
      else { this.level -= this.inc; if (this.level <= this.target) { this.level = this.target; this.advance(this.ix + 1); } }
    }
    return this.level; // pitch in OCT-per-octave fixed point
  }
  keydown(d) { if (this.down !== d) { this.down = d; this.advance(d ? 0 : 3); } }
  advance(ix) { this.ix = ix; if (ix < 4) { this.target = (PE_TAB[this.levels[ix]] || 0) << 19; this.rising = this.target > this.level; this.inc = PE_RATE[this.rates[ix]] * PE_UNIT; } }
}

// ---- Operator --------------------------------------------------------------
class Operator {
  constructor(params, baseFrequency, envelope, lfo) {
    this.phase = 0; this.val = 0; this.params = params;
    this.envelope = envelope; this.lfo = lfo; this.outputLevel = params.outputLevel;
    this.updateFrequency(baseFrequency);
  }
  updateFrequency(baseFrequency) {
    const f = this.params.oscMode
      ? this.params.freqFixed
      : baseFrequency * this.params.freqRatio * Math.pow(OCTAVE_1024, this.params.detune);
    this.phaseStep = PERIOD * f / sampleRate;
  }
  render(mod, pitchMul) {
    this.val = Math.sin(this.phase + mod) * this.envelope.render() * this.lfo.renderAmp();
    this.phase += this.phaseStep * this.lfo.render() * (pitchMul || 1);
    if (this.phase >= PERIOD) this.phase -= PERIOD;
    return this.val;
  }
  noteOff() { this.envelope.noteOff(); }
  isFinished() { return this.envelope.isFinished(); }
}

// ---- Voice -----------------------------------------------------------------
class FMVoice {
  constructor(note, velocity, patch, G) {
    this.note = note; this.down = true; this.patch = patch;
    this.frequency = 440 * Math.pow(2, (note - 69) / 12);
    this.operators = new Array(6);
    this.pitchEnv = new PitchEnvDX7(patch.pitchEGRates, patch.pitchEGLevels);
    for (let i = 0; i < 6; i++) {
      const op = patch.operators[i];
      const o = new Operator(op, this.frequency, new EnvelopeDX7(op.levels, op.rates), new LfoDX7(op, G));
      o.outputLevel = (1 + (velocity - 1) * (op.velocitySens / 7)) * op.outputLevel;
      this.operators[i] = o;
    }
  }
  render() {
    const algo = ALGORITHMS[this.patch.algorithm - 1];
    const mm = algo.modulationMatrix, mix = algo.outputMix;
    const fb = this.patch.fbRatio;
    const pitchMul = Math.pow(2, this.pitchEnv.getsample() / OCT); // global pitch sweep (pitch EG)
    for (let i = 5; i >= 0; i--) {
      let mod = 0;
      const mods = mm[i];
      for (let j = 0; j < mods.length; j++) {
        const m = mods[j];
        if (!this.patch.operators[m].enabled) continue;
        const modOp = this.operators[m];
        mod += (m === i) ? modOp.val * fb : modOp.val * modOp.outputLevel;
      }
      if (this.patch.operators[i].enabled) this.operators[i].render(mod, pitchMul);
      else this.operators[i].val = 0;
    }
    let out = 0;
    for (let k = 0; k < mix.length; k++) {
      const ci = mix[k];
      if (this.patch.operators[ci].enabled) out += this.operators[ci].val * this.operators[ci].outputLevel;
    }
    return out / mix.length;
  }
  noteOff() { this.down = false; this.pitchEnv.keydown(false); for (let i = 0; i < 6; i++) this.operators[i].noteOff(); }
  isFinished() {
    const mix = ALGORITHMS[this.patch.algorithm - 1].outputMix;
    for (let i = 0; i < mix.length; i++) if (!this.operators[mix[i]].isFinished()) return false;
    return true;
  }
}

// ---- Processor -------------------------------------------------------------
class DX7Processor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.patch = null;
    this.voices = [];
    this.sampleClock = 0;   // running sample count, for offline sample-accurate scheduling
    this.scheduled = [];    // [{at, kind:'on'|'off', note, velocity}] fired when sampleClock reaches `at`
    this.G = { patch: null, phaseStep: 0, ampModDepth: 0, delayTimes: [0,0], delayIncrements: [0,0], sampleHoldRandom: 0 };
    this.port.onmessage = (e) => this.onMessage(e.data);
  }
  updateLfoGlobals() {
    const p = this.patch, G = this.G;
    const lfoRate = sampleRate / LFO_SAMPLE_PERIOD;
    G.phaseStep = PERIOD * LFO_FREQ[Math.max(0, Math.min(99, p.lfoSpeed))] / lfoRate;
    G.ampModDepth = p.lfoAmpModDepth * 0.01;
    G.delayTimes[0] = (lfoRate * 0.001753 * Math.pow(p.lfoDelay, 3.10454) + 169.344 - 168) / 1000;
    G.delayTimes[1] = (lfoRate * 0.321877 * Math.pow(p.lfoDelay, 2.01163) + 494.201 - 168) / 1000;
    G.delayIncrements[0] = 0;
    G.delayIncrements[1] = 1 / (G.delayTimes[1] - G.delayTimes[0] || 1);
  }
  onMessage(msg) {
    switch (msg.type) {
      case 'patch':
        this.patch = msg.patch; this.G.patch = msg.patch;
        this.updateLfoGlobals(); this.voices = [];
        break;
      case 'noteOn':
        if (!this.patch) break;
        if (this.voices.length >= MAX_VOICES) this.voices.shift();
        this.voices.push(new FMVoice(msg.note, msg.velocity, this.patch, this.G));
        break;
      case 'noteOff':
        for (const v of this.voices) if (v.note === msg.note && v.down) { v.noteOff(); break; }
        break;
      case 'allNotesOff':
        for (const v of this.voices) v.noteOff();
        break;
      case 'mod':
        if (this.patch) this.patch.controllerModVal = Math.min(1.27, msg.value);
        break;
      case 'noteOnAt':
        this.scheduled.push({ at: msg.at, kind: 'on', note: msg.note, velocity: msg.velocity });
        break;
      case 'noteOffAt':
        this.scheduled.push({ at: msg.at, kind: 'off', note: msg.note });
        break;
    }
  }
  process(inputs, outputs) {
    const out = outputs[0];
    const ch0 = out[0];
    const n = ch0.length;
    // fire sample-scheduled events due at this block (block-level accuracy ~2.9ms)
    if (this.scheduled.length) {
      for (let qi = this.scheduled.length - 1; qi >= 0; qi--) {
        const ev = this.scheduled[qi];
        if (ev.at > this.sampleClock) continue;
        if (ev.kind === 'on' && this.patch) {
          if (this.voices.length >= MAX_VOICES) this.voices.shift();
          this.voices.push(new FMVoice(ev.note, ev.velocity, this.patch, this.G));
        } else if (ev.kind === 'off') {
          for (let v = 0; v < this.voices.length; v++) if (this.voices[v].note === ev.note && this.voices[v].down) { this.voices[v].noteOff(); break; }
        }
        this.scheduled.splice(qi, 1);
      }
    }
    if (!this.patch || this.voices.length === 0) {
      for (let c = 0; c < out.length; c++) out[c].fill(0);
      this.sampleClock += n;
      return true;
    }
    for (let s = 0; s < n; s++) {
      let sample = 0;
      for (let v = 0; v < this.voices.length; v++) sample += this.voices[v].render();
      ch0[s] = Math.tanh(sample * OUTPUT_GAIN);
    }
    for (let c = 1; c < out.length; c++) out[c].set(ch0);
    // prune finished voices
    for (let i = this.voices.length - 1; i >= 0; i--) {
      if (!this.voices[i].down && this.voices[i].isFinished()) this.voices.splice(i, 1);
    }
    this.sampleClock += n;
    return true;
  }
}

registerProcessor('dx7-processor', DX7Processor);
