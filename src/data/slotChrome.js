// Slot chrome — the one visual vocabulary every Slot in the game is drawn with.
//
// A Slot is always three cells: '[' + a single content cell + ']'. That shape
// never varies; only the color pair does. Rest-mode equipment Slots
// (EquipmentSlots.js) color their brackets by item family — weapon, armor,
// consumable, mana — because there the player is choosing what to equip and
// the family is the useful signal. Slots that stand in the world as masonry
// share the stone pair below: the Puzzle Room's weapon pedestal and the
// Pyramid's three Legend of Three registers.
//
// A world Slot always shows the glyph of the item it wants, dimmed in PENDING
// until it's satisfied, then repainted in that item's own color. That is the
// whole non-instructive contract — the Slot names its own requirement, so
// nothing has to tell the player what goes in it.

export const SLOT_CHROME = {
  BRACKET_LEFT:  '[',
  BRACKET_RIGHT: ']',
  STONE:   '#554f3d', // bracket frame of a Slot built into the world
  PENDING: '#8a8470', // the wanted glyph, before the Slot is satisfied
};
