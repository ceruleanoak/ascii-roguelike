/**
 * cliTables — the CLI's tables: the generic row model every CLI table is
 * built from, and the LIST content (Story.md, Names, Cheats, Weapons).
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

import { ITEMS, INGREDIENTS, ITEM_TYPES, WEAPON_TYPES, SUBTYPE_DEFAULTS } from '../data/items.js';
import { findRecipe } from '../data/recipes.js';
import { CHARACTER_TYPES } from '../data/characters.js';
import { COLORS } from '../game/GameConfig.js';
import { WEAPON_STYLES } from '../data/weaponStyles.js';

/** Text as the CLI shows it. Never pass a glyph through this. */
export const caps = text => String(text ?? '').toUpperCase();

// ── Row model ──────────────────────────────────────────────────────────────

export const stepRow = (label, values, get, set, format = String) =>
  ({ kind: 'steps', label, values, get, set, format });
export const toggleRow = (label, get, set) =>
  stepRow(label, [false, true], get, set, v => (v ? 'ON' : 'OFF'));
export const textRow = (label, get, set, max = 24) => ({ kind: 'text', label, get, set, max });
export const glyphRow = (label, get, pick) => ({ kind: 'glyph', label, get, pick });
export const tableRow = (label, build) => ({ kind: 'table', label, build });
export const actionRow = (label, run) => ({ kind: 'action', label, run });

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

// ── Registry snapshots ─────────────────────────────────────────────────────
// Taken at module load, which is before the entry point runs CanonOverlay —
// so these are the registries as shipped, not as overlaid. They let the CLI
// tell an authored weapon from a shipped one and restore an original name.

const SHIPPED_ITEM_GLYPHS = new Set(Object.keys(ITEMS));
const SHIPPED_WEAPON_GLYPHS = Object.keys(ITEMS).filter(g => ITEMS[g].type === ITEM_TYPES.WEAPON);
const SHIPPED_NAMES = Object.fromEntries(Object.entries(CHARACTER_TYPES).map(([type, data]) => [type, data.name]));
// Weapon Styles copy their stats from the shipped weapons, not overlaid ones.
const SHIPPED_DATA = Object.fromEntries(Object.entries(ITEMS).map(([glyph, data]) => [glyph, { ...data }]));

// ── Glyph globe ────────────────────────────────────────────────────────────

// BMP plus the musical and alchemical symbol blocks (🜛 lives in the latter).
const GLYPH_RANGES = [[0x00A1, 0xFFFD], [0x1D100, 0x1D1FF], [0x1F700, 0x1F77F]];
const SYMBOL = /^[\p{S}\p{P}]$/u;
const PICTOGRAPHIC = /\p{Extended_Pictographic}/u;
let glyphCache = null;

/**
 * Every glyph a crafted item may take (CLAUDE.md Character Encoding Rule):
 * symbols and punctuation only — no letters or digits, no emoji, no pure
 * box-drawing — and none a shipped item or ingredient already owns.
 */
export function craftableGlyphs() {
  if (!glyphCache) {
    glyphCache = [];
    for (const [from, to] of GLYPH_RANGES) {
      for (let cp = from; cp <= to; cp++) {
        if (cp >= 0xD800 && cp <= 0xDFFF) continue;   // surrogates
        if (cp >= 0x2500 && cp <= 0x257F) continue;   // box drawing
        const glyph = String.fromCodePoint(cp);
        if (!SYMBOL.test(glyph) || PICTOGRAPHIC.test(glyph)) continue;
        if (SHIPPED_ITEM_GLYPHS.has(glyph) || INGREDIENTS[glyph]) continue;
        glyphCache.push(glyph);
      }
    }
  }
  return glyphCache;
}

/** Glyphs free for a new weapon: not shipped, and not already authored. */
function freeGlyphs(cli) {
  return craftableGlyphs().filter(g => !cli.canon.weapons[g]);
}

// ── Story.md ───────────────────────────────────────────────────────────────

const STORY_LINE_MAX = 40;

function storyLines(cli) {
  return cli.canon.story ? cli.canon.story.split('\n') : [];
}

function setStoryLines(cli, lines) {
  cli.canon.story = lines.join('\n');
  cli.save();
}

