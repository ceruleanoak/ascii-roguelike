import { GRID } from '../../game/GameConfig.js';
import { createActivationBurst } from '../Particle.js';

// Sniper: a stationary ranged attacker, aware of the player's position
// regardless of vision, with a vanish-and-reposition evasion response and a
// melee "cornered" mode below half HP. Ignores background-object collision
// (enemy.ignoreBackgroundCollision, set in init()) so bushes/rocks never
// trap it mid-reposition.
//
// Full suspend-style FSM (data.sniperMechanic) — `updateActive()` is called early
// in Enemy.update(), mirroring LeapAttackMechanic/the pacifist guard: while enabled
// it owns velocity/position/state completely and returns { suspend: true, result }
// every frame, so the standard aggro/chase/attack state machine never runs for
// this enemy. This is deliberate — a chasing Sniper would undermine the whole
// "punishes standing still, rewards tracking/hiding" design.
//
// States (enemy.sniperState):
//   idle      — default; watches for near-range (→ hiding), else always → tracking
//   hiding    — brief telegraph before vanishing (near-range response)
//   hidden    — invisible + intangible (enemy.sniperHidden), travels to a new
//               far position, disturbing nearby background objects as a tell
//   tracking  — accumulates visionLockTime1 toward aiming; obstructed line of
//               sight (_visionSpeedFactor) builds it 3x slower, never resets it
//               — losing sight only delays, it doesn't break the lock
//   aiming    — reticule (enemy.sniperReticulePos) chases the player's current
//               position at reticuleSpeed; accumulates visionLockTime2, same
//               3x-slower-when-obstructed rule as tracking
//   telegraph — committed: '!' indicator for telegraphTime, cannot be interrupted
//   cooldown  — brief recovery after firing before re-engaging
//   daggerWindup / daggerCooldown — HP <= 50% melee override when player is close;
//               interrupts idle/tracking/aiming/cooldown but not the committed
//               hiding/hidden/telegraph states
//
// The fired beam intentionally ignores background objects (only walls block it —
// see _castBeam), matching the tracking/aiming phase now also being obstruction-
// tolerant (just slower, not blocked). Once the shot is committed, ducking behind
// a bush doesn't save you; only distance/dodging the line does. Damage/VFX are NOT
// applied directly here — following the existing sapDamage convention, results are
// returned on the suspend payload and consumed by CombatSystem (sniperBeamHit /
// sniperBeamFired / sniperDaggerHit).

const DAGGER_INTERRUPTIBLE = new Set(['idle', 'tracking', 'aiming', 'cooldown']);

