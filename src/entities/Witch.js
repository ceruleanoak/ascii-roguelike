import { GRID } from '../game/GameConfig.js';
import { NeutralCharacter } from './NeutralCharacter.js';

const CONTACT_RANGE = GRID.CELL_SIZE * 0.9;

/**
 * Witch — most-rare hut interior NPC. On player contact she curses the player
 * into frog form (polymorph). Once the frog speaks to her (SPACE — her Frog
 * Line, data/frogLines.js) she sets them to work and changes them back;
 * `released` keeps her from cursing again for the rest of the visit.
 *
 * Does NOT call PolymorphSystem directly — HutSystem.update() polls
 * this.triggered each frame and fires the transformation there, keeping
 * the dependency graph clean.
 */
export class Witch extends NeutralCharacter {
  constructor(x, y) {
    super('W', '#9955cc', x, y);
    this.persuadeRefusal = 'NOT FOR YOU.\nNOT FOR IT.'; // placeholder; she fears the Three too
    this.triggered = false;
    this.released = false;
    this.entryTimer = null; // starts on the first update frame after hut entry
  }

  update(dt, game) {
    super.update(dt); // pulse animation
    if (this.triggered || this.released || !game?.player) return;
    if (game.player.polymorphed) return; // already a frog

    // Trigger 0.5s after the player enters the hut (first update frame starts the clock)
    if (this.entryTimer === null) this.entryTimer = 0;
    this.entryTimer += dt;
    if (this.entryTimer >= 0.5) {
      this.triggered = true;
    }
  }

  // DialogueSystem.frogSpacePress() calls this when her line closes.
  onFrogLineTold(game) {
    if (this.released) return;
    this.released = true;
    game.polymorphSystem?.deactivatePolymorph(game);
  }
}
