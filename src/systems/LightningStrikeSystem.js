/**
 * LightningStrikeSystem — schedules and resolves delayed lightning strikes.
 *
 * Lifecycle per strike:
 *   1. Warning  — pulsing dashed circle at ground point for `delay` seconds.
 *                 Color crossfades yellow → white as the strike approaches.
 *   2. Flash    — ~0.12s jagged bolt drawn from the top of the room to the
 *                 strike point. Damage is applied at the start of this phase,
 *                 so a player who clears the zone on the last warning frame
 *                 survives.
 *   3. Impact   — spark particles with gravity are spawned at flash start;
 *                 they live on after the strike record is removed.
 *
 * Callers:
 *   scheduleStrike({ x, y, radius, delay, damage, hitsPlayer, hutPlane, source })
 *
 * Used by: Lightning Sword (weapon-driven test driver). Designed for reuse by
 * future yellow-zone storm hazards and enemy attacks — same pipeline, same
 * telegraph contract.
 */

import { GRID } from '../game/GameConfig.js';
import { planeOf, inSamePlane } from './PlaneSystem.js';

const FLASH_DURATION = 0.12;
const DEFAULT_RADIUS = GRID.CELL_SIZE * 1.2;
const DEFAULT_DAMAGE = 4;

export class LightningStrikeSystem {
  constructor(game) {
    this.game = game;
    this.strikes = [];   // active warning + flash records
  }

  // Public API. Returns the strike record (mostly for tests).
  scheduleStrike({
    x, y,
    radius = DEFAULT_RADIUS,
    delay = 0.6,
    damage = DEFAULT_DAMAGE,
    hitsPlayer = true,
    plane = 0,
    hutPlane = !!this.game?.activeFloor,
    source = null
  }) {
    const strike = {
      x, y, radius, damage, hitsPlayer, plane, hutPlane, source,
      warningTimer: delay,
      warningDuration: delay,
      flashTimer: 0,
      flashFired: false,
      done: false
    };
    this.strikes.push(strike);
    return strike;
  }

  update(deltaTime) {
    for (let i = this.strikes.length - 1; i >= 0; i--) {
      const s = this.strikes[i];

      if (s.warningTimer > 0) {
        s.warningTimer -= deltaTime;
        if (s.warningTimer <= 0) {
          this._resolveStrike(s);
          s.warningTimer = 0;
          s.flashTimer = FLASH_DURATION;
          s.flashFired = true;
        }
      } else if (s.flashTimer > 0) {
        s.flashTimer -= deltaTime;
        if (s.flashTimer <= 0) {
          s.done = true;
        }
      }

      if (s.done) {
        this.strikes.splice(i, 1);
      }
    }
  }

  _resolveStrike(s) {
    const game = this.game;
    if (!game) return;

    const room = game.currentRoom;
    const enemies = (room && room.enemies) || [];

    // Enemy damage — plane-gated, circle test on enemy center
    for (const enemy of enemies) {
      if (planeOf(enemy) !== s.plane) continue;
      const ex = enemy.position.x + (enemy.width || GRID.CELL_SIZE) / 2;
      const ey = enemy.position.y + (enemy.height || GRID.CELL_SIZE) / 2;
      const dx = ex - s.x;
      const dy = ey - s.y;
      if (Math.sqrt(dx * dx + dy * dy) <= s.radius) {
        enemy.takeDamage(s.damage);
        game.combatSystem.createDamageNumber(s.damage, enemy.position.x, enemy.position.y, '#ffff88');
      }
    }

    // Player damage — only when hitsPlayer is on AND player shares the plane
    if (s.hitsPlayer && game.player && planeOf(game.player) === s.plane) {
      const px = game.player.position.x + GRID.CELL_SIZE / 2;
      const py = game.player.position.y + GRID.CELL_SIZE / 2;
      const dx = px - s.x;
      const dy = py - s.y;
      if (Math.sqrt(dx * dx + dy * dy) <= s.radius) {
        const result = game.player.takeDamage(s.damage);
        game.physicsSystem.applyDamageKnockback(game.player, result, s.x, s.y);
      }
    }

    // Strike on (or near) water: charge the body of water — the cascade
    // spreads tile-to-tile from the impact point at a fixed rate.
    game.electricitySystem?.seedNear(s.x, s.y, s.radius, { initialCharge: s.electricityCharge, hutPlane: s.hutPlane });

    // Spark burst — simple particles with gravity, parabolic arc
    const sparks = createLightningSparks(s.x, s.y);
    for (const spark of sparks) {
      spark.hutPlane = s.hutPlane;
      game.particles.push(spark);
    }

    // Audio — silently no-ops until a 'thunder' buffer is loaded
    game.audioSystem?.playSFX?.('thunder');
  }

