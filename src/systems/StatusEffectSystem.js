// StatusEffectSystem — player damage-over-time ticking + resolution (burn,
// poison). Player still owns the status fields/timers themselves
// (burnDuration/poisonDuration/etc, applyBurn/applyPoison, isBurning/
// isPoisoned) — those are read/written directly by FireSystem,
// PhysicsSystem, ConsumableTriggerSystem and CombatSystem elsewhere, so
// moving the fields themselves would mean chasing every one of those call
// sites. This system only owns the per-frame ticking of those fields and
// turning a fired tick into an actual takeDamage() call — the one thing the
// tick itself can't do, since damage resolution needs the game's
// element-immunity and i-frame machinery that lives outside Player.
export const StatusEffectSystem = {
  // Called from Player.update() each frame — mutates the player's own
  // timers directly and returns any ticks that fired this frame.
  tickPlayerDot(player, deltaTime) {
    let burnDamage = null;
    if (player.burnDuration > 0) {
      player.burnDuration -= deltaTime;
      player.burnTickTimer -= deltaTime;
      if (player.burnTickTimer <= 0) {
        player.burnTickTimer = player.burnTickRate;
        burnDamage = player.burnDamage;
      }
    } else {
      player.burnTickTimer = 0;
    }

    let poisonDamage = null;
    if (player.poisonDuration > 0) {
      player.poisonDuration -= deltaTime;
      player.poisonTickTimer -= deltaTime;
      if (player.poisonTickTimer <= 0) {
        player.poisonTickTimer = player.poisonTickRate;
        poisonDamage = player.poisonDamage;
      }
    } else {
      player.poisonTickTimer = 0;
    }

    return (burnDamage || poisonDamage) ? { burnDamage, poisonDamage } : null;
  },

  // Called from main.js right after Player.update() — turns any reported
  // ticks into real damage, respecting takeDamage's immunity/i-frame checks.
  applyPlayerDot(game, playerUpdateResult) {
    let dotKilledPlayer = false;
    if (playerUpdateResult?.burnDamage) {
      const burnDead = game.player.takeDamage(playerUpdateResult.burnDamage, { isBullet: false, element: 'burn' });
      if (burnDead === true) dotKilledPlayer = true;
    }
    if (playerUpdateResult?.poisonDamage) {
      const poisonDead = game.player.takeDamage(playerUpdateResult.poisonDamage, { isBullet: false, element: 'poison' });
      if (poisonDead === true) dotKilledPlayer = true;
    }
    return dotKilledPlayer;
  }
};
