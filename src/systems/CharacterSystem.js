import { CharacterNPC } from '../entities/CharacterNPC.js';
import { CHARACTER_TYPES } from '../data/characters.js';
import { TRAINING_TECHNIQUES } from '../data/items.js';
import { GRID, NPC_INTERACTION_RANGE, GAME_STATES } from '../game/GameConfig.js';
import { BackgroundObject } from '../entities/BackgroundObject.js';
import { Captive } from '../entities/Captive.js';
import { isCellProtected } from './roomFeatures.js';
import { tagInteriorPlane } from './PlaneSystem.js';
import { StatusEffectSystem } from './StatusEffectSystem.js';
import { isInputCaptured } from '../game/inputCapture.js';
import { aimFacingAtNearestEnemy, keenStrikeReach } from './KeenAim.js';
import { stashEquipment, loadEquipment } from './characterLoadout.js';
import { tryPoleVault } from './PoleVault.js';

export class CharacterSystem {
  constructor(game) {
    this.game = game;
    // Keys held last frame while Frozen — so a struggle counts fresh presses
    // (mashing), not a key held down.
    this._lockHeldKeys = new Set();
  }

  // A character died but others remain: clear the dead character's gear,
  // swap to the pending next character, and return to REST. Moved out of
  // main.js (Code Placement Procedure) — character-death handoff is this
  // system's domain, not orchestration.
  respawnNextCharacter() {
    const game = this.game;
    game.characterDeathPending = false;
    const next = game.pendingNextCharacter;
    game.pendingNextCharacter = null;
    game.characterDeathName = '';
    this.switchToCharacterAtRest(next);
  }

  // Shared character-handoff: wipe the departing character's gear, swap to
  // `nextType`, and return to REST. Used by respawnNextCharacter above and
  // by the gray-zone mist-out (GrayZoneSystem), which loses a character
  // without killing them.
  switchToCharacterAtRest(nextType) {
    const game = this.game;
    game.gameOverWaitingForSpace = false;
    game._resetEnvironmentalEffects();

    // Clear active items lost with the departing character
    game.inventorySystem.restQuickSlots = [null, null, null];
    game.inventorySystem.restActiveSlotIndex = 0;
    game.inventorySystem.equippedArmor = null;
    game.inventorySystem.equippedConsumables = Array(game.inventorySystem.maxConsumableSlots).fill(null);
    // Discard EXPLORE-deferred chest deposits — displaced weapons go with the character
    game.inventorySystem.pendingChestDeposits = [];

    game.activeCharacterType = nextType;
    console.log(`🔄 Continuing as ${CHARACTER_TYPES[game.activeCharacterType].name}`);

    // The departing character's ingredients need no rescuing — the pile is on
    // InventorySystem and is shared across characters, so a swap leaves it
    // untouched. Full game over (_resetRunToRest) still wipes it, preserving
    // the true-roguelike full reset.
    if (game.player) {
      game.player.reset();
    }
    // No audioSystem.play() here — enterRestState() (triggered by the
    // transition below) is mode-aware and always loads the correct zone/REST
    // track itself. Calling play() first used to resume whatever buffers were
    // still loaded (e.g. a maze/hut interior override, since the death path's
    // audioSystem.stop() only halts playback, it doesn't clear the loaded
    // buffers) as if they were legitimate music, which then tricked
    // enterRestState()'s switchRestMusic() into treating them as "already
    // playing" and cross-fading at their loop boundary instead of cutting
    // over immediately — the maze track would audibly keep playing past
    // death until its loop finished. Bug #184.
    game.stateMachine.transition(GAME_STATES.REST);
  }

