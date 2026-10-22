/**
 * WeaponEffectsSystem — per-weapon extras that ride on an ordinary swing or
 * hit, driven by flags in the weapon's item data. main.js and CombatSystem
 * only dispatch here; each flag's behavior lives in this file.
 *
 * Swing-complete flags (onSwingComplete, from the held item's windup):
 *   placesLava     — lava tiles in a forward arc (CharacterSystem.spawnLavaSweep)
 *   callsLightning — delayed strike past the tip (CharacterSystem.callLightningStrike)
 *   swingBolt      — char of the weapon whose bolt the swing also throws
 *                    (Storm Staff → itself, Magic Sword → Storm Staff '⚚').
 *                    Read live from that weapon's bolt fields (boltDamage,
 *                    bulletChar/Speed/Range, manaCost), so the two stay in
 *                    parity — a dry meter throws the same fizzled spark.
 *   dustBurst      — { status, duration, color, burnTicks }: a sight-blocking
 *                    cloud that applies `status` to every enemy in it (Spore
 *                    Mace sleep, Cinder Hammer blind). `burnTicks` also sets
 *                    them burning for that many burn ticks (Cinder Hammer: 1).
 *                    Lands at the weapon tip, or around the player for
 *                    hammerRing weapons (the ring hits there).
 *
 * Melee-hit flags (onMeleeHit, injected onto attacks by Item.createMeleeAttack):
 *   shattersFrozen    — hitting a Frozen enemy sprays one freeze pip onto
 *                       every enemy nearby (Ice Hammer)
 *   healOnKill        — HP restored to the wielder on a killing blow (Reaper's Scythe)
 *   pullsDisarmedGear — a whip disarm flings the gear toward the wielder
 *                       instead of scattering it (Vine Whip)
 *   rootDuration      — seconds the hit roots the enemy in place, reusing the
 *                       Trident's pinnedDuration (Rootstaff)
 *
 * Projectile-hit flags (onProjectileHit):
 *   plagueBurst — the bullet bursts into a poison cloud where it stops (Plague Gun)
 *   ensnares    — the bolo snares the enemy it hits (Snare Trap semantics:
 *                 pinnedDuration = Infinity) unless that enemy is huge:
 *                 boss-tier, or mass ≥ HUGE_MASS (Troll and up) (Bolo Launcher)
 */

import { GRID } from '../game/GameConfig.js';
import { ITEMS } from '../data/items.js';
import { tagInteriorPlane, tagLootLayer, planeOf } from './PlaneSystem.js';
import { fizzleToSpark } from './MagicSystem.js';
import { applyDotTicks } from './StatusEffects.js';

const C = GRID.CELL_SIZE;
const DUST_BURST_RADIUS = C * 2.5;
const DUST_CLOUD_SECONDS = 3.0;
const SHATTER_RADIUS = C * 2.5;
const SHATTER_FREEZE_SECONDS = 5.0;
const PLAGUE_BURST_RADIUS = C * 1.5;
const PLAGUE_CLOUD_COLOR = '#66cc44';
// Bolo cutoff: Troll (2.5) is the smallest body the bolo can't wrap — Ogre (2) and below are snared.
const HUGE_MASS = 2.5;
// Dropped items slide under PHYSICS.FRICTION (0.9/frame), covering about
// speed/6 px before stopping — so a fling at 6× the gap lands at the wielder.
const PULL_SPEED_PER_PX = 6;

export class WeaponEffectsSystem {
  constructor(game) {
    this.game = game;
  }

