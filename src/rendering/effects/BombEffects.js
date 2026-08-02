import { GRID } from '../../game/GameConfig.js';
import { drawTelegraph } from '../../game/Telegraph.js';

// Bomb ('6', RipenMechanic) render: waggle+grow through four locked stages,
// then a blink telegraph immediately before detonation. Split out of
// ExploreRenderer.js to stay under its architecture budget (SniperEffects.js
// precedent) — renderEnemy() just branches into this on enemy.char === '6'.
export function renderBombEnemy(renderer, enemy, displayColor, shakeX, shakeY) {
  const cfg = enemy.data.ripenMechanic;
  const cx = enemy.position.x + GRID.CELL_SIZE / 2 + shakeX;
  const cy = enemy.position.y + GRID.CELL_SIZE / 2 + shakeY;

  const scales = cfg.growthScales ?? [1.0, 1.2, 1.45, 1.75];
  const stage = enemy.ripenGrowth ?? 0;
  let scale = scales[stage] ?? 1.0;
  let angle = 0;

  if (enemy.ripenPrimed) {
    // Blink telegraph: alternate white/base color, and swell slightly on top
    // of the locked growth scale so the final beat reads as building
    // pressure rather than holding still — must stay at (at least) the
    // locked scale here, never fall back to the default 1.0 draw.
    const blinkOn = Math.floor(Date.now() / 80) % 2 === 0;
    const pulse = 1 + Math.sin(Date.now() / 90) * 0.08;

    // Blast-radius warning, reusing Telegraph.js's own area-fill primitive
    // rather than a bespoke draw call — the shockwave itself renders nothing
    // (WorldEffectsSystem's ring is intentionally invisible), so this circle
    // is the player's only cue for how far back "safe" is.
    if (cfg.shockwaveMaxRadius > 0) {
      drawTelegraph(renderer.fgCtx, {
        warnShape: { kind: 'circle', radius: cfg.shockwaveMaxRadius / GRID.CELL_SIZE },
        windupPhase: true,
        alpha: blinkOn ? 1.0 : 0.3,
        owner: enemy,
        facing: 0,
        color: '#ff6600',
      });
    }

    renderer.drawEntityRotated(cx, cy, enemy.char, blinkOn ? '#ffffff' : displayColor, 0, scale * pulse);
    return;
  }

  if (enemy.ripenGrowing) {
    // Interpolate toward the next stage's scale across the attempt, and
    // waggle (rotate back and forth) rather than spin — a fixed number of
    // full cycles per attempt, easing neither in nor out, matching the
    // spec's literal "rotate 15 degrees left and right."
    const duration = cfg.growDuration ?? 3.0;
    const t = Math.min(1, (enemy.ripenGrowTimer ?? 0) / duration);
    const nextScale = scales[Math.min(stage + 1, scales.length - 1)] ?? scale;
    scale = scale + (nextScale - scale) * t;

    const waggleRad = (cfg.waggleAngle ?? 15) * Math.PI / 180;
    const cycles = cfg.waggleCycles ?? 3;
    angle = Math.sin(t * Math.PI * 2 * cycles) * waggleRad;
  }

  renderer.drawEntityRotated(cx, cy, enemy.char, displayColor, angle, scale);
}
