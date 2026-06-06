import { Enemy } from './Enemy.js';
import { GRID } from '../game/GameConfig.js';

// Leg chars by corner index: 0=front-left, 1=front-right, 2=back-left, 3=back-right
export const LEG_CHARS = ['/', '\\', '\\', '/'];

const LEG_DATA = { affinities: ['fire'] }; // auto-immune to fire-affinity effects

export class TurtleLeg extends Enemy {
  constructor(x, y, legIndex) {
    super('?', x, y, 0);

    this.data             = LEG_DATA;
    this.char             = LEG_CHARS[legIndex] ?? '/';
    this.legIndex         = legIndex;
    this.hp               = 1;   // stub — canonical HP is on TurtleShell
    this.maxHp            = 1;
    this.speed            = 0;
    this.isBossEntity              = true;
    this.isBossLeg                 = true;
    this.ignoreBackgroundCollision = true;
    this.hitFlash         = false;
    this.invulnerabilityDuration = 0.25;
    this.color            = '#8B6914';
    this.baseColor        = '#8B6914';
    this.state            = 'boss';
    this.enraged          = true;
    this.attackRange      = 0;
    this.aggroRange       = 0;
    this.damage           = 0;

    // Standard hitbox (1×1 cell)
    this.width  = GRID.CELL_SIZE;
    this.height = GRID.CELL_SIZE;

    // Set by BossSystem after construction
    this.shellRef = null;
  }

  update(deltaTime) {
    if (this.invulnerabilityTimer > 0) {
      this.invulnerabilityTimer = Math.max(0, this.invulnerabilityTimer - deltaTime);
      if (this.invulnerabilityTimer === 0) this.hitFlash = false;
    }

    this.dotBlinkTimer += deltaTime;
    const dotDamageEvents = this.updateStatusEffects(deltaTime);

    this.targetVelocity.vx = 0;
    this.targetVelocity.vy = 0;
    this.velocity.vx       = 0;
    this.velocity.vy       = 0;

    return { dotDamage: dotDamageEvents };
  }

  // Fire-affinity: immune to burn (and any future fire-affinity effect); aquatic weakness.
  getElementalModifier(elementType) {
    if (elementType === 'burn' || elementType === 'fire') return 0.0;
    if (elementType === 'wet'  || elementType === 'aquatic') return 2.0;
    return 1.0;
  }

  takeDamage(amount, attackId = null) {
    if (this.invulnerabilityTimer > 0) return false;
    if (!this.shellRef) return false;

    this.shellRef.takeDamage(amount, 'leg');
    this.invulnerabilityTimer = this.invulnerabilityDuration;
    this.lastHitAttackId = attackId;
    this.hitFlash = true;
    return true;
  }
}
