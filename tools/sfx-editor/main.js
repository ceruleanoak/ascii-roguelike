const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

const TEMPLATES_DIR = path.join(__dirname, 'templates');
const RENDERS_DIR = path.join(__dirname, 'renders');

// Keep in sync with the PRESETS object in index.html (CLI `list` avoids opening a window).
const BUILTIN_NAMES = ['HIT', 'PICKUP', 'DEATH', 'EXPLOSION', 'SELECT', 'POWERUP', 'COIN', 'ERROR'];

// Write preload script to a temp file so we can reference it
const preloadPath = path.join(__dirname, 'preload.js');
fs.writeFileSync(preloadPath, `
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('electronAPI', {
  exportWAV: (arrayBuffer, filename) =>
    ipcRenderer.invoke('export-wav', arrayBuffer, filename),
  listTemplates: () =>
    ipcRenderer.invoke('templates-list'),
  loadTemplate: (relPath) =>
    ipcRenderer.invoke('template-load', relPath),
  saveTemplate: (relPath, data) =>
    ipcRenderer.invoke('template-save', relPath, data),
  deleteTemplate: (relPath) =>
    ipcRenderer.invoke('template-delete', relPath)
});
`);

// ═══════════════════════════════════════════════════════════════
// TEMPLATE STORE — templates/ holds one JSON per SFX, sub-folders
// are categories (e.g. enemy/magic/fairy.json)
// ═══════════════════════════════════════════════════════════════

function resolveTemplatePath(relPath) {
  let rel = String(relPath).trim().replace(/^\/+|\/+$/g, '');
  if (!rel.endsWith('.json')) rel += '.json';
  const abs = path.resolve(TEMPLATES_DIR, rel);
  if (!abs.startsWith(TEMPLATES_DIR + path.sep)) {
    throw new Error('Template path escapes templates/: ' + relPath);
  }
  return abs;
}

function listTemplates(dir = TEMPLATES_DIR, prefix = '') {
  let out = [];
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const e of entries) {
    if (e.isDirectory()) {
      out = out.concat(listTemplates(path.join(dir, e.name), prefix + e.name + '/'));
    } else if (e.name.endsWith('.json')) {
      out.push(prefix + e.name.slice(0, -5));
    }
  }
  return out;
}

ipcMain.handle('templates-list', () => listTemplates());

ipcMain.handle('template-load', async (event, relPath) => {
  const raw = await fs.promises.readFile(resolveTemplatePath(relPath), 'utf8');
  return JSON.parse(raw);
});

ipcMain.handle('template-save', async (event, relPath, data) => {
  const abs = resolveTemplatePath(relPath);
  await fs.promises.mkdir(path.dirname(abs), { recursive: true });
  await fs.promises.writeFile(abs, JSON.stringify(data, null, 2));
  return { success: true };
});

ipcMain.handle('template-delete', async (event, relPath) => {
  await fs.promises.unlink(resolveTemplatePath(relPath));
  return { success: true };
});

ipcMain.handle('export-wav', async (event, arrayBuffer, filename) => {
  const { canceled, filePath } = await dialog.showSaveDialog({
    defaultPath: filename,
    filters: [{ name: 'WAV Audio', extensions: ['wav'] }]
  });
  if (!canceled && filePath) {
    await fs.promises.writeFile(filePath, Buffer.from(arrayBuffer));
    return { success: true, filePath };
  }
  return { success: false };
});

// ═══════════════════════════════════════════════════════════════
// CLI MODE — headless render pipeline (see tools/sfx-editor/sfx)
//   sfx list
//   sfx render <name|path|all> [--out file.wav] [--out-dir dir]
//   sfx vary <name|path> [--count N] [--factor F] [--out-dir dir]
// ═══════════════════════════════════════════════════════════════

const HELP = `sfx — headless SFX render pipeline

  sfx list                                   list built-ins and templates
  sfx render <name> [--out file.wav]         render one template or built-in
  sfx render <a> <b> ... [--out-dir dir]     render several
  sfx render all [--out-dir dir]             render every template
  sfx vary <name> [--count N] [--factor F]   render N subtle variants (default 5, 0.15)
                  [--out-dir dir]            each variant writes .wav + .json params

Names resolve to templates/<name>.json first, then built-in presets (case-insensitive).
Default output dir: tools/sfx-editor/renders/ (gitignored).
Promote a variant by copying its .json into templates/<folder>/<name>.json`;

const cliArgs = process.argv.slice(process.defaultApp ? 2 : 1);
const cliMode = ['list', 'render', 'vary', 'help', '--help'].includes(cliArgs[0]);

function parseCliArgs(args) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith('--')) {
      const next = args[i + 1];
      if (next !== undefined && !next.startsWith('--')) { flags[a.slice(2)] = next; i++; }
      else flags[a.slice(2)] = true;
    } else {
      positional.push(a);
    }
  }
  return { positional, flags };
}

