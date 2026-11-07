// autoBattle — the Mist Battle's Act 2: the three lost characters fight each
// other with no input from the player (MistBattleSystem drives it).
//
// Each body is weapon-driven:
// - it targets the nearest living rival and faces it in eight directions;
// - it picks its slot by range: past RANGED_RANGE a ranged weapon (gun, bow,
//   boomerang), inside it a melee weapon, falling back to the other kind only
//   when it carries none of the preferred one (utility items like keys are
//   never drawn);
// - melee closes to reach, ranged holds a Firing Post: a point PREFERRED_RANGE
//   from the target on one of its eight lines, so its shots fly true;
// - it rolls out of an incoming rival shot or wind-up with its own
//   character's roll, perpendicular to the threat.
//
// The bodies' attacks carry `owner` (Item.executeAttack) and land in
// CombatSystem's player lists, which CombatSystem only resolves against
// enemies; resolveRivalHits resolves them against the other two bodies.
//
// Randomness here is plain Math.random: MistBattleSystem.runTick swaps in the
// battle's seeded generator for the length of every Act 2 update tick.
import { GRID, PHYSICS } from '../../game/GameConfig.js';
import { WEAPON_TYPES } from '../../data/items.js';
import { steerToward } from '../npcSteering.js';
import { PlayerInputSystem } from '../PlayerInputSystem.js';
import { resolveAttacksOn, reportHit } from '../mirroredWeapon.js';

const CELL = GRID.CELL_SIZE;
// Seconds between decisions, plus up to THINK_JITTER more, so the three
// bodies don't all re-decide on the same frame.
const THINK_INTERVAL = 0.12;
const THINK_JITTER = 0.12;
// Past this distance a body prefers its ranged weapon.
const RANGED_RANGE = 3 * CELL;
// Where a ranged body likes to stand from its target.
const PREFERRED_RANGE = 5 * CELL;
// Melee reach: a whip lashes farther than everything else.
const MELEE_REACH = 1.5 * CELL;
const WHIP_REACH = 3 * CELL;
// The Punch lands one cell box about a cell out from the body's center
// (PunchSystem: the Slime's hitShape), so an empty-handed body stands about
// that far off its rival rather than walking into it. The bodies' soft
// contact (PhysicsSystem.resolveBodyContacts) keeps two of them from closing
// to where the box would sit past the rival; chasing the rival like a melee
// body instead pressed the two together against that push and slowed
// all-unarmed fights (median 26.4s → 29.0s over 30 seeds).
const PUNCH_STANCE = 1.1 * CELL;
// A shot counts as lined up when the target is this close to one of the
// shooter's eight lines.
const ALIGN_TOLERANCE = CELL * 0.5;
// Seconds a body keeps a slot before it may switch again.
const SLOT_SWITCH_COOLDOWN = 0.5;
// A rival shot this close and closing, or a rival wind-up this close, is a
// threat; each decision rolls away from it with ROLL_CHANCE.
const THREAT_RANGE = 3 * CELL;
const ROLL_CHANCE = 0.35;
// Goals stay within this many pixels of the arena center, so the fight stays
// inside the zoomed frame.
const LEASH = 6 * CELL;
// Inside this distance of a goal a body stops instead of jittering on it.
const ARRIVE = CELL * 0.4;
// A ranged body not yet lined up settles this close to its Firing Post: two
// bodies each stopped a full ARRIVE off their posts can sit just outside
// ALIGN_TOLERANCE of each other and never shoot.
const LINE_UP_ARRIVE = ALIGN_TOLERANCE * 0.4;
// A weapon that can't fire for longer than this (data seconds: an emptied
// bow reloading, a long cooldown) is set down for one of the other kind.
const MAX_WAIT = 3;
// Reaction Time: a body turns, lines up and swings at where its rival stood
// this many seconds ago, not where it stands this frame — REACTION_MIN plus
// up to REACTION_SPREAD, drawn once per body from the battle's seed. A rival
// that steps aside as a swing starts gets away with it, and the three bodies
// don't turn and strike in lockstep. Threats (tryRoll) are still seen at once.
const REACTION_MIN = 0.1;
const REACTION_SPREAD = 0.1;

