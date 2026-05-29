import { GRID } from '../game/GameConfig.js';
import { NeutralCharacter } from '../entities/NeutralCharacter.js';

const FROG_SPEED = 130;        // matches ENEMIES['g'].speed
const FROG_ACCEL = 800;        // matches ENEMIES['g'].acceleration
const TONGUE_MAX_LENGTH = GRID.CELL_SIZE * 2.5;
const TONGUE_DAMAGE = 1;
const TONGUE_STUN = 2.0;       // seconds of stun applied on hit
const CURE_CONTACT_RANGE = GRID.CELL_SIZE;
const CURE_RUSALKA_CHAR = 'R';
const CURE_RUSALKA_COLOR = '#88ffee';

/**
 * PolymorphSystem — manages the frog-curse polymorph state.
 *
 * Two types of polymorph:
 *   cursed (polymorphCursed)   — applied by the hut Witch; forces exits open.
 *   voluntary (polymorphCured) — toggled via F key after Rusalka cure; standard exit locks.
 *
 * The player entity is mutated directly (char/color/speed overrides) rather than
 * creating a separate frog entity, keeping the coordinate space and physics unchanged.
 *
 * Cure methods:
 *   1. Touch cure Rusalka in a Lake ('L') room → deactivate + mark cured
 *   2. HEAL / UNCURSE spell + wish confirmation → cureViaWish()
 *   3. F key toggle (post-cure only) → deactivate (voluntary form only)
 */
export class PolymorphSystem {
  // ── Activation ─────────────────────────────────────────────────────────────

  activatePolymorph(game, cursed = false) {
    const player = game.player;
    if (!player || player.polymorphed) return;

    // Save original state so we can restore on cure
    player.polymorphSavedState = {
      char:       player.char,
      color:      player.color,
      baseColor:  player.baseColor,
      dodgeChance: player.dodgeChance,
      rollType:   player.dodgeRoll.type,
    };

    // Mutate player into frog form
    player.char      = 'g';
    player.color     = '#44bb44';
    player.baseColor = '#44bb44';
    player._polymorphSpeedOverride = FROG_SPEED;
    player._polymorphAccelOverride = FROG_ACCEL;
    player.polymorphed    = true;
    player.polymorphCursed = cursed;

    // Initialize frog jump state — fire first jump immediately
    player._frogJumpTimer    = 0;
    player._frogJumpActive   = false;
    player._frogJumpDurationTimer = 0;
    player._frogJumpSide     = 1;

    // Witch curse: force exits open immediately
    if (cursed && game.currentRoom) {
      game.currentRoom.exitsLocked = false;
    }

    // Cancel any active dodge roll
    player.dodgeRoll.active = false;
    player.dodgeRoll.cooldownTimer = 0;

    game.audioSystem?.playSFX('polymorph');
  }

  // ── Deactivation ───────────────────────────────────────────────────────────

  deactivatePolymorph(game, markCured = false) {
    const player = game.player;
    if (!player || !player.polymorphed) return;

    const saved = player.polymorphSavedState;
    if (saved) {
      player.char       = saved.char;
      player.color      = saved.color;
      player.baseColor  = saved.baseColor;
      player.dodgeChance = saved.dodgeChance;
      player.dodgeRoll.type = saved.rollType;
    }

    delete player._polymorphSpeedOverride;
    delete player._polymorphAccelOverride;
    player.polymorphed     = false;
    player.polymorphCursed = false;
    player.polymorphSavedState = null;

    // Clear frog jump state
    player._frogJumpActive       = false;
    player._frogJumpTimer        = 0;
    player._frogJumpDurationTimer = 0;
    player._frogJumpSide         = 1;

    if (markCured) {
      player.polymorphCured = true;
      game.knownSpells?.add('FROG');
    }

    // Remove cure Rusalka if present
    game.cureRusalka = null;

    game.audioSystem?.playSFX('polymorph');
  }

  // ── Cure via HEAL / UNCURSE spell ──────────────────────────────────────────

