#!/usr/bin/env node
// Canon enemies check — boots the real module graph with a seeded canon in
// storage, applies the Canon Overlay as main.js does on load, and asserts the
// enemy Canon Edits (claudedocs/cli-enemies-plan.md):
//   - an authored enemy takes its Enemy Style and joins its band and deeper;
//   - a Disabled Enemy is cut from random spawns, but never empties a band;
//   - a corrupt or hostile store entry is skipped;
//   - CUSTOMIZE refuses to switch off the last enemy a band has left;
//   - FORGET brings back the shipped enemies and spawn tables.
// Each boot is a fresh Vite server, so each starts from the shipped registries.
//
//   node tools/check-canon-enemies.mjs

import { loadGame } from './lib/headless-game.mjs';
import { isDeepStrictEqual } from 'node:util';

const MODULES = ['/src/systems/CanonStore.js', '/src/systems/CanonOverlay.js',
  '/src/data/enemies.js', '/src/entities/Enemy.js', '/src/systems/cliEnemyTables.js'];

// A localStorage stand-in shared across boots, as one browser profile is.
const storage = new Map();
globalThis.window.localStorage = {
  getItem: key => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: key => storage.delete(key),
};

/** Load a fresh module graph and run the overlay over whatever is stored. */
async function boot() {
  const { modules } = await loadGame(MODULES);
  const store = modules['/src/systems/CanonStore.js'].CanonStore;
  modules['/src/systems/CanonOverlay.js'].applyCanonOverlay(store.load());
  return {
    store,
    overlay: modules['/src/systems/CanonOverlay.js'],
    enemies: modules['/src/data/enemies.js'],
    Enemy: modules['/src/entities/Enemy.js'].Enemy,
    cliTables: modules['/src/systems/cliEnemyTables.js'],
  };
}

const failures = [];
const check = (ok, message) => { if (!ok) failures.push(message); };
const bandsWith = (bands, glyph) => Object.keys(bands).filter(t => bands[t].includes(glyph)).map(Number);

// ── Shipped baseline ───────────────────────────────────────────────────────
const shipped = await boot();
const SHIPPED_TABLES = structuredClone(shipped.enemies.ZONE_SPAWN_TABLES);
const SHIPPED_LEGACY = structuredClone(shipped.enemies.SPAWN_TABLES);
const SHIPPED_KEYS = Object.keys(shipped.enemies.ENEMIES).sort();
const SHIPPED_SKELETON = structuredClone(shipped.enemies.ENEMIES.S);
const [glyph, badStyleGlyph, badZoneGlyph] = Array.from({ length: 94 }, (_, i) => String.fromCharCode(0x21 + i))
  .filter(shipped.overlay.isFreeEnemyGlyph);

// CUSTOMIZE: with the Bumper (%) off, the Magma Slug (l) is all red's first
// band has left, so switching it off is refused.
const cli = { canon: shipped.store.load(), save() {} };
cli.canon.disabledEnemies['%'] = true;
const customize = shipped.cliTables.ENEMIES_TABLE().find(row => row.label === 'CUSTOMIZE').build(cli);
const toggle = char => {
  const row = customize.find(r => r.label.startsWith(`${char} `));
  if (!row) throw new Error(`CUSTOMIZE has no row for ${char}`);
  row.set(false);
};
toggle('l');
check(!cli.canon.disabledEnemies.l, 'CUSTOMIZE switched off the last enemy in red band 0');
toggle('r');
check(cli.canon.disabledEnemies.r === true, 'CUSTOMIZE refused to switch off the Rat');

// ── Seeded canon ───────────────────────────────────────────────────────────
const authored = { authored: true, name: 'Tusker', color: '#ff4444', hp: 7, damage: 3, speed: 40 };
shipped.store.save({
  ...shipped.store.load(),
  enemies: {
    [glyph]: { ...authored, style: 'CHARGER', zone: 'green', depth: 3 },
    [badStyleGlyph]: { ...authored, style: 'NOPE', zone: 'green', depth: 0 },
    [badZoneGlyph]: { ...authored, style: 'CHASER', zone: '__proto__', depth: 0 },
    O: { ...authored, style: 'CHASER', zone: 'green', depth: 0 },  // a taken glyph
    S: { name: 'Bonesy', hp: 'lots', color: 'red' },               // an edit, two fields bad
  },
  disabledEnemies: { r: true, l: true, '%': true, nope: true },
});

