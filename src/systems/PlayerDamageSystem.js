// PlayerDamageSystem — resolves a single incoming hit against the player:
// god mode / i-frame short-circuits, dodge rolls (luck + armor), bullet
// resistance, elemental immunity, defense/resist stacking, and the
// resulting hp/invulnerability/reflect bookkeeping. Extracted from
// Player.takeDamage() (Player.js was over its architecture budget) — the
// player still owns every field this reads/writes (hp, invulnerabilityTimer,
// dodgeRoll, defense, resists, etc.); this module is pure resolution logic
// with no state of its own, mirroring the StatusEffectSystem.tickPlayer
// pattern of a system operating directly on the player it's passed.
import { PlayerParry, PARRY_REFLECT_FRACTION } from '../entities/enemyMechanics/ParryMechanic.js';
import { ENEMIES } from '../data/enemies.js';

// Frog form carries the Frog enemy's burn weakness, read from its data so the
// two never drift apart.
const FROG_BURN_WEAKNESS = ENEMIES.g.elementalAffinity.weakness.burn;

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

    // Guard: armor checks that turn one specific kind of hit aside entirely.
    // Runs before the dodge rolls so a guaranteed Guard (Deflect) is never
    // pre-empted by a lucky dodge that skips its stun.
    const guard = this.resolveGuard(player, amount, damageSource);
    if (guard) return guard;

    // Dodge check (all damage types). Two independent rolls so the floating-text
    // call site can attribute "LUCKY DODGE" vs plain "DODGE". Luck rolls first
    // so its prefix wins on overlap.
    if (player.luckDodgeBonus > 0 && Math.random() < player.luckDodgeBonus) {
      return { dodged: true, lucky: true };
    }
    if (player.dodgeChance > 0 && Math.random() < player.dodgeChance) {
      return { dodged: true, lucky: false };
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

    // Frog form is weak to fire: burn hits (fire weapons, burn DoT) land
    // multiplied before Stone Skin/defense/resists reduce them.
    if (player.polymorphed && damageSource.element === 'burn') {
      amount = Math.ceil(amount * FROG_BURN_WEAKNESS);
    }

    // Stone Skin: halves incoming damage, rounded down, applied before defense/resists
    if (player.stoneSkinTimer > 0) {
      amount = Math.floor(amount / 2);
    }

    // Melee resistance: flat damage absorption applied before final floor
    const meleeAbsorb = damageSource.isMelee && player.meleeResist > 0
      ? Math.floor(amount * player.meleeResist)
      : 0;

    // Burn resist: partial reduction of fire DoT when not fully immune
    const burnAbsorb = damageSource.element === 'burn' && player.burnResist > 0
      ? Math.floor(amount * player.burnResist)
      : 0;

    // Apply defense (reduce damage, minimum 1)
    const actualDamage = Math.max(1, amount - player.defense - meleeAbsorb - burnAbsorb);

    player.hp -= actualDamage;
    if (player.hp < 0) player.hp = 0;

    // Track what landed this hit, for the tombstone: the attacker, or the
    // environmental death cause (src/data/deathCauses.js) a source with no
    // attacker names. Overwritten on every landed hit — an unnamed source
    // clears it — so at death it describes the killing blow and nothing older:
    // lava must not credit whichever enemy last scratched the player (#341).
    player._lastDamageCause = damageSource.attacker ?? damageSource.cause ?? null;

    // Start invulnerability frames. damageSource.iframeDuration lets a
    // specific attacker grant a longer window than the default (e.g. the
    // Sniper's armor-piercing beam/dagger — see SniperMechanic.consumeResult).
    if (player.hp > 0) {
      player.invulnerabilityTimer = damageSource.iframeDuration ?? player.invulnerabilityDuration;
      // A survived hit — healOnHit consumables (Fairy King in a Bottle) read
      // this on the next consumable check, which then clears it.
      player.hurtPending = true;
    }

    // Bloom Mantle: a landed hit bursts a pollen smoke screen. Flag is consumed
    // once per frame by main.js, which owns the steamClouds array and plane.
    if (player.smokeOnHit) {
      player.smokeBurstPending = true;
    }

    // Splinter: a landed melee hit may break bone armor outright. The armor
    // still absorbed this hit; ArmorEffectsSystem.updateSplinter consumes the
    // flag and destroys the piece (this module has no game/inventory access).
    if (damageSource.isMelee && player.splinterChance > 0 && Math.random() < player.splinterChance) {
      player.splinterPending = true;
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
  },

  // Guard checks, each matched to one kind of hit. Every Guard fully negates
  // the hit and returns { blocked: true }, so existing call sites that print
  // BLOCK keep working; `guard` names a Guard that has its own text.
  //   Deflect     — a charging enemy's ram (damageSource.isCharge). Always
  //                 succeeds; the charge call site stuns the charger. Granted
  //                 by worn armor (player.deflectCharge, set by
  //                 EquipmentEffectsSystem) or by the held weapon's own
  //                 `deflectCharge` (the Flag), read live so a weapon swap
  //                 needs no recompute.
  //   Parry       — a melee hit caught by the Buckler's parry window — the
  //                 same parryMechanic cycle and catch rule enemies use
  //                 (ParryMechanic.js). reflectDamage returns `reflect`,
  //                 which the call site applies to the attacker.
  //   Arrow Guard — bullets: shield blockChance (also melee with blockMelee),
  //                 then armor bulletResist.
  resolveGuard(player, amount, damageSource) {
    if (damageSource.isCharge && (player.deflectCharge || player.heldItem?.data?.deflectCharge)) {
      return { blocked: true, guard: 'DEFLECT' };
    }

    const attacker = damageSource.attacker;
    if (damageSource.isMelee && player.parryMechanic?.enabled
        && PlayerParry.catches(player, attacker?.position)) {
      const reflect = player.parryMechanic.reflectDamage && attacker?.takeDamage
        ? Math.ceil(amount * PARRY_REFLECT_FRACTION) : 0;
      return reflect > 0
        ? { blocked: true, guard: 'PARRY', reflect, attacker }
        : { blocked: true, guard: 'PARRY' };
    }

    if (player.blockChance > 0 && (damageSource.isBullet || (damageSource.isMelee && player.blockMelee))) {
      if (Math.random() < player.blockChance) return { blocked: true };
    }
    if (damageSource.isBullet && player.bulletResist > 0) {
      if (Math.random() < player.bulletResist) return { blocked: true };
    }
    return null;
  },

  // Stops the corpse sliding on its last frame's momentum. physicsSystem
  // keeps integrating every registered entity's velocity straight through
  // GAME_OVER's interior hold window (GameOverRenderer delegates to the live
  // interior overlay there so the death explosion lands in the right spot),
  // so a hut/dungeon death that never zeroed velocity kept visibly moving
  // for the full 2s hold. Called once from main.js's death handling, which
  // is the single funnel for every death cause (combat, DoT, lava, direct
  // hp writes) — not from applyDamage itself, since that only covers combat.
  freezeOnDeath(player) {
    player.velocity.vx = 0;
    player.velocity.vy = 0;
  }
};
