// Smitten Mechanic — when a wild Enemy that eats Feed (`tameableByBread`)
// turns Smitten, and when it turns Heartbroken (GLOSSARY.md).
//
// The State itself is enemyStates/smitten.js, declared for these Enemies by
// stateDefaults.js. This file is the door in — any State that isn't committed
// gives way once the player, carrying Feed, comes within aggro range — and the
// one-way door out: any damage or status landing on a Smitten Enemy sets
// `heartbroken`, which the State reads to end itself and this file reads to
// never open the door again. CompanionSystem's bread taming skips it too.
import { carriesFeed, floatBrokenHeart } from '../../systems/smitten.js';

export const SmittenMechanic = {
  isEnabled(enemy) {
    return enemy.data?.tameableByBread === true;
  },

  init(enemy) {
    enemy.heartbroken = false;
  },

  // Called with the State spine's ctx just before the machine runs.
  update(enemy, ctx) {
    if (!SmittenMechanic.isEnabled(enemy) || enemy.heartbroken) return;
    const machine = enemy.stateMachine;
    if (machine.current === 'smitten' || machine.isCommitted()) return;
    // A thief running off with the player's coin isn't coming back for bread.
    if (enemy.thiefFlipped || enemy.thiefFlipPending) return;
    if (!ctx.samePlane || ctx.effectiveDistance > ctx.effectiveAggroRange) return;
    if (!carriesFeed(enemy.game?.player)) return;
    machine.transition(enemy, ctx, 'smitten', 'feed carried');
  },

  // Any damage or status. Only a Smitten Enemy breaks — a rat hurt while it
  // was hunting was never offered anything.
  onHurt(enemy) {
    if (enemy.heartbroken || enemy.stateMachine?.current !== 'smitten') return;
    enemy.heartbroken = true;
    floatBrokenHeart(enemy.game, enemy);
  },
};
