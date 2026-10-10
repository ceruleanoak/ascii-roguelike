const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

// Dungeon layout editor — three edit modes, one tool (plan Phase 1, see
// ~/.claude/plans/need-a-dungeon-layout-parallel-haven.md; Puzzle mode added
// later for the generic puzzle-room authoring pathway):
//   Interior: 24×24 floor-template painter (src/data/dungeon/floorTemplates/*.json)
//   Exterior: 30×30 zone-design painter    (src/data/dungeon/designs/*.json)
//   Puzzle:   24×24 puzzle-room painter    (src/data/dungeon/puzzleTemplates/*.json)
// Structure mirrors tools/sfx-editor/ (main.js/preload.js/index.html) and
// borrows tools/preset-browser/'s improvements: no own electron devDependency
// (see package.json's start script), atomic writes, a static (not
// self-regenerating) preload.js.

const DATA_ROOT = path.join(__dirname, '..', '..', 'src', 'data', 'dungeon');
const FLOOR_TEMPLATES_DIR = path.join(DATA_ROOT, 'floorTemplates');
const DESIGNS_DIR = path.join(DATA_ROOT, 'designs');
const PUZZLE_TEMPLATES_DIR = path.join(DATA_ROOT, 'puzzleTemplates');
const FOOTPRINT_CONTRACT_FILE = path.join(DATA_ROOT, 'footprintContract.json');

// Puzzle rooms are a fixed 24×24, same as floor-template interiors, but a
// wholly separate grid — no footprint contract, no reserved cells (a puzzle
// room's exit is wherever its author places the single 'X' marker, not the
// numbered-floor spine position).
const PUZZLE_COLS = 24;
const PUZZLE_ROWS = 24;

// Exterior designs are a fixed set, one per zone — not a free collection.
const DESIGN_COLS = 30;
const DESIGN_ROWS = 30;

// Pedestal weaponChar validation calls the game's own pickWeaponTutorial
// (weaponTutorials.js) live, via Node's dynamic import() of that ES module
// from this CommonJS main process — hand-duplicating the item catalog here would
// silently drift from the game's actual weapons, and the editor would accept
// a pedestal the runtime then skips. import() works regardless of the
// importer's module type; the module resolves as ESM from the project
// root's own package.json ("type": "module"). Cached after first load since
// the item data has no reason to change mid-session.
let _weaponTutorialsModulePromise = null;
function loadWeaponTutorialsModule() {
  if (!_weaponTutorialsModulePromise) {
    const modulePath = path.join(__dirname, '..', '..', 'src', 'data', 'dungeon', 'weaponTutorials.js');
    _weaponTutorialsModulePromise = import(pathToFileURL(modulePath).href);
  }
  return _weaponTutorialsModulePromise;
}

function readJSON(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJSONAtomic(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';           // atomic write: tmp + rename, so a crash mid-write can't corrupt the file
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n');
  fs.renameSync(tmp, file);
}

// Templates register themselves by file name (import.meta.glob), so a file
// can be renamed or deleted freely — unless game code names it as a string
// literal ('open' is the floor fallback, 'whip_trial' the puzzle fallback).
// Returns the src/ .js files that do, relative to the project root; a rename
// or delete is refused while the list is non-empty, so it can't strand a
// lookup that would then fall through silently.
const SRC_ROOT = path.join(__dirname, '..', '..', 'src');
function codeReferencesTo(name) {
  const needles = ["'" + name + "'", '"' + name + '"', '`' + name + '`'];
  const hits = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) walk(abs);
      else if (e.name.endsWith('.js')) {
        const text = fs.readFileSync(abs, 'utf8');
        if (needles.some(n => text.includes(n))) hits.push(path.relative(path.join(SRC_ROOT, '..'), abs));
      }
    }
  };
  walk(SRC_ROOT);
  return hits;
}

// Shared rename/delete bodies for the two template collections.
function renameTemplate(resolvePath, oldName, newName) {
  const refs = codeReferencesTo(oldName);
  if (refs.length) return { ok: false, error: `"${oldName}" is named in code: ${refs.join(', ')}` };
  const from = resolvePath(oldName);
  const to = resolvePath(newName);
  if (fs.existsSync(to)) return { ok: false, error: `"${newName}" already exists` };
  fs.renameSync(from, to);
  return { ok: true };
}

