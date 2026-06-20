#!/usr/bin/env node
// syx-dump — inspect DX7 .syx files with the syx.cjs parser.
// Usage: node syx-dump.cjs <file-or-dir> [--names]
var fs = require('fs');
var path = require('path');
var S = require('./syx.cjs');

var target = process.argv[2];
var showNames = process.argv.includes('--names');
if (!target) { console.error('usage: node syx-dump.cjs <file-or-dir> [--names]'); process.exit(2); }

function syxFiles(p) {
  var st = fs.statSync(p);
  if (st.isFile()) return /\.syx$/i.test(p) ? [p] : [];
  var out = [];
  for (var e of fs.readdirSync(p)) {
    if (e === '.DS_Store') continue;
    out = out.concat(syxFiles(path.join(p, e)));
  }
  return out;
}

var files = syxFiles(target);
var totalVoices = 0, totalWarn = 0, failed = 0;
for (var f of files) {
  var bytes = fs.readFileSync(f);
  var r;
  try { r = S.parseSyx(bytes); }
  catch (err) { console.log('✗ ' + path.relative(target, f) + '  ERROR: ' + err.message); failed++; continue; }
  totalVoices += r.count;
  totalWarn += r.warnings.length;
  var rel = path.relative(target, f) || path.basename(f);
  var line = (r.count ? '✓' : '✗') + ' ' + rel + '  [' + r.type + ', ' + r.count + ' voices, ' + bytes.length + ' B]';
  if (r.warnings.length) line += '  ⚠ ' + r.warnings.join('; ');
  console.log(line);
  if (showNames && r.count) {
    console.log('    ' + r.voices.map(function (v) { return v.name; }).join(' | '));
  }
}
console.log('\n' + files.length + ' files, ' + totalVoices + ' voices, ' + totalWarn + ' warnings, ' + failed + ' errors');
