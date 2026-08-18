// Weapon Trial registry — data only. Each entry names a weapon-tutorial
// dungeon room: which crafted weapon it teaches and the recipe pair its
// pedestal displays (grayed, decorative — see DungeonFloorGenerator.js's
// generateWhipTrial and HutInteriorOverlay.js's weaponPedestal render block).
//
// The room-construction logic (gap/post/switch geometry) stays hardcoded to
// the Whip's actual shape in DungeonFloorGenerator.js rather than being
// generalized here — with a sample size of one tutorial, a real "puzzle
// shape" abstraction can't be honestly designed yet. This file exists so a
// second tutorial is a data addition, not a rearchitecture, and so
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
