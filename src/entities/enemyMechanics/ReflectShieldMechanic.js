// Mirror Imp reflect shield: simple two-state cycle (active / cooldown). While
// shieldActive=true, projectiles bounce (handled in CombatSystem). Starts
// active so the imp spawns guarded.

export const ReflectShieldMechanic = {
  isEnabled(enemy) {
    return enemy.data.reflectShield?.enabled === true;
  },

  init(enemy) {
    enemy.shieldActive = false;
    enemy.shieldTimer = enemy.data.reflectShield.shieldDuration;
    enemy.shieldCooldownTimer = 0;
  },

  /**
   * True while the shield is nominally up but momentarily dropped.
   *
   * `dropsDuringWindup` shields (Ice Golem) are open for the whole attack
   * telegraph — that is the punish window. Driven by the data flag rather than
   * the enemy glyph: 'I' already collides with a background-object char (#102),
   * so a char test would hand this mechanic to whatever reuses the letter next.
   */
  isShieldDown(enemy) {
    return enemy.state === 'windup' && !!enemy.data?.reflectShield?.dropsDuringWindup;
  },

  /**
   * Bounce a player projectile back at its shooter. Returns true if the shield
   * caught it (caller removes the projectile), false to fall through to normal
   * hit resolution.
   *
   * Lives here rather than in CombatSystem because the shield's whole contract
   * — when it is up, what it does to an incoming shot — belongs to one owner.
   */
  tryReflect(enemy, proj, combatSystem) {
    const cfg = enemy.data.reflectShield;
    if (!enemy.shieldActive || !cfg?.enabled || this.isShieldDown(enemy)) return false;

    const reflectedDmg = Math.ceil(proj.damage * (cfg.reflectDamageBonus ?? 0.5));
    const spd = Math.sqrt(proj.velocity.vx ** 2 + proj.velocity.vy ** 2) || 150;
    // Direction: from enemy toward original shooter (reversal)
    const rdx = -proj.velocity.vx;
    const rdy = -proj.velocity.vy;
    const rdist = Math.sqrt(rdx * rdx + rdy * rdy) || 1;
    // Deliberately NOT tagged `reflected`. That flag means "already bounced,
    // now traveling back toward the boss" — the enemy-projectile loop skips
    // player collision entirely for anything carrying it (CombatSystem, just
    // above the player hit test), which is exactly what BossSystem's reflect
    // minigame and the deflector triangles want. This shot is the opposite
    // case: a live enemy projectile aimed at the player. Tagging it made the
    // whole shield inert — the arrow was eaten, "REFLECT" popped, and the
    // return shot passed straight through the player.
    combatSystem.enemyProjectiles.push({
      ...proj,
      velocity: { vx: (rdx / rdist) * spd, vy: (rdy / rdist) * spd },
      damage: reflectedDmg,
      owner: enemy
    });
    combatSystem.createDamageNumber('REFLECT', enemy.position.x, enemy.position.y, '#ccddff');
    return true;
  },

  update(enemy, ctx) {
    const cfg = enemy.data.reflectShield;
    if (!cfg?.enabled) return;
    const { deltaTime } = ctx;

    if (enemy.shieldActive) {
      enemy.shieldTimer -= deltaTime;
      if (enemy.shieldTimer <= 0) {
        enemy.shieldActive = false;
        enemy.shieldCooldownTimer = cfg.shieldCooldown;
      }
    } else {
      enemy.shieldCooldownTimer -= deltaTime;
      if (enemy.shieldCooldownTimer <= 0) {
        enemy.shieldActive = true;
        enemy.shieldTimer = cfg.shieldDuration;
      }
    }
  }
};
