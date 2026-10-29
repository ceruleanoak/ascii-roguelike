import { GRID, COLORS } from '../game/GameConfig.js';
import { ZONE_COLORS } from '../data/zones.js';
import { CURSED_RECIPES } from '../data/recipes.js';
import { ITEM_TYPES } from '../data/items.js';
import { canReachLoot } from './PlaneSystem.js';
import { formatElapsed } from './RunTimerSystem.js';

// The Graveyard is never empty on a first look, and it thickens from there.
const GRAVEYARD_BASE = 5;
const GRAVEYARD_PER_ROOM = 2;
// A ceiling, so a long cursed run crowds the lower two thirds without turning
// them into a solid block of letters.
const GRAVEYARD_MAX = 40;

// How many rooms the curse has to be carried through before REST itself gives
// way. Long enough that the Graveyard has visibly thickened across several
// visits first — the hub going gray reads as the last thing to fall, not the
// opening move.
const REST_DECAY_ROOMS = 8;

// Halfway to the decay, Charon stops keeping his post: past this many cursed
// rooms he neither stands at REST's north exit nor takes a toll — until REST
// has given way and he comes back once to say goodbye (charonVisit).
const CHARON_FORSAKES_ROOMS = REST_DECAY_ROOMS / 2;

// A decayed REST admits the Undead through its south door one at a time — the
// pace is the point, so the player watches the hub fill while they craft
// rather than turning around to find a crowd already standing there.
const REST_STREAM_INTERVAL = 7.0;
const REST_STREAM_MAX = 12;

// How far in from the door an arrival makes for before it starts milling.
const REST_WALK_IN_CELLS = 6;

// Cursed recipe scrolls: a Rare drop from undead enemies, only while cursed.
const SCROLL_CHAR = '∫';
const SCROLL_DROP_CHANCE = 0.10;   // matches RARE's 10-in-100 weight against COMMON
const SCROLL_PICKUP_RADIUS = 20;   // same reach as InventorySystem.tryPickupItem
const SCROLL_REVEAL_MS = 4000;     // how long a read scroll's recipe stays up

// Misfires: the player turning on themselves as the curse deepens
// (claudedocs/three-voice-plan.md §7b). The rate climbs linearly with Curse
// Depth up to the cap, then holds — the draft curve, to be tuned by playtest.
// If the ramp should bite sooner, raise the ceiling rate or lower the cap.
const CURSE_DEPTH_CAP = 48;
const MISFIRES_PER_MINUTE_AT_CAP = 1.5;
// A delayed dodge or attack goes off this long after the press; a dropped one
// swallows presses for the same span (a dodge until its keys are let go).
const MISFIRE_DELAY = 0.4;
// A wander takes the movement keys for this long, making for the nearest
// lava, poisoned water or deep water within reach — or anywhere, if none.
const WANDER_DURATION = 0.9;
const WANDER_REACH_CELLS = 8;
// How far off an axis the wander's heading must lean before it holds that key.
const WANDER_KEY_LEAN = 0.38;
const NO_DODGE = { x: 0, y: 0 };

/** Lava, poisoned water or deep water: where a wandering player ends up. */
function isCurseHazard(obj) {
  if (obj.char !== '~') return false;
  const isLava = obj.typeId ? obj.typeId === 'lava' : !!(obj.damaging && obj.damage);
  return isLava || !!obj.deepWater || obj.getWaterState?.() === 'poisoned';
}

/**
 * CursedRunSystem — what a Cursed run does to the rest of the world.
 *
 * The curse starts in the Three Room (ThreeRoomSystem sets `game.cursedRun`
 * when a slot cracks) but it does not stay there. Everything the flag changes
 * OUTSIDE that room is owned here, so the escalation lands in one file instead
 * of scattering conditionals through the orchestrator: REST opening its south
 * wall onto the Graveyard first, and — as the curse runs further — REST going
 * gray, no longer healing, and admitting the Undead.
 *
 * It also owns the cursed recipes' reach into the run: undead dropping
 * scrolls that show one, and the Cursed Belt's doubled depth step.
 *
 * And it owns the curse deepening in the player's own hands: the Curse Clock,
 * the Broken Slot count, Curse Depth, and the Misfires that depth sets —
 * dropped or delayed dodges and attacks, and wanders toward hazards
 * (claudedocs/three-voice-plan.md §7b).
 *
 * Every method is a no-op on an uncursed run, so call sites stay unconditional.
 */
