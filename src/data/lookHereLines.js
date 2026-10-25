// LOOKHERE lines — what the THREE says about each interactive thing in the
// room when the player casts LOOKHERE (src/systems/lookHere.js). One line per
// kind of thing, listed enemies → objects/structures → NPCs → loot → what the
// player could do here.
//
// The rule every line keeps: at most LOOK_HERE_LINE_LIMIT letters, spaces not
// counted (`npm run check:data` fails an authored line past it). An item or
// ingredient is never named — loot is only ever VARIOUS ITEMS (spell-catalogue
// grammar 6).
//
// Anything without a line here is not listed: walls, decor, hut shells, and
// anything a line would give away (a Secret Vein Rock, a Bombable Wall).
import { AlchemistNPC } from '../entities/AlchemistNPC.js';
import { Jeweler } from '../entities/Jeweler.js';
import { Shopkeeper } from '../entities/Shopkeeper.js';
import { WiseFellow } from '../entities/WiseFellow.js';

export const LOOK_HERE_LINE_LIMIT = 15;

/** Letters in a line, as the limit counts them (spaces are free). */
export function lookHereLetters(line) {
  return line.replace(/ /g, '').length;
}

// Background Objects, keyed by `data.name` so a variant (Lava, Hot Water, a
// Push Rock) answers for itself rather than for the glyph it borrows. Rocks
// that pass for a Rock (Cavern, Bombable, Push) say so — the line never tells
// the player more than the glyph does.
export const LOOK_HERE_OBJECT_LINES = {
  'Tall Grass':     'YOU SEE TALL GRASS',
  'Tree':           'YOU SEE A TREE',
  'Petrified Tree': 'YOU SEE A TREE',
  'Rock':           'YOU SEE A ROCK',
  'Fractured Rock': 'YOU SEE A ROCK',
  'Glittering Rock': 'YOU SEE A ROCK',
  'Cavern Rock':    'YOU SEE A ROCK',
  'Bombable Rock':  'YOU SEE A ROCK',
  'Push Rock':      'YOU SEE A ROCK',
  'Boulder':        'YOU SEE A BOULDER',
  'Bush':           'YOU SEE A BUSH',
  'Ember Bush':     'YOU SEE A BUSH',
  'Stump':          'YOU SEE A STUMP',
  'Shrub':          'YOU SEE A SHRUB',
  'Brambles':       'YOU SEE BRAMBLES',
  'Mushroom':       'YOU SEE MUSHROOMS',
  'Crystal':        'YOU SEE CRYSTAL',
  'Sand':           'YOU SEE SAND',
  'Water':          'YOU SEE WATER',
  'Puddle':         'YOU SEE WATER',
  'Hot Water':      'YOU SEE HOT WATER',
  'Lava':           'YOU SEE LAVA',
  'Ice':            'YOU SEE ICE',
  'Fire':           'YOU SEE FIRE',
  'Wet Mud':        'YOU SEE MUD',
  'Dry Mud':        'YOU SEE MUD',
  'Crate':          'YOU SEE A CRATE',
  'Barrel':         'YOU SEE A BARREL',
  'Chest':          'YOU SEE A CHEST',
  'Metal Box':      'YOU SEE A BOX',
  'Lock Block':     'YOU SEE A LOCK',
  'Shrine':         'YOU SEE A SHRINE',
  'Tomb':           'YOU SEE A TOMB',
  'Open Tomb':      'YOU SEE A TOMB',
  'Well Stone':     'YOU SEE A WELL',
  'Press':          'YOU SEE A PRESS',
  'Fireplace':      'A FIREPLACE',
};

// Room structures that are not one Background Object.
export const LOOK_HERE_STRUCTURE_LINES = {
  hut:     'YOU SEE A HUT',
  shop:    'YOU SEE A SHOP',    // a Settlement's Shopkeeper hut, or the Shopkeeper's counter inside it
  cave:    'YOU SEE A CAVE',    // an opened Cavern; one still behind its rock is a Rock
  maze:    'YOU SEE A MAZE',
  satchel: 'YOU SEE A SATCHEL', // REST's starter Satchel, until it is opened
};

// NPCs that read as a structure rather than a person: listed with the objects.
export const LOOK_HERE_NPC_STRUCTURES = new Map([
  [Shopkeeper, LOOK_HERE_STRUCTURE_LINES.shop],
]);

// NPCs, keyed by class. A speaker missing here is SOMEONE IS HERE.
export const LOOK_HERE_NPC_LINES = new Map([
  [Jeweler,      'A THIRSTY PERSON'],
  [WiseFellow,   'A WISE PERSON'],
  [AlchemistNPC, 'A CURIOUS PERSON'],
]);

export const LOOK_HERE_UNNAMED_SPEAKER = 'SOMEONE IS HERE';
export const LOOK_HERE_LOOT = 'VARIOUS ITEMS';
export const LOOK_HERE_CAN_CRAFT = 'YOU CAN CRAFT';
export const LOOK_HERE_CAN_EQUIP = 'YOU CAN EQUIP';

// An enemy is NAME DRAWS NEAR, or the first shorter form that keeps the limit.
export const LOOK_HERE_ENEMY_FORMS = [
  name => `${name} DRAWS NEAR`,
  name => `${name} NEARS`,
  name => name,
];
export const LOOK_HERE_UNNAMED_ENEMY = 'SOMETHING NEARS';
