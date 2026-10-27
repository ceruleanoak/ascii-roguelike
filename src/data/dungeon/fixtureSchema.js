// Template fixture schema — the one check of the fixture lists a dungeon
// template authors on top of its grid (triggers, hook posts, Unbreakable
// Rocks, Deflectors, torches, items), shared by both template kinds.
//
// Pure, no imports, for the same reason as tiles.js: the dungeon editor's
// CommonJS main process (validateFloorTemplate / validatePuzzleTemplate) and
// the plain-Node data gate (tools/check-data.js) both load it, so a fixture
// the editor would refuse also fails the build, and the reverse.
// placeTemplateFixtures (src/systems/dungeonFixtures.js) is what builds them.

const TRIGGER_KINDS = ['switch', 'panel', 'torch', 'push'];
const DEFLECTOR_CHARS = ['◢', '◣', '◤', '◥'];

/**
 * Validate every optional fixture list on `data` against its grid. Every
 * fixture sits on plain floor ('.') inside the border, never on one of
 * `reservedCells` (the generator would leave it out) and never on a cell
 * another fixture already holds — `seen` ("row,col" keys) is shared with the
 * caller's own fixtures (pedestal, dais, Spawn Vents). `isItemChar(char)`
 * answers whether an `items` entry names a real item; omit it to skip that
 * check. Returns an error string, or null when every list is valid.
 */
export function validateTemplateFixtures(data, { rows, cols, reservedCells = [], seen = new Set(), isItemChar = null }) {
  const reserved = new Set(reservedCells.map(({ row, col }) => `${row},${col}`));

  // The checks every fixture shares: a placed object on a free floor cell.
  function placement(p, label) {
    if (!p || typeof p !== 'object') return `${label} must be an object.`;
    if (!Number.isInteger(p.row) || p.row < 1 || p.row > rows - 2) return `${label} row out of bounds.`;
    if (!Number.isInteger(p.col) || p.col < 1 || p.col > cols - 2) return `${label} col out of bounds.`;
    const key = `${p.row},${p.col}`;
    if (reserved.has(key)) return `${label} at (${p.row},${p.col}) sits on a reserved staircase footprint.`;
    if (seen.has(key)) return `${label} shares a cell with another fixture.`;
    seen.add(key);
    const cellChar = data.grid[p.row][p.col];
    if (cellChar !== '.') return `${label} at (${p.row},${p.col}) must sit on plain floor ('.'), not "${cellChar}".`;
    return null;
  }

  function eachOf(field, label, check) {
    if (data[field] === undefined) return null;
    if (!Array.isArray(data[field])) return `${field} must be an array.`;
    for (let i = 0; i < data[field].length; i++) {
      const err = placement(data[field][i], `${label} ${i}`) ?? check?.(data[field][i], `${label} ${i}`);
      if (err) return err;
    }
    return null;
  }

  return eachOf('triggers', 'trigger', (t, label) => {
    if (!TRIGGER_KINDS.includes(t.kind)) return `${label} kind must be "switch", "panel", "torch", or "push".`;
    if (t.activation !== 'permanent' && t.activation !== 'timed') {
      return `${label} activation must be "permanent" or "timed".`;
    }
    // A torch trigger ignites and stays lit — 'timed' would mean it
    // extinguishes itself, which doesn't match the fixture's own visual
    // (permanent flame) or DungeonPuzzleSystem's ignite-only update logic.
    if (t.kind === 'torch' && t.activation !== 'permanent') {
      return `${label} is a torch — activation must be "permanent" (a lit torch never reverts).`;
    }
    // A Push Rock slides once and stays where it was shoved.
    if (t.kind === 'push' && t.activation !== 'permanent') {
      return `${label} is a Push Rock — activation must be "permanent" (it never slides back).`;
    }
    if (t.activation === 'timed' && !(Number.isFinite(t.neutralizeSeconds) && t.neutralizeSeconds > 0)) {
      return `${label} is timed but neutralizeSeconds must be a number > 0.`;
    }
    return null;
  })
    // Hook posts — manually placed pull fixtures, not derived from Gap cells.
    ?? eachOf('hookPosts', 'hookPost')
    // Unbreakable Rocks — Cavern Rocks the Onyx Hammer rolls (the Hammer
    // Trial); Deflectors — { row, col, char } triangles that turn a rolling
    // rock or a shot.
    ?? eachOf('unbreakableRocks', 'unbreakableRock')
    ?? eachOf('deflectors', 'deflector', (d, label) =>
      (DEFLECTOR_CHARS.includes(d.char) ? null : `${label} char must be one of ${DEFLECTOR_CHARS.join(' ')}.`))
    // Torches — DECORATIVE maze-parity fixtures (contrast the torch-KIND
    // trigger, which looks the same but gates); `lit` is an optional
    // starting-state flag.
    ?? eachOf('torches', 'torch', (t, label) =>
      (t.lit !== undefined && typeof t.lit !== 'boolean' ? `${label} lit must be a boolean.` : null))
    // Items — { row, col, char }, any item an author sets on a cell, most
    // often the reward a Trigger Block walls off.
    ?? eachOf('items', 'item', (it, label) => {
      if (typeof it.char !== 'string' || !it.char) return `${label} char must be a non-empty string.`;
      if (isItemChar && !isItemChar(it.char)) return `${label} char "${it.char}" isn't an item in items.js.`;
      return null;
    });
}
