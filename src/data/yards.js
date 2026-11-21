// Yards: the dressing outside a building that shows who lives there (rulebook E2),
// plus the Footpaths worn to its door and, in a Settlement, the Commons they meet at.
// Placed by src/systems/yardDressing.js. GLOSSARY.md: Yard, Footpath, Commons.
//
// Every prop is a `yard_prop` Background Object variant (src/game/GameConfig.js)
// with the glyph, colour and solidity below. Colours are pulled toward the zone's
// ground tone at placement (YARD_ZONE_TINT) so dressing stays duller than anything
// interactive (rulebook G4).

// name: { char, color, solid, wide?, sprite? }
//   wide   — a 16px glyph that spills into its east neighbour, so that cell must stay clear (G3)
//   sprite — drawn by src/rendering/sprites/customSprites.js instead of the glyph. Fences
//            and palisades must read as an unbroken run, and their glyphs are half width.
export const YARD_PROPS = {
  woodpile: { char: '≣', color: '#9a7448', solid: true },
  block:    { char: '⊼', color: '#7a5a3a', solid: true },
  scuff:    { char: '∴', color: '#6a5638', solid: false },
  stainP:   { char: '∘', color: '#8a4ab0', solid: false },
  stainG:   { char: '∘', color: '#4aa05a', solid: false },
  stainO:   { char: '∘', color: '#c07a30', solid: false },
  shards:   { char: '⸪', color: '#7aa0a0', solid: false },
  bucket:   { char: 'Ʊ', color: '#7a7a6a', solid: true },
  step:     { char: '◌', color: '#8a8a80', solid: false },
  standing: { char: '⍊', color: '#a0a090', solid: true },
  net:      { char: '⌗', color: '#7a8a7a', solid: true },
  boat:     { char: '◠', color: '#7a5a3a', solid: true },
  oar:      { char: '╱', color: '#8a6a44', solid: false },
  target:   { char: '⦾', color: '#8a4a36', solid: true, wide: true },
  tpost:    { char: 'ǁ', color: '#8a6a44', solid: true },
  rack:     { char: 'ǂ', color: '#9a9a9a', solid: true },
  blade:    { char: '⏚', color: '#9a9a9a', solid: false },
  crate:    { char: '▯', color: '#76603e', solid: true }, // not a square: ⊞ is the Chest
  track:    { char: '⁚', color: '#8a7a5a', solid: false },
  tuft:     { char: '⁞', color: null, solid: false }, // colour from YARD_ZONE_GRASS; '|' is Tall Grass
  claw:     { char: '⫽', color: '#9a5a4a', solid: false, wide: true },
  scraps:   { char: '⁙', color: '#8a8a80', solid: false },
  rune:     { char: 'ᚼ', color: '#a04a20', solid: false },
  sprout:   { char: '⸙', color: '#4a8a3a', solid: false },
  rod:      { char: '⊺', color: '#a08a40', solid: true }, // not an arrow: arrows are spears and daggers
  cinders:  { char: '∷', color: '#8a3a20', solid: false },
  lantern:  { char: '⍙', color: '#a0b0c0', solid: true },
  post:     { char: '╥', color: '#7a6648', solid: true, sprite: 'fencePost' },
  rail:     { char: '─', color: '#6a5638', solid: true, sprite: 'fenceRail' },
  vrail:    { char: '│', color: '#6a5638', solid: true, sprite: 'fenceRailV' },
  stake:    { char: '⍿', color: '#9a5a3a', solid: true, sprite: 'palisadeStake' },
  footpath: { char: '·', color: null, solid: false }, // colour from YARD_ZONE_PATH, untinted
};