  cureViaWish(game) {
    const player = game.player;
    if (!player?.polymorphed || game.wishesUsed >= 3) return;

    // Mirror executeCleanse slot-destruction logic exactly
    const slotIdx = game.wishesUsed; // wish 1 → slot 0, wish 2 → slot 1, wish 3 → slot 2
    game.wishesUsed++;
    game._savedDestroyedSlots[slotIdx] = true;

    if (player) {
      const item = player.quickSlots[slotIdx];
      if (item) {
        const emptySlot = player.quickSlots.findIndex(
          (s, i) => i !== slotIdx && s === null && !player.destroyedSlots[i]
        );
        if (emptySlot !== -1) player.quickSlots[emptySlot] = item;
      }
      player.quickSlots[slotIdx] = null;
      if (player.destroyedSlots) player.destroyedSlots[slotIdx] = true;
      if (player.activeSlotIndex === slotIdx) {
        player.activeSlotIndex = player.quickSlots.findIndex(
          (s, i) => s !== null && !player.destroyedSlots[i]
        );
        if (player.activeSlotIndex === -1) player.activeSlotIndex = 0;
      }
    }

    this.deactivatePolymorph(game, true);
    game.updateUI?.();
  }

  // ── Cure Rusalka spawning (Lake room) ──────────────────────────────────────

  spawnCureRusalka(game) {
    if (game.cureRusalka) return; // already present

    const rusalka = new NeutralCharacter(
      CURE_RUSALKA_CHAR,
      CURE_RUSALKA_COLOR,
      GRID.WIDTH  / 2 - GRID.CELL_SIZE / 2,
      GRID.HEIGHT / 2 - GRID.CELL_SIZE / 2
    );
    rusalka.isCureRusalka = true;
    game.cureRusalka = rusalka;
  }

  // ── Player tongue attack ────────────────────────────────────────────────────

  createTongueAttack(game) {
    const player = game.player;
    if (!player?.polymorphed) return;

    // Find enemies based on whether we're inside a hut interior
    const enemies = (player.inHut && game.hutInterior)
      ? game.hutInterior.enemies
      : (game.currentRoom?.enemies ?? []);

    // Pick nearest enemy for direction; fall back to facing direction
    let nearestEnemy = null;
    let minDistSq = Infinity;
    for (const e of enemies) {
      const dx = e.position.x - player.position.x;
      const dy = e.position.y - player.position.y;
      const d = dx * dx + dy * dy;
      if (d < minDistSq) { minDistSq = d; nearestEnemy = e; }
    }

    let dirX, dirY;
    if (nearestEnemy) {
      const dx = nearestEnemy.position.x - player.position.x;
      const dy = nearestEnemy.position.y - player.position.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      dirX = dx / dist;
      dirY = dy / dist;
    } else {
      // Use stored facing direction
      dirX = player.facing?.x || 0;
      dirY = player.facing?.y || 1;
      const len = Math.sqrt(dirX * dirX + dirY * dirY) || 1;
      dirX /= len;
      dirY /= len;
    }

    game.playerTongueAttacks.push({
      direction:      { x: dirX, y: dirY },
      maxLength:      TONGUE_MAX_LENGTH,
      currentLength:  0,
      phase:          'extending',
      timer:          0,
      extendDuration:  0.10,
      holdDuration:    0.05,
      retractDuration: 0.12,
      damage:         TONGUE_DAMAGE,
      stunDuration:   TONGUE_STUN,
      hasHit:         false,
      color:          '#ff88aa',
      targetEnemies:  enemies,
    });
  }

  // ── Per-frame update ────────────────────────────────────────────────────────

  update(dt, game) {
    if (!game.player) return;

    // Always tick tongue attacks (they may outlast the polymorph duration briefly)
    this._updatePlayerTongueAttacks(dt, game);

    if (!game.player.polymorphed) return;

    // Drive frog jumper movement (sets velocity bursts, manages jump timer)
    this._updateFrogMovement(dt, game);

    // Check for Lake room entry — spawn cure Rusalka if needed
    const isLakeRoom = game.currentRoom?.exitLetter === 'L';
    if (isLakeRoom && !game.cureRusalka && !game.player.inHut) {
      this.spawnCureRusalka(game);
    }

    // Update cure Rusalka pulse animation and check contact
    if (game.cureRusalka && !game.player.inHut) {
      game.cureRusalka.update(dt);

      const dx = game.player.position.x - game.cureRusalka.position.x;
      const dy = game.player.position.y - game.cureRusalka.position.y;
      if (Math.sqrt(dx * dx + dy * dy) < CURE_CONTACT_RANGE) {
        this.deactivatePolymorph(game, true); // marks player as cured
      }
    }
  }

