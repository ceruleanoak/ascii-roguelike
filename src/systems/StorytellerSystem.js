import { GRID, EQUIPMENT } from '../game/GameConfig.js';
import { CanonStore } from './CanonStore.js';
import { Storyteller } from '../entities/Storyteller.js';

// Below the armor slot, in REST's left column.
const STORYTELLER_ROW = 19;

/**
 * StorytellerSystem — the Storyteller in REST, speaking Story.md.
 *
 * Story.md is a Canon Edit (CanonStore `story`, one line per newline; it
 * starts with a default first line). While it holds a non-blank line, every
 * REST entry places the Storyteller. Each SPACE in range opens the dialogue
 * box on the next line, so the story is told one line per press, wrapping
 * back to the first after the last. Walking away closes the box.
 *
 * `cursor` (the next line to tell) lives on this system, not on game, so the
 * telling carries on across deaths: the story is canon, not run state.
 * The NPC is `this.npc` (null when Story.md is empty), rebuilt every REST
 * entry.
 */
export class StorytellerSystem {
  constructor(game) {
    this.game = game;
    this.npc = null;
    this.lines = [];
    this.cursor = 0;
  }

  onEnterRest() {
    this.lines = CanonStore.load().story.split('\n').filter(line => line.trim());
    this.npc = null;
    if (this.lines.length === 0) return;
    this.cursor %= this.lines.length;
    const C = GRID.CELL_SIZE;
    this.npc = new Storyteller(EQUIPMENT.ARMOR_X * C, STORYTELLER_ROW * C);
  }

  /** REST SPACE: tell the next line — a press with the box open moves it on. */
  trySpacePress() {
    const game = this.game;
    const npc = this.npc;
    if (!npc) return false;
    const dialogue = game.dialogueSystem;
    const speaking = dialogue.isOpen() && dialogue.getState().npc === npc;
    if (!speaking && !npc.isInRange(game.player)) return false;
    npc.line = this.lines[this.cursor];
    this.cursor = (this.cursor + 1) % this.lines.length;
    return dialogue.open(npc, npc.getDialogueLines(game));
  }

  update(dt) {
    const npc = this.npc;
    if (!npc) return;
    const game = this.game;
    npc.update(dt, game);
    if (game.dialogueSystem.getState()?.npc === npc) game.dialogueSystem.update();
  }
}
