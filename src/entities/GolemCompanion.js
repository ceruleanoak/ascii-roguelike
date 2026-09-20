import { GRID } from '../game/GameConfig.js';
import { GOLEM_TYPES } from '../data/golems.js';

/**
 * GolemCompanion — summoned at the REST Combine Station (ingredient + Mana,
 * see CraftingSystem.claimCraftedGolem). One data-driven class parameterized
 * by GOLEM_TYPES[type] rather than four subclasses, matching the Enemy
 * "compose, don't subclass" convention (GLOSSARY.md's Enemy entry) even
 * though golems aren't Enemies.
 *
 * State machine (deliberately simpler than NPCRat — no flee/permaFlee; the
 * inbox description is "basic melee attacks" with no retreat behavior):
 *   'idle'  — no target; drifts toward player to stay close
 *   'chase' — pursuing a hostile enemy, attacks in range
 *   'dead'  — Mud Golem only: body destroyed, resurrectTimer counting down
 *             to an indefinite revive (see GOLEM_TYPES.mud.resurrectCooldown).
 *             Every other type is simply removed from game.golems on death —
 *             see CompanionSystem.updateGolems.
 *
 * Render char is a single printable-ASCII glyph shared by all golem types
 * (per CLAUDE.md's "printable ASCII for enemies/background objects"
 * convention — distinct from the Unicode-symbol rule that governs the
 * recipe-result sentinel chars in items.js); types are told apart by color.
 */

const RENDER_CHAR = 'g';

const INVULNERABILITY_DURATION = 0.5;

const SPEED = 90;
const ATTACK_RANGE = GRID.CELL_SIZE * 1.75;
const ATTACK_COOLDOWN = 1.4;
const ATTACK_DAMAGE = 1;
const AGGRO_RANGE = GRID.CELL_SIZE * 9;

const FOLLOW_RADIUS = GRID.CELL_SIZE * 3;
const FOLLOW_SPEED_MULT = 0.6;

export class GolemCompanion {
  constructor(type, x, y) {
    this.golemType = type;
    const def = GOLEM_TYPES[type];
    this.def = def;

    this.position = { x, y };
    this.velocity = { vx: 0, vy: 0 };
    this.targetVelocity = { vx: 0, vy: 0 };

    this.char = RENDER_CHAR;
    this.color = def.color;
    this.baseColor = def.color;
    this.width = GRID.CELL_SIZE;
    this.height = GRID.CELL_SIZE;
    this.plane = 0;

    this.maxHp = def.maxHp;
    this.hp = def.maxHp;
    this.invulnerabilityTimer = 0;
    this.attackTimer = 0;

    this.state = 'idle';
    this.target = null;

    // Mud Golem only — see class comment.
    this.resurrectTimer = 0;

    // Physics flags so PhysicsSystem treats us like a normal collide-able mover.
    this.hasCollision = true;
    this.boundToGrid = true;
    this.isSmall = false;
    this.collisionMap = null;
    this.backgroundObjects = null; // layer-guard-ok: router-injected

    // Render-path compatibility: drawNonSappingEnemies-style consumers check these.
    this.sapping = false;
    this.isBossEntity = false;
    this.isDying = false;
    this.dead = false;
    this.data = { float: false };

    // Wired by game on creation / room entry.
    this.game = null;
    this.room = null;
  }

  setGame(game) { this.game = game; }
  setRoom(room) { this.room = room; }
  setCollisionMap(collisionMap) { this.collisionMap = collisionMap; }
  setBackgroundObjects(backgroundObjects) { this.backgroundObjects = backgroundObjects; } // layer-guard-ok

  // Shared companion hook: snap to a radial slot around the player and reset
  // per-room combat state. Mirrors NPCRat.onRoomEnter so main.js can dispatch
  // all companions through one unified call site. A golem mid-resurrect keeps
  // counting down through the room change rather than resetting — only the
  // dead body is instant to lose, not the wait to get it back.
  onRoomEnter(player, game, slot = 0, total = 1) {
    if (!player) return;
    const angle = (slot / Math.max(total, 1)) * Math.PI * 2;
    const radius = GRID.CELL_SIZE * 1.1;
    this.position.x = player.position.x + Math.cos(angle) * radius;
    this.position.y = player.position.y + Math.sin(angle) * radius;
    this.velocity.vx = 0;
    this.velocity.vy = 0;
    this.targetVelocity.vx = 0;
    this.targetVelocity.vy = 0;
    this.invulnerabilityTimer = 0;
    this.attackTimer = 0;
    if (this.state !== 'dead') {
      this.hp = this.maxHp;
      this.state = 'idle';
    }
    this.target = null;
    if (game) {
      this.game = game;
      this.room = game.currentRoom;
      this.collisionMap = game.currentRoom?.collisionMap || null;
      this.backgroundObjects = game._activeBackgroundObjects() || null; // layer-guard-ok: routed read
    }
  }

  // Per-frame driver. main.js passes the live hostile-enemies array, the
  // player, and the sibling golem roster (for separation).
  // Returns { revived: true } when a Mud Golem's cooldown finishes this frame
  // so CompanionSystem can fire feedback (particles/message/SFX).
  update(deltaTime, enemies, player, siblings = null) {
    if (this.state === 'dead') {
      this.resurrectTimer -= deltaTime;
      if (this.resurrectTimer <= 0) {
        this.hp = this.maxHp;
        this.state = 'idle';
        this.target = null;
        if (player) {
          this.position.x = player.position.x + (Math.random() - 0.5) * GRID.CELL_SIZE * 2;
          this.position.y = player.position.y + (Math.random() - 0.5) * GRID.CELL_SIZE * 2;
        }
        return { revived: true };
      }
      return null;
    }

    if (this.invulnerabilityTimer > 0) {
      this.invulnerabilityTimer -= deltaTime;
      if (this.invulnerabilityTimer < 0) this.invulnerabilityTimer = 0;
    }
    if (this.attackTimer > 0) this.attackTimer -= deltaTime;

    this.target = this._findNearestEnemy(enemies);

    let result = null;
    if (this.target) {
      this.state = 'chase';
      result = this._chaseAndAttack(deltaTime);
    } else {
      this.state = 'idle';
      this._driftTowardPlayer(deltaTime, player);
    }
    this._applySeparation(siblings);
    return result;
  }