function deleteTemplate(resolvePath, name) {
  const refs = codeReferencesTo(name);
  if (refs.length) return { ok: false, error: `"${name}" is named in code: ${refs.join(', ')}` };
  fs.unlinkSync(resolvePath(name));
  return { ok: true };
}

// ═══════════════════════════════════════════════════════════════
// Interior — floor templates (src/data/dungeon/floorTemplates/*.json)
// ═══════════════════════════════════════════════════════════════

function resolveFloorTemplatePath(name) {
  let rel = String(name).trim().replace(/^\/+|\/+$/g, '');
  if (!rel.endsWith('.json')) rel += '.json';
  const abs = path.resolve(FLOOR_TEMPLATES_DIR, rel);
  if (!abs.startsWith(FLOOR_TEMPLATES_DIR + path.sep)) {
    throw new Error('Template path escapes floorTemplates/: ' + name);
  }
  return abs;
}

function listFloorTemplates() {
  let entries = [];
  try { entries = fs.readdirSync(FLOOR_TEMPLATES_DIR, { withFileTypes: true }); } catch { return []; }
  return entries
    .filter(e => e.isFile() && e.name.endsWith('.json'))
    .map(e => e.name.slice(0, -5))
    .sort((a, b) => a.localeCompare(b));
}

// The footprint geometry lives in the game's own pure module
// (src/data/dungeon/footprints.js), loaded through the same dynamic import()
// as weaponTutorials.js above, so the editor and the runtime reserve exactly
// the same cells. Deliberately just the 4 single-cell footprints, no
// connecting corridor between them — see dungeonFloorTemplates.js's header.
let _footprintsModulePromise = null;
function loadFootprintsModule() {
  if (!_footprintsModulePromise) {
    _footprintsModulePromise = import(pathToFileURL(path.join(DATA_ROOT, 'footprints.js')).href);
  }
  return _footprintsModulePromise;
}

// The dungeon tile catalogue (src/data/dungeon/tiles.js) — which glyphs each
// template kind may contain, and how the palette paints them. Loaded from the
// game's own module, same as footprints.js above, so a tile added there shows
// up in the editor's palette and validation with no edit here.
let _tilesModulePromise = null;
function loadTilesModule() {
  if (!_tilesModulePromise) {
    _tilesModulePromise = import(pathToFileURL(path.join(DATA_ROOT, 'tiles.js')).href);
  }
  return _tilesModulePromise;
}

// Defense in depth against hand-edited files — the renderer already makes
// these cells non-paintable, but a save is re-validated here regardless.
async function validateFloorTemplate(data) {
  const allowed = (await loadTilesModule()).tileGlyphsForMode('floor');
  const contract = readJSON(FOOTPRINT_CONTRACT_FILE);
  const { cols, rows } = contract;
  if (!data || typeof data !== 'object') return 'Not an object.';
  if (!Number.isFinite(data.weight) || data.weight < 0) return 'weight must be a number >= 0.';
  if (!Array.isArray(data.grid) || data.grid.length !== rows) {
    return `grid must be an array of ${rows} rows.`;
  }
  for (let r = 0; r < rows; r++) {
    const line = data.grid[r];
    if (typeof line !== 'string' || [...line].length !== cols) {
      return `row ${r} must be exactly ${cols} chars.`;
    }
    for (const ch of line) {
      if (!allowed.includes(ch)) return `row ${r} has invalid char "${ch}" (only ${allowed.join(' ')} allowed).`;
    }
    const isBorderRow = r === 0 || r === rows - 1;
    if (isBorderRow && [...line].some(ch => ch !== '#')) return `row ${r} is a border row — every cell must be #.`;
  }
  for (let r = 1; r < rows - 1; r++) {
    if (data.grid[r][0] !== '#' || data.grid[r][cols - 1] !== '#') {
      return `row ${r} must have # at the left/right border columns.`;
    }
  }
  // No reserved-cell check here: applyTemplateToCollisionMap() in
  // src/data/dungeonFloorTemplates.js unconditionally skips stamping walls
  // on reserved cells at apply-time (`if (reserved.has(...)) continue;`), so
  // a '#' sitting on a reserved cell in the raw grid is inert, not invalid —
  // several of the shipped templates have exactly that from before this
  // contract existed. The editor still locks these cells from painting (see
  // index.html's isLockedInterior) as an authoring aid, but that's a UI
  // convenience, not a data invariant worth failing a save over.
  return null;
}

