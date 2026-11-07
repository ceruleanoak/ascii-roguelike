// GraspSystem — the Grasp, the boss of Mist Battle Act 1: a climb up a
// mountain, from the warm-up waves to the Summit and the zoom that opens Act 2.
//
// Phases (`phase`):
//   warmup  — MistBattleSystem's mixed gray waves; after WARMUP_WAVES top-ups
//             the waves stop, and once the last enemy falls the rim trembles
//   grip    — two Great Hands grip the North Barrier and reach for the Trine
//             (greatHands.js); they share one HP pool, `handsHp`
//   flee    — the Hands let go and rise away; the North Barrier crumbles,
//             the room's walls and objects break loose and the climb begins
//   clutch  — the haul north against the Clutch, small hands in Galaga
//             formations (clutch.js)
//   fingers — the climb speeds up; four Fingers reach down their lanes and
//             must be beaten back above the Trap Line (fingers.js); they share
//             one HP pool, `fingersHp`
//   summit  — the climb slows to a stop; the north wall returns, the south
//             stays open a moment, then closes
//   zoom    — the camera closes in on the Trine; when it settles,
//             MistBattleSystem.startAct2() takes over
//   done
//
// The climb moves the world through the fixed room rather than scrolling a
// camera (climb.js): Climb Scenery is pixel-space rock that travels down and
// blocks the Trine through resolveContact, never through the collision map.
//
// Every Grasp damage source tests every living Trine body, through
// MistBattleSystem.hurt — which lands only on the Primary (only the Primary
// takes damage).
//
// Every part pushes the gray mist back from itself, in every phase
// (mistClearings), so the boss is never lost in the fog.
//
// Driven by MistBattleSystem: update() from its update, resolveContact() from
// its resolveCombat (after physics, before the fallen-Primary hand-off).
import { GRID } from '../game/GameConfig.js';
import { GRASP_TUNING as T, GRASP_COLOR } from '../data/grasp.js';
import { createExplosion } from '../entities/Particle.js';
import { GraspUnit } from '../entities/GraspUnit.js';
import * as climb from './grasp/climb.js';
import * as greatHands from './grasp/greatHands.js';
import * as clutch from './grasp/clutch.js';
import * as fingers from './grasp/fingers.js';

const CS = GRID.CELL_SIZE;
// Cells of clear air each Grasp part holds around its drawn extent.
const MIST_CLEAR_PAD = 3;
export const FLOOR_TOP = (GRID.ROWS - 1) * CS;

export class GraspSystem {
  constructor(game) {
    this.game = game;
    this.reset();
  }

  // Room-scoped teardown (RESET_REGISTRY `graspSystem.reset`): leaving the
  // arena ends the battle. Units live in the room's enemy list and die with
  // it; the scripted camera frame is handed back here.
  reset() {
    if (this.active) this.game.cameraZoomSystem?.releaseZoom();
    for (const hand of this.hands ?? []) this._releaseBody(hand.body);
    this.active = false;
    this.phase = null;
    this.timer = 0;
    this.clock = 0;
    this.dt = 0;
    this.room = null;
    this.climb = climb.create();
    this.hands = [];
    this.handsHp = T.HANDS_HP;
    this.clutch = clutch.create();
    this.fingers = [];
    this.fingersHp = T.FINGERS_HP;
    this.summit = null;
    this.removedUnits = [];
    // Trine body → seconds until Grasp contact may hurt it again.
    this.contactCooldowns = new Map();
  }

  /** The Mist Battle arena opens: seal it and raise the North Barrier. */
  begin(room) {
    this.reset();
    this.active = true;
    this.room = room;
    this.phase = 'warmup';
    this.timer = 0;
    // The arena never clears or opens: the Grasp's phases are its only way on.
    room.cleared = true;
    const cx = Math.floor(GRID.COLS / 2);
    const cy = Math.floor(GRID.ROWS / 2);
    const map = room.collisionMap;
    for (const edge of ['north', 'south', 'east', 'west']) room.exits[edge] = false;
    map[0][cx] = map[GRID.ROWS - 1][cx] = map[cy][0] = map[cy][GRID.COLS - 1] = true;
    climb.raiseBarrier(this);
    // Combat zoom would crop the climb; the frame stays fully open.
    this.game.cameraZoomSystem.holdZoom(1);
  }

  get mist() {
    return this.game.mistBattleSystem;
  }

  /** Awake Trine bodies (the Primary first); Dormant ones aren't targets. */
  bodies() {
    return this.mist.livingBodies();
  }

