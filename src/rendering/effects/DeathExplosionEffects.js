import { GRID } from '../../game/GameConfig.js';
import { drawTelegraph } from '../../game/Telegraph.js';
import { deathExplosionColor } from '../../systems/DeathExplosion.js';

// The tell of a dying enemy whose deathExplosion is counting down its
// deathDelay (enemy.isDying). Split out of ExploreRenderer.js for its
// architecture budget (BombEffects.js precedent); renderEnemy() takes the
// returned shake and color and draws the enemy as usual.
//   - burst: shakes urgently, pulsing toward the burst's color.
//   - blast (Death Blast): holds still and blinks white against the blast's
//     color, faster as the fuse runs down, with the blast radius drawn as a
//     warning circle — the circle is the player's only cue for how far back
//     is safe, as on the Bomb.
export function dyingEnemyTell(renderer, enemy, displayColor) {
  const de = enemy.data.deathExplosion;
  const color = deathExplosionColor(de);
  const now = Date.now();

  if (de.style === 'blast') {
    const remaining = Math.max(0, enemy.dyingTimer ?? 0) / (de.deathDelay || 1);
    const period = remaining > 0.5 ? 140 : 70;
    const blinkOn = Math.floor(now / period) % 2 === 0;
    drawTelegraph(renderer.fgCtx, {
      warnShape: { kind: 'circle', radius: de.radius / GRID.CELL_SIZE },
      windupPhase: true,
      alpha: blinkOn ? 1.0 : 0.3,
      owner: enemy,
      facing: 0,
      color,
    });
    return { shakeX: 0, shakeY: 0, color: blinkOn ? '#ffffff' : color };
  }

  const t = now / 1000;
  return {
    shakeX: Math.round(Math.sin(t * 120 + enemy.position.x) * 3),
    shakeY: Math.round(Math.cos(t * 113 + enemy.position.y) * 3),
    color: Math.floor(now / 120) % 2 === 0 ? color : displayColor,
  };
}
