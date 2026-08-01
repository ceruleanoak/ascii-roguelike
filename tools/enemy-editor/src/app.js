// Wires schema-driven form + live sandbox + codegen + draft store together.
import { ENEMIES } from '../../../src/data/enemies.js';
import { EnemyForm } from './form.js';
import { Sandbox } from './sandbox.js';
import { toEntryLiteral, toDraftJSON, fromDraftJSON } from './codegen.js';
import { buildDefaultDef, deepClone } from './util.js';

const DRAFT_API = '/api/enemy-drafts';

let def = buildDefaultDef();
let form, sandbox;
let refreshTimer = null;

function el(id) { return document.getElementById(id); }

function init() {
  sandbox = new Sandbox(el('arena'), (msg) => {
    el('error').textContent = msg || '';
    el('error').style.display = msg ? 'block' : 'none';
  });
  sandbox.onNotice = (msg) => flash(el('telegraph'), msg);
  sandbox.onStateChange = renderStateReadout;
  form = new EnemyForm(el('form'), def, onDefChange);
  sandbox.loadDef(def);
  refreshOutput();

  populatePresets();
  populateDrafts();
  bindControls();
}

// Debounce sandbox rebuild on rapid edits, but refresh output immediately.
function onDefChange(next) {
  def = next;
  refreshOutput();
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => sandbox.loadDef(def), 120);
}

function refreshOutput() {
  el('code').textContent = toEntryLiteral(def);
}

function setDef(next) {
  def = next;
  form.setDef(def);
  sandbox.loadDef(def);
  refreshOutput();
}

function populatePresets() {
  const sel = el('preset');
  const chars = Object.keys(ENEMIES).sort((a, b) =>
    (ENEMIES[a].name || a).localeCompare(ENEMIES[b].name || b));
  for (const ch of chars) {
    const o = document.createElement('option');
    o.value = ch;
    o.textContent = `${ch}  ${ENEMIES[ch].name || ''}`;
    sel.appendChild(o);
  }
  sel.addEventListener('change', () => {
    const ch = sel.value;
    if (!ch) return;
    // Deep clone so editing the preset never mutates the live registry entry.
    setDef(deepClone(ENEMIES[ch]));
  });
}

async function populateDrafts() {
  const sel = el('draft');
  sel.querySelectorAll('option:not(:first-child)').forEach(o => o.remove());
  try {
    const res = await fetch(DRAFT_API);
    if (!res.ok) return;
    const names = await res.json();
    for (const n of names) {
      const o = document.createElement('option');
      o.value = n; o.textContent = n;
      sel.appendChild(o);
    }
  } catch { /* dev server not running in this mode */ }
}

function bindControls() {
  el('new').addEventListener('click', () => {
    setDef(buildDefaultDef());
    el('preset').value = '';
  });

  el('respawn').addEventListener('click', () => sandbox.respawn());
  el('pause').addEventListener('click', (e) => {
    sandbox.paused = !sandbox.paused;
    e.target.textContent = sandbox.paused ? '▶ Resume' : '⏸ Pause';
  });
  el('step').addEventListener('click', () => sandbox.stepOnce());

  // Fires the melee windup the Telegraph rides on, so the shape + animation can
  // be reviewed without waiting on an AI attack decision.
  el('telegraph').addEventListener('click', () => sandbox.triggerTelegraph());
  el('speed').addEventListener('change', (e) => { sandbox.timeScale = Number(e.target.value) || 1; });

  el('mouseFollow').addEventListener('change', (e) => { sandbox.mouseFollow = e.target.checked; });
  el('showRanges').addEventListener('change', (e) => { sandbox.showRanges = e.target.checked; });
  el('depth').addEventListener('change', (e) => {
    sandbox.depth = Number(e.target.value) || 0;
    sandbox.loadDef(def);
  });

  el('copy').addEventListener('click', async () => {
    await navigator.clipboard.writeText(toEntryLiteral(def));
    flash(el('copy'), 'Copied!');
  });

  el('save').addEventListener('click', async () => {
    const name = (def.name || def.char || 'enemy').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    try {
      const res = await fetch(`${DRAFT_API}/${encodeURIComponent(name)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: toDraftJSON(def),
      });
      if (!res.ok) throw new Error(await res.text());
      flash(el('save'), 'Saved ' + name);
      populateDrafts();
    } catch (e) { flash(el('save'), 'Save failed'); console.error(e); }
  });

  el('draft').addEventListener('change', async (e) => {
    const name = e.target.value;
    if (!name) return;
    try {
      const res = await fetch(`${DRAFT_API}/${encodeURIComponent(name)}`);
      if (!res.ok) throw new Error('load failed');
      setDef(fromDraftJSON(await res.text()));
    } catch (err) { console.error(err); }
  });

  el('delDraft').addEventListener('click', async () => {
    const name = el('draft').value;
    if (!name) return;
    await fetch(`${DRAFT_API}/${encodeURIComponent(name)}`, { method: 'DELETE' });
    el('draft').value = '';
    populateDrafts();
  });
}

function flash(button, text) {
  const orig = button.textContent;
  button.textContent = text;
  setTimeout(() => { button.textContent = orig; }, 1100);
}

// The State spine panel: live state + timer, the interrupt if one is holding
// the machine, the declared-States' range legend, and the transition log
// (most recent first) with its cause — the "why did it stop chasing" that a
// bare from→to can't answer on its own.
function renderStateReadout(s) {
  const now = el('stateNow'), timer = el('stateTimer'), interrupt = el('stateInterrupt');
  const ranges = el('stateRanges'), log = el('stateLog');
  if (!s) {
    now.textContent = '–'; timer.textContent = ''; interrupt.textContent = '';
    ranges.innerHTML = '<div class="list-empty">no enemy</div>';
    log.innerHTML = '<div class="list-empty">no enemy</div>';
    return;
  }

  now.textContent = s.id;
  timer.textContent = `t=${s.timer.toFixed(2)}s · elapsed=${s.elapsed.toFixed(1)}s`;
  interrupt.textContent = s.interrupt ? `⚠ ${s.interrupt}` : '';

  ranges.innerHTML = s.thresholds.length
    ? s.thresholds.map(t => `<div class="range-row"><span class="swatch" style="background:${escapeHtml(t.color || '#888')}"></span>${escapeHtml(String(t.label))} — ${Math.round(t.px ?? 0)}px</div>`).join('')
    : '<div class="list-empty">none declared</div>';

  log.innerHTML = s.log.length
    ? [...s.log].reverse().map(e => `<div class="log-row"><span class="log-t">${e.elapsed.toFixed(1)}s</span>${escapeHtml(e.from)} → <b>${escapeHtml(e.to)}</b><div class="log-cause">${escapeHtml(e.cause ?? '')}</div></div>`).join('')
    : '<div class="list-empty">no transitions yet</div>';
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Debug handle (mirrors the game's window.game convention).
window.enemyEditor = {
  get def() { return def; },
  get sandbox() { return sandbox; },
};

init();
