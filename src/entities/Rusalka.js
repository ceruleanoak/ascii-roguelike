import { GRID } from '../game/GameConfig.js';
import { NeutralCharacter } from './NeutralCharacter.js';

const PULL_FORCE_MIN = 30;        // Initial pull acceleration (px/s²)
const PULL_FORCE_MAX = 160;       // Maximum pull acceleration after full ramp
const PULL_RAMP_TIME = 18.0;      // Seconds to reach max pull (matches suppression arc)
const SUPPRESSION_RATE = 0.07;    // Input suppression ramp rate per second (~14s to full)
const DEATH_RANGE = GRID.CELL_SIZE * 0.8;
const WATER_DRIFT_SPEED = 3;     // px/s — very gentle glide toward player when they're in water

/**
 * Rusalka — a rare lethal neutral character that appears on a successful
 * fishing catch in the green zone (rusalkaChance: 0.04).
 *
 * Effect: Pull force starts gentle and escalates over time while input
 * suppression ramps separately. Both are predictable but mounting pressures.
 * Kills the player on contact.
 */
export class Rusalka extends NeutralCharacter {
  constructor(x, y) {
    super('R', '#88ffee', x, y);

    // Pulse between 0.5 and 1.0 for eerie shimmer
    this.pulseMin = 0.5;
    this.pulseMax = 1.0;
    this.pulseSpeed = 1.5;

    this.inputSuppression = 0; // 0 = full player control, 1 = no player control
    this.pullRamp = 0;         // 0→1 over PULL_RAMP_TIME seconds
    this.alive = true;
  }

  update(dt, game) {
    // NeutralCharacter pulse animation
    super.update(dt);

    if (!this.alive || !game?.player) return;

    const player = game.player;
    const dx = this.position.x - player.position.x;
    const dy = this.position.y - player.position.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Kill player on contact — bypasses invulnerability frames
    if (dist < DEATH_RANGE) {
      this.alive = false;
      player.hp = 0;
      return;
    }

    // Ramp input suppression (caps at 1.0)
    this.inputSuppression = Math.min(1.0, this.inputSuppression + SUPPRESSION_RATE * dt);
    player.rusalkaInputScale = 1.0 - this.inputSuppression;

    // Ramp pull force from min to max over PULL_RAMP_TIME
    this.pullRamp = Math.min(1.0, this.pullRamp + dt / PULL_RAMP_TIME);
    const pullForce = PULL_FORCE_MIN + this.pullRamp * (PULL_FORCE_MAX - PULL_FORCE_MIN);

    // Apply escalating pull toward Rusalka directly to velocity
    // (acceleration is reset by updateInput each frame, so we use velocity instead)
    if (dist > 0) {
      const nx = dx / dist;
      const ny = dy / dist;
      player.velocity.vx += nx * pullForce * dt;
      player.velocity.vy += ny * pullForce * dt;

      // Gently drift toward the player while they are in water
      if (player.inLiquid) {
        this.position.x -= nx * WATER_DRIFT_SPEED * dt;
        this.position.y -= ny * WATER_DRIFT_SPEED * dt;
      }
    }
  }

  cleanup(player) {
    // Restore player input scale when Rusalka is removed
    if (player) {
      player.rusalkaInputScale = 1.0;
    }
  }
}
