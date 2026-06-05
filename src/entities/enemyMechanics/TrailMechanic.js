// Trail-leaver enemies (Magma Slug, Glacier Crab): drop a hazard puddle every
// trailInterval seconds while actively pursuing. Suspends Enemy.update() and
// returns a placement payload — the orchestrator (main.js / TrapSystem) owns
// the actual puddle spawn.

export const TrailMechanic = {
  isEnabled(enemy) {
    return enemy.data.trailMechanic?.enabled === true;
  },

  init(enemy) {
    enemy.trailTimer = 0;
  },

  update(enemy, ctx) {
    const cfg = enemy.data.trailMechanic;
    if (!cfg?.enabled) return;
    const active = enemy.state === 'chase' || enemy.state === 'windup' || enemy.state === 'attack';
    if (!active) return;
    const { deltaTime, dotDamageEvents } = ctx;

    enemy.trailTimer -= deltaTime;
    if (enemy.trailTimer <= 0) {
      enemy.trailTimer = cfg.trailInterval;
      return {
        suspend: true,
        result: {
          dotDamage: dotDamageEvents,
          shouldPlaceTrail: true,
          trailData: {
            x: enemy.position.x + enemy.width / 2,
            y: enemy.position.y + enemy.height / 2,
            type: cfg.trailType,
            duration: cfg.trailDuration,
            radius: cfg.trailRadius
          }
        }
      };
    }
  }
};
