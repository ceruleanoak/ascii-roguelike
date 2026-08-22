// Weapon Trial registry — data only. Each entry names a weapon-tutorial
// dungeon room: which crafted weapon it teaches and the recipe pair its
// pedestal displays (grayed, decorative — see DungeonFloorGenerator.js's
// generatePuzzleRoom pedestal handling and HutInteriorOverlay.js's
// weaponPedestal render block).
//
// The room's own geometry (gap/post/switch/torch placement) now lives as a
// puzzle-room template (src/data/dungeon/puzzleTemplates/*.json, see
// dungeonPuzzleTemplates.js) rather than hardcoded per-tutorial — this file
// stays scoped to just the two things a template can't express: which
// crafted weapon the pedestal spawns and what its decorative recipe glyphs
// are. A second tutorial is still a data addition, not a rearchitecture, and
// `pickWeaponTutorial()` becomes a real selection once there's more than one
// entry to choose from.
export const WEAPON_TUTORIALS = {
  whip: {
    weaponChar: '≋',
    recipe: { left: '~', right: '~' },
  },
};

// Returns today's one tutorial. Future entries make this a real selection
// (weighted random, progression order, etc.) — not decided yet, see the
// plan doc's ADR-backlog note.
export function pickWeaponTutorial() {
  return WEAPON_TUTORIALS.whip;
}
