import { GRID } from '../game/GameConfig.js';
import { NeutralCharacter } from './NeutralCharacter.js';

/**
 * CampNPC — wandering mercenary found at C-room campfires.
 *
 * Lifecycle (state machine):
 *   IDLE        — sitting near the campfire, no weapon, no allegiance.
 *                 Coin offering plays a hint (zone wise-saying).
 *                 A nearby dropped sword/bow/gun is picked up → INTERESTED.
 *   INTERESTED  — armed, follows player but tethered to the campfire area.
 *                 Stops at tether limit and shows a `?` indicator.
 *                 Coin offering while in this state → COMPANION.
 *   COMPANION   — full follow + enemy aggro. Borrows the player's attack
 *                 pipeline via the carrier interface in Item.js.
 *   FLEEING     — hp dropped to 0; runs to nearest exit (Leshy pattern) and
 *                 despawns. Char swaps to ☹.
 *
 * The companion duck-types as a Player carrier so weapon.use(npc) works for
 * sword/bow/gun. Wand/staff/etc. are explicitly not accepted at pickup time.
 */

export const CAMP_NPC_STATE = Object.freeze({
  IDLE: 'idle',
  INTERESTED: 'interested',
  COMPANION: 'companion',
  FLEEING: 'fleeing'
});

// Accepted weapon families. Wands/fishing-rods are excluded — their charge /
// cast pipelines don't map cleanly onto the companion AI. Staves are accepted
// and used as a plain melee weapon (the player-only block stance is ignored).
const ALLOWED_WEAPON_TYPES = new Set(['MELEE', 'BOW', 'GUN']);
const REJECTED_MELEE_SUBTYPES = new Set(['wand']);

const NPC_COLORS = [
  '#ff8866', '#88aaff', '#ffaa44', '#88ddaa',
  '#cc88ff', '#ffdd66', '#66ddff', '#ff77aa'
];

const HAPPY_CHAR = '\u263A'; // ☺
const SAD_CHAR   = '\u2639'; // ☹

const TETHER_RADIUS = GRID.CELL_SIZE * 3; // distance from campfire allowed in INTERESTED

export class CampNPC extends NeutralCharacter {
  constructor(x, y, campfirePos) {
    const color = NPC_COLORS[Math.floor(Math.random() * NPC_COLORS.length)];
    super(HAPPY_CHAR, color, x, y);

    // Physics-compatible velocity (overwrites NeutralCharacter's {x,y}-only format)
    this.velocity = { x: 0, y: 0, vx: 0, vy: 0 };
    this.hasCollision = true;
    this.boundToGrid = true;

    // Carrier interface fields (used by Item.js attack methods)
    this.facing = { x: 0, y: 1 };
    this.plane = 0;
    this.weaponAffinities = {};
    this.equippedConsumables = [];

    // Combat / health
    this.maxHp = 8;
    this.hp = this.maxHp;
    this.invulnerabilityTimer = 0;
    this.invulnerabilityDuration = 0.5;
    this._lastAttacker = null;

    // State machine
    this.state = CAMP_NPC_STATE.IDLE;

    // Equipped weapon (Item instance — borrows player attack pipeline)
    this.weapon = null;

    // Tether anchor — fixed at campfire position
    this.campfirePos = { x: campfirePos.x, y: campfirePos.y };
    this.tetherRadius = TETHER_RADIUS;

    // Movement — CampNPCSystem drives velocity directly every frame (no
    // acceleration ramp), so this entity intentionally carries no
    // `acceleration` field. PhysicsSystem.updateEntity() only applies
    // acceleration integration when `entity.acceleration` is truthy and
    // expects the `{ax, ay}` shape (see Player.js/Enemy.js) — a stray
    // scalar here silently NaN's velocity every tick once physics-registered.
    this.speed = 90; // slightly slower than player

    // Flee state
    this.fleeTargetExit = null;
    this.fleeTargetPosition = null;
    this.fleeReached = false;

    // Collision map set by CampNPCSystem.registerWithPhysics() at each room transition
    this.collisionMap = null;

    // Pickup grace timer — prevents instant re-pickup of the weapon if dropped
    this._pickupCooldown = 0;
  }

  // ─── Carrier interface support (Player-shaped takeDamage) ────────────────

  takeDamage(amount, source = {}) {
    if (this.invulnerabilityTimer > 0) return false;
    const dmg = Math.max(1, amount | 0);
    this.hp -= dmg;
    if (this.hp < 0) this.hp = 0;
    if (this.hp > 0) this.invulnerabilityTimer = this.invulnerabilityDuration;
    if (source?.attacker) this._lastAttacker = source.attacker;
    return this.hp <= 0 ? true : { damaged: true };
  }

  isInvulnerable() {
    return this.invulnerabilityTimer > 0;
  }

  // ─── State transitions ──────────────────────────────────────────────────

  setIdle() {
    this.state = CAMP_NPC_STATE.IDLE;
    this.clearIndicator();
  }

