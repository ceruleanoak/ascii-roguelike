const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

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

function readJSON(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJSONAtomic(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';           // atomic write: tmp + rename, so a crash mid-write can't corrupt the file
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n');
  fs.renameSync(tmp, file);
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

// Same 4-point reservation algorithm as src/data/dungeonFloorTemplates.js's
// getReservedFootprintCells() — kept as a small, obviously-equivalent
// duplicate rather than importing that ES module into this CommonJS main
// process. Both read the one JSON contract file, so the *numbers* never
// drift; only this handful-of-lines geometry is mirrored. Deliberately just
// the 4 single-cell footprints, no connecting corridor between them — see
// that file's header for why.
function reservedFootprintCells(contract) {
  const { STAIRS_COL, STAIRS_UP_ROW, NORTH_ROW, SPINE_ROW, WEST_COL, EAST_COL } = contract;
  return [
    { row: STAIRS_UP_ROW, col: STAIRS_COL },
    { row: NORTH_ROW,     col: STAIRS_COL },
    { row: SPINE_ROW,     col: WEST_COL },
    { row: SPINE_ROW,     col: EAST_COL },
  ];
}

// Defense in depth against hand-edited files — the renderer already makes
// these cells non-paintable, but a save is re-validated here regardless.
function validateFloorTemplate(data) {
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
      if (ch !== '#' && ch !== '.' && ch !== '~' && ch !== 'E') return `row ${r} has invalid char "${ch}" (only # . ~ E allowed).`;
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
ipcMain.handle('footprint-reserved-cells', () => reservedFootprintCells(readJSON(FOOTPRINT_CONTRACT_FILE)));
ipcMain.handle('floor-templates-list', () => listFloorTemplates());
ipcMain.handle('floor-template-load', (_e, name) => readJSON(resolveFloorTemplatePath(name)));

ipcMain.handle('floor-template-save', (_e, name, data) => {
  const err = validateFloorTemplate(data);
  if (err) return { ok: false, error: err };
  writeJSONAtomic(resolveFloorTemplatePath(name), data);
  return { ok: true };
});

ipcMain.handle('floor-template-delete', (_e, name) => {
  fs.unlinkSync(resolveFloorTemplatePath(name));
  return { ok: true };
});

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
// Grid + a trigger list (switches/floor panels), consumed at runtime by
// DungeonFloorGenerator.generatePuzzleRoom / DungeonPuzzleSystem.
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
// (same posture as validateFloorTemplate/validateDesign above).
function validatePuzzleTemplate(data) {
  if (!data || typeof data !== 'object') return 'Not an object.';
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
      if (ch !== '#' && ch !== '.' && ch !== '~' && ch !== 'X') {
        return `row ${r} has invalid char "${ch}" (only # . ~ X allowed).`;
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
  const seen = new Set();
  for (let i = 0; i < data.triggers.length; i++) {
    const t = data.triggers[i];
    if (!t || typeof t !== 'object') return `trigger ${i} must be an object.`;
    if (!Number.isInteger(t.row) || t.row < 1 || t.row > PUZZLE_ROWS - 2) return `trigger ${i} row out of bounds.`;
    if (!Number.isInteger(t.col) || t.col < 1 || t.col > PUZZLE_COLS - 2) return `trigger ${i} col out of bounds.`;
    const key = `${t.row},${t.col}`;
    if (seen.has(key)) return `trigger ${i} shares a cell with another trigger.`;
    seen.add(key);
    const cellChar = data.grid[t.row][t.col];
    if (cellChar !== '.') return `trigger ${i} at (${t.row},${t.col}) must sit on plain floor ('.'), not "${cellChar}".`;
    if (t.kind !== 'switch' && t.kind !== 'panel') return `trigger ${i} kind must be "switch" or "panel".`;
    if (t.activation !== 'permanent' && t.activation !== 'timed') {
      return `trigger ${i} activation must be "permanent" or "timed".`;
    }
    if (t.activation === 'timed' && !(Number.isFinite(t.neutralizeSeconds) && t.neutralizeSeconds > 0)) {
      return `trigger ${i} is timed but neutralizeSeconds must be a number > 0.`;
    }
  }
  return null;
}

ipcMain.handle('puzzle-templates-list', () => listPuzzleTemplates());
ipcMain.handle('puzzle-template-load', (_e, name) => readJSON(resolvePuzzleTemplatePath(name)));

ipcMain.handle('puzzle-template-save', (_e, name, data) => {
  const err = validatePuzzleTemplate(data);
  if (err) return { ok: false, error: err };
  writeJSONAtomic(resolvePuzzleTemplatePath(name), data);
  return { ok: true };
});

ipcMain.handle('puzzle-template-delete', (_e, name) => {
  fs.unlinkSync(resolvePuzzleTemplatePath(name));
  return { ok: true };
});

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
