// PluginEntry.cpp — the Audio Unit shell around the ported DX7 engine.
//
// Built on Apple's own AudioUnitSDK (Apache-2.0) rather than JUCE, because JUCE's
// CMake AU target shells out to `xcodebuild`, which only ships with the full
// Xcode.app. See CLAUDE.md in this directory for the no-Xcode build rationale.
//
// There is deliberately no custom GUI. Patch selection happens two ways, both
// through chrome the host already draws:
//
//   1. Live link — preset-browser sends the selected voice as a DX7 VCED SysEx
//      message over a virtual MIDI port; HandleSysEx loads it instantly. All
//      filtering, favorites, notes, tags, ratings and clustering therefore stay
//      in preset-browser, with no duplicated UI and no second writer to its JSON.
//   2. Factory presets / "Load Setting…" — a received 32-voice VMEM bank becomes
//      the host's own preset menu, and full ClassInfo save/recall means Logic's
//      native Save/Load Setting… menu round-trips a patch as an .aupreset.
//
// Threading: everything that mutates live engine state happens on the render
// thread. MIDI and SysEx arrive there already; the main thread only ever writes
// into a staging buffer and raises an atomic flag that Render() consumes.

#include "DX7Patch.h"
#include "DX7Voice.h"

#include <AudioUnitSDK/AUBase.h>
#include <AudioUnitSDK/MusicDeviceBase.h>

#include <atomic>
#include <cmath>
#include <cstring>

namespace {

#include "generated/Presets.h"

constexpr AudioUnitParameterID kParam_Volume = 0;
constexpr UInt32 kNumberOfParameters = 1;
constexpr AudioUnitParameterValue kDefaultVolume = 0.5f; // matches FMEngine's masterGain

// Key under which the 155-byte VCED array rides along in the AU's ClassInfo
// dictionary, alongside the standard keys AUBase::SaveState writes.
// Not constexpr: CFSTR expands to a builtin cast that isn't a constant expression.
const CFStringRef kVcedStateKey = CFSTR("vcedData");

// Largest SysEx message we accept: a 32-voice VMEM bank is 4104 bytes.
constexpr size_t kMaxSysExBytes = 8192;

// Note-on/off and controller changes carry a frame offset into the current
// render block. Queuing them (rather than applying immediately) is what keeps
// MIDI timing tight instead of quantized to the block boundary.
constexpr int kMaxQueuedEvents = 512;

struct MidiEvent {
  UInt32 frame;
  enum Kind : uint8_t { NoteOn, NoteOff, AllNotesOff, ModWheel } kind;
  uint8_t data1;
  uint8_t data2;
};

class DX7AudioUnit : public ausdk::MusicDeviceBase {
  using Base = ausdk::MusicDeviceBase;

public:
  explicit DX7AudioUnit(AudioComponentInstance ci) : Base{ ci, 0, 1 } {
    fmau::initEnvelopeTable();
    Globals()->UseIndexedParameters(kNumberOfParameters);
    Globals()->SetParameter(kParam_Volume, kDefaultVolume);

    // Seed the browsable bank from the embedded presets, then arm preset 0 so a
    // freshly instantiated plugin is audible without any host interaction.
    bank_.count = kEmbeddedPresetCount;
    for (int i = 0; i < kEmbeddedPresetCount; i++) {
      std::memcpy(bank_.voices[i], kEmbeddedPresets[i], fmau::kVcedParams);
      fmau::sanitizeVCED(bank_.voices[i]);
      fmau::vcedName(bank_.voices[i], bank_.names[i]);
    }
    lfoGlobals_.patch = &patch_;
    applyVCED(bank_.voices[0]);
  }

  ~DX7AudioUnit() override { releasePresetNames(); }

  DX7AudioUnit(const DX7AudioUnit&) = delete;
  DX7AudioUnit(DX7AudioUnit&&) = delete;
  DX7AudioUnit& operator=(const DX7AudioUnit&) = delete;
  DX7AudioUnit& operator=(DX7AudioUnit&&) = delete;

  // ---- AU boilerplate ------------------------------------------------------