  spawnCaptive(characterType) {
    const game = this.game;
    if (!game.currentRoom) return null;

    const centerX = GRID.WIDTH / 2;
    const centerY = GRID.HEIGHT / 2;

    // Fast path: two tries to find a clear cell — open in the collision map,
    // outside every protected structure region (hut/maze/dungeon footprints,
    // well ring, fountain pool, ravine band, wall blocks), and away from the
    // player.
    for (let attempt = 0; attempt < 2; attempt++) {
      // Random position in the center area of the room
      const spawnX = centerX + (Math.random() - 0.5) * GRID.WIDTH * 0.5;
      const spawnY = centerY + (Math.random() - 0.5) * GRID.HEIGHT * 0.5;
      const gridX = Math.floor(spawnX / GRID.CELL_SIZE);
      const gridY = Math.floor(spawnY / GRID.CELL_SIZE);

      if (gridX <= 0 || gridX >= GRID.COLS - 1 || gridY <= 0 || gridY >= GRID.ROWS - 1) continue;
      if (game.currentRoom.collisionMap[gridY][gridX]) continue;
      if (isCellProtected(game.currentRoom, gridX, gridY)) continue;

      const distToPlayer = Math.hypot(
        game.player.position.x - spawnX,
        game.player.position.y - spawnY
      );
      if (distToPlayer <= GRID.CELL_SIZE * 5) continue;

      return new Captive(characterType, spawnX, spawnY);
    }

    // Guaranteed fallback: the miniboss reward must appear this room, since
    // zone-cleared tracking is keyed off a captive actually spawning. Scan
    // every interior cell for open, unprotected floor and place the captive
    // at whichever one is farthest from the player — covers the cluttered
    // small-room case where two random tries can both whiff.
    let bestCell = null;
    let bestDist = -1;
    for (let gridY = 1; gridY < GRID.ROWS - 1; gridY++) {
      for (let gridX = 1; gridX < GRID.COLS - 1; gridX++) {
        if (game.currentRoom.collisionMap[gridY][gridX]) continue;
        if (isCellProtected(game.currentRoom, gridX, gridY)) continue;

        const cellX = gridX * GRID.CELL_SIZE + GRID.CELL_SIZE / 2;
        const cellY = gridY * GRID.CELL_SIZE + GRID.CELL_SIZE / 2;
        const distToPlayer = Math.hypot(game.player.position.x - cellX, game.player.position.y - cellY);
        if (distToPlayer > bestDist) {
          bestDist = distToPlayer;
          bestCell = { x: cellX, y: cellY };
        }
      }
    }

    if (bestCell) {
      console.log('[Captive] fallback: placed at farthest open cell after random tries failed');
      return new Captive(characterType, bestCell.x, bestCell.y);
    }

    console.log('[Captive] no open cell found anywhere in room — could not spawn captive');
    return null;
  }

  // REST: swap with the first character NPC within interaction range.
  // Returns true if a swap happened.
  trySwapWithNearbyNPC() {
    const game = this.game;
    for (const npc of game.characterNPCs) {
      const dist = Math.hypot(
        game.player.position.x - npc.position.x,
        game.player.position.y - npc.position.y
      );
      if (dist < NPC_INTERACTION_RANGE) {
        this.swapWithCharacter(npc.characterType);
        return true;
      }
    }
    return false;
  }

  // ── Player weapon-action helpers ─────────────────────────────────────────
  // Staff block stance + swing-completion effects (lightning, lava) for
  // data-flagged weapons. Live here with the other player-action helpers
  // (applyGreenDamageModifier, triggerGreenActionCooldown).

  // Basic staves and the fishing pole gain a hold-to-block stance.
  // Excludes gem staves (weaponType: WAND), which keep their charge mechanic.
  isBlockingStaff(weapon) {
    return !!weapon
      && weapon.data?.weaponType === 'MELEE'
      && weapon.data?.weaponSubtype === 'staff';
  }

  // Exit staff block: push enemies on/adjacent to the player radially outward
  // by ~1 cell, and trigger an 8-direction visual sweep.
  releaseStaffBlock(player) {
    if (!player.isStaffBlocking) return;
    player.isStaffBlocking = false;

    const room = this.game.currentRoom;
    if (room && room.enemies) {
      const C = GRID.CELL_SIZE;
      const px = player.position.x + C / 2;
      const py = player.position.y + C / 2;
      // "On or adjacent" → up to ~2 cells from center (covers diagonals).
      const radius = C * 2;
      const radiusSq = radius * radius;
      const force = 250; // ~1 cell of knockback at default 0.2s duration

      for (const enemy of room.enemies) {
        if (!enemy || enemy.dead) continue;
        const ex = enemy.position.x + (enemy.width || C) / 2;
        const ey = enemy.position.y + (enemy.height || C) / 2;
        const dx = ex - px;
        const dy = ey - py;
        if (dx * dx + dy * dy > radiusSq) continue;
        this.game.physicsSystem.applyKnockback(enemy, px, py, force);
      }
    }

    this._spawnStaffBlockSweepVisual(player);
  }

