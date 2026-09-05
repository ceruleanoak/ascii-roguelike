/**
 * barricades — the Barricade catalogue.
 *
 * A Barricade is something stamped across an exit lane that asks what the run
 * is carrying and answers by opening or not. Entries here are declarative
 * descriptors only; BarricadeSystem interprets them. Adding a Barricade means
 * adding a row here, not adding a branch to the system.
 *
 * Descriptor fields:
 *   id     stable identifier, used by the debug smoke tool and in save-free
 *          room state (`room.barricade.id`)
 *   shape  'material' — a plug of breakable Background Objects; the right tool
 *          breaks them and that IS the clearing, so nothing polls it
 *   char   the plug's glyph, for a plain BackgroundObject
 *   typeId a BACKGROUND_OBJECT_VARIANTS key, for a variant-built plug
 *          (mutually exclusive with `char`)
 */

// The Three Room approach. Insisting north three times is the ask; insisting is
// not enough. Keyed to the north streak the run is already holding — one
// Barricade per room standing between the first north and the last, so the
// source is reached carrying a hammer and an axe or it is not reached at all.
export const STREAK_BARRICADES = {
  1: { id: 'rocks',           shape: 'material', char: '0' },              // a hammer, a blunt weapon, or the pickaxe
  2: { id: 'petrified_trees', shape: 'material', typeId: 'petrified_tree' } // an axe, three swings each
};
