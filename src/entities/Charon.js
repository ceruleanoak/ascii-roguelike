import { NeutralCharacter } from './NeutralCharacter.js';

/**
 * Charon — the ferryman who bars REST's north exit once the player has
 * been deeper than L1. He speaks one line through the standard dialogue box,
 * takes his toll from the ingredient pile (CharonSystem), then fades out and
 * the exit reopens.
 */
export class Charon extends NeutralCharacter {
  constructor(x, y) {
    super('C', '#9fb4c8', x, y);
    // 1 while he stands at the exit; ticks to 0 as he leaves (CharonSystem).
    this.fade = 1;
  }

  getDialogueLines() {
    return ['YOUR BURDEN IS NOT LIGHT. LET ME CARRY IT FOR YOU. HAHAHA!'];
  }

  getPulseAlpha() {
    return super.getPulseAlpha() * this.fade;
  }

  update(dt, game) {
    super.update(dt);
    this.updateTalkIndicator(game);
  }
}
