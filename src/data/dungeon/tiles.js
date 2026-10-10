// Dungeon tile catalogue — the one vocabulary every dungeon template grid is
// written in, keyed by the glyph a template stores in its `grid` rows.
//
// Pure data, no imports: the dungeon editor's CommonJS main process, the
// plain-Node data gate (tools/check-data.js) and the game itself all load
// this file, and only the game runs under Vite.
//
// Fields:
//   name       what the editor's palette and the Progression Solver call it
//   solid      blocks movement until opened (collisionMap true)
//   opensWith  null (permanent) or the tool that makes a solid tile walkable:
//              'bomb' — a Bomb blast breaks it (CavernSystem.bombBlast)
//   reachOver  a strike (whip crack, boomerang) passes over it even though it
//              is solid — a Gap is a void, not a wall
//   modes      which template kinds may use it: 'floor' (Interior —
//              numbered floors, Trap Room) and/or 'puzzle' (Puzzle Room)
//   editor     { bg, fg, glyph } — how tools/dungeon-editor/ paints the cell
export const DUNGEON_TILES = {
  '#': {
    name: 'Wall', solid: true, opensWith: null, reachOver: false,
    modes: ['floor', 'puzzle'],
    editor: { bg: '#3a3a3a' },
  },
  '.': {
    name: 'Floor', solid: false, opensWith: null, reachOver: true,
    modes: ['floor', 'puzzle'],
    editor: { bg: '#161616' },
  },
  '~': {
    name: 'Water', solid: false, opensWith: null, reachOver: true,
    modes: ['floor', 'puzzle'],
    editor: { bg: '#1c3d5c' },
  },
  // Preferred enemy spawn point — plain floor that _spawnEnemies() fills first.
  'E': {
    name: 'Enemy Spawn', solid: false, opensWith: null, reachOver: true,
    modes: ['floor'],
    editor: { bg: '#161616', fg: '#e05a5a', glyph: 'E' },
  },
  // The Puzzle Room's one locked way back up — exactly one per puzzle grid.
  'X': {
    name: 'Exit', solid: false, opensWith: null, reachOver: true,
    modes: ['puzzle'],
    editor: { bg: '#161616', fg: '#5ad088', glyph: 'X' },
  },
  'G': {
    name: 'Gap', solid: true, opensWith: null, reachOver: true,
    modes: ['puzzle'],
    editor: { bg: '#050506' },
  },
  'B': {
    name: 'Bombable Wall', solid: true, opensWith: 'bomb', reachOver: false,
    modes: ['puzzle'],
    editor: { bg: '#3a3a3a', fg: '#e05a5a', glyph: 'B' },
  },
};

/** The glyphs a template of this kind ('floor' | 'puzzle') may contain. */
export function tileGlyphsForMode(mode) {
  return Object.keys(DUNGEON_TILES).filter(glyph => DUNGEON_TILES[glyph].modes.includes(mode));
}
