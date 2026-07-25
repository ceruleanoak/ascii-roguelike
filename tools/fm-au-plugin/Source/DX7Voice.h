// DX7Voice.h — C++ port of tools/audio-common/dx7-worklet.js.
//
// Class-by-class, name-for-name translation of the JS reference engine so the two
// files stay diffable against each other. If you change one, change the other.
// The lookup tables are not duplicated here by hand — they are generated into
// Source/generated/DX7Tables.inc by scripts/gen-tables.cjs.
//
// Two deliberate differences from the JS, both forced by running on a real-time
// audio thread rather than in an AudioWorklet:
//
//   1. `sampleRate` is an AudioWorklet global in JS. Here it is passed in and
//      stored per object, because an AU learns its rate from the host at
//      Initialize() time and can be re-initialized at a new rate.
//   2. Voices are preallocated and re-armed via start() instead of being
//      constructed with `new` per note-on. Nothing allocates during render.

#pragma once

#include <cstdint>

namespace fmau {

// Matches the JS: monotimbral patch, polyphonic voices, oldest voice stolen.
constexpr int kMaxVoices = 24;
// DX7 operator output levels are FM modulation-index-scaled (carriers reach ~16),
// so the summed voice output needs attenuation before the DAC. Real DX7/Dexed
// rely on a master stage for this; we scale here and soft-clip (tanh) to keep
// polyphonic stacks from hard-clipping.
constexpr double kOutputGain = 0.05;
// Widest modulationMatrix row across the 32 algorithms. gen-tables.cjs asserts
// this bound holds, so a future table change cannot silently overflow.
constexpr int kMaxModulators = 3;

// outputMix = carrier operator indices; modulationMatrix[i] = ops that modulate op i.
// Operator index 0 = OP1 ... 5 = OP6. Self-reference => feedback.
// Rows are fixed-width and padded; modCount[i] says how many entries are real.
struct Algorithm {
  int outputCount;
  int outputMix[6];
  int modCount[6];
  int modulationMatrix[6][kMaxModulators];
};

// Per-operator patch data, as produced by DX7Patch's patchFromVCED.
struct OperatorParams {
  bool enabled = true;
  int rates[4] = { 99, 99, 99, 99 };
  int levels[4] = { 99, 99, 99, 0 };
  double outputLevel = 0.0; // already mapped through kOutputLevelTable
  int oscMode = 0;          // 0 = ratio, 1 = fixed
  double freqRatio = 1.0;
  double freqFixed = 1.0;
  int detune = 0;           // -7..+7
  int velocitySens = 0;
  int lfoAmpModSens = 0;
};

struct Patch {
  char name[11] = { 0 };
  int algorithm = 1; // 1..32
  double fbRatio = 0.0;
  OperatorParams operators[6];
  int pitchEGRates[4] = { 99, 99, 99, 99 };
  int pitchEGLevels[4] = { 50, 50, 50, 50 };
  int lfoSpeed = 35;
  int lfoDelay = 0;
  int lfoPitchModDepth = 0;
  int lfoAmpModDepth = 0;
  int lfoPitchModSens = 0;
  int lfoWaveform = 0;
  // Mod-wheel depth. Lives on the patch (not the voice) exactly as in the JS,
  // where the 'mod' message mutates the shared patch object.
  double controllerModVal = 0.0;
};

// LFO state shared by every operator of every voice — the JS `G` object.
// Recomputed by updateLfoGlobals() whenever the patch or sample rate changes.
struct LfoGlobals {
  Patch* patch = nullptr;
  double phaseStep = 0.0;
  double ampModDepth = 0.0;
  double delayTimes[2] = { 0.0, 0.0 };
  double delayIncrements[2] = { 0.0, 0.0 };
  double sampleHoldRandom = 0.0;
  uint32_t rngState = 0x9e3779b9u;

