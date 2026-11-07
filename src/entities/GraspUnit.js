import { Enemy } from './Enemy.js';
import { GRID } from '../game/GameConfig.js';
import { GRASP_NAME, GRASP_DESCRIPTION, GRASP_COLOR } from '../data/grasp.js';
import { handOverlapsBox, handPalm } from '../systems/grasp/greatHands.js';

const CS = GRID.CELL_SIZE;

// One strikeable part of the Grasp — a Great Hand, a Clutch hand or a Finger.
// Position, hitbox, glyph and HP all belong to GraspSystem; this class carries
// identity and the overrides that opt out of Enemy's generic AI, draw and
// damage pipeline, the same shape as SeaSerpentUnit.
//
// `kind`: 'hand' | 'clutch' | 'finger'. `part` is the GraspSystem record the
// unit stands for (a hand, a Clutch member, a finger).
export class GraspUnit extends Enemy {
  constructor(kind, part, x, y, width, height) {
    super('☝', x, y, 0, {
      name: GRASP_NAME,
      description: GRASP_DESCRIPTION,
      tier: 'boss',
      hp: 1,
      speed: 0,           // unused — GraspSystem drives position directly
      damage: 0,          // contact is GraspSystem's (resolveContact)
      attackRange: 0,
      attackCooldown: 1.0,
      color: GRASP_COLOR,
      drops: [],
      // Per-unit isBoss would trip LootSystem's boss drop on a part.
      isBoss: false,
      knockbackResistance: 1,
      displayChar: '☝',
    });

    // HP lives on GraspSystem's pools (or the Clutch member); every unit
    // stays at 1 so the world tick's removal pass never takes one on its own.
    this.hp = 1;
    this.maxHp = 1;

    this.hasCollision = false;
    this.boundToGrid = false;
    this.ignoreBackgroundCollision = true;
    // GraspDraw draws every part; the generic enemy draw skips it.
    this.isBossEntity = true;

    this.isGraspUnit = true;
    this.kind = kind;
    this.part = part;
    this.width = width;
    this.height = height;
    this.baseColor = GRASP_COLOR;
  }

  // The drawn extent, not one cell: position is the top-left of the art.
  getHitbox() {
    return { x: this.position.x, y: this.position.y, width: this.width, height: this.height };
  }

  // CombatSystem's finer test after the rect overlaps (overlapsBox): a Great
  // Hand is struck only where its art is drawn; every other part fills its
  // rect.
  overlapsBox(box) {
    return this.kind !== 'hand' || handOverlapsBox(this.part, box);
  }

  // Where CombatSystem raises this part's damage numbers
  // (damageNumberAnchor), as a cell's top-left in pixels: a Finger's tip, a
  // Great Hand's palm, a Clutch hand's middle. Position is the rect's top-left,
  // which for a Finger is the top edge it hangs from and for a hand gripping
  // the lip is above the screen, so numbers rose out of sight. Kept below
  // the top wall so a number on a part reaching in from above still shows.
  damageNumberAnchor() {
    const at = this.kind === 'finger' ? { x: this.part.left + this.part.width / 2 - CS / 2, y: this.part.tipY - CS }
      : this.kind === 'hand' ? handPalm(this.part)
      : { x: this.position.x + this.width / 2 - CS / 2, y: this.position.y + this.height / 2 - CS / 2 };
    return { x: at.x, y: Math.max(CS, at.y) };
  }

  // Only the iframe timer runs here; velocity stays zero so PhysicsSystem
  // never reads a unit as a charging body (see SeaSerpentUnit.update).
  update(deltaTime) {
    if (this.invulnerabilityTimer > 0) this.invulnerabilityTimer -= deltaTime;
    this.velocity.vx = 0;
    this.velocity.vy = 0;
    return {};
  }

  takeDamage(amount, attackId = null) {
    return this.game.graspSystem.handleUnitHit(this, amount, attackId);
  }
}