export class CursedRunSystem {
  constructor() {
    // Rooms explored since the curse landed. System-internal rather than a
    // game.* field, the same shape as ThreeRoomSystem's north streak: nothing
    // outside this system reads it, so it does not belong on the contract
    // surface. hardReset() is its reset home.
    this._roomsExplored = 0;

    // Counts down to the next arrival through REST's south door. Reset on
    // every REST entry (applyToRest) as well as on a full run reset.
    this._streamTimer = REST_STREAM_INTERVAL;

    // Results of the cursed recipes whose scrolls have been read this run, so
    // the next scroll shows one not yet seen. System-internal like the above.
    this._readScrolls = new Set();

    // The recipe a just-read scroll is showing ({ recipe, until }), or null.
    this.scrollReveal = null;

    // Set when Charon has said his farewell over a decayed REST: from then on
    // EXPLORE's south exit stays shut, gray, for the rest of the run.
    this._restSealed = false;

    // The Curse Clock: performance.now() when the Cursed Run began, or null.
    // A real-time delta like RunTimerSystem's, drawn gray beside it.
    this._curseStartedAt = null;

    // Three Room slots cracked this run (a wrong offering or GIVE). Counted
    // here rather than read off the room, which is gone once the player leaves.
    this._crackedThreeSlots = 0;

    // A misfire waiting on the next dodge or attack: 'drop' | 'delay' | null.
    this._misfire = null;
    // The dodge or attack a misfire is holding back:
    // { action: 'dodge'|'attack', kind: 'drop'|'delay', timer, direction }.
    this._heldAction = null;
    // A wander in progress: { dx, dy, timer } — the heading the keys are held to.
    this._wander = null;
    // Whether a dodge direction was held last frame, so only a fresh press is
    // taken by a misfire (the dodge keys are held, not pressed once).
    this._dodgeWasHeld = false;
    // True while a delayed attack is being replayed, so it isn't taken again.
    this._replayingAttack = false;
  }

  /** Full run-scoped reset — death/title. */
  hardReset() {
    this._roomsExplored = 0;
    this._streamTimer = REST_STREAM_INTERVAL;
    this._readScrolls = new Set();
    this.scrollReveal = null;
    this._restSealed = false;
    this._curseStartedAt = null;
    this._crackedThreeSlots = 0;
    this._misfire = null;
    this._heldAction = null;
    this._wander = null;
    this._dodgeWasHeld = false;
    this._replayingAttack = false;
  }

  // ── The Curse Clock, Broken Slots and Curse Depth ──────────────────────────

  /**
   * A Three Room slot cracked (ThreeRoomSystem._crack). The first crack starts
   * the Curse Clock — that is the moment the Cursed Run begins.
   */
  recordCrack() {
    if (this._curseStartedAt === null) this._curseStartedAt = performance.now();
    this._crackedThreeSlots++;
  }

  /** The Curse Clock in the run timer's bare digits, or null on an uncursed run. */
  formatCurseClock(game) {
    if (!game.cursedRun || this._curseStartedAt === null) return null;
    return formatElapsed(performance.now() - this._curseStartedAt);
  }

  /**
   * Every slot broken this run: cracked Three Room slots plus quick slots a
   * wish destroyed — a wish is just another way of breaking a slot, so the
   * ones spent before the curse began count too.
   */
  brokenSlots(game) {
    return this._crackedThreeSlots + (game.wishesUsed || 0);
  }

  /** Rooms explored since the curse began × Broken Slots. 0 on an uncursed run. */
  curseDepth(game) {
    return game.cursedRun ? this._roomsExplored * this.brokenSlots(game) : 0;
  }

  /** Misfires per minute at the current Curse Depth. */
  misfireRate(game) {
    return MISFIRES_PER_MINUTE_AT_CAP * Math.min(this.curseDepth(game), CURSE_DEPTH_CAP) / CURSE_DEPTH_CAP;
  }

  // ── Misfires ───────────────────────────────────────────────────────────────

  /**
   * Per frame, from the state-shared player path: run down a held action or
   * a wander, replay a delayed attack when its time comes, and otherwise roll
   * for the next misfire. One misfire at a time.
   */
  updateCurse(dt, game) {
    if (!game.cursedRun) return;
    if (this._wander) {
      this._wander.timer -= dt;
      if (this._wander.timer <= 0) this._wander = null;
    }
    const held = this._heldAction;
    if (held) {
      held.timer -= dt;
      // A held dodge is let go by gateDodge, which owns the dodge keys.
      if (held.action === 'attack' && held.timer <= 0) {
        this._heldAction = null;
        if (held.kind === 'delay') this._replayAttack(game);
      }
    }
    if (this._misfire || this._wander || this._heldAction) return;
    if (Math.random() < this.misfireRate(game) * dt / 60) this._rollMisfire(game);
  }

