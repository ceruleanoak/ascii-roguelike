// Risen rise-again: the first lethal hit collapses the enemy into an inert
// bone pile instead of killing it; after riseDelay it reassembles at reduced
// HP. The pile stays a normal damageable entity at 1 HP — destroy it (or let
// a DoT burn it out) before the timer to make the kill stick. All state is
// flags set here; no per-instance method overrides (CLAUDE.md anti-patterns).
//
// Data contract (enemies.js):
//   riseAgain: { riseDelay, riseHpFraction, pileChar }
//
// Integration points:
//   - Enemy.takeDamage() calls collapse() when a lethal hit lands unspent
//   - Enemy.update() runs update() early and suspends all AI while collapsed
//   - ExploreRenderer.drawEnemy() renders pileChar while enemy.collapsed

export const RiseAgainMechanic = {
  isEnabled(enemy) {
    return !!enemy.data.riseAgain;
  },

  init(enemy) {
    enemy.collapsed = false;
    enemy.riseUsed = false;
    enemy.riseTimer = 0;
  },

  // Called from takeDamage when hp hits 0 and the rise is unspent.
  collapse(enemy) {
    const cfg = enemy.data.riseAgain;
    enemy.hp = 1;                 // Alive for the dead-enemy sweep; one more hit finishes it
    enemy.collapsed = true;
    enemy.riseTimer = cfg.riseDelay ?? 4.0;
    enemy.state = 'idle';
    enemy.windupTimer = 0;
    enemy.velocity.vx = 0;
    enemy.velocity.vy = 0;
    enemy.targetVelocity.vx = 0;
    enemy.targetVelocity.vy = 0;
    enemy.game?.audioSystem?.playSFX('enemy_hit');
  },

  // Runs early in Enemy.update; suspends all AI while collapsed.
  update(enemy, ctx) {
    if (!enemy.collapsed) return;
    const { deltaTime, dotDamageEvents } = ctx;

    enemy.velocity.vx = 0;
    enemy.velocity.vy = 0;
    enemy.targetVelocity.vx = 0;
    enemy.targetVelocity.vy = 0;

    enemy.riseTimer -= deltaTime;
    if (enemy.riseTimer <= 0) {
      const cfg = enemy.data.riseAgain;
      enemy.collapsed = false;
      enemy.riseUsed = true;
      enemy.hp = Math.max(1, Math.ceil(enemy.maxHp * (cfg.riseHpFraction ?? 0.5)));
      enemy.invulnerabilityTimer = 0.5; // Reassembly isn't a free hit window
      enemy.enraged = true;
      enemy.game?.audioSystem?.playSFX('bone_rise');
    }

    return { suspend: true, result: { dotDamage: dotDamageEvents } };
  }
};
