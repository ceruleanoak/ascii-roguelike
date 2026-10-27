// Dungeon Recipes (GLOSSARY.md) — each zone's rules for rolling a Dungeon
// Graph at the start of a visit. One JSON file per zone under
// src/data/dungeon/recipes/, registered automatically by file name (the same
// import.meta.glob convention as the floor and puzzle templates). A zone with
// no recipe of its own uses Green's.
//
// Recipe fields (all read by src/systems/dungeonGraphBuilder.js):
//   boss          which dungeonBosses/<zone>.js spec guards the Vault
//   corridors     [min, max] corridors between the Entrance and the Branch
//   shapes        { chain: weight } — how the corridor layer connects
//   branchPuzzle  the Reveal on the Branch → Pyramid edge (the zone's
//                 sub-solve; 'panels' is Green's floor-panel NPC puzzle)
//   sideRooms     { trial: host kind, trapRoom: [host kinds] } — which floor
//                 kind each side room hangs off, rolled per visit
//   diagonals     { chance, reveals } — the per-visit chance of one Hidden
//                 Descent, and the Reveals that may open it
//   keyGate       { pushChance } — the per-visit chance of a gate rock
//                 beside the Skull Key's door (a hidden 'push' edge)
//
// Yellow, Red, Cyan and Gray are drafts awaiting the user's revision
// (claudedocs/dungeon-recipes.md). Their `branchPuzzle` ('panels') and
// `boss` ('green') are placeholders until each zone's own puzzle and boss
// are designed.

import { validateRecipe } from '../systems/dungeonGraphBuilder.js';

const RECIPE_FILES = import.meta.glob('./dungeon/recipes/*.json', { eager: true, import: 'default' });
const recipeNameOf = filePath => filePath.split('/').pop().replace(/\.json$/, '');

export const DUNGEON_RECIPES = Object.fromEntries(
  Object.entries(RECIPE_FILES)
    .map(([filePath, data]) => [recipeNameOf(filePath), data])
    .filter(([name, data]) => {
      const errors = validateRecipe(data);
      if (errors.length) console.warn(`[dungeonRecipes] "${name}" left out: ${errors[0]}`);
      return errors.length === 0;
    })
);

/** The Dungeon Recipe a zone's D-rooms roll their graphs from. */
export function getDungeonRecipe(zone) {
  return DUNGEON_RECIPES[zone] ?? DUNGEON_RECIPES.green;
}
