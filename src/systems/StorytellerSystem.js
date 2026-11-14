import { CanonStore } from './CanonStore.js';
import { Storyteller } from '../entities/Storyteller.js';
import { GRID, ROOM_TYPES } from '../game/GameConfig.js';

// Lines of Story.md told per visit; then he has nothing more for that Room.
const LINES_PER_VISIT = 3;

/**
 * StorytellerSystem — the Storyteller, met out in EXPLORE, speaking Story.md.
 *
 * Story.md is a Canon Edit (CanonStore `story`, one line per newline; it
 * starts with a default first line). While it holds a non-blank line, the
 * Storyteller sits at the campsite — the Camp Room's campfire, one cell west
 * of the fire, across it from the CampNPC — and nowhere else. The red Camp
 * (the Caldera) has no campfire, so he is not met there.
 * Each visit carries the next LINES_PER_VISIT lines of the story; DialogueSystem
 * tells them one per interaction, as it does every speaker's, and once they
 * are told he goes quiet. The next Room he turns up in picks the story up
 * where he left it, wrapping to the start after the last line.
 *
 * Once every line of Story.md has been told at least once (the first full
 * readthrough), he is not seated in any Room entered after that. Rooms that
 * already hold him keep him, told out.
 *
 * Canon Edits change only in the CLI, which hands back to the game through a
 * reload, so the story is fixed for the page's life and read once, here. His
 * place in the story carries across deaths — the story is canon, not run state.
 *
 * Whether a Room holds him is rolled once, on first entry, and remembered per
 * Room (a WeakMap, so it goes when the Room does): walking back into a Room
 * finds him there again — already told out — or not at all.
 */
export class StorytellerSystem {
  constructor(game) {
    this.game = game;
    this.lines = CanonStore.load().story.split('\n').filter(line => line.trim());
    // Index of the next untold line of Story.md.
    this.cursor = 0;
    // Indices of the Story.md lines told at least once. Like the cursor, it
    // lives for the page's life and carries across deaths.
    this.toldLines = new Set();
    // Room → Storyteller (or null: rolled, and he is not there).
    this.visits = new WeakMap();
  }

  /** True once every line of Story.md has been told at least once. */
  storyHeardOut() {
    return this.lines.length > 0 && this.toldLines.size >= this.lines.length;
  }

  /** A Storyteller told line `storyIndex` of Story.md (Storyteller.onLineTold). */
  markTold(storyIndex) {
    this.toldLines.add(storyIndex);
  }

  /**
   * Room entry (spawnRoomNeutralCharacters): the Storyteller this Room holds,
   * deciding on first entry. Only a Camp Room with its campfire holds him,
   * and only until the story has been heard out.
   */
  storytellerFor(room) {
    if (this.visits.has(room)) return this.visits.get(room);
    const campfire = this.lines.length && !this.storyHeardOut() && room.type === ROOM_TYPES.CAMP
      ? room.backgroundObjects.find(obj => obj.isCampfire && !obj.destroyed)
      : null;
    const npc = campfire ? this._placeAtFire(campfire) : null;
    this.visits.set(room, npc);
    return npc;
  }

  // One cell west of the fire — the cell generateCampRoom keeps clear for him.
  _placeAtFire(campfire) {
    const { lines, storyIndices } = this._nextChunk();
    return new Storyteller(campfire.position.x - GRID.CELL_SIZE, campfire.position.y, lines, storyIndices);
  }

  /** The next LINES_PER_VISIT lines of Story.md and their indices, advancing the cursor. */
  _nextChunk() {
    const n = Math.min(LINES_PER_VISIT, this.lines.length);
    const lines = [];
    const storyIndices = [];
    for (let i = 0; i < n; i++) {
      lines.push(this.lines[this.cursor]);
      storyIndices.push(this.cursor);
      this.cursor = (this.cursor + 1) % this.lines.length;
    }
    return { lines, storyIndices };
  }

  // REST no longer hosts the Storyteller, but main.js's REST loop still
  // dispatches here (its in-flight edits keep those two call sites in place
  // for now). Both calls are inert; delete them with their main.js lines.
  trySpacePress() {
    return false;
  }

  update() {}
}
