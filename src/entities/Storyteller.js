import { NeutralCharacter } from './NeutralCharacter.js';

/**
 * Storyteller — the NPC met in EXPLORE Rooms who speaks the player's Story.md
 * (a Canon Edit written in the CLI). Each one carries the few lines of the
 * story StorytellerSystem dealt him; DialogueSystem tells them one line per
 * interaction, like every speaker's, and once they have all been told he has
 * nothing more to say.
 */
export class Storyteller extends NeutralCharacter {
  constructor(x, y, lines) {
    super('S', '#d8c8a0', x, y);
    this.lines = lines;
  }

  getDialogueLines() {
    return this.spokenOnce ? [] : this.lines;
  }

  update(dt, game) {
    super.update(dt);
    if (!this.spokenOnce) this.updateTalkIndicator(game);
    else this.clearIndicator();
  }
}
