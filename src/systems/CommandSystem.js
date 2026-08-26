import { GRID } from '../game/GameConfig.js';
import { findEnemyDataByTrueName } from '../data/enemies.js';
import { steerToward } from './npcSteering.js';

/**
 * CommandSystem — permanent charm via true names.
 *
 * LOOK ENEMY reveals an enemy's trueName (authored per entry in enemies.js).
 * CALL/COMMAND <trueName> (spells.js follow-ups) permanently charms the
 * nearest living member of that kind: it leaves the room's aggro accounting
 * entirely (pulled out of room.enemies, so it no longer gates exits, waves,
 * or spawn tables) and joins game.commandedEnemies — a run-scoped roster,
 * distinct from Companions/Pets (CompanionSystem owns those).
 *
 * Mechanics:
 *   - Permanent charm rides the EXISTING charm status slot with an Infinite
 *     duration, so every shipped charm behavior lights up free: targeting
 *     (CombatSystem.applyTargetOverrides sends it at the nearest hostile),
 *     attack routing (isCharmedAttack/charmedTarget), and the magenta
 *     StatusEffectVisuals tint. The Infinity duration can never be exhausted
 *     by EnemyStatusEffects' decrement tick.
 *   - Aggro exclusion lives in one gate: Enemy.update computes an Infinite
 *     effectiveDistance to the player for commanded units, so detection,
 *     aggro SFX, windups, leaps, charges-at-player, and memory marks can
 *     never resolve against them — they are, mechanically, not part of the
 *     fight against you.
 *   - Follow scope: EXPLORE surface rooms only. On room swap the roster
 *     teleports in around the player (RoomGenerator.findSpawnPosition search)
 *     and re-registers with physics; while an interior (hut/dungeon/maze) or
 *     a non-EXPLORE state owns the screen the roster simply parks — not
 *     ticked, not rendered, roster intact.
 *   - Cap: three commanded at once (MAX_COMMANDS). Boss-tier refuses command
 *     (its true name is knowable but does not bend). A commanded unit that
 *     dies frees its slot on the next update pass.
 *
 * Response strings stay ≤18 chars — the spell layer renders at 2×
 * VentureArcade (see spells.js header note).
 */

const MAX_COMMANDS = 3;
// Hold ring: followers steer toward the player until inside this distance,
// then stand. Just over a weapon's reach band — close enough to look sworn,
// far enough not to bodyblock doorways.
const FOLLOW_DISTANCE = GRID.CELL_SIZE * 2.5;

export class CommandSystem {
  constructor(game) {
    this.game = game;
    // Run-scoped roster (cleared with the rest of the run by the reset paths —
    // see clearRunState call sites in main.js; verified by check-reset-parity).
    game.commandedEnemies = [];
  }

  /** Full-reset hook — death/title wipe the roster like every companion list. */
  clearRunState() {
    this.game.commandedEnemies = [];
  }

  /**
   * Answer a spoken true name: validate, then permanently charm the nearest
   * matching enemy on the player's surface layer. Called from the CALL/
   * COMMAND spell follow-up handlers (spells.js) — the return value IS the
   * spell response text (house pattern: HEX's response applies its effect).
   * @param {string} trueName
   * @returns {string} display line, ≤18 chars
   */
  commandNearest(trueName) {
    const game = this.game;
    const data = findEnemyDataByTrueName(trueName);
    // An unknown word is a wrong guess, not an error — same literacy gate as
    // SpellSystem._describeEntity.
    if (!data) return 'THE NAME ECHOES.';

    // Refusal for boss-tier names is checked before anything else so the
    // hierarchy (which names may serve) reads the same whether or not one
    // stands in the room.
    if (data.tier === 'boss') return 'IT WILL NOT BEND.';

    // Presence before cap: an absent kind echoes even at full strength —
    // "nobody here bears that name" is the truer answer than "warband full".
    const enemies = game._activeEnemies?.() ?? [];
    if (!game.player) return 'THE NAME ECHOES.';
    let target = null;
    let bestDistSq = Infinity;
    for (const e of enemies) {
      if (e.isDying || e.data?.trueName !== data.trueName) continue;
      const dx = e.position.x - game.player.position.x;
      const dy = e.position.y - game.player.position.y;
      const d = dx * dx + dy * dy;
      if (d < bestDistSq) { bestDistSq = d; target = e; }
    }
    // The name only resolves if something bearing it is actually here —
    // calling into an empty room echoes away.
    if (!target) return 'THE NAME ECHOES.';

    this._pruneDead();
    if (game.commandedEnemies.length >= MAX_COMMANDS) return 'ONLY THREE ANSWER.';

    this._charm(target);
    return `${data.trueName} ANSWERS.`;
  }

