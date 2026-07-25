// host-test.cpp — instantiate the installed FMVoice component like a host would
// and prove, outside Logic, which patch-loading paths actually work.
//
// This exists because "does the host deliver SysEx to an instrument plugin?" is a
// host policy question, and answering it by poking at Logic's settings is
// guesswork. This isolates the plugin side: if SysEx works here, the plugin is
// correct and any failure in Logic is Logic's routing.
//
//   host-test <single-voice.syx> [preset.aupreset]
//
// Renders the same note four ways and reports RMS:
//   A  default state            (the embedded preset 0)
//   B  after MusicDeviceSysEx   (the live-link path)
//   C  after a factory preset   (the host preset menu)
//   D  after ClassInfo restore  (what "AU Presets" / "Load Setting…" do)
//
// Result on 2026-07-25: all four WORK, and B == C exactly (a patch loaded over
// SysEx renders identically to the same patch from the preset menu). Logic still
// plays only the default, which places the fault in Logic's MIDI routing — it
// does not forward SysEx from a MIDI input to an instrument plugin. Hence the
// library is delivered as .aupreset files (path D) rather than over the link.

#include <AudioToolbox/AudioToolbox.h>

#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <vector>

namespace {

constexpr double kSampleRate = 44100.0;
constexpr UInt32 kFrames = 512;
constexpr int kBlocks = 120;

struct Rendered {
  double rms;
  double peak;
  bool ok;
};

AudioUnit instantiate() {
  AudioComponentDescription desc{};
  desc.componentType = kAudioUnitType_MusicDevice;
  desc.componentSubType = 'Fmv1';
  desc.componentManufacturer = 'Cok1';
  AudioComponent comp = AudioComponentFindNext(nullptr, &desc);
  if (comp == nullptr) {
    std::fprintf(stderr, "FMVoice component not found — is it installed?\n");
    return nullptr;
  }
  AudioUnit au = nullptr;
  if (AudioComponentInstanceNew(comp, &au) != noErr) return nullptr;

  AudioStreamBasicDescription fmt{};
  fmt.mSampleRate = kSampleRate;
  fmt.mFormatID = kAudioFormatLinearPCM;
  fmt.mFormatFlags = kAudioFormatFlagIsFloat | kAudioFormatFlagIsPacked |
                     kAudioFormatFlagIsNonInterleaved;
  fmt.mChannelsPerFrame = 2;
  fmt.mFramesPerPacket = 1;
  fmt.mBitsPerChannel = 32;
  fmt.mBytesPerFrame = 4;
  fmt.mBytesPerPacket = 4;
  AudioUnitSetProperty(au, kAudioUnitProperty_StreamFormat, kAudioUnitScope_Output, 0, &fmt,
                       sizeof(fmt));
  UInt32 maxFrames = kFrames;
  AudioUnitSetProperty(au, kAudioUnitProperty_MaximumFramesPerSlice, kAudioUnitScope_Global, 0,
                       &maxFrames, sizeof(maxFrames));
  if (AudioUnitInitialize(au) != noErr) {
    std::fprintf(stderr, "AudioUnitInitialize failed\n");
    return nullptr;
  }
  return au;
}

Rendered renderNote(AudioUnit au, int note) {
  std::vector<float> left(kFrames), right(kFrames);
  std::vector<uint8_t> ablStorage(sizeof(AudioBufferList) + sizeof(AudioBuffer));
  auto* abl = reinterpret_cast<AudioBufferList*>(ablStorage.data());
  abl->mNumberBuffers = 2;

  MusicDeviceMIDIEvent(au, 0x90, static_cast<UInt32>(note), 100, 0);

  double sumsq = 0.0, peak = 0.0;
  size_t n = 0;
  AudioTimeStamp ts{};
  ts.mFlags = kAudioTimeStampSampleTimeValid;
  for (int b = 0; b < kBlocks; b++) {
    abl->mBuffers[0] = { 1, static_cast<UInt32>(kFrames * sizeof(float)), left.data() };
    abl->mBuffers[1] = { 1, static_cast<UInt32>(kFrames * sizeof(float)), right.data() };
    ts.mSampleTime = static_cast<Float64>(b) * kFrames;
    AudioUnitRenderActionFlags flags = 0;
    const OSStatus err = AudioUnitRender(au, &flags, &ts, 0, kFrames, abl);
    if (err != noErr) {
      std::fprintf(stderr, "AudioUnitRender failed: %d\n", static_cast<int>(err));
      return { 0, 0, false };
    }
    for (UInt32 i = 0; i < kFrames; i++) {
      const double x = left[i];
      sumsq += x * x;
      if (std::fabs(x) > peak) peak = std::fabs(x);
      n++;
    }
  }
  return { std::sqrt(sumsq / static_cast<double>(n)), peak, true };
}

} // namespace

