#!/usr/bin/env node
// analyze-library.cjs — data-driven classification of the DX7 library.
// Dedups by content hash, extracts synthesis features, z-normalizes, k-means
// clusters, then LABELS each cluster from the voice names that fall in it (names
// only label the data-derived groups — they don't drive the features). Writes
// derived-tags.json / features.json / taxonomy.json into preset-browser/library/.
//
// Usage: node tools/audio-common/analyze-library.cjs [cartridgesDir] [k]
var fs = require('fs'), path = require('path'), crypto = require('crypto');
var S = require('./syx.cjs'), F = require('./features.cjs');

var ROOT = process.argv[2] || path.join(require('os').homedir(),
  'Library', 'Application Support', 'DigitalSuburban', 'Dexed', 'Cartridges');
var K = parseInt(process.argv[3], 10) || 16;
var OUT = path.join(__dirname, '..', 'preset-browser', 'library');

function pidOf(p) { return crypto.createHash('sha1').update(Buffer.from(p.slice(0, 145))).digest('hex').slice(0, 16); }

// ---- collect unique patches + features ----
var uniq = new Map(); // pid -> { names:Set, banks:Set, raw:[] }
var t0 = Date.now(), total = 0;
(function walk(d) {
  for (var e of fs.readdirSync(d, { withFileTypes: true })) {
    if (e.name === '.DS_Store') continue;
    var full = path.join(d, e.name);
    if (e.isDirectory()) { walk(full); continue; }
    if (!/\.syx$/i.test(e.name)) continue;
    try {
      var rel = path.relative(ROOT, full);
      var res = S.parseSyx(fs.readFileSync(full));
      for (var v of res.voices) {
        total++;
        var pid = pidOf(v.params);
        var u = uniq.get(pid);
        if (!u) { u = { names: new Set(), paths: new Set(), raw: F.extractRaw(v.struct), play: F.playability(v.struct), desc: F.descriptors(v.struct) }; uniq.set(pid, u); }
        if (v.name && v.name.trim()) u.names.add(v.name.trim());
        u.paths.add(rel);
      }
    } catch (x) {}
  }
})(ROOT);

var pids = [...uniq.keys()];
var X = pids.map(function (p) { return uniq.get(p).raw.slice(); });
var dim = X[0].length, n = X.length;
console.log('unique=' + n + ' / total=' + total + ' voices, ' + dim + ' features, in ' + (Date.now() - t0) + 'ms');

// ---- z-normalize ----
var mean = new Array(dim).fill(0), std = new Array(dim).fill(0);
for (var j = 0; j < dim; j++) { for (var i = 0; i < n; i++) mean[j] += X[i][j]; mean[j] /= n; }
for (var j2 = 0; j2 < dim; j2++) { for (var i2 = 0; i2 < n; i2++) { var d = X[i2][j2] - mean[j2]; std[j2] += d * d; } std[j2] = Math.sqrt(std[j2] / n) || 1; }
var Z = X.map(function (row) { return row.map(function (val, j) { return (val - mean[j]) / std[j]; }); });

// ---- k-means (deterministic init: evenly spaced after a stable sort) ----
function dist2(a, b) { var s = 0; for (var i = 0; i < a.length; i++) { var d = a[i] - b[i]; s += d * d; } return s; }
var order = Z.map(function (_, i) { return i; }).sort(function (a, b) { return Z[a][0] - Z[b][0] || a - b; });
var centroids = [];
for (var c = 0; c < K; c++) centroids.push(Z[order[Math.floor(c * (n - 1) / (K - 1))]].slice());
var assign = new Array(n).fill(0);
for (var iter = 0; iter < 20; iter++) {
  var moved = 0;
  for (var i3 = 0; i3 < n; i3++) {
    var best = 0, bd = Infinity;
    for (var k = 0; k < K; k++) { var dd = dist2(Z[i3], centroids[k]); if (dd < bd) { bd = dd; best = k; } }
    if (assign[i3] !== best) { assign[i3] = best; moved++; }
  }
  var sums = [], cnts = new Array(K).fill(0);
  for (var k2 = 0; k2 < K; k2++) sums.push(new Array(dim).fill(0));
  for (var i4 = 0; i4 < n; i4++) { var a = assign[i4]; cnts[a]++; for (var j3 = 0; j3 < dim; j3++) sums[a][j3] += Z[i4][j3]; }
  for (var k3 = 0; k3 < K; k3++) if (cnts[k3]) for (var j4 = 0; j4 < dim; j4++) centroids[k3][j4] = sums[k3][j4] / cnts[k3];
  if (!moved) break;
}

// ---- label clusters by their FEATURE signature (data-driven; names proved too
//      noisy to label synthesis clusters — they describe instruments, not timbre) ----
function labelFromCentroid(ctr) {
  var fracFixed = ctr[2], bright = ctr[3], inharm = ctr[6], attack = ctr[7],
      sustain = ctr[8], detune = ctr[10], vib = ctr[11], reg = ctr[14];
  var parts = [];
  if (reg <= -6) parts.push('low'); else if (reg >= 6) parts.push('high');
  if (inharm > 0.3 || fracFixed > 0.25) parts.push('metallic');
  else if (bright > 1.1) parts.push('bright'); else if (bright < 0.4) parts.push('mellow');
  if (attack > 78 && sustain < 45) parts.push('pluck');
  else if (sustain > 62) parts.push('sustained');
  else parts.push('decay');
  if (detune > 3) parts.push('wide');
  if (vib > 18) parts.push('vibrato');
  return parts.join('-') || 'tonal';
}
var clusterLabel = [];
for (var k4 = 0; k4 < K; k4++) {
  var ctr = centroids[k4].map(function (z, j) { return z * std[j] + mean[j]; });
  clusterLabel[k4] = labelFromCentroid(ctr);
}
// disambiguate duplicate labels
var seen = {};
for (var k5 = 0; k5 < K; k5++) { var lb = clusterLabel[k5]; if (seen[lb] !== undefined) { seen[lb]++; clusterLabel[k5] = lb + '-' + seen[lb]; } else seen[lb] = 1; }

