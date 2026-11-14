import { NeutralCharacter } from './NeutralCharacter.js';

/**
 * Storyteller — the NPC met in EXPLORE Rooms who speaks the player's Story.md
 * (a Canon Edit written in the CLI). Each one carries the few lines of the
 * story StorytellerSystem dealt him; DialogueSystem tells them one line per
 * interaction, like every speaker's, and once they have all been told he has
 * nothing more to say. Each told line is reported back to StorytellerSystem,
 * which stops seating him once the whole story has been heard.
 */
export class Storyteller extends NeutralCharacter {
  /**
   * @param {string[]} lines — the lines he tells this visit
   * @param {number[]} storyIndices — each line's index in Story.md
   */
  constructor(x, y, lines, storyIndices) {
    super('S', '#d8c8a0', x, y);
    this.lines = lines;
    this.storyIndices = storyIndices;
  }

  getDialogueLines() {
    return this.spokenOnce ? [] : this.lines;
  }

  onLineTold(lineIndex, game) {
    game.storytellerSystem.markTold(this.storyIndices[lineIndex]);
  }

  update(dt, game) {
    super.update(dt);
    if (!this.spokenOnce) this.updateTalkIndicator(game);
    else this.clearIndicator();
  }
}
