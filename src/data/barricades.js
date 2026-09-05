import { ZONE_COLORS } from './zones.js';

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
 *   shape  what kind of question it asks (see below)
 *
 * shape 'material' — a plug of breakable Background Objects; the right tool
 * breaks them and that IS the clearing, so nothing polls it.
 *   char   the plug's glyph, for a plain BackgroundObject
 *   typeId a BACKGROUND_OBJECT_VARIANTS key, for a variant-built plug
 *          (mutually exclusive with `char`)
 *
 * shape 'trigger' — an unbreakable plug plus trigger fixtures scattered in the
 * room in front of it. The plug lifts when every fixture is active at once;
 * which tool can manage that is what the layout implies and never states.
 *   plugColor  the plug's tint, so the lane reads as its family at a glance
 *   triggers   fixture placements in lane coordinates (see laneCell in
 *              BarricadeSystem): `depth` counts cells inward from the wall the
 *              exit is in, `across` counts sideways from the exit's own
 *              column/row. Plus the triggerMachine fields — `kind`,
 *              `activation`, `neutralizeSeconds` — and optionally `conceal`,
 *              naming what the fixture hides under until it is uncovered.
 */

// The Three Room approach. Insisting north three times is the ask; insisting is
// not enough. Keyed to the north streak the run is already holding — one
// Barricade per room standing between the first north and the last, so the
// source is reached carrying a hammer and an axe or it is not reached at all.
export const STREAK_BARRICADES = {
  1: { id: 'rocks',           shape: 'material', char: '0' },              // a hammer, a blunt weapon, or the pickaxe
  2: { id: 'petrified_trees', shape: 'material', typeId: 'petrified_tree' } // an axe, three swings each
};

// ── The families ────────────────────────────────────────────────────────────
//
// Which Barricade a room can raise follows the exit letter's colour, so the
// colour a player is already reading for "where does this go" doubles as
// "what will it ask me for". One family per colour, and a colour with no
// family raises nothing.

// Green — craft gates. Every one is a trigger layout over an unbreakable plug,
// and every layout is a shape only one tool can satisfy: the tool is implied by
// the geometry and never named. Reachable from the green dungeon puzzle rooms'
// own vocabulary, which is where a player learns to read these.

// Two switches, two cells apart, both timed so tightly that no walk between
// them is fast enough — the whip's crack covers five collinear cells in one
// swing, so one crack from the side takes both. Numbers lifted from the
// original Whip Trial (dungeon puzzleTemplates/whip_trial.json), which is where
// this geometry was first taught.
const WHIP_LOCK = {
  id: 'whip_lock',
  shape: 'trigger',
  plugColor: ZONE_COLORS.green,
  triggers: [
    { depth: 4, across: -1, kind: 'switch', activation: 'timed', neutralizeSeconds: 0.25 },
    { depth: 4, across:  1, kind: 'switch', activation: 'timed', neutralizeSeconds: 0.25 }
  ]
};

// Three switches on a diagonal, each within one bounce of the next (see
// BoomerangMechanic's SWITCH_BOUNCE_RADIUS) but no two of them collinear, so
// the whip's straight five-cell crack can only ever take one at a time. The
// cooldown is generous by design — this is a reach problem, not a timing one,
// and a thrown boomerang chains all three on a single throw.
const BOOMERANG_LOCK = {
  id: 'boomerang_lock',
  shape: 'trigger',
  plugColor: ZONE_COLORS.green,
  triggers: [
    { depth: 3, across: -2, kind: 'switch', activation: 'timed', neutralizeSeconds: 1.2 },
    { depth: 5, across:  0, kind: 'switch', activation: 'timed', neutralizeSeconds: 1.2 },
    { depth: 7, across:  2, kind: 'switch', activation: 'timed', neutralizeSeconds: 1.2 }
  ]
};

// A floor panel that must be stood on, and a switch seven cells to the side of
// it — past the whip's five-cell reach, well inside a thrown spear's. Standing
// still is half the ask; the other half is a weapon that leaves your hand and
// still lands.
const SPEAR_LOCK = {
  id: 'spear_lock',
  shape: 'trigger',
  plugColor: ZONE_COLORS.green,
  triggers: [
    { depth: 3, across: -3, kind: 'panel',  activation: 'timed', neutralizeSeconds: 0.6 },
    { depth: 3, across:  4, kind: 'switch', activation: 'timed', neutralizeSeconds: 0.6 }
  ]
};

// One switch, and no sign that there is one — it sits under a tall grass tile
// and only a blade cut uncovers it. The same reveal the χ grass uses, asked as
// a gate instead of a secret.
const GRASS_LOCK = {
  id: 'grass_lock',
  shape: 'trigger',
  plugColor: ZONE_COLORS.green,
  triggers: [
    { depth: 4, across: 0, kind: 'switch', activation: 'permanent', conceal: 'grass' }
  ]
};

export const BARRICADE_FAMILIES = {
  green: [WHIP_LOCK, BOOMERANG_LOCK, SPEAR_LOCK, GRASS_LOCK],
  // Red — mastery gates, keyed to weapon-class upgrades. Deliberately empty:
  // a red exit raises nothing until they are authored, rather than borrowing
  // another family's question and calling it mastery.
  red: []
};

// Exit-letter colour → family. A colour absent here never raises a Barricade:
// gray is the Three Room's own signage and blue is Tidefall's fixed tutorial
// chain, and neither should start asking the run for tools.
export const FAMILY_BY_COLOR = {
  [ZONE_COLORS.green]: 'green',
  [ZONE_COLORS.red]: 'red'
};
