// PlayerDamageSystem — resolves a single incoming hit against the player:
// god mode / i-frame short-circuits, dodge rolls (luck + armor), bullet
// resistance, elemental immunity, defense/resist stacking, and the
// resulting hp/invulnerability/reflect bookkeeping. Extracted from
// Player.takeDamage() (Player.js was over its architecture budget) — the
// player still owns every field this reads/writes (hp, invulnerabilityTimer,
// dodgeRoll, defense, resists, etc.); this module is pure resolution logic
// with no state of its own, mirroring the StatusEffectSystem.tickPlayerDot
// pattern of a system operating directly on the player it's passed.
export const PlayerDamageSystem = {
  // Returns false (no damage), an object describing what happened
  // (dodged/blocked/immune/damaged/reflect), or true (lethal hit).
  applyDamage(player, amount, damageSource = {}) {
    // God mode — absorb all damage
    if (player.godMode) {
      return false;
    }

    // Can't take damage during invulnerability frames
    if (player.invulnerabilityTimer > 0) {
      // Active dodge roll: signal as a roll-dodge so call sites can show DODGE text
      if (player.dodgeRoll.active && player.dodgeRoll.type !== 'whirlwind') {
        return { dodged: true, roll: true };
      }
      return false;
    }

    // Dodge check (all damage types). Two independent rolls so the floating-text
    // call site can attribute "LUCKY DODGE" vs plain "DODGE". Luck rolls first
    // so its prefix wins on overlap.
    if (player.luckDodgeBonus > 0 && Math.random() < player.luckDodgeBonus) {
      return { dodged: true, lucky: true };
    }
    if (player.dodgeChance > 0 && Math.random() < player.dodgeChance) {
      return { dodged: true, lucky: false };
    }

    // Bullet resistance check (probabilistic block)
    if (damageSource.isBullet && player.bulletResist > 0) {
      if (Math.random() < player.bulletResist) {
        return { blocked: true };
      }
    }

    // Elemental immunity checks
    if (damageSource.element) {
      if (player.fireImmune && damageSource.element === 'burn') {
        return { immune: true };
      }
      if (player.freezeImmune && damageSource.element === 'freeze') {
        return { immune: true };
      }
      if (player.poisonImmune && damageSource.element === 'poison') {
        return { immune: true };
      }
    }

    // Apply defense (reduce damage, minimum 1)
    const tempDefense = player.stoneSkinTimer > 0 ? player.stoneSkinBonus : 0;

    // Melee resistance: flat damage absorption applied before final floor
    const meleeAbsorb = damageSource.isMelee && player.meleeResist > 0
      ? Math.floor(amount * player.meleeResist)
      : 0;

    // Burn resist: partial reduction of fire DoT when not fully immune
    const burnAbsorb = damageSource.element === 'burn' && player.burnResist > 0
      ? Math.floor(amount * player.burnResist)
      : 0;

    const actualDamage = Math.max(1, amount - player.defense - tempDefense - meleeAbsorb - burnAbsorb);

    player.hp -= actualDamage;
    if (player.hp < 0) player.hp = 0;

    // Track last attacker for tombstone
    if (damageSource.attacker) {
      player._lastAttacker = damageSource.attacker;
    }

    // Start invulnerability frames. damageSource.iframeDuration lets a
    // specific attacker grant a longer window than the default (e.g. the
    // Sniper's armor-piercing beam/dagger — see SniperMechanic.consumeResult).
    if (player.hp > 0) {
      player.invulnerabilityTimer = damageSource.iframeDuration ?? player.invulnerabilityDuration;
    }

    // Bloom Mantle: a landed hit bursts a pollen smoke screen. Flag is consumed
    // once per frame by main.js, which owns the steamClouds array and plane.
    if (player.smokeOnHit) {
      player.smokeBurstPending = true;
    }

    // Damage reflection
    if (player.reflectDamage > 0 && damageSource.attacker) {
      const reflectedAmount = Math.ceil(actualDamage * player.reflectDamage);
      return player.hp <= 0 ? true : {
        damaged: true,
        actualDamage,
        reflect: reflectedAmount,
        attacker: damageSource.attacker
      };
    }

    // Return true if dead, or a truthy value if damaged (for damage numbers)
    return player.hp <= 0 ? true : { damaged: true, actualDamage };
  }
};