  // 8-direction melee sweep — fires sequentially around the player to telegraph
  // the block release. Damage is per-weapon via data.blockReleaseDamage (default 0).
  _spawnStaffBlockSweepVisual(player) {
    if (!this.game.combatSystem) return;
    const C = GRID.CELL_SIZE;
    const range = C * 1.25;
    const stepDelay = 0.025;
    const meleeChar = player.heldItem?.data?.meleeChar || '|';
    const color = player.heldItem?.color || '#ffffff';
    const sweepDamage = player.heldItem?.data?.blockReleaseDamage || 0;

    for (let i = 0; i < 8; i++) {
      const angle = (Math.PI * 2 / 8) * i - Math.PI / 2; // start up, go clockwise
      const relX = Math.cos(angle) * range;
      const relY = Math.sin(angle) * range;
      this.game.combatSystem.addAttack({
        type: 'melee',
        char: meleeChar,
        drawAngle: angle + Math.PI / 2,
        position: { x: player.position.x + relX, y: player.position.y + relY },
        relX, relY,
        width: C,
        height: C,
        damage: sweepDamage,
        duration: 0.08,
        delay: i * stepDelay,
        color,
        owner: player,
        shooterPlane: player.plane
      });
    }
  }

  // Schedule a delayed lightning strike one cell beyond the weapon's tip.
  // Called when a weapon flagged with `callsLightning` completes its swing.
  // Strike point is locked at swing time — the player can dodge out of the zone
  // during the warning, which is the skill expression.
  callLightningStrike(player, weaponData) {
    const C = GRID.CELL_SIZE;
    const reach = (weaponData.range || 20) + C;
    const px = player.position.x + C / 2;
    const py = player.position.y + C / 2;
    // ?? (not ||) — facing.y is legitimately 0 when facing purely left/right;
    // the -1 default should only apply when facing itself is missing (#280).
    const fx = player.facing?.x ?? 0;
    const fy = player.facing?.y ?? -1;
    const flen = Math.sqrt(fx * fx + fy * fy) || 1;
    const x = px + (fx / flen) * reach;
    const y = py + (fy / flen) * reach;
    this.game.lightningStrikeSystem.scheduleStrike({
      x, y,
      radius: weaponData.lightningRadius ?? (C * 1.2),
      delay: weaponData.lightningDelay ?? 0.6,
      damage: weaponData.lightningDamage ?? 4,
      hitsPlayer: false,
      plane: player.plane ?? 0,
      electricityCharge: weaponData.electricityCharge,
      source: 'lightning_sword'
    });
  }

  // Spawn lava background tiles in a 15° forward arc from the player on grid.
  // Called when a weapon flagged with `placesLava` completes its swing.
  // Routes through the active layer so lava lands in the hut/dungeon the player
  // is standing in, not the surface (bounds + collision follow the layer too).
  spawnLavaSweep(player) {
    const game = this.game;
    const objects = game._activeBackgroundObjects();
    const { cols, rows, collisionMap } = game.activeGridBounds();
    if (!objects) return;
    const C = GRID.CELL_SIZE;
    const baseAngle = Math.atan2(player.facing.y, player.facing.x);
    const sweepHalf = (Math.PI / 12) / 2;  // 15° total → ±7.5°
    const playerCx = player.position.x + C / 2;
    const playerCy = player.position.y + C / 2;

    const samples = [
      { angle: baseAngle - sweepHalf, dist: C * 2 },
      { angle: baseAngle,             dist: C * 2 },
      { angle: baseAngle + sweepHalf, dist: C * 2 },
      { angle: baseAngle,             dist: C * 3 }
    ];

    for (const s of samples) {
      const tx = playerCx + Math.cos(s.angle) * s.dist;
      const ty = playerCy + Math.sin(s.angle) * s.dist;
      const col = Math.floor(tx / C);
      const row = Math.floor(ty / C);
      if (col < 1 || col >= cols - 1 || row < 1 || row >= rows - 1) continue;
      if (collisionMap?.[row]?.[col]) continue;

      const x = col * C;
      const y = row * C;
      const occupied = objects.some(obj =>
        !obj.destroyed &&
        Math.abs(obj.position.x - x) < C / 2 &&
        Math.abs(obj.position.y - y) < C / 2
      );
      if (occupied) continue;

      objects.push(BackgroundObject.createVariant('lava', x, y));
    }
  }