ipcMain.handle('footprint-contract-load', () => readJSON(FOOTPRINT_CONTRACT_FILE));
// Precomputed here (not re-derived in the renderer) so the reservation
// geometry has exactly one implementation in this whole tool.
ipcMain.handle('footprint-reserved-cells', async () => {
  const { reservedFootprintCells } = await loadFootprintsModule();
  return reservedFootprintCells(readJSON(FOOTPRINT_CONTRACT_FILE));
});
ipcMain.handle('dungeon-tiles-load', async () => (await loadTilesModule()).DUNGEON_TILES);
ipcMain.handle('floor-templates-list', () => listFloorTemplates());
ipcMain.handle('floor-template-load', (_e, name) => readJSON(resolveFloorTemplatePath(name)));

ipcMain.handle('floor-template-save', async (_e, name, data) => {
  const err = await validateFloorTemplate(data);
  if (err) return { ok: false, error: err };
  writeJSONAtomic(resolveFloorTemplatePath(name), data);
  return { ok: true };
});

ipcMain.handle('floor-template-delete', (_e, name) => deleteTemplate(resolveFloorTemplatePath, name));
ipcMain.handle('floor-template-rename', (_e, oldName, newName) =>
  renameTemplate(resolveFloorTemplatePath, oldName, newName));

// ═══════════════════════════════════════════════════════════════
// Exterior — zone designs (src/data/dungeon/designs/*.json)
// Fixed set (one per zone) — no new/clone/delete, only load/save.
// ═══════════════════════════════════════════════════════════════

function resolveDesignPath(zone) {
  let rel = String(zone).trim().replace(/^\/+|\/+$/g, '');
  if (!rel.endsWith('.json')) rel += '.json';
  const abs = path.resolve(DESIGNS_DIR, rel);
  if (!abs.startsWith(DESIGNS_DIR + path.sep)) {
    throw new Error('Design path escapes designs/: ' + zone);
  }
  return abs;
}

function listDesigns() {
  let entries = [];
  try { entries = fs.readdirSync(DESIGNS_DIR, { withFileTypes: true }); } catch { return []; }
  return entries
    .filter(e => e.isFile() && e.name.endsWith('.json'))
    .map(e => e.name.slice(0, -5))
    .sort((a, b) => a.localeCompare(b));
}

function validateDesign(data) {
  if (!data || typeof data !== 'object') return 'Not an object.';
  if (typeof data.wallColor !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(data.wallColor)) {
    return 'wallColor must be a #rrggbb hex string.';
  }
  if (typeof data.doorColor !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(data.doorColor)) {
    return 'doorColor must be a #rrggbb hex string.';
  }
  if (!Array.isArray(data.grid) || data.grid.length !== DESIGN_ROWS) {
    return `grid must be an array of ${DESIGN_ROWS} rows.`;
  }
  // No per-row exact-length check: RoomGenerator.generateDungeonRoom() walks
  // `row.length` per row, not a fixed DESIGN_COLS — several shipped designs
  // have hand-authored rows a char short or long (e.g. yellow's 9-wide
  // entrance), and the game already renders those correctly. DESIGN_COLS is
  // this editor's canvas width, not a data invariant.
  let doorCount = 0;
  for (let r = 0; r < DESIGN_ROWS; r++) {
    const line = data.grid[r];
    if (typeof line !== 'string') return `row ${r} must be a string.`;
    for (const ch of line) if (ch === '∩') doorCount++;
  }
  if (doorCount !== 1) return `grid must contain exactly one door (∩) — found ${doorCount}.`;
  return null;
}

