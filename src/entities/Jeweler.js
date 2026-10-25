import { NeutralCharacter } from './NeutralCharacter.js';
import { NPC_INTERACTION_RANGE, SHOP_INTERACTION_RANGE } from '../game/GameConfig.js';

const PARCHED_COLOR = '#777777';
const REFRESHED_COLOR = '#ff88ff';

/**
 * Jeweler — strings gems into necklaces (see JewelerSystem for the wares).
 *
 * Met first in a yellow J room, collapsed and begging for water: until the
 * run's `game.jewelerRefreshed` flag is set the Jeweler is dim, does not
 * pulse, and its only speech is the begging line. Giving a Bottle of Water or
 * a Health Potion (JewelerSystem.trySpacePress) sets the flag; from then on
 * SPACE opens the wares and the Jeweler has no speech — DialogueSystem skips
 * it the same way it skips the Shopkeeper.
 *
 * After the refresh the J room is never offered again this run, and the
 * Jeweler sits behind the counter beside the Shopkeeper in every Settlement
 * shop (HutSystem). `range` is that counter-gap radius there, the normal talk
 * radius in the J room.
 */
export class Jeweler extends NeutralCharacter {
  constructor(x, y, { behindCounter = false } = {}) {
    super('J', REFRESHED_COLOR, x, y);
    this.range = behindCounter ? SHOP_INTERACTION_RANGE : NPC_INTERACTION_RANGE;
    this.refreshed = false; // mirrored from game.jewelerRefreshed each update
  }

  isInRange(player, range = this.range) {
    return super.isInRange(player, range);
  }

  getDisplayColor() {
    return this.refreshed ? REFRESHED_COLOR : PARCHED_COLOR;
  }

  getPulseAlpha() {
    return this.refreshed ? super.getPulseAlpha() : this.pulseMin;
  }

  // Only the parched Jeweler speaks; a refreshed one is all business
  // (JewelerSystem owns SPACE). An empty speech makes DialogueSystem.open
  // decline, so the press falls through.
  getDialogueLines(game) {
    if (game?.jewelerRefreshed) return [];
    return ['WATER...'];
  }

  update(dt, game) {
    super.update(dt); // pulse animation
    this.refreshed = !!game?.jewelerRefreshed;
    this.updateTalkIndicator(game, this.range);
  }
}
