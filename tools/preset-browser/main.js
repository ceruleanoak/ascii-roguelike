const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');

const AUDIO_COMMON = path.join(__dirname, '..', 'audio-common');
const Syx = require('../audio-common/syx.cjs');
const DEXED_CARTRIDGES = path.join(os.homedir(),
  'Library', 'Application Support', 'DigitalSuburban', 'Dexed', 'Cartridges');

// ───────────────────────── voice index (parsed once, cached) ─────────────────
// Identity = content hash of VCED params [0..144] (excludes the 10 name bytes),
// so re-labeled duplicate patches across banks collapse to one `pid`.
let voiceIndexCache = null;
const bankCache = new Map(); // bankPath -> parseSyx result

function pidOf(params) {
  return crypto.createHash('sha1').update(Buffer.from(params.slice(0, 145))).digest('hex').slice(0, 16);
}

function buildVoiceIndex(rootDir) {
  const root = rootDir || DEXED_CARTRIDGES;
  const banks = [];
  const pidMap = new Map(); // pid -> { pid, n, c, b, i }  (representative location + count)
  let scanned = 0, failed = 0, total = 0;
  (function walk(dir) {
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.name === '.DS_Store') continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { walk(full); continue; }
      if (!/\.syx$/i.test(e.name)) continue;
      scanned++;
      try {
        const res = Syx.parseSyx(fs.readFileSync(full));
        if (!res.count) { failed++; continue; }
        const b = banks.length;
        banks.push({ path: full, rel: path.relative(root, full) });
        for (const v of res.voices) {
          total++;
          const pid = pidOf(v.params);
          let entry = pidMap.get(pid);
          if (!entry) { entry = { pid: pid, n: v.name, c: 0, b: b, i: v.index }; pidMap.set(pid, entry); }
          entry.c++;
        }
      } catch { failed++; }
    }
  })(root);
  const voices = [...pidMap.values()];
  voices.sort((a, b) => a.n.toLowerCase().localeCompare(b.n.toLowerCase()) || a.pid.localeCompare(b.pid));
  return { root, banks, voices, scanned, failed, total, unique: voices.length };
}

ipcMain.handle('index-all', async (_e, opts) => {
  if (!voiceIndexCache || (opts && opts.refresh)) voiceIndexCache = buildVoiceIndex();
  return voiceIndexCache;
});

ipcMain.handle('load-voice', async (_e, bankPath, voiceIndex) => {
  let res = bankCache.get(bankPath);
  if (!res) { res = Syx.parseSyx(await fs.promises.readFile(bankPath)); bankCache.set(bankPath, res); }
  const v = res.voices[voiceIndex];
  if (!v) throw new Error('voice ' + voiceIndex + ' not found in ' + bankPath);
  return { params: v.params, struct: v.struct, name: v.name };
});

// ───────────────────────── library metadata store ────────────────────────────
// git-trackable JSON in tools/preset-browser/library/. Flat files for favorites/
// tags/notes/derived/features/taxonomy; collections/** are a path-escaped tree
// (folders = nesting), mirroring sfx-editor's template store.
const LIBRARY_DIR = path.join(__dirname, 'library');
const COLLECTIONS_DIR = path.join(LIBRARY_DIR, 'collections');

function libFile(name) { return path.join(LIBRARY_DIR, name); }
function readJSON(file, def) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return def; } }
function writeJSON(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  var tmp = file + '.tmp';                       // atomic write: tmp + rename, so a crash mid-write can't corrupt the file
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

function resolveCollectionPath(relPath) {
  let rel = String(relPath).trim().replace(/^\/+|\/+$/g, '');
  if (!rel.endsWith('.json')) rel += '.json';
  const abs = path.resolve(COLLECTIONS_DIR, rel);
  if (abs !== COLLECTIONS_DIR && !abs.startsWith(COLLECTIONS_DIR + path.sep)) {
    throw new Error('collection path escapes collections/: ' + relPath);
  }
  return abs;
}
function listCollections(dir, prefix) {
  dir = dir || COLLECTIONS_DIR; prefix = prefix || '';
  let out = [], entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const e of entries) {
    if (e.isDirectory()) out = out.concat(listCollections(path.join(dir, e.name), prefix + e.name + '/'));
    else if (e.name.endsWith('.json')) out.push(prefix + e.name.slice(0, -5));
  }
  return out;
}

