// Dev console for the editor — the page had no rendered devtools at all, so a
// thrown frame, a sandbox error banner, or anything the game code logged was
// only visible to someone who happened to have the browser's own console open.
//
// Shares the center column with the arena on purpose: the log you want is
// almost always about the frame you are watching, and a panel in the right-hand
// column would put it beside the authoring form instead of beside the preview.
//
// Taps `console` by wrapping rather than replacing: every original method is
// still called, so the browser console keeps working exactly as before for
// anyone who does have it open.
const LEVELS = ['log', 'info', 'warn', 'error'];
const MAX_ENTRIES = 400;

export class DevConsole {
  constructor(root) {
    this.root = root;
    this.list = root.querySelector('#consoleList');
    this.badge = root.querySelector('#consoleCount');
    this.entries = [];
    // Collapsing repeats keeps a per-frame error from burying everything else:
    // a thrown draw call fires 60x a second and would otherwise scroll the one
    // message that explains it off the top within a second.
    this.lastKey = null;
    this.lastEntry = null;
    this.unread = 0;

    root.querySelector('#consoleClear').addEventListener('click', () => this.clear());
    // Collapsed the panel is one header row, which hands its height back to the
    // arena — the reason to keep it on screen at all is the error count badge.
    root.querySelector('#consoleToggle').addEventListener('click', () => {
      root.classList.toggle('collapsed');
    });
    this.install();
  }

  install() {
    this.original = {};
    for (const level of LEVELS) {
      this.original[level] = console[level].bind(console);
      console[level] = (...args) => {
        this.original[level](...args);
        this.push(level, args.map(format).join(' '));
      };
    }
    window.addEventListener('error', (e) => {
      this.push('error', `${e.message}  (${shortSource(e.filename)}:${e.lineno})`);
    });
    window.addEventListener('unhandledrejection', (e) => {
      this.push('error', `unhandled rejection: ${format(e.reason)}`);
    });
  }

  push(level, text) {
    const key = `${level}:${text}`;
    if (key === this.lastKey && this.lastEntry) {
      this.lastEntry.count += 1;
      this.paintCount(this.lastEntry);
      return;
    }
    const entry = { level, text, count: 1, time: new Date(), el: null };
    this.lastKey = key;
    this.lastEntry = entry;
    this.entries.push(entry);
    if (this.entries.length > MAX_ENTRIES) {
      const dropped = this.entries.shift();
      dropped.el?.remove();
    }
    this.paint(entry);
    this.unread += 1;
    this.paintBadge();
  }

  paint(entry) {
    // Pinned to the bottom only when the reader is already there — scrolling up
    // to read something is a deliberate act that a new log line shouldn't undo.
    const atBottom = this.list.scrollHeight - this.list.scrollTop - this.list.clientHeight < 24;
    const el = document.createElement('div');
    el.className = `con-line con-${entry.level}`;
    const time = document.createElement('span');
    time.className = 'con-time';
    time.textContent = entry.time.toLocaleTimeString('en-GB', { hour12: false });
    const body = document.createElement('span');
    body.className = 'con-body';
    body.textContent = entry.text;
    const count = document.createElement('span');
    count.className = 'con-count';
    el.append(time, body, count);
    entry.el = el;
    entry.countEl = count;
    this.list.appendChild(el);
    if (atBottom) this.list.scrollTop = this.list.scrollHeight;
  }

  paintCount(entry) {
    if (!entry.countEl) return;
    entry.countEl.textContent = entry.count > 1 ? `x${entry.count}` : '';
  }

  paintBadge() {
    const errors = this.entries.filter(e => e.level === 'error').length;
    this.badge.textContent = errors > 0 ? `${this.entries.length} (${errors} err)` : String(this.entries.length);
    this.badge.classList.toggle('has-error', errors > 0);
  }

  clear() {
    this.entries = [];
    this.lastKey = null;
    this.lastEntry = null;
    this.list.replaceChildren();
    this.paintBadge();
  }
}

// Objects are the common case for a sandbox log (an enemy, a state readout), so
// they are worth expanding rather than printing as [object Object]. Errors keep
// their stack's first frame, which is usually the only line that matters.
function format(value) {
  if (typeof value === 'string') return value;
  if (value instanceof Error) {
    const frame = (value.stack || '').split('\n')[1]?.trim();
    return frame ? `${value.message}  ${shortSource(frame)}` : value.message;
  }
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  try {
    return JSON.stringify(value, jsonSafe(), 0) ?? String(value);
  } catch {
    return String(value);
  }
}

// A live Enemy holds its game, its target and its collision map, so a naive
// stringify either throws on the cycle or dumps the whole world.
function jsonSafe() {
  const seen = new WeakSet();
  return (key, value) => {
    if (typeof value === 'function') return '[fn]';
    if (typeof value !== 'object' || value === null) return value;
    if (seen.has(value)) return '[circular]';
    seen.add(value);
    if (Array.isArray(value) && value.length > 12) return `[${value.length} items]`;
    return value;
  };
}

function shortSource(source) {
  if (!source) return '';
  return String(source).replace(/^.*\/(?=[^/]+$)/, '').replace(/\)$/, '');
}
