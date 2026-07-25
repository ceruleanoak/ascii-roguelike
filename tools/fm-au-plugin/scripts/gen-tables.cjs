#!/usr/bin/env node
// gen-tables.cjs — emit the DX7 lookup tables as C++ from the JS reference engine.
//
// The tables in dx7-worklet.js / fm-engine.cjs *are* the DX7 sound identity, so the
// C++ port must carry them bit-identically. Rather than hand-transcribing ~500
// numbers (and silently corrupting one), we extract the array literals straight
// out of the JS and emit them as generated .inc files:
//
//   Source/generated/DX7Tables.inc        -> included by DX7Voice.cpp
//   Source/generated/DX7OutputLevels.inc  -> included by DX7Patch.cpp
//
// The .inc files are committed so the plugin builds without Node. Re-run this
// script whenever dx7-worklet.js or fm-engine.cjs changes a table, then rebuild.
//
//   node scripts/gen-tables.cjs
//
// These tables are verified end-to-end rather than by inspection: if any entry
// were wrong, scripts/parity-check.cjs would stop rendering bit-identically to
// the JS engine. That is a far stronger check than diffing the numbers.

const fs = require('fs');
const path = require('path');

const AUDIO_COMMON = path.join(__dirname, '..', '..', 'audio-common');
const OUT_DIR = path.join(__dirname, '..', 'Source', 'generated');

// Pull `const NAME = <literal>;` (or `var NAME = ...`) out of a JS source and
// evaluate just that literal. Targeted rather than loading the module, because
// dx7-worklet.js references AudioWorklet globals at top level.
function extractLiteral(src, name) {
  const re = new RegExp('(?:const|var|let)\\s+' + name + '\\s*=\\s*', 'g');
  const m = re.exec(src);
  if (!m) throw new Error('table not found in source: ' + name);
  const start = m.index + m[0].length;
  // Walk forward balancing brackets so we capture exactly the literal.
  let depth = 0, i = start;
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === '[' || c === '{') depth++;
    else if (c === ']' || c === '}') { depth--; if (depth === 0) { i++; break; } }
  }
  if (depth !== 0) throw new Error('unbalanced literal for ' + name);
  // eslint-disable-next-line no-eval
  const value = eval(src.slice(start, i));
  if (!Array.isArray(value)) throw new Error(name + ' did not evaluate to an array');
  return value;
}

// Format numbers so the C++ literal round-trips to the same double the JS has.
function num(n) {
  if (Number.isInteger(n)) return String(n);
  // 17 significant digits is enough to round-trip any IEEE-754 double exactly.
  let s = n.toPrecision(17);
  if (s.indexOf('.') !== -1) s = s.replace(/0+$/, '').replace(/\.$/, '.0');
  return s;
}

function emitArray(type, name, values, perLine) {
  const lines = [];
  for (let i = 0; i < values.length; i += perLine) {
    lines.push('    ' + values.slice(i, i + perLine).map(num).join(', ') + ',');
  }
  return 'const ' + type + ' ' + name + '[' + values.length + '] = {\n' +
    lines.join('\n') + '\n};\n';
}

const workletSrc = fs.readFileSync(path.join(AUDIO_COMMON, 'dx7-worklet.js'), 'utf8');
const engineSrc = fs.readFileSync(path.join(AUDIO_COMMON, 'fm-engine.cjs'), 'utf8');

const envOutLevel = extractLiteral(workletSrc, 'ENV_OUTLEVEL');
const lfoFreq = extractLiteral(workletSrc, 'LFO_FREQ');
const lfoPitchMod = extractLiteral(workletSrc, 'LFO_PITCH_MOD');
const peRate = extractLiteral(workletSrc, 'PE_RATE');
const peTab = extractLiteral(workletSrc, 'PE_TAB');
const algorithms = extractLiteral(workletSrc, 'ALGORITHMS');
const outputLevels = extractLiteral(engineSrc, 'OUTPUT_LEVEL_TABLE');

// ---- sanity checks: shapes the C++ port hard-codes -------------------------
if (algorithms.length !== 32) throw new Error('expected 32 algorithms, got ' + algorithms.length);
if (lfoPitchMod.length !== 8) throw new Error('expected 8 LFO_PITCH_MOD entries');
const MAX_MODS = 3; // widest modulationMatrix row across the 32 algorithms
for (const [i, a] of algorithms.entries()) {
  if (a.modulationMatrix.length !== 6) throw new Error('algorithm ' + (i + 1) + ': bad matrix');
  if (a.outputMix.length > 6) throw new Error('algorithm ' + (i + 1) + ': outputMix too wide');
  for (const row of a.modulationMatrix) {
    if (row.length > MAX_MODS) {
      throw new Error('algorithm ' + (i + 1) + ': modulator row wider than ' +
        MAX_MODS + ' — widen kMaxModulators in DX7Voice.h');
    }
  }
}

const BANNER = (srcNames) =>
  '// GENERATED FILE — do not edit by hand.\n' +
  '// Emitted by tools/fm-au-plugin/scripts/gen-tables.cjs from\n' +
  srcNames.map((s) => '//   tools/audio-common/' + s + '\n').join('') +
  '// Re-run that script if the JS reference tables change.\n\n';

// ---- DX7Tables.inc --------------------------------------------------------
let dsp = BANNER(['dx7-worklet.js']);
dsp += emitArray('int', 'kEnvOutLevel', envOutLevel, 20);
dsp += '\n' + emitArray('double', 'kLfoFreq', lfoFreq, 6);
dsp += '\n' + emitArray('double', 'kLfoPitchMod', lfoPitchMod, 8);
dsp += '\n' + emitArray('int', 'kPeRate', peRate, 20);
dsp += '\n' + emitArray('int', 'kPeTab', peTab, 20);

// Algorithms flatten to fixed-width rows plus counts; see Algorithm in DX7Voice.h.
const algoRows = algorithms.map((a, i) => {
  const mix = a.outputMix.slice();
  const mixPad = mix.concat(new Array(6 - mix.length).fill(0));
  const counts = a.modulationMatrix.map((r) => r.length);
  const matrix = a.modulationMatrix.map((r) => {
    const padded = r.concat(new Array(MAX_MODS - r.length).fill(0));
    return '{' + padded.join(',') + '}';
  });
  return '    // algorithm ' + (i + 1) + '\n' +
    '    { ' + mix.length + ', {' + mixPad.join(',') + '}, {' + counts.join(',') + '},\n' +
    '      {' + matrix.join(', ') + '} },';
});
dsp += '\nconst Algorithm kAlgorithms[32] = {\n' + algoRows.join('\n') + '\n};\n';

fs.writeFileSync(path.join(OUT_DIR, 'DX7Tables.inc'), dsp);

// ---- DX7OutputLevels.inc -------------------------------------------------
const lvl = BANNER(['fm-engine.cjs']) +
  emitArray('double', 'kOutputLevelTable', outputLevels, 5);
fs.writeFileSync(path.join(OUT_DIR, 'DX7OutputLevels.inc'), lvl);

console.log('wrote Source/generated/DX7Tables.inc       (' +
  [envOutLevel, lfoFreq, lfoPitchMod, peRate, peTab].map((a) => a.length).join('/') +
  ' entries, 32 algorithms)');
console.log('wrote Source/generated/DX7OutputLevels.inc (' + outputLevels.length + ' entries)');