  /**
   * Flip a live enemy to permanently commanded: pull it out of the room's
   * enemy accounting, light the permanent charm slot, scrub any hunt state,
   * and enroll it in the roster.
   */
  _charm(enemy) {
    const game = this.game;
    const room = game.currentRoom;
    // Leave the aggro list: exits unlock, wave logic ignores, spawn tables
    // don't resurrect it. Plane-split lists included for parity with the
    // errand-clear path that maintains all three.
    if (room) {
      let idx = room.enemies?.indexOf(enemy) ?? -1;
      if (idx !== -1) room.enemies.splice(idx, 1);
      for (const key of ['enemiesPlane0', 'enemiesPlane1']) {
        const list = room[key];
        idx = list?.indexOf(enemy) ?? -1;
        if (idx !== -1) list.splice(idx, 1);
      }
    }

    // Permanent charm: the shared charm slot with an Infinite duration —
    // every shipped charm behavior (targeting, attack routing, magenta tint)
    // keys off this slot's active flag. Set directly rather than through
    // applyStatusEffect so the Infinite duration survives implementation
    // details of the activation path.
    enemy.commanded = true;
    enemy.statusEffects.charm.active = true;
    enemy.statusEffects.charm.duration = Infinity;

    // Scrub hunt state so it doesn't stalk a memory mark of you.
    enemy.enraged = false;
    enemy.aggroMemoryActive = false;
    enemy.lastKnownPosition = null;
    enemy.memoryChaseTimer = 0;
    enemy.detectionIndicatorTimer = 0;
    enemy.setTarget(null);

    game.commandedEnemies.push(enemy);
  }

  /**
   * Per-frame EXPLORE pass (dispatched from updateExploreState immediately
   * after the canonical enemy tick). Rest-parity: deliberately ABSENT from
   * updateRestState — the hub is a no-combat space and the roster parks
   * outside it by design, so there is nothing to degrade.
   *
   * Two jobs: free slots of the fallen, and steer unoccupied followers into
   * a ring around the player. Runs AFTER the enemy tick so its velocity
   * writes are the ones physics integrates this frame, and so each member's
   * target reflects the targeting override that just ran (target === player
   * ⇔ no hostile answered this frame — see applyTargetOverrides).
   */
  update() {
    const game = this.game;
    const roster = game.commandedEnemies;
    if (!roster.length) return;
    this._pruneDead();

    const player = game.player;
    if (!player) return;
    for (const enemy of roster) {
      // Occupied (a hostile was assigned as its target this frame): the state
      // machine owns the body — never fight the AI for the velocity.
      if (enemy.target && enemy.target !== player) continue;

      const dx = player.position.x - enemy.position.x;
      const dy = player.position.y - enemy.position.y;
      const dist = Math.hypot(dx, dy);
      if (dist > FOLLOW_DISTANCE) {
        steerToward(game, enemy, player.position.x, player.position.y, enemy.speed);
        // Mirror the steer into targetVelocity so the canonical tick's
        // _blendVelocity converges on the same heading instead of dragging
        // the body back toward its pre-command momentum.
        const v = Math.hypot(enemy.velocity.vx, enemy.velocity.vy) || 1;
        enemy.targetVelocity.vx = (enemy.velocity.vx / v) * enemy.speed;
        enemy.targetVelocity.vy = (enemy.velocity.vy / v) * enemy.speed;
      } else {
        // In the ring: hold. Kill momentum both ways so the blend doesn't
        // orbit them around the player.
        enemy.velocity.vx = 0;
        enemy.velocity.vy = 0;
        enemy.targetVelocity.vx = 0;
        enemy.targetVelocity.vy = 0;
      }
    }
  }

  /** Drop the fallen from the roster (slot freed); physics removal is owned by the death path. */
  _pruneDead() {
    const roster = this.game.commandedEnemies;
    for (let i = roster.length - 1; i >= 0; i--) {
      if (roster[i].isDying || (roster[i].hp ?? 1) <= 0) roster.splice(i, 1);
    }
  }

  /**
   * Room-transition hook (called from Game.applyRoomSwap, so every natural
   * and warp entry routes identically — see the [warp-divergence] category).
   * Surfaces the roster around the player with fresh room references; parks
   * it untouched whenever an interior owns the floor.
   */
  onRoomSwap(room) {
    const game = this.game;
    const roster = game.commandedEnemies;
    if (!roster.length || !room || !game.player) return;

    // Interiors are another plane's business — the warband waits outside.
    if (game.activeFloor || game.player.inHut || game.player.inDungeon || game.player.inMaze) return;

    for (let i = 0; i < roster.length; i++) {
      const enemy = roster[i];

      // Fresh room wiring — same pattern RoomGenerator uses for spawns.
      enemy.setCollisionMap(room.collisionMap);
      enemy.setBackgroundObjects(room.backgroundObjects);
      enemy.setSteamClouds(game.steamClouds);
      enemy.setGame(game);
      enemy.setRoom(room);
      enemy.plane = 0;

      // Arrive beside the player, spread by index so a full retinue doesn't
      // stack into one cell. Search honors walls; fall back to a raw offset
      // (PhysicsSystem clamps out-of-bounds).
      const angle = -Math.PI / 2 + i * ((Math.PI * 2) / Math.max(roster.length, 3));
      const spot = game.roomGenerator?.findSpawnPosition(
        { x: game.player.position.x, y: game.player.position.y },
        GRID.CELL_SIZE * 3,
        room.collisionMap,
        room.enemies
      ) || {
        x: game.player.position.x + Math.cos(angle) * GRID.CELL_SIZE * 2,
        y: game.player.position.y + Math.sin(angle) * GRID.CELL_SIZE * 2
      };
      enemy.position.x = spot.x;
      enemy.position.y = spot.y;

      // Clear navigation baggage from the previous room.
      enemy.stuckTimer = 0;
      enemy.lastPosition = { x: enemy.position.x, y: enemy.position.y };
      enemy.navDirection = 0;
      enemy.pathNodes = [];
      enemy.currentDirection = { x: 0, y: 0 };

      // applyRoomSwap rebuilt physics from the room lists — the roster
      // registers itself here, alongside registerTamedRatsWithPhysics().
      game.physicsSystem.addEntity(enemy);
    }
  }
}
