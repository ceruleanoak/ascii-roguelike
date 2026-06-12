import { GRID } from '../game/GameConfig.js';
import { inSamePlane } from './PlaneSystem.js';

// Boomerang projectile behavior (Zelda-style: flies out, stuns the first enemy
// it hits, ricochets between enemies on a charge-scaled budget, scoops up
// ingredients, returns to the owner in a straight line). Composition module for
// CombatSystem — all hooks are called from the projectile update/collision paths;
// `combat` is the CombatSystem instance (damage numbers, hitstop, game ref).
// Boomerangs ignore terrain slow and arrow deceleration: constant flight speed
// is core to the return loop.
export const BoomerangMechanic = {
  // One stun per throw — the first enemy the boomerang connects with (a
  // stun-immune enemy shows RESIST via shouldApplyStatusEffect and does not
  // consume the stun). Duration is in enemy double-seconds (ENEMY_TIMER_RATE
  // = 2): 4.0 = 2.0s real.
  _stun(proj, enemy, combat) {
    if (proj._boomerangStunUsed) return;
    if (!enemy.shouldApplyStatusEffect('stun')) return;
    proj._boomerangStunUsed = true;
    enemy.applyStatusEffect('stun', 4.0);
    combat.createDamageNumber('STUN', enemy.position.x, enemy.position.y - 14, '#ffff44');
  },

  // Fetch tool: scoop up any ingredient the boomerang passes over, on both legs
  // of the flight, granting it through the canonical pickup routing. Respects
  // pickupCooldown so fresh kill-drops still play their scatter beat (the return
  // pass usually catches them). game is unset in headless harnesses — skip.
  _collectIngredients(proj, combat) {
    const game = combat.game;
    if (!game?.ingredients?.length) return;
    const cx = proj.position.x + GRID.CELL_SIZE / 2;
    const cy = proj.position.y + GRID.CELL_SIZE / 2;
    for (let i = game.ingredients.length - 1; i >= 0; i--) {
      const ing = game.ingredients[i];
      if (ing.pickupCooldown > 0) continue;
      if (!inSamePlane(proj, ing)) continue;
      const dx = ing.position.x + (ing.width || GRID.CELL_SIZE) / 2 - cx;
      const dy = ing.position.y + (ing.height || GRID.CELL_SIZE) / 2 - cy;
      if (Math.hypot(dx, dy) > GRID.CELL_SIZE) continue;
      game.lootSystem.collectIngredient(ing);
    }
  },

  // Per-frame flight control. Outbound: home onto a locked bounce target (re-aimed
  // at the enemy's current hitbox center every frame so a committed bounce always
  // connects; the return-mode flip is suspended while locked) and count down the
  // return timer (charge-scaled, extended per enemy hit). Return: steer in a
  // straight line directly toward the owner each frame (no curve interp); no
  // retrieval — despawns on catch or owner death. Returns true to despawn.
  updateFlight(proj, deltaTime, combat) {
    this._collectIngredients(proj, combat);
    const bSpeed = Math.hypot(proj.velocity.vx, proj.velocity.vy) || 250;
    if (!proj.boomerangReturning && proj.boomerangBounceTarget) {
      const target = proj.boomerangBounceTarget;
      const targetGone = target.hp <= 0 ||
        (proj._boomerangHitEnemies && proj._boomerangHitEnemies.has(target));
      if (targetGone) {
        proj.boomerangBounceTarget = null;
      } else {
        const box = target.getHitbox();
        const tx = box.x + box.width / 2 - proj.position.x;
        const ty = box.y + box.height / 2 - proj.position.y;
        const tdist = Math.hypot(tx, ty) || 1;
        proj.velocity.vx = (tx / tdist) * bSpeed;
        proj.velocity.vy = (ty / tdist) * bSpeed;
      }
    }
    if (!proj.boomerangReturning) {
      proj.boomerangTimer -= deltaTime;
      if (proj.boomerangTimer <= 0 && !proj.boomerangBounceTarget) proj.boomerangReturning = true;
    }
    if (proj.boomerangReturning) {
      if (!proj.owner || proj.owner.isDead) return true;
      const tx = proj.owner.position.x + (proj.owner.width || GRID.CELL_SIZE) / 2;
      const ty = proj.owner.position.y + (proj.owner.height || GRID.CELL_SIZE) / 2;
      const dx = tx - proj.position.x;
      const dy = ty - proj.position.y;
      const dist = Math.hypot(dx, dy);
      if (dist < GRID.CELL_SIZE * 0.6) {
        // Caught — refund one charge to the matching bow slot (matches arrow-pickup pattern).
        const bow = (proj.owner.quickSlots || []).find(slot =>
          slot &&
          slot.data?.weaponType === 'BOW' &&
          slot.char === proj.weaponChar &&
          slot.maxUses !== null &&
          slot.usesRemaining < slot.maxUses
        );
        if (bow) {
          bow.usesRemaining++;
          if (bow.cooldownTimer > 1000) bow.cooldownTimer = 0; // Clear depletion lock
          combat.createDamageNumber('+1', proj.position.x, proj.position.y, proj.color || '#ffffff');
        }
        return true;
      }
      // Straight-line aim: snap velocity to current player direction at constant speed.
      proj.velocity.vx = (dx / dist) * bSpeed;
      proj.velocity.vy = (dy / dist) * bSpeed;
    }
    // Spin the glyph for visual feedback
    proj.drawAngle = (proj.drawAngle || 0) + 14 * deltaTime;
    return false;
  },

  // Walls bounce the boomerang into return mode instead of destroying it.
  onWallHit(proj, deltaTime) {
    if (!proj.boomerangReturning) proj.boomerangReturning = true;
    // Nudge back along the inverse velocity so the next tick isn't still inside the wall.
    proj.position.x -= proj.velocity.vx * deltaTime;
    proj.position.y -= proj.velocity.vy * deltaTime;
    proj.velocity.vx *= -1;
    proj.velocity.vy *= -1;
  },

  // Ricochet return (bounced off a blocking object): stun only, no damage, passes
  // through all enemies.
  onRicochetReturnHit(proj, enemy, combat) {
    if (!proj._boomerangHitEnemies) proj._boomerangHitEnemies = new Set();
    proj._boomerangHitEnemies.add(enemy);
    this._stun(proj, enemy, combat);
    combat.physicsSystem.applyHitstop(enemy, 0.06);
  },

  // Immune enemy contact: mark it as hit and drop any lock on it, otherwise
  // per-frame homing would orbit it forever.
  onImmuneEnemy(proj, enemy) {
    if (!proj._boomerangHitEnemies) proj._boomerangHitEnemies = new Set();
    proj._boomerangHitEnemies.add(enemy);
    if (proj.boomerangBounceTarget === enemy) proj.boomerangBounceTarget = null;
  },

  // Damaging hit landed: record this enemy as hit, defer the return timer, and on
  // the very first hit also chain-damage nearby enemies in a tight radius. Then,
  // if the charge-scaled ricochet budget allows, lock onto the nearest un-hit
  // enemy in bounce range (per-frame homing in updateFlight guarantees the bounce
  // lands); otherwise flip to return mode.
  onEnemyHit(proj, enemy, enemies, combat) {
    if (!proj._boomerangHitEnemies) proj._boomerangHitEnemies = new Set();
    proj._boomerangHitEnemies.add(enemy);
    this._stun(proj, enemy, combat);
    proj.boomerangTimer += proj.boomerangHitDefer || 0.18;
    if (!proj.boomerangHasHitFirst) {
      proj.boomerangHasHitFirst = true;
      const r = proj.chainRadius || 32;
      for (const other of enemies) {
        if (other === enemy) continue;
        if (!inSamePlane(proj, other)) continue;
        const ddx = other.position.x - enemy.position.x;
        const ddy = other.position.y - enemy.position.y;
        if (Math.hypot(ddx, ddy) > r) continue;
        const chainDamaged = other.takeDamage(proj.damage, proj.attackId);
        if (chainDamaged !== false) {
          combat.createDamageNumber(proj.damage, other.position.x, other.position.y, other.color);
          combat.physicsSystem.applyHitstop(other, 0.04);
          proj._boomerangHitEnemies.add(other);
        }
      }
    }
    const bounceRadius = proj.boomerangBounceRadius || 120;
    let bestTarget = null;
    let bestDist = Infinity;
    if (proj.boomerangBouncesLeft > 0) {
      for (const other of enemies) {
        if (other === enemy) continue;
        if (!inSamePlane(proj, other)) continue;
        if (proj._boomerangHitEnemies.has(other)) continue;
        const ddx = other.position.x - proj.position.x;
        const ddy = other.position.y - proj.position.y;
        const d = Math.hypot(ddx, ddy);
        if (d > bounceRadius) continue;
        if (d < bestDist) { bestDist = d; bestTarget = other; }
      }
    }
    if (bestTarget) {
      proj.boomerangBouncesLeft--;
      proj.boomerangBounceTarget = bestTarget;
      const spd = Math.hypot(proj.velocity.vx, proj.velocity.vy) || 250;
      const tx = bestTarget.position.x - proj.position.x;
      const ty = bestTarget.position.y - proj.position.y;
      const tdist = Math.hypot(tx, ty) || 1;
      proj.velocity.vx = (tx / tdist) * spd;
      proj.velocity.vy = (ty / tdist) * spd;
    } else {
      proj.boomerangBounceTarget = null;
      proj.boomerangReturning = true;
    }
  }
};
