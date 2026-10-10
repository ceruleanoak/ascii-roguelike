import { NeutralCharacter } from './NeutralCharacter.js';

/**
 * Storyteller — the REST NPC who speaks the player's Story.md (a Canon Edit
 * written in the CLI). His speech is the whole story; DialogueSystem tells
 * it one line per interaction, like every speaker's, and he starts it over
 * once it has been told.
 */
export class Storyteller extends NeutralCharacter {
  constructor(x, y, lines) {
    super('S', '#d8c8a0', x, y);
    this.lines = lines;
  }

  getDialogueLines() {
    return this.lines;
  }

  update(dt, game) {
    super.update(dt);
    this.updateTalkIndicator(game);
  }
}
