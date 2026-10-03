import { Fairy } from './Fairy.js';

// Fairy King — 1 in FAIRY_KING_ODDS fairies, a deeper pink. Touching it does
// nothing (no heal, no blessing): it speaks instead, through the standard
// DialogueSystem protocol (getDialogueLines + SPACE in talk range), and points
// the player at the fountain's gem offering. An armed Empty Bottle still
// catches it — as a Fairy King in a Bottle ('♔', InteractionSystem.tryBottleFairy).
//
// Appears two ways, equally rare:
//   wild     — any wild fairy spawn rolls for it (createWildFairy). Flutters
//              indefinitely rather than fleeing to dust an exit, so it is
//              still there when the player comes over to listen.
//   fountain — FountainSystem's ambient flock rolls once per seeding. Ambient
//              fairies belong to the fountain, so this one only talks.

export const FAIRY_KING_ODDS = 100;
export const FAIRY_KING_COLOR = '#ff3fa0';

const LINES = ["OFFER A GEM IN MY FOUNTAIN TO RECEIVE A KING'S BLESSING"];

// States in which the King holds court. Angered (corrupted fountain) or
// carrying, it's a fairy on an errand, not a speaker.
const TALKING_STATES = new Set(['flutter', 'ambient']);

export class FairyKing extends Fairy {
  constructor(x, y, exits, opts = {}) {
    super(x, y, exits, { ...opts, flutterDuration: Infinity });
    this.color = FAIRY_KING_COLOR;
  }

  getDialogueLines() {
    return TALKING_STATES.has(this.state) ? LINES : [];
  }

  update(deltaTime, game) {
    super.update(deltaTime, game);
    if (TALKING_STATES.has(this.state)) this.updateTalkIndicator(game);
  }
}

export function rollFairyKing() {
  return Math.random() * FAIRY_KING_ODDS < 1;
}

// A fairy for a wild spawn site (fairy grass, fishing, Oasis): a King on the
// 1-in-FAIRY_KING_ODDS roll, an ordinary Fairy otherwise.
export function createWildFairy(x, y, exits, opts = {}) {
  return rollFairyKing() ? new FairyKing(x, y, exits, opts) : new Fairy(x, y, exits, opts);
}
