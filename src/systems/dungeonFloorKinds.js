// Floor Kinds (GLOSSARY.md) — the shared vocabulary of dungeon floor types a
// Dungeon Graph's nodes are built from. Every kind can appear in any zone's
// recipe; what differs per zone is how the graph wires them together.
//
// Each entry names the DungeonFloorGenerator method that builds the floor,
// and whether the visit's Skull Key may drop there (a bone pile among the
// floor's decor — only kinds that carry decor qualify).
//
// No imports, so the graph builder and the plain-Node graph check can read
// it alongside the game.

export const FLOOR_KINDS = {
  entrance:   { generate: (gen, ctx) => gen._generateEntrance(ctx), holdsSkullKey: true },
  corridor:   { generate: (gen, ctx) => gen._generateCorridor(ctx), holdsSkullKey: true },
  branch:     { generate: (gen, ctx) => gen._generateBranch(ctx),   holdsSkullKey: false },
  pyramid:    { generate: (gen, ctx) => gen._generatePyramid(ctx),  holdsSkullKey: false },
  vault:      { generate: (gen, ctx) => gen._generateVault(ctx),    holdsSkullKey: false },
  trapRoom:   { generate: (gen, ctx) => gen.generateTrapRoom(ctx),  holdsSkullKey: false },
  puzzleRoom: { generate: (gen, ctx) => gen.generatePuzzleRoom(ctx), holdsSkullKey: false },
};
