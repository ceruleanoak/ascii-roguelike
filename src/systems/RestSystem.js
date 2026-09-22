import { Player } from '../entities/Player.js';
import { GRID } from '../game/GameConfig.js';

// RestSystem — the player rebuild that happens on every REST entry.
// Game.enterRestState() always replaces `game.player` with a brand-new
// Player, so most stats reset to base by construction; this is where the
// carry-over exceptions (magic meter, cursed-run wound, fairy maxHp
// blessing) live, instead of piling more inline logic into main.js.
export const RestSystem = {
  /**
   * Rebuilds game.player for a REST entry (normal south-exit return or the
   * REST side of a revive), carrying forward the few things meant to
   * survive the rebuild. Not called on a full death — Player.reset() at
   * 'run' scope already restores base state before enterRestState runs, so
   * a dead run correctly does NOT carry a stale bonus through.
   */
  rebuildForRest(game) {
    // Capture magic-meter state from prior player before reconstructing.
    // Cleared by the true-game-over reset block, so death wipes it correctly.
    // Only an ACTIVE meter is carried: stamping an inactive one from a dead
    // run re-populated _savedMagicMeter after the reset nulled it.
    const savedMagicMeter = game.player?.magicMeter?.active
      ? { ...game.player.magicMeter }
      : game._savedMagicMeter ?? null;

    // A decayed REST no longer heals. Read off the outgoing Player, same as
    // the magic meter above, because the rebuild below is what does the healing.
    const carriedHp = game.cursedRunSystem.carryRestHp(game, game.player);
    const priorPlayer = game.player;

    // Create player just below the "E X P L O R E" label (text centre =
    // 4.5 * CELL_SIZE), offset 2 tiles lower than the label-relative spawn point
    const centerX = GRID.WIDTH / 2;
    const spawnY = GRID.CELL_SIZE * 5.5 + GRID.CELL_SIZE * 2;
    game.player = new Player(centerX, spawnY);
    game.player.godMode = game.cheatMenu.godMode;
    this.carryMaxHp(game.player, priorPlayer);
    game.player.hp = carriedHp !== null ? carriedHp : game.player.maxHp;
    if (savedMagicMeter) {
      game.player.magicMeter = savedMagicMeter;
      game._savedMagicMeter = savedMagicMeter;
    }
  },

  /**
   * A fairy fountain's maxHp blessing is a permanent-for-the-run upgrade,
   * not a per-dive one — carry it onto the freshly rebuilt REST player, or
   * every REST visit quietly refunds it back to base and "FEELING HEARTY?"
   * (FountainSystem) does nothing lasting.
   */
  carryMaxHp(newPlayer, priorPlayer) {
    const priorMaxHp = priorPlayer?.maxHp;
    if (typeof priorMaxHp === 'number' && priorMaxHp > newPlayer.maxHp) {
      newPlayer.maxHp = priorMaxHp;
    }
  }
};