  createChainLightning(source, hitEnemy, enemies) {
    const game = this.game;
    game.audioSystem?.playSFX('lightning');
    const chainRange = 80;
    const chainDamage = source.damage * 0.5;
    const maxChains = source.chainCount || 3;

    let chained = 0;
    const alreadyHit = new Set([hitEnemy]);
    let currentEnemy = hitEnemy;

    while (chained < maxChains) {
      let nearestEnemy = null;
      let nearestDist = Infinity;
      for (const enemy of enemies) {
        if (alreadyHit.has(enemy)) continue;
        if (!inSamePlane(hitEnemy, enemy)) continue;
        const dx = enemy.position.x - currentEnemy.position.x;
        const dy = enemy.position.y - currentEnemy.position.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < chainRange && dist < nearestDist) {
          nearestEnemy = enemy;
          nearestDist = dist;
        }
      }
      if (!nearestEnemy) break;

      const isWet = nearestEnemy.isWet && nearestEnemy.isWet();
      const actualDamage = isWet ? chainDamage * 2 : chainDamage;
      const stunDur = isWet ? 3.5 : 2.0;
      nearestEnemy.takeDamage(actualDamage);
      nearestEnemy.applyStatusEffect('zap', stunDur);
      game.combatSystem.createDamageNumber(actualDamage, nearestEnemy.position.x, nearestEnemy.position.y, '#00ffff');
      if (isWet) {
        game.combatSystem.createDamageNumber('⚡', nearestEnemy.position.x, nearestEnemy.position.y - 12, '#ffff00');
      }

      const cs = (currentEnemy.width || GRID.CELL_SIZE) / 2;
      const ns = (nearestEnemy.width || GRID.CELL_SIZE) / 2;
      game.combatSystem.chainArcs.push({
        x1: currentEnemy.position.x + cs,
        y1: currentEnemy.position.y + cs,
        x2: nearestEnemy.position.x + ns,
        y2: nearestEnemy.position.y + ns,
        color: isWet ? '#ffff66' : '#88ddff',
        timer: 0.18,
        duration: 0.18
      });

      alreadyHit.add(nearestEnemy);
      currentEnemy = nearestEnemy;
      chained++;
    }
  }

  reset() {
    this.strikes = [];
  }

  getStrikes() {
    return this.strikes;
  }
}

// Spark factory — upward-hemisphere launch with gravity for a parabolic arc.
// Returns simple particle objects (not Particle class) so the main.js simple-
// particle update path handles vx/vy/gravity integration directly.
function createLightningSparks(x, y, count = 14) {
  const sparks = [];
  // Small marks only — no `*` or `+` (those render full-cell)
  const chars = ['·', '`', "'", '.'];
  const colors = ['#ffff88', '#ffffff', '#ffee44', '#aaddff'];
  for (let i = 0; i < count; i++) {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.3;
    const speed = 45 + Math.random() * 55;   // ~½ previous reach
    const vx = Math.cos(angle) * speed;
    const vy = Math.sin(angle) * speed;
    const life = 0.4 + Math.random() * 0.3;
    sparks.push({
      x, y,
      vx, vy,
      gravity: 320,                          // matched to lower launch speed
      char: chars[Math.floor(Math.random() * chars.length)],
      color: colors[Math.floor(Math.random() * colors.length)],
      life,
      maxLife: life
    });
  }
  return sparks;
}