  /** A misfire lands: a wander now, or a dropped or delayed next action. */
  _rollMisfire(game) {
    const roll = Math.random();
    if (roll < 1 / 3) this._startWander(game);
    else this._misfire = roll < 2 / 3 ? 'drop' : 'delay';
  }

  /**
   * The dodge direction after the curse has had its say (CharacterSystem.
   * updateDodge). A misfire takes the next fresh dodge press: dropped, it
   * stays gone until the keys are let go; delayed, it goes off in its
   * original direction a moment later whether the keys are still held or not.
   */
  gateDodge(game, direction) {
    if (!game.cursedRun) return direction;
    const pressed = direction.x !== 0 || direction.y !== 0;
    const fresh = pressed && !this._dodgeWasHeld;
    this._dodgeWasHeld = pressed;

    const held = this._heldAction;
    if (held?.action === 'dodge') {
      if (held.kind === 'drop') {
        if (!pressed) this._heldAction = null;
        return NO_DODGE;
      }
      if (held.timer > 0) return NO_DODGE;
      this._heldAction = null;
      return held.direction;
    }

    const roll = game.player.dodgeRoll;
    if (!this._misfire || !fresh || roll.active || roll.cooldownTimer > 0) return direction;
    this._heldAction = { action: 'dodge', kind: this._misfire, timer: MISFIRE_DELAY, direction: { ...direction } };
    this._misfire = null;
    return NO_DODGE;
  }

  /**
   * True when the curse takes this attack press (CombatSystem.tryUseHeldWeapon).
   * The press that meets a misfire, and any made while it holds, are
   * swallowed; a delayed one is replayed when the hold runs out.
   */
  gateAttack(game) {
    if (!game.cursedRun || this._replayingAttack) return false;
    if (this._heldAction?.action === 'attack') return true;
    if (!this._misfire) return false;
    this._heldAction = { action: 'attack', kind: this._misfire, timer: MISFIRE_DELAY, direction: null };
    this._misfire = null;
    return true;
  }

  /** A delayed attack goes off, if the player can still swing. */
  _replayAttack(game) {
    const player = game.player;
    if (!player?.heldItem || player.heldItem.isSpent?.() || !player.canAttack()) return;
    this._replayingAttack = true;
    game.combatSystem.tryUseHeldWeapon();
    this._replayingAttack = false;
  }

  /**
   * The player walks on their own for a moment, toward the nearest lava,
   * poisoned water or deep water in reach — or in any direction, if there's
   * none to walk into.
   */
  _startWander(game) {
    const player = game.player;
    if (!player) return;
    const px = player.position.x + GRID.CELL_SIZE / 2;
    const py = player.position.y + GRID.CELL_SIZE / 2;
    let target = null;
    let nearest = WANDER_REACH_CELLS * GRID.CELL_SIZE;
    for (const obj of game._activeBackgroundObjects?.() || []) {
      if (!isCurseHazard(obj)) continue;
      const d = Math.hypot(obj.position.x + GRID.CELL_SIZE / 2 - px, obj.position.y + GRID.CELL_SIZE / 2 - py);
      if (d < nearest) { nearest = d; target = obj; }
    }
    let dx, dy;
    if (target) {
      const len = Math.max(nearest, 1);
      dx = (target.position.x + GRID.CELL_SIZE / 2 - px) / len;
      dy = (target.position.y + GRID.CELL_SIZE / 2 - py) / len;
    } else {
      const angle = Math.random() * Math.PI * 2;
      dx = Math.cos(angle);
      dy = Math.sin(angle);
    }
    this._wander = { dx, dy, timer: WANDER_DURATION };
  }

  /**
   * The movement keys a wander holds, in the shape main.js's held-keys chain
   * takes (FightSystem.heldKeys), or null when the player has their own keys.
   */
  heldKeys(game) {
    if (!this._wander || !game.cursedRun) return null;
    const { dx, dy } = this._wander;
    return { w: dy < -WANDER_KEY_LEAN, s: dy > WANDER_KEY_LEAN, a: dx < -WANDER_KEY_LEAN, d: dx > WANDER_KEY_LEAN };
  }

