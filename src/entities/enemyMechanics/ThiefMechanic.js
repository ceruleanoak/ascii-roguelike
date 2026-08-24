// Thief Mechanic — steal-and-flee kit shared by Rat/Plague Rat (coin) and
// Monkey (satchel): swap the bite for a steal attack whenever there's
// something to take, and turn cowardly the moment either side of the
// exchange turns against the thief (it gets hurt, or it gets what it came
// for). The state-mutation pattern (deleting hunting States from `declared`
// so the EnemyStateMachine FALLBACK can no longer resolve them) is
// RipenMechanic's, run in reverse: Ripen adds hunting States to a passive
// enemy, this removes them from a hunting one. The flip is one-way toward
// flight, not toward helplessness, though: `strike` stays declared and
// flee.js's `cornered` opt-in reaches it, so a cowardly thief still bites
// back if the player corners it — it just never again closes distance on
// its own.
//
// `data.thiefMechanic.steals` selects what's on offer: default (unset) is
// Rat's coin grab; `'satchel'` is Monkey's kit — up to three ingredients
// ejected from the pile (one kept, the rest scatter to the ground) plus the
// held weapon knocked away, both resolved in `_resolveSatchelTheft`.
//
// Cowardice's hunting behavior isn't permanent: a continuous run of lost
// sight — not merely one successful lookback, the general coward's own
// `withdraw`/`alert` settling already covers that — earns the thief its
// hunting states back (`_updateRecovery` / `_unflip`), restoring the exact
// pre-flip config rather than reconstructing archetype defaults, so any
// thiefMechanic enemy and a re-authored variant both recover correctly
// without this file needing to know their defaults. Room-clear status IS
// permanent, though: `_unflip` never restores `enemy.uncounted` — see its
// own comment.
import { hasVision } from '../enemyVision.js';
import { GRID } from '../../game/GameConfig.js';

