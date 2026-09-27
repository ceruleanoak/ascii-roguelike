// ImbuePoolSystem — the Giant Slime's Imbue (GLOSSARY: Imbue, Imbue Pool).
//
// An enemy whose data declares `imbue: { enabled, duration }` can take an
// element from its surroundings and hold it for `duration` seconds:
//   - electric — any zap (a lightning strike, live water, an electric hit)
//     imbues instead of the normal shock reaction. Yellow body, 1 pip of zap on
//     contact, and its slime trail is live (1-pip current).
//   - ice — landing on the ice Imbue Pool breaks it. Cyan body, 1 pip of freeze
//     on contact, no trail, and it slides slightly (slideFriction).
//   - fire — landing in the lava Imbue Pool. Orange body, 1 pip of burn on
//     contact, and its trail is lava (LavaContact, same as a lava tile).
// While imbued, the element's pip replaces goo on contact and the Imbue's
// affinity rides Enemy.getAffinities() (ice → freeze-immune, and so on).
//
// The pools themselves exist only in yellow's Giant Slime B room
// (roomFeatures.seedImbuePools). When the slime is hit and not imbued, its
// forced counter-leap goes to a random intact pool instead of the player
// (leapPoolTarget, read by LeapAttackMechanic.tryTrigger).
//
// All Imbue state lives on the enemy instance or the room, so nothing here
// needs a Reset Registry entry.

import { GRID } from '../game/GameConfig.js';

const IMBUE_COLORS = {
  electric: '#ffff00',
  ice:      '#88ddff',
  fire:     '#ff6600'
};

// Seconds the ice pool stays broken before the water freezes over again.
const ICE_REFORM_TIME = 3.0;
// Per-frame friction while ice-imbued (PHYSICS.FRICTION is 0.9): a slight slide.
const ICE_SLIDE_FRICTION = 0.95;
// Pip-1 contact durations, refreshed every frame the bodies touch.
const CONTACT_DURATION = { electric: 1.5, ice: 1.0, fire: 3.0 };
const CONTACT_EFFECT = { electric: 'zap', ice: 'freeze', fire: 'burn' };
// Matches EnemyUpdateSystem's slime contact reach.
const CONTACT_REACH_SQ = GRID.CELL_SIZE * GRID.CELL_SIZE;
// Lava trail stamps fade fast, like goo: a hazard behind the slime, not a
// floor that outlasts the fire Imbue.
const LAVA_TRAIL_LIFETIME = 3.0;
// The lightning strike the rod calls down on a slime that lands in the electric pool.
const ROD_STRIKE_DELAY = 0.7;

/**
 * Give `enemy` the Imbue for `element`. Returns true when the enemy now holds
 * that element (including when it already did), false when it can't take an
 * Imbue or is already imbued with a different element. The timer never
 * refreshes: an Imbue always runs out `duration` seconds after it began.
 */
export function applyImbue(enemy, element) {
  const cfg = enemy.data?.imbue;
  if (!cfg?.enabled || enemy.hp <= 0) return false;
  if (enemy.imbue) return enemy.imbue.element === element;
  enemy.imbue = { element, timer: cfg.duration, prevColor: enemy.color, prevBaseColor: enemy.baseColor };
  enemy.color = enemy.baseColor = IMBUE_COLORS[element];
  if (element === 'ice') enemy.slideFriction = ICE_SLIDE_FRICTION;
  enemy.leapPoolTarget = null;
  return true;
}

/**
 * The electric intercept: a zap on an Imbue-capable enemy becomes the electric
 * Imbue instead of the normal shock reaction (no zap, no shock damage, so no
 * split and no counter-leap). True when the zap was absorbed — including by a
 * slime already holding electric; false when the normal reaction should run.
 */
export function absorbsZap(enemy) {
  return !!enemy?.data?.imbue?.enabled && applyImbue(enemy, 'electric');
}

function clearImbue(enemy) {
  const imbue = enemy.imbue;
  if (!imbue) return;
  enemy.color = imbue.prevColor;
  enemy.baseColor = imbue.prevBaseColor;
  enemy.slideFriction = null;
  enemy.imbue = null;
}

export class ImbuePoolSystem {
  constructor(game) {
    this.game = game;
  }

  update(deltaTime) {
    const room = this.game.currentRoom;
    const pools = room?.imbuePools;
    if (pools) this._updatePools(pools, deltaTime);

    for (const enemy of this.game._activeEnemies()) {
      if (!enemy.data?.imbue?.enabled) continue;
      if (enemy.imbue) {
        enemy.imbue.timer -= deltaTime;
        if (enemy.imbue.timer <= 0) clearImbue(enemy);
      } else if (pools) {
        this._chooseLeapPool(enemy, pools);
      }
    }
  }

