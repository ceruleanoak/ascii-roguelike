// Dungeon room exterior layouts — one char per 16×16 cell, 30×30 grid.
// Edit these via tools/dungeon-editor/ (Exterior mode) to redesign dungeon
// entrances per zone — grids live in src/data/dungeon/designs/*.json
// (Phase 0.4 of the dungeon-rework plan); this file just loads and re-exports
// them so every call site (RoomGenerator.generateDungeonRoom, etc.) stayed
// unchanged across the migration.
//
// # = border (skip)   . = empty floor (skip)
// ≡ = solid wall      ∩ = door (interactable, not solid — exactly one per zone)
// All other chars = decorative BackgroundObject (non-solid in this context)
//
// Face anatomy (same wall positions for all zones except yellow):
//   Row  6: forehead wall ≡ at cols 12-18, brow objects flanking at 9,21
//   Row  7: temple walls ≡ at cols 12,18
//   Row  8: eye objects at cols 10,20, temple walls ≡ at 12,18
//   Row  9: temple walls ≡ at cols 12,18
//   Row 10: jaw ≡≡≡∩≡≡≡ at cols 12-18, chin objects at 10,20
//   Row 11: chin-lower objects at cols 11,19
//
// Yellow is 9-wide: walls at 11-19, objects shifted one col outward.

import green from './dungeon/designs/green.json';
import red from './dungeon/designs/red.json';
import cyan from './dungeon/designs/cyan.json';
import yellow from './dungeon/designs/yellow.json';
import gray from './dungeon/designs/gray.json';

export const DUNGEON_DESIGNS = { green, red, cyan, yellow, gray };

export function getDungeonDesign(zone) {
  return DUNGEON_DESIGNS[zone] ?? DUNGEON_DESIGNS.green;
}