/** Fresh per-body AI state (MistBattleSystem stores it on the member). */
export function createBrain() {
  return {
    thinkTimer: 0, target: null, slotCooldown: 0, goal: null, goalRadius: 0,
    // Reaction Time in seconds; drawn on the body's first driven frame, inside
    // the seeded tick (startAct2 itself runs on the real Math.random).
    reaction: null,
    clock: 0,      // seconds this brain has been driven
    seen: [],      // { t, rival, x, y }: rival centers over the last `reaction`
  };
}

const center = (body) => ({ x: body.position.x + CELL / 2, y: body.position.y + CELL / 2 });

// Where the body sees `target`: its center one Reaction Time ago. Records this
// frame's center, then drops every sample older than the newest one at or past
// the reaction cutoff, so seen[] holds about `reaction` seconds. A target
// picked up more recently than that is seen where it was first noticed.
function perceive(brain, target) {
  const now = center(target);
  brain.seen.push({ t: brain.clock, rival: target, x: now.x, y: now.y });
  const cutoff = brain.clock - brain.reaction;
  while (brain.seen.length > 1 && brain.seen[1].t <= cutoff) brain.seen.shift();
  return brain.seen.find(g => g.rival === target);
}

// Nothing in hand, or a spent item: what the player's SPACE Punches with.
const emptyHanded = (item) => !item || !!item.isSpent?.();

function weaponKind(item) {
  if (!item || item.isSpent?.()) return null;
  const type = item.data.weaponType;
  if (type === 'UTILITY') return null;
  if (item.data.boomerang || type === WEAPON_TYPES.GUN || type === WEAPON_TYPES.BOW) return 'ranged';
  return 'melee';
}

// Damage per swing over the swing's full cycle (windup plus recovery, data
// seconds). Breaks a tie between two weapons of one kind, so a body reaches
// for its sword before a torch or a flag that hits for little or nothing.
function damageRate(item) {
  const d = item.data;
  const cycle = (d.windup || 0) + (d.recovery || d.cooldown || 0.5);
  return (d.damage || 0) / cycle;
}

function reachOf(item) {
  return item?.data.weaponSubtype === 'whip' ? WHIP_REACH : MELEE_REACH;
}

// Eight-direction facing toward (dx, dy): an axis whose share is under half
// the other's reads as zero, so a nearly straight line faces straight. Also
// aims the Act 1 Flanks at their nearest enemy (MistBattleSystem).
export function facingToward(dx, dy) {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  return {
    x: ax >= ay * 0.5 ? Math.sign(dx) : 0,
    y: ay >= ax * 0.5 ? Math.sign(dy) : 0,
  };
}

// Whether (dx, dy) lies close to one of the eight lines out of the shooter.
function linedUp(dx, dy) {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  return ax <= ALIGN_TOLERANCE || ay <= ALIGN_TOLERANCE || Math.abs(ax - ay) <= ALIGN_TOLERANCE;
}

function nearestRival(body, rivals) {
  const from = center(body);
  let best = null;
  let bestDist = Infinity;
  for (const rival of rivals) {
    const at = center(rival);
    const dist = Math.hypot(at.x - from.x, at.y - from.y);
    if (dist < bestDist) { best = rival; bestDist = dist; }
  }
  return best;
}