  // Boids-style separation — same shape as NPCRat._applySeparation.
  _applySeparation(siblings) {
    if (!siblings || siblings.length < 2) return;
    const RADIUS = GRID.CELL_SIZE * 0.9;
    const RADIUS_SQ = RADIUS * RADIUS;
    const STRENGTH = SPEED * 0.7;
    let pushX = 0;
    let pushY = 0;
    let count = 0;
    for (const other of siblings) {
      if (!other || other === this || other.state === 'dead') continue;
      const dx = this.position.x - other.position.x;
      const dy = this.position.y - other.position.y;
      const dSq = dx * dx + dy * dy;
      if (dSq > 0 && dSq < RADIUS_SQ) {
        const d = Math.sqrt(dSq);
        const w = (RADIUS - d) / RADIUS;
        pushX += (dx / d) * w;
        pushY += (dy / d) * w;
        count++;
      }
    }
    if (count > 0) {
      this.velocity.vx += pushX * STRENGTH;
      this.velocity.vy += pushY * STRENGTH;
      this.targetVelocity.vx = this.velocity.vx;
      this.targetVelocity.vy = this.velocity.vy;
    }
  }

  // Damage handler. No flee behavior — golems stand and fight until hp runs
  // out. On death: Mud Golem drops into 'dead' (resurrect countdown starts);
  // every other type signals { died: true } so CompanionSystem removes it
  // from game.golems.
  takeDamage(amount, attacker = null) {
    if (this.invulnerabilityTimer > 0) return false;
    if (this.state === 'dead') return false;
    this.hp -= amount;
    this.invulnerabilityTimer = INVULNERABILITY_DURATION;
    this.game?.audioSystem?.playSFX?.('enemy_hit');
    if (this.hp <= 0) {
      this.hp = 0;
      if (this.def.resurrect) {
        this.state = 'dead';
        this.resurrectTimer = this.def.resurrectCooldown;
        this.target = null;
        return { damaged: true, died: true, resurrecting: true };
      }
      return { damaged: true, died: true };
    }
    return { damaged: true };
  }

  // Render-path compatibility shims.
  shouldRenderVisible() { return this.state !== 'dead'; }

  getIframeFlashColor() {
    if (this.invulnerabilityTimer <= 0) return null;
    const blinkCycle = Math.floor(this.invulnerabilityTimer / 0.08);
    return blinkCycle % 2 === 0 ? '#ffffff' : null;
  }

  getDOTBlinkColor() { return null; }
  getStatusPipRows() { return []; }

  // ─── Internals ──────────────────────────────────────────────────────────

  _findNearestEnemy(enemies) {
    if (!enemies || enemies.length === 0) return null;
    let best = null;
    let bestDistSq = AGGRO_RANGE * AGGRO_RANGE;
    for (const e of enemies) {
      if (!e || e === this) continue;
      if (e.tamed) continue;
      if (e.hp <= 0 || e.isDying) continue;
      if ((e.plane ?? 0) !== this.plane) continue;
      const dx = e.position.x - this.position.x;
      const dy = e.position.y - this.position.y;
      const d = dx * dx + dy * dy;
      if (d < bestDistSq) { bestDistSq = d; best = e; }
    }
    return best;
  }

  _chaseAndAttack(deltaTime) {
    const t = this.target;
    const dx = t.position.x - this.position.x;
    const dy = t.position.y - this.position.y;
    const dist = Math.hypot(dx, dy) || 1;
    const dirX = dx / dist;
    const dirY = dy / dist;

    if (dist > ATTACK_RANGE) {
      this.targetVelocity.vx = dirX * SPEED;
      this.targetVelocity.vy = dirY * SPEED;
    } else {
      this.targetVelocity.vx = 0;
      this.targetVelocity.vy = 0;
      if (this.attackTimer <= 0 && typeof t.takeDamage === 'function') {
        t.takeDamage(ATTACK_DAMAGE);
        this.attackTimer = ATTACK_COOLDOWN;
        return { attacked: t, damage: ATTACK_DAMAGE };
      }
    }
    this.velocity.vx = this.targetVelocity.vx;
    this.velocity.vy = this.targetVelocity.vy;
    return null;
  }

  _driftTowardPlayer(deltaTime, player) {
    if (!player) {
      this.velocity.vx = 0;
      this.velocity.vy = 0;
      this.targetVelocity.vx = 0;
      this.targetVelocity.vy = 0;
      return;
    }
    const dx = player.position.x - this.position.x;
    const dy = player.position.y - this.position.y;
    const d = Math.hypot(dx, dy);
    if (d > FOLLOW_RADIUS) {
      const s = SPEED * FOLLOW_SPEED_MULT;
      this.targetVelocity.vx = (dx / d) * s;
      this.targetVelocity.vy = (dy / d) * s;
    } else {
      this.targetVelocity.vx = 0;
      this.targetVelocity.vy = 0;
    }
    this.velocity.vx = this.targetVelocity.vx;
    this.velocity.vy = this.targetVelocity.vy;
  }
}
