import { GRID } from '../../game/GameConfig.js';

// Giant Slime split-child passive re-merge. The child behaves like a normal
// slime; once mergeCooldownTimer expires, contact with the parent absorbs
// the child and restores its HP to the boss. If the parent dies first, the
// child detaches and becomes a normal slime.
//
// Fields (parentRef, mergeCooldownTimer, reformValue) are attached
// post-construction by the Giant Slime split path — not via init().

export const ReformMechanic = {
  // Reform state is opt-in by the spawner; no isEnabled() since there's no
  // data flag. The orchestrator runs update() unconditionally and the
  // mechanic gates internally on parentRef.
  init() {},

  update(enemy, ctx) {
    if (!enemy.parentRef) return;
    const { deltaTime, dotDamageEvents } = ctx;

    if (enemy.parentRef.hp <= 0) {
      enemy.parentRef = null;
      return;
    }

    if (enemy.mergeCooldownTimer > 0) {
      enemy.mergeCooldownTimer -= deltaTime;
      return;
    }

    const dx = enemy.parentRef.position.x - enemy.position.x;
    const dy = enemy.parentRef.position.y - enemy.position.y;
    const contactDist = GRID.CELL_SIZE * 1.5;
    if (dx * dx + dy * dy <= contactDist * contactDist) {
      enemy.parentRef.notifySplitChildGone(enemy, true);
      const ref = enemy.parentRef;
      enemy.parentRef = null;
      enemy.hp = 0;
      return { suspend: true, result: { dotDamage: dotDamageEvents, absorbedBy: ref } };
    }
  }
};