// Slot choice: a weapon of the preferred kind for this distance, else one of
// the other kind. Only the held weapon's timers tick (as for the player:
// main.js updatePlayerMechanics), so a weapon put down mid-cooldown is still
// cooling when it is picked back up. The choice therefore goes by kind, the
// readiest of that kind first, never by readiness alone: a body that drew its
// third weapon would otherwise never see the first two ready again. A held
// weapon of the preferred kind is kept unless it can't fire for more than
// MAX_WAIT (an emptied bow reloading); then the readiest weapon of either
// kind that can fire sooner takes its place. A charging weapon is never
// dropped. Returns true when the body switched slots.
function chooseSlot(member, dist) {
  const { body, brain } = member;
  const held = body.heldItem;
  if (held?.isCharging || held?.windupActive) return false;
  if (brain.slotCooldown > 0) return false;
  const prefer = dist > RANGED_RANGE ? 'ranged' : 'melee';
  const heldKind = weaponKind(held);
  if (heldKind === prefer && waitOf(held) <= MAX_WAIT) return false;
  // The readiest weapon of `kind` in another slot that fires sooner than
  // `below` (ties go to the higher damageRate), or -1.
  const readiest = (kind, below) => {
    let best = -1;
    let bestWait = Infinity;
    let bestRate = -Infinity;
    body.quickSlots.forEach((item, i) => {
      if (i === body.activeSlotIndex || body.destroyedSlots?.[i] || weaponKind(item) !== kind) return;
      const wait = waitOf(item);
      if (wait >= below) return;
      const rate = damageRate(item);
      if (best < 0 || wait < bestWait || (wait === bestWait && rate > bestRate)) {
        best = i; bestWait = wait; bestRate = rate;
      }
    });
    return best;
  };
  const other = prefer === 'ranged' ? 'melee' : 'ranged';
  // Nothing usable in hand: any weapon beats none. Otherwise only a weapon
  // that fires within MAX_WAIT is worth the switch.
  const limit = heldKind ? MAX_WAIT + 1e-6 : Infinity;
  let index = readiest(prefer, limit);
  if (index < 0 && heldKind !== other) index = readiest(other, limit);
  if (index < 0) return false;
  held?.cancelChargeAndReload?.();
  body.activeSlotIndex = index;
  brain.slotCooldown = SLOT_SWITCH_COOLDOWN;
  return true;
}

// Data seconds until `item` can fire: 0 when ready, else its cooldown (an
// emptied bow's reload runs on the cooldown timer too).
function waitOf(item) {
  return item.canUse() ? 0 : Math.max(0, item.cooldownTimer);
}

function clampToLeash(point, arena) {
  const dx = point.x - arena.x;
  const dy = point.y - arena.y;
  const dist = Math.hypot(dx, dy);
  if (dist <= LEASH) return point;
  return { x: arena.x + (dx / dist) * LEASH, y: arena.y + (dy / dist) * LEASH };
}

// A ranged body's Firing Post: of the eight points PREFERRED_RANGE out from
// the target along its lines, the nearest one inside the leash.
function firingPost(from, at, arena) {
  let best = null;
  let bestDist = Infinity;
  for (let i = 0; i < 8; i++) {
    const angle = (Math.PI / 4) * i;
    const post = { x: at.x + Math.cos(angle) * PREFERRED_RANGE, y: at.y + Math.sin(angle) * PREFERRED_RANGE };
    if (Math.hypot(post.x - arena.x, post.y - arena.y) > LEASH) continue;
    const dist = Math.hypot(post.x - from.x, post.y - from.y);
    if (dist < bestDist) { best = post; bestDist = dist; }
  }
  return best ?? clampToLeash(at, arena);
}

// The incoming rival shot or wind-up to roll away from, as a direction from
// the threat to the body, or null.
function findThreat(game, body, rivals) {
  const from = center(body);
  for (const proj of game.combatSystem.projectiles) {
    if (!proj.owner || proj.owner === body || !rivals.includes(proj.owner) || proj.missed) continue;
    const dx = from.x - (proj.position.x + CELL / 2);
    const dy = from.y - (proj.position.y + CELL / 2);
    const dist = Math.hypot(dx, dy);
    const v = proj.velocity;
    if (dist > THREAT_RANGE || !v || v.vx * dx + v.vy * dy <= 0) continue;
    return { x: v.vx, y: v.vy };
  }
  for (const rival of rivals) {
    if (!rival.heldItem?.windupActive) continue;
    const at = center(rival);
    const dx = from.x - at.x;
    const dy = from.y - at.y;
    if (Math.hypot(dx, dy) <= reachOf(rival.heldItem) + CELL) return { x: dx, y: dy };
  }
  return null;
}