ipcMain.handle('designs-list', () => listDesigns());
ipcMain.handle('design-load', (_e, zone) => readJSON(resolveDesignPath(zone)));

ipcMain.handle('design-save', (_e, zone, data) => {
  const err = validateDesign(data);
  if (err) return { ok: false, error: err };
  writeJSONAtomic(resolveDesignPath(zone), data);
  return { ok: true };
});

// ═══════════════════════════════════════════════════════════════
// Puzzle — puzzle-room templates (src/data/dungeon/puzzleTemplates/*.json)
// Grid + a trigger list (switches/floor panels/torches), consumed at
// runtime by DungeonFloorGenerator.generatePuzzleRoom / DungeonPuzzleSystem.
// ═══════════════════════════════════════════════════════════════

function resolvePuzzleTemplatePath(name) {
  let rel = String(name).trim().replace(/^\/+|\/+$/g, '');
  if (!rel.endsWith('.json')) rel += '.json';
  const abs = path.resolve(PUZZLE_TEMPLATES_DIR, rel);
  if (!abs.startsWith(PUZZLE_TEMPLATES_DIR + path.sep)) {
    throw new Error('Template path escapes puzzleTemplates/: ' + name);
  }
  return abs;
}

function listPuzzleTemplates() {
  let entries = [];
  try { entries = fs.readdirSync(PUZZLE_TEMPLATES_DIR, { withFileTypes: true }); } catch { return []; }
  return entries
    .filter(e => e.isFile() && e.name.endsWith('.json'))
    .map(e => e.name.slice(0, -5))
    .sort((a, b) => a.localeCompare(b));
}