  // ── Phase machine ───────────────────────────────────────────────────
  update(deltaTime) {
    if (!this.active) return;
    this._flushRemovedUnits();
    this.dt = deltaTime;
    this.clock += deltaTime;
    this.timer += deltaTime;
    for (const [body, t] of this.contactCooldowns) {
      if (t > 0) this.contactCooldowns.set(body, t - deltaTime);
    }

    climb.update(this, deltaTime);
    switch (this.phase) {
      case 'warmup': this._updateWarmup(); break;
      case 'tremble':
        if (Math.random() < deltaTime * 6) climb.rimDebris(this, 3);
        if (this.timer >= T.RIM_TREMBLE_TIME) this.startGrip();
        break;
      case 'grip':
        greatHands.update(this, deltaTime);
        if (this.handsHp <= 0) this.startFlee();
        break;
      case 'flee':
        greatHands.update(this, deltaTime);
        if (this.timer >= T.FLEE_TIME) this.startClutch();
        break;
      case 'clutch':
        clutch.update(this, deltaTime);
        if (clutch.isDone(this)) this.startFingers();
        break;
      case 'fingers':
        clutch.update(this, deltaTime); // stragglers retreating off the top
        fingers.update(this, deltaTime);
        if (this.fingersHp <= 0 && fingers.allWithdrawn(this)) this.startSummit();
        break;
      case 'summit': this._updateSummit(deltaTime); break;
      case 'zoom':
        if (this.game.cameraZoomSystem.isZoomSettled()) {
          this.phase = 'done';
          this.mist.startAct2();
          // New bodies on new start points: cut to them, don't pan across.
          this.game.cameraZoomSystem.cutHold();
        }
        break;
    }
  }

  _setPhase(phase) {
    this.phase = phase;
    this.timer = 0;
  }

  _updateWarmup() {
    // The warm-up ends on its last enemy falling, so none may sit out of reach.
    climb.returnStrays(this);
    const mist = this.mist;
    if (mist.wavesEnabled && mist.wavesSpawned >= T.WARMUP_WAVES) mist.wavesEnabled = false;
    if (mist.wavesEnabled) return;
    if (this.game._countedEnemies(this.room.enemies.filter(e => !e.isGraspUnit)).length > 0) return;
    this._setPhase('tremble');
    this.game.renderController?.screenShake.trigger(3, T.RIM_TREMBLE_TIME);
  }

  startGrip() {
    this._setPhase('grip');
    greatHands.spawn(this);
  }

  startFlee() {
    this._setPhase('flee');
    greatHands.letGo(this);
    climb.breakLoose(this);
    this.climb.targetSpeed = T.CLIMB_SPEED;
    this.game.audioSystem?.onBossDamaged?.();
  }

  startClutch() {
    this._setPhase('clutch');
    greatHands.remove(this);
    this.climb.sceneryKind = 'clutch';
    this.climb.targetSpeed = T.CLIMB_SPEED;
    clutch.start(this);
  }

  startFingers() {
    this._setPhase('fingers');
    clutch.retreatAll(this);
    this.climb.sceneryKind = 'fingers';
    this.climb.targetSpeed = T.CLIMB_SPEED_FAST;
    fingers.spawn(this);
  }

  startSummit() {
    this._setPhase('summit');
    fingers.remove(this);
    this.climb.spawning = false;
    this.climb.targetSpeed = 0;
    this.climb.accel = Math.max(this.climb.speed, 1) / T.SUMMIT_DECEL_TIME;
    this.summit = { stage: 'decel', timer: 0 };
  }

  // The climb stops, the north wall builds back, the south hangs open for a
  // breath, then closes — and its closing starts the zoom.
  _updateSummit(dt) {
    const s = this.summit;
    s.timer += dt;
    const c = this.climb;
    if (s.stage === 'decel' && c.speed <= 0) {
      s.stage = 'north';
      s.timer = 0;
    } else if (s.stage === 'north') {
      c.northOpen = Math.max(0, 1 - s.timer / T.WALL_BUILD_TIME);
      if (c.northOpen <= 0) { s.stage = 'exposed'; s.timer = 0; this.game.renderController?.screenShake.trigger(2, 0.2); }
    } else if (s.stage === 'exposed' && s.timer >= T.SOUTH_EXPOSED_TIME) {
      s.stage = 'south';
      s.timer = 0;
    } else if (s.stage === 'south') {
      c.southOpen = Math.max(0, 1 - s.timer / T.WALL_BUILD_TIME);
      if (c.southOpen <= 0) {
        this.game.renderController?.screenShake.trigger(4, 0.3);
        this._startZoom();
      }
    }
  }

