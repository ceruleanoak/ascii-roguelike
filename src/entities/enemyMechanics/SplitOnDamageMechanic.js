// Giant Slime split-on-damage: onDamaged() (called from Enemy.takeDamage,
// mirroring GooSpewMechanic.onDamaged two lines below it) spawns a child
// slime whose HP equals the damage the boss just took. Children re-merge via
// ReformMechanic, which calls notifySplitChildGone(parent, child, true) on
// contact; EnemySpawnSystem calls it with false on a child's death instead.

export const SplitOnDamageMechanic = {
  isEnabled(enemy) {
    return enemy.data.splitOnDamage?.enabled === true;
  },

  init(enemy) {
    enemy.splitChildren = new Set();
  },

  onDamaged(enemy, damageAmount = 1) {
    const cfg = enemy.data.splitOnDamage;
    if (!cfg?.enabled) return;
    if (!enemy.splitChildren) enemy.splitChildren = new Set();
    if (!enemy.game?.enemySpawnSystem) return;

    // One child per attack; its HP equals the damage the boss just took. Kill
    // the child before mergeCooldown elapses to make the damage stick — otherwise
    // colliding with the boss re-merges it and restores the HP.
    const childHp = Math.max(1, Math.floor(damageAmount));
    // Child spawns at the boss's center and is launched outward in a random
    // direction by registerSplitChild — no placement search needed.
    enemy.game.enemySpawnSystem.queueRequest(enemy, {
      spawnChar: cfg.spawnChar,
      spawnCount: 1,
      exactPosition: true,
      spawnerPosition: { x: enemy.position.x, y: enemy.position.y },
      _splitChildLink: {
        parent: enemy,
        mergeCooldown: cfg.mergeCooldown,
        childHp
      }
    });
    enemy.game?.audioSystem?.playSFX('goo_split');
  },

  registerSplitChild(parent, child, cfg) {
    if (!parent.splitChildren) parent.splitChildren = new Set();
    child.parentRef = parent;
    child.mergeCooldownTimer = cfg.mergeCooldown ?? 0;
    child.reformValue = cfg.childHp; // Absorbing returns exactly the HP the player failed to remove
    child.hp = cfg.childHp;
    // Launch the child away from the boss center in a random direction;
    // knockback status keeps AI from overriding the velocity mid-flight.
    const launchAngle = Math.random() * Math.PI * 2;
    child.velocity.vx = Math.cos(launchAngle) * 300;
    child.velocity.vy = Math.sin(launchAngle) * 300;
    child.applyStatusEffect('knockback', 0.35);
    // Spawn iframes: the child appears at the boss center, inside whatever
    // attack just split it off — without these it dies instantly. 2 real
    // seconds (timer is in double-seconds, ENEMY_TIMER_RATE = 2).
    child.invulnerabilityTimer = 4.0;
    parent.splitChildren.add(child);
  },

  notifySplitChildGone(parent, child, absorbed) {
    if (!parent?.splitChildren) return;
    if (parent.splitChildren.has(child)) parent.splitChildren.delete(child);
    if (absorbed) SplitOnDamageMechanic.absorbChild(parent, child.reformValue || 0);
  },

  absorbChild(parent, value) {
    if (!value) return;
    const max = parent.data.hp;
    parent.hp = Math.min(max, parent.hp + value);
    parent.game?.audioSystem?.playSFX('goo_reabsorb');
  }
};