ipcMain.handle('library-load', async () => ({
  favorites: readJSON(libFile('favorites.json'), []),
  tags: readJSON(libFile('tags.json'), {}),
  notes: readJSON(libFile('notes.json'), {}),
  ratings: readJSON(libFile('ratings.json'), {}),
  derived: readJSON(libFile('derived-tags.json'), {}),
  taxonomy: readJSON(libFile('taxonomy.json'), {}),
  collections: listCollections()
}));
ipcMain.handle('features-load', async () => readJSON(libFile('features.json'), {}));
ipcMain.handle('favorites-save', async (_e, arr) => { writeJSON(libFile('favorites.json'), arr); return { ok: true }; });
ipcMain.handle('tags-save', async (_e, map) => { writeJSON(libFile('tags.json'), map); return { ok: true }; });
ipcMain.handle('notes-save', async (_e, map) => { writeJSON(libFile('notes.json'), map); return { ok: true }; });
ipcMain.handle('ratings-save', async (_e, map) => { writeJSON(libFile('ratings.json'), map); return { ok: true }; });

ipcMain.handle('collection-list', async () => listCollections());
ipcMain.handle('collection-load', async (_e, rel) => JSON.parse(await fs.promises.readFile(resolveCollectionPath(rel), 'utf8')));
ipcMain.handle('collection-save', async (_e, rel, data) => {
  const abs = resolveCollectionPath(rel);
  await fs.promises.mkdir(path.dirname(abs), { recursive: true });
  await fs.promises.writeFile(abs, JSON.stringify(data, null, 2));
  return { ok: true };
});
ipcMain.handle('collection-delete', async (_e, rel) => { await fs.promises.unlink(resolveCollectionPath(rel)); return { ok: true }; });

// ───────────────────────── render bridge ─────────────────────────────────────
ipcMain.handle('pick-output-dir', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: 'Choose output folder for rendered WAVs',
    properties: ['openDirectory', 'createDirectory']
  });
  return (canceled || !filePaths.length) ? null : filePaths[0];
});
ipcMain.handle('write-wav', async (_e, filePath, bytes) => {
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  await fs.promises.writeFile(filePath, Buffer.from(bytes));
  return { ok: true, path: filePath };
});

// ───────────────────────── shared sources + .syx open ────────────────────────
// Return the shared library + worklet sources as strings so the renderer can
// inject them inline (avoids cross-dir file:// <script src> + .cjs MIME issues).
ipcMain.handle('sources', async () => ({
  syx: await fs.promises.readFile(path.join(AUDIO_COMMON, 'syx.cjs'), 'utf8'),
  fmEngine: await fs.promises.readFile(path.join(AUDIO_COMMON, 'fm-engine.cjs'), 'utf8'),
  msfaEngine: await fs.promises.readFile(path.join(AUDIO_COMMON, 'msfa-engine.cjs'), 'utf8'),
  worklet: await fs.promises.readFile(path.join(AUDIO_COMMON, 'dx7-worklet.js'), 'utf8')
}));

// Vendored WebDX7 (msfa) worklet scripts — loaded as Blob modules by msfa-engine.
const WEBDX7 = path.join(AUDIO_COMMON, 'vendor', 'webdx7');
ipcMain.handle('msfa-sources', async () => ({
  wasm: await fs.promises.readFile(path.join(WEBDX7, 'dx7.wasm.js'), 'utf8'),
  dx7: await fs.promises.readFile(path.join(WEBDX7, 'dx7.js'), 'utf8'),
  wamproc: await fs.promises.readFile(path.join(WEBDX7, 'wam-processor.js'), 'utf8'),
  awp: await fs.promises.readFile(path.join(WEBDX7, 'dx7-awp.js'), 'utf8')
}));

ipcMain.handle('open-syx', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: 'Open DX7 .syx bank or voice',
    defaultPath: fs.existsSync(DEXED_CARTRIDGES) ? DEXED_CARTRIDGES : undefined,
    properties: ['openFile'],
    filters: [{ name: 'SysEx', extensions: ['syx', 'SYX'] }]
  });
  if (canceled || !filePaths.length) return null;
  const buf = await fs.promises.readFile(filePaths[0]);
  return { name: path.basename(filePaths[0]), path: filePaths[0], bytes: Array.from(buf) };
});

function createWindow() {
  const win = new BrowserWindow({
    width: 1280, height: 820, title: 'DX7 Preset Browser',
    backgroundColor: '#15151b',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });
  win.loadFile('index.html');
  win.setMenuBarVisibility(false);
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