  // The camera closes in on the Trine; once it settles, Act 2 begins. The
  // hold stays on through Act 2, fitted to the bodies still standing.
  _startZoom() {
    this._setPhase('zoom');
    this.game.cameraZoomSystem.holdZoom(() => this._trineFitScale(), () => this._trineCenter());
  }

  // Canvas-pixel box around the living Trine's cells, or null.
  _trineBounds() {
    const bodies = this.bodies();
    if (bodies.length === 0) return null;
    let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
    for (const b of bodies) {
      left = Math.min(left, b.position.x);
      top = Math.min(top, b.position.y);
      right = Math.max(right, b.position.x + CS);
      bottom = Math.max(bottom, b.position.y + CS);
    }
    return { left, top, right, bottom };
  }

  // The hold's focus: the middle of that box, not the bodies' mean — the
  // fit below sizes the frame to the box, so the box is what it must center.
  _trineCenter() {
    const box = this._trineBounds();
    return box && { x: (box.left + box.right) / 2, y: (box.top + box.bottom) / 2 };
  }

  // The hold's scale: as tight as the Summit's ZOOM_SCALE while the box plus
  // ZOOM_FIT_MARGIN on each side still fits the screen, opening toward 1 as
  // the bodies spread (Act 2's fight ranges over its whole leash). A lone
  // victor fits at the full ZOOM_SCALE.
  _trineFitScale() {
    const box = this._trineBounds();
    if (!box) return T.ZOOM_SCALE;
    const span = Math.max(box.right - box.left, box.bottom - box.top) + 2 * T.ZOOM_FIT_MARGIN;
    return Math.max(1, Math.min(T.ZOOM_SCALE, Math.min(GRID.WIDTH, GRID.HEIGHT) / span));
  }

  /**
   * Test entry (CheatMenu BOSSES): skip the warm-up straight to `phase`
   * ('grip' | 'clutch' | 'fingers' | 'summit' | 'act2'). The climb phases
   * start with the barrier already broken and the scroll already at speed;
   * 'act2' goes straight to the Summit's zoom, which starts Act 2.
   */
  skipTo(phase) {
    const room = this.room;
    this.mist.wavesEnabled = false;
    room.enemies.length = 0;
    if (phase === 'grip') { this.startGrip(); return; }
    // Every later phase starts on the open ground the climb's break leaves:
    // Act 2 included, or a test fight keeps the room's walls and rocks.
    climb.breakLoose(this);
    if (phase === 'act2') { this._startZoom(); return; }
    this.climb.speed = phase === 'clutch' ? T.CLIMB_SPEED : T.CLIMB_SPEED_FAST;
    if (phase === 'clutch') this.startClutch();
    else if (phase === 'fingers') this.startFingers();
    else if (phase === 'summit') this.startSummit();
  }

  // ── Units ────────────────────────────────────────────────────────────
  /** A new strikeable part, wired like any live enemy and added to the room. */
  addUnit(kind, part, x, y, width, height) {
    const unit = new GraspUnit(kind, part, x, y, width, height);
    unit.setGame?.(this.game);
    unit.setRoom?.(this.room);
    unit.setTarget?.(this.game.player);
    this.room.enemies.push(unit);
    return unit;
  }

  removeUnit(unit) {
    if (!unit || unit.graspRemoved) return;
    unit.graspRemoved = true;
    this.removedUnits.push(unit);
  }

  // Removal waits for the next update: a Clutch hand breaks inside the
  // combat pass, which is still walking room.enemies. Spliced in place —
  // physics and the world tick hold this same array.
  _flushRemovedUnits() {
    if (this.removedUnits.length === 0) return;
    const gone = new Set(this.removedUnits);
    this.removedUnits = [];
    const enemies = this.room?.enemies;
    if (!enemies) return;
    for (let i = enemies.length - 1; i >= 0; i--) {
      if (gone.has(enemies[i])) enemies.splice(i, 1);
    }
  }