  // Stands in for Math.random() in the sample-and-hold LFO waveform. A plain
  // xorshift keeps the audio thread free of libc rand()'s lock.
  double nextRandom();
};

// Recompute the shared LFO globals from g.patch. Call after loading a patch or
// changing sample rate. Mirrors DX7Processor.updateLfoGlobals().
void updateLfoGlobals(LfoGlobals& g, double sampleRate);

// One-time build of the shared 4096-entry envelope lookup table.
void initEnvelopeTable();

// ---- Envelope (msfa-derived) ----------------------------------------------
class EnvelopeDX7 {
public:
  void init(const int* levels, const int* rates);
  double render();
  void noteOff();
  bool isFinished() const { return state_ == 4; }

private:
  void advance(int newstate);

  const int* levels_ = nullptr;
  const int* rates_ = nullptr;
  double level_ = 0.0;
  double targetlevel_ = 0.0;
  double decayIncrement_ = 0.0;
  bool rising_ = false;
  bool down_ = true;
  int state_ = 0;
};

// ---- LFO (per-operator instance; shared globals object G) ------------------
class LfoDX7 {
public:
  void init(const OperatorParams* opParams, LfoGlobals* g);
  double render();    // advances the LFO, returns the pitch multiplier
  double renderAmp(); // per-sample amplitude ramp toward the last target

private:
  const OperatorParams* opParams_ = nullptr;
  LfoGlobals* g_ = nullptr;
  double phase_ = 0.0;
  double pitchVal_ = 1.0;
  long counter_ = 0;
  double ampVal_ = 1.0;
  double ampValTarget_ = 1.0;
  double ampIncrement_ = 0.0;
  double delayVal_ = 0.0;
  int delayState_ = 0;
};

// ---- Pitch envelope (faithful port of msfa PitchEnv, Apache-2.0) -----------
// Global per-voice pitch sweep (risers/zaps/descents). Level 50 = no shift;
// kPeTab maps 0-99 -> signed value, scaled 12/32 semitones.
class PitchEnvDX7 {
public:
  void init(const int* rates, const int* levels, double sampleRate);
  double getsample(); // pitch in kOct-per-octave fixed point
  void keydown(bool d);

private:
  void advance(int ix);

  const int* rates_ = nullptr;
  const int* levels_ = nullptr;
  double peUnit_ = 0.0; // (1 << 24) / (21.3 * sampleRate)
  double level_ = 0.0;
  double target_ = 0.0;
  double inc_ = 0.0;
  bool rising_ = false;
  bool down_ = true;
  int ix_ = 0;
};

// ---- Operator --------------------------------------------------------------
class Operator {
public:
  void init(const OperatorParams* params, double baseFrequency, double sampleRate, LfoGlobals* g);
  double render(double mod, double pitchMul);
  void noteOff() { envelope_.noteOff(); }
  bool isFinished() const { return envelope_.isFinished(); }

  // Public because FMVoice::render reads neighbouring operators' last output to
  // build modulation, exactly as the JS does via `modOp.val`.
  double val = 0.0;
  double outputLevel = 0.0; // velocity-scaled copy of params->outputLevel

private:
  void updateFrequency(double baseFrequency);

  double phase_ = 0.0;
  double phaseStep_ = 0.0;
  double sampleRate_ = 44100.0;
  const OperatorParams* params_ = nullptr;
  EnvelopeDX7 envelope_;
  LfoDX7 lfo_;
};

// ---- Voice -----------------------------------------------------------------
class FMVoice {
public:
  // Re-arms this voice for a new note. `velocity` is 0..1 (MIDI value / 127),
  // matching the JS noteOn message.
  void start(int note, double velocity, Patch* patch, LfoGlobals* g, double sampleRate);
  double render();
  void noteOff();
  bool isFinished() const;

  int note() const { return note_; }
  bool down() const { return down_; }
  bool active() const { return active_; }
  void kill() { active_ = false; }

private:
  int note_ = 0;
  bool down_ = false;
  bool active_ = false;
  Patch* patch_ = nullptr;
  double frequency_ = 0.0;
  Operator operators_[6];
  PitchEnvDX7 pitchEnv_;
};

} // namespace fmau
