// parity-render.cpp — render one note through the ported C++ engine and dump
// raw float32 samples, so scripts/parity-check.cjs can diff them against the JS
// reference engine (dx7-worklet.js) sample for sample.
//
// This mirrors DX7Processor.process() exactly: sum the voices, scale by
// OUTPUT_GAIN, tanh soft-clip. Deliberately no master volume — that lives in the
// AU wrapper, not in the worklet this is being compared against.
//
//   parity-render <syx-path> <voiceIndex> <note> <velocity> <blocks> <offBlock> <out.f32>
//
// blocks/offBlock are counted in 128-sample blocks to match the JS harness.

#include "DX7Patch.h"
#include "DX7Voice.h"

#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <vector>

namespace {

constexpr double kSampleRate = 44100.0;
constexpr int kBlock = 128;

} // namespace

int main(int argc, char** argv) {
  if (argc != 8) {
    std::fprintf(stderr,
                 "usage: %s <syx> <voiceIndex> <note> <velocity> <blocks> <offBlock> <out.f32>\n",
                 argv[0]);
    return 2;
  }
  const char* syxPath = argv[1];
  const int voiceIndex = std::atoi(argv[2]);
  const int note = std::atoi(argv[3]);
  const int velocity = std::atoi(argv[4]);
  const int blocks = std::atoi(argv[5]);
  const int offBlock = std::atoi(argv[6]);
  const char* outPath = argv[7];

  std::FILE* f = std::fopen(syxPath, "rb");
  if (f == nullptr) {
    std::fprintf(stderr, "cannot open %s\n", syxPath);
    return 1;
  }
  std::fseek(f, 0, SEEK_END);
  const long size = std::ftell(f);
  std::fseek(f, 0, SEEK_SET);
  std::vector<uint8_t> bytes(static_cast<size_t>(size));
  if (std::fread(bytes.data(), 1, bytes.size(), f) != bytes.size()) {
    std::fprintf(stderr, "short read on %s\n", syxPath);
    std::fclose(f);
    return 1;
  }
  std::fclose(f);

  fmau::Bank bank;
  if (!fmau::readSysExBank(bytes.data(), bytes.size(), bank)) {
    std::fprintf(stderr, "no parseable voices in %s\n", syxPath);
    return 1;
  }
  if (voiceIndex < 0 || voiceIndex >= bank.count) {
    std::fprintf(stderr, "voice index %d out of range (bank has %d)\n", voiceIndex, bank.count);
    return 1;
  }

  fmau::initEnvelopeTable();
  fmau::Patch patch;
  fmau::patchFromVCED(bank.voices[voiceIndex], patch);
  fmau::LfoGlobals globals;
  globals.patch = &patch;
  fmau::updateLfoGlobals(globals, kSampleRate);

  fmau::FMVoice voice;
  voice.start(note, velocity / 127.0, &patch, &globals, kSampleRate);

  std::vector<float> out(static_cast<size_t>(blocks) * kBlock);
  size_t w = 0;
  bool active = true;
  for (int b = 0; b < blocks; b++) {
    if (b == offBlock) voice.noteOff();
    for (int s = 0; s < kBlock; s++) {
      const double sample = active ? voice.render() : 0.0;
      out[w++] = static_cast<float>(std::tanh(sample * fmau::kOutputGain));
    }
    // The JS prunes finished voices at the end of each process() call and
    // zero-fills once none remain. Mirror that, or the comparison drifts apart in
    // the release tail purely because this harness kept a dead voice alive.
    if (active && !voice.down() && voice.isFinished()) active = false;
  }

  std::FILE* o = std::fopen(outPath, "wb");
  if (o == nullptr) {
    std::fprintf(stderr, "cannot write %s\n", outPath);
    return 1;
  }
  std::fwrite(out.data(), sizeof(float), out.size(), o);
  std::fclose(o);
  std::fprintf(stderr, "%s: algorithm %d, %zu samples\n", bank.names[voiceIndex], patch.algorithm,
               out.size());
  return 0;
}
