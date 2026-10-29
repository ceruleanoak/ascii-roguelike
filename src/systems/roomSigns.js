import { GRID } from '../game/GameConfig.js';
import { RECIPES } from '../data/recipes.js';
import { SPELL_SIGN_SPELLS, wishSpellNames } from '../data/spells.js';
import { applyCipher } from '../data/cipher.js';

// Room signs — secret writing in the earth, hidden inside a grass cluster and
// drawn under the grass (ExploreRenderer, background layer). Visual-only data
// on the room, never BackgroundObjects, so water/fire/physics never touch them.
//
//   Recipe Sign — a Recipe written out as `X + Y = Z`, plain glyphs.
//   Spell Sign  — a no-unlock spell word in the Greek cipher; the Spectacles
//                 (⊙) read it as English. On a Cursed Run it is a Cursed
//                 Spell Sign: a Wish Spell's name instead — the curse teaches
//                 the words the curse made you pay for.
//
// Each sign rolls independently, so a Spell Sign never changes how often a
// Recipe Sign appears. When both land in one room they never share a cell.

const EARTH_COLOR = '#333333'; // Dark gray - mysterious writing in the earth
const RECIPE_SIGN_CHANCE = 0.13;
const SPELL_SIGN_CHANCE = RECIPE_SIGN_CHANCE / 2;
const RECIPE_SIGN_WIDTH = 11;

export function generateRecipeSign(room, grassClusters) {
  if (Math.random() >= RECIPE_SIGN_CHANCE) return;
  const recipe = RECIPES[Math.floor(Math.random() * RECIPES.length)];
  const spot = findSignSpot(room, grassClusters, RECIPE_SIGN_WIDTH);
  if (!spot) return;

  const pattern = [
    { col: 0, char: recipe.left },   // Recipe left item
    { col: 2, char: '+' },           // Plus operator
    { col: 4, char: recipe.right },  // Recipe right item
    { col: 6, char: '=' },           // Equals operator
    { col: 8, char: recipe.result }  // Recipe result
  ];
  room.recipeSign = {
    recipe,
    characters: pattern.map(({ col, char }) => signGlyph(char, spot.row, spot.col + col))
  };
}

export function generateSpellSign(room, grassClusters, { cursed = false } = {}) {
  if (Math.random() >= SPELL_SIGN_CHANCE) return;
  const pool = cursed ? wishSpellNames() : SPELL_SIGN_SPELLS;
  const spell = pool[Math.floor(Math.random() * pool.length)];
  const spot = findSignSpot(room, grassClusters, spell.length);
  if (!spot) return;

  room.spellSign = {
    spell,
    characters: [...spell].map((letter, i) => signGlyph(applyCipher(letter), spot.row, spot.col + i))
  };
}

function signGlyph(char, row, col) {
  return { char, x: col * GRID.CELL_SIZE, y: row * GRID.CELL_SIZE, color: EARTH_COLOR };
}

// A 1-row strip of `width` cells near the center of a random grass cluster
// (inner 50% of its radius, for good grass coverage). Null when the room has
// no grass or 30 tries find no clear strip.
function findSignSpot(room, grassClusters, width) {
  if (!grassClusters || grassClusters.length === 0) return null; // Need grass to hide the sign
  const cluster = grassClusters[Math.floor(Math.random() * grassClusters.length)];

  for (let attempt = 0; attempt < 30; attempt++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = Math.random() * (cluster.radius * 0.5);
    const col = Math.floor((cluster.center.x + Math.cos(angle) * dist) / GRID.CELL_SIZE);
    const row = Math.floor((cluster.center.y + Math.sin(angle) * dist) / GRID.CELL_SIZE);

    if (row >= 2 && row < GRID.ROWS - 2 &&
        col >= 2 && col < GRID.COLS - 11 &&
        canPlaceSign(room, row, col, width)) {
      return { row, col };
    }
  }
  return null;
}

function canPlaceSign(room, row, startCol, width) {
  const endCol = startCol + width;

  for (let col = startCol; col < endCol; col++) {
    if (room.collisionMap[row][col]) return false; // Overlaps with wall
  }

  for (const bgObj of room.backgroundObjects) {
    if (!bgObj?.data?.solid) continue;
    const objCol = Math.floor(bgObj.position.x / GRID.CELL_SIZE);
    const objRow = Math.floor(bgObj.position.y / GRID.CELL_SIZE);
    if (objRow === row && objCol >= startCol && objCol < endCol) return false; // Overlaps with solid object
  }

  // Never write over the other sign. Its whole footprint counts (the gaps
  // between a Recipe Sign's glyphs too), so the two never read as one line.
  for (const other of [room.recipeSign, room.spellSign]) {
    const glyphs = other?.characters;
    if (!glyphs?.length) continue;
    const otherRow = Math.floor(glyphs[0].y / GRID.CELL_SIZE);
    if (otherRow !== row) continue;
    const otherStart = Math.floor(glyphs[0].x / GRID.CELL_SIZE);
    const otherEnd = Math.floor(glyphs[glyphs.length - 1].x / GRID.CELL_SIZE) + 1;
    if (startCol < otherEnd + 1 && otherStart < endCol + 1) return false;
  }

  return true;
}