  /**
   * Depths one exit advances — 2 with a Cursed Belt equipped on a Cursed Run,
   * else 1. ZoneSystem.incrementZoneDepth clamps the step at the zone's cap.
   */
  depthStep(game) {
    if (!game.cursedRun) return 1;
    const belt = game.player?.equippedConsumables?.find(slot => slot?.data?.depthStepMultiplier);
    return belt ? belt.data.depthStepMultiplier : 1;
  }

  /**
   * An enemy died. On a Cursed Run, undead enemies have a Rare chance to drop
   * a cursed recipe scroll — until every cursed recipe has been read.
   */
  rollScrollDrop(game, enemy) {
    if (!game.cursedRun || !enemy.data?.affinities?.includes('undead')) return;
    if (this._readScrolls.size >= CURSED_RECIPES.length) return;
    if (Math.random() >= SCROLL_DROP_CHANCE) return;
    game.lootSystem.spawnItemDrop(SCROLL_CHAR, enemy.position.x, enemy.position.y, null, enemy);
  }

  /**
   * SPACE pickup: a scroll in reach is read on the spot — its recipe shows
   * for a few seconds and the scroll is gone for good. Returns true when a
   * scroll was read, so the ordinary pickup does not also run.
   */
  tryReadScroll(game) {
    const items = game.items || [];
    const now = performance.now();
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.data?.type !== ITEM_TYPES.SCROLL) continue;
      if (!canReachLoot(game, game.player, item)) continue;
      if (item.pickupReadyAt && item.pickupReadyAt > now) continue;
      if (game.physicsSystem.getDistance(game.player, item) >= SCROLL_PICKUP_RADIUS) continue;

      item.consumed = true;
      game.physicsSystem.removeEntity(item);
      items.splice(i, 1);

