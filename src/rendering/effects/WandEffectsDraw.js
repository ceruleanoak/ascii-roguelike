// Wand feedback drawn on whichever Frame Owner the player is in (Frame Passes
// `wandProximityFailures` and `aoeEffects`). Both collections live on
// CombatSystem and are stamped in the coordinates of the plane the wand was
// used on, so the active owner's translate already places them correctly.

// Blinking outline of the proximity a wand needed but didn't get.
export function drawWandProximityFailures(renderer, game) {
  const failures = game.combatSystem?.wandProximityFailures;
  if (!failures) return;
  const blinkOn = Math.floor(performance.now() / 1000 * 8) % 2 === 0; // 8 Hz blink
  if (!blinkOn) return;
  for (const failure of failures) {
    renderer.drawCircle(
      failure.position.x,
      failure.position.y,
      failure.proximityRequired || 100, // Default 100 if not specified
      failure.color,
      false, // Outline only
      0.8
    );
  }
}

// Wand AoE footprints: cones as filled arcs, everything else as a filled circle.
export function drawAoeEffects(renderer, game) {
  const effects = game.combatSystem?.aoeEffects;
  if (!effects) return;
  const fgCtx = renderer.fgCtx;
  for (const effect of effects) {
    const alpha = effect.maxTimer
      ? (effect.timer / effect.maxTimer) * 0.5
      : Math.min(effect.timer / 0.3, 0.5);
    if (effect.type === 'cone') {
      fgCtx.save();
      fgCtx.globalAlpha = alpha;
      fgCtx.fillStyle = effect.color;
      fgCtx.beginPath();
      fgCtx.moveTo(effect.x, effect.y);
      fgCtx.arc(effect.x, effect.y, effect.radius,
        effect.angle - effect.halfAngle, effect.angle + effect.halfAngle);
      fgCtx.closePath();
      fgCtx.fill();
      fgCtx.restore();
    } else {
      renderer.drawCircle(effect.x, effect.y, effect.radius, effect.color, true, alpha);
    }
  }
}
