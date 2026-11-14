/**
 * cliEnemyTables — the CLI's Enemies table (LIST → ENEMIES): ADD AN ENEMY,
 * EDIT AN ENEMY and CUSTOMIZE, the Weapons table's shape with less to author
 * (claudedocs/cli-enemies-plan.md).
 *
 * The player steps six values — glyph, name, color, HP, damage, speed — and
 * picks one Enemy Style (the BEHAVIOR row) and one placement (ZONE + DEPTH).
 * Everything else an authored enemy does arrives with its style at boot, in
 * CanonOverlay; only the style's name is stored.
 */

import { ENEMIES, ZONE_SPAWN_TABLES, SPAWN_TABLES } from '../data/enemies.js';
import { ENEMY_STYLES } from '../data/enemyStyles.js';
import { isFreeEnemyGlyph, spawnTableEnemies } from './CanonOverlay.js';
import { caps, stepRow, toggleRow, textRow, tableRow, actionRow, colorRow, PALETTE } from './cliRows.js';

// ── Registry snapshots ─────────────────────────────────────────────────────
// Taken at module load, before the entry point runs CanonOverlay, so these
// are the enemies and spawn bands as shipped, not as overlaid.

const SHIPPED_TABLES = structuredClone(ZONE_SPAWN_TABLES);
const SHIPPED_LEGACY_TABLES = structuredClone(SPAWN_TABLES);
const SPAWN_ENEMIES = spawnTableEnemies();
const SHIPPED_DATA = Object.fromEntries(SPAWN_ENEMIES.map(char => {
  const { name, color, hp, damage, speed } = ENEMIES[char];
  return [char, { name, color, hp, damage, speed }];
}));
// Every glyph an authored enemy may take, in ASCII order.
const ENEMY_GLYPHS = Array.from({ length: 0x7e - 0x21 + 1 }, (_, i) => String.fromCharCode(0x21 + i))
  .filter(isFreeEnemyGlyph);

const HP = [1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30];
const DAMAGE = [0, 1, 2, 3, 4, 5, 6, 8];
const SPEED = [10, 15, 20, 25, 30, 35, 40, 50, 60, 75, 90, 110, 130];
const ZONES = Object.keys(SHIPPED_TABLES);
const bandsOf = zone => Object.keys(SHIPPED_TABLES[zone]).map(Number);

const STYLE_NAMES = ENEMY_STYLES.map(style => style.name);
const styleSource = name => ENEMY_STYLES.find(style => style.name === name)?.from;

/** Glyphs free for `glyph`'s enemy: its own, and any no other authored enemy holds. */
const freeGlyphs = (cli, glyph = null) => ENEMY_GLYPHS.filter(g => g === glyph || !cli.canon.enemies[g]);

/** An enemy as a row label: its glyph, then its name in capitals. */
function enemyLabel(cli, glyph) {
  const data = { ...SHIPPED_DATA[glyph], ...cli.canon.enemies[glyph] };
  return { label: `${glyph} ${caps(data.name)}`, color: data.color };
}

// The player's own enemies first, then every spawn-table enemy.
const enemyGlyphs = (cli) => [
  ...Object.keys(cli.canon.enemies).filter(g => cli.canon.enemies[g].authored),
  ...SPAWN_ENEMIES,
];

// ── Rows ───────────────────────────────────────────────────────────────────

/**
 * The rows every authored enemy has, read from and written to `entry`
 * through `set` — shared by the ADD draft and an authored enemy's edit table.
 */
function authoredRows(entry, set) {
  return [
    {
      ...stepRow('BEHAVIOR', STYLE_NAMES, () => entry.style, v => set('style', v)),
      valueColor: SHIPPED_DATA[styleSource(entry.style)]?.color,
    },
    stepRow('HP', HP, () => entry.hp, v => set('hp', v)),
    stepRow('DAMAGE', DAMAGE, () => entry.damage, v => set('damage', v)),
    stepRow('SPEED', SPEED, () => entry.speed, v => set('speed', v)),
    colorRow(() => entry.color, v => set('color', v)),
    stepRow('ZONE', ZONES, () => entry.zone, zone => {
      set('zone', zone);
      if (!bandsOf(zone).includes(entry.depth)) set('depth', 0);
    }, caps),
    stepRow('DEPTH', bandsOf(entry.zone), () => entry.depth, v => set('depth', v)),
  ];
}