// One row per line; clearing a line removes it. `+` adds a line at the end.
const STORY = (cli) => [
  ...storyLines(cli).map((_, i) => textRow('', () => storyLines(cli)[i], text => {
    const lines = storyLines(cli);
    if (text) lines[i] = text;
    else lines.splice(i, 1);
    setStoryLines(cli, lines);
  }, STORY_LINE_MAX)),
  textRow('+', () => '', text => {
    if (text) setStoryLines(cli, [...storyLines(cli), text]);
  }, STORY_LINE_MAX),
];

// ── Names ──────────────────────────────────────────────────────────────────

// One row per character, in its own color. Clearing a name (or typing the
// shipped one back) restores the shipped name.
const NAMES = (cli) => Object.entries(CHARACTER_TYPES).map(([type, data]) => ({
  ...textRow('', () => cli.canon.names[type] ?? SHIPPED_NAMES[type], text => {
    if (text && text !== SHIPPED_NAMES[type]) cli.canon.names[type] = text;
    else delete cli.canon.names[type];
    cli.save();
  }, 16),
  color: data.color,
}));

// ── Cheats ─────────────────────────────────────────────────────────────────

const CHEAT_ROWS = [
  ['GOD MODE', 'godMode'],
  ['PARTICLE FIREWORKS', 'particleFireworks'],
  ['SHOW VECTORS', 'showVectors'],
];

const CHEATS = (cli) => CHEAT_ROWS.map(([label, key]) => toggleRow(label,
  () => !!cli.canon.cheats[key],
  on => {
    if (on) cli.canon.cheats[key] = true;
    else delete cli.canon.cheats[key];
    cli.save();
  }));

// ── Weapons ────────────────────────────────────────────────────────────────

const PALETTE = [COLORS.ITEM, '#ffffff', '#aaaaaa', '#ff4444', '#ff8844', '#44ff44',
  '#44ffff', '#4488ff', '#cc66ff', '#ff66cc'];
const DAMAGE = [1, 2, 3, 4, 5, 6, 8, 10, 15, 20];
const WINDUP = [0.1, 0.2, 0.3, 0.5, 0.8, 1.2];
const RECOVERY = [0.2, 0.4, 0.6, 0.8, 1.2, 1.6];
const RANGE = [12, 16, 20, 24, 28, 36, 48];
const COOLDOWN = [0.4, 0.6, 0.8, 1, 1.2, 1.6, 2, 3];
const AMMO = [1, 2, 3, 4, 5, 6, 8, 10, 12];
const ACCURACY = [0.5, 0.7, 0.85, 0.95, 1];

// The stats a new weapon starts with, per type (a Sword and a Gun), under
// whatever its Weapon Style copies over them.
const TYPE_DEFAULTS = {
  [WEAPON_TYPES.MELEE]: { weaponSubtype: 'sword', damage: 2, windup: 0.3, recovery: 0.8, patternSpeed: 0.05, range: 20 },
  [WEAPON_TYPES.GUN]: { damage: 1, cooldown: 1.2, maxUses: 6, accuracy: 0.85, reloadTime: 5, reloadType: 'magazine' },
};

// What the TYPE row steps through: each melee subtype a swing reads cleanly
// from (flail spin, bat charge and pickaxe mining are bespoke), then the gun.
const KINDS = ['sword', 'dagger', 'axe', 'spear', 'hammer', 'staff', 'whip', 'scythe', 'gun'];
const weaponTypeOf = kind => (kind === 'gun' ? WEAPON_TYPES.GUN : WEAPON_TYPES.MELEE);
const kindOf = data => (data.weaponType === WEAPON_TYPES.GUN ? 'gun' : data.weaponSubtype);
const stylesFor = kind => WEAPON_STYLES[weaponTypeOf(kind)];

/** A Weapon Style's stats, copied off the shipped weapons it is drawn from. */
function styleStats(kind, styleName) {
  const style = stylesFor(kind).find(s => s.name === styleName);
  if (!style) return {};
  const stats = {};
  for (const [glyph, keys] of style.from) {
    for (const key of keys) {
      const value = SHIPPED_DATA[glyph]?.[key];
      if (value !== undefined) stats[key] = structuredClone(value);
    }
  }
  return { ...stats, ...style.set };
}

/**
 * An authored weapon from its kind, Weapon Style and damage. Everything else
 * passed (name, color, recipe) is kept as is.
 */
function buildWeapon({ kind, style, damage, ...keep }) {
  const weaponType = weaponTypeOf(kind);
  const entry = { authored: true, name: 'Weapon', color: COLORS.ITEM, ...keep, weaponType, ...TYPE_DEFAULTS[weaponType] };
  if (weaponType === WEAPON_TYPES.MELEE) entry.weaponSubtype = kind;
  Object.assign(entry, styleStats(kind, style));
  if (damage !== undefined) entry.damage = damage;
  entry.style = style;
  return entry;
}

