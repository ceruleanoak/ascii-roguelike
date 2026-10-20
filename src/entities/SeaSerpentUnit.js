import { Enemy } from './Enemy.js';

const SERPENT_COLOR = '#2fbf8f';

// One segment of a Sea Serpent — the head ('S', the only part that steers)
// or a tail segment ('o', which drags behind on a distance constraint). Any
// segment can be struck; every blow spends the serpent's one HP pool.
// Position, color and that HP pool are owned by SeaSerpentSystem; this class carries identity
// and the two overrides that opt out of Enemy's generic AI and damage
// pipeline — the same shape as CentipedeUnit, which the Sea Serpent extends.
export class SeaSerpentUnit extends Enemy {
  constructor(x, y, depth, { isHead, serpentId, contactDamage }) {
    super(isHead ? 'S' : 'o', x, y, depth, {
      name: 'Sea Serpent',
      hp: 1,
      speed: 0,           // unused — SeaSerpentSystem drives position directly
      damage: contactDamage,
      attackRange: 0,
      attackCooldown: 1.0,
      color: SERPENT_COLOR,
      drops: [],
      // Lives in deep water: the shared wet-pip clock must never drown it.
      swimAffinity: true,
      // Per-unit isBoss would trip LootSystem's boss drop on a segment; the
      // pair's real reward is dropped by SeaSerpentSystem.
      isBoss: false,
      // Nothing shoves a segment: position is SeaSerpentSystem's alone.
      knockbackResistance: 1,
      displayChar: isHead ? 'S' : 'o',
    });

    // The HP pool lives on the serpent (SeaSerpentSystem); every unit
    // stays at 1 so the world tick's removal pass never takes one on its own.
    this.hp = 1;
    this.maxHp = 1;

    // SeaSerpentSystem owns position and collision — these make the physics
    // integration a no-op for the unit, as for CentipedeUnit.
    this.hasCollision = false;
    this.boundToGrid = false;
    this.ignoreBackgroundCollision = true;

    this.isSeaSerpentUnit = true;
    this.isHead = isHead;
    this.serpentId = serpentId;
    this.baseColor = SERPENT_COLOR;
  }

  // Only the iframe timer runs here (so the white blink renders through the
  // generic enemy path); must still return a result object, since
  // EnemyUpdateSystem reads updateResult on every room.enemies member.
  // Velocity stays zero: a unit that seemed to be moving fast would be taken
  // for a charging enemy by PhysicsSystem.resolveSpeedCollisions, and its
  // own neighbouring segments would bump each other for damage.
  update(deltaTime) {
    if (this.invulnerabilityTimer > 0) this.invulnerabilityTimer -= deltaTime;
    this.velocity.vx = 0;
    this.velocity.vy = 0;
    return {};
  }

  // Never dies through Enemy's pipeline: every hit lands on the serpent's
  // shared HP pool.
  takeDamage(amount, attackId = null) {
    return this.game.seaSerpentSystem.handleUnitHit(this, amount, attackId);
  }
}
