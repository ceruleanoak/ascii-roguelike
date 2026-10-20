import { GRID, CRAFTING, EQUIPMENT } from '../game/GameConfig.js';

/**
 * REST slot clearance — ground loot slides off the REST slots.
 *
 * An item that lands on the crafting station or on an equipment slot (chest,
 * armor, consumable) sits under the slot's own glyphs, and REST's SPACE
 * picks up a nearby item before it opens a slot, so loot parked there hides
 * itself and blocks the slot. Every frame in REST, any item or ingredient
 * overlapping a slot's footprint slides out by its shortest way off.
 *
 * Footprints are the cells the renderer draws: the crafting station is one
 * run of cells from the left slot's `[` to the right slot's `]`
 * (CraftingStation.js); every equipment slot is `[`, glyph, `]` centered on
 * its column (RestRenderer.js). Rows are a cell apart, so a slide out of one
 * footprint never lands in another.
 */

const SLIDE_SPEED = 90;  // px/s — reads as a slide, not a snap
const EPSILON = 1;       // px of overlap ignored, so an item at rest on a footprint edge stays put

const C = GRID.CELL_SIZE;

function cellRun(firstCol, lastCol, row) {
  return { x: firstCol * C, y: row * C, w: (lastCol - firstCol + 1) * C, h: C };
}

const SLOT_FOOTPRINTS = [
  cellRun(CRAFTING.LEFT_SLOT_X, CRAFTING.RIGHT_SLOT_X + 2, CRAFTING.STATION_Y),
  ...[
    [EQUIPMENT.CHEST_X, EQUIPMENT.CHEST1_Y],
    [EQUIPMENT.CHEST_X, EQUIPMENT.CHEST2_Y],
    [EQUIPMENT.CHEST_X, EQUIPMENT.CHEST3_Y],
    [EQUIPMENT.ARMOR_X, EQUIPMENT.ARMOR_Y],
    [EQUIPMENT.CONSUMABLE1_X, EQUIPMENT.CONSUMABLE1_Y],
    [EQUIPMENT.CONSUMABLE2_X, EQUIPMENT.CONSUMABLE2_Y],
    [EQUIPMENT.CONSUMABLE3_X, EQUIPMENT.CONSUMABLE3_Y],
    [EQUIPMENT.CONSUMABLE4_X, EQUIPMENT.CONSUMABLE4_Y],
    [EQUIPMENT.CONSUMABLE5_X, EQUIPMENT.CONSUMABLE5_Y]
  ].map(([col, row]) => cellRun(col - 1, col + 1, row))
];

/** Move one loot entity a step out of the footprint it overlaps, if any. */
function slideOff(entity, deltaTime) {
  const pos = entity.position;
  if (!pos) return;
  const w = entity.width || C;
  const h = entity.height || C;
  for (const f of SLOT_FOOTPRINTS) {
    // Penetration toward each side; all positive means overlap.
    const left = pos.x + w - f.x;
    const right = f.x + f.w - pos.x;
    const up = pos.y + h - f.y;
    const down = f.y + f.h - pos.y;
    if (left <= EPSILON || right <= EPSILON || up <= EPSILON || down <= EPSILON) continue;

    const exit = Math.min(left, right, up, down);
    const step = Math.min(SLIDE_SPEED * deltaTime, exit);
    if (exit === up) pos.y -= step;
    else if (exit === down) pos.y += step;
    else if (exit === left) pos.x -= step;
    else pos.x += step;
    return;
  }
}

/** REST only: slide every ground item and ingredient off the REST slots. */
export function slideLootOffRestSlots(game, deltaTime) {
  for (const item of game.items) slideOff(item, deltaTime);
  for (const ingredient of game.ingredients) slideOff(ingredient, deltaTime);
}
