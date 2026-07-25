#!/usr/bin/env node
// gen-presets.cjs — emit Source/generated/Presets.h, the plugin's embedded bank.
//
// The embedded set only needs to cover "plugin is audible the instant it is
// instantiated". Real patch selection happens over the live SysEx link from
// preset-browser (which keeps all the filtering/favorites/tags/notes/clustering),
// so this deliberately stays small.
//
//   node scripts/gen-presets.cjs                      # just INIT VOICE (the default)
//   node scripts/gen-presets.cjs rom1a.syx            # INIT VOICE + all 32 bank voices
//   node scripts/gen-presets.cjs rom1a.syx:3 foo.syx  # ...or a single voice by index
//
// The committed Presets.h holds only the synthesized INIT VOICE, so the repo
// carries no third-party patch data and the plugin builds with no external files.
// Re-run with your own .syx arguments to embed a personal set locally.

const fs = require('fs');
const path = require('path');

const syx = require('../../audio-common/syx.cjs');

const OUT = path.join(__dirname, '..', 'Source', 'generated', 'Presets.h');

// The standard DX7 "INIT VOICE": algorithm 1, OP1 a plain sine carrier at ratio
// 1.00, every other operator silent. Built here rather than shipped as a file so
// the default build has no external dependency.
function initVoice() {
  const v = new Array(syx.VCED_PARAMS).fill(0);
  for (let op = 0; op < 6; op++) {
    const d = op * 21;
    v[d + 0] = 99; v[d + 1] = 99; v[d + 2] = 99; v[d + 3] = 99;   // EG rates
    v[d + 4] = 99; v[d + 5] = 99; v[d + 6] = 99; v[d + 7] = 0;    // EG levels
    v[d + 8] = 39;                                                // kbd break point (C3)
    v[d + 16] = (op === 5) ? 99 : 0;                              // OP1 is VCED slot 5
    v[d + 18] = 1;                                                // freq coarse = 1.00
    v[d + 20] = 7;                                                // detune centre
  }
  for (let i = 0; i < 4; i++) { v[126 + i] = 99; v[130 + i] = 50; } // pitch EG: flat
  v[134] = 0;   // algorithm 1
  v[136] = 1;   // osc key sync
  v[137] = 35;  // LFO speed
  v[141] = 1;   // LFO sync
  v[143] = 3;   // pitch mod sensitivity
  v[144] = 24;  // transpose = centre
  const name = 'INIT VOICE';
  for (let i = 0; i < 10; i++) v[145 + i] = name.charCodeAt(i) & 0x7f;
  return v;
}

const voices = [{ name: 'INIT VOICE', params: initVoice() }];

for (const arg of process.argv.slice(2)) {
  const m = /^(.*?)(?::(\d+))?$/.exec(arg);
  const file = m[1];
  const wanted = m[2] === undefined ? null : parseInt(m[2], 10);
  const parsed = syx.parseSyx(fs.readFileSync(file));
  if (!parsed.voices.length) throw new Error('no voices parsed from ' + file);
  for (const w of parsed.warnings) console.warn('  ' + path.basename(file) + ': ' + w);
  const picked = wanted === null ? parsed.voices : [parsed.voices[wanted]];
  for (const voice of picked) {
    if (!voice) throw new Error('voice index out of range in ' + file);
    voices.push({ name: voice.name || '(unnamed)', params: voice.params });
  }
}

if (voices.length > syx.VMEM_VOICES) {
  console.warn('trimming ' + voices.length + ' voices to the ' + syx.VMEM_VOICES +
    '-slot bank limit');
  voices.length = syx.VMEM_VOICES;
}

const body = voices.map((voice) => {
  const rows = [];
  for (let i = 0; i < voice.params.length; i += 20) {
    rows.push('      ' + voice.params.slice(i, i + 20).map((n) => n & 0x7f).join(', ') + ',');
  }
  return '    // ' + voice.name + '\n    {\n' + rows.join('\n') + '\n    },';
}).join('\n');

const out =
  '// GENERATED FILE — do not edit by hand.\n' +
  '// Emitted by tools/fm-au-plugin/scripts/gen-presets.cjs.\n' +
  '// Each row is one 155-byte VCED param array; names come from bytes 145..154.\n\n' +
  'constexpr int kEmbeddedPresetCount = ' + voices.length + ';\n' +
  'const uint8_t kEmbeddedPresets[' + voices.length + '][155] = {\n' + body + '\n};\n';

fs.writeFileSync(OUT, out);
console.log('wrote Source/generated/Presets.h — ' + voices.length + ' preset(s): ' +
  voices.map((v) => v.name).join(', '));