  bool StreamFormatWritable(AudioUnitScope, AudioUnitElement) override { return true; }
  bool CanScheduleParameters() const noexcept AUSDK_RTSAFE override { return false; }
  bool SupportsTail() AUSDK_RTSAFE override { return true; }
  Float64 GetTailTime() AUSDK_RTSAFE override { return 0.0; }

  UInt32 SupportedNumChannels(const AUChannelInfo** outInfo) override {
    static const AUChannelInfo kChannels[] = { { 0, 1 }, { 0, 2 } };
    if (outInfo != nullptr) *outInfo = kChannels;
    return sizeof(kChannels) / sizeof(kChannels[0]);
  }

  OSStatus Initialize() override {
    const OSStatus result = Base::Initialize();
    if (result != noErr) return result;
    fmau::initEnvelopeTable();
    sampleRate_ = Output(0).GetStreamFormat().mSampleRate;
    lfoGlobals_.patch = &patch_;
    fmau::updateLfoGlobals(lfoGlobals_, sampleRate_);
    killAllVoices();
    eventCount_ = 0;
    return noErr;
  }

  OSStatus Reset(AudioUnitScope inScope, AudioUnitElement inElement) override {
    killAllVoices();
    eventCount_ = 0;
    return Base::Reset(inScope, inElement);
  }

  OSStatus GetParameterInfo(AudioUnitScope inScope, AudioUnitParameterID inParameterID,
                            AudioUnitParameterInfo& outParameterInfo) override {
    if (inScope != kAudioUnitScope_Global) return kAudioUnitErr_InvalidScope;
    if (inParameterID != kParam_Volume) return kAudioUnitErr_InvalidParameter;
    outParameterInfo.flags =
        kAudioUnitParameterFlag_IsReadable | kAudioUnitParameterFlag_IsWritable;
    FillInParameterName(outParameterInfo, CFSTR("Volume"), false);
    outParameterInfo.unit = kAudioUnitParameterUnit_LinearGain;
    outParameterInfo.minValue = 0.0f;
    outParameterInfo.maxValue = 1.0f;
    outParameterInfo.defaultValue = kDefaultVolume;
    return noErr;
  }

  // ---- Factory presets -----------------------------------------------------
  // The list is whatever bank is currently loaded: the embedded presets at
  // startup, or the 32 voices of a VMEM bank pushed in over SysEx. Rebuilt lazily
  // here because this is a main-thread property call and creating CFStrings on
  // the render thread would not be real-time safe.

  OSStatus GetPresets(CFArrayRef* outData) const override {
    if (outData == nullptr) return noErr;
    rebuildPresetNamesIfNeeded();
    CFMutableArrayRef array = CFArrayCreateMutable(nullptr, presetCount_, nullptr);
    if (array == nullptr) return kAudio_MemFullError;
    for (int i = 0; i < presetCount_; i++) CFArrayAppendValue(array, &presets_[i]);
    *outData = array;
    return noErr;
  }

  OSStatus NewFactoryPresetSet(const AUPreset& inNewFactoryPreset) override {
    const SInt32 index = inNewFactoryPreset.presetNumber;
    if (index < 0 || index >= bank_.count) return kAudioUnitErr_InvalidPropertyValue;
    applyVCED(bank_.voices[index]);
    rebuildPresetNamesIfNeeded();
    if (index < presetCount_) SetAFactoryPresetAsCurrent(presets_[index]);
    return noErr;
  }

  // ---- Full state (ClassInfo) ---------------------------------------------
  // Carrying the raw VCED array is what makes Logic's native "Save Setting… /
  // Load Setting…" menu a working patch-load path, and lets scripts/syx-to-aupreset.cjs
  // mint .aupreset files offline.

  OSStatus SaveState(CFPropertyListRef* outData) override {
    const OSStatus result = Base::SaveState(outData);
    if (result != noErr) return result;
    const auto dict = const_cast<CFMutableDictionaryRef>(
        reinterpret_cast<CFDictionaryRef>(*outData));
    CFDataRef data = CFDataCreate(nullptr, vced_, fmau::kVcedParams);
    if (data != nullptr) {
      CFDictionarySetValue(dict, kVcedStateKey, data);
      CFRelease(data);
    }
    return noErr;
  }

