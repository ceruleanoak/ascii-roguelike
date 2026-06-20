import { GRID } from '../../game/GameConfig.js';
import { inSamePlane } from '../../systems/PlaneSystem.js';

// Flock idle behavior (data.flockBehavior — bats): instead of generic wander,
// each flock member is either roosting or airborne.
//
// Roosting ('perch'): dormant in the 'rest' state, snapped onto the nearest
// perch object (trees/stumps, crow-style). Wakes via the standard rest-state
// proximity check or takeDamage. The moment any flockmate is DISTURBED
// (airborne and aggroed/marked), the whole roost takes off — calm passive
// flyers don't alarm the roost, so re-perched bats stay settled (cascade
// suppressed per-enemy via flockNoCascade — the Bat Belfry's 15 bats wake
// individually by design).
//
// Airborne ('swirl'): leader/follower flight. The airborne bat with the
// lowest flockRank leads, flying wide sweeps across the room — waypoints are
// far random room points (farthest of a few samples, so sweeps stay long);
// every sweepPlayerEvery-th waypoint instead lands past the player's current
// position, so the flock's path keeps crossing theirs without homing.
// Followers orbit the leader at rank-staggered radii (loose layers, not a
// knot). Flocking is strictly the passive-state replacement for wander:
// only fully passive bats (idle, not enraged, no memory mark) join or lead
// the flock. Aggro, damage, or a pack-shared mark pulls a bat out; it
// rejoins only after its marks expire (memory reset clears enraged).
//
// Passive flyers occasionally break off, glide to a free perch, and settle
// back into the roost ('land' mode bridges the flight), so a left-alone
// colony gradually returns to the trees.
//
// Spawners may preset flockMode (one roll per flock); unset members roll
// perchChance on their first update (covers cheat/ad-hoc spawns).
//
// Config (data.flockBehavior, all optional — defaults shown):
//   perchChance       = 0.5
//   perchObjects      = []                    (chars that count as perches)
//   perchSearchRadius = GRID.CELL_SIZE * 6
//   rePerchChance     = 0                     (per-second odds a flyer settles)
//   swirlRadius       = GRID.CELL_SIZE * 2    (innermost follower orbit; +70%/layer)
//   swirlTurnRate     = 2.2                   (rad/sec follower orbit / leader weave)
//   swirlSpeed        = speed * 0.8
//   sweepPlayerEvery  = 3                     (every Nth sweep crosses the player)
//   sweepOvershoot    = GRID.CELL_SIZE * 8    (player-sweep distance past them)
//   sweepJitter       = GRID.CELL_SIZE * 4    (player-sweep perpendicular scatter)
//   sweepWeaveRatio   = 0.5                   (sine weave along the sweep; 0 = beeline)

