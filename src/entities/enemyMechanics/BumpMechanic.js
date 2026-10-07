// Bump Mechanic — `data.bump`: touching the enemy flings the player hard.
// No damage, no attack, no telegraph — the body itself is the threat. In a
// lava room the player's spacing is the whole fight: a Bumper doesn't hurt
// you, the lava it shoves you into does.
//
//   bump: {
//     force,     // knockback force applied to the player (charge contact is 450)
//     duration,  // knockback status duration, seconds
//     cooldown,  // real seconds before the same Bumper can bump again
//   }
//
// Resolved from EnemyUpdateSystem's per-enemy loop, beside charge contact, on
// real (not double-second) deltaTime — it needs the player and PhysicsSystem,
// neither of which an Enemy holds. A player mid dodge roll passes through,
// same as the soft separation pass. Commanded (allied) Bumpers never bump.

import { GRID } from '../../game/GameConfig.js';
import { inSamePlane } from '../../systems/PlaneSystem.js';

// Contact box, in cells, between the player's and the Bumper's glyph centers.
// Both are half-width Unifont glyphs (half a cell wide, a full cell tall), so
// the boxes meet at half a cell apart horizontally and a full cell apart
// vertically; the small slack lets a graze register.
const CONTACT_X_CELLS = 0.6;
const CONTACT_Y_CELLS = 1.0;

export const BumpMechanic = {
  isEnabled(enemy) {
    return !!enemy.data?.bump;
  },

  init(enemy) {
    enemy.bumpCooldownTimer = 0;
  },

  resolveContact(enemy, player, game, deltaTime) {
    if (!this.isEnabled(enemy)) return;
    if (enemy.bumpCooldownTimer > 0) enemy.bumpCooldownTimer -= deltaTime;
    if (enemy.bumpCooldownTimer > 0 || enemy.commanded || enemy.isDying) return;
    if (player.dodgeRoll?.active || !inSamePlane(enemy, player)) return;

    // Contact follows the rendered glyphs, not a circle. Bumpers are exempt
    // from PhysicsSystem.resolveEntityContacts' 1.2-cell soft separation so
    // the glyphs can actually meet before the bump fires.
    const ex = enemy.position.x, ey = enemy.position.y;
    const dx = Math.abs(player.position.x - ex);
    const dy = Math.abs(player.position.y - ey);
    if (!(dx < GRID.CELL_SIZE * CONTACT_X_CELLS && dy < GRID.CELL_SIZE * CONTACT_Y_CELLS)) return;

    const cfg = enemy.data.bump;
    const half = GRID.CELL_SIZE / 2;
    game.physicsSystem.applyKnockback(player, ex + half, ey + half, cfg.force, cfg.duration);
    enemy.bumpCooldownTimer = cfg.cooldown;
  },
};
