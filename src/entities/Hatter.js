import { NeutralCharacter } from './NeutralCharacter.js';

// Fixed order, not a random roll — this is a scripted little monologue, not
// an advice pool (contrast WiseFellow/Fisherman, which roll one saying from
// many). SPACE advances line by line via the standard DialogueSystem.
const LINES = [
  "PEOPLE WHO DON'T THINK SHOULDN'T TALK.",
  "JUST BECAUSE I'M MAD DOESN'T MEAN I'M NOT RIGHT.",
  'TIME IS DROWNING, HEARTS ARE BURNING',
  "A DREAM IS NOT REALITY, BUT WHO'S TO SAY WHICH IS WHICH",
  'AND THE MOMERATHS OUTGRABE'
];

/**
 * Hatter — the Tea Party's sole NPC, seated at the room's table. The room is
 * reached only via the T-E-A / E-A-T / A-T-E / H-A-T secret exit sequences
 * (see SECRET_PATTERNS in data/exitLetters.js). Speech goes through the
 * standard DialogueSystem protocol (getDialogueLines + SPACE in talk range)
 * — never the narrator's center-screen voice.
 */
export class Hatter extends NeutralCharacter {
  constructor(x, y) {
    super('h', '#ff8833', x, y);
  }

  getDialogueLines() {
    return LINES;
  }

  update(dt, game) {
    super.update(dt); // pulse animation
    this.updateTalkIndicator(game);
  }
}
