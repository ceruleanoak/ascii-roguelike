import { GRID } from '../game/GameConfig.js';
import { enemyDistance, enemyVisualAnchor } from '../systems/enemyHitTest.js';
import { applyOnHitStatusEffect } from '../systems/ExtraOnHitEffects.js';

/**
 * Fire Bolt — the Fire Elemental golem's ranged attack (GOLEM_TYPES.fire.ranged).
 *
 * Composed into GolemCompanion rather than routed through
 * CombatSystem.createAttack: that is the player's projectile pipeline (crit
 * rolls off the owner, the Green penalty, lifesteal), and a golem's hit has
 * always been resolved by the golem itself (GolemCompanion._continueWindup).
 * The bolts live on the golem (`golem.fireBolts`), in the golem's own
 * top-left coordinate space, and are drawn by CompanionRenderers.drawGolems.
 *
 * A bolt flies straight, dies on a wall or at the end of its range, and lands
 * on the first hostile enemy it touches: 1 damage, burn (unless the enemy is
 * immune), and a `manaDropChance` roll for a Mana (𝑚) at the struck enemy.
 */

export const FIRE_BOLT_CHAR = '·';   // the enemy fire bolt's glyph (Enemy.js ranged attack)
export const FIRE_BOLT_COLOR = '#ff6600';

const BOLT_DAMAGE = 1;
const HIT_RADIUS = GRID.CELL_SIZE * 0.5;
// A bolt flies a little past the golem's range so a target stepping back
// during the windup can still be caught at the edge.
const RANGE_OVERSHOOT = 1.5;

// Throw one bolt from the golem toward `aim` (an enemyNearestPoint result).
export function launchFireBolt(golem, aim) {
  const ranged = golem.def.ranged;
  const dx = aim.x - golem.position.x;
  const dy = aim.y - golem.position.y;
  const d = Math.hypot(dx, dy) || 1;
  golem.fireBolts.push({
    x: golem.position.x,
    y: golem.position.y,
    vx: (dx / d) * ranged.boltSpeed,
    vy: (dy / d) * ranged.boltSpeed,
    remaining: ranged.range * GRID.CELL_SIZE * RANGE_OVERSHOOT,
    plane: golem.plane,
  });
}

// Advance every bolt the golem has in flight; drop the spent ones.
export function advanceFireBolts(golem, deltaTime, enemies) {
  const bolts = golem.fireBolts;
  for (let i = bolts.length - 1; i >= 0; i--) {
    const bolt = bolts[i];
    const step = Math.hypot(bolt.vx, bolt.vy) * deltaTime;
    bolt.x += bolt.vx * deltaTime;
    bolt.y += bolt.vy * deltaTime;
    bolt.remaining -= step;
    if (bolt.remaining <= 0 || hitsWall(golem.collisionMap, bolt)) {
      bolts.splice(i, 1);
      continue;
    }
    const struck = firstEnemyTouched(enemies, bolt);
    if (struck) {
      landFireBolt(golem, struck);
      bolts.splice(i, 1);
    }
  }
}

function hitsWall(collisionMap, bolt) {
  if (!collisionMap) return false;
  const col = Math.floor((bolt.x + GRID.CELL_SIZE / 2) / GRID.CELL_SIZE);
  const row = Math.floor((bolt.y + GRID.CELL_SIZE / 2) / GRID.CELL_SIZE);
  const cells = collisionMap[row];
  // Off the grid is a wall too — the bolt has left the room.
  return !cells || col < 0 || col >= cells.length || !!cells[col];
}

// Same hostile filter as GolemCompanion._findNearestEnemy.
function firstEnemyTouched(enemies, bolt) {
  for (const e of enemies || []) {
    if (!e || e.tamed || e.hp <= 0 || e.isDying) continue;
    if ((e.plane ?? 0) !== bolt.plane) continue;
    if (enemyDistance(e, bolt.x, bolt.y) <= HIT_RADIUS) return e;
  }
  return null;
}

// takeDamage returns false under its gates (shell form, iframes) and
// `{ dodged }` for a dodge — neither is a landed bolt, so neither burns
// nor rolls for Mana ([damage-number-desync]).
function landFireBolt(golem, enemy) {
  const game = golem.game;
  const ranged = golem.def.ranged;
  const result = enemy.takeDamage(BOLT_DAMAGE);
  if (!result || result.dodged) return;

  const at = enemyVisualAnchor(enemy);
  game?.combatSystem?.createDamageNumber?.(BOLT_DAMAGE, at.x, at.y, enemy.color || '#ffffff');

  // Burn through the enemy's affinity, the way a weapon's extra onHit lands
  // (ExtraOnHitEffects): fire-immune red enemies shrug it off.
  const burnMod = enemy.getElementalModifier?.('burn') ?? 1;
  if (burnMod > 0 && enemy.shouldApplyStatusEffect?.('burn')) {
    applyOnHitStatusEffect(enemy, 'burn', ranged.burn * burnMod);
  }

  if (Math.random() < ranged.manaDropChance) {
    game?.lootSystem?.spawnIngredientDrop('𝑚', enemy.position.x, enemy.position.y, null, enemy);
  }
}
