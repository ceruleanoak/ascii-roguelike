import { GRID } from '../game/GameConfig.js';

// How close the player must stand to open dialogue with SPACE.
const TALK_RANGE = GRID.CELL_SIZE * 2.5;
// Walking this far from the speaker closes the box automatically.
const BREAK_RANGE = GRID.CELL_SIZE * 4;

/**
 * DialogueSystem — NPC speech in a boxed, SPACE-driven dialogue panel.
 *
 * Design intent: the narrator/genie voice owns the large center-screen
 * VentureArcade text (spells, notifications). NPC voices are deliberately
 * isolated in a bordered dialogue box so the player never confuses the two.
 *
 * Any NPC that implements `getDialogueLines(game) → string[]` is a speaker.
 * SPACE near a speaker opens the box; SPACE again advances line by line and
 * closes after the last line. Rendering lives in rendering/ui/DialogueBox.js.
 */
export class DialogueSystem {
  constructor(game) {
    this.game = game;
    this.active = null; // { npc, lines, lineIndex }
  }

  isOpen() {
    return !!this.active;
  }

  getState() {
    return this.active;
  }

  open(npc, lines) {
    if (!Array.isArray(lines) || lines.length === 0) return false;
    this.active = { npc, lines, lineIndex: 0 };
    npc.spokenOnce = true;
    return true;
  }

  close() {
    this.active = null;
  }

  /** SPACE while open — advance to the next line, close past the last. */
  advance() {
    if (!this.active) return false;
    this.active.lineIndex++;
    if (this.active.lineIndex >= this.active.lines.length) this.active = null;
    return true;
  }

  /** SPACE while closed — open dialogue with a speaker in talk range. */
  tryOpenNearby() {
    const game = this.game;
    const player = game.player;
    if (!player) return false;

    const npcs = player.inHut && game.activeFloor
      ? game.activeFloor.npcs
      : game.neutralCharacters;

    for (const npc of npcs ?? []) {
      if (typeof npc.getDialogueLines !== 'function') continue;
      const dist = Math.hypot(
        player.position.x - npc.position.x,
        player.position.y - npc.position.y
      );
      if (dist > TALK_RANGE) continue;
      const lines = npc.getDialogueLines(game);
      if (this.open(npc, lines)) return true;
    }
    return false;
  }

  /** Auto-close when the player walks away from the speaker. */
  update() {
    if (!this.active) return;
    const player = this.game.player;
    const npc = this.active.npc;
    if (!player || !npc) {
      this.active = null;
      return;
    }
    const dist = Math.hypot(
      player.position.x - npc.position.x,
      player.position.y - npc.position.y
    );
    if (dist > BREAK_RANGE) this.active = null;
  }
}