  OSStatus RestoreState(CFPropertyListRef plist) override {
    const OSStatus result = Base::RestoreState(plist);
    if (result != noErr) return result;
    const auto dict = reinterpret_cast<CFDictionaryRef>(plist);
    const auto data = reinterpret_cast<CFDataRef>(CFDictionaryGetValue(dict, kVcedStateKey));
    if (data != nullptr && CFGetTypeID(data) == CFDataGetTypeID() &&
        CFDataGetLength(data) >= fmau::kVcedParams) {
      uint8_t incoming[fmau::kVcedParams];
      std::memcpy(incoming, CFDataGetBytePtr(data), fmau::kVcedParams);
      applyVCED(incoming);
    }
    return noErr;
  }

  // ---- MIDI ----------------------------------------------------------------

  OSStatus HandleNoteOn(UInt8, UInt8 inNoteNumber, UInt8 inVelocity,
                        UInt32 inStartFrame) AUSDK_RTSAFE override {
    // Velocity 0 is a note-off by MIDI convention.
    if (inVelocity == 0) return queue({ inStartFrame, MidiEvent::NoteOff, inNoteNumber, 0 });
    return queue({ inStartFrame, MidiEvent::NoteOn, inNoteNumber, inVelocity });
  }

  OSStatus HandleNoteOff(UInt8, UInt8 inNoteNumber, UInt8,
                         UInt32 inStartFrame) AUSDK_RTSAFE override {
    return queue({ inStartFrame, MidiEvent::NoteOff, inNoteNumber, 0 });
  }

  OSStatus HandleAllNotesOff(UInt8) AUSDK_RTSAFE override {
    return queue({ 0, MidiEvent::AllNotesOff, 0, 0 });
  }

  OSStatus HandleAllSoundOff(UInt8) AUSDK_RTSAFE override {
    killAllVoices();
    return noErr;
  }

  OSStatus HandleControlChange(UInt8, UInt8 inController, UInt8 inValue,
                               UInt32 inStartFrame) AUSDK_RTSAFE override {
    if (inController == 1) { // mod wheel -> the JS engine's setMod()
      return queue({ inStartFrame, MidiEvent::ModWheel, inValue, 0 });
    }
    return noErr;
  }

  // The live link from preset-browser. Parsing here is pure computation over a
  // fixed buffer — no allocation — so it is safe on the render thread; only the
  // adoption of the result is deferred to the top of Render().
  OSStatus HandleSysEx(const UInt8* inData, UInt32 inLength) AUSDK_RTSAFE override {
    if (inData == nullptr || inLength == 0 || inLength > kMaxSysExBytes) return noErr;
    if (!fmau::readSysExBank(inData, inLength, pendingBank_)) return noErr;
    bankPending_.store(true, std::memory_order_release);
    return noErr;
  }

  // Also accept a patch pushed through the MusicDevice note API, so hosts that
  // drive StartNote/StopNote directly (auval does) behave the same as MIDI.
  OSStatus StartNote(MusicDeviceInstrumentID, MusicDeviceGroupID, NoteInstanceID* outNoteInstanceID,
                     UInt32 inOffsetSampleFrame,
                     const MusicDeviceNoteParams& inParams) AUSDK_RTSAFE override {
    const auto note = static_cast<UInt8>(inParams.mPitch);
    const auto velocity = static_cast<UInt8>(inParams.mVelocity);
    if (outNoteInstanceID != nullptr) *outNoteInstanceID = note;
    return queue({ inOffsetSampleFrame, MidiEvent::NoteOn, note,
                   static_cast<uint8_t>(velocity == 0 ? 1 : velocity) });
  }

  OSStatus StopNote(MusicDeviceGroupID, NoteInstanceID inNoteInstanceID,
                    UInt32 inOffsetSampleFrame) AUSDK_RTSAFE override {
    return queue({ inOffsetSampleFrame, MidiEvent::NoteOff,
                   static_cast<uint8_t>(inNoteInstanceID & 0x7f), 0 });
  }

  // ---- Render --------------------------------------------------------------