export const SniperMechanic = {
  isEnabled(enemy) {
    return enemy.data.sniperMechanic?.enabled === true;
  },

  // Consumes the suspend-result fields CombatSystem reads off enemy._frameUpdateResult:
  // spawns the fading beam VFX and resolves beam/dagger damage against the player
  // (staff-block/dodge/reflect via CombatSystem's shared helpers). Returns true if
  // the hit killed the player. Kept here (not in CombatSystem.js) so all Sniper-
  // specific logic stays in one file — CombatSystem only dispatches to it.
  consumeResult(combatSystem, enemy, updateResult, player) {
    if (updateResult.sniperBeamFired && combatSystem.game) {
      const { from, to } = updateResult.sniperBeamFired;
      const cfg = enemy.data.sniperMechanic;
      if (!combatSystem.game.sniperBeams) combatSystem.game.sniperBeams = [];
      combatSystem.game.sniperBeams.push({ from, to, createdAt: Date.now(), life: (cfg?.beamFadeTime ?? 0.6) * 1000 });
      // Small muzzle-flash burst at the Sniper's position on fire.
      combatSystem.game.particles.push(...createActivationBurst(from.x, from.y, '#ff5555'));
    }
    if (updateResult.sniperBeamHit) {
      // Armor-piercing: isImpact bypasses staff block (Miner precedent). Capture
      // whether the player was blocking BEFORE takeDamage — it doesn't stop the
      // hit, but the player should be told their block attempt didn't help.
      const wasBlocking = player.isStaffBlocking;
      // iframeDuration: 2.0 — longer than the default 1.0s (Player.js
      // INVULNERABILITY_DURATION) so a landed shot can't be immediately
      // followed by another beam/dagger hit before the player can react.
      const damageSource = { isBullet: true, isImpact: true, element: null, attacker: enemy, iframeDuration: 2.0 };
      const result = player.takeDamage(updateResult.sniperBeamHit.damage, damageSource);
      if (combatSystem._reportDamageResult(result, updateResult.sniperBeamHit.damage, player,
          { pierce: true, pierceBlocked: wasBlocking })) return true;
    }
    if (updateResult.sniperDaggerHit) {
      if (combatSystem._applyBlockableEnemyDamage(player, enemy, updateResult.sniperDaggerHit.damage,
          { isBullet: false, isMelee: true, element: null, attacker: enemy, iframeDuration: 2.0 })) return true;
    }
    return false;
  },

  init(enemy) {
    // Phases through bushes/rocks/crates like the physical roll-through
    // enemies (TurtleHead/Shell/Leg, GooHead) — a stationary sniper boxed in
    // by background objects would otherwise be unable to reach hidden-travel
    // destinations or the melee-cornered dagger range.
    enemy.ignoreBackgroundCollision = true;
    enemy.sniperState = 'idle';
    enemy.sniperHidden = false;
    enemy.sniperTimer = 0;
    enemy.sniperLockTimer = 0;
    enemy.sniperReticulePos = null;
    enemy.sniperHiddenTarget = null;
    enemy.sniperIndicator = null;
    enemy.sniperGooDropped = false;
    enemy.sniperHiddenTravelDist = 0;
  },

  updateActive(enemy, ctx) {
    const cfg = enemy.data.sniperMechanic;
    if (!cfg?.enabled) return;
    const { deltaTime, distance, dotDamageEvents } = ctx;
    const meleeRange = cfg.meleeRange ?? GRID.CELL_SIZE * 1.5;

    // Cornered dagger override: HP <= 50% and the player is in melee range.
    // Only preempts states that haven't already committed to something else.
    if (enemy.hp <= enemy.maxHp * 0.5 && distance <= meleeRange
        && DAGGER_INTERRUPTIBLE.has(enemy.sniperState)) {
      this._resetRangedSequence(enemy);
      enemy.sniperState = 'daggerWindup';
      enemy.sniperTimer = cfg.daggerWindup ?? 0.4;
    }

    switch (enemy.sniperState) {
      case 'daggerWindup': return this._updateDaggerWindup(enemy, cfg, deltaTime, dotDamageEvents);
      case 'daggerCooldown': return this._updateDaggerCooldown(enemy, cfg, deltaTime, dotDamageEvents);
      case 'hiding': return this._updateHiding(enemy, cfg, deltaTime, dotDamageEvents);
      case 'hidden': return this._updateHidden(enemy, cfg, deltaTime, dotDamageEvents);
      case 'tracking': return this._updateTracking(enemy, cfg, deltaTime, distance, dotDamageEvents);
      case 'aiming': return this._updateAiming(enemy, cfg, deltaTime, distance, dotDamageEvents);
      case 'telegraph': return this._updateTelegraph(enemy, cfg, deltaTime, dotDamageEvents);
      case 'cooldown': return this._updateCooldown(enemy, cfg, deltaTime, distance, dotDamageEvents);
      case 'idle':
      default: return this._updateIdle(enemy, cfg, deltaTime, distance, dotDamageEvents);
    }
  },

  _resetRangedSequence(enemy) {
    enemy.sniperLockTimer = 0;
    enemy.sniperReticulePos = null;
    enemy.sniperIndicator = null;
  },

  _stand(enemy) {
    enemy.velocity.vx = 0; enemy.velocity.vy = 0;
    enemy.targetVelocity.vx = 0; enemy.targetVelocity.vy = 0;
  },

  // Vision no longer gates whether the Sniper can find/track the player —
  // it's aware of the player's actual position regardless of walls/BG
  // objects (an unseen player can't be safely ignored). `hasVision` still
  // matters as the "lack of visibility" penalty applied inside
  // tracking/aiming (see _visionSpeedFactor): unobstructed sight builds the
  // aim timers at normal speed, obstructed sight builds them 3x slower.
  _visionSpeedFactor(enemy, cfg) {
    const visionRange = cfg.visionRange ?? GRID.CELL_SIZE * 40;
    const visible = enemy.hasVision(enemy.position, enemy.target.position, visionRange, { ignoreCone: true });
    return visible ? 1 : (1 / 3);
  },

  _updateIdle(enemy, cfg, deltaTime, distance, dotDamageEvents) {
    this._stand(enemy);
    const nearRange = cfg.nearRange ?? GRID.CELL_SIZE * 5;
    if (distance < nearRange) {
      enemy.sniperState = 'hiding';
      enemy.sniperTimer = cfg.hideDelay ?? 0.5;
      return { suspend: true, result: { dotDamage: dotDamageEvents } };
    }
    enemy.sniperState = 'tracking';
    enemy.sniperLockTimer = 0;
    return { suspend: true, result: { dotDamage: dotDamageEvents } };
  },

  _updateHiding(enemy, cfg, deltaTime, dotDamageEvents) {
    this._stand(enemy);
    this._resetRangedSequence(enemy);
    enemy.sniperTimer -= deltaTime;
    if (enemy.sniperTimer <= 0) {
      enemy.sniperHiddenTarget = this._pickHiddenDestination(enemy);
      enemy.sniperHidden = true;
      enemy.sniperState = 'hidden';
      enemy.sniperGooDropped = false;
      enemy.sniperHiddenTravelDist = enemy.sniperHiddenTarget
        ? Math.hypot(enemy.sniperHiddenTarget.x - enemy.position.x, enemy.sniperHiddenTarget.y - enemy.position.y)
        : 0;
    }
    return { suspend: true, result: { dotDamage: dotDamageEvents } };
  },

  _pickHiddenDestination(enemy) {
    const CS = GRID.CELL_SIZE;
    const minX = CS * 2, minY = CS * 2;
    const maxX = (GRID.COLS - 3) * CS, maxY = (GRID.ROWS - 3) * CS;
    const target = enemy.target;
    let best = null, bestDist = -1;
    for (let i = 0; i < 6; i++) {
      const x = minX + Math.random() * (maxX - minX);
      const y = minY + Math.random() * (maxY - minY);
      const d = target ? Math.hypot(x - target.position.x, y - target.position.y) : 0;
      if (d > bestDist) { bestDist = d; best = { x, y }; }
    }
    return best;
  },

  _updateHidden(enemy, cfg, deltaTime, dotDamageEvents) {
    const dest = enemy.sniperHiddenTarget;
    if (!dest) {
      enemy.sniperHidden = false;
      enemy.sniperState = 'idle';
      this._stand(enemy);
      return { suspend: true, result: { dotDamage: dotDamageEvents } };
    }
    this._disturbNearbyObjects(enemy, cfg);
    const dx = dest.x - enemy.position.x, dy = dest.y - enemy.position.y;
    const dist = Math.hypot(dx, dy);
    const speed = cfg.hiddenMoveSpeed ?? (enemy.speed * 3);

    // Phase 2 (HP <= 50%): drop one goo bomb en route, once per relocation,
    // roughly at the midpoint of the trip — a hazard the player has to dodge
    // while also trying to track/guess the invisible Sniper's position.
    const gooDrop = this._maybeDropGoo(enemy, dist);

    if (dist < GRID.CELL_SIZE * 0.5) {
      enemy.position.x = dest.x;
      enemy.position.y = dest.y;
      this._stand(enemy);
      enemy.sniperHidden = false;
      enemy.sniperHiddenTarget = null;
      enemy.sniperState = 'idle';
      return { suspend: true, result: { dotDamage: dotDamageEvents, sniperGooDrop: gooDrop } };
    }
    const vx = (dx / dist) * speed, vy = (dy / dist) * speed;
    enemy.velocity.vx = vx; enemy.velocity.vy = vy;
    enemy.targetVelocity.vx = vx; enemy.targetVelocity.vy = vy;
    return { suspend: true, result: { dotDamage: dotDamageEvents, sniperGooDrop: gooDrop } };
  },

  _maybeDropGoo(enemy, distRemaining) {
    const isPhase2 = enemy.hp <= enemy.maxHp * 0.5;
    if (!isPhase2 || enemy.sniperGooDropped || enemy.sniperHiddenTravelDist <= 0) return null;
    if (distRemaining > enemy.sniperHiddenTravelDist * 0.5) return null;
    enemy.sniperGooDropped = true;
    const CS = GRID.CELL_SIZE;
    return { x: enemy.position.x + CS / 2, y: enemy.position.y + CS / 2, plane: enemy.plane ?? 0 };
  },

  // Sway tell: nearby background objects play their existing 'shake' animation
  // (same call the enemyShockwaves ring uses, WorldEffectsSystem.js) while the
  // invisible Sniper passes through — the only visible sign it's there.
  _disturbNearbyObjects(enemy, cfg) {
    const radius = cfg.disturbRadius ?? GRID.CELL_SIZE * 2;
    for (const obj of enemy.backgroundObjects || []) {
      if (obj.destroyed) continue;
      const dx = obj.position.x - enemy.position.x, dy = obj.position.y - enemy.position.y;
      if (dx * dx + dy * dy <= radius * radius) {
        obj._playAnimation?.('shake');
      }
    }
  },

  _updateTracking(enemy, cfg, deltaTime, distance, dotDamageEvents) {
    this._stand(enemy);
    const nearRange = cfg.nearRange ?? GRID.CELL_SIZE * 5;
    if (distance < nearRange) {
      enemy.sniperState = 'hiding';
      enemy.sniperTimer = cfg.hideDelay ?? 0.5;
      enemy.sniperLockTimer = 0;
      return { suspend: true, result: { dotDamage: dotDamageEvents } };
    }
    enemy.sniperLockTimer += deltaTime * this._visionSpeedFactor(enemy, cfg);
    if (enemy.sniperLockTimer >= (cfg.visionLockTime1 ?? 2.0)) {
      enemy.sniperState = 'aiming';
      enemy.sniperLockTimer = 0;
      enemy.sniperReticulePos = { x: enemy.target.position.x, y: enemy.target.position.y };
    }
    return { suspend: true, result: { dotDamage: dotDamageEvents } };
  },

  _updateAiming(enemy, cfg, deltaTime, distance, dotDamageEvents) {
    this._stand(enemy);
    const nearRange = cfg.nearRange ?? GRID.CELL_SIZE * 5;
    if (distance < nearRange) {
      enemy.sniperState = 'hiding';
      enemy.sniperTimer = cfg.hideDelay ?? 0.5;
      this._resetRangedSequence(enemy);
      return { suspend: true, result: { dotDamage: dotDamageEvents } };
    }
    const speed = cfg.reticuleSpeed ?? 220;
    const rx = enemy.target.position.x - enemy.sniperReticulePos.x;
    const ry = enemy.target.position.y - enemy.sniperReticulePos.y;
    const rd = Math.hypot(rx, ry);
    const step = speed * deltaTime;
    if (rd <= step || rd === 0) {
      enemy.sniperReticulePos.x = enemy.target.position.x;
      enemy.sniperReticulePos.y = enemy.target.position.y;
    } else {
      enemy.sniperReticulePos.x += (rx / rd) * step;
      enemy.sniperReticulePos.y += (ry / rd) * step;
    }
    enemy.sniperLockTimer += deltaTime * this._visionSpeedFactor(enemy, cfg);
    if (enemy.sniperLockTimer >= (cfg.visionLockTime2 ?? 1.0)) {
      enemy.sniperState = 'telegraph';
      enemy.sniperTimer = cfg.telegraphTime ?? 0.5;
      enemy.sniperLockTimer = 0;
    }
    return { suspend: true, result: { dotDamage: dotDamageEvents } };
  },

  // Committed — cannot be interrupted by proximity or vision loss once started.
  _updateTelegraph(enemy, cfg, deltaTime, dotDamageEvents) {
    this._stand(enemy);
    enemy.sniperIndicator = { char: '!', color: '#ff0000', offsetY: -GRID.CELL_SIZE };
    enemy.sniperTimer -= deltaTime;
    if (enemy.sniperTimer <= 0) {
      enemy.sniperIndicator = null;
      return this._fireBeam(enemy, cfg, dotDamageEvents);
    }
    return { suspend: true, result: { dotDamage: dotDamageEvents } };
  },

  _fireBeam(enemy, cfg, dotDamageEvents) {
    const CS = GRID.CELL_SIZE;
    const from = { x: enemy.position.x + CS / 2, y: enemy.position.y + CS / 2 };
    const reticule = enemy.sniperReticulePos || enemy.target.position;
    const aim = { x: reticule.x + CS / 2, y: reticule.y + CS / 2 };
    const dx = aim.x - from.x, dy = aim.y - from.y;
    const dist = Math.hypot(dx, dy) || 1;
    const maxLen = GRID.COLS * CS * 2; // guaranteed to cross the whole room
    const dir = { x: dx / dist, y: dy / dist };
    const to = this._castBeam(enemy, from, dir, maxLen);

    const player = enemy.target;
    const hitboxHit = player?.getHitbox
      ? this._segmentHitsBox(from, to, player.getHitbox())
      : false;

    enemy.sniperState = 'cooldown';
    enemy.sniperTimer = cfg.cooldownAfterFire ?? 2.0;
    enemy.sniperReticulePos = null;

    return {
      suspend: true,
      result: {
        dotDamage: dotDamageEvents,
        sniperBeamFired: { from, to },
        sniperBeamHit: hitboxHit ? { damage: cfg.beamDamage ?? 4 } : null
      }
    };
  },

  // Walls stop the beam; background objects do not (the "no BG object blocks
  // the attack" requirement) — deliberately skips the object-blocking loop
  // hasVision() uses.
  _castBeam(enemy, start, dir, maxLen) {
    const CS = GRID.CELL_SIZE;
    const mapRows = enemy.collisionMap ? enemy.collisionMap.length : GRID.ROWS;
    const mapCols = enemy.collisionMap?.[0]?.length ?? GRID.COLS;
    const samples = Math.ceil(maxLen / (CS / 2));
    let last = { x: start.x, y: start.y };
    for (let i = 1; i <= samples; i++) {
      const t = i * (CS / 2);
      const x = start.x + dir.x * t, y = start.y + dir.y * t;
      const gridX = Math.floor(x / CS), gridY = Math.floor(y / CS);
      if (gridX < 0 || gridX >= mapCols || gridY < 0 || gridY >= mapRows) return last;
      if (enemy.collisionMap && enemy.collisionMap[gridY][gridX]) return last;
      last = { x, y };
    }
    return last;
  },

  // First-frame-only segment-vs-hitbox test, sampled the same way hasVision walks a ray.
  _segmentHitsBox(start, end, box) {
    const dx = end.x - start.x, dy = end.y - start.y;
    const dist = Math.hypot(dx, dy);
    if (dist === 0) return this._pointInBox(start, box);
    const CS = GRID.CELL_SIZE;
    const samples = Math.max(1, Math.ceil(dist / (CS / 4)));
    for (let i = 0; i <= samples; i++) {
      const t = i / samples;
      const p = { x: start.x + dx * t, y: start.y + dy * t };
      if (this._pointInBox(p, box)) return true;
    }
    return false;
  },

  _pointInBox(p, box) {
    return p.x >= box.x && p.x <= box.x + box.width &&
           p.y >= box.y && p.y <= box.y + box.height;
  },

  _updateCooldown(enemy, cfg, deltaTime, distance, dotDamageEvents) {
    this._stand(enemy);
    const nearRange = cfg.nearRange ?? GRID.CELL_SIZE * 5;
    enemy.sniperTimer -= deltaTime;
    if (distance < nearRange) {
      enemy.sniperState = 'hiding';
      enemy.sniperTimer = cfg.hideDelay ?? 0.5;
    } else if (enemy.sniperTimer <= 0) {
      enemy.sniperState = 'idle';
    }
    return { suspend: true, result: { dotDamage: dotDamageEvents } };
  },

  _updateDaggerWindup(enemy, cfg, deltaTime, dotDamageEvents) {
    this._stand(enemy);
    enemy.sniperIndicator = { char: '!', color: '#ffaa00', offsetY: -GRID.CELL_SIZE };
    enemy.sniperTimer -= deltaTime;
    if (enemy.sniperTimer <= 0) {
      enemy.sniperIndicator = null;
      const meleeRange = cfg.meleeRange ?? GRID.CELL_SIZE * 1.5;
      const dx = enemy.target.position.x - enemy.position.x;
      const dy = enemy.target.position.y - enemy.position.y;
      const stillInRange = Math.hypot(dx, dy) <= meleeRange * 1.3;
      enemy.sniperState = 'daggerCooldown';
      enemy.sniperTimer = cfg.daggerCooldown ?? 1.2;
      return {
        suspend: true,
        result: {
          dotDamage: dotDamageEvents,
          sniperDaggerHit: stillInRange ? { damage: cfg.daggerDamage ?? 3 } : null
        }
      };
    }
    return { suspend: true, result: { dotDamage: dotDamageEvents } };
  },

  _updateDaggerCooldown(enemy, cfg, deltaTime, dotDamageEvents) {
    this._stand(enemy);
    enemy.sniperTimer -= deltaTime;
    if (enemy.sniperTimer <= 0) enemy.sniperState = 'idle';
    return { suspend: true, result: { dotDamage: dotDamageEvents } };
  }
};