function enemyRows(cli, glyph) {
  const entry = cli.canon.enemies[glyph];
  const authored = !!entry?.authored;
  // A shipped enemy shows its data under any authored overrides.
  const data = { ...(authored ? {} : SHIPPED_DATA[glyph]), ...entry };
  const set = (key, value) => {
    cli.canon.enemies[glyph] = { ...cli.canon.enemies[glyph], [key]: value };
    cli.save();
  };
  const step = (label, key, values) => stepRow(label, values, () => data[key], v => set(key, v));

  if (!authored) {
    const rows = [
      textRow('NAME', () => data.name, text => { if (text) set('name', text); }, 20),
      colorRow(() => data.color, v => set('color', v)),
      step('HP', 'hp', HP), step('DAMAGE', 'damage', DAMAGE), step('SPEED', 'speed', SPEED),
    ];
    if (entry) {
      rows.push(actionRow('RESTORE', () => {
        delete cli.canon.enemies[glyph];
        cli.save();
      }));
    }
    return rows;
  }

  return [
    stepRow('GLYPH', freeGlyphs(cli, glyph), () => glyph, picked => {
      delete cli.canon.enemies[glyph];
      cli.canon.enemies[picked] = entry;
      if (cli.canon.disabledEnemies[glyph]) {
        delete cli.canon.disabledEnemies[glyph];
        cli.canon.disabledEnemies[picked] = true;
      }
      cli.save();
      cli.replaceTable(c => enemyRows(c, picked));
    }),
    textRow('NAME', () => data.name, text => { if (text) set('name', text); }, 20),
    ...authoredRows(data, set),
    actionRow('DELETE', () => {
      delete cli.canon.enemies[glyph];
      delete cli.canon.disabledEnemies[glyph];
      cli.save();
      cli.back();
    }),
  ];
}

const ENEMY_LIST = (cli) => enemyGlyphs(cli).map(glyph => {
  const { label, color } = enemyLabel(cli, glyph);
  return { ...tableRow(label, c => enemyRows(c, glyph)), color };
});

// ── CUSTOMIZE ──────────────────────────────────────────────────────────────

/**
 * Whether switching `glyph` off would leave some random spawn band with no
 * enemy at all. Bands are counted as the next boot will build them: shipped,
 * plus every authored enemy placed in them, less the Disabled Enemies.
 */
function wouldEmptyBand(cli, glyph) {
  const off = c => c === glyph || cli.canon.disabledEnemies[c];
  const authored = Object.entries(cli.canon.enemies).filter(([, e]) => e.authored);
  const empties = roster => roster.includes(glyph) && roster.every(off);
  for (const zone of ZONES) {
    for (const threshold of bandsOf(zone)) {
      const placed = authored.filter(([, e]) => e.zone === zone && e.depth <= threshold).map(([g]) => g);
      if (empties([...SHIPPED_TABLES[zone][threshold], ...placed])) return true;
    }
  }
  return Object.values(SHIPPED_LEGACY_TABLES).some(empties);
}

// Every enemy, ON while it may spawn at random. OFF makes it a Disabled
// Enemy; the last enemy a band has left stays ON.
const CUSTOMIZE = (cli) => enemyGlyphs(cli).map(glyph => {
  const { label, color } = enemyLabel(cli, glyph);
  return {
    ...toggleRow(label, () => !cli.canon.disabledEnemies[glyph], on => {
      if (on) delete cli.canon.disabledEnemies[glyph];
      else if (!wouldEmptyBand(cli, glyph)) cli.canon.disabledEnemies[glyph] = true;
      cli.save();
    }),
    color,
  };
});

// ── ADD AN ENEMY ───────────────────────────────────────────────────────────

/**
 * ADD AN ENEMY: a draft form that opens straight onto its NAME, with the
 * first free glyph and a Chaser's stats in green's first band already set,
 * so an enemy can be made from one word. Nothing is saved until ADD; SHIFT
 * drops the draft. ADD keeps the enemy and turns the form into its edit table.
 */
function addEnemy(cli) {
  const style = ENEMY_STYLES[0];
  const { hp, damage, speed } = SHIPPED_DATA[style.from];
  const draft = {
    glyph: freeGlyphs(cli)[0] ?? null, name: '', style: style.name,
    hp, damage, speed, color: PALETTE[3], zone: ZONES[0], depth: 0,
  };
  const set = (key, value) => { draft[key] = value; };
  const nameRow = textRow('NAME', () => draft.name, text => { draft.name = text; }, 20);

  cli.openTable(() => {
    const rows = [
      stepRow('GLYPH', freeGlyphs(cli), () => draft.glyph, glyph => { draft.glyph = glyph; }, v => v ?? '—'),
      nameRow,
      ...authoredRows(draft, set),
    ];
    if (draft.glyph && draft.name && !cli.canon.enemies[draft.glyph]) {
      rows.push(actionRow('ADD', () => {
        const { glyph, ...fields } = draft;
        cli.canon.enemies[glyph] = { authored: true, ...fields };
        cli.save();
        cli.replaceTable(c => enemyRows(c, glyph));
        cli.top().index = 0;
      }));
    }
    return rows;
  });
  cli.openText(nameRow);
}

export const ENEMIES_TABLE = () => [
  actionRow('ADD AN ENEMY', addEnemy),
  tableRow('EDIT AN ENEMY', ENEMY_LIST),
  tableRow('CUSTOMIZE', CUSTOMIZE),
];
