// Bump Mechanic — `data.bump`: touching the enemy flings the player hard.
// No damage, no attack, no telegraph — the body itself is the threat. In a
// lava room the player's spacing is the whole fight: a Bumper doesn't hurt
// you, the lava it shoves you into does.
//
//   bump: {
//     force,     // knockback force applied to the player (charge contact is 450)
//     duration,  // Bump Flight length, real seconds (see Player.bumpFlightTimer)
//     cooldown,  // real seconds before the same Bumper can bump again
//   }
//
// Resolved from EnemyUpdateSystem's per-enemy loop, beside charge contact, on
// real (not double-second) deltaTime — it needs the player and PhysicsSystem,
// neither of which an Enemy holds. A player mid dodge roll passes through,
// same as the soft separation pass. Commanded (allied) Bumpers never bump.
//
// Companions are bodies too: a Bumper shoves any Companion it touches the
// same way, one body per cooldown, the player first. A Companion's Bump
// Flight (`bumpFlightTimer`) stands its steering down the way the player's
// stands input down — its owner checks inBumpFlight() before steering, or the
// next frame's follow velocity would cancel the shove.

import { GRID } from '../../game/GameConfig.js';
import { inSamePlane } from '../../systems/PlaneSystem.js';
import { glyphsTouch } from './glyphContact.js';

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

    // Contact follows the rendered glyphs, not a circle. Bumpers are exempt
    // from PhysicsSystem.resolveEntityContacts' 1.2-cell soft separation so
    // the glyphs can actually meet before the bump fires.
    const touched = (!player.dodgeRoll?.active && inSamePlane(enemy, player) && glyphsTouch(enemy, player))
      ? player
      : (game.companionSystem?.companions() ?? []).find(c =>
          c !== enemy && inSamePlane(enemy, c) && glyphsTouch(enemy, c));
    if (!touched) return;
    const ex = enemy.position.x, ey = enemy.position.y;

    const cfg = enemy.data.bump;
    const half = GRID.CELL_SIZE / 2;
    game.physicsSystem.applyKnockback(touched, ex + half, ey + half, cfg.force, cfg.duration);
    // Without this the player's walk-speed cap (Player.updateInput) clips the
    // shove to a step on the next frame — the player has no knockback status
    // to idle input the way a launched Enemy's AI does. A Companion's steering
    // would do the same (inBumpFlight). A commanded Enemy has no Bump Flight:
    // its knockback status already idles its AI.
    if (touched.bumpFlightTimer !== undefined) {
      touched.bumpFlightTimer = Math.max(touched.bumpFlightTimer, cfg.duration);
    }
    enemy.bumpCooldownTimer = cfg.cooldown;
  },
};

/**
 * Tick a Companion's Bump Flight; true while it lasts. Its owner skips the
 * Companion's steering for those frames so friction alone decays the shove.
 */
export function inBumpFlight(companion, deltaTime) {
  if (!(companion.bumpFlightTimer > 0)) return false;
  companion.bumpFlightTimer = Math.max(0, companion.bumpFlightTimer - deltaTime);
  return true;
}