  // Per-frame dodge dispatch for the active character: Green Ranger
  // continuous roll, or the standard dodge roll.
  updateDodge(deltaTime) {
    const game = this.game;
    const player = game.player;

    // A zap/stun lock that landed since last frame knocks the held item loose.
    StatusEffectSystem.applyPlayerDisarm(game);

    // Locked (Frozen/zapped/stunned): no roll at all — every fresh key press
    // is a struggle instead, and an arrow (dodge-roll) press chips hardest.
    if (player.isLocked()) {
      this._struggleLock(player);
      return;
    }
    this._lockHeldKeys.clear();

    // Handle dodge rolling (continuous direction updates, supports diagonals and curving)
    // Disabled while Rusalka's charm is active or while polymorphed (frog form has no roll)
    const rusalkaActive = game.fishingSystem?.rusalka?.alive === true;
    const dodgeDirection = (rusalkaActive || player.polymorphed || player.hookedByMimic || player.hookedByWhip) ? { x: 0, y: 0 } : game.getDodgeRollDirection();

    if (game.activeCharacterType === 'green') {
      // Green ranger: hold arrow keys for a continuous slide (no individual roll timers)
      if (dodgeDirection.x !== 0 || dodgeDirection.y !== 0) {
        const attackingWithSpaceGreen = game.keys.space && player.heldItem && player.heldItem.windupActive;
        if (player.actionCooldown <= 0 && !player.isGooey() && !attackingWithSpaceGreen) {
          if (!player.continuousRollActive) {
            // Start the continuous roll
            player.continuousRollActive = true;
            // Brief iframes at roll start (standard dodge amount)
            player.invulnerabilityTimer = player.dodgeRoll.duration + 0.5;
            // Cancel active melee windup
            if (player.heldItem && player.heldItem.windupActive) {
              player.heldItem.windupActive = false;
              player.heldItem.windupTimer = 0;
              player.heldItem.pendingPlayer = null;
            }
            // Cancel bow charging
            if (player.heldItem && player.heldItem.isCharging) {
              game.audioSystem.stopSFXByName('charge_bow');
              game.audioSystem.stopSFXByName('wand_charge');
              player.heldItem.isCharging = false;
              player.heldItem.chargeTime = 0;
              player.heldItem.chargingPlayer = null;
            }
            // Break any sapping enemies
            const rollEnemies = game._activeEnemies();
            for (const enemy of rollEnemies) {
              if (enemy.sapping && enemy.sappingTarget === player) {
                enemy.breakSapping(300);
              }
            }
            game.audioSystem.playSFX('roll');
          }
          // Drain charge while rolling (2 units per second, matching actionCooldownMax scale)
          player.rollCharge -= deltaTime * 1.75;
          if (player.rollCharge <= 0) {
            // Charge depleted — force end roll with full cooldown
            player.rollCharge = 0;
            player.continuousRollActive = false;
            player.actionCooldown = player.actionCooldownMax;
            player.velocity.vx = 0;
            player.velocity.vy = 0;
          } else {
            // Update player facing direction toward roll direction
            if (dodgeDirection.x !== 0) player.facing.x = Math.sign(dodgeDirection.x);
            if (dodgeDirection.y !== 0) player.facing.y = Math.sign(dodgeDirection.y);
            // Set velocity directly each frame (sustained movement)
            const rollSpeed = player.getRollSpeed();
            player.velocity.vx = dodgeDirection.x * rollSpeed;
            player.velocity.vy = dodgeDirection.y * rollSpeed;
            player.acceleration.ax = 0;
            player.acceleration.ay = 0;
          }
        }
      } else if (player.continuousRollActive) {
        // Arrow keys released — cooldown proportional to charge used (longer roll = longer cooldown)
        const chargeUsed = player.actionCooldownMax - player.rollCharge;
        player.continuousRollActive = false;
        player.actionCooldown = chargeUsed;
        player.velocity.vx = 0;
        player.velocity.vy = 0;
      } else if (player.actionCooldown <= 0 && player.rollCharge < player.actionCooldownMax) {
        // Cooldown finished — restore charge to full
        player.rollCharge = player.actionCooldownMax;
      }
    } else {
      // Standard dodge roll for all other characters
      if (dodgeDirection.x !== 0 || dodgeDirection.y !== 0) {
        if (!player.dodgeRoll.active && player.dodgeRoll.cooldownTimer <= 0 && !game.keys.space) {
          // Shadow Robe: dodge key triggers bat form (speed boost + char change) instead of rolling
          if (player.batTransform && player.batFormTimer <= 0) {
            player.batFormTimer = 1.2;
            player.char = '^';
            player.speedBoostTimer = 1.2;
            player.speedBoostMultiplier = 2.5;
          }

          // maze returns [] (ghosts aren't enemies); hut/dungeon returns activeFloor.enemies; surface returns currentRoom.enemies
          const enemies = game._activeEnemies();
          player.dodgeRoll.queuedAttack = false;
          const rollStarted = player.batTransform
            ? false // bat form replaces the roll
            : player.startDodgeRoll(dodgeDirection, enemies);

          if (rollStarted) {
            // Cancel an in-progress bow charge so the player can't fire on roll exit
            if (player.heldItem?.isCharging && (player.heldItem.data?.weaponType === 'BOW' || player.heldItem.data?.requiresCharge)) {
              player.heldItem.cancelChargeAndReload();
              game.audioSystem.stopSFXByName('charge_bow');
            }

            // Whirlwind Cape: transform roll into a spinning dash — covers distance, dizzies nearby enemies, no iframes
            if (player.whirlwindCape) {
              player.dodgeRoll.type = 'whirlwind';
              player.dodgeRoll.speed *= 1.5;
              const spinRadius = GRID.CELL_SIZE * 2;
              const px = player.position.x + GRID.CELL_SIZE / 2;
              const py = player.position.y + GRID.CELL_SIZE / 2;
              for (const enemy of enemies) {
                const ex = enemy.position.x + GRID.CELL_SIZE / 2;
                const ey = enemy.position.y + GRID.CELL_SIZE / 2;
                if (Math.hypot(ex - px, ey - py) < spinRadius) {
                  enemy.applyStatusEffect('dizzy', 4.0);
                }
              }
            }
            game.audioSystem.playSFX('roll');
            // Resolve yellow mage blink (deferred for collision checking + trail)
            if (player.pendingBlink) {
              game.warpSystem.resolveBlinkTeleport(player.pendingBlink);
              player.pendingBlink = null;
            }
            // A spear thrust still out turns a roll the same way into a Pole Vault.
            tryPoleVault(game, player, player.dodgeRoll.direction);
          }

          // Show red X if dodge roll blocked by goo (with cooldown to prevent spam)
          if (!rollStarted && player.isGooey() && game.dodgeBlockedFeedbackTimer <= 0) {
            game.particles.push(tagInteriorPlane(game, {
              x: player.position.x + GRID.CELL_SIZE / 2,
              y: player.position.y - 10,
              vx: 0,
              vy: -30,
              life: 0.5,
              maxLife: 0.5,
              char: 'X',
              color: '#ff0000',
              isImpact: true
            }));
            game.dodgeBlockedFeedbackTimer = 0.5;
          }
        } else if (player.dodgeRoll.active) {
          // Update direction during active roll (allows curving)
          player.dodgeRoll.direction = dodgeDirection;
        }
      }
    }
  }

