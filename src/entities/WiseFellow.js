import { ZONES } from '../data/zones.js';
import { NeutralCharacter } from './NeutralCharacter.js';

/**
 * WiseFellow — rare hut interior NPC who offers a zone-specific boss hint.
 *
 * Speech goes through DialogueSystem (SPACE near the NPC opens the dialogue
 * box) — never the narrator's center-screen text. Rendering is handled by
 * HutInteriorOverlay (glyph + indicator) and DialogueBox (speech).
 */
export class WiseFellow extends NeutralCharacter {
  constructor(x, y) {
    super('w', '#e8c060', x, y);
    this.hintText = null; // set by HutSystem via setHint() after construction
  }

  /** Called by HutSystem immediately after construction to bind zone hint text. */
  setHint(zoneName) {
    const sayings = ZONES[zoneName]?.wiseSayings;
    if (Array.isArray(sayings) && sayings.length > 0) {
      this.hintText = sayings[Math.floor(Math.random() * sayings.length)];
    } else {
      this.hintText = 'TELL THE DEVELOPER TO DO HIS JOB.';
    }
  }

  /**
   * Swap to a rare-tier hint (gated by Artifact ⚜ payment in main.js SPACE handler).
   * Re-callable — each Artifact buys a fresh rare hint roll. The next SPACE
   * opens the dialogue box with the new line.
   */
  unlockRareHint(zoneName) {
    const rare = ZONES[zoneName]?.rareSayings;
    if (Array.isArray(rare) && rare.length > 0) {
      this.hintText = rare[Math.floor(Math.random() * rare.length)];
    } else {
      this.hintText = 'WE WILL SPEAK IN ANOTHER PLACE.';
    }
  }

  getDialogueLines() {
    return this.hintText ? [this.hintText] : [];
  }

  update(dt, game) {
    super.update(dt); // pulse animation
    this.updateTalkIndicator(game);
  }
}