const styleRow = (get, set, kind) => {
  const styles = stylesFor(kind);
  const reference = name => styles.find(s => s.name === name)?.reference;
  return {
    ...stepRow('STYLE', styles.map(s => s.name), get, set, name => (name ? `${name} ${reference(name)}` : '—')),
    valueColor: SHIPPED_DATA[reference(get())]?.color,
  };
};

const INGREDIENT_GLYPHS = Object.keys(INGREDIENTS);
const ingredientLabel = g => (g ? `${g} ${caps(INGREDIENTS[g].name)}` : '—');

/**
 * Whether left + right may become `glyph`'s recipe: no shipped recipe and no
 * other authored weapon already uses the pair, in either slot order.
 */
function pairFree(cli, glyph, left, right) {
  if (!left || !right) return true;
  const shipped = findRecipe(left, right);
  if (shipped && SHIPPED_ITEM_GLYPHS.has(shipped.result)) return false;
  return !Object.entries(cli.canon.weapons).some(([g, w]) => g !== glyph && w.recipe
    && ((w.recipe.left === left && w.recipe.right === right) || (w.recipe.left === right && w.recipe.right === left)));
}

function weaponRows(cli, glyph) {
  const entry = cli.canon.weapons[glyph];
  const authored = !!entry?.authored;
  // A shipped weapon shows its data under any authored overrides.
  const data = { ...(authored ? {} : ITEMS[glyph]), ...entry };
  const set = (key, value) => {
    cli.canon.weapons[glyph] = { ...cli.canon.weapons[glyph], [key]: value };
    cli.save();
  };
  const step = (label, key, values) => stepRow(label, values, () => data[key], v => set(key, v));
  // Kind and Weapon Style rebuild the weapon; its name, color, damage and recipe stay.
  const rebuild = (kind, style) => {
    const { name, color, recipe, damage } = entry;
    cli.canon.weapons[glyph] = buildWeapon({ name, color, recipe, damage, kind, style });
    cli.save();
  };

  const rows = [];
  if (authored) {
    rows.push(glyphRow('GLYPH', () => glyph, () => cli.openGlyphs(freeGlyphs(cli), picked => {
      delete cli.canon.weapons[glyph];
      cli.canon.weapons[picked] = entry;
      if (cli.canon.disabled[glyph]) {
        delete cli.canon.disabled[glyph];
        cli.canon.disabled[picked] = true;
      }
      cli.save();
      cli.replaceTable(c => weaponRows(c, picked));
    })));
  }
  rows.push(textRow('NAME', () => data.name, text => { if (text) set('name', text); }, 20));
  rows.push({ ...stepRow('COLOR', PALETTE, () => data.color, v => set('color', v), () => '█'), valueColor: data.color });

  if (authored) {
    const kind = kindOf(data);
    rows.push(stepRow('TYPE', KINDS, () => kind, k => rebuild(k, stylesFor(k)[0].name), caps));
    rows.push(styleRow(() => data.style, style => rebuild(kind, style), kind));
  }
  if (data.weaponType === WEAPON_TYPES.MELEE) {
    rows.push(step('DAMAGE', 'damage', DAMAGE), step('WINDUP', 'windup', WINDUP),
      step('RECOVERY', 'recovery', RECOVERY), step('RANGE', 'range', RANGE));
  } else if (data.weaponType === WEAPON_TYPES.GUN) {
    rows.push(step('DAMAGE', 'damage', DAMAGE), step('COOLDOWN', 'cooldown', COOLDOWN),
      step('AMMO', 'maxUses', AMMO), step('ACCURACY', 'accuracy', ACCURACY));
  } else {
    rows.push(step('DAMAGE', 'damage', DAMAGE)); // bow/wand/rod: their timing is bespoke
  }

  if (authored) {
    const recipe = entry.recipe ?? {};
    rows.push(stepRow('RECIPE', [null, ...INGREDIENT_GLYPHS], () => recipe.left ?? null, left => {
      const right = pairFree(cli, glyph, left, recipe.right) ? recipe.right : null;
      set('recipe', { left, right });
    }, ingredientLabel));
    rows.push(stepRow('+', [null, ...INGREDIENT_GLYPHS.filter(r => pairFree(cli, glyph, recipe.left, r))],
      () => recipe.right ?? null, right => set('recipe', { left: recipe.left ?? null, right }), ingredientLabel));
    rows.push(actionRow('DELETE', () => {
      delete cli.canon.weapons[glyph];
      delete cli.canon.disabled[glyph];
      cli.save();
      cli.back();
    }));
  } else if (entry) {
    rows.push(actionRow('RESTORE', () => {
      delete cli.canon.weapons[glyph];
      cli.save();
    }));
  }
  return rows;
}