  // Dagger roll auto-attack: fires immediately on roll completion, bypassing cooldown and windup.
  // Direction from current WASD input, falling back to player facing.
  _struggleLock(player) {
    const game = this.game;
    const held = new Set();
    for (const [key, down] of Object.entries(game.keys)) if (down) held.add(key);
    for (const [key, down] of Object.entries(game.arrowKeys ?? {})) if (down) held.add(key);
    if (!isInputCaptured(game)) {
      for (const key of held) {
        if (this._lockHeldKeys.has(key)) continue;
        StatusEffectSystem.struggleLock(player, key.startsWith('Arrow'));
      }
    }
    this._lockHeldKeys = held;
  }

  triggerDaggerRollAttack() {
    const game = this.game;
    const player = game.player;
    if (!player.dodgeRoll.daggerAutoFire) return;
    player.dodgeRoll.daggerAutoFire = false;
    const daggerItem = player.quickSlots?.[player.activeSlotIndex];
    if (daggerItem?.data?.weaponSubtype !== 'dagger') return;
    const dx = (game.keys.d ? 1 : 0) - (game.keys.a ? 1 : 0);
    const dy = (game.keys.s ? 1 : 0) - (game.keys.w ? 1 : 0);
    if (dx !== 0 || dy !== 0) {
      player.facing.x = dx;
      player.facing.y = dy;
    }
    // A keen dagger's roll-stab still finds the nearest enemy in reach.
    if (daggerItem.data.keenAim) aimFacingAtNearestEnemy(player, game._activeEnemies(), keenStrikeReach(daggerItem));
    daggerItem.windupActive = false;
    daggerItem.windupTimer = 0;
    daggerItem.cooldownTimer = 0;
    const rollAutoAttack = daggerItem.executeAttack(player);
    if (rollAutoAttack) {
      const attacks = Array.isArray(rollAutoAttack) ? rollAutoAttack : [rollAutoAttack];
      const enemies = game._activeEnemies();
      for (const atk of attacks) {
        game.combatSystem.createAttack(game.applyGreenDamageModifier(atk), enemies);
      }
      game.playWeaponAttackSFX(daggerItem);
      daggerItem.cooldownTimer = daggerItem.data.recovery || daggerItem.data.cooldown || 0.5;
    }
  }