  setInterested() {
    this.state = CAMP_NPC_STATE.INTERESTED;
    this.clearIndicator();
  }

  setCompanion() {
    this.state = CAMP_NPC_STATE.COMPANION;
    this.clearIndicator();
  }

  // Shared companion hook: delegates to CampNPCSystem.onRoomEnter (which owns
  // the weapon sanitization details). Mirrors Crow.onRoomEnter / Enemy.onRoomEnter
  // so main.js can iterate all companions through one call site.
  onRoomEnter(player, game) {
    game?.campNPCSystem?.onRoomEnter();
  }

  startFleeing(exits) {
    this.state = CAMP_NPC_STATE.FLEEING;
    this.char = SAD_CHAR;
    this.clearIndicator();
    this._pickFleeExit(exits);
  }

  /** Flee directly to a pixel position — used when inside hut/dungeon interiors. */
  startFleeingToPosition(targetX, targetY) {
    this.state = CAMP_NPC_STATE.FLEEING;
    this.char = SAD_CHAR;
    this.clearIndicator();
    this.fleeTargetExit = 'exit';
    this.fleeTargetPosition = { x: targetX, y: targetY };
    this.fleeReached = false;
  }

  /**
   * Returns true if the dropped item is a weapon this NPC will pick up.
   * Companion only handles sword (melee subtype), bow, gun.
   */
  static acceptsWeapon(item) {
    if (!item?.data) return false;
    const t = item.data.weaponType;
    if (!ALLOWED_WEAPON_TYPES.has(t)) return false;
    // Exclude staff/wand melee subtypes — those rely on hold-to-block / cast pipelines.
    if (t === 'MELEE' && REJECTED_MELEE_SUBTYPES.has(item.data.weaponSubtype)) return false;
    return true;
  }

  // ─── Fleeing (Leshy pattern) ────────────────────────────────────────────

  _pickFleeExit(exits) {
    if (!exits) return;
    const centerX = Math.floor(GRID.COLS / 2);
    const centerY = Math.floor(GRID.ROWS / 2);
    const exitPositions = {
      north: { x: centerX * GRID.CELL_SIZE, y: 2 * GRID.CELL_SIZE },
      east:  { x: (GRID.COLS - 3) * GRID.CELL_SIZE, y: centerY * GRID.CELL_SIZE },
      west:  { x: 2 * GRID.CELL_SIZE, y: centerY * GRID.CELL_SIZE },
      south: { x: centerX * GRID.CELL_SIZE, y: (GRID.ROWS - 3) * GRID.CELL_SIZE }
    };
    const available = ['north', 'east', 'west', 'south'].filter(d => exits[d]);
    if (available.length === 0) return;

    let nearest = null;
    let nearestDist = Infinity;
    for (const dir of available) {
      const ep = exitPositions[dir];
      const dx = ep.x - this.position.x;
      const dy = ep.y - this.position.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < nearestDist) { nearestDist = d; nearest = dir; }
    }
    this.fleeTargetExit = nearest;
    this.fleeTargetPosition = exitPositions[nearest];
  }

  // ─── Per-frame update ───────────────────────────────────────────────────

  update(dt, game) {
    super.update(dt); // pulse animation

    if (this._pickupCooldown > 0) this._pickupCooldown -= dt;
    if (this.invulnerabilityTimer > 0) this.invulnerabilityTimer -= dt;
    if (this.weapon?.update) this.weapon.update(dt);

    if (this.state === CAMP_NPC_STATE.FLEEING) {
      this._updateFleeing(dt);
    }
  }

  _updateFleeing(dt) {
    if (!this.fleeTargetPosition || this.fleeReached) {
      this.velocity.vx = 0;
      this.velocity.vy = 0;
      return;
    }
    const dx = this.fleeTargetPosition.x - this.position.x;
    const dy = this.fleeTargetPosition.y - this.position.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 5) {
      this.fleeReached = true;
      this.velocity.vx = 0;
      this.velocity.vy = 0;
      return;
    }
    const speed = 140;
    // Position update delegated to PhysicsSystem.updateEntity()
    this.velocity.vx = (dx / dist) * speed;
    this.velocity.vy = (dy / dist) * speed;
  }

  // ─── Render override (draw weapon char above head when armed) ───────────

  render(ctx, gridToPixel) {
    super.render(ctx, gridToPixel);

    // Weapon icon above head when armed and not fleeing
    if (this.weapon && this.state !== CAMP_NPC_STATE.FLEEING) {
      const centerPixelPos = gridToPixel(
        this.position.x / GRID.CELL_SIZE,
        this.position.y / GRID.CELL_SIZE
      );
      ctx.save();
      ctx.font = `${GRID.CELL_SIZE * 0.7}px monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = this.weapon.color || '#ffffff';
      ctx.fillText(
        this.weapon.char,
        centerPixelPos.x + GRID.CELL_SIZE / 2,
        centerPixelPos.y + GRID.CELL_SIZE / 2 - GRID.CELL_SIZE
      );
      ctx.restore();
    }
  }
}
