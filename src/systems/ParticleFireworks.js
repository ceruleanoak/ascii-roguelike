/**
 * ParticleFireworks — dev/debug ticker (cheat-menu TOGGLES → PARTICLE
 * FIREWORKS). While game.particleFireworks is on, it cycles through every
 * particle factory at random screen positions, about 2.5 bursts/sec, so
 * effects can be eyeballed side by side.
 *
 * game.particleFireworks stays the on/off flag on Game (the cheat menu and,
 * later, Canon Edits seed it). Only the cycle timer lives here.
 */

import { GRID, GAME_STATES } from '../game/GameConfig.js';
import {
  createExplosion, createWetDrop, createActivationBurst, createSteamPuff, createChaff,
  createDodgeTrail, createFootstep, createEmberBurst, createIceBurst,
  createFrostAuraParticle, createFlameAuraParticle, createShockAuraParticle
} from '../entities/Particle.js';

// Each entry produces one effect at (x, y), cycled in order. Mix of bursts
// (return arrays) and single emitters.
const FIREWORK_FACTORIES = [
  { name: 'WetDrop',        fn: (x, y) => createWetDrop(x, y) },
  { name: 'SteamPuff',      fn: (x, y) => createSteamPuff(x, y) },
  { name: 'ActivationBurst',fn: (x, y) => createActivationBurst(x, y) },
  { name: 'EmberBurst',     fn: (x, y) => createEmberBurst(x, y) },
  { name: 'IceBurst',       fn: (x, y) => createIceBurst(x, y) },
  { name: 'Explosion',      fn: (x, y) => createExplosion(x, y) },
  { name: 'Chaff',          fn: (x, y) => createChaff(x, y) },
  { name: 'Footstep',       fn: (x, y) => createFootstep(x, y) },
  { name: 'FrostAura',      fn: (x, y) => createFrostAuraParticle(x, y) },
  { name: 'FlameAura',      fn: (x, y) => createFlameAuraParticle(x, y) },
  { name: 'ShockAura',      fn: (x, y) => createShockAuraParticle(x, y) },
  { name: 'DodgeTrail',     fn: (x, y) => createDodgeTrail(x, y) }
];

const BURST_INTERVAL = 0.4; // seconds between bursts

export class ParticleFireworks {
  constructor(game) {
    this.game = game;
    this.timer = 0;
    this.index = -1; // first tick advances to 0
  }

  toggle() {
    this.game.particleFireworks = !this.game.particleFireworks;
    this.timer = 0;
    this.index = -1;
  }

  /** Skips TITLE (no canvas particle pipe there). */
  update(deltaTime, state) {
    const game = this.game;
    if (!game.particleFireworks || state === GAME_STATES.TITLE) return;
    this.timer += deltaTime;
    if (this.timer < BURST_INTERVAL) return;
    this.timer = 0;
    this.index = (this.index + 1) % FIREWORK_FACTORIES.length;
    const W = GRID.COLS * GRID.CELL_SIZE;
    const H = GRID.ROWS * GRID.CELL_SIZE;
    const x = 48 + Math.random() * (W - 96);
    const y = 48 + Math.random() * (H - 96);
    const result = FIREWORK_FACTORIES[this.index].fn(x, y);
    if (Array.isArray(result)) game.particles.push(...result);
    else if (result) game.particles.push(result);
  }
}
