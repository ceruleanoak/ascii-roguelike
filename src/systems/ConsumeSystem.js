import { GRID } from '../game/GameConfig.js';
import { findEnemyDataByTrueName } from '../data/enemies.js';
import { tagInteriorPlane } from './PlaneSystem.js';
import { ZONE_COLORS } from '../data/zones.js';

// Seconds a consumed enemy's glyph takes to reach the player.
const PULL_DURATION = 0.55;

/**
 * CONSUME — the true-name word that eats instead of binding.
 *
 * CONSUME asks `CONSUME WHOM?`; the true name typed next takes the nearest
 * bearer in the player's layer (same grammar as CALL, CommandSystem). The
 * enemy leaves the world at once — no loot, no corpse, no kill — and its
 * glyph is pulled into the player (a Consume Pull), where its remaining HP
 * heals them on arrival (shown in gray as the full amount eaten, even when
 * the heal itself is capped at max HP).
 *
 * On an uncursed run the first CONSUME is a Power wish: the wish question,
 * YES spends the wish, the enemy is consumed and the run is Cursed
 * (CursedRunSystem.begin, which plays the Curse Mark). Once the run is
 * Cursed, CONSUME is free and silent, as often as the player likes —
 * unlike PURGE, which spends a wish every cast.
 *
 * Any tier but boss can be consumed. CALL takes only the weak; CONSUME is
 * what the stronger names are for.
 *
 * Response strings stay ≤18 chars (the spell layer renders at 2×).
 */
export class ConsumeSystem {
  constructor(game) {
    this.game = game;
    // Consume Pulls in flight: { char, color, x0, y0, t, hp, hutPlane }.
    this.pulls = [];
    // The enemy an unanswered wish question would consume, or null.
    this.pending = null;
  }

  /** Room-scoped reset (Reset Registry): pulls and an open question die with the room. */
  reset() {
    this.pulls = [];
    this.pending = null;
  }

  /**
   * The true-name follow-up. Returns the THREE's line: a refusal, '' when
   * the enemy was consumed (a successful action is silent), or null when
   * the wish question should be asked — `pending` then holds the target.
   * @param {string} trueName
   * @returns {string|null}
   */
  cast(trueName) {
    const game = this.game;
    this.pending = null;
    const data = findEnemyDataByTrueName(trueName);
    if (!data || !game.player) return 'THE NAME ECHOES.';
    if (data.tier === 'boss') return 'IT WILL NOT YIELD.';

    const target = this._nearestBearer(data.trueName);
    if (!target) return 'THE NAME ECHOES.';

    if (game.cursedRun) {
      this._consume(target);
      return '';
    }
    if (!game.wishSystem?.hasWish(game)) return 'NO WISHES LEFT.';
    this.pending = target;
    return null;
  }

  /**
   * YES to the wish question: spend the wish, consume the pending enemy and
   * curse the run. Nothing is spent if the enemy is already gone.
   */
  confirm() {
    const game = this.game;
    const target = this.pending;
    this.pending = null;
    if (!target || target.isDying || !game._activeEnemies?.()?.includes(target)) return;
    if (!game.cursedRun && !game.wishSystem?.spend(game)) return;
    this._consume(target);
    game.cursedRunSystem.begin(game, { spendWish: false });
  }

  /** Per frame (state-shared): pulls travel, and land as healing. */
  update(dt) {
    if (!this.pulls.length) return;
    const player = this.game.player;
    for (let i = this.pulls.length - 1; i >= 0; i--) {
      const pull = this.pulls[i];
      pull.t += dt / PULL_DURATION;
      if (pull.t < 1) continue;
      this.pulls.splice(i, 1);
      if (!player || pull.hp <= 0) continue;
      // The number shows everything eaten, in the curse's gray, even past
      // a full heart; the heal itself still stops at max HP.
      const gained = Math.min(pull.hp, player.maxHp - player.hp);
      if (gained > 0) player.heal(gained);
      this.game.combatSystem.queueDamageNumber(player, `+${pull.hp}`, player.position.x, player.position.y, ZONE_COLORS.gray);
    }
  }

  /**
   * Where a pull is drawn this frame: eased in (it gathers speed as it
   * nears), shrinking as it goes, aimed at the player's current position.
   * @returns {{x:number, y:number, scale:number, t:number}}
   */
  pullPosition(pull) {
    const player = this.game.player;
    const tx = player.position.x + GRID.CELL_SIZE / 2;
    const ty = player.position.y + GRID.CELL_SIZE / 2;
    const e = pull.t * pull.t;
    return {
      x: pull.x0 + (tx - pull.x0) * e,
      y: pull.y0 + (ty - pull.y0) * e,
      scale: 1 - 0.5 * e,
      t: pull.t,
    };
  }

  _nearestBearer(trueName) {
    const game = this.game;
    let target = null;
    let bestDistSq = Infinity;
    for (const e of game._activeEnemies?.() ?? []) {
      if (e.isDying || e.data?.trueName !== trueName) continue;
      const dx = e.position.x - game.player.position.x;
      const dy = e.position.y - game.player.position.y;
      const d = dx * dx + dy * dy;
      if (d < bestDistSq) { bestDistSq = d; target = e; }
    }
    return target;
  }

  /**
   * Consume one chosen enemy, no true name asked — the Death Fight's free
   * CONSUME (DeathFightSystem). Same pull, same heal.
   */
  consumeEnemy(enemy) {
    this._consume(enemy);
  }

  /**
   * The enemy leaves the world now — out of every enemy list and physics, a
   * latched bat let go — so it can't act during the pull. Not a death: no
   * loot, no corpse, no ledger.
   */
  _consume(enemy) {
    const game = this.game;
    if (enemy.sapping) enemy.breakSapping(0);
    const lists = new Set([game._activeEnemies?.()]);
    for (const room of [game.activeRoom, game.currentRoom]) {
      if (!room) continue;
      for (const key of ['enemies', 'enemiesPlane0', 'enemiesPlane1']) lists.add(room[key]);
    }
    for (const list of lists) {
      const idx = list?.indexOf(enemy) ?? -1;
      if (idx !== -1) list.splice(idx, 1);
    }
    game.physicsSystem.removeEntity(enemy);

    this.pulls.push(tagInteriorPlane(game, {
      char: enemy.displayChar || enemy.char,
      color: enemy.color,
      x0: enemy.position.x + GRID.CELL_SIZE / 2,
      y0: enemy.position.y + GRID.CELL_SIZE / 2,
      t: 0,
      hp: Math.max(0, Math.ceil(enemy.hp ?? 0)),
    }));
  }
}
