import { Enemy } from './Enemy.js';

// One segment of the Centipede miniboss — either the head ('4', the only unit
// that steers) or a body part ('C', which blindly follows the trail left by
// whatever is ahead of it). Position/facing/hp-conversion are authoritatively
// driven by CentipedeSystem every frame; this class only carries identity and
// the two overrides needed to opt out of Enemy's generic AI/damage pipeline.
export class CentipedeUnit extends Enemy {
  constructor(x, y, depth, { isHead, chainId, contactDamage, game }) {
    super(isHead ? '4' : 'C', x, y, depth, {
      hp: 1,
      speed: 0,          // unused — CentipedeSystem drives position directly
      damage: contactDamage,
      attackRange: 0,
      attackCooldown: 1.0,
      color: '#33cc33',
      drops: [],
      isBoss: false,      // per-part isBoss would wrongly trigger LootSystem's
                           // 3x drop bonus on every 1-HP hit — see CentipedeSystem
                           // for the real defeat-reward call
      displayChar: isHead ? '4' : 'C',
    });

    // Depth-scaled hp (Enemy's constructor applies a +5%-per-3-depth
    // multiplier) would break the "1 HP each" spec at any nonzero boss depth.
    // Force it back to exactly 1 regardless of what depth this was spawned at.
    this.hp = 1;
    this.maxHp = 1;

    // CentipedeSystem owns position/collision entirely every frame — these
    // flags make PhysicsSystem's generic per-entity integration a no-op for
    // this unit (it's never even registered with physicsSystem.addEntity).
    this.hasCollision = false;
    this.boundToGrid = false;
    this.ignoreBackgroundCollision = true;

    this.isCentipedeUnit = true;
    this.isHead = isHead;
    this.chainId = chainId;
    this.facing = { dx: 0, dy: 0 }; // set by CentipedeSystem on spawn/promotion
  }

  // Position, facing, and hp-conversion are owned by CentipedeSystem.update().
  // This override only lets the inherited invulnerability timer run down, so
  // Enemy.getIframeFlashColor()'s white-blink renders for free through the
  // existing generic enemy render path — no bespoke renderer needed.
  // Still must return a result object: every room.enemies member (this one
  // included, since CentipedeSystem.spawn() registers units via
  // roomGenerator.addEnemyToRoom) is ticked once per frame by
  // EnemyUpdateSystem's canonical loop, which unconditionally reads
  // updateResult.justAggrod on whatever this returns.
  update(deltaTime) {
    if (this.invulnerabilityTimer > 0) this.invulnerabilityTimer -= deltaTime;
    return {};
  }

  // Bypasses Enemy's generic hp-decrement/death/drop pipeline entirely — a
  // centipede unit never "dies" through the normal path. A hit either splits
  // the chain or is ignored outright during the post-split immunity window.
  takeDamage(amount, attackId = null) {
    if (this.invulnerabilityTimer > 0) return false;
    return this.game.centipedeSystem.handleUnitHit(this, attackId);
  }
}
