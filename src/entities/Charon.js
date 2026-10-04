import { NeutralCharacter } from './NeutralCharacter.js';

// One line per voice: the ferryman's, the one a Cursed Run hears while he
// still keeps his post, and his goodbye over a REST the curse has taken.
const LINES = {
  ferry: 'YOUR BURDEN IS NOT LIGHT. LET ME CARRY IT FOR YOU. HAHAHA!',
  cursed: 'IS THIS REALLY THE WAY YOU INTEND TO GO? HAHAHA!',
  farewell: 'FAREWELL, CHUM. HAHAHA!',
};

/**
 * Charon — the ferryman who bars REST's north exit once the player has
 * been deeper than L1. He speaks one line through the standard dialogue box,
 * takes his toll from the ingredient pile (CharonSystem), then fades out and
 * the exit reopens. A Cursed Run changes his line (`voice`).
 */
export class Charon extends NeutralCharacter {
  constructor(x, y, voice = 'ferry') {
    super('C', '#9fb4c8', x, y);
    // 'ferry' | 'cursed' | 'farewell' — which line he speaks (CharonSystem).
    this.voice = voice;
    // 1 while he stands at the exit; ticks to 0 as he leaves (CharonSystem).
    this.fade = 1;
  }

  getDialogueLines() {
    return [LINES[this.voice]];
  }

  getPulseAlpha() {
    return super.getPulseAlpha() * this.fade;
  }

  update(dt, game) {
    super.update(dt);
    this.updateTalkIndicator(game);
  }
}