function tryRoll(game, body, threat) {
  if (body.dodgeRoll.active || body.dodgeRoll.cooldownTimer > 0) return;
  if (Math.random() >= ROLL_CHANCE) return;
  const len = Math.hypot(threat.x, threat.y) || 1;
  const side = Math.random() < 0.5 ? 1 : -1;
  const dir = { x: Math.round((-threat.y / len) * side), y: Math.round((threat.x / len) * side) };
  if (dir.x === 0 && dir.y === 0) return;
  body.heldItem?.cancelChargeAndReload?.();
  if (!body.startDodgeRoll(dir, [])) return;
  if (body.pendingBlink) {
    game.warpSystem.resolveBlinkTeleport(body.pendingBlink, body);
    body.pendingBlink = null;
  }
}

/** One decision: target, facing, slot, goal, and a roll if threatened. */
function think(game, member, rivals, arena, onSlotSwitch) {
  const { body, brain } = member;
  const target = nearestRival(body, rivals);
  brain.target = target;
  if (!target) { brain.goal = null; return; }

  const from = center(body);
  const at = center(target);
  const dist = Math.hypot(at.x - from.x, at.y - from.y);
  if (chooseSlot(member, dist)) onSlotSwitch(member);

  const threat = findThreat(game, body, rivals);
  if (threat) tryRoll(game, body, threat);

  const kind = weaponKind(body.heldItem);
  if (kind === 'ranged') {
    brain.goal = firingPost(from, at, arena);
    brain.goalRadius = 0;
  } else if (emptyHanded(body.heldItem)) {
    // The Punch's stance: PUNCH_STANCE off the rival, on this body's side.
    const len = dist || 1;
    brain.goal = clampToLeash({
      x: at.x + ((from.x - at.x) / len) * PUNCH_STANCE,
      y: at.y + ((from.y - at.y) / len) * PUNCH_STANCE,
    }, arena);
    brain.goalRadius = 0;
  } else {
    // Close to reach: head for the target itself and stop once inside most
    // of the reach. Aiming at a point short of it instead could set the goal
    // inside a pillar between the two, where steering can't arrive or route
    // and both bodies stood still for the rest of the battle.
    brain.goal = clampToLeash(at, arena);
    brain.goalRadius = reachOf(body.heldItem) * 0.7;
  }
}

// Fire the held weapon when the shot is good: melee in reach, ranged lined
// up. A bow (or charge gun) draws on the first good moment and looses at
// full draw.
function attack(member, dist, aligned, fire, punch) {
  const { body } = member;
  const item = body.heldItem;
  if (body.dodgeRoll.active) return;
  // Nothing in hand, or a spent item: the Punch is the attack, as for the
  // player's SPACE (main.js handleSpacePress). Thrown from melee reach;
  // PunchSystem gates its own windup and cooldown.
  if (emptyHanded(item)) {
    if (dist <= MELEE_REACH && body.canAttack()) punch(member);
    return;
  }
  const kind = weaponKind(item);
  if (!kind) return;
  if (item.isCharging) {
    if (item.chargeTime >= item.maxChargeTime && body.canAttack()) fire(member, item.releaseBow());
    return;
  }
  const good = kind === 'melee' ? dist <= reachOf(item) : aligned;
  if (good && body.canAttack() && item.canUse()) fire(member, body.useHeldItem());
}