  // Fire one attack queued during a dodge roll (non-dagger weapons).
  triggerQueuedRollAttack() {
    const game = this.game;
    const player = game.player;
    if (!player.dodgeRoll.justEnded || !player.dodgeRoll.queuedAttack) return;
    player.dodgeRoll.queuedAttack = false;
    const weapon = player.heldItem;
    if (!weapon || weapon.data.weaponSubtype === 'dagger' || weapon.data.weaponType === 'BOW' || weapon.data.weaponType === 'UTILITY' || !player.canAttack()) return;
    const attack = player.useHeldItem();
    if (attack) {
      game.combatSystem.createAttack(game.applyGreenDamageModifier(attack), game._activeEnemies());
      game.triggerGreenActionCooldown();
      game._emitSoundEvent();
    }
  }

  applyCharacterType(type) {
    const game = this.game;
    const charData = CHARACTER_TYPES[type];
    if (!charData) {
      console.error(`Unknown character type: ${type}`);
      return;
    }

    // Save the outgoing character's magic-meter state so it's restored on a
    // future swap-back.
    const inv = game.inventorySystem;
    const prevType = inv._activeCharacterType;
    if (prevType && game.player?.magicMeter) {
      const prevEntry = inv.characterInventories[prevType];
      if (prevEntry) {
        const m = game.player.magicMeter;
        prevEntry.manaState = {
          slots: [...(m.slots || [])],
          current: m.current,
          max: m.max,
          freeSlotGranted: !!m.freeSlotGranted,
          // The Mana Potion slot is one per character: the next character
          // drinking one still gets theirs.
          potionSlotGranted: !!m.potionSlotGranted
        };
      }
    }

    // Armor and consumables are per-character too: park the outgoing
    // character's, hand over the incoming one's. Before the mana restore
    // below, whose eviction reads the incoming consumable slots.
    const swapping = prevType !== type;
    if (swapping) stashEquipment(inv, inv.characterInventories[prevType]);

    // Switch inventory system to this character's stored inventory
    inv.setActiveCharacter(type);
    if (swapping) loadEquipment(inv, inv.characterInventories[type]);

    // Restore (or initialize) this character's saved magic-meter state.
    if (game.player?.magicMeter) {
      const saved = inv.characterInventories[type]?.manaState;
      const m = game.player.magicMeter;
      if (saved) {
        m.slots = [...saved.slots];
        m.current = saved.current;
        m.freeSlotGranted = !!saved.freeSlotGranted;
        m.potionSlotGranted = !!saved.potionSlotGranted;
      } else {
        m.slots = [];
        m.current = 0;
        m.freeSlotGranted = false;
        m.potionSlotGranted = false;
      }
      game.magicSystem.recalcMax(m);
      // Counted against the incoming type: applyCharacterTypeTo below is what
      // re-types the body, so player.characterType is still the old one here.
      m.active = game.magicSystem.effectiveManaSlotCount(game.player, type) > 0;
      // A restored meter can claim an index that still holds a real consumable
      // (the incoming character's parked equipment predates its meter state).
      // Evict it back to the shared consumableInventory rather than leaving it
      // invisibly stuck under the meter's slot fill.
      game.magicSystem.evictReservedConsumables(game.player);
    }

    this.applyCharacterTypeTo(game.player, type);
  }

