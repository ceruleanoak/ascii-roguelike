import { GRID } from '../game/GameConfig.js';
import { inSamePlane } from './PlaneSystem.js';

// Bounce-target search radius used only for puzzle-room switch chaining
// (onObjectHit below) — deliberately its own constant rather than reusing
// onEnemyHit's `proj.boomerangBounceRadius || 120` fallback, so tuning it
// for a stationary, hand-authored switch layout can never buff/nerf the
// boomerang's enemy-to-enemy ricochet range in ordinary combat rooms.
// Sized with headroom over the widest gap a puzzle template is expected to
// author between chainable switches (Boomerang Trial's own outlier-to-group
// gap is 7 cells / 112px): collision fires the frame the projectile's AABB
// first overlaps the target, which can land a few pixels past the target's
// exact cell center, and the search origin is the projectile's own position
// rather than the struck switch's, so a flat 120 leaves too thin a margin.
const SWITCH_BOUNCE_RADIUS = 80;

// Boomerang projectile behavior (Zelda-style: flies out, stuns and damages the
// first enemy it hits, then ricochets between enemies on a charge-scaled
// budget — each ricocheted enemy only takes knockback, not damage or stun —
// scoops up ingredients, and returns to the owner in a straight line).
// Composition module for CombatSystem — all hooks are called from the
// projectile update/collision paths; `combat` is the CombatSystem instance
// (damage numbers, hitstop, game ref).
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

  // Shared bounce-target acquisition, used after both the first hit (onEnemyHit)
  // and every later ricochet hit (onRicochetHit): if the charge-scaled bounce
  // budget allows, lock onto the nearest un-hit enemy in range (per-frame
  // homing in updateFlight guarantees the bounce lands); otherwise flip to
  // return mode.
  _lockNextBounceTarget(proj, enemy, enemies) {
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
  },

  // First (and only) damaging hit of the throw: CombatSystem's collision loop
  // routes every later ricochet hit to onRicochetHit instead, so this only
  // ever runs once per throw. Record the enemy as hit, stun it, defer the
  // return timer, chain-damage nearby enemies in a tight radius (the initial
  // impact's splash — never knocked back, see onRicochetHit for the knockback
  // side of the ricochet chain), then try to lock onto the nearest un-hit
  // enemy in bounce range.
  onEnemyHit(proj, enemy, enemies, combat) {
    if (!proj._boomerangHitEnemies) proj._boomerangHitEnemies = new Set();
    proj._boomerangHitEnemies.add(enemy);
    this._stun(proj, enemy, combat);
    proj.boomerangTimer += proj.boomerangHitDefer || 0.18;
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
    this._lockNextBounceTarget(proj, enemy, enemies);
  },

  // Outbound ricochet hit (every enemy the boomerang bounces into after the
  // first): no damage, no stun — just a knockback bonk out of the flight
  // path — then the same bounce-target search as the first hit to keep the
  // chain going while budget remains.
  onRicochetHit(proj, enemy, enemies, combat) {
    if (!proj._boomerangHitEnemies) proj._boomerangHitEnemies = new Set();
    proj._boomerangHitEnemies.add(enemy);
    if (proj.knockback) combat.applyKnockback(enemy, proj);
    combat.physicsSystem.applyHitstop(enemy, 0.06);
    proj.boomerangTimer += proj.boomerangHitDefer || 0.18;
    this._lockNextBounceTarget(proj, enemy, enemies);
  },

  // Puzzle-room switch struck: unlike an enemy hit (stun + optional splash),
  // a struck fixture only needs the flight itself extended — try to lock
  // onto the nearest un-struck switch in range (same bounce-budget contract
  // as onEnemyHit: consumes one boomerangBouncesLeft per link, so a
  // charge-scaled chain of N switches needs N-1 bounces) using
  // SWITCH_BOUNCE_RADIUS instead of the enemy bounceRadius. Returns true if
  // a next target was locked (caller keeps flying outbound) or false if the
  // chain is over (no target in range, or budget spent — caller falls back
  // to its own return-mode flip). `objects` is the room's full
  // backgroundObjects list; candidates are filtered to other live switches
  // (kind === 'switch') this throw hasn't already struck.
  onObjectHit(proj, obj, objects, combat) {
    if (!proj._boomerangHitObjects) proj._boomerangHitObjects = new Set();
    proj._boomerangHitObjects.add(obj);
    if (proj.boomerangBounceTarget === obj) proj.boomerangBounceTarget = null;

    if (!(proj.boomerangBouncesLeft > 0)) return false;
    let bestTarget = null;
    let bestDist = Infinity;
    for (const other of objects) {
      if (other === obj || other.destroyed || other.kind !== 'switch') continue;
      if (!inSamePlane(proj, other)) continue;
      if (proj._boomerangHitObjects.has(other)) continue;
      const box = other.getHitbox();
      const ddx = box.x + box.width / 2 - proj.position.x;
      const ddy = box.y + box.height / 2 - proj.position.y;
      const d = Math.hypot(ddx, ddy);
      if (d > SWITCH_BOUNCE_RADIUS) continue;
      if (d < bestDist) { bestDist = d; bestTarget = other; }
    }
    if (!bestTarget) return false;

    proj.boomerangBouncesLeft--;
    proj.boomerangBounceTarget = bestTarget;
    const spd = Math.hypot(proj.velocity.vx, proj.velocity.vy) || 250;
    const box = bestTarget.getHitbox();
    const tx = box.x + box.width / 2 - proj.position.x;
    const ty = box.y + box.height / 2 - proj.position.y;
    const tdist = Math.hypot(tx, ty) || 1;
    proj.velocity.vx = (tx / tdist) * spd;
    proj.velocity.vy = (ty / tdist) * spd;
    combat.audioSystem?.playSFX?.('ricochet', 0.5);
    return true;
  },

  // CombatSystem's shouldDestroyBullet branch routes every puzzleSignal hit
  // here instead of destroying the projectile: outbound, try onObjectHit's
  // chain; once already returning, a re-crossed fixture is a no-op — it was
  // already re-pulsed by handleBulletCollision (harmless; permanent switches
  // ignore redundant pulses), and destroying the boomerang here would strand
  // the player mid-puzzle with no way to finish the rest of the room.
  onPuzzleSignalHit(proj, obj, objects, combat) {
    if (proj.boomerangReturning) return;
    if (this.onObjectHit(proj, obj, objects, combat)) return;
    proj.boomerangReturning = true;
    proj.boomerangRicochetReturn = true;
  }
};
