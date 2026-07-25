#!/usr/bin/env node
// export-library.cjs — turn the preset-browser library into Logic's own preset tree.
//
// Logic reads ~/Library/Audio/Presets/<manufacturer>/<plugin>/ and renders
// subfolders as submenus in the plugin header's "AU Presets" menu. So the
// library's curation becomes the browsing structure, in host-drawn chrome, with
// no GUI in the plugin and no duplicated browser.
//
// preset-browser remains the only thing that WRITES favorites/ratings/tags. This
// only reads them. Re-run it whenever curation changes.
//
//   node scripts/export-library.cjs                  # Favorites/ + Rated */
//   node scripts/export-library.cjs --inst --class   # ...plus Instrument/ and Class/
//   node scripts/export-library.cjs --dry-run        # count what would be written
//
// Flags: --inst  --class  --author  --all  --limit N  --out DIR  --dry-run  --clean

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const TOOLS = path.join(__dirname, '..', '..');
const S = require(path.join(TOOLS, 'audio-common', 'syx.cjs'));
const LIB = path.join(TOOLS, 'preset-browser', 'library');
const CARTRIDGES = path.join(os.homedir(),
  'Library', 'Application Support', 'DigitalSuburban', 'Dexed', 'Cartridges');

// Must match Info.plist / CMakeLists.txt, and the folder names Logic derives from
// the AudioComponents `name` field ("CeruleanOak: FMVoice").
const AU_TYPE = 'aumu';
const AU_SUBTYPE = 'Fmv1';
const AU_MANUFACTURER = 'Cok1';
const VCED_STATE_KEY = 'vcedData';
const DEFAULT_OUT = path.join(os.homedir(),
  'Library', 'Audio', 'Presets', 'CeruleanOak', 'FMVoice');

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const valueOf = (f, dflt) => {
  const i = argv.indexOf(f);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : dflt;
};
const OUT = valueOf('--out', DEFAULT_OUT);
const LIMIT = parseInt(valueOf('--limit', '250'), 10); // per generated folder
const DRY = has('--dry-run');
const ALL = has('--all');
const WANT = {
  inst: ALL || has('--inst'),
  cls: ALL || has('--class'),
  author: ALL || has('--author')
};

const readJSON = (f, dflt) => {
  try { return JSON.parse(fs.readFileSync(path.join(LIB, f), 'utf8')); } catch { return dflt; }
};

// ---- resolve pid -> voice ---------------------------------------------------
// Identity must match preset-browser/main.js pidOf(): sha1 over VCED params
// [0..144], excluding the 10 name bytes, so re-labeled duplicates collapse.
const pidOf = (params) =>
  crypto.createHash('sha1').update(Buffer.from(params.slice(0, 145))).digest('hex').slice(0, 16);

function indexCartridges(root) {
  const byPid = new Map();
  (function walk(dir) {
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.name === '.DS_Store') continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { walk(full); continue; }
      if (!/\.syx$/i.test(e.name)) continue;
      try {
        for (const v of S.parseSyx(fs.readFileSync(full)).voices) {
          const pid = pidOf(v.params);
          if (!byPid.has(pid)) byPid.set(pid, { name: v.name, params: v.params });
        }
      } catch { /* unreadable bank — preset-browser skips these too */ }
    }
  })(root);
  return byPid;
}

// ---- .aupreset --------------------------------------------------------------
const fourCC = (s) =>
  (s.charCodeAt(0) << 24) | (s.charCodeAt(1) << 16) | (s.charCodeAt(2) << 8) | s.charCodeAt(3);
const escapeXml = (s) =>
  String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

function aupreset(name, params) {
  const data = Buffer.from(params.map((n) => n & 0x7f)).toString('base64');
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

// Folder and file names go into a menu, so keep them legible; only strip what the
// filesystem or Logic would choke on.
const safe = (s) => (String(s).replace(/[/\\:]/g, '-').replace(/\s+/g, ' ').trim() || 'unnamed');

let written = 0;
const usedPerDir = new Map();

function emit(folder, pid, voice) {
  const dir = path.join(OUT, folder);
  let base = safe(voice.name || 'unnamed');
  const seen = usedPerDir.get(dir) || new Set();
  // Distinct patches often share a name across banks; keep both, disambiguated.
  if (seen.has(base.toLowerCase())) base += ' (' + pid.slice(0, 6) + ')';
  seen.add(base.toLowerCase());
  usedPerDir.set(dir, seen);
  written++;
  if (DRY) return;
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, base + '.aupreset'), aupreset(voice.name || base, voice.params));
}

// ---- build ------------------------------------------------------------------
const favorites = readJSON('favorites.json', []);
const ratings = readJSON('ratings.json', {});
const tags = readJSON('tags.json', {});
const derived = readJSON('derived-tags.json', {});

console.log('indexing cartridges…');
const byPid = indexCartridges(CARTRIDGES);
console.log('  ' + byPid.size + ' unique patches on disk');

const missing = [];
const resolve = (pid) => {
  const v = byPid.get(pid);
  if (!v) missing.push(pid);
  return v;
};

// Favorites — the primary curated set.
for (const pid of favorites) {
  const v = resolve(pid);
  if (v) emit('Favorites', pid, v);
}

// Ratings — one folder per star value, highest first in the menu via the name.
for (const [pid, stars] of Object.entries(ratings)) {
  const v = resolve(pid);
  if (v) emit('Rated ' + stars + ' star' + (stars === 1 ? '' : 's'), pid, v);
}

// Manual tags (empty today, but exported if you start using them).
for (const [pid, list] of Object.entries(tags)) {
  const v = resolve(pid);
  if (!v) continue;
  for (const t of list) emit(path.join('Tags', safe(t)), pid, v);
}

// Derived dimensions are large, so they are opt-in and capped per folder.
if (WANT.inst || WANT.cls || WANT.author) {
  const buckets = new Map(); // folder -> [pid]
  for (const [pid, list] of Object.entries(derived)) {
    for (const t of list) {
      const [dim, ...rest] = t.split(':');
      const label = rest.join(':');
      if (!label) continue;
      if (dim === 'inst' && !WANT.inst) continue;
      if (dim === 'class' && !WANT.cls) continue;
      if (dim === 'author' && !WANT.author) continue;
      if (!['inst', 'class', 'author'].includes(dim)) continue;
      const folder = path.join(
        { inst: 'Instrument', class: 'Class', author: 'Author' }[dim], safe(label));
      if (!buckets.has(folder)) buckets.set(folder, []);
      buckets.get(folder).push(pid);
    }
  }
  for (const [folder, pids] of buckets) {
    let n = 0;
    for (const pid of pids) {
      if (n >= LIMIT) break;
      const v = byPid.get(pid);
      if (!v) continue;
      emit(folder, pid, v);
      n++;
    }
  }
}

if (has('--clean') && !DRY) console.log('(--clean removes nothing yet; delete ' + OUT + ' by hand)');

console.log('\n' + (DRY ? 'would write ' : 'wrote ') + written + ' .aupreset files' +
  (DRY ? '' : ' to ' + OUT));
const folders = [...usedPerDir.keys()].map((d) => path.relative(OUT, d)).sort();
console.log('folders (' + folders.length + '): ' + folders.slice(0, 12).join(', ') +
  (folders.length > 12 ? ', …' : ''));
if (missing.length) {
  console.log('\n' + missing.length + ' curated pid(s) not found on disk — those patches came ' +
    'from banks no longer in ' + CARTRIDGES);
}
