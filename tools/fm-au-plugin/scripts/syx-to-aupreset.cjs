#!/usr/bin/env node
// syx-to-aupreset.cjs — wrap a .syx voice into a .aupreset for Logic's own
// "Load Setting…" menu.
//
// This is the offline counterpart to the live SysEx link. The live link is the
// everyday path (select in preset-browser, hear it in Logic immediately); this
// exists for patches you want parked in Logic's plugin header menu, surviving
// without preset-browser running.
//
//   node scripts/syx-to-aupreset.cjs <file.syx> [voiceIndex] [-o outDir]
//   node scripts/syx-to-aupreset.cjs rom1a.syx --all -o ~/Library/Audio/Presets/CeruleanOak/FMVoice
//
// The emitted plist must satisfy AUBase::RestoreState, which requires `version`
// == 0 and `subtype`/`manufacturer` matching the component exactly, and must NOT
// contain a `part` key. `vcedData` is the key DX7AudioUnit::RestoreState reads.

const fs = require('fs');
const path = require('path');

const S = require(path.join(__dirname, '..', '..', 'audio-common', 'syx.cjs'));

// Must match Info.plist and CMakeLists.txt.
const AU_TYPE = 'aumu';
const AU_SUBTYPE = 'Fmv1';
const AU_MANUFACTURER = 'Cok1';
const VCED_STATE_KEY = 'vcedData'; // see kVcedStateKey in Source/PluginEntry.cpp

const fourCC = (s) =>
  (s.charCodeAt(0) << 24) | (s.charCodeAt(1) << 16) | (s.charCodeAt(2) << 8) | s.charCodeAt(3);

const argv = process.argv.slice(2);
const outIdx = Math.max(argv.indexOf('-o'), argv.indexOf('--out'));
const outDir = outIdx >= 0 ? argv[outIdx + 1] : process.cwd();
const all = argv.includes('--all');
const positional = argv.filter((a, i) =>
  !a.startsWith('-') && i !== outIdx + 1);
const syxPath = positional[0];
const voiceIndex = positional[1] === undefined ? 0 : parseInt(positional[1], 10);

if (!syxPath) {
  console.error('usage: syx-to-aupreset.cjs <file.syx> [voiceIndex] [--all] [-o outDir]');
  process.exit(2);
}

const escapeXml = (s) =>
  String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

// Sanitize for a filename without collapsing distinct patch names together.
const safeName = (s) => (s.replace(/[/\\:]/g, '-').trim() || 'unnamed');

function aupreset(name, params) {
  const data = Buffer.from(params.map((n) => n & 0x7f)).toString('base64');
  // 68 chars/line is what plutil emits; purely cosmetic.
  const wrapped = (data.match(/.{1,68}/g) || []).map((l) => '\t' + l).join('\n');
  return '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" ' +
    '"http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n' +
    '<plist version="1.0">\n<dict>\n' +
    '\t<key>name</key>\n\t<string>' + escapeXml(name) + '</string>\n' +
    '\t<key>type</key>\n\t<integer>' + fourCC(AU_TYPE) + '</integer>\n' +
    '\t<key>subtype</key>\n\t<integer>' + fourCC(AU_SUBTYPE) + '</integer>\n' +
    '\t<key>manufacturer</key>\n\t<integer>' + fourCC(AU_MANUFACTURER) + '</integer>\n' +
    '\t<key>version</key>\n\t<integer>0</integer>\n' +
    '\t<key>' + VCED_STATE_KEY + '</key>\n\t<data>\n' + wrapped + '\n\t</data>\n' +
    '</dict>\n</plist>\n';
}

const parsed = S.parseSyx(fs.readFileSync(syxPath));
for (const w of parsed.warnings) console.warn('warning: ' + w);
if (!parsed.count) {
  console.error('no voices parsed from ' + syxPath);
  process.exit(1);
}

const chosen = all ? parsed.voices : [parsed.voices[voiceIndex]];
if (!all && !chosen[0]) {
  console.error('voice index ' + voiceIndex + ' out of range (bank has ' + parsed.count + ')');
  process.exit(1);
}

fs.mkdirSync(outDir, { recursive: true });
for (const voice of chosen) {
  const name = voice.name || 'unnamed';
  const file = path.join(outDir, safeName(name) + '.aupreset');
  fs.writeFileSync(file, aupreset(name, voice.params));
  console.log('wrote ' + file);
}