  OSStatus Render(AudioUnitRenderActionFlags& ioActionFlags, const AudioTimeStamp&,
                  UInt32 inNumberFrames) AUSDK_RTSAFE override {
    adoptPendingBank();

    AudioBufferList& bufferList = Output(0).GetBufferList();
    const UInt32 channels = bufferList.mNumberBuffers;
    if (channels == 0) return noErr;
    auto* const mono = static_cast<float*>(bufferList.mBuffers[0].mData);
    if (mono == nullptr) return noErr;

    const auto volume = static_cast<double>(GetParameterRT(kParam_Volume));

    // Walk the block in segments split at each queued event's frame offset.
    bool sounded = false;
    UInt32 position = 0;
    for (int e = 0; e < eventCount_; e++) {
      UInt32 at = events_[e].frame;
      if (at > inNumberFrames) at = inNumberFrames;
      if (at < position) at = position; // hosts deliver in order; stay monotonic
      if (at > position) {
        sounded |= renderSegment(mono + position, at - position, volume);
        position = at;
      }
      applyEvent(events_[e]);
    }
    eventCount_ = 0;
    if (position < inNumberFrames) {
      sounded |= renderSegment(mono + position, inNumberFrames - position, volume);
    }

    // The engine is mono (as in the JS); fan out to any remaining channels.
    for (UInt32 c = 1; c < channels; c++) {
      auto* const dst = static_cast<float*>(bufferList.mBuffers[c].mData);
      if (dst != nullptr && dst != mono) std::memcpy(dst, mono, inNumberFrames * sizeof(float));
    }

    pruneVoices();
    // The flag must be cleared as well as set: the host can pass it in already
    // set, and leaving it that way while we emit audio is a validation failure.
    if (sounded) ioActionFlags &= ~kAudioUnitRenderAction_OutputIsSilence;
    else ioActionFlags |= kAudioUnitRenderAction_OutputIsSilence;
    return noErr;
  }

private:
  // ---- engine plumbing -----------------------------------------------------

  // Returns whether any voice was sounding, so Render can report the silence
  // flag honestly rather than just for the tail of the block.
  bool renderSegment(float* dst, UInt32 frames, double volume) AUSDK_RTSAFE {
    const bool sounding = activeVoiceCount() > 0;
    for (UInt32 s = 0; s < frames; s++) {
      double sample = 0.0;
      for (int v = 0; v < fmau::kMaxVoices; v++) {
        if (voices_[v].active()) sample += voices_[v].render();
      }
      dst[s] = static_cast<float>(std::tanh(sample * fmau::kOutputGain) * volume);
    }
    return sounding;
  }

  OSStatus queue(const MidiEvent& event) AUSDK_RTSAFE {
    // A full queue must never swallow a note-off, or the voice hangs forever.
    // Applying immediately degrades timing for that one event but stays correct.
    if (eventCount_ >= kMaxQueuedEvents) {
      applyEvent(event);
      return noErr;
    }
    events_[eventCount_++] = event;
    return noErr;
  }

  void applyEvent(const MidiEvent& event) AUSDK_RTSAFE {
    switch (event.kind) {
      case MidiEvent::NoteOn: noteOn(event.data1, event.data2 / 127.0); break;
      case MidiEvent::NoteOff: noteOff(event.data1); break;
      case MidiEvent::AllNotesOff:
        for (int v = 0; v < fmau::kMaxVoices; v++) {
          if (voices_[v].active() && voices_[v].down()) voices_[v].noteOff();
        }
        break;
      case MidiEvent::ModWheel:
        // JS clamps to 1.27 in the worklet's 'mod' handler.
        patch_.controllerModVal = std::fmin(1.27, event.data1 / 100.0);
        break;
    }
  }

  void noteOn(int note, double velocity) AUSDK_RTSAFE {
    int slot = -1;
    for (int v = 0; v < fmau::kMaxVoices; v++) {
      if (!voices_[v].active()) { slot = v; break; }
    }
    if (slot < 0) { // all busy — steal the oldest, matching the JS voices.shift()
      uint64_t oldest = UINT64_MAX;
      slot = 0;
      for (int v = 0; v < fmau::kMaxVoices; v++) {
        if (voiceStart_[v] < oldest) { oldest = voiceStart_[v]; slot = v; }
      }
    }
    voices_[slot].start(note, velocity, &patch_, &lfoGlobals_, sampleRate_);
    voiceStart_[slot] = ++voiceClock_;
  }

