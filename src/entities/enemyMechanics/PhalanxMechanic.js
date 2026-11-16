// Phalanx: a squad of spear-carriers behind held parries (data.phalanx +
// data.parryMechanic { held: true }).
//
// The guard. Each member holds a parry (ParryMechanic, `held`) facing its
// `guardAngle`: a melee blow from inside the front arc is turned aside, one
// from behind lands. The guard is down while the member thrusts and recovers
// (its own Strike/Recover) and while it is stunned, zapped, asleep, frozen or
// knocked back (ParryMechanic.isHeldParryUp), and coming back up takes
// parryWindup. Nothing but a melee blow is
// parried, so projectiles, traps, magic and the Red Warrior's roll land from
// any side.
//
// The Formation. A squad that has seen the player forms up: every living
// member is called into Approach (sharing the mark) and steered to a slot.
// The Formation is rolled per form-up from `formations`:
//   line — side by side across the heading, every guard facing the player.
//   ring — back to back around a centre, every guard facing outward: two
//          members stand back to back, three make a triangle, four a square.
// A squad does not form up while any living member is stunned or asleep, and
// breaks Formation the moment one is; it breaks too when no member is engaged
// any more (each lost sight and rolled Search or wander — approach.js
// `searchChance`). A squad of one never forms up.
//
// Decision time, so a squad is never a wall that turns as fast as the player
// moves:
//   - the squad thinks (forms up, breaks, re-assigns slots) every
//     `thinkInterval`, not every frame;
//   - the Formation's heading turns at `headingTurnRate` and each guard at
//     `guardTurnRate` (radians per enemy-timer second), so circling a member
//     or rolling past it gets behind the guard;
//   - when one member thrusts, the others hold their spears for
//     `strikeStagger`, so the squad never thrusts as one.
//
// Squad state is room-lifetime — it lives on the member instances and dies
// with the room — so it needs no Reset Registry entry.

import { GRID, PHYSICS } from '../../game/GameConfig.js';
import { holdParry } from './ParryMechanic.js';

// States in which a member is engaged with the player.
const ENGAGED = new Set(['approach', 'anticipate', 'strike', 'recover']);
// States in which a member lowers its guard to use the spear.
const GUARD_DOWN = new Set(['strike', 'recover']);
// States in which the squad steers a member to its slot. Anticipate, Strike
// and Recover keep their own movement.
const STEERED = new Set(['approach']);

const isAlive = (m) => m.hp > 0;
// What keeps a squad from forming up (and breaks a Formation): any member
// stunned or asleep.
const isDisrupted = (m) => m.isStunned() || m.isFullyAsleep() || m.sleepTimer > 0;
// A member that cannot act returns from Enemy.update before its mechanics
// run, so the squad thinks through the first member that can.
const canAct = (m) => m.hp > 0 && !isDisrupted(m) && !m.isZapped() && !m.isFrozen() && !m.isKnockedBack();

function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

// Turns `from` toward `to` by at most `maxStep` radians.
function turnToward(from, to, maxStep) {
  const diff = wrapAngle(to - from);
  if (Math.abs(diff) <= maxStep) return to;
  return from + Math.sign(diff) * maxStep;
}

function centreOf(members) {
  let x = 0, y = 0;
  for (const m of members) { x += m.position.x; y += m.position.y; }
  return { x: x / members.length, y: y / members.length };
}

// The ring's radius for `n` members `spacing` apart: the circumradius of the
// regular polygon they stand on (two stand back to back at spacing / 2).
function ringRadius(n, spacing) {
  return n < 2 ? 0 : spacing / (2 * Math.sin(Math.PI / n));
}

