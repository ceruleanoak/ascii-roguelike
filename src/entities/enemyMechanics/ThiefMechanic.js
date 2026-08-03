// Thief Mechanic — Rat's coin-grab kit: steal the player's coin instead of
// biting when there's coin to take, and turn permanently cowardly the moment
// either side of the exchange turns against it (the rat gets hurt, or the
// rat gets what it came for). Once flipped there is no going back — the
// state-mutation pattern (deleting hunting States from `declared` so the
// EnemyStateMachine FALLBACK can no longer resolve them) is RipenMechanic's,
// run in reverse: Ripen adds hunting States to a passive enemy, this removes
// them from a hunting one.
export const ThiefMechanic = {
  isEnabled(enemy) {
    return enemy.data.thiefMechanic?.enabled === true;
  },

  init(enemy) {
    enemy.ratFlipped = false;
    enemy.ratFlipPending = false;
  },

  // Taking damage always wins the priority cascade over a theft in progress —
  // flagged here, actually applied on the next update() pass so the flip
  // happens outside of takeDamage()'s own call stack.
  onDamaged(enemy) {
    if (!ThiefMechanic.isEnabled(enemy) || enemy.ratFlipped) return;
    enemy.ratFlipPending = true;
  },

  // Called once a steal attack actually lands (see resolveTheft below) — a
  // successful grab is just as final as taking a hit.
  onCoinAcquired(enemy) {
    if (!ThiefMechanic.isEnabled(enemy) || enemy.ratFlipped) return;
    enemy.ratFlipPending = true;
  },

  update(enemy, ctx) {
    if (!ThiefMechanic.isEnabled(enemy) || enemy.ratFlipped) return;

    if (enemy.ratFlipPending) {
      ThiefMechanic._flipToCoward(enemy, ctx);
      return;
    }

    // Never yank the attack type out from under a swing already in motion —
    // Strike reads attackType/attackWindup fresh on entry, not mid-swing.
    if (enemy.stateMachine.current === 'strike') return;

    const hasCoin = enemy.game?.inventorySystem?.hasCoin(1) ?? false;
    enemy.attackType = hasCoin ? 'thief' : (enemy.data.attackType || 'melee');
  },

  _flipToCoward(enemy, ctx) {
    enemy.ratFlipped = true;
    enemy.ratFlipPending = false;
    enemy.uncounted = true; // no longer blocks room-clear — reads as an NPC now
    enemy.attackType = enemy.data.attackType || 'melee';

    const declared = enemy.stateMachine.declared;
    delete declared.approach;
    delete declared.search;
    delete declared.anticipate;
    delete declared.strike;
    delete declared.recover;
    if (!enemy.stateMachine.has('flee')) declared.flee = {};
    if (!enemy.stateMachine.has('lookback')) declared.lookback = {};
    if (!enemy.stateMachine.has('withdraw')) declared.withdraw = { duration: 1.2 };

    enemy.stateMachine.transition(enemy, ctx, 'flee', 'coward flip');
  },

  // Runs from CombatSystem once a steal attack actually connects (i.e. after
  // takeDamage() has already resolved dodge/block/i-frames normally) — theft
  // is only "successful" in exactly the same sense a bite landing is.
  resolveTheft(attack, player, combatSystem) {
    const game = combatSystem.game;
    const stolen = game.inventorySystem.getCoinCount();
    if (stolen <= 0) return;

    game.inventorySystem.removeCoin(stolen);
    for (let i = 0; i < stolen; i++) {
      const angle = (i / stolen) * Math.PI * 2 + Math.random() * 0.4;
      game.lootSystem.spawnIngredientDrop('c', player.position.x, player.position.y, angle, null);
    }
    combatSystem.createDamageNumber(`-${stolen}`, player.position.x, player.position.y, '#ffff00');

    if (attack.owner) ThiefMechanic.onCoinAcquired(attack.owner);
  }
};
