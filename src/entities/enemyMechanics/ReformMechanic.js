import { GRID } from '../../game/GameConfig.js';
import { SplitOnDamageMechanic } from './SplitOnDamageMechanic.js';

// Giant Slime split-child passive re-merge. The child behaves like a normal
// slime; any contact with the parent — at any speed — absorbs the child and
// restores its HP to the boss. The only gate is the child's iframes, which
// cover its launch out of the boss's center. If the parent dies first, the
// child detaches and becomes a normal slime.
//
// Fields (parentRef, reformValue) are attached
// post-construction by the Giant Slime split path — not via init().

export const ReformMechanic = {
  // Reform state is opt-in by the spawner; no isEnabled() since there's no
  // data flag. The orchestrator runs update() unconditionally and the
  // mechanic gates internally on parentRef.
  init() {},

  update(enemy, ctx) {
    if (!enemy.parentRef) return;
    const { dotDamageEvents } = ctx;

    if (enemy.parentRef.hp <= 0) {
      enemy.parentRef = null;
      return;
    }

    if (enemy.invulnerabilityTimer > 0) return;

    const dx = enemy.parentRef.position.x - enemy.position.x;
    const dy = enemy.parentRef.position.y - enemy.position.y;
    const contactDist = GRID.CELL_SIZE * 1.5;
    if (dx * dx + dy * dy <= contactDist * contactDist) {
      SplitOnDamageMechanic.notifySplitChildGone(enemy.parentRef, enemy, true);
      const ref = enemy.parentRef;
      enemy.parentRef = null;
      enemy.hp = 0;
      return { suspend: true, result: { dotDamage: dotDamageEvents, absorbedBy: ref } };
    }
  }
};