// Defense in depth against hand-edited files — the renderer already makes
// walls/the exit non-paintable over each other and keeps the trigger list
// in sync with placed fixtures, but a save is re-validated here regardless
// (same posture as validateFloorTemplate/validateDesign above). Async
// because the pedestal check below resolves weaponTutorials.js via dynamic import().
async function validatePuzzleTemplate(data) {
  const allowed = (await loadTilesModule()).tileGlyphsForMode('puzzle');
  if (!data || typeof data !== 'object') return 'Not an object.';
  if (!Number.isFinite(data.weight) || data.weight < 0) return 'weight must be a number >= 0.';
  if (!Array.isArray(data.grid) || data.grid.length !== PUZZLE_ROWS) {
    return `grid must be an array of ${PUZZLE_ROWS} rows.`;
  }
  let exitCount = 0;
  for (let r = 0; r < PUZZLE_ROWS; r++) {
    const line = data.grid[r];
    if (typeof line !== 'string' || [...line].length !== PUZZLE_COLS) {
      return `row ${r} must be exactly ${PUZZLE_COLS} chars.`;
    }
    for (const ch of line) {
      if (!allowed.includes(ch)) {
        return `row ${r} has invalid char "${ch}" (only ${allowed.join(' ')} allowed).`;
      }
      if (ch === 'X') exitCount++;
    }
    const isBorderRow = r === 0 || r === PUZZLE_ROWS - 1;
    if (isBorderRow && [...line].some(ch => ch !== '#')) return `row ${r} is a border row — every cell must be #.`;
  }
  for (let r = 1; r < PUZZLE_ROWS - 1; r++) {
    if (data.grid[r][0] !== '#' || data.grid[r][PUZZLE_COLS - 1] !== '#') {
      return `row ${r} must have # at the left/right border columns.`;
    }
  }
  if (exitCount !== 1) return `grid must contain exactly one exit (X) — found ${exitCount}.`;

  if (!Array.isArray(data.triggers) || data.triggers.length < 1) {
    return 'triggers must be a non-empty array — a puzzle room needs at least one switch or panel.';
  }
  // Cell uniqueness is tracked across ALL placeable categories (triggers,
  // hook posts, torches, the pedestal, the dais) — two different fixtures sharing one
  // cell is invalid regardless of which categories they come from.
  const seen = new Set();
  for (let i = 0; i < data.triggers.length; i++) {
    const t = data.triggers[i];
    if (!t || typeof t !== 'object') return `trigger ${i} must be an object.`;
    if (!Number.isInteger(t.row) || t.row < 1 || t.row > PUZZLE_ROWS - 2) return `trigger ${i} row out of bounds.`;
    if (!Number.isInteger(t.col) || t.col < 1 || t.col > PUZZLE_COLS - 2) return `trigger ${i} col out of bounds.`;
    const key = `${t.row},${t.col}`;
    if (seen.has(key)) return `trigger ${i} shares a cell with another fixture.`;
    seen.add(key);
    const cellChar = data.grid[t.row][t.col];
    if (cellChar !== '.') return `trigger ${i} at (${t.row},${t.col}) must sit on plain floor ('.'), not "${cellChar}".`;
    if (t.kind !== 'switch' && t.kind !== 'panel' && t.kind !== 'torch' && t.kind !== 'push') {
      return `trigger ${i} kind must be "switch", "panel", "torch", or "push".`;
    }
    if (t.activation !== 'permanent' && t.activation !== 'timed') {
      return `trigger ${i} activation must be "permanent" or "timed".`;
    }
    // A torch trigger ignites and stays lit — 'timed' would mean it
    // extinguishes itself, which doesn't match the fixture's own visual
    // (permanent flame) or DungeonPuzzleSystem's ignite-only update logic.
    if (t.kind === 'torch' && t.activation !== 'permanent') {
      return `trigger ${i} is a torch — activation must be "permanent" (a lit torch never reverts).`;
    }
    // A Push Rock slides once and stays where it was shoved.
    if (t.kind === 'push' && t.activation !== 'permanent') {
      return `trigger ${i} is a Push Rock — activation must be "permanent" (it never slides back).`;
    }
    if (t.activation === 'timed' && !(Number.isFinite(t.neutralizeSeconds) && t.neutralizeSeconds > 0)) {
      return `trigger ${i} is timed but neutralizeSeconds must be a number > 0.`;
    }
  }

  // Hook posts — optional, manually placed (not auto-derived from Gap
  // cells); each sits on plain floor like a trigger.
  if (data.hookPosts !== undefined) {
    if (!Array.isArray(data.hookPosts)) return 'hookPosts must be an array.';
    for (let i = 0; i < data.hookPosts.length; i++) {
      const p = data.hookPosts[i];
      if (!p || typeof p !== 'object') return `hookPost ${i} must be an object.`;
      if (!Number.isInteger(p.row) || p.row < 1 || p.row > PUZZLE_ROWS - 2) return `hookPost ${i} row out of bounds.`;
      if (!Number.isInteger(p.col) || p.col < 1 || p.col > PUZZLE_COLS - 2) return `hookPost ${i} col out of bounds.`;
      const key = `${p.row},${p.col}`;
      if (seen.has(key)) return `hookPost ${i} shares a cell with another fixture.`;
      seen.add(key);
      const cellChar = data.grid[p.row][p.col];
      if (cellChar !== '.') return `hookPost ${i} at (${p.row},${p.col}) must sit on plain floor ('.'), not "${cellChar}".`;
    }
  }

  // Torches — optional, DECORATIVE maze-parity fixtures (contrast the
  // torch-KIND trigger above, which looks the same but gates the exit);
  // also sit on plain floor. `lit` is an optional starting-state flag.
  if (data.torches !== undefined) {
    if (!Array.isArray(data.torches)) return 'torches must be an array.';
    for (let i = 0; i < data.torches.length; i++) {
      const t = data.torches[i];
      if (!t || typeof t !== 'object') return `torch ${i} must be an object.`;
      if (!Number.isInteger(t.row) || t.row < 1 || t.row > PUZZLE_ROWS - 2) return `torch ${i} row out of bounds.`;
      if (!Number.isInteger(t.col) || t.col < 1 || t.col > PUZZLE_COLS - 2) return `torch ${i} col out of bounds.`;
      const key = `${t.row},${t.col}`;
      if (seen.has(key)) return `torch ${i} shares a cell with another fixture.`;
      seen.add(key);
      const cellChar = data.grid[t.row][t.col];
      if (cellChar !== '.') return `torch ${i} at (${t.row},${t.col}) must sit on plain floor ('.'), not "${cellChar}".`;
      if (t.lit !== undefined && typeof t.lit !== 'boolean') return `torch ${i} lit must be a boolean.`;
    }
  }

  // Pedestal — optional, opt-in single marker (generalized off Whip Trial;
  // any template may set one). weaponChar is free text (the dungeon editor's
  // Pedestal tool no longer offers a fixed dropdown) — validated here
  // through the game's own pickWeaponTutorial rather than a hardcoded
  // allow-list, so any current or future weapon (craftable or found-only)
  // works without an editor code change.
  if (data.pedestal !== undefined && data.pedestal !== null) {
    const p = data.pedestal;
    if (typeof p !== 'object') return 'pedestal must be an object or null.';
    if (!Number.isInteger(p.row) || p.row < 1 || p.row > PUZZLE_ROWS - 2) return 'pedestal row out of bounds.';
    if (!Number.isInteger(p.col) || p.col < 1 || p.col > PUZZLE_COLS - 2) return 'pedestal col out of bounds.';
    const key = `${p.row},${p.col}`;
    if (seen.has(key)) return 'pedestal shares a cell with another fixture.';
    seen.add(key);
    const cellChar = data.grid[p.row][p.col];
    if (cellChar !== '.') return `pedestal at (${p.row},${p.col}) must sit on plain floor ('.'), not "${cellChar}".`;
    if (typeof p.weaponChar !== 'string' || !p.weaponChar) {
      return 'pedestal weaponChar must be a non-empty string.';
    }
    const { pickWeaponTutorial } = await loadWeaponTutorialsModule();
    if (!pickWeaponTutorial(p.weaponChar)) {
      return `pedestal weaponChar "${p.weaponChar}" isn't a weapon (or the Bomb) in items.js.`;
    }
  }

  // Dais — optional single marker (Bomb Trial): the Bomb Bag is placed here
  // (DungeonFloorGenerator.generatePuzzleRoom). Sits on plain floor like the
  // pedestal.
  if (data.dais !== undefined && data.dais !== null) {
    const d = data.dais;
    if (typeof d !== 'object') return 'dais must be an object or null.';
    if (!Number.isInteger(d.row) || d.row < 1 || d.row > PUZZLE_ROWS - 2) return 'dais row out of bounds.';
    if (!Number.isInteger(d.col) || d.col < 1 || d.col > PUZZLE_COLS - 2) return 'dais col out of bounds.';
    const key = `${d.row},${d.col}`;
    if (seen.has(key)) return 'dais shares a cell with another fixture.';
    seen.add(key);
    const cellChar = data.grid[d.row][d.col];
    if (cellChar !== '.') return `dais at (${d.row},${d.col}) must sit on plain floor ('.'), not "${cellChar}".`;
  }

  return null;
}

ipcMain.handle('puzzle-templates-list', () => listPuzzleTemplates());
ipcMain.handle('puzzle-template-load', (_e, name) => readJSON(resolvePuzzleTemplatePath(name)));

ipcMain.handle('puzzle-template-save', async (_e, name, data) => {
  const err = await validatePuzzleTemplate(data);
  if (err) return { ok: false, error: err };
  writeJSONAtomic(resolvePuzzleTemplatePath(name), data);
  return { ok: true };
});

ipcMain.handle('puzzle-template-delete', (_e, name) => deleteTemplate(resolvePuzzleTemplatePath, name));
ipcMain.handle('puzzle-template-rename', (_e, oldName, newName) =>
  renameTemplate(resolvePuzzleTemplatePath, oldName, newName));

// ═══════════════════════════════════════════════════════════════
// APP BOOTSTRAP
// ═══════════════════════════════════════════════════════════════

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 900,
    minWidth: 1100,
    minHeight: 760,
    title: 'Dungeon Layout Editor',
    backgroundColor: '#0d0d0d',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });
  win.loadFile('index.html');
  win.setMenuBarVisibility(false);
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