      // An unread recipe first; a duplicate scroll that dropped before the
      // last one was read shows one already seen.
      const recipe = CURSED_RECIPES.find(r => !this._readScrolls.has(r.result))
        ?? CURSED_RECIPES[Math.floor(Math.random() * CURSED_RECIPES.length)];
      this._readScrolls.add(recipe.result);
      this.scrollReveal = { recipe, until: now + SCROLL_REVEAL_MS };
      return true;
    }
    return false;
  }

  /** The recipe a read scroll is currently showing, or null once it has faded. */
  activeScrollReveal() {
    if (!this.scrollReveal) return null;
    if (performance.now() >= this.scrollReveal.until) {
      this.scrollReveal = null;
      return null;
    }
    return this.scrollReveal.recipe;
  }

  /**
   * A newly explored room. Only counts while cursed, because the Graveyard is
   * counting what the curse has cost, not how far the run has gone.
   */
  recordRoomExplored(game) {
    if (!game.cursedRun) return;
    this._roomsExplored++;
  }

  /**
   * How many Undead the Graveyard holds right now. It starts already occupied
   * — the curse did not arrive empty-handed — and thickens with every room
   * explored after, up to a ceiling where the lower two thirds read as full.
   */
  graveyardPopulation() {
    return Math.min(GRAVEYARD_BASE + this._roomsExplored * GRAVEYARD_PER_ROOM, GRAVEYARD_MAX);
  }

  /**
   * Has REST itself given way — gray instead of green, no longer healing, and
   * admitting the Undead through its south door?
   *
   * One predicate for all three, so the border, the heal and the spawner can
   * never disagree about which REST the player is standing in.
   */
  isRestDecayed(game) {
    return !!game.cursedRun && this._roomsExplored >= REST_DECAY_ROOMS;
  }

  /**
   * How Charon meets this REST visit on a Cursed Run — read by CharonSystem
   * on REST entry. null on an uncursed run (the plain ferryman).
   *   'cursed'   — still at his post, with his cursed line, taking his toll.
   *   'absent'   — the curse has run far enough that he no longer comes.
   *   'farewell' — REST has given way; he comes back once to say goodbye.
   */
  charonVisit(game) {
    if (!game.cursedRun) return null;
    if (this._restSealed) return 'absent';
    if (this.isRestDecayed(game)) return 'farewell';
    return this._roomsExplored >= CHARON_FORSAKES_ROOMS ? 'absent' : 'cursed';
  }

  /** Charon's farewell is spoken — REST is behind the player for good. */
  sealRest() {
    this._restSealed = true;
  }

  /**
   * Is EXPLORE's way back to REST shut? Read by the south-exit crossing, its
   * collision cell, and the renderer, which draws the shut door gray.
   */
  isRestSealed(game) {
    return !!game.cursedRun && this._restSealed;
  }

  /**
   * The color REST draws its own chrome in — the border, the crafting
   * brackets, the movement keys and their brackets. Green while the hub is
   * still the hub; the gray zone's own color once the curse has taken it,
   * because gray is what the world is bending toward and REST is the last
   * thing in it to go.
   */
  restChromeColor(game) {
    return this.isRestDecayed(game) ? ZONE_COLORS.gray : COLORS.BORDER;
  }

  /**
   * The HP a rebuilt REST player should start with, or null to let REST heal
   * the way it always has.
   *
   * REST heals as a side effect of reconstructing the Player on entry, so
   * refusing to heal means carrying the wound across that rebuild — the same
   * trick the magic meter already uses. Reads the outgoing Player, so it must
   * be called before the new one replaces it.
   */
  carryRestHp(game, priorPlayer) {
    if (!this.isRestDecayed(game)) return null;
    const hp = priorPlayer?.hp;
    return typeof hp === 'number' && hp > 0 ? hp : null;
  }

  /**
   * Fill the Graveyard's lower two thirds, replacing whatever the last visit
   * left. The population is the run's, not the room's, so it is rebuilt from
   * the counter on every entry rather than persisted with the room object.
   */
  populateGraveyard(game) {
    const room = game.currentRoom;
    if (!room?.isGraveyard) return;

    const cs = GRID.CELL_SIZE;
    const firstRow = (room.graveyardDividerRow ?? Math.floor(GRID.ROWS / 3)) + 2;
    const bounds = {
      x: cs * 2,
      y: firstRow * cs,
      w: (GRID.COLS - 4) * cs,
      h: (GRID.ROWS - 2 - firstRow) * cs
    };

    game.undeadSystem.clear();
    game.undeadSystem.fill(game, bounds, this.graveyardPopulation(), { silent: true });
  }

  /**
   * Leaving the Graveyard. Its Undead belong to the room and go with it — the
   * curse itself does not, so `game.cursedRun` is untouched and the next entry
   * rebuilds a thicker crowd from the counter.
   */
  onRoomExit(game, room) {
    if (!room?.isGraveyard) return;
    game.undeadSystem.clear();
  }

  /**
   * REST's own per-frame tick. Inert until the hub has given way, then it
   * walks one more of the Undead up through the south door on a slow beat,
   * stopping once the room holds as many as it is meant to.
   */
  updateRest(dt, game) {
    if (!this.isRestDecayed(game)) return;
    if (game.undeadSystem.count >= REST_STREAM_MAX) return;

    this._streamTimer -= dt;
    if (this._streamTimer > 0) return;
    this._streamTimer = REST_STREAM_INTERVAL;

    const cs = GRID.CELL_SIZE;
    const doorX = Math.floor(GRID.COLS / 2) * cs;
    const doorY = (GRID.ROWS - 1) * cs;
    game.undeadSystem.enter(game, doorX, doorY, doorX, doorY - cs * REST_WALK_IN_CELLS);
  }

  /**
   * Everything the curse stamps onto REST at the moment it is entered: the
   * south wall opened onto the Graveyard, the door's arrival beat restarted,
   * and — once the hub has given way — the next EXPLORE forced gray.
   *
   * REST is rebuilt from scratch on every entry, so this runs each time rather
   * than once; the wall is a property of the run's state, not an event. Both
   * halves of it are needed: the `exits` flag is what RestRenderer's border and
   * the south-crossing check read, and the collision cell is what lets the
   * player actually stand in the gap.
   */
  applyToRest(game, room) {
    if (!game.cursedRun || !room) return;

    room.exits.south = true;
    const centerX = Math.floor(GRID.COLS / 2);
    if (room.collisionMap?.[GRID.ROWS - 1]) room.collisionMap[GRID.ROWS - 1][centerX] = false;

    // The room is entered empty (enterRestState clears the Undead), so the
    // door's beat starts over with it rather than carrying a stale countdown.
    this._streamTimer = REST_STREAM_INTERVAL;

    // Once REST has given way, EXPLORE is gray from here on. resetOnRest() has
    // just put the zone back to green a few lines above this call, so the force
    // goes in after it — and is re-applied on every entry rather than set once.
    // Only the first room needs it: ZoneSystem keeps gray sticky after that.
    if (this.isRestDecayed(game)) game.zoneSystem.forceNextZone('gray');
  }
}
