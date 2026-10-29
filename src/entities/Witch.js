import { GRID } from '../game/GameConfig.js';
import { NeutralCharacter } from './NeutralCharacter.js';
import { CAMP_NPC_STATE } from './CampNPC.js';

const CONTACT_RANGE = GRID.CELL_SIZE * 0.9;

// Placeholder lines (author to tune): her Cursed Run offer, and her answer when taken up on it.
const CURSED_OFFER = 'YOU CARRY IT.\nLET ME COME.';
const CURSED_JOIN = 'I WILL WALK\nWITH YOU.';

/**
 * Witch — most-rare hut interior NPC. On player contact she curses the player
 * into frog form (polymorph). Once the frog speaks to her (SPACE — her Frog
 * Line, data/frogLines.js) she sets them to work and changes them back;
 * `released` keeps her from cursing again for the rest of the visit.
 *
 * Does NOT call PolymorphSystem directly — HutSystem.update() polls
 * this.triggered each frame and fires the transformation there, keeping
 * the dependency graph clean.
 *
 * On a Cursed Run she fears what the player has done (three-voice-plan.md §8):
 * no curse, and she speaks instead. The first telling is her offer; talking
 * to her again takes her up on it, and she follows as the companion, hexing
 * enemies into Frogs (`hexesAsCompanion` → HexSystem). While another
 * companion follows she only repeats the offer.
 */
export class Witch extends NeutralCharacter {
  constructor(x, y) {
    super('W', '#9955cc', x, y);
    this.persuadeRefusal = 'NOT FOR YOU.\nNOT FOR IT.'; // placeholder; she fears the Three too
    this.triggered = false;
    this.released = false;
    this.entryTimer = null; // starts on the first update frame after hut entry
    this.hexesAsCompanion = true; // as a companion she casts the Hex Witch's curse (HexSystem)
  }

  update(dt, game) {
    super.update(dt); // pulse animation
    if (game?.cursedRun) {
      this.updateTalkIndicator(game);
      return; // she fears the curse too much to cast one
    }
    if (this.triggered || this.released || !game?.player) return;
    if (game.player.polymorphed) return; // already a frog

    // Trigger 0.5s after the player enters the hut (first update frame starts the clock)
    if (this.entryTimer === null) this.entryTimer = 0;
    this.entryTimer += dt;
    if (this.entryTimer >= 0.5) {
      this.triggered = true;
    }
  }

  // Only a Cursed Run gives her anything to say to the player's face.
  getDialogueLines(game) {
    if (!game.cursedRun) return [];
    const companion = game.companion;
    const oneFollows = companion && companion.state !== CAMP_NPC_STATE.FLEEING;
    if (!this.spokenOnce || oneFollows) return [CURSED_OFFER];
    game.campNPCSystem.takeFollower(this);
    return [CURSED_JOIN];
  }

  // DialogueSystem.frogSpacePress() calls this when her line closes.
  onFrogLineTold(game) {
    if (this.released) return;
    this.released = true;
    game.polymorphSystem?.deactivatePolymorph(game);
  }
}