  // Ice pool reform: broken ice freezes over again after ICE_REFORM_TIME.
  _updatePools(pools, deltaTime) {
    for (const pool of pools) {
      if (pool.brokenTimer <= 0) continue;
      pool.brokenTimer -= deltaTime;
      if (pool.brokenTimer <= 0) {
        for (const tile of pool.tiles) tile.setWaterState('frozen', Infinity);
      }
    }
  }

  // A hit arms the forced counter-leap (Enemy.takeDamage → forcedLeapPending).
  // While un-imbued, aim it at a random intact pool; broken ice doesn't count.
  _chooseLeapPool(enemy, pools) {
    if (!enemy.forcedLeapPending) {
      enemy.leapPoolTarget = null;
      return;
    }
    if (enemy.leapPoolTarget && enemy.leapPoolTarget.brokenTimer <= 0) return;
    const available = pools.filter(p => p.brokenTimer <= 0);
    enemy.leapPoolTarget = available.length > 0
      ? available[Math.floor(Math.random() * available.length)]
      : null;
  }

  /**
   * Landing from a leap (EnemyUpdateSystem._handleLeapLand). `ld.pool` is the
   * Imbue Pool the leap was aimed at, if any.
   */
  onLeapLand(enemy, ld) {
    const pool = ld.pool;
    // Imbued mid-flight (a storm bolt during the windup): the pool is spent.
    if (!enemy || !pool || enemy.imbue) return;
    if (pool.element === 'electric') {
      // The rod guarantees it: call a strike down on the spire. The bolt
      // electrifies the pool, and the zap on the slime becomes the Imbue
      // (LightningStrikeSystem / ElectricitySystem.shockEntity). onResolve
      // covers a slime that already hopped clear of the bolt's radius.
      const rod = this.game.currentRoom?.lightningRod;
      const C = GRID.CELL_SIZE;
      const x = (rod ? rod.position.x : pool.center.x) + C / 2;
      const y = (rod ? rod.position.y : pool.center.y) + C / 2;
      this.game.lightningStrikeSystem?.scheduleStrike({
        x, y, delay: ROD_STRIKE_DELAY, hitsPlayer: true, plane: ld.plane ?? 0,
        onResolve: () => applyImbue(enemy, 'electric')
      });
      return;
    }
    if (pool.element === 'ice') {
      // The slime crashes through the ice; the water freezes over again shortly.
      for (const tile of pool.tiles) tile.setWaterState('normal', 0);
      pool.brokenTimer = ICE_REFORM_TIME;
    }
    applyImbue(enemy, pool.element);
  }

  /**
   * Imbued contact — replaces the goo contact in
   * EnemyUpdateSystem._applySlimeContact for an imbued slime. The element's
   * pip 1 lands on the player and on every other enemy it touches, small
   * slimes included (they aren't immune to an element the way they are to goo).
   */
  applyImbuedContact(slime, player, enemies) {
    const element = slime.imbue.element;
    const effect = CONTACT_EFFECT[element];
    const duration = CONTACT_DURATION[element];
    const touches = (body) => {
      const dx = body.position.x - slime.position.x;
      const dy = body.position.y - slime.position.y;
      return dx * dx + dy * dy < CONTACT_REACH_SQ;
    };
    if (!slime.commanded && player && touches(player)) {
      player.applyStatusEffect(effect, duration, 1);
    }
    for (const other of enemies) {
      if (other === slime || !touches(other)) continue;
      if (other.shouldApplyStatusEffect && !other.shouldApplyStatusEffect(effect)) continue;
      other.applyStatusEffect(effect, duration, 1);
    }
  }

  /**
   * One slime trail stamp from an Imbue-capable enemy: plain goo when
   * un-imbued, live slime (1-pip current) when electric, lava when fire, and
   * nothing at all when ice.
   */
  dropTrail(enemy, x, y, plane) {
    const game = this.game;
    const element = enemy.imbue?.element;
    if (element === 'ice') return;
    if (element === 'fire') {
      game._dropTrailTile(x, y, 'lava', plane ?? 0, LAVA_TRAIL_LIFETIME);
      return;
    }
    const stamp = game._dropSlimeTrail(x, y, plane);
    if (element === 'electric') stamp?.electrify(0, { pips: 1, source: enemy });
  }
}