  // Called once when the held weapon's windup completes and its attack spawns.
  /**
   * A completed windup whose hits include a `triggerShockwave` hit (hammer-
   * type attacks) starts the player's expanding shockwave ring
   * (game.playerShockwave, advanced by InteractionSystem). The ring deals no
   * damage — the hit itself already struck its Impact Size — it only shakes
   * the background and knocks back what it sweeps past.
   */
  startShockwave(windupAttack) {
    const hits = Array.isArray(windupAttack) ? windupAttack : [windupAttack];
    const trigger = hits.find(a => a?.triggerShockwave);
    if (!trigger) return;
    this.game.playerShockwave = {
      x: trigger.shockwaveOrigin.x,
      y: trigger.shockwaveOrigin.y,
      radius: 0, prevRadius: 0,
      maxRadius: GRID.CELL_SIZE * 5,
      speed: GRID.CELL_SIZE * 8,
      color: trigger.shockwaveColor || trigger.color,
      knockback: trigger.shockwaveKnockback ?? 0,
    };
  }

  onSwingComplete(player) {
    const data = player.heldItem?.data;
    if (!data) return;
    const characterSystem = this.game.characterSystem;
    if (data.placesLava) characterSystem.spawnLavaSweep(player);
    if (data.callsLightning) characterSystem.callLightningStrike(player, data);
    if (data.swingBolt) this._throwBolt(player, ITEMS[data.swingBolt]);
    if (data.dustBurst) this._dustBurst(player, data);
  }

  // Called for every landed melee hit (after damage, knockback and onHit).
  // `wasFrozen` is the enemy's Frozen state before this hit landed.
  onMeleeHit(attack, enemy, wasFrozen) {
    if (attack.shattersFrozen && wasFrozen) this._shatter(attack, enemy);
    if (attack.healOnKill && enemy.hp <= 0 && attack.owner) {
      attack.owner.hp = Math.min(attack.owner.hp + attack.healOnKill, attack.owner.maxHp);
      this.game.combatSystem.createDamageNumber('+' + attack.healOnKill, attack.owner.position.x, attack.owner.position.y - 12, '#88ff88');
    }
    if (attack.pullsDisarmedGear && enemy._disarmed && attack.owner) this._pullGear(enemy, attack.owner);
    if (attack.rootDuration && enemy.hp > 0) {
      enemy.pinnedDuration = Math.max(enemy.pinnedDuration || 0, attack.rootDuration);
      enemy.velocity.vx = 0;
      enemy.velocity.vy = 0;
      this.game.combatSystem.createDamageNumber('ROOT', enemy.position.x, enemy.position.y - 14, '#77aa44');
    }
  }

  // Called for every landed projectile hit.
  onProjectileHit(proj, enemy, enemies) {
    if (proj.ensnares) this._ensnare(enemy);
    if (proj.plagueBurst) this._plagueBurst(proj, enemies);
  }

  _plagueBurst(proj, enemies) {
    const x = proj.position.x + C / 2;
    const y = proj.position.y + C / 2;
    this.game.combatSystem.applyAOEStatus({ x, y }, PLAGUE_BURST_RADIUS, 'poison', 3.0, enemies, proj.shooterPlane ?? 0);
    this._pushCloud(x, y, PLAGUE_BURST_RADIUS, 2.0, PLAGUE_CLOUD_COLOR);
  }

  // A huge enemy shrugs the bolo off; anything else is snared where it stands.
  _ensnare(enemy) {
    if (enemy.hp <= 0) return;
    const mass = enemy.mass ?? enemy.data?.mass ?? 1;
    const huge = enemy.isBoss || enemy.isBossEntity || enemy.data?.tier === 'boss' || mass >= HUGE_MASS;
    if (huge) {
      this.game.combatSystem.createDamageNumber('SHRUG', enemy.position.x, enemy.position.y - 14, '#c8a060');
      return;
    }
    enemy.pinnedDuration = Infinity;
    enemy.velocity.vx = 0;
    enemy.velocity.vy = 0;
    this.game.combatSystem.createDamageNumber('SNARED', enemy.position.x, enemy.position.y - 14, '#c8a060');
  }