export const PhalanxMechanic = {
  isEnabled(enemy) {
    return enemy.data.phalanx?.enabled === true;
  },

  init(enemy) {
    // Set by the spawner (createSquad); a Phalanx spawned on its own fights
    // alone and never forms up.
    enemy.phalanxSquad = null;
    enemy.phalanxSlot = 0;
    enemy.phalanxStriking = false;
    // A Phalanx thrusts from where it stands: a leap into the swing (Weapon
    // Conversion's melee default) would carry it out of its Formation.
    enemy.leapOnAttack = false;
  },

  /** Links `members` into one squad. Called once by the spawner. */
  createSquad(members) {
    const squad = {
      members,
      formation: null,      // null | 'line' | 'ring'
      heading: 0,           // radians, from the anchor toward the player
      anchor: { x: 0, y: 0 },
      thinkTimer: 0,
      slotCount: 0,         // living members when slots were last assigned
    };
    members.forEach((m, i) => {
      m.phalanxSquad = squad;
      m.phalanxSlot = i;
    });
    return squad;
  },

  update(enemy, ctx) {
    const cfg = enemy.data.phalanx;
    if (!cfg?.enabled) return;
    const { deltaTime } = ctx;
    const squad = enemy.phalanxSquad;

    // The squad thinks once a frame, through its first member able to act.
    if (squad && squad.members.find(canAct) === enemy) {
      PhalanxMechanic._updateSquad(squad, cfg, deltaTime);
    }

    const formed = !!squad?.formation;
    const current = enemy.stateMachine.current;
    if (formed && STEERED.has(current)) PhalanxMechanic._steerToSlot(enemy, squad, cfg);
    PhalanxMechanic._updateGuard(enemy, squad, cfg, deltaTime);
  },

  _updateSquad(squad, cfg, deltaTime) {
    const living = squad.members.filter(isAlive);

    // The stagger: one member thrusting holds the others' spears.
    for (const m of living) {
      const striking = m.stateMachine.current === 'strike';
      if (striking && !m.phalanxStriking) {
        for (const other of living) {
          if (other !== m) other.attackTimer = Math.max(other.attackTimer, cfg.strikeStagger ?? 0);
        }
      }
      m.phalanxStriking = striking;
    }

    const engaged = living.filter(m => m.target && ENGAGED.has(m.stateMachine.current));

    // Breaking is not a decision: a stunned or sleeping member, or a squad
    // down to one, ends the Formation on the frame it happens.
    if (squad.formation && (living.length < 2 || living.some(isDisrupted))) {
      squad.formation = null;
    }

    squad.thinkTimer -= deltaTime;
    if (squad.thinkTimer <= 0) {
      squad.thinkTimer = cfg.thinkInterval ?? 0.8;
      const canForm = living.length >= 2 && engaged.length > 0 && !living.some(isDisrupted);
      if (!canForm) {
        squad.formation = null;
      } else if (!squad.formation) {
        PhalanxMechanic._formUp(squad, cfg, living, engaged);
      } else if (living.length !== squad.slotCount) {
        // A member fell: close the gap.
        PhalanxMechanic._assignSlots(squad, living);
      }
    }

    if (!squad.formation) return;

    // Hold the Formation on the player: the heading turns and the anchor
    // advances until the front can reach with a spear.
    const target = engaged[0]?.target ?? living[0].target;
    if (!target) return;
    const tx = target.position.x, ty = target.position.y;
    const dx = tx - squad.anchor.x, dy = ty - squad.anchor.y;
    const dist = Math.hypot(dx, dy);
    squad.heading = wrapAngle(turnToward(squad.heading, Math.atan2(dy, dx), (cfg.headingTurnRate ?? 0.7) * deltaTime));

    const reach = Math.min(...living.map(m => m.attackRange)) * 0.8;
    const standOff = squad.formation === 'ring'
      ? ringRadius(living.length, cfg.spacing) + reach
      : reach;
    if (dist > standOff) {
      const speed = Math.min(...living.map(m => m.speed)) * (cfg.advanceSpeedMult ?? 0.6);
      const step = Math.min(dist - standOff, speed * deltaTime / PHYSICS.ENEMY_TIMER_RATE);
      squad.anchor.x += Math.cos(squad.heading) * step;
      squad.anchor.y += Math.sin(squad.heading) * step;
    }

    // Members that saw the player share where; a called member keeps the mark.
    const seer = engaged.find(m => m.lastKnownPosition);
    if (seer) {
      for (const m of living) {
        if (m !== seer && ENGAGED.has(m.stateMachine.current)) {
          m.lastKnownPosition = { x: seer.lastKnownPosition.x, y: seer.lastKnownPosition.y };
        }
      }
    }
  },

  _formUp(squad, cfg, living, engaged) {
    const formations = cfg.formations?.length ? cfg.formations : ['line'];
    squad.formation = formations[Math.floor(Math.random() * formations.length)];
    squad.anchor = centreOf(living);
    const target = engaged[0].target;
    squad.heading = Math.atan2(target.position.y - squad.anchor.y, target.position.x - squad.anchor.x);
    PhalanxMechanic._assignSlots(squad, living);

    // Call the rest of the squad in, with the seer's mark.
    const mark = engaged[0].lastKnownPosition ?? { x: target.position.x, y: target.position.y };
    for (const m of living) {
      if (ENGAGED.has(m.stateMachine.current)) continue;
      m.lastKnownPosition = { x: mark.x, y: mark.y };
      m.stateMachine.transition(m, null, 'approach', 'phalanx formed up');
    }
  },

  // Slots go to members in the order they already stand, so nobody crosses
  // the Formation to reach theirs: across the heading for a line, around the
  // centre for a ring.
  _assignSlots(squad, living) {
    const h = squad.heading;
    // Ring: the angle around the centre measured from slot 0 (heading + π),
    // in [0, 2π), the same order _slotFor lays the slots out in.
    const TAU = Math.PI * 2;
    const key = squad.formation === 'ring'
      ? (m) => ((Math.atan2(m.position.y - squad.anchor.y, m.position.x - squad.anchor.x) - h - Math.PI) % TAU + TAU) % TAU
      : (m) => (m.position.x - squad.anchor.x) * -Math.sin(h) + (m.position.y - squad.anchor.y) * Math.cos(h);
    const ordered = [...living].sort((a, b) => key(a) - key(b));
    ordered.forEach((m, i) => { m.phalanxSlot = i; });
    squad.slotCount = living.length;
  },

  // Where a member stands, and which way its guard faces, in the current
  // Formation.
  _slotFor(enemy, squad, cfg) {
    const n = squad.slotCount;
    const i = Math.min(enemy.phalanxSlot, n - 1);
    const h = squad.heading;
    if (squad.formation === 'ring') {
      // Slot 0 sits on the far side from the player, so the order matches
      // _assignSlots' angle sort (which starts at heading + π).
      const angle = h + Math.PI + (i * Math.PI * 2) / n;
      const r = ringRadius(n, cfg.spacing);
      return { x: squad.anchor.x + Math.cos(angle) * r, y: squad.anchor.y + Math.sin(angle) * r, guard: angle };
    }
    const offset = (i - (n - 1) / 2) * cfg.spacing;
    return { x: squad.anchor.x - Math.sin(h) * offset, y: squad.anchor.y + Math.cos(h) * offset, guard: h };
  },

  // Overrides Approach's own movement with the walk to the slot.
  _steerToSlot(enemy, squad, cfg) {
    const slot = PhalanxMechanic._slotFor(enemy, squad, cfg);
    const sdx = slot.x - enemy.position.x;
    const sdy = slot.y - enemy.position.y;
    const sd = Math.hypot(sdx, sdy);
    // Slows into the slot instead of overshooting and hunting back.
    const arrive = Math.min(1, sd / (GRID.CELL_SIZE * 0.5));
    const speed = sd > 1 ? enemy.speed * arrive : 0;
    enemy.targetVelocity.vx = sd > 0 ? (sdx / sd) * speed : 0;
    enemy.targetVelocity.vy = sd > 0 ? (sdy / sd) * speed : 0;
  },

  // Raises or lowers the held parry and turns it toward where it should face.
  _updateGuard(enemy, squad, cfg, deltaTime) {
    const parryCfg = enemy.data.parryMechanic;
    if (!parryCfg?.held) return;
    // Only reached by a member able to act; isHeldParryUp covers the rest.
    const current = enemy.stateMachine.current;
    holdParry(enemy, parryCfg, !GUARD_DOWN.has(current), deltaTime);

    let want;
    if (squad?.formation && STEERED.has(current)) {
      want = PhalanxMechanic._slotFor(enemy, squad, cfg).guard;
    } else if (enemy.target && ENGAGED.has(current)) {
      want = Math.atan2(enemy.target.position.y - enemy.position.y, enemy.target.position.x - enemy.position.x);
    } else {
      want = enemy.facingAngle;
    }
    enemy.guardAngle = wrapAngle(turnToward(enemy.guardAngle, want, (cfg.guardTurnRate ?? 1.6) * deltaTime));
  },
};
