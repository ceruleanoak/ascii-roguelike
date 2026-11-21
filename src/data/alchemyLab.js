// The Alchemy Lab's floor (HutSystem.generateHutInterior, hutKind 'alchemy'), drawn as a
// map: one character per cell of the 12×12 hut floor, row 0 the north wall. GLOSSARY.md:
// Alchemy Lab. Reviewed through claudedocs/room-review-schematic.md (hut interior track).
//
// The room is split by its work. The west is the wet side: a pump on the wall feeds the
// trough, and the trough's overflow runs south into the earth floor and has made the mud
// pit. The east is the hot side: the cauldron's vapour leaves by a copper pipe for the
// condenser, whose worm drips into a flask; a flask once blew there. The cauldron joins
// the two on the door's axis, the first thing seen on entry, with the Alchemist behind it.
// What it spills is tracked down to the door and out into the Yard (the `stain` props in
// src/data/yards.js), and the Yard's shards answer the blown flask (rulebook E5).
//
// The walls carry the shelves (north) and the drying herbs (east). Wall cells are already
// solid and the hut overlay leaves them undrawn, so a prop there reads as hung on the
// wall and never stands in the way.
//
// Legend:
//   #  wall (no prop)              .  floor
//   T  Water Trough (station)      M  mud pit (plain mud_wet terrain, filled like any mud)
//   C  Cauldron Ω (station)        D  Condenser Ψ (station)
//   B  Empty Bottle, seeded        @  where the Alchemist stands (HutSystem._syncAlchemistHutPresence)
//   S  where the Stick Bundle lies when the hut rolls one: firewood by the fire
//   ∩  the exit door (HutSystem places it; exitCol = cols / 2)
//   any other character            a prop from LAB_PROPS below
//
// AlchemySystem finds the stations by glyph ('≈', 'Ω', 'Ψ'), so no prop may use one.
// The cauldron is used from an orthogonal neighbour (INTERACT_RADIUS 1.2 cells): (6,7)
// stays clear as the way up from the door. The trough and mud pit stand two rows apart
// (the runnel between), so no spot is within a bottle's reach (under one cell) of both.
export const LAB_MAP = [
  '##qj###klo##',
  '#..........#',
  'pTT.B......#',
  '#TTB....Dw.#',
  '#r......|f.#',
  '#MM...@.|s.x',
  '#MMM.eC-Lv.x',
  '#.M.S......#',
  '#.....1....#',
  '#....2.....#',
  '#......3...#',
  '######∩#####',
];

// Each prop is a `yard_prop` Background Object variant (src/game/GameConfig.js), as the
// Yards' are: glyph, colour, solidity and an optional customSprite. Every prop is dimmer
// than the trough (#5588dd, the dimmest station), so the stations read first (rulebook
// G4), and the mud pit is tinted up past the pipe (LAB_MUD_COLOR). `wide` glyphs are
// 16px: the cell east of one is left empty in LAB_MAP.
// The mud pit's tint: mud_wet's own #664422 sits below the pipe and the dressing, and the
// pit is a station (rulebook G4).
export const LAB_MUD_COLOR = '#8a6a40';

export const LAB_PROPS = {
  // Shelves on the north wall: stoppered and labelled jars, kept over the bench each
  // side uses (water-side jars west, the still's east).
  q: { name: 'jar',      char: '⍜', color: '#5a6a7a', solid: false },
  j: { name: 'jar',      char: '⌸', color: '#6a7a6a', solid: false },
  k: { name: 'jar',      char: '⍓', color: '#7a6a50', solid: false },
  l: { name: 'jar',      char: '⌺', color: '#6a5a7a', solid: false },
  // The jar everyone asks about (rulebook S6): a specimen jar full of eyes.
  o: { name: 'eye jar',  char: 'ꙮ', color: '#6a6448', solid: false, wide: true },
  // The pump on the west wall that fills the trough.
  p: { name: 'pump',     char: '⍡', color: '#6a7a8a', solid: false },
  // The trough's overflow, run off south into the floor, which made the mud pit.
  r: { name: 'runnel',   char: '⁝', color: '#4a6aa0', solid: false },
  // A spark from the fire under the cauldron, on the side away from the pipe.
  e: { name: 'spark',    char: '⁕', color: '#a04a24', solid: false },
  // The vapour pipe from the cauldron to the condenser, overhead, so it is walked under.
  '-': { name: 'pipe',   char: '─', color: '#7a5530', solid: false, sprite: 'pipeH' },
  '|': { name: 'pipe',   char: '│', color: '#7a5530', solid: false, sprite: 'pipeV' },
  L: { name: 'pipe',     char: '┘', color: '#7a5530', solid: false, sprite: 'pipeElbowWN' },
  // The condenser's coiled worm and the flask it drips into: the still stands as one piece.
  w: { name: 'worm',     char: '⧙', color: '#7a5530', solid: true },
  f: { name: 'flask',    char: '⍥', color: '#56706e', solid: true },
  // A flask that blew beside the still.
  s: { name: 'shards',   char: '⸪', color: '#4e6664', solid: false },
  // Herbs hung to dry on the east wall in the still's warmth.
  x: { name: 'herbs',    char: '⸙', color: '#5a7a3a', solid: false },
  // The mortar under the drying herbs, where they are ground.
  v: { name: 'mortar',   char: '⩌', color: '#8a8070', solid: true, wide: true },
  // Spills tracked from the cauldron to the door, the Yard's stain colours.
  1: { name: 'spill',    char: '∘', color: '#7a4aa0', solid: false },
  2: { name: 'spill',    char: '∘', color: '#3a7a46', solid: false },
  3: { name: 'spill',    char: '∘', color: '#9a5a26', solid: false },
};