export const FlockMechanic = {
  isEnabled(enemy) {
    return !!enemy.data.flockBehavior;
  },

  init(enemy) {
    enemy.flockMode = null;   // 'perch' | 'swirl' — preset by spawners, else rolled on first update
    enemy.flockPhase = Math.random() * Math.PI * 2;
    enemy.flockRank = Math.random(); // stable leader election: lowest airborne rank leads
    enemy.flockWaypoint = null;
    enemy.flockWaypointTimer = 0;
    enemy.flockSweepCount = 0;
    enemy.flockLandingPerch = null;
    enemy.flockLandTimer = 0;
    enemy.flockPerchSnapped = false;
    enemy.flockNoCascade = false;
  },

  // Called before the rest-state early-return so roosting members still get
  // upkeep (perch snap, take-off cascade) every frame.
  updateRoost(enemy) {
    const cfg = enemy.data.flockBehavior;
    if (!cfg) return;

    if (enemy.flockMode === null) {
      // Only a passive bat may roll into the roost — never yank an already
      // aggroed/marked spawn (e.g. cheat-spawned next to the player) into rest
      const wantsPerch = enemy.state === 'rest' ||
        (this._passive(enemy) && Math.random() < (cfg.perchChance ?? 0.5));
      enemy.flockMode = wantsPerch ? 'perch' : 'swirl';
      if (enemy.flockMode === 'perch') enemy.state = 'rest';
    }

    // Landing approach interrupted (aggro, mark) — back to regular flight
    if (enemy.flockMode === 'land' && !this._passive(enemy)) {
      enemy.flockMode = 'swirl';
      enemy.flockLandingPerch = null;
      return;
    }

    if (enemy.flockMode !== 'perch') return;

    // Left the roost for any reason (proximity wake, damage) — take flight
    if (enemy.state !== 'rest') {
      enemy.flockMode = 'swirl';
      return;
    }

    if (!enemy.flockPerchSnapped) {
      enemy.flockPerchSnapped = true;
      const perch = this._findPerch(enemy, cfg);
      if (perch) {
        enemy.position.x = perch.x;
        enemy.position.y = perch.y;
      } else if (!enemy.flockNoCascade) {
        // No valid perch within range — don't roost dormant in open air.
        // Take flight instead. (Belfry roosts cling to cave walls by design,
        // flagged flockNoCascade, and stay dormant without a perch object.)
        enemy.state = 'idle';
        enemy.flockMode = 'swirl';
        return;
      }
    }

    // Alarm cascade: a DISTURBED flockmate (airborne and aggroed/marked) pulls
    // the whole roost into the air. Calm passive flyers don't alarm the roost,
    // so bats that settled back onto a perch stay there.
    if (!enemy.flockNoCascade &&
        this._mates(enemy).some(m => m.state !== 'rest' && !this._passive(m))) {
      enemy.state = 'idle';
      enemy.flockMode = 'swirl';
    }
  },

  // Called in the end-of-update mechanic block — stamps idle flight velocity
  // over whatever wander movement set. Strictly passive-only: aggroed or
  // marked bats keep their normal AI movement (chase, mark investigation,
  // linger-wander) untouched.
  updateSwirl(enemy, { deltaTime }) {
    const cfg = enemy.data.flockBehavior;
    if (!cfg || !this._passive(enemy)) return;

    if (enemy.flockMode === 'land') return this._landOnPerch(enemy, cfg, deltaTime);
    if (enemy.flockMode !== 'swirl') return;

    // Occasional roost return: a passive flyer breaks off toward a free perch
    if (Math.random() < (cfg.rePerchChance ?? 0) * deltaTime) {
      const perch = this._findPerch(enemy, cfg);
      if (perch) {
        enemy.flockMode = 'land';
        enemy.flockLandingPerch = perch;
        enemy.flockLandTimer = 8; // abort if the approach stalls on an obstacle
        return this._landOnPerch(enemy, cfg, deltaTime);
      }
    }

    const leader = this._leader(enemy);
    if (leader === enemy) {
      this._sweepLead(enemy, cfg, deltaTime);
    } else {
      this._follow(enemy, leader, cfg, deltaTime);
    }
  },

  // Glide to the chosen perch and settle back into the roost on arrival.
  _landOnPerch(enemy, cfg, deltaTime) {
    const CS = GRID.CELL_SIZE;
    const perch = enemy.flockLandingPerch;
    enemy.flockLandTimer -= deltaTime;
    if (!perch || enemy.flockLandTimer <= 0) {
      enemy.flockMode = 'swirl';
      enemy.flockLandingPerch = null;
      return;
    }
    const dx = perch.x - enemy.position.x;
    const dy = perch.y - enemy.position.y;
    const dist = Math.hypot(dx, dy);
    if (dist < CS * 0.4) {
      enemy.position.x = perch.x;
      enemy.position.y = perch.y;
      enemy.targetVelocity.vx = 0;
      enemy.targetVelocity.vy = 0;
      enemy.flockMode = 'perch';
      enemy.state = 'rest';
      enemy.flockPerchSnapped = true;
      enemy.flockLandingPerch = null;
      return;
    }
    const speed = cfg.swirlSpeed ?? enemy.speed * 0.8;
    enemy.targetVelocity.vx = (dx / dist) * speed;
    enemy.targetVelocity.vy = (dy / dist) * speed;
  },

  // Flock-eligible: fully passive — idle, not enraged, no memory mark.
  // Aggro, damage, or a pack-shared mark pulls a bat out of the flock;
  // memory expiry (_resetPackMemory) clears marks + enraged, so survivors
  // drift back into formation.
  _passive(enemy) {
    return enemy.state === 'idle' && !enemy.enraged &&
           !enemy.aggroMemoryActive && !enemy.lastKnownPosition;
  },

  // Lowest-rank passive flock member. Aggroed/marked mates are not part of
  // the flock — followers never get dragged toward a fight.
  _leader(enemy) {
    let leader = enemy;
    for (const m of this._mates(enemy)) {
      if (!this._passive(m)) continue;
      if (m.flockRank < leader.flockRank) leader = m;
    }
    return leader;
  },

  // Leader flight: wide sweeps toward far waypoints, with a gentle sine weave
  // perpendicular to travel so the sweep reads batty rather than beeline.
  _sweepLead(enemy, cfg, deltaTime) {
    const speed = cfg.swirlSpeed ?? enemy.speed * 0.8;
    enemy.flockWaypointTimer -= deltaTime;
    let wp = enemy.flockWaypoint;
    const arrived = wp && Math.hypot(wp.x - enemy.position.x, wp.y - enemy.position.y) < GRID.CELL_SIZE * 2;
    if (!wp || arrived || enemy.flockWaypointTimer <= 0) {
      wp = enemy.flockWaypoint = this._pickSweepWaypoint(enemy, cfg);
      // Stall guard: re-pick if walls block the sweep well past its flight time
      const flight = Math.hypot(wp.x - enemy.position.x, wp.y - enemy.position.y) / speed;
      enemy.flockWaypointTimer = flight * 2.5 + 2;
    }
    const dx = wp.x - enemy.position.x;
    const dy = wp.y - enemy.position.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 1) return;
    const dirX = dx / dist;
    const dirY = dy / dist;
    enemy.flockPhase += (cfg.swirlTurnRate ?? 2.2) * deltaTime;
    const weave = Math.sin(enemy.flockPhase) * (cfg.sweepWeaveRatio ?? 0.5);
    const vx = dirX - dirY * weave;
    const vy = dirY + dirX * weave;
    const mag = Math.hypot(vx, vy);
    enemy.targetVelocity.vx = (vx / mag) * speed;
    enemy.targetVelocity.vy = (vy / mag) * speed;
  },

  // Most sweeps are wide roams: farthest of a few random room points, so the
  // flock traverses the room instead of homing. Every sweepPlayerEvery-th
  // waypoint instead lands past the player (± perpendicular scatter) so the
  // flight path keeps crossing theirs.
  _pickSweepWaypoint(enemy, cfg) {
    const CS = GRID.CELL_SIZE;
    const minX = CS * 2;
    const minY = CS * 2;
    const maxX = (GRID.COLS - 3) * CS;
    const maxY = (GRID.ROWS - 3) * CS;
    enemy.flockSweepCount++;

    const p = enemy.target?.position;
    if (p && enemy.flockSweepCount % (cfg.sweepPlayerEvery ?? 3) === 0) {
      const dx = p.x - enemy.position.x;
      const dy = p.y - enemy.position.y;
      const dist = Math.hypot(dx, dy) || 1;
      const dirX = dx / dist;
      const dirY = dy / dist;
      const overshoot = cfg.sweepOvershoot ?? CS * 8;
      const jitter = (Math.random() * 2 - 1) * (cfg.sweepJitter ?? CS * 4);
      return {
        x: Math.max(minX, Math.min(maxX, p.x + dirX * overshoot - dirY * jitter)),
        y: Math.max(minY, Math.min(maxY, p.y + dirY * overshoot + dirX * jitter))
      };
    }

    let best = null;
    let bestDist = -1;
    for (let i = 0; i < 4; i++) {
      const x = minX + Math.random() * (maxX - minX);
      const y = minY + Math.random() * (maxY - minY);
      const dist = Math.hypot(x - enemy.position.x, y - enemy.position.y);
      if (dist > bestDist) {
        bestDist = dist;
        best = { x, y };
      }
    }
    return best;
  },

  // Follower flight: orbit the leader at a rank-staggered radius so the flock
  // spreads into loose layers instead of a knot; speed up to catch up when a
  // sweep leaves them behind. Orbit rate varies per bat (rank-seeded) so
  // followers never phase-lock into a rigid formation.
  _follow(enemy, leader, cfg, deltaTime) {
    const CS = GRID.CELL_SIZE;
    // Orbit layer: passive flockmates ranked below this bat (≥1 — the leader)
    let layer = 0;
    for (const m of this._mates(enemy)) {
      if (this._passive(m) && m.flockRank < enemy.flockRank) layer++;
    }
    const radius = (cfg.swirlRadius ?? CS * 2) * (1 + (layer - 1) * 0.7);
    enemy.flockPhase += (cfg.swirlTurnRate ?? 2.2) * (0.75 + enemy.flockRank * 0.5) * deltaTime;
    const dx = leader.position.x + Math.cos(enemy.flockPhase) * radius - enemy.position.x;
    const dy = leader.position.y + Math.sin(enemy.flockPhase) * radius - enemy.position.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 1) return;
    let speed = cfg.swirlSpeed ?? enemy.speed * 0.8;
    if (dist > radius + CS * 3) speed *= 1.3;
    enemy.targetVelocity.vx = (dx / dist) * speed;
    enemy.targetVelocity.vy = (dy / dist) * speed;
  },

  // Living same-char flockmates on this enemy's plane, from the room roster.
  // Deliberately NOT packmates: flocks are not packs — flock members share
  // flight, not detection or memory marks (mark-sharing is wolves/spiders).
  _mates(enemy) {
    const roster = enemy.game?.currentRoom?.enemies || [];
    return roster.filter(m =>
      m !== enemy && m.char === enemy.char && m.hp > 0 && inSamePlane(enemy, m));
  },

  // Nearest unclaimed perch point within search radius, or null. A perch is
  // claimed when a roosting mate sits on it or another mate is gliding in to
  // land there. Used for the one-shot spawn snap and for re-perch landings.
  _findPerch(enemy, cfg) {
    const CS = GRID.CELL_SIZE;
    const perchChars = cfg.perchObjects || [];
    const mates = this._mates(enemy);
    let best = null;
    let bestDist = cfg.perchSearchRadius ?? CS * 6;
    for (const obj of enemy.backgroundObjects || []) {
      if (!perchChars.includes(obj.char)) continue;
      const px = obj.position.x;
      const py = obj.position.y - CS; // hang above the canopy, crow-style
      const dist = Math.hypot(px - enemy.position.x, py - enemy.position.y);
      if (dist >= bestDist) continue;
      const claimed = mates.some(m =>
        (m.state === 'rest' &&
          Math.abs(m.position.x - px) < CS / 2 && Math.abs(m.position.y - py) < CS / 2) ||
        (m.flockLandingPerch &&
          Math.abs(m.flockLandingPerch.x - px) < CS / 2 && Math.abs(m.flockLandingPerch.y - py) < CS / 2));
      if (claimed) continue;
      best = { x: px, y: py };
      bestDist = dist;
    }
    return best;
  }
};