const seeded = await boot();
const { ENEMIES, ZONE_SPAWN_TABLES, SPAWN_TABLES, getZoneRandomEnemy } = seeded.enemies;
const data = ENEMIES[glyph];
check(data?.char === glyph && data.name === 'Tusker' && data.hp === 7 && data.speed === 40,
  `authored enemy ${glyph} missing or lacks its own fields`);
check(data && isDeepStrictEqual(data.chargeMechanic, ENEMIES.b.chargeMechanic) && data.chargeMechanic !== ENEMIES.b.chargeMechanic,
  `authored enemy ${glyph} did not copy the CHARGER style (a clone of b's chargeMechanic)`);
check(!data?.trueName && !data?.motif, `authored enemy ${glyph} copied its style source's identity`);
const green = bandsWith(ZONE_SPAWN_TABLES.green, glyph);
const expected = Object.keys(SHIPPED_TABLES.green).map(Number).filter(t => t >= 3);
check(isDeepStrictEqual(green, expected), `authored enemy in green bands ${green}, expected ${expected}`);
check(['red', 'cyan', 'yellow', 'gray'].every(z => !bandsWith(ZONE_SPAWN_TABLES[z], glyph).length),
  'authored enemy leaked into another zone');
let spawned = 0;
for (let i = 0; i < 500; i++) if (getZoneRandomEnemy(3, 'green') === glyph) spawned++;
check(spawned > 0, `authored enemy never spawned at green depth 3 in 500 rolls`);
try { new seeded.Enemy(glyph, 100, 100, 3); } catch (e) { check(false, `new Enemy('${glyph}') threw: ${e.message}`); }

check(!ENEMIES[badStyleGlyph], 'an authored enemy with an unknown style was registered');
check(ENEMIES[badZoneGlyph] && Object.values(ZONE_SPAWN_TABLES).every(b => !bandsWith(b, badZoneGlyph).length),
  'an authored enemy with a bad zone was not registered unplaced');
check(ENEMIES.O.name !== 'Tusker', 'an authored enemy replaced a shipped one (O)');
check(ENEMIES.S.name === 'Bonesy' && ENEMIES.S.hp === SHIPPED_SKELETON.hp && ENEMIES.S.color === SHIPPED_SKELETON.color,
  'the Skeleton edit did not apply its name alone');

const allBands = [...Object.values(ZONE_SPAWN_TABLES).flatMap(b => Object.values(b)), ...Object.values(SPAWN_TABLES)];
check(allBands.every(band => band.length > 0), 'a Disabled Enemy cut emptied a band');
check(isDeepStrictEqual(ZONE_SPAWN_TABLES.green[0], ['o']), `green band 0 is ${ZONE_SPAWN_TABLES.green[0]}, expected the Rat cut`);
check(Object.values(SPAWN_TABLES).every(band => !band.includes('r')), 'the Rat is still in a legacy band');
check(isDeepStrictEqual(ZONE_SPAWN_TABLES.red[0], SHIPPED_TABLES.red[0]), 'red band 0 was emptied rather than kept');
check(bandsWith(ZONE_SPAWN_TABLES.red, 'l').length === 1, 'the Magma Slug survived outside the band it alone holds');

// ── FORGET ─────────────────────────────────────────────────────────────────
check(seeded.store.forget(), 'FORGET failed');
const forgotten = await boot();
check(isDeepStrictEqual(forgotten.enemies.ZONE_SPAWN_TABLES, SHIPPED_TABLES), 'FORGET left the zone spawn tables changed');
check(isDeepStrictEqual(forgotten.enemies.SPAWN_TABLES, SHIPPED_LEGACY), 'FORGET left the legacy spawn tables changed');
check(isDeepStrictEqual(Object.keys(forgotten.enemies.ENEMIES).sort(), SHIPPED_KEYS), 'FORGET left an authored enemy registered');

if (failures.length) {
  console.error(`Canon enemies FAILED:\n  ${failures.join('\n  ')}`);
  process.exit(1);
}
console.log(`Canon enemies ok (authored ${glyph} in green ${green.join('/')}, Rat disabled, ${spawned}/500 spawns).`);
process.exit(0);