  /**
   * GraspUnit.takeDamage. Each part keeps the ids of the attacks that have
   * landed on it, so one swing lands once per part but all three mirrored
   * Trine swings land — a shared iframe would eat two of them.
   */
  handleUnitHit(unit, amount, attackId) {
    const part = unit.part;
    if (!this.active || !part || unit.graspRemoved || !this._isVulnerable(unit)) return false;
    if (attackId != null) {
      part.hitIds ??= new Set();
      if (part.hitIds.has(attackId)) return false;
      if (part.hitIds.size > 48) part.hitIds.clear();
      part.hitIds.add(attackId);
    } else {
      // Melee carries no id: a short iframe stops one swing landing every
      // frame, but hits in the frame that set it (the mirrored Trine swings)
      // all count.
      if (unit.invulnerabilityTimer > 0 && part.hitClock !== this.clock) return false;
      part.hitClock = this.clock;
      unit.invulnerabilityTimer = T.UNTRACKED_HIT_IFRAME;
    }
    part.flash = 0.12;
    this.game.audioSystem?.onBossDamaged?.();

    if (unit.kind === 'hand') {
      // The Great Hands' armor: a flat cut, at least 1 through, as the
      // player's defense works. What got through goes back as actualDamage,
      // the player's result shape, so the hit's number shows it.
      const dealt = amount > 0 ? Math.max(1, amount - T.HANDS_DEFENSE) : 0;
      this.handsHp = Math.max(0, this.handsHp - dealt);
      greatHands.onHit(this, part);
      return { damaged: true, actualDamage: dealt };
    } else if (unit.kind === 'finger') {
      this.fingersHp = Math.max(0, this.fingersHp - amount);
      fingers.onHit(this, part);
    } else if (unit.kind === 'clutch') {
      clutch.onHit(this, part, amount);
    }
    return true;
  }

  /**
   * The circles of clear air around every live part (MistBattleSystem's
   * mistClearings): each part's drawn extent plus MIST_CLEAR_PAD cells,
   * times `scale` so a closing mist closes over them too.
   */
  mistClearings(scale) {
    if (!this.active || !this.room) return [];
    const out = [];
    for (const unit of this.room.enemies) {
      if (!unit.isGraspUnit || unit.graspRemoved) continue;
      const r = (Math.max(unit.width, unit.height) / 2 + MIST_CLEAR_PAD * CS) * scale;
      out.push({ x: unit.position.x + unit.width / 2, y: unit.position.y + unit.height / 2, r });
    }
    return out;
  }

  _isVulnerable(unit) {
    if (unit.kind === 'hand') return greatHands.isVulnerable(unit.part);
    if (unit.kind === 'finger') return this.fingersHp > 0;
    return unit.part.hp > 0;
  }

  /** Particle burst at a point (debris, a broken Clutch hand). */
  burst(x, y, count, color = GRASP_COLOR) {
    const game = this.game;
    const parts = createExplosion(x, y, count, color);
    game.particles.push(...parts);
    for (const p of parts) game.physicsSystem.addEntity(p);
  }

  // ── Damage to the Trine ───────────────────────────────────────────────
  /**
   * Grasp contact on one body, on its per-body cooldown (`cooldown`, default
   * CONTACT_COOLDOWN). `ignoresArmor` passes through to Player.takeDamage.
   */
  hurt(body, damage, from, { cooldown = T.CONTACT_COOLDOWN, ignoresArmor = false } = {}) {
    if ((this.contactCooldowns.get(body) ?? 0) > 0) return false;
    this.contactCooldowns.set(body, cooldown);
    const attacker = this.hands[0]?.unit ?? this.fingers[0]?.unit ?? this.clutch.members[0]?.unit ?? null;
    return this.mist.hurt(body, damage, { isBullet: false, element: null, attacker, ignoresArmor }, from);
  }

  /**
   * A Held body revived by a death save (main.js _clearReviveMovementLocks)
   * slips the hand's grip. Released here, through the hand, so the hand
   * drops it too: clearing only the body's own flags left the hand pinning
   * a body the other hand could then grab as well.
   */
  releaseRevived(body) {
    greatHands.letGoOf(this, body);
  }

  _releaseBody(body) {
    if (!body?.grabbedBy?.isGraspUnit) return;
    body.grabbed = false;
    body.grabbedBy = null;
  }

  /**
   * Called from MistBattleSystem.resolveCombat — after physics has moved every
   * body this frame, so pushes and pins are the last word on position.
   */
  resolveContact() {
    if (!this.active) return;
    greatHands.resolveGrabs(this);
    const blockers = [...this.climb.scenery, ...fingers.blockers(this)];
    // Dormant bodies are blocked too, so none wakes inside rock.
    for (const body of this.mist.presentBodies()) {
      if (!body.grabbed) climb.resolveBlockers(this, body, blockers);
    }
    clutch.resolveContact(this);
    fingers.resolveContact(this);
  }
}
