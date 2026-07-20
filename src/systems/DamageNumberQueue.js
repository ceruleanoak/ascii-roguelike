// Stagger floating combat text per target (currently only the player) so
// multiple messages that want to appear in the same frame or two — CAN'T
// BLOCK, PIERCE, the damage number itself, a heal — queue up half a second
// apart instead of overlapping into an unreadable stack. Standalone module
// operating on the CombatSystem instance passed in (owns damageNumbers,
// pendingDamageTexts, _textCooldowns, createDamageNumber) — same
// pass-the-instance dispatch shape as SniperMechanic.consumeResult(combatSystem, ...),
// split out purely to keep CombatSystem.js under its architecture budget.

import { GRID } from '../game/GameConfig.js';

const STAGGER = 0.5;

// Shared dodge/block/reflect damage-number reporting for enemy-initiated hits
// that bypass the standard attack-object pipeline (sap, sniper beam/dagger).
// Numbers spawn a cell above the player's head (not at player.position, which
// draws behind the player in z-order and gets immediately covered by the
// sprite) so they're visible from the first frame, and queue through the
// player's text stagger so a hit that stacks several messages (CAN'T BLOCK +
// PIERCE + damage) reads as a sequence instead of overlapping. Returns true
// if the hit killed the player.
//
// `opts.pierce` marks the hit as armor-piercing (isImpact) — shows 'PIERCE'
// in parity with the enemy-facing distanceCrit 'PIERCE' indicator. `opts.pierceBlocked`
// additionally shows "CAN'T BLOCK" when the player was actively staff-blocking
// at the moment a piercing hit landed (block doesn't stop it, but the player
// should know their block attempt didn't help).
export function reportDamageResult(combatSystem, result, fallbackDamage, player, opts = {}) {
  const dmgY = player.position.y - GRID.CELL_SIZE;
  if (result.dodged) {
    queueDamageNumber(combatSystem, player, result.lucky ? 'LUCKY DODGE' : 'DODGE',
                       player.position.x, dmgY, result.lucky ? '#ffff66' : '#ffff00');
  } else if (result.blocked) {
    queueDamageNumber(combatSystem, player, 'BLOCK', player.position.x, dmgY, '#aaaaaa');
  } else if (result !== false) {
    if (opts.pierceBlocked) {
      queueDamageNumber(combatSystem, player, "CAN'T BLOCK", player.position.x, dmgY, '#ff6666');
    }
    if (opts.pierce) {
      queueDamageNumber(combatSystem, player, 'PIERCE', player.position.x, dmgY, '#ffff66');
    }
    queueDamageNumber(combatSystem, player, result.actualDamage ?? fallbackDamage, player.position.x, dmgY, '#cc0000');
    if (result.reflect && result.attacker) {
      result.attacker.takeDamage(result.reflect);
      combatSystem.createDamageNumber(result.reflect, result.attacker.position.x, result.attacker.position.y, '#ff8800');
    }
  }
  return result === true;
}

export function queueDamageNumber(combatSystem, target, damage, x, y, color, scale = 1, duration = 1.0) {
  const wait = combatSystem._textCooldowns.get(target) || 0;
  if (wait <= 0) {
    combatSystem.createDamageNumber(damage, x, y, color, scale, duration);
  } else {
    combatSystem.pendingDamageTexts.push({ target, delay: wait, damage, x, y, color, scale, duration });
  }
  combatSystem._textCooldowns.set(target, wait + STAGGER);
}

// Called once per frame from CombatSystem.update() — ages per-target cooldowns
// and flushes any staggered messages whose delay has elapsed.
export function ageDamageTextQueue(combatSystem, deltaTime) {
  for (const [target, wait] of combatSystem._textCooldowns) {
    const next = wait - deltaTime;
    if (next <= 0) combatSystem._textCooldowns.delete(target);
    else combatSystem._textCooldowns.set(target, next);
  }
  for (let i = combatSystem.pendingDamageTexts.length - 1; i >= 0; i--) {
    const pending = combatSystem.pendingDamageTexts[i];
    pending.delay -= deltaTime;
    if (pending.delay <= 0) {
      combatSystem.createDamageNumber(pending.damage, pending.x, pending.y, pending.color, pending.scale, pending.duration);
      combatSystem.pendingDamageTexts.splice(i, 1);
    }
  }
}
