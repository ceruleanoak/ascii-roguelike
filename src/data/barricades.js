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
 *   decoys     optional placements, same lane coordinates, that get a concealing
 *              cover and nothing under it. A layout whose only cover IS the
 *              answer gives itself away; decoys make the cover ordinary again,
 *              so uncovering is a search rather than a single obvious tile.
 *
 * shape 'hazard' — terrain laid across the lane rather than a wall built in it.
 * The way through is open the whole time; what it costs is HP, and the answer
 * is a state the run arrives already carrying. Nothing lifts, nothing polls.
 *   typeId a BACKGROUND_OBJECT_VARIANTS key naming the terrain
 *
 * shape 'circuit' — an unbreakable plug flanked by two Electric Poles, one of
 * them already live. The plug lifts when a tripline of any kind runs between
 * them. WireSystem needs no new wire type for this; it needed only to accept a
 * pole as an anchor.
 *   plugColor  as for 'trigger'
 *   liveColor  the tint of the pole that is already carrying current, and of
 *              both poles once the circuit closes
 *   poles      two placements in the same lane coordinates the triggers use
 *
 * Every shape may also set the plug's own footprint, which otherwise defaults
 * to the 3-wide, 2-deep block that fills an exit gap:
 *   deep    how many cells inward from the wall the plug reaches (never fewer
 *           than 2 — see the restricted tile below)
 *   spread  how many cells to either side of the exit's own column/row
 *
 * The restricted tile: `depth 1, across 0` is where the exit letter is drawn,
 * and nothing may be stamped on it. laneCells notches the plug's footprint
 * there automatically, which is safe only because the cells in front of and
 * beside it are filled — hence the 2-deep floor. Fixture placements are NOT
 * notched, because a silently dropped trigger is an unopenable gate: author
 * `triggers` and `poles` clear of that cell yourself (the debug smoke tool
 * checks every family for it).
 */

// ── The families ────────────────────────────────────────────────────────────
//
// Which Barricade a room can raise follows the exit letter's colour, so the
// colour a player is already reading for "where does this go" doubles as
// "what will it ask me for". One family per colour, and a colour with no
// family raises nothing.

// Green — craft gates. Most are a trigger layout over an unbreakable plug, and
// every layout is a shape only one tool can satisfy: the tool is implied by the
// geometry and never named. Reachable from the green dungeon puzzle rooms' own
// vocabulary, which is where a player learns to read these.
//
// Two of them are plainer than that. Rocks and Petrified Trees are material
// plugs — swing the right thing at them and they are gone — and they were the
// first two Barricades the game had, back when the north streak named them
// itself. They stay in green because green is where the hammer and the axe are
// found, and because a family whose every member is a puzzle would teach that a
// plug is always a puzzle.

// A plug of rocks. A hammer, a blunt weapon, or the pickaxe.
const ROCKS = {
  id: 'rocks',
  shape: 'material',
  char: '0'
};

// A stand of Petrified Trees. An axe, three swings each.
const PETRIFIED_TREES = {
  id: 'petrified_trees',
  shape: 'material',
  typeId: 'petrified_tree'
};

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

// Three switches scattered so that no two of them ever share a line the whip
// can crack, each still within one bounce of the next (see BoomerangMechanic's
// SWITCH_BOUNCE_RADIUS) so a thrown boomerang chains all three on a single
// throw. The cooldown is generous by design — this is a reach problem, not a
// timing one.
//
// "A line the whip can crack" means eight of them, not four: the crack is a
// five-cell ray along player.facing, and facing is Math.sign()-quantized, so it
// fires along both diagonals as readily as along a row or a column. The first
// version of this layout was a tidy 45° stair — (3,-2), (5,0), (7,2) — which
// put all three switches on one of those diagonals and handed the gate to any
// whip. So the invariant is that no two switches share a depth, an across, or
// either diagonal: depth-across and depth+across must all differ too.
//
// One crack therefore takes exactly one switch, and a whip's swing cycle
// (windup 0.5 + recovery 1.45 in double-seconds, so ~0.98s real) puts the third
// strike about two seconds after the first — long past the 1.2s the first one
// stays live. Walking between them is free; being three places at once is not.
const BOOMERANG_LOCK = {
  id: 'boomerang_lock',
  shape: 'trigger',
  plugColor: ZONE_COLORS.green,
  triggers: [
    { depth: 3, across: -2, kind: 'switch', activation: 'timed', neutralizeSeconds: 1.2 },
    { depth: 5, across:  1, kind: 'switch', activation: 'timed', neutralizeSeconds: 1.2 },
    { depth: 8, across: -1, kind: 'switch', activation: 'timed', neutralizeSeconds: 1.2 }
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
//
// The stand it hides in is the whole point. A single tuft of grass planted in
// front of a plug is not concealment, it is a label; the decoys around it are
// what make the tile ordinary, so the answer is to cut the patch rather than to
// notice the odd one. They are scattered off the lane's centre line and out to
// either side of the switch, so no side of the stand can be skipped.
const GRASS_LOCK = {
  id: 'grass_lock',
  shape: 'trigger',
  plugColor: ZONE_COLORS.green,
  triggers: [
    { depth: 4, across: 0, kind: 'switch', activation: 'permanent', conceal: 'grass' }
  ],
  decoys: [
    { depth: 3, across: -2 },
    { depth: 3, across:  1 },
    { depth: 4, across: -1 },
    { depth: 4, across:  2 },
    { depth: 5, across: -2 },
    { depth: 5, across:  0 },
    { depth: 6, across:  1 }
  ]
};

// ── Yellow: mage gates ──────────────────────────────────────────────────────
// The elements, and what the run has learned to do about them. None of these
// wants a weapon in particular; each wants the player to have understood one
// reaction the world already runs everywhere else.

// Lava across the lane, deeper and wider than a plug needs to be so it reads as
// a moat rather than a wall. Nothing blocks the way and nothing lifts — walking
// it costs HP, and wet skin costs none (PhysicsSystem's lava-damage exemption).
// The water has to be found before the lava is: the moat is where the lesson is
// spent, not where it is learned.
const LAVA_MOAT = {
  id: 'lava_moat',
  shape: 'hazard',
  typeId: 'lava',
  deep: 3,
  spread: 2
};

// A wall of ice, one lick of flame per block. Every other refusal in the game
// names a weapon; this one names a temperature, so a Torch held for the light
// turns out to have been the key all along.
const ICE_BLOCKS = {
  id: 'ice_blocks',
  shape: 'material',
  typeId: 'barricade_ice'
};

// Two poles set well outside the plug, one already live. Any tripline strung
// between them closes the circuit — the answer is a line, not a current, so the
// Sticky Tripline works exactly as well as the Electric one. Spread wide enough
// that both ends cannot be placed without crossing in front of the plug.
const ELECTRIC_POLES = {
  id: 'electric_poles',
  shape: 'circuit',
  plugColor: ZONE_COLORS.yellow,
  liveColor: '#ffff88',
  poles: [
    { depth: 2, across: -4 },
    { depth: 2, across:  4 }
  ]
};

export const BARRICADE_FAMILIES = {
  green: [ROCKS, PETRIFIED_TREES, WHIP_LOCK, BOOMERANG_LOCK, SPEAR_LOCK, GRASS_LOCK],
  yellow: [LAVA_MOAT, ICE_BLOCKS, ELECTRIC_POLES],
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
  [ZONE_COLORS.yellow]: 'yellow',
  [ZONE_COLORS.red]: 'red'
};