async function cliMain() {
  const cmd = cliArgs[0];

  if (cmd === 'help' || cmd === '--help') {
    console.log(HELP);
    app.exit(0);
    return;
  }

  if (cmd === 'list') {
    console.log('BUILT-IN:');
    for (const b of BUILTIN_NAMES) console.log('  ' + b);
    console.log('TEMPLATES (tools/sfx-editor/templates/):');
    const tpls = listTemplates();
    if (!tpls.length) console.log('  (none)');
    for (const t of tpls) console.log('  ' + t);
    app.exit(0);
    return;
  }

  const { positional, flags } = parseCliArgs(cliArgs.slice(1));
  if (!positional.length) {
    console.error('Missing template name.\n\n' + HELP);
    app.exit(1);
    return;
  }

  // Hidden window hosting the editor page — renders go through the exact same
  // SFXSynthesizer.renderOffline + Exporter._toWAV code as the GUI export.
  const win = new BrowserWindow({
    show: false,
    webPreferences: { preload: preloadPath, nodeIntegration: false, contextIsolation: true }
  });
  win.webContents.audioMuted = true;
  await win.loadFile(path.join(__dirname, 'index.html'));

  async function resolveSfx(name) {
    const rel = name.replace(/\.json$/, '').replace(/^templates\//, '');
    let abs = null;
    try { abs = resolveTemplatePath(rel); } catch {}
    if (abs && fs.existsSync(abs)) {
      return { rel, sfx: JSON.parse(await fs.promises.readFile(abs, 'utf8')) };
    }
    const builtin = await win.webContents.executeJavaScript(
      `(typeof PRESETS !== 'undefined' && PRESETS[${JSON.stringify(name.toUpperCase())}]) || null`
    );
    if (builtin) return { rel: name.toLowerCase(), sfx: builtin };
    throw new Error(`No template or built-in preset named "${name}". Run: sfx list`);
  }

  async function renderToFile(sfx, outPath) {
    const b64 = await win.webContents.executeJavaScript(`__cliRender(${JSON.stringify(sfx)})`);
    await fs.promises.mkdir(path.dirname(outPath), { recursive: true });
    await fs.promises.writeFile(outPath, Buffer.from(b64, 'base64'));
    console.log('wrote ' + path.relative(process.cwd(), outPath));
  }

  const outDir = flags['out-dir'] ? path.resolve(flags['out-dir']) : RENDERS_DIR;

  if (cmd === 'render') {
    let names = positional;
    if (names.length === 1 && names[0] === 'all') {
      names = listTemplates();
      if (!names.length) throw new Error('No templates in ' + TEMPLATES_DIR);
    }
    if (flags.out && names.length > 1) {
      throw new Error('--out is for a single render; use --out-dir for multiple.');
    }
    for (const name of names) {
      const { rel, sfx } = await resolveSfx(name);
      const base = rel.split('/').pop();
      const outPath = flags.out ? path.resolve(String(flags.out)) : path.join(outDir, base + '.wav');
      await renderToFile(sfx, outPath);
    }
  } else { // vary
    const { rel, sfx } = await resolveSfx(positional[0]);
    const count = parseInt(flags.count, 10) || 5;
    const factor = parseFloat(flags.factor) || 0.15;
    const base = rel.split('/').pop();
    await fs.promises.mkdir(outDir, { recursive: true });
    for (let i = 1; i <= count; i++) {
      const result = await win.webContents.executeJavaScript(
        `(async () => {
           const v = applySubtleVariation(JSON.parse(JSON.stringify(${JSON.stringify(sfx)})), ${factor});
           return { sfx: v, wav: await __cliRender(v) };
         })()`
      );
      const stem = path.join(outDir, `${base}-var-${i}`);
      await fs.promises.writeFile(stem + '.wav', Buffer.from(result.wav, 'base64'));
      await fs.promises.writeFile(stem + '.json', JSON.stringify(result.sfx, null, 2));
      console.log(`wrote ${path.relative(process.cwd(), stem)}.wav (+ .json params)`);
    }
    console.log('Promote a variant: copy its .json into templates/<folder>/<name>.json');
  }

  win.destroy();
  app.exit(0);
}

// ═══════════════════════════════════════════════════════════════
// APP BOOTSTRAP
// ═══════════════════════════════════════════════════════════════

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1280,
    minHeight: 820,
    title: 'SFX Editor',
    backgroundColor: '#0d0d0d',
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  win.loadFile('index.html');
  win.setMenuBarVisibility(false);
}

app.whenReady().then(() => {
  if (cliMode) {
    if (process.platform === 'darwin' && app.dock) app.dock.hide();
    cliMain().catch(err => {
      console.error(err.message || err);
      app.exit(1);
    });
    return;
  }
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (cliMode) return; // CLI exits explicitly after writing output
  if (process.platform !== 'darwin') app.quit();
});