export const ThiefMechanic = {
  isEnabled(enemy) {
    return enemy.data.thiefMechanic?.enabled === true;
  },

  init(enemy) {
    enemy.thiefFlipped = false;
    enemy.thiefFlipPending = false;
    enemy.thiefRecoverTimer = 0;
  },

  // Taking damage always wins the priority cascade over a theft in progress —
  // flagged here, actually applied on the next update() pass so the flip
  // happens outside of takeDamage()'s own call stack.
  onDamaged(enemy) {
    if (!ThiefMechanic.isEnabled(enemy) || enemy.thiefFlipped) return;
    enemy.thiefFlipPending = true;
  },

  // Called once a steal attack actually lands (see resolveTheft below) — a
  // successful grab is just as final as taking a hit.
  onTheftSuccess(enemy) {
    if (!ThiefMechanic.isEnabled(enemy) || enemy.thiefFlipped) return;
    enemy.thiefFlipPending = true;
  },

  update(enemy, ctx) {
    if (!ThiefMechanic.isEnabled(enemy)) return;

    if (enemy.thiefFlipped) {
      ThiefMechanic._updateRecovery(enemy, ctx);
      return;
    }

    if (enemy.thiefFlipPending) {
      ThiefMechanic._flipToCoward(enemy, ctx);
      return;
    }

    // Never yank the attack type out from under a swing already in motion —
    // Strike reads attackType/attackWindup fresh on entry, not mid-swing.
    if (enemy.stateMachine.current === 'strike') return;

    const hasTarget = ThiefMechanic._hasStealTarget(enemy);
    enemy.attackType = hasTarget ? 'thief' : (enemy.data.attackType || 'melee');
  },

  // What "there's something to steal" means depends on the thief's kind:
  // coin-thieves (Rat, Plague Rat) check the wallet; satchel-thieves
  // (Monkey) go for ingredients or the held weapon, either one being enough
  // to trigger the steal attack over a plain bite.
  _hasStealTarget(enemy) {
    const inv = enemy.game?.inventorySystem;
    if (!inv) return false;
    if (enemy.data.thiefMechanic?.steals === 'satchel') {
      return inv.getIngredients().length > 0 || !!enemy.game.player?.heldItem;
    }
    return inv.hasCoin(1);
  },

  _flipToCoward(enemy, ctx) {
    enemy.thiefFlipped = true;
    enemy.thiefFlipPending = false;
    enemy.thiefRecoverTimer = 0;
    enemy.uncounted = true; // no longer blocks room-clear — reads as an NPC now
    enemy.attackType = enemy.data.attackType || 'melee';

    const declared = enemy.stateMachine.declared;
    // Snapshotted before any of the mutations below touch `declared` — the
    // thief's own recovery (`_unflip`) restores exactly this, rather than
    // reconstructing the archetype's defaults from `movementStyle`.
    enemy._thiefPreFlipStates = {
      approach: declared.approach,
      search: declared.search,
      anticipate: declared.anticipate,
      recover: declared.recover,
      flee: declared.flee ? { ...declared.flee } : undefined,
      lookback: declared.lookback ? { ...declared.lookback } : undefined,
      withdraw: declared.withdraw ? { ...declared.withdraw } : undefined,
      strike: declared.strike ? { ...declared.strike } : undefined,
    };

    delete declared.approach;
    delete declared.search;
    delete declared.anticipate;
    delete declared.recover;
    // Strike stays declared — a flipped thief no longer hunts, but it isn't
    // defenseless: flee.js's `cornered` branch reaches this same State
    // (undeclared `anticipate`/`recover` fall back through it to `flee`,
    // exactly the path a normal un-flipped bite already resolves through
    // when neither is authored) so the bite fires only when the player
    // closes the distance, never on the thief's own initiative.
    if (!enemy.stateMachine.has('flee')) declared.flee = {};
    declared.flee.cornered = true;
    if (!enemy.stateMachine.has('lookback')) declared.lookback = {};
    if (!enemy.stateMachine.has('withdraw')) declared.withdraw = { duration: 1.2 };
    // Strike's default windup movement is 'still' — correct for the normal
    // approach-then-strike flow, where Approach already turned the enemy to
    // face its target before Strike holds that stance. A flipped thief never
    // runs that approach anymore: it arrives at Strike straight from Flee,
    // so 'still' would hold the away-facing the flight left behind and the
    // bite would read as landing while still running from the player. Safe
    // to set unconditionally rather than gate it on the cornered branch,
    // because Approach is deleted above — the cornered path in flee.js is
    // the only way this thief ever reaches Strike again.
    if (!declared.strike) declared.strike = {};
    declared.strike.movement = 'close';

    enemy.stateMachine.transition(enemy, ctx, 'flee', 'coward flip');
  },

  // Ticks while flipped, regardless of which State the coward wildcard chain
  // (flee → lookback → withdraw → alert, per EnemyStateMachine's FALLBACK)
  // currently has it in — a flipped thief settles into `alert` well before
  // this fires, same as any other coward, but settling isn't recovering:
  // this is the separate, longer clock on the flip itself. Resets on any
  // frame the thief can actually see its target (the same
  // `hasVision`/`ignoreCone` check Lookback uses to decide "lost me"), so
  // only a continuous, uninterrupted stretch out of sight counts — a target
  // that flickers in and out never accumulates toward recovery.
  _updateRecovery(enemy, ctx) {
    if (!enemy.target) return;

    const visionLength = ctx.effectiveVisionLength ?? enemy.visionLength;
    const canSee = hasVision(enemy, enemy.position, enemy.target.position, visionLength, { ignoreCone: true });
    if (canSee) {
      enemy.thiefRecoverTimer = 0;
      return;
    }

    const recoverAfter = enemy.data.thiefMechanic?.recoverAfter ?? 4.0; // double-seconds — 2 real seconds
    enemy.thiefRecoverTimer = (enemy.thiefRecoverTimer ?? 0) + ctx.deltaTime;
    if (enemy.thiefRecoverTimer >= recoverAfter) {
      ThiefMechanic._unflip(enemy, ctx);
    }
  },

  // Restores exactly what `_flipToCoward` snapshotted — a key absent before
  // the flip goes back to absent (undeclared), not to an empty `{}`, so an
  // enemy that never declared `lookback`/`withdraw` on its own doesn't gain
  // them permanently just because it was cowardly once.
  _unflip(enemy, ctx) {
    enemy.thiefFlipped = false;
    enemy.thiefRecoverTimer = 0;
    // `uncounted` stays true — recovery restores hunting/biting behavior but
    // never restores room-clear gating. Every other `uncounted` user in the
    // codebase (Aquifer eel, Quagmire Hag) is one-way for the same reason:
    // once a room's exits have opened on this thief's account, a later
    // change of heart shouldn't re-trap the player behind an already-earned-
    // open door. Bug #195 — recovering rats were re-locking exits mid-flap.

    const declared = enemy.stateMachine.declared;
    const pre = enemy._thiefPreFlipStates ?? {};
    for (const key of ['approach', 'search', 'anticipate', 'recover', 'flee', 'lookback', 'withdraw', 'strike']) {
      if (pre[key] === undefined) delete declared[key];
      else declared[key] = pre[key];
    }
    enemy._thiefPreFlipStates = null;

    enemy.stateMachine.transition(enemy, ctx, 'alert', 'coward recovered');
  },

  // Runs from CombatSystem once a steal attack actually connects (i.e. after
  // takeDamage() has already resolved dodge/block/i-frames normally) — theft
  // is only "successful" in exactly the same sense a bite landing is.
  resolveTheft(attack, player, combatSystem) {
    if (attack.owner?.data?.thiefMechanic?.steals === 'satchel') {
      ThiefMechanic._resolveSatchelTheft(attack, player, combatSystem);
      return;
    }

    const game = combatSystem.game;
    const stolen = game.inventorySystem.getCoinCount();
    if (stolen <= 0) return;

    game.inventorySystem.removeCoin(stolen);
    for (let i = 0; i < stolen; i++) {
      const angle = (i / stolen) * Math.PI * 2 + Math.random() * 0.4;
      game.lootSystem.spawnIngredientDrop('c', player.position.x, player.position.y, angle, null);
    }
    combatSystem.createDamageNumber(`-${stolen}`, player.position.x, player.position.y, '#ffff00');

    if (attack.owner) ThiefMechanic.onTheftSuccess(attack.owner);
  },

  // Monkey's steal: ejects up to three ingredients from the pile — the
  // monkey keeps the first (gone for good, same as Rat's coin grab) and
  // scatters the rest to the ground for the player to reclaim — and, in the
  // same beat, disarms the held weapon. The weapon lands 3 cells away in a
  // random direction carrying the same pickup cooldown a voluntary weapon
  // throw gets (TrapSystem._landThrownWeapon's 600ms) so the player can't
  // instantly re-grab it out from under the monkey; placed directly rather
  // than thrown, since this isn't the player's own attack arc.
  _resolveSatchelTheft(attack, player, combatSystem) {
    const game = combatSystem.game;
    const inv = game.inventorySystem;

    let ejected = 0;
    for (let i = 0; i < 3; i++) {
      const char = inv.removeRandomIngredient();
      if (!char) break;
      ejected++;
      if (ejected === 1) continue; // kept by the monkey — not dropped
      const angle = Math.random() * Math.PI * 2;
      game.lootSystem.spawnIngredientDrop(char, player.position.x, player.position.y, angle, null);
    }
    if (ejected > 0) {
      combatSystem.createDamageNumber(`-${ejected}`, player.position.x, player.position.y, '#88ff44');
    }

    const weapon = player.dropItem();
    if (weapon) {
      const angle = Math.random() * Math.PI * 2;
      const dist = GRID.CELL_SIZE * 3;
      weapon.position.x = player.position.x + Math.cos(angle) * dist;
      weapon.position.y = player.position.y + Math.sin(angle) * dist;
      weapon.velocity = { vx: 0, vy: 0 };
      weapon.pickupReadyAt = performance.now() + (attack.owner?.data?.thiefMechanic?.weaponPickupCooldown ?? 600);
      weapon.plane = player.plane ?? 0;
      weapon.hutPlane = player.inHut === true || player.inDungeon === true;
      weapon.mazePlane = player.inMaze === true;
      game.items.push(weapon);
      game.physicsSystem.addEntity(weapon);
      game.updateUI();
    }

    if ((ejected > 0 || weapon) && attack.owner) ThiefMechanic.onTheftSuccess(attack.owner);
  }
};
