import { GRID } from '../../game/GameConfig.js';
import { getExitSlotPosition } from '../../systems/ExitSystem.js';

// Huntable game (Moose, Rabbit) — spawned by HuntingSystem in eligible rooms.
// Moose always flees toward its spawn-side exit once it detects the player.
// Rabbit runs directly away from the player for a second on detection, then
// burrows in place and reappears once the player is still again
// (HuntingSystem.stillnessTimer) — but only until it takes its first hit.
// After that it switches permanently to the same flee-to-exit behavior as
// the moose; it never burrows again.
//
// Config (enemy.data.gameAnimal):
//   role           'moose' | 'rabbit'
//   fleeSpeedMult  multiplier on enemy.speed while fleeing/running
//   preBurrowRunTime (rabbit only) seconds spent running before it burrows (default 1.0)
//   idleTwitch     when idling (not fleeing/burrowed), take brief small hops
//                  every couple seconds instead of holding fully still
//                  (overrides data.idleBehavior: 'stationary' for that window)
// How long (real seconds) a single arrow/bullet slow stack lasts before decaying by one.
const SLOW_DECAY_INTERVAL = 2.0;

export const GameAnimalMechanic = {
  isEnabled(enemy) {
    return !!enemy.data?.gameAnimal;
  },

  init(enemy) {
    if (!this.isEnabled(enemy)) return;
    enemy.gaFleeing = false;
    enemy.gaFleeTarget = null;
    enemy.gaBurrowed = false;
    enemy.gaBurrowPosition = null;
    enemy.gaBurrowRunning = false;
    enemy.gaBurrowRunTimer = 0;
    enemy.gaHasBeenDamaged = false;
    enemy.gaMaxHpSeen = enemy.hp;
    enemy.gaSlowStacks = 0;
    enemy.gaSlowTimer = 0;
    enemy.gaTwitchMoving = false;
    enemy.gaTwitchTimer = Math.random() * 2;
  },

  // Called by CombatSystem on every arrow/bullet hit to a moose — stacks a
  // speed penalty read by _slowFactor() below. Stacks decay one at a time
  // (SLOW_DECAY_INTERVAL apart) instead of all at once, so a second hit while
  // still slowed genuinely compounds rather than getting wiped by the same
  // shared timer that the first hit started.
  registerSlowHit(enemy, maxStacks = 6) {
    const wasZero = (enemy.gaSlowStacks ?? 0) === 0;
    enemy.gaSlowStacks = Math.min(maxStacks, (enemy.gaSlowStacks ?? 0) + 1);
    if (wasZero) enemy.gaSlowTimer = SLOW_DECAY_INTERVAL;
  },

  // Speed multiplier from stacked arrow/bullet hits — replaces Enemy.getSpeedMultiplier()
  // for game-animal movement so it isn't entangled with rally boosts, dizzy, etc. that
  // never apply to these enemies anyway (their status-effect overrides return earlier
  // in Enemy.update(), before this mechanic ever runs).
  _slowFactor(enemy) {
    return Math.max(0.25, 1 - (enemy.gaSlowStacks ?? 0) * 0.1);
  },

  update(enemy, ctx) {
    const cfg = enemy.data?.gameAnimal;
    if (!cfg) return;
    const { deltaTime } = ctx;
    const game = enemy.game;

    if (enemy.gaSlowStacks > 0) {
      enemy.gaSlowTimer -= deltaTime;
      if (enemy.gaSlowTimer <= 0) {
        enemy.gaSlowStacks -= 1;
        enemy.gaSlowTimer = enemy.gaSlowStacks > 0 ? SLOW_DECAY_INTERVAL : 0;
      }
    }

    if (enemy.hp < enemy.gaMaxHpSeen) enemy.gaHasBeenDamaged = true;
    enemy.gaMaxHpSeen = Math.min(enemy.gaMaxHpSeen, enemy.hp);

    if (cfg.role === 'rabbit' && !enemy.gaHasBeenDamaged) {
      if (this._updateRabbitBurrow(enemy, game, cfg, deltaTime)) return;
    }

    if (!enemy.gaFleeing && enemy.target) {
      const seesPlayer = enemy.hasVision(enemy.position, enemy.target.position, enemy.visionLength, { ignoreCone: true });
      if (seesPlayer) {
        enemy.gaFleeing = true;
        enemy.gaFleeTarget = enemy.gaFleeTarget || this._farthestExitPoint(enemy, game);
      }
    }

    if (enemy.gaFleeing) {
      this._fleeTowardTarget(enemy, cfg);
    } else if (cfg.idleTwitch) {
      this._updateIdleTwitch(enemy, deltaTime);
    }
  },

  // Small, occasional hops while idling — reads as an animal making brief
  // motions rather than continuously wandering or standing frozen solid.
  _updateIdleTwitch(enemy, deltaTime) {
    enemy.gaTwitchTimer -= deltaTime;

    if (enemy.gaTwitchMoving) {
      if (enemy.gaTwitchTimer <= 0) {
        enemy.gaTwitchMoving = false;
        enemy.gaTwitchTimer = 1.8 + Math.random() * 2.5; // pause before next twitch
        enemy.targetVelocity.vx = 0;
        enemy.targetVelocity.vy = 0;
      }
      return;
    }

    if (enemy.gaTwitchTimer <= 0) {
      const angle = Math.random() * Math.PI * 2;
      enemy.gaTwitchMoving = true;
      enemy.gaTwitchTimer = 0.2 + Math.random() * 0.2; // short hop duration
      enemy.targetVelocity.vx = Math.cos(angle) * enemy.wanderSpeed;
      enemy.targetVelocity.vy = Math.sin(angle) * enemy.wanderSpeed;
    } else {
      enemy.targetVelocity.vx = 0;
      enemy.targetVelocity.vy = 0;
    }
  },

  // Returns true when it has fully handled this frame's movement (burrowed,
  // running-before-burrow, or just re-emerged) — caller should skip the
  // generic flee-to-exit branch in that case.
  _updateRabbitBurrow(enemy, game, cfg, deltaTime) {
    if (enemy.gaBurrowed) {
      const stillness = game?.huntingSystem?.stillnessTimer ?? 0;
      const required = game?.huntingSystem?.requiredStillness ?? 10;
      if (stillness >= required) {
        enemy.gaBurrowed = false;
        enemy.plane = 0;
        if (enemy.gaBurrowPosition) {
          enemy.position.x = enemy.gaBurrowPosition.x;
          enemy.position.y = enemy.gaBurrowPosition.y;
        }
        return false;
      }
      enemy.velocity.vx = 0; enemy.velocity.vy = 0;
      enemy.targetVelocity.vx = 0; enemy.targetVelocity.vy = 0;
      return true;
    }

    if (enemy.gaBurrowRunning) {
      enemy.gaBurrowRunTimer += deltaTime;
      if (enemy.gaBurrowRunTimer >= (cfg.preBurrowRunTime ?? 1.0)) {
        enemy.gaBurrowRunning = false;
        enemy.gaBurrowed = true;
        enemy.gaBurrowPosition = { x: enemy.position.x, y: enemy.position.y };
        enemy.plane = 1; // hidden — skips rendering/collision like other plane-1 entities
        enemy.velocity.vx = 0; enemy.velocity.vy = 0;
        enemy.targetVelocity.vx = 0; enemy.targetVelocity.vy = 0;
        return true;
      }
      this._fleeFromPlayer(enemy, cfg);
      return true;
    }

    if (enemy.target) {
      const seesPlayer = enemy.hasVision(enemy.position, enemy.target.position, enemy.visionLength, { ignoreCone: true });
      if (seesPlayer) {
        enemy.gaBurrowRunning = true;
        enemy.gaBurrowRunTimer = 0;
        this._fleeFromPlayer(enemy, cfg);
        return true;
      }
    }
    return false;
  },

  // Straight-line run directly away from the player (used during the rabbit's
  // pre-burrow dash) — distinct from _fleeTowardTarget, which heads at a fixed
  // exit point for the moose/post-damage-rabbit escape.
  _fleeFromPlayer(enemy, cfg) {
    const player = enemy.target;
    if (!player) return;
    const dx = enemy.position.x - player.position.x;
    const dy = enemy.position.y - player.position.y;
    const dist = Math.hypot(dx, dy) || 1;
    const fleeSpeed = enemy.speed * (cfg.fleeSpeedMult ?? 1.4) * this._slowFactor(enemy);
    enemy.velocity.vx = (dx / dist) * fleeSpeed;
    enemy.velocity.vy = (dy / dist) * fleeSpeed;
    enemy.targetVelocity.vx = enemy.velocity.vx;
    enemy.targetVelocity.vy = enemy.velocity.vy;
    if (enemy.facing) { enemy.facing.x = Math.sign(dx); enemy.facing.y = Math.sign(dy); }
  },

  // Lightweight, self-contained steering toward (targetX, targetY) — deliberately
  // NOT Enemy.updateVectorNavigation(), whose stuck-timer/node-path machinery is
  // tuned for chasing a moving player and was producing erratic behavior (straight
  // lines through obstacles, speed hitches) for a simple "walk to a fixed exit"
  // errand. Tries the direct heading first; if a wall blocks it, fans out to wider
  // angles and takes the first clear one. No persistent state — recomputed fresh
  // every frame, so a knockback or nudge just reorients toward the target next tick.
  _steerDirection(enemy, targetX, targetY, dist) {
    const dx = targetX - enemy.position.x;
    const dy = targetY - enemy.position.y;
    const baseAngle = Math.atan2(dy, dx);
    if (!enemy.collisionMap) return { x: dx / dist, y: dy / dist };

    const probeDist = Math.min(dist, GRID.CELL_SIZE * 2.5);
    const ANGLE_OFFSETS = [0, 0.4, -0.4, 0.8, -0.8, 1.3, -1.3];
    for (const offset of ANGLE_OFFSETS) {
      const angle = baseAngle + offset;
      const dirX = Math.cos(angle), dirY = Math.sin(angle);
      const probe = { x: enemy.position.x + dirX * probeDist, y: enemy.position.y + dirY * probeDist };
      if (enemy.hasLineOfSight(enemy.position, probe, probeDist)) {
        return { x: dirX, y: dirY };
      }
    }
    // Boxed in on every tested angle — head straight; physics wall collision
    // will stop it rather than let it clip through.
    return { x: dx / dist, y: dy / dist };
  },

  _farthestExitPoint(enemy, game) {
    const room = game?.currentRoom;
    const candidates = [];
    const centerCol = Math.floor(GRID.COLS / 2);
    candidates.push({ x: centerCol * GRID.CELL_SIZE, y: (GRID.ROWS - 3) * GRID.CELL_SIZE });
    if (room?.exits) {
      for (const dir of ['north', 'east', 'west']) {
        if (!room.exits[dir]?.letter) continue;
        const slot = getExitSlotPosition(dir);
        if (slot) candidates.push({ x: slot.col * GRID.CELL_SIZE, y: slot.row * GRID.CELL_SIZE });
      }
    }
    let best = candidates[0], bestDist = -1;
    for (const c of candidates) {
      const d = Math.hypot(c.x - enemy.position.x, c.y - enemy.position.y);
      if (d > bestDist) { bestDist = d; best = c; }
    }
    return best;
  },

  _fleeTowardTarget(enemy, cfg) {
    const target = enemy.gaFleeTarget;
    if (!target) return;
    const dx = target.x - enemy.position.x;
    const dy = target.y - enemy.position.y;
    const dist = Math.hypot(dx, dy);
    // Wide enough that getting jostled off the exact exit slot by a collision
    // nudge still counts as "made it to the door" — a tight gap combined with
    // straight-line movement left it pacing at obstacles just short of arriving.
    const arriveGap = GRID.CELL_SIZE * 1.5;

    if (dist <= arriveGap) {
      // HuntingSystem.update() sweeps for this flag each frame and performs
      // the actual array/physics removal — the enemies array may be mid-
      // iteration elsewhere in this same frame's update pass.
      enemy.shouldRemove = true;
      if (enemy.game?.currentRoom) enemy.game.currentRoom.huntResolved = true;
      if (enemy.game?.huntingSystem) enemy.game.huntingSystem.activeGameAnimal = null;
      enemy.velocity.vx = 0; enemy.velocity.vy = 0;
      enemy.targetVelocity.vx = 0; enemy.targetVelocity.vy = 0;
      return;
    }

    const fleeSpeed = enemy.speed * (cfg.fleeSpeedMult ?? 1.4) * this._slowFactor(enemy);
    const dir = this._steerDirection(enemy, target.x, target.y, dist);
    enemy.velocity.vx = dir.x * fleeSpeed;
    enemy.velocity.vy = dir.y * fleeSpeed;
    enemy.targetVelocity.vx = enemy.velocity.vx;
    enemy.targetVelocity.vy = enemy.velocity.vy;
    if (enemy.facing) { enemy.facing.x = Math.sign(dir.x); enemy.facing.y = Math.sign(dir.y); }
  }
};
