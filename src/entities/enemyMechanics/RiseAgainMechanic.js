// Risen rise-again: the first lethal hit collapses the enemy into an inert
// bone pile instead of killing it; after riseDelay it reassembles at reduced
// HP. The pile stays a normal damageable entity at 1 HP — destroy it (or let
// a DoT burn it out) before the timer to make the kill stick. All state is
// flags set here; no per-instance method overrides (CLAUDE.md anti-patterns).
//
// Data contract (enemies.js):
//   riseAgain: { riseDelay, riseHpFraction, pileChar, maxRises, frenzyOnRise,
//                frenzyDuration, frenzyDamageMultiplier, frenzySpeedMultiplier }
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
    enemy.riseCount = 0;
    enemy.riseTimer = 0;
    enemy.frenzyActive = false;
    enemy.frenzyTimer = 0;
    enemy._preFrenzySpeed = 0;
    enemy._preFrenzyDamage = 0;
  },

  // Restore the pre-frenzy stat line. Idempotent — safe to call when no
  // frenzy is running.
  endFrenzy(enemy) {
    if (!enemy.frenzyActive) return;
    enemy.frenzyActive = false;
    enemy.frenzyTimer = 0;
    if (enemy._preFrenzySpeed) enemy.speed = enemy._preFrenzySpeed;
    if (enemy._preFrenzyDamage) enemy.damage = enemy._preFrenzyDamage;
  },

  // Called from takeDamage when hp hits 0 and rises remain.
  collapse(enemy) {
    const cfg = enemy.data.riseAgain;
    const maxRises = cfg.maxRises ?? 1;
    if (enemy.riseCount >= maxRises) return false; // No rises left — let normal death happen
    // A frenzy in progress ends here. The timer only ticks while upright, so
    // without this an enemy collapsed mid-frenzy would rise with the buff still
    // flagged, re-capture its already-buffed stats as the new baseline, and
    // stack multipliers that the restore then never undoes (multi-rise Yeti).
    this.endFrenzy(enemy);
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
    return true;
  },

  // Runs early in Enemy.update; suspends all AI while collapsed.
  update(enemy, ctx) {
    if (!enemy.collapsed) {
      // Tick frenzy timer while active
      if (enemy.frenzyActive) {
        enemy.frenzyTimer -= ctx.deltaTime;
        if (enemy.frenzyTimer <= 0) this.endFrenzy(enemy);
      }
      return;
    }
    const { deltaTime, dotDamageEvents } = ctx;

    enemy.velocity.vx = 0;
    enemy.velocity.vy = 0;
    enemy.targetVelocity.vx = 0;
    enemy.targetVelocity.vy = 0;

    enemy.riseTimer -= deltaTime;
    if (enemy.riseTimer <= 0) {
      const cfg = enemy.data.riseAgain;
      enemy.collapsed = false;
      enemy.riseCount++;
      enemy.hp = Math.max(1, Math.ceil(enemy.maxHp * (cfg.riseHpFraction ?? 0.5)));
      enemy.invulnerabilityTimer = 0.8; // Longer iframe on rise
      enemy.enraged = true;

      // Frenzy mode: temporary buff
      if (cfg.frenzyOnRise) {
        enemy.frenzyActive = true;
        enemy.frenzyTimer = cfg.frenzyDuration ?? 3.0;
        enemy._preFrenzySpeed = enemy.speed;
        enemy._preFrenzyDamage = enemy.damage;
        enemy.speed *= cfg.frenzySpeedMultiplier ?? 1.5;
        enemy.damage *= cfg.frenzyDamageMultiplier ?? 2.0;
      }

      enemy.game?.audioSystem?.playSFX('bone_rise');
    }

    return { suspend: true, result: { dotDamage: dotDamageEvents } };
  }
};