  // The body half of applyCharacterType: everything a character type writes
  // onto one Player instance (color, dodge roll, affinities, per-type combat
  // fields). Split out so a body that is not game.player can wear a character
  // too — applyCharacterType above keeps the inventory/mana switching, which
  // is global and only ever belongs to game.player.
  applyCharacterTypeTo(body, type) {
    const game = this.game;
    const charData = CHARACTER_TYPES[type];
    if (!charData || !body) return;

    // Update player visual
    body.color = charData.color;
    body.baseColor = charData.color;

    // Update dodge roll properties
    body.dodgeRoll.type = charData.rollType;
    body.dodgeRoll.duration = charData.rollDuration;
    body.dodgeRoll.cooldown = charData.rollCooldown;
    body.dodgeRoll.speed = charData.rollSpeed;
    body.dodgeRoll.hideDuration = charData.hideDuration || 0;
    // Roll i-frames are per character: `rollInvulnerable: false` means the roll
    // grants none at all (Green Ranger's sprint); `rollIframes` is the brief
    // window that persists after the roll ends.
    body.dodgeRoll.iframes = charData.rollInvulnerable !== false;
    body.dodgeRoll.postRollIframes = charData.rollIframes ?? 0.1;
    body.dodgeRoll.dizzyAfter = charData.rollDizzy ?? 0;
    if (charData.blinkDistance) {
      body.dodgeRoll.distance = charData.blinkDistance;
    }

    // Apply weapon affinities
    body.weaponAffinities = charData.weaponAffinities;

    // Point the player at this character's Weapons Master training map. It's a
    // live reference, so training earned mid-run is visible to Item.js without
    // a second write — but the player is rebuilt across rooms and swaps, which
    // is why it is re-pointed here rather than copied once.
    body.trainedWeapons =
      game.inventorySystem?.characterInventories?.[type]?.trainedWeapons || null;

    // Store character type and apply character-specific properties
    body.characterType = type;
    body.actionCooldownMax = charData.actionCooldownMax || 0;
    body.greenIdleDamageBonus = charData.idleDamageBonus || 0;
    body.greenCombatDamagePenalty = charData.combatDamagePenalty || 0;
    body.backstabMultiplier = charData.backstabMultiplier || 1.0;
    // Reset green ranger state when switching characters
    body.actionCooldown = 0;
    body.rollCharge = body.actionCooldownMax; // Start with full charge
    body.continuousRollActive = false;

    // Yellow Mage gets one free mana slot the moment they become Yellow.
    // Further mana slots (Yellow or otherwise) are earned via the well/hut
    // upgrade path, one slot at a time — same mechanism for every character.
    if (type === 'yellow') {
      game.magicSystem?.grantYellowFreeManaSlot(body);
    }
  }

  // Snapshot the player's magic meter (+ owning character) before a room
  // transition reconstructs the Player instance, so mana can persist across
  // rooms for the SAME character without clobbering a swap that happened
  // first (applyCharacterType already restores the correct per-character
  // meter — this snapshot must not paste over it).
  captureMagicMeterForRoomTransition(player) {
    if (!player?.magicMeter) return null;
    return { characterType: player.characterType, meter: { ...player.magicMeter } };
  }

  // Restore a captured meter only if the active character hasn't changed
  // since capture — otherwise applyCharacterType's own restore stands.
  restoreMagicMeterForRoomTransition(player, captured, activeCharacterType) {
    if (!captured || captured.characterType !== activeCharacterType) return;
    player.magicMeter = captured.meter;
  }

  applyGreenDamageModifier(attack) {
    const game = this.game;
    if (!attack) return attack;
    // Green idle/combat bonus is applied at hit time (per-enemy) in CombatSystem.
    // Only bake in shrine/consumable damage bonuses here.
    let baseBonus = 0;
    if (game.player.damageBonusTimer > 0) baseBonus += game.player.damageBonusAmount;
    if (game.player.wellDamageBlessed) baseBonus += 1; // red well coin blessing

    // Frog Coin passive: +1 damage per coin equipped in a consumable slot,
    // while the player is wet (its requiresWet). The one consumable exempt
    // from the no-stacking rule — five coins equipped is +5 when wet.
    const frogCoins = game.player.equippedConsumables?.filter(c => c?.data?.char === '⊚') ?? [];
    for (const frogCoin of frogCoins) {
      if (!frogCoin.data.requiresWet || game.player.isWet()) baseBonus += frogCoin.data.damageBonus;
    }

    // Weapons Master training — permanent per-character, per-weapon-category bonus.
    // Categories with a training technique (TRAINING_TECHNIQUES) traded the
    // damage bonus away for that technique, so they add nothing here.
    const trained = game.inventorySystem?.characterInventories?.[game.activeCharacterType]?.trainedWeapons;
    const trainingBonus = (a) => {
      const category = a?.weaponSubtype || a?.weaponType;
      if (!trained || !category || !trained[category]) return 0;
      return TRAINING_TECHNIQUES[category] ? 0 : 1;
    };

    // An authored damage of 0 is a utility hit (Flag wave, fizzled spark) —
    // no bonus or floor turns it into a damaging one.
    const withBonus = (a, bonus) => (a.damage === 0 ? a
      : { ...a, damage: Math.max(1, (a.damage || 1) + bonus) });
    if (Array.isArray(attack)) {
      return attack.map(a => withBonus(a, baseBonus + trainingBonus(a)));
    }
    const bonus = baseBonus + trainingBonus(attack);
    if (bonus === 0) return attack;
    return withBonus(attack, bonus);
  }

