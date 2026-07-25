// DX7Voice.cpp — C++ port of tools/audio-common/dx7-worklet.js.
//
// DSP ported from dx7-synth-js by Matt Montag (ISC license) — operator FM loop,
// the msfa-derived envelope (music-synthesizer-for-android), the 32 DX7
// algorithm routing matrix, and the LFO. See tools/audio-common/dx7-worklet.js
// and the repo NOTICE for provenance.
//
// Keep this file line-comparable with the JS: same class names, same method
// names, same order of operations inside each render loop.

#include "DX7Voice.h"

#include <algorithm>
#include <cmath>

namespace fmau {

namespace {

constexpr double kPeriod = 6.283185307179586;    // 2*pi
constexpr double kPeriodHalf = kPeriod / 2.0;
constexpr double kPeriodRecip = 1.0 / kPeriod;
constexpr double kOctave1024 = 1.0006771307;     // 2^(1/1024) — detune step
constexpr int kLfoSamplePeriod = 100;
constexpr double kOct = 16777216.0;              // 1 << 24, one octave in pitch fixed-point
constexpr double kPeShift19 = 524288.0;          // JS: value << 19

// Lookup tables extracted from the JS reference engine. See gen-tables.cjs.
#include "generated/DX7Tables.inc"

// Envelope output curve: 4096 entries of pow(20, ((i - 3824) * 0.0235) / 20).
// Built once rather than emitted as a table because it is a pure formula.
float gEnvLut[4096];
bool gEnvLutReady = false;

int clampi(int v, int lo, int hi) { return v < lo ? lo : (v > hi ? hi : v); }

} // namespace

void initEnvelopeTable() {
  if (gEnvLutReady) return;
  for (int i = 0; i < 4096; i++) {
    gEnvLut[i] = static_cast<float>(std::pow(20.0, ((i - 3824) * 0.0235) / 20.0));
  }
  gEnvLutReady = true;
}

double LfoGlobals::nextRandom() {
  // xorshift32 — stands in for Math.random() in the sample-and-hold waveform.
  uint32_t x = rngState;
  x ^= x << 13;
  x ^= x >> 17;
  x ^= x << 5;
  rngState = x;
  return static_cast<double>(x) / 4294967296.0;
}

void updateLfoGlobals(LfoGlobals& g, double sampleRate) {
  const Patch* p = g.patch;
  if (p == nullptr) return;
  const double lfoRate = sampleRate / kLfoSamplePeriod;
  g.phaseStep = kPeriod * kLfoFreq[clampi(p->lfoSpeed, 0, 99)] / lfoRate;
  g.ampModDepth = p->lfoAmpModDepth * 0.01;
  g.delayTimes[0] =
      (lfoRate * 0.001753 * std::pow(static_cast<double>(p->lfoDelay), 3.10454) + 169.344 - 168) / 1000;
  g.delayTimes[1] =
      (lfoRate * 0.321877 * std::pow(static_cast<double>(p->lfoDelay), 2.01163) + 494.201 - 168) / 1000;
  g.delayIncrements[0] = 0.0;
  const double span = g.delayTimes[1] - g.delayTimes[0];
  g.delayIncrements[1] = 1.0 / (span != 0.0 ? span : 1.0); // JS: `|| 1` guard
}

// ---- Envelope --------------------------------------------------------------

void EnvelopeDX7::init(const int* levels, const int* rates) {
  levels_ = levels;
  rates_ = rates;
  level_ = 0.0;
  down_ = true;
  advance(0);
}

double EnvelopeDX7::render() {
  if (state_ < 3 || (state_ < 4 && !down_)) {
    double lev = level_;
    if (rising_) {
      lev += decayIncrement_ * (2 + (targetlevel_ - lev) / 256);
      if (lev >= targetlevel_) {
        lev = targetlevel_;
        advance(state_ + 1);
      }
    } else {
      lev -= decayIncrement_;
      if (lev <= targetlevel_) {
        lev = targetlevel_;
        advance(state_ + 1);
      }
    }
    level_ = lev;
  }
  return gEnvLut[clampi(static_cast<int>(std::floor(level_)), 0, 4095)];
}

void EnvelopeDX7::advance(int newstate) {
  state_ = newstate;
  if (state_ < 4) {
    const int newlevel = levels_[state_];
    targetlevel_ = std::fmax(0.0, static_cast<double>((kEnvOutLevel[newlevel] << 5) - 224));
    rising_ = (targetlevel_ - level_) > 0;
    const int qr = std::min(63, (rates_[state_] * 41) >> 6);
    decayIncrement_ = std::pow(2.0, qr / 4.0) / 2048.0;
  }
}

void EnvelopeDX7::noteOff() {
  down_ = false;
  advance(3);
}

// ---- LFO -------------------------------------------------------------------

void LfoDX7::init(const OperatorParams* opParams, LfoGlobals* g) {
  opParams_ = opParams;
  g_ = g;
  phase_ = 0.0;
  pitchVal_ = 1.0;
  counter_ = 0;
  ampVal_ = 1.0;
  ampValTarget_ = 1.0;
  ampIncrement_ = 0.0;
  delayVal_ = 0.0;
  delayState_ = 0;
}

double LfoDX7::render() {
  const Patch* p = g_->patch;
  if (counter_ % kLfoSamplePeriod == 0) {
    double amp;
    switch (p->lfoWaveform) {
      case 0:
        amp = (phase_ < kPeriodHalf) ? 4 * phase_ * kPeriodRecip - 1 : 3 - 4 * phase_ * kPeriodRecip;
        break;
      case 1: amp = 1 - 2 * phase_ * kPeriodRecip; break;
      case 2: amp = 2 * phase_ * kPeriodRecip - 1; break;
      case 3: amp = (phase_ < kPeriodHalf) ? -1 : 1; break;
      case 4: amp = std::sin(phase_); break;
      default: amp = g_->sampleHoldRandom; break;
    }
    if (delayState_ < 2) {
      delayVal_ += g_->delayIncrements[delayState_];
      if (static_cast<double>(counter_) / kLfoSamplePeriod > g_->delayTimes[delayState_]) {
        delayState_++;
        delayVal_ = (delayState_ == 2) ? 1.0 : 0.0;
      }
    }
    amp *= delayVal_;
    const double pitchModDepth =
        1 + kLfoPitchMod[p->lfoPitchModSens] * (p->controllerModVal + p->lfoPitchModDepth / 99.0);
    pitchVal_ = std::pow(pitchModDepth, amp);
    const double ampSensDepth = std::fabs(static_cast<double>(opParams_->lfoAmpModSens)) * 0.333333;
    const double phaseSign = (opParams_->lfoAmpModSens > 0) ? 1.0 : -1.0;
    ampValTarget_ =
        1 - ((g_->ampModDepth + p->controllerModVal) * ampSensDepth * (amp * phaseSign + 1) * 0.5);
    ampIncrement_ = (ampValTarget_ - ampVal_) / kLfoSamplePeriod;
    phase_ += g_->phaseStep;
    if (phase_ >= kPeriod) {
      g_->sampleHoldRandom = 1 - g_->nextRandom() * 2;
      phase_ -= kPeriod;
    }
  }
  counter_++;
  return pitchVal_;
}

double LfoDX7::renderAmp() {
  ampVal_ += ampIncrement_;
  return ampVal_;
}

// ---- Pitch envelope --------------------------------------------------------

void PitchEnvDX7::init(const int* rates, const int* levels, double sampleRate) {
  rates_ = rates;
  levels_ = levels;
  peUnit_ = kOct / (21.3 * sampleRate);
  level_ = static_cast<double>(kPeTab[levels_[3]]) * kPeShift19;
  down_ = true;
  advance(0);
}

double PitchEnvDX7::getsample() {
  if (ix_ < 3 || (ix_ < 4 && !down_)) {
    if (rising_) {
      level_ += inc_;
      if (level_ >= target_) {
        level_ = target_;
        advance(ix_ + 1);
      }
    } else {
      level_ -= inc_;
      if (level_ <= target_) {
        level_ = target_;
        advance(ix_ + 1);
      }
    }
  }
  return level_;
}

void PitchEnvDX7::keydown(bool d) {
  if (down_ != d) {
    down_ = d;
    advance(d ? 0 : 3);
  }
}

void PitchEnvDX7::advance(int ix) {
  ix_ = ix;
  if (ix < 4) {
    target_ = static_cast<double>(kPeTab[levels_[ix]]) * kPeShift19;
    rising_ = target_ > level_;
    inc_ = kPeRate[rates_[ix]] * peUnit_;
  }
}

// ---- Operator --------------------------------------------------------------

void Operator::init(const OperatorParams* params, double baseFrequency, double sampleRate,
                    LfoGlobals* g) {
  phase_ = 0.0;
  val = 0.0;
  params_ = params;
  sampleRate_ = sampleRate;
  envelope_.init(params->levels, params->rates);
  lfo_.init(params, g);
  outputLevel = params->outputLevel;
  updateFrequency(baseFrequency);
}

void Operator::updateFrequency(double baseFrequency) {
  const double f = params_->oscMode
                       ? params_->freqFixed
                       : baseFrequency * params_->freqRatio *
                             std::pow(kOctave1024, static_cast<double>(params_->detune));
  phaseStep_ = kPeriod * f / sampleRate_;
}

double Operator::render(double mod, double pitchMul) {
  val = std::sin(phase_ + mod) * envelope_.render() * lfo_.renderAmp();
  phase_ += phaseStep_ * lfo_.render() * pitchMul;
  if (phase_ >= kPeriod) phase_ -= kPeriod;
  return val;
}

// ---- Voice -----------------------------------------------------------------

void FMVoice::start(int note, double velocity, Patch* patch, LfoGlobals* g, double sampleRate) {
  note_ = note;
  down_ = true;
  active_ = true;
  patch_ = patch;
  frequency_ = 440.0 * std::pow(2.0, (note - 69) / 12.0);
  pitchEnv_.init(patch->pitchEGRates, patch->pitchEGLevels, sampleRate);
  for (int i = 0; i < 6; i++) {
    const OperatorParams* op = &patch->operators[i];
    operators_[i].init(op, frequency_, sampleRate, g);
    operators_[i].outputLevel = (1 + (velocity - 1) * (op->velocitySens / 7.0)) * op->outputLevel;
  }
}

double FMVoice::render() {
  const Algorithm& algo = kAlgorithms[patch_->algorithm - 1];
  const double fb = patch_->fbRatio;
  // Global pitch sweep (pitch EG), applied to every operator this sample.
  const double pitchMul = std::pow(2.0, pitchEnv_.getsample() / kOct);
  for (int i = 5; i >= 0; i--) {
    double mod = 0.0;
    for (int j = 0; j < algo.modCount[i]; j++) {
      const int m = algo.modulationMatrix[i][j];
      if (!patch_->operators[m].enabled) continue;
      const Operator& modOp = operators_[m];
      mod += (m == i) ? modOp.val * fb : modOp.val * modOp.outputLevel;
    }
    if (patch_->operators[i].enabled) operators_[i].render(mod, pitchMul);
    else operators_[i].val = 0.0;
  }
  double out = 0.0;
  for (int k = 0; k < algo.outputCount; k++) {
    const int ci = algo.outputMix[k];
    if (patch_->operators[ci].enabled) out += operators_[ci].val * operators_[ci].outputLevel;
  }
  return out / algo.outputCount;
}

void FMVoice::noteOff() {
  down_ = false;
  pitchEnv_.keydown(false);
  for (int i = 0; i < 6; i++) operators_[i].noteOff();
}

bool FMVoice::isFinished() const {
  const Algorithm& algo = kAlgorithms[patch_->algorithm - 1];
  for (int k = 0; k < algo.outputCount; k++) {
    if (!operators_[algo.outputMix[k]].isFinished()) return false;
  }
  return true;
}

} // namespace fmau
