import { GRID } from '../game/GameConfig.js';
import { ZONES } from '../data/zones.js';
import { NeutralCharacter } from './NeutralCharacter.js';

const HINT_RANGE = GRID.CELL_SIZE * 2;
const FADE_SPEED = 6; // alpha units per second

/**
 * WiseFellow — rare hut interior NPC who offers a zone-specific boss hint
 * when the player draws near.
 *
 * Rendering is handled by HutInteriorOverlay; this class only manages
 * the proximity detection and hint alpha fade.
 */
export class WiseFellow extends NeutralCharacter {
  constructor(x, y) {
    super('w', '#e8c060', x, y);
    this.hintText = null; // set by HutSystem via setHint() after construction
    this.hintAlpha = 0;
  }

  /** Called by HutSystem immediately after construction to bind zone hint text. */
  setHint(zoneName) {
    const sayings = ZONES[zoneName]?.wiseSayings;
    if (Array.isArray(sayings) && sayings.length > 0) {
      this.hintText = sayings[Math.floor(Math.random() * sayings.length)];
    } else {
      this.hintText = 'KNOWLEDGE IS POWER.';
    }
  }

  update(dt, game) {
    super.update(dt); // pulse animation
    if (!game?.player || !this.hintText) return;
    const dx = game.player.position.x - this.position.x;
    const dy = game.player.position.y - this.position.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const target = dist < HINT_RANGE ? 1.0 : 0.0;
    this.hintAlpha += (target - this.hintAlpha) * Math.min(1, dt * FADE_SPEED);
  }
}
