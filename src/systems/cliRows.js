/**
 * cliRows — the generic row model every CLI table is built from. The tables
 * themselves (LIST, Weapons, Enemies) live in cliTables / cliEnemyTables.
 *
 * The CLI reads in capitals: every label and value is built through caps().
 * Glyphs never are — ƒ and ⲯ are weapons whose capitals are other glyphs —
 * so a row puts its glyph beside caps(text), never inside it.
 *
 * A table is a function `(cli) => rows`, rebuilt on every key and frame, so a
 * row always shows the current Canon Edit. Row kinds:
 *   steps  — a value array stepped with left/right (SPACE steps forward).
 *            Toggles and numbers are both steps: [false, true], [1, 2, 3, …].
 *   text   — SPACE opens a text edit of the value.
 *   glyph  — SPACE opens the Unicode table to pick a glyph.
 *   table  — SPACE opens another table.
 *   action — SPACE runs it.
 *
 * Every edit writes the stored canon at once (cli.save()); none of it reaches
 * the registries until ☠ (PURE ROGUE) relaunches and CanonOverlay applies it.
 */

import { COLORS } from '../game/GameConfig.js';

/** Text as the CLI shows it. Never pass a glyph through this. */
export const caps = text => String(text ?? '').toUpperCase();

export const stepRow = (label, values, get, set, format = String) =>
  ({ kind: 'steps', label, values, get, set, format });
export const toggleRow = (label, get, set) =>
  stepRow(label, [false, true], get, set, v => (v ? 'ON' : 'OFF'));
export const textRow = (label, get, set, max = 24) => ({ kind: 'text', label, get, set, max });
export const glyphRow = (label, get, pick) => ({ kind: 'glyph', label, get, pick });
export const tableRow = (label, build) => ({ kind: 'table', label, build });
export const actionRow = (label, run) => ({ kind: 'action', label, run });

/** The colors a COLOR row steps through, shown as a █ in the color itself. */
export const PALETTE = [COLORS.ITEM, '#ffffff', '#aaaaaa', '#ff4444', '#ff8844', '#44ff44',
  '#44ffff', '#4488ff', '#cc66ff', '#ff66cc'];

/** A COLOR row over PALETTE. */
export const colorRow = (get, set) => ({ ...stepRow('COLOR', PALETTE, get, set, () => '█'), valueColor: get() });

/** The text a row shows beside its label (empty for table/action rows). */
export function rowValue(row) {
  if (row.kind === 'steps') return row.format(row.get());
  if (row.kind === 'text') return caps(row.get());
  if (row.kind === 'glyph') return row.get() ?? '';
  return '';
}

/**
 * Step a steps row by dir (±1), wrapping. A value authored outside the array
 * (registry data such as damage 7) lands on the nearest step in that direction.
 */
export function stepValue(row, dir) {
  const { values } = row;
  const current = row.get();
  let i = values.indexOf(current);
  if (i !== -1) {
    row.set(values[(i + dir + values.length) % values.length]);
    return;
  }
  i = dir > 0 ? values.findIndex(v => v > current) : values.findLastIndex(v => v < current);
  row.set(values[i !== -1 ? i : (dir > 0 ? 0 : values.length - 1)]);
}
