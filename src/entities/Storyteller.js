import { NeutralCharacter } from './NeutralCharacter.js';

/**
 * Storyteller — the REST NPC who speaks the player's Story.md (a Canon Edit
 * written in the CLI), one line per SPACE. StorytellerSystem owns which line
 * comes next; the Storyteller only says the line it is handed.
 */
export class Storyteller extends NeutralCharacter {
  constructor(x, y) {
    super('S', '#d8c8a0', x, y);
    this.line = '';
  }

  getDialogueLines() {
    return [this.line];
  }

  update(dt, game) {
    super.update(dt);
    this.updateTalkIndicator(game);
  }
}