// ---- real-world instrument (from the name corpus — author's stated intent) ----
var INST = [
  [/rhodes|wurli|\be\.?\s?p(iano)?\b|elec.*piano|dx.?rhod/i, 'electric-piano'],
  [/\bpiano|\bgrand\b|acou.*piano/i, 'piano'],
  [/\bclav/i, 'clav'],
  [/organ|hammond|drawbar|b-?3\b|pipe/i, 'organ'],
  [/string|violin|cello|viola|\borch/i, 'strings'],
  [/brass|trumpet|trombone|\bhorn|tuba|fanfare|flugel/i, 'brass'],
  [/\bsax|oboe|clarinet|bassoon|flute|picc|\bwind\b|recorder|pan.?flute/i, 'woodwind'],
  [/\bbass\b|fretless|slap|upright|sub ?bass/i, 'bass'],
  [/guitar|\bgtr|strat|nylon|steel ?str/i, 'guitar'],
  [/bell|tubular|chime|glock|celest|carillon/i, 'bells'],
  [/vibe|marimba|xylo|kalimba|\bkoto|mallet|santur|sitar|\bharp\b|steel ?drum/i, 'tuned-perc'],
  [/drum|snare|kick|\bhat\b|hi-?hat|\btom\b|clap|cymbal|conga|bongo|\bperc/i, 'drums'],
  [/choir|voice|\bvox\b|vocal|\baah|\booh/i, 'voice'],
  [/accord/i, 'accordion'], [/harmonica/i, 'harmonica'], [/whistl/i, 'whistle'],
  [/\bpad\b|sweep|\bspace|atmos|warm ?str/i, 'pad'],
  [/\blead\b|syn.?lead|saw ?lead|solo ?syn/i, 'lead']
];
function instOf(names) {
  var tally = {};
  names.forEach(function (nm) { for (var p = 0; p < INST.length; p++) if (INST[p][0].test(nm)) { tally[INST[p][1]] = (tally[INST[p][1]] || 0) + 1; break; } });
  return Object.keys(tally).sort(function (a, b) { return tally[b] - tally[a]; }).slice(0, 2);
}

// ---- author / source (from the cartridge folder layout) ----
function provenance(paths) {
  var sources = new Set(), authors = new Set();
  paths.forEach(function (rel) {
    var segs = rel.split('/');
    if (segs.length === 1) {
      if (/^rom\d|^dx5/i.test(segs[0])) { sources.add('Yamaha-ROM'); authors.add('Yamaha'); }
      else sources.add('loose');
      return;
    }
    var top = segs[0];
    if (top === '3221-Dexed_cart_1') { if (segs[1] && segs[1][0] !== '!') authors.add(segs[1]); }
    else { sources.add(top); authors.add(top); }
  });
  return { sources: [...sources].slice(0, 6), authors: [...authors].slice(0, 4) };
}

// ---- write outputs ----
var derived = {}, features = {}, taxonomy = {};
for (var i6 = 0; i6 < n; i6++) {
  var pid = pids[i6], u6 = uniq.get(pid);
  var tags = ['class:' + clusterLabel[assign[i6]]];
  u6.desc.forEach(function (f) { tags.push('flag:' + f); });
  if (u6.play.silent) tags.push('flag:silent');
  if (u6.play.slow) tags.push('flag:slow-attack');
  var names6 = [...u6.names];
  if (!names6.length || !names6.some(function (x) { return !F.isBadName(x); })) tags.push('flag:no-name');
  instOf(names6).forEach(function (it) { tags.push('inst:' + it); });
  provenance([...u6.paths]).authors.forEach(function (a) { tags.push('author:' + a); }); // source dropped: 90% in one pack
  derived[pid] = tags;
  features[pid] = Z[i6].map(function (x) { return Math.round(x * 1000) / 1000; });
}
for (var k6 = 0; k6 < K; k6++) {
  var members = [];
  for (var i7 = 0; i7 < n && members.length < 8; i7++) if (assign[i7] === k6) { var nm = [...uniq.get(pids[i7]).names][0]; if (nm) members.push(nm); }
  taxonomy[clusterLabel[k6]] = { count: assign.filter(function (a) { return a === k6; }).length, exemplars: members };
}
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'derived-tags.json'), JSON.stringify(derived));
fs.writeFileSync(path.join(OUT, 'features.json'), JSON.stringify(features));
fs.writeFileSync(path.join(OUT, 'taxonomy.json'), JSON.stringify(taxonomy, null, 2));
console.log('clusters:'); Object.keys(taxonomy).sort().forEach(function (l) { console.log('  ' + l + ' (' + taxonomy[l].count + '): ' + taxonomy[l].exemplars.slice(0, 5).join(', ')); });
console.log('wrote derived-tags.json, features.json, taxonomy.json → ' + OUT);
