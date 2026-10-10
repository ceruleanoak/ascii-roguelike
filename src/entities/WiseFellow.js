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

  /**
   * Called by HutSystem immediately after construction to bind zone hint text.
   * On a Cursed Run the zone's `cursedSayings` replace its `wiseSayings` as
   * the table he rolls from — the curse changes what he knows. A zone with no
   * cursed table yet keeps its ordinary one.
   */
  setHint(zoneName, cursed = false) {
    const zone = ZONES[zoneName];
    const sayings = cursed && zone?.cursedSayings?.length ? zone.cursedSayings : zone?.wiseSayings;
    if (Array.isArray(sayings) && sayings.length > 0) {
      this.hintText = sayings[Math.floor(Math.random() * sayings.length)];
    } else {
      this.hintText = 'TELL THE DEVELOPER TO DO HIS JOB.';
    }
  }

  /**
   * Swap to a rare-tier hint (gated by Artifact ⚜ payment — see
   * InteractionSystem.tryGiveArtifactToWiseFellow, which tosses the Artifact
   * to him and opens the dialogue box on the new line when it lands, with no
   * second press). Re-callable — each Artifact buys
   * a fresh rare hint roll.
   *
   * `earned` carries lines this run unlocked by doing something rather than
   * paying for something (currently: dungeon-boss victory sayings). They join
   * the roll instead of replacing it, so the reward is a chance at knowledge
   * the wallet cannot reach — not a guaranteed line that pre-empts the pool.
   */
  unlockRareHint(zoneName, earned = []) {
    const rare = ZONES[zoneName]?.rareSayings ?? [];
    const pool = Array.isArray(earned) && earned.length ? [...rare, ...earned] : rare;
    if (pool.length > 0) {
      this.hintText = pool[Math.floor(Math.random() * pool.length)];
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
