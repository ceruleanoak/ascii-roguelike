import { GRID, EQUIPMENT } from '../game/GameConfig.js';
import { CanonStore } from './CanonStore.js';
import { Storyteller } from '../entities/Storyteller.js';

// Below the armor slot, in REST's left column.
const STORYTELLER_ROW = 19;

/**
 * StorytellerSystem — the Storyteller in REST, speaking Story.md.
 *
 * Story.md is a Canon Edit (CanonStore `story`, one line per newline; it
 * starts with a default first line). While it holds a non-blank line, the
 * Storyteller stands in REST. DialogueSystem tells his story one line per
 * interaction, as it does every speaker's.
 *
 * Canon Edits change only in the CLI, which hands back to the game through a
 * reload, so the story is fixed for the page's life: the NPC is built once,
 * here, and kept (`this.npc`, null when Story.md is blank). His place in the
 * story therefore carries across deaths — the story is canon, not run state.
 */
export class StorytellerSystem {
  constructor(game) {
    this.game = game;
    const lines = CanonStore.load().story.split('\n').filter(line => line.trim());
    const C = GRID.CELL_SIZE;
    this.npc = lines.length ? new Storyteller(EQUIPMENT.ARMOR_X * C, STORYTELLER_ROW * C, lines) : null;
  }

  /** REST SPACE: the next line of the story, or close the line on screen. */
  trySpacePress() {
    const game = this.game;
    const npc = this.npc;
    if (!npc) return false;
    const dialogue = game.dialogueSystem;
    if (dialogue.getState()?.npc === npc) return dialogue.advance();
    if (!npc.isInRange(game.player)) return false;
    return dialogue.talk(npc);
  }

  update(dt) {
    const npc = this.npc;
    if (!npc) return;
    const game = this.game;
    npc.update(dt, game);
    if (game.dialogueSystem.getState()?.npc === npc) game.dialogueSystem.update();
  }
}