function move(game, member, aligned) {
  const { body, brain } = member;
  if (body.dodgeRoll.active || body.continuousRollActive) return; // the roll owns velocity
  // The player's own attack rules hold here too: a drawn charge or a planted
  // stance stops the feet, a firing gun or a held windup slows them.
  if (!brain.goal || body.heldItem?.isCharging || body.isLocked() || PlayerInputSystem.plantsFeet(body)) {
    body.velocity.vx = 0;
    body.velocity.vy = 0;
    return;
  }
  // `goal` is a center point; steering works on the body's top-left.
  const x = brain.goal.x - CELL / 2;
  const y = brain.goal.y - CELL / 2;
  const arrive = Math.max(brain.goalRadius,
    weaponKind(body.heldItem) === 'ranged' && !aligned ? LINE_UP_ARRIVE : ARRIVE);
  if (Math.hypot(x - body.position.x, y - body.position.y) < arrive) {
    body.velocity.vx = 0;
    body.velocity.vy = 0;
    return;
  }
  const speed = (body.getRollSpeed() / 1.1) * body.getStatusSpeedMultiplier()
    * PlayerInputSystem.attackSpeedMultiplier(body);
  const { mode } = steerToward(game, body, x, y, speed);
  // Steering waits at the shore of a hazard its goal stands in (an NPC won't
  // wade in). A body is a player and wades: two rivals each standing in water
  // otherwise waited on each other's shores for the rest of the battle.
  if (mode === 'shore') {
    const dx = x - body.position.x;
    const dy = y - body.position.y;
    const len = Math.hypot(dx, dy) || 1;
    body.velocity.vx = (dx / len) * speed;
    body.velocity.vy = (dy / len) * speed;
  }
}

/**
 * Drive one body for this frame. `rivals` are the other living bodies,
 * `arena` the center point goals are leashed to. `fire(member, attack)`
 * commits the body's attack as the player's own; `punch(member)` throws the body's Punch when it has
 * nothing to swing; `onSlotSwitch(member)` is told when the body draws a
 * different weapon.
 */
export function driveBody(game, member, rivals, arena, deltaTime, { fire, punch, onSlotSwitch }) {
  const { body, brain } = member;
  if (brain.reaction === null) brain.reaction = REACTION_MIN + Math.random() * REACTION_SPREAD;
  brain.clock += deltaTime;
  brain.slotCooldown = Math.max(0, brain.slotCooldown - deltaTime);
  brain.thinkTimer -= deltaTime;
  if (brain.thinkTimer <= 0 || !rivals.includes(brain.target)) {
    brain.thinkTimer = THINK_INTERVAL + Math.random() * THINK_JITTER;
    think(game, member, rivals, arena, onSlotSwitch);
  }
  const target = brain.target;
  if (!target) {
    body.velocity.vx = 0;
    body.velocity.vy = 0;
    return;
  }
  const from = center(body);
  const at = perceive(brain, target);
  const dx = at.x - from.x;
  const dy = at.y - from.y;
  // A swing keeps the facing it started with, as the player's does while
  // SPACE is held (main.js lockFacing): a body can't track its rival through
  // its own windup.
  const facing = facingToward(dx, dy);
  if ((facing.x !== 0 || facing.y !== 0) && !PlayerInputSystem.swingHoldsFacing(body.heldItem)) {
    body.facing.x = facing.x;
    body.facing.y = facing.y;
  }
  const aligned = linedUp(dx, dy);
  attack(member, Math.hypot(dx, dy), aligned, fire, punch);
  move(game, member, aligned);
}

/**
 * Resolve the bodies' own attacks against `body`: every live player
 * projectile and melee attack owned by one of its rivals. `resolved` is the
 * battle's WeakMap (attack → bodies it is done with), so a piercing shot or
 * a lingering swing lands on each body once. Player melee hits on its first
 * test, as against enemies (CombatSystem's `hasHit`), with the full attack
 * box. Returns nothing; the caller checks `body.hp` afterward.
 */
export function resolveRivalHits(game, body, rivals, resolved) {
  const cs = game.combatSystem;
  const notRival = (attack) => attack.missed || !rivals.includes(attack.owner);
  resolveAttacksOn(game, body, {
    projectiles: cs.projectiles,
    melee: cs.meleeAttacks,
    resolved,
    pierce: true,
    skipProjectile: notRival,
    skipMelee: notRival,
    meleeHits: (attack) => cs.checkMeleeCollision(attack, body),
  }, (damage, source, from, _knockbackForce, attackObj) => {
    const result = body.takeDamage(damage ?? 1, source);
    if (result !== false) {
      const shove = attackObj.knockback ?? PHYSICS.DEFAULT_DAMAGE_KNOCKBACK;
      reportHit(game, body, result, damage ?? 1, from, shove);
    }
    return result;
  });
}