  // ── Frog jumper movement ────────────────────────────────────────────────────

  _updateFrogMovement(dt, game) {
    const player = game.player;
    const JUMP_INTERVAL = 0.85 / 3;
    const JUMP_SPEED    = 130;
    const JUMP_DURATION = 0.17;

    if (!player._frogJumpActive) {
      player._frogJumpTimer -= dt;
      if (player._frogJumpTimer <= 0) {
        // Determine jump direction from current input or last facing
        const keys = game.keys ?? {};
        let dx = 0, dy = 0;
        if (keys.a) dx -= 1;
        if (keys.d) dx += 1;
        if (keys.w) dy -= 1;
        if (keys.s) dy += 1;
        if (dx === 0 && dy === 0) {
          dx = player.facing?.x ?? 0;
          dy = player.facing?.y ?? 1;
        }
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        dx /= len; dy /= len;

        player.velocity.vx = dx * JUMP_SPEED;
        player.velocity.vy = dy * JUMP_SPEED;
        player._frogJumpActive       = true;
        player._frogJumpDurationTimer = JUMP_DURATION;
        player._frogJumpTimer        = JUMP_INTERVAL * (0.7 + Math.random() * 0.6);
      }
    } else {
      player._frogJumpDurationTimer -= dt;
      if (player._frogJumpDurationTimer <= 0) {
        player._frogJumpActive = false;
      }
    }
  }

  // ── Tongue attack tick loop ─────────────────────────────────────────────────

  _updatePlayerTongueAttacks(dt, game) {
    const attacks = game.playerTongueAttacks;
    if (!attacks?.length) return;

    const player = game.player;

    for (let i = attacks.length - 1; i >= 0; i--) {
      const tongue = attacks[i];
      tongue.timer += dt;

      if (tongue.phase === 'extending') {
        const t = Math.min(tongue.timer / tongue.extendDuration, 1);
        tongue.currentLength = tongue.maxLength * t;

        if (tongue.timer >= tongue.extendDuration) {
          tongue.currentLength = tongue.maxLength;
          tongue.phase = 'hold';
          tongue.timer = 0;

          // Hit test at the moment of full extension
          if (!tongue.hasHit) {
            const sx = player.position.x + GRID.CELL_SIZE / 2;
            const sy = player.position.y + GRID.CELL_SIZE / 2;
            const tipX = sx + tongue.direction.x * tongue.maxLength;
            const tipY = sy + tongue.direction.y * tongue.maxLength;
            const half = GRID.CELL_SIZE * 0.5;

            for (const enemy of tongue.targetEnemies) {
              if (enemy.hp <= 0) continue;
              const ex = enemy.position.x;
              const ey = enemy.position.y;
              const ew = GRID.CELL_SIZE;
              const eh = GRID.CELL_SIZE;
              if (tipX + half > ex && tipX - half < ex + ew &&
                  tipY + half > ey && tipY - half < ey + eh) {
                enemy.takeDamage(tongue.damage);
                enemy.applyStatusEffect?.('stun', tongue.stunDuration);
                game.combatSystem?.createDamageNumber?.(
                  tongue.damage,
                  enemy.position.x + GRID.CELL_SIZE / 2,
                  enemy.position.y,
                  '#ff88aa'
                );
                tongue.hasHit = true;
                break;
              }
            }
          }
        }

      } else if (tongue.phase === 'hold') {
        if (tongue.timer >= tongue.holdDuration) {
          tongue.phase = 'retracting';
          tongue.timer = 0;
        }

      } else if (tongue.phase === 'retracting') {
        const t = Math.min(tongue.timer / tongue.retractDuration, 1);
        tongue.currentLength = tongue.maxLength * (1 - t);
        if (tongue.timer >= tongue.retractDuration) {
          attacks.splice(i, 1);
        }
      }
    }
  }
}