  // The source weapon's bolt, thrown along the swing's facing. Costs the
  // source's manaCost; with no mana it fizzles to a spark.
  _throwBolt(player, bolt) {
    if (!bolt) return;
    const unpaid = bolt.manaCost && !this.game.magicSystem.spendMana(player, bolt.manaCost);
    const angle = Math.atan2(player.facing.y, player.facing.x);
    const spawnOffset = 6;
    const speed = bolt.bulletSpeed || 300;
    const attack = {
      type: 'bullet',
      char: bolt.bulletChar || '·',
      drawAngle: angle,
      weaponChar: player.heldItem.char,
      position: {
        x: player.position.x + player.width / 2 + Math.cos(angle) * spawnOffset,
        y: player.position.y + player.height / 2 + Math.sin(angle) * spawnOffset
      },
      velocity: { vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed },
      damage: bolt.boltDamage,
      color: bolt.color,
      bulletRange: bolt.bulletRange,
      owner: player,
      shooterPlane: player.plane
    };
    if (unpaid) fizzleToSpark(attack);
    this.game.combatSystem.createAttack(attack, this.game._activeEnemies());
  }

  _dustBurst(player, data) {
    const { status, duration = 3.0, color, burnTicks } = data.dustBurst;
    const px = player.position.x + C / 2;
    const py = player.position.y + C / 2;
    let x = px;
    let y = py;
    if (data.attackPattern !== 'hammerRing') {
      const reach = (data.range || 20) + C;
      const fx = player.facing?.x ?? 0;
      const fy = player.facing?.y ?? -1;
      const flen = Math.hypot(fx, fy) || 1;
      x += (fx / flen) * reach;
      y += (fy / flen) * reach;
    }
    const enemies = this.game._activeEnemies();
    const plane = player.plane ?? 0;
    this.game.combatSystem.applyAOEStatus({ x, y }, DUST_BURST_RADIUS, status, duration, enemies, plane);
    if (burnTicks) this._burnInCloud(x, y, burnTicks, enemies, plane);
    this._pushCloud(x, y, DUST_BURST_RADIUS, DUST_CLOUD_SECONDS, color);
  }

  // Same reach as applyAOEStatus (plane + radius), but burns for a tick count.
  _burnInCloud(x, y, ticks, enemies, plane) {
    for (const enemy of enemies) {
      if (planeOf(enemy) !== plane) continue;
      if (Math.hypot(enemy.position.x - x, enemy.position.y - y) <= DUST_BURST_RADIUS) applyDotTicks(enemy, 'burn', ticks);
    }
  }

  _shatter(attack, enemy) {
    const x = enemy.position.x + C / 2;
    const y = enemy.position.y + C / 2;
    const others = this.game._activeEnemies().filter(e => e !== enemy);
    this.game.combatSystem.applyAOEStatus({ x, y }, SHATTER_RADIUS, 'freeze', SHATTER_FREEZE_SECONDS, others, attack.shooterPlane ?? 0);
    this.game.combatSystem.createDamageNumber('SHATTER', enemy.position.x, enemy.position.y - 16, '#aaeeff');
  }

  // Runs right after CombatSystem's disarm branch flagged the enemy: drops the
  // gear now (the same drop EnemyUpdateSystem would do next tick) and aims
  // each piece at the wielder instead of a random scatter.
  _pullGear(enemy, owner) {
    const drops = enemy.getStunDroppedItems();
    for (const item of drops) {
      const dx = owner.position.x - item.position.x;
      const dy = owner.position.y - item.position.y;
      const dist = Math.hypot(dx, dy) || 1;
      const speed = Math.max(0, dist - C) * PULL_SPEED_PER_PX;
      item.velocity = { vx: (dx / dist) * speed, vy: (dy / dist) * speed };
      this.game.items.push(tagLootLayer(this.game, item));
      this.game.physicsSystem.addEntity(item);
    }
  }

  // Sight-blocking cloud on the steam-cloud list (see Bloom Mantle in WorldEffectsSystem).
  _pushCloud(x, y, radius, timer, color) {
    this.game.steamClouds.push(tagInteriorPlane(this.game, { x, y, radius, timer, color }));
  }
}
