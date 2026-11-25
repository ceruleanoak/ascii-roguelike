// Smitten / Heartbroken — the pieces wild rats (Enemy, enemyStates/smitten.js)
// and wild crows (Crow.js 'smitten') share. GLOSSARY.md "Smitten" and
// "Heartbroken".
//
// A wild creature that can be tamed with Feed is Smitten while the player
// carries Feed it eats in an equipped consumable slot: it follows instead of hunting,
// stealing or fleeing. Hurting a Smitten creature (any damage or status)
// makes it Heartbroken for good — Feed never draws or tames it again.
import { GRID } from '../game/GameConfig.js';
import { isFeed } from './feed.js';
import { tagInteriorPlane } from './PlaneSystem.js';

// How often a Smitten creature floats a heart while it follows.
export const SMITTEN_HEART_INTERVAL = 1.4;

/**
 * True when any equipped consumable slot holds Feed that `accepts` (isFeed /
 * isCrowFeed). Feed is a consumable: it equips into player.equippedConsumables
 * and never into player.quickSlots (the weapon loadout), so reading quickSlots
 * alone meant nothing ever turned Smitten.
 */
export function carriesFeed(player, accepts = isFeed) {
  return !!player?.equippedConsumables?.some(item => item && accepts(item));
}

function floatHeart(game, entity, char, color, vy) {
  if (!game?.particles) return;
  game.particles.push(tagInteriorPlane(game, {
    x: entity.position.x + GRID.CELL_SIZE / 2,
    y: entity.position.y + GRID.CELL_SIZE / 2 - 4,
    vx: 0, vy, life: 0.9, maxLife: 0.9, char, color
  }));
}

/** The rising heart a Smitten creature shows (same heart taming shows). */
export function floatSmittenHeart(game, entity) {
  floatHeart(game, entity, '♥', '#ff5577', -22);
}

/** The broken heart: hollow, grey, sinking. Shown once, at the betrayal. */
export function floatBrokenHeart(game, entity) {
  floatHeart(game, entity, '♡', '#8a8a8a', 18);
}
