import { GRID } from '../game/GameConfig.js';

// Deep Lava — the heart of a lava body, the counterpart to deep water. A lava
// tile is deep when lava holds all four of its sides: the shore of any pool,
// river or moat stays ordinary lava, and only what can't be reached without
// first wading the shore turns deep. It burns the same as any lava; what it
// adds is the weight. An entity in it moves at DEEP_LAVA_SPEED (PhysicsSystem),
// rolling or not, so the crossing that costs HP costs a long time too.
//
// One rule, run once over a finished set of tiles by everything that lays lava
// as terrain: room generation (after resolveLavaHazards), the Lava Moat
// Barricade, and dungeon templates. A generator never decides depth itself, so
// every lava body, now and later, gets the same shape of shore and heart.

export const DEEP_LAVA_SPEED = 0.3; // the same as deep water's second wet pip
export const DEEP_LAVA_COLOR = '#aa2200';

export function markDeepLava(backgroundObjects) {
  const cs = GRID.CELL_SIZE;
  const key = (col, row) => `${col},${row}`;
  const lavaCells = new Set();
  const lavas = [];
  for (const obj of backgroundObjects) {
    if (!obj.isLava || !obj.isLava()) continue;
    lavas.push(obj);
    lavaCells.add(key(Math.floor(obj.position.x / cs), Math.floor(obj.position.y / cs)));
  }
  for (const lava of lavas) {
    const col = Math.floor(lava.position.x / cs);
    const row = Math.floor(lava.position.y / cs);
    const surrounded = [[1, 0], [-1, 0], [0, 1], [0, -1]]
      .every(([dc, dr]) => lavaCells.has(key(col + dc, row + dr)));
    if (!surrounded || lava.deepLava) continue;
    lava.deepLava = true;
    lava.name = 'Deep Lava';
    lava.color = DEEP_LAVA_COLOR;
    lava.animationColor = DEEP_LAVA_COLOR;
  }
}