int main(int argc, char** argv) {
  if (argc < 2 || argc > 3) {
    std::fprintf(stderr, "usage: %s <single-voice.syx> [preset.aupreset]\n", argv[0]);
    return 2;
  }
  std::FILE* f = std::fopen(argv[1], "rb");
  if (f == nullptr) {
    std::fprintf(stderr, "cannot open %s\n", argv[1]);
    return 1;
  }
  std::fseek(f, 0, SEEK_END);
  const long size = std::ftell(f);
  std::fseek(f, 0, SEEK_SET);
  std::vector<uint8_t> syx(static_cast<size_t>(size));
  if (std::fread(syx.data(), 1, syx.size(), f) != syx.size()) { std::fclose(f); return 1; }
  std::fclose(f);
  std::printf("sysex payload: %zu bytes, first=0x%02X last=0x%02X\n", syx.size(), syx[0],
              syx[syx.size() - 1]);

  // A — default state
  AudioUnit au = instantiate();
  if (au == nullptr) return 1;
  const Rendered a = renderNote(au, 60);
  AudioUnitUninitialize(au);
  AudioComponentInstanceDispose(au);

  // B — after SysEx (the live-link path)
  au = instantiate();
  if (au == nullptr) return 1;
  const OSStatus sysexErr = MusicDeviceSysEx(au, syx.data(), static_cast<UInt32>(syx.size()));
  const Rendered b = renderNote(au, 60);
  AudioUnitUninitialize(au);
  AudioComponentInstanceDispose(au);

  // C — after selecting factory preset 1 (the host-menu path)
  au = instantiate();
  if (au == nullptr) return 1;
  CFArrayRef presets = nullptr;
  UInt32 sz = sizeof(presets);
  OSStatus presetErr =
      AudioUnitGetProperty(au, kAudioUnitProperty_FactoryPresets, kAudioUnitScope_Global, 0,
                           &presets, &sz);
  long presetCount = presets != nullptr ? CFArrayGetCount(presets) : 0;
  if (presetErr == noErr && presetCount > 1) {
    AUPreset chosen = *static_cast<const AUPreset*>(CFArrayGetValueAtIndex(presets, 1));
    presetErr = AudioUnitSetProperty(au, kAudioUnitProperty_PresentPreset, kAudioUnitScope_Global,
                                     0, &chosen, sizeof(chosen));
  }
  const Rendered c = renderNote(au, 60);
  AudioUnitUninitialize(au);
  AudioComponentInstanceDispose(au);

  // D — restore a .aupreset through ClassInfo, which is exactly what Logic's
  // "AU Presets" menu and "Load Setting…" do. Verified rather than assumed,
  // because that is the path the library export depends on.
  Rendered d{ 0, 0, false };
  OSStatus classInfoErr = -1;
  if (argc >= 3) {
    au = instantiate();
    if (au == nullptr) return 1;
    CFDataRef xml = nullptr;
    if (std::FILE* pf = std::fopen(argv[2], "rb")) {
      std::fseek(pf, 0, SEEK_END);
      const long plen = std::ftell(pf);
      std::fseek(pf, 0, SEEK_SET);
      std::vector<uint8_t> buf(static_cast<size_t>(plen));
      if (std::fread(buf.data(), 1, buf.size(), pf) == buf.size()) {
        xml = CFDataCreate(nullptr, buf.data(), static_cast<CFIndex>(buf.size()));
      }
      std::fclose(pf);
    }
    if (xml != nullptr) {
      CFPropertyListRef plist = CFPropertyListCreateWithData(
          nullptr, xml, kCFPropertyListImmutable, nullptr, nullptr);
      if (plist != nullptr) {
        classInfoErr = AudioUnitSetProperty(au, kAudioUnitProperty_ClassInfo,
                                            kAudioUnitScope_Global, 0, &plist, sizeof(plist));
        CFRelease(plist);
      }
      CFRelease(xml);
    }
    d = renderNote(au, 60);
    AudioUnitUninitialize(au);
    AudioComponentInstanceDispose(au);
  }

  std::printf("\n  A default          rms %.6f  peak %.4f\n", a.rms, a.peak);
  std::printf("  B after SysEx      rms %.6f  peak %.4f   (MusicDeviceSysEx -> %d)\n", b.rms,
              b.peak, static_cast<int>(sysexErr));
  std::printf("  C factory preset 1 rms %.6f  peak %.4f   (%ld presets, status %d)\n", c.rms,
              c.peak, presetCount, static_cast<int>(presetErr));

  if (argc >= 3) {
    std::printf("  D .aupreset        rms %.6f  peak %.4f   (ClassInfo -> %d)\n", d.rms, d.peak,
                static_cast<int>(classInfoErr));
  }

  const bool sysexWorks = b.ok && std::fabs(b.rms - a.rms) > 1e-6;
  const bool presetWorks = c.ok && std::fabs(c.rms - a.rms) > 1e-6;
  const bool aupresetWorks = d.ok && classInfoErr == noErr && std::fabs(d.rms - a.rms) > 1e-6;
  std::printf("\n  SysEx patch load:    %s\n", sysexWorks ? "WORKS" : "NO EFFECT");
  std::printf("  Factory preset load: %s\n", presetWorks ? "WORKS" : "NO EFFECT");
  if (argc >= 3) {
    std::printf("  .aupreset load:      %s\n", aupresetWorks ? "WORKS" : "NO EFFECT");
  }
  return (sysexWorks && presetWorks && (argc < 3 || aupresetWorks)) ? 0 : 1;
}