// The player's own weapons first, then every shipped weapon.
const weaponGlyphs = (cli) => [
  ...Object.keys(cli.canon.weapons).filter(g => cli.canon.weapons[g].authored),
  ...SHIPPED_WEAPON_GLYPHS,
];

/** A weapon as a row label: its glyph, then its name in capitals. */
const weaponLabel = (cli, glyph) => {
  const data = { ...ITEMS[glyph], ...cli.canon.weapons[glyph] };
  return { label: `${glyph} ${caps(data.name)}`, color: data.color };
};

const WEAPON_LIST = (cli) => weaponGlyphs(cli).map(glyph => {
  const { label, color } = weaponLabel(cli, glyph);
  return { ...tableRow(label, c => weaponRows(c, glyph)), color };
});

// CUSTOMIZE: every weapon, ON while it may appear in a run. OFF makes it a
// Disabled Weapon (CanonOverlay keeps it out of every run from the next boot).
const CUSTOMIZE = (cli) => weaponGlyphs(cli).map(glyph => {
  const { label, color } = weaponLabel(cli, glyph);
  return {
    ...toggleRow(label, () => !cli.canon.disabled[glyph], on => {
      if (on) delete cli.canon.disabled[glyph];
      else cli.canon.disabled[glyph] = true;
      cli.save();
    }),
    color,
  };
});

/**
 * ADD A WEAPON: a draft form — GLYPH, NAME, TYPE, DAMAGE, STYLE — that opens
 * straight onto the glyph globe and then the name, so a weapon can be made in
 * two picks and a word. Nothing is saved until ADD; SHIFT drops the draft.
 * ADD keeps the weapon and turns the form into its full edit table.
 */
function addWeapon(cli) {
  const draft = { glyph: null, name: '', kind: KINDS[0], damage: TYPE_DEFAULTS[WEAPON_TYPES.MELEE].damage, style: stylesFor(KINDS[0])[0].name };
  const nameRow = textRow('NAME', () => draft.name, text => { draft.name = text; }, 20);
  const pickGlyph = () => cli.openGlyphs(freeGlyphs(cli), glyph => {
    draft.glyph = glyph;
    if (!draft.name) cli.openText(nameRow);
  });

  cli.openTable(() => {
    const rows = [
      glyphRow('GLYPH', () => draft.glyph ?? '—', pickGlyph),
      nameRow,
      stepRow('TYPE', KINDS, () => draft.kind, kind => {
        if (weaponTypeOf(kind) !== weaponTypeOf(draft.kind)) {
          draft.style = stylesFor(kind)[0].name;
          draft.damage = TYPE_DEFAULTS[weaponTypeOf(kind)].damage;
        }
        draft.kind = kind;
      }, caps),
      stepRow('DAMAGE', DAMAGE, () => draft.damage, damage => { draft.damage = damage; }),
      styleRow(() => draft.style, style => { draft.style = style; }, draft.kind),
    ];
    if (draft.glyph && draft.name && !cli.canon.weapons[draft.glyph]) {
      rows.push(actionRow('ADD', () => {
        const { glyph, name, kind, damage, style } = draft;
        cli.canon.weapons[glyph] = buildWeapon({ name, kind, damage, style });
        cli.save();
        cli.replaceTable(c => weaponRows(c, glyph));
        cli.top().index = 0;
      }));
    }
    return rows;
  });
  pickGlyph();
}

const WEAPONS = () => [
  actionRow('ADD A WEAPON', addWeapon),
  tableRow('EDIT A WEAPON', WEAPON_LIST),
  tableRow('CUSTOMIZE', CUSTOMIZE),
];

// ── LIST ───────────────────────────────────────────────────────────────────

export const LIST = () => [
  tableRow('STORY.MD', STORY),
  tableRow('NAMES', NAMES),
  tableRow('CHEATS', CHEATS),
  tableRow('WEAPONS', WEAPONS),
  actionRow('☠', () => window.location.reload()),
];