// Each building kind's Yard: [dc, dr, prop, where] from the footprint's top-left
// cell. where: 'hut' = in a lone Hut and in a Settlement; 'settlement' = Settlement
// only (abundant); 'water' / 'dry' = only when the room has / lacks water.
// The same marks appear beside the Settlement's sign, where the player can read
// who lives there, so the lone Hut, which has no sign, can be read from them alone.
// Every prop stands where its job puts it (rulebook S7).
export const YARDS = {
  // Woodpile one cell off the west wall to keep it dry; the block where wood is split.
  press: [[-2, 1, 'woodpile', 'hut'], [-2, 2, 'woodpile', 'hut'], [-3, 3, 'block', 'hut'],
    [-3, 4, 'scuff', 'settlement'], [-2, 3, 'woodpile', 'settlement']],
  // Spills run downhill from the door; a bucket of rinse water at the corner.
  alchemy: [[3, 5, 'stainP', 'hut'], [1, 6, 'stainG', 'hut'], [5, 3, 'shards', 'hut'],
    [4, 7, 'stainO', 'settlement'], [0, 7, 'stainP', 'settlement'], [5, 4, 'bucket', 'settlement']],
  // The stepping stones are its Footpath (yardDressing lays them); a standing stone beside
  // them, and in a Settlement a second off the hut's far side.
  wise_man: [[4, 6, 'standing', 'hut'], [-2, 0, 'standing', 'settlement']],
  // Nets drying on the sunny side; the boat only when there is water to row on.
  fisherman: [[5, 1, 'net', 'hut'], [5, 2, 'net', 'hut'],
    [-2, 4, 'boat', 'water'], [-1, 4, 'boat', 'water'], [-2, 2, 'oar', 'water'], [-2, 2, 'oar', 'dry']],
  // The target stands south-east of the door step, with the practice post on the same
  // row, so the lane runs from the step to the target. Blades and scuffs where practice happens.
  weapons_master: [[7, 6, 'target', 'hut'], [4, 6, 'tpost', 'hut'], [-1, 1, 'rack', 'settlement'],
    [-1, 2, 'rack', 'settlement'], [7, 5, 'blade', 'settlement'], [4, 7, 'scuff', 'settlement'],
    [5, 7, 'scuff', 'settlement']],
  // Deliveries stacked on one side only.
  shopkeeper: [[-1, 4, 'crate', 'hut'], [-1, 3, 'crate', 'hut'], [-2, 4, 'crate', 'settlement']],
  shed: [[1, 3, 'track', 'hut'], [2, 4, 'track', 'hut'], [2, 5, 'track', 'hut'], [3, 6, 'track', 'hut']],
  // Claw marks trailing off south-east from the threshold: something came out of
  // this door and dragged its kill away. Not symmetric about the door (S7).
  enemy_encounter: [[3, 6, 'claw', 'hut'], [4, 7, 'claw', 'hut'], [5, 8, 'claw', 'hut'],
    [1, 5, 'scraps', 'hut']],
  // The Errand hut is bare on purpose (user, 2026-11-21).
  neutral_npc: [],
  witch: [[-2, 6, 'scraps', 'hut']],
  wizard: [[-3, 4, 'rune', 'hut'], [-5, 6, 'rune', 'hut'], [-1, 6, 'rune', 'hut'],
    [-3, 8, 'rune', 'hut']],
};

// Hostile huts get a Footpath that has gone to ruin: a few broken cells, and
// something cut across it. Every hut has a Footpath, so a path never gives away
// what lives inside.
export const YARD_HOSTILE_KINDS = new Set(['enemy_encounter', 'witch']);

// The ground tone each zone pulls its props toward (30%), and its Footpath and tuft colours.
export const YARD_ZONE_TINT = { green: '#3a4a30', yellow: '#4a4420', red: '#4a2418', cyan: '#3a4a60' };
export const YARD_ZONE_PATH = { green: '#6b5a3e', yellow: '#7a6a3a', red: '#6a4028', cyan: '#5a6c80' };
export const YARD_ZONE_GRASS = { green: '#3e6a34', yellow: '#6a6a2a', red: '#5a3a22', cyan: '#4a6a80' };

// What stands at the edge of each zone's Commons.
export const COMMONS_MARK = { green: 'crate', yellow: 'rod', red: 'cinders', cyan: 'lantern' };