  void noteOff(int note) AUSDK_RTSAFE {
    for (int v = 0; v < fmau::kMaxVoices; v++) {
      if (voices_[v].active() && voices_[v].down() && voices_[v].note() == note) {
        voices_[v].noteOff();
        return; // JS releases one voice per note-off
      }
    }
  }

  void pruneVoices() AUSDK_RTSAFE {
    for (int v = 0; v < fmau::kMaxVoices; v++) {
      if (voices_[v].active() && !voices_[v].down() && voices_[v].isFinished()) voices_[v].kill();
    }
  }

  int activeVoiceCount() const AUSDK_RTSAFE {
    int n = 0;
    for (int v = 0; v < fmau::kMaxVoices; v++) {
      if (voices_[v].active()) n++;
    }
    return n;
  }

  void killAllVoices() AUSDK_RTSAFE {
    for (int v = 0; v < fmau::kMaxVoices; v++) {
      voices_[v].kill();
      voiceStart_[v] = 0;
    }
    voiceClock_ = 0;
  }

  // Install a VCED array as the live patch. Called from the render thread
  // (SysEx/preset change) and from the main thread before/outside rendering
  // (construction, state restore); all of it is plain field assignment.
  void applyVCED(const uint8_t* v) {
    std::memcpy(vced_, v, fmau::kVcedParams);
    fmau::sanitizeVCED(vced_);
    fmau::patchFromVCED(vced_, patch_);
    lfoGlobals_.patch = &patch_;
    fmau::updateLfoGlobals(lfoGlobals_, sampleRate_);
    killAllVoices(); // the JS clears its voice list on patch load
  }

  void adoptPendingBank() AUSDK_RTSAFE {
    if (!bankPending_.exchange(false, std::memory_order_acquire)) return;
    if (pendingBank_.count <= 0) return;
    if (pendingBank_.count > 1) {
      // A whole bank arrived: it becomes the host's browsable preset list.
      bank_ = pendingBank_;
      presetsDirty_.store(true, std::memory_order_release);
    }
    // A single voice just loads, leaving any existing bank list intact.
    applyVCED(pendingBank_.voices[0]);
  }

  // ---- preset name cache (main thread only) --------------------------------

  void releasePresetNames() const {
    for (int i = 0; i < presetCount_; i++) {
      if (presets_[i].presetName != nullptr) CFRelease(presets_[i].presetName);
      presets_[i].presetName = nullptr;
    }
    presetCount_ = 0;
  }

  void rebuildPresetNamesIfNeeded() const {
    if (!presetsDirty_.exchange(false, std::memory_order_acquire) && presetCount_ > 0) return;
    releasePresetNames();
    const int count = bank_.count > fmau::kVmemVoices ? fmau::kVmemVoices : bank_.count;
    for (int i = 0; i < count; i++) {
      const char* name = bank_.names[i][0] != '\0' ? bank_.names[i] : "(unnamed)";
      presets_[i].presetNumber = i;
      presets_[i].presetName =
          CFStringCreateWithCString(nullptr, name, kCFStringEncodingUTF8);
    }
    presetCount_ = count;
  }

  // ---- state ---------------------------------------------------------------

  double sampleRate_ = 44100.0;
  fmau::Patch patch_;
  fmau::LfoGlobals lfoGlobals_;
  uint8_t vced_[fmau::kVcedParams] = {};

  fmau::FMVoice voices_[fmau::kMaxVoices];
  uint64_t voiceStart_[fmau::kMaxVoices] = {};
  uint64_t voiceClock_ = 0;

  MidiEvent events_[kMaxQueuedEvents] = {};
  int eventCount_ = 0;

  fmau::Bank bank_;
  fmau::Bank pendingBank_;
  std::atomic<bool> bankPending_{ false };

  mutable AUPreset presets_[fmau::kVmemVoices] = {};
  mutable int presetCount_ = 0;
  mutable std::atomic<bool> presetsDirty_{ true };
};

} // namespace

AUSDK_COMPONENT_ENTRY(ausdk::AUMusicDeviceFactory, DX7AudioUnit)
