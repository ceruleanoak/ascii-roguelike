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
    // Room → Storyteller (or null: rolled, and he is not there).
    this.visits = new WeakMap();
  }

  /**
   * Room entry (spawnRoomNeutralCharacters): the Storyteller this Room holds,
   * deciding on first entry. Only a Camp Room with its campfire holds him.
   */
  storytellerFor(room) {
    if (this.visits.has(room)) return this.visits.get(room);
    const campfire = this.lines.length && room.type === ROOM_TYPES.CAMP
      ? room.backgroundObjects.find(obj => obj.isCampfire && !obj.destroyed)
      : null;
    const npc = campfire ? this._placeAtFire(campfire) : null;
    this.visits.set(room, npc);
    return npc;
  }

  // One cell west of the fire — the cell generateCampRoom keeps clear for him.
  _placeAtFire(campfire) {
    return new Storyteller(campfire.position.x - GRID.CELL_SIZE, campfire.position.y, this._nextChunk());
  }

  /** The next LINES_PER_VISIT lines of Story.md, advancing the cursor. */
  _nextChunk() {
    const n = Math.min(LINES_PER_VISIT, this.lines.length);
    const chunk = [];
    for (let i = 0; i < n; i++) {
      chunk.push(this.lines[this.cursor]);
      this.cursor = (this.cursor + 1) % this.lines.length;
    }
    return chunk;
  }

  // REST no longer hosts the Storyteller, but main.js's REST loop still
  // dispatches here (its in-flight edits keep those two call sites in place
  // for now). Both calls are inert; delete them with their main.js lines.
  trySpacePress() {
    return false;
  }

  update() {}
}
