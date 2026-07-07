/**
 * PotionEffectSystem - Handles potion effect application with modifiers
 * Applies potion modifiers (purified/unstable) with random rolls for unstable
 */

import { getPotionEffectParams } from '../data/alchemy.js';

export class PotionEffectSystem {
  /**
   * Apply a consumable's potion effect with modifier support
   */
  static applyPotionEffect(consumable, effectType, player, baseParams = {}) {
    const modifier = consumable?.potionModifier ?? baseParams.potionModifier;
    const params = getPotionEffectParams(consumable?.char, modifier);

    return {
      ...baseParams,
      ...params,
      modifier
    };
  }

  /**
   * Handle bad unstable roll effects (shake, tint, damage)
   */
  static applyUnstableBadRoll(player, potionChar, params) {
    if (params?.isUnstableBadRoll) {
      // Apply visual shake and tint effects
      player.unstableShakeTimer = 0.5;
      player.unstableTintActive = true;

      // Apply damage based on how bad the roll is
      if (params.unstableRoll !== undefined && params.unstableRoll < 0) {
        player.takeDamage?.(Math.ceil(Math.abs(params.unstableRoll)));
      }
    }
  }
}