  triggerGreenActionCooldown() {
    const game = this.game;
    if (game.activeCharacterType === 'green' && game.player) {
      // Guns and bows fire on their own weapon cooldown — they don't consume the ranger's action stamina
      const heldItem = game.player.heldItem;
      if (heldItem && (heldItem.data.weaponType === 'GUN' || heldItem.data.weaponType === 'BOW')) return;
      game.player.actionCooldown = game.player.actionCooldownMax;
    }
  }

  handleAutoAttack() {
    const game = this.game;
    const player = game.player;
    const weapon = player.heldItem;
    if (!game.keys.space || !game.attackSequenceActive || !weapon) return;
    if (weapon.data.weaponType === 'BOW' || weapon.data.weaponType === 'WAND' ||
        weapon.data.weaponType === 'UTILITY' || weapon.data.chargeHammer) return;
    if (player.fishingLocked || game.menuOpen || game.bridgeMenuOpen || game.errandSystem.isMenuOpen() || game.cheatMenu.isOpen) return;

    if (player.dodgeRoll.active) {
      player.dodgeRoll.queuedAttack = true;
    } else if (player.canAttack()) {
      if (this.isBlockingStaff(weapon) && player.staffSwingHasFired && weapon.canUse()) {
        if (!player.isStaffBlocking) player.isStaffBlocking = true;
      } else if (this.isBlockingStaff(weapon) && player.isStaffBlocking) {
        // sustained block — suppress swing
      } else {
        const attack = player.useHeldItem();
        if (attack) {
          const enemies = game._activeEnemies();
          const succeeded = game.combatSystem.createAttack(this.applyGreenDamageModifier(attack), enemies);
          if (weapon.data.weaponType === 'WAND' && succeeded === false) {
            weapon.cooldownTimer = 0;
          } else {
            this.triggerGreenActionCooldown();
            game._emitSoundEvent();
          }
        }
      }
    }
  }

  spawnCharacterNPCs() {
    const game = this.game;
    // Clear existing NPCs
    game.characterNPCs = [];

    const availableCharacters = game.unlockedCharacters.filter(
      type => type !== game.activeCharacterType &&
        !game.deadCharacters.includes(type) &&
        !game.lostCharacters.includes(type)
    );

    const centerX = GRID.WIDTH / 2;
    const baseY = GRID.CELL_SIZE * 8;
    const spacing = GRID.CELL_SIZE * 4;

    availableCharacters.forEach((type, index) => {
      const offsetX = (index - (availableCharacters.length - 1) / 2) * spacing;
      const npc = new CharacterNPC(type, centerX + offsetX, baseY);
      game.characterNPCs.push(npc);
    });
  }

  swapWithCharacter(newType) {
    const game = this.game;
    if (newType === game.activeCharacterType) {
      return;
    }

    if (game.deadCharacters.includes(newType)) {
      game.showPickupMessage('This character has already died');
      return;
    }

    // Each character keeps its own quick-slot loadout. Save the outgoing
    // character's slots into its own entry, then hand the player the incoming
    // character's slots (including its Starter Weapon on first use this run)
    // — without this the new character kept holding the old one's weapons
    // and the next REST save wrote them into the wrong entry.
    // (Written directly rather than via saveRestLoadout, which also flushes
    // EXPLORE-deferred chest deposits — a cheat-menu swap mid-EXPLORE must
    // not bank those early.)
    const inv = game.inventorySystem;
    const outgoing = inv.characterInventories[inv._activeCharacterType];
    if (outgoing) {
      outgoing.quickSlots.splice(0, outgoing.quickSlots.length, ...game.player.quickSlots);
      outgoing.activeSlotIndex = game.player.activeSlotIndex;
    }

    game.activeCharacterType = newType;
    game.applyCharacterType(newType);

    game.player.quickSlots = [...inv.restQuickSlots];
    game.player.activeSlotIndex = inv.restActiveSlotIndex;

    game.spawnCharacterNPCs();

    // REST's slot glyphs draw onto the cached background layer, which only
    // clears when marked dirty — without this the incoming loadout is drawn
    // over the outgoing one.
    game.renderer.markBackgroundDirty();
    game.updateUI();

    const charData = CHARACTER_TYPES[newType];
    game.showPickupMessage(charData.name);
  }
}
