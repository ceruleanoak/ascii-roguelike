import { CharacterNPC } from '../entities/CharacterNPC.js';
import { CHARACTER_TYPES } from '../data/characters.js';
import { GRID, INTERACTION_RANGE } from '../game/GameConfig.js';
import { BackgroundObject } from '../entities/BackgroundObject.js';
import { Captive } from '../entities/Captive.js';
import { isCellProtected } from './roomFeatures.js';

export class CharacterSystem {
  constructor(game) {
    this.game = game;
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
      if (dist < INTERACTION_RANGE) {
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
    const fx = player.facing?.x || 0;
    const fy = player.facing?.y || -1;
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

  // Per-frame dodge dispatch for the active character: Shark Mask water
  // dive/emerge, Green Ranger continuous roll, or the standard dodge roll.
  // Returns { skipFrame: true } when the shark dive drove the player directly
  // this frame — caller must skip the rest of updatePlayerMechanics (existing
  // behavior: no movement dispatch, no player.update, no held-item tick).
  updateDodge(deltaTime) {
    const game = this.game;
    const player = game.player;

    // Handle dodge rolling (continuous direction updates, supports diagonals and curving)
    // Disabled while Rusalka's charm is active or while polymorphed (frog form has no roll)
    const rusalkaActive = game.fishingSystem?.rusalka?.alive === true;
    let dodgeDirection = (rusalkaActive || player.polymorphed || player.hookedByMimic) ? { x: 0, y: 0 } : game.getDodgeRollDirection();

    // Shark Mask water dive/emerge — overrides standard dodge for ALL characters
    // (including Green Ranger continuous-roll). Edge detection on dodgeDirection
    // ensures a held arrow doesn't immediately auto-emerge after diving.
    if (player.sharkMask && player.inLiquid && !game.keys.space && !player.isGooey()) {
      const hasDodgeInput = (dodgeDirection.x !== 0 || dodgeDirection.y !== 0);
      const dodgeInputEdge = hasDodgeInput && !game._sharkLastDodgeInput;
      game._sharkLastDodgeInput = hasDodgeInput;

      if (dodgeInputEdge && player.diving) {
        // Re-press while diving → emerge burst
        this._sharkEmergeAttack(dodgeDirection);
      } else if (dodgeInputEdge && !player.diving &&
                 player.dodgeRoll.cooldownTimer <= 0 &&
                 !player.dodgeRoll.active &&
                 !player.continuousRollActive) {
        player.startSharkDive(dodgeDirection);
        game.audioSystem.playSFX('roll');
      }

      // While diving, drive the player ourselves and skip the character-class
      // dispatch entirely (otherwise Green Ranger's slide would override us).
      if (player.diving) {
        if (hasDodgeInput) {
          const baseMax = (player.heldItem ? 110 : 165) * (1 + player.speedBoost);
          player.velocity.vx = dodgeDirection.x * baseMax;
          player.velocity.vy = dodgeDirection.y * baseMax;
          player.acceleration.ax = 0;
          player.acceleration.ay = 0;
        }
        return { skipFrame: true }; // skip dodge/movement dispatch this frame
      }
      // Shark Mask equipped + in water but not diving (e.g. dive ended while
      // arrows still held, or cooldown blocks entry). Zero out dodgeDirection
      // so the standard/green-ranger dodge handlers below cannot fire — the
      // dive is the only valid water dodge response when wearing the mask.
      dodgeDirection = { x: 0, y: 0 };
    } else {
      game._sharkLastDodgeInput = false;
    }

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
            const rollEnemies = game.currentRoom ? game.currentRoom.enemies : [];
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
          }

          // Show red X if dodge roll blocked by goo (with cooldown to prevent spam)
          if (!rollStarted && player.isGooey() && game.dodgeBlockedFeedbackTimer <= 0) {
            game.particles.push({
              x: player.position.x + GRID.CELL_SIZE / 2,
              y: player.position.y - 10,
              vx: 0,
              vy: -30,
              life: 0.5,
              maxLife: 0.5,
              char: 'X',
              color: '#ff0000',
              isImpact: true
            });
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
    daggerItem.windupActive = false;
    daggerItem.windupTimer = 0;
    daggerItem.cooldownTimer = 0;
    const rollAutoAttack = daggerItem.executeAttack(player);
    if (rollAutoAttack) {
      const attacks = Array.isArray(rollAutoAttack) ? rollAutoAttack : [rollAutoAttack];
      const enemies = game.currentRoom ? game.currentRoom.enemies : [];
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
      game.combatSystem.createAttack(game.applyGreenDamageModifier(attack), game.currentRoom ? game.currentRoom.enemies : []);
      game.triggerGreenActionCooldown();
      game._emitSoundEvent();
    }
  }

  // Shark Mask emerge attack: triggered when the player re-rolls during a dive.
  // Deals 3× base melee damage to every enemy within 1.5 cells, ends the dive,
  // produces a big splash via createWetDrop-style particles. Wet enemies eat
  // an additional 2× from any subsequent shock — but we don't apply that here;
  // it's a bonus of subsequent player attacks.
  _sharkEmergeAttack(direction) {
    const game = this.game;
    if (!game.player.diving) return;
    const CS = GRID.CELL_SIZE;
    const radius = CS * 1.5;
    const cx = game.player.position.x + CS / 2;
    const cy = game.player.position.y + CS / 2;
    const enemies = game.currentRoom?.enemies || [];
    const BASE_DAMAGE = 1;
    const EMERGE_DAMAGE = BASE_DAMAGE * 3;
    for (const enemy of enemies) {
      if (enemy.hp <= 0) continue;
      const ex = enemy.position.x + CS / 2;
      const ey = enemy.position.y + CS / 2;
      if (Math.hypot(ex - cx, ey - cy) > radius) continue;
      enemy.takeDamage(EMERGE_DAMAGE);
      game.combatSystem?.createDamageNumber(EMERGE_DAMAGE, enemy.position.x, enemy.position.y, '#88ccff', 1.4, 1.1);
      // Brief stagger so the player can follow up
      enemy.applyStatusEffect?.('freeze', 0.5);
    }
    // Splash particles
    for (let i = 0; i < 14; i++) {
      const ang = Math.random() * Math.PI * 2;
      const speed = 60 + Math.random() * 90;
      game.particles.push({
        x: cx, y: cy,
        vx: Math.cos(ang) * speed,
        vy: Math.sin(ang) * speed,
        life: 0.7, maxLife: 0.7,
        char: Math.random() < 0.5 ? '·' : '▪',
        color: '#88ccff'
      });
    }
    game.audioSystem?.playSFX?.('roll');
    game.player.endSharkDive();
    game.player.dodgeRoll.cooldownTimer = 0.5;
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
          freeSlotGranted: !!m.freeSlotGranted
        };
      }
    }

    // Switch inventory system to this character's banked inventory
    inv.setActiveCharacter(type);

    // Restore (or initialize) this character's saved magic-meter state.
    if (game.player?.magicMeter) {
      const saved = inv.characterInventories[type]?.manaState;
      const m = game.player.magicMeter;
      if (saved) {
        m.slots = [...saved.slots];
        m.current = saved.current;
        m.freeSlotGranted = !!saved.freeSlotGranted;
      } else {
        m.slots = [];
        m.current = 0;
        m.freeSlotGranted = false;
      }
      game.magicSystem.recalcMax(m);
      m.active = game.magicSystem.effectiveManaSlotCount(game.player) > 0;
    }

    // Update player visual
    game.player.color = charData.color;
    game.player.baseColor = charData.color;

    // Update dodge roll properties
    game.player.dodgeRoll.type = charData.rollType;
    game.player.dodgeRoll.duration = charData.rollDuration;
    game.player.dodgeRoll.cooldown = charData.rollCooldown;
    game.player.dodgeRoll.speed = charData.rollSpeed;
    game.player.dodgeRoll.hideDuration = charData.hideDuration || 0;
    if (charData.blinkDistance) {
      game.player.dodgeRoll.distance = charData.blinkDistance;
    }

    // Apply weapon affinities
    game.player.weaponAffinities = charData.weaponAffinities;

    // Store character type and apply character-specific properties
    game.player.characterType = type;
    game.player.actionCooldownMax = charData.actionCooldownMax || 0;
    game.player.greenIdleDamageBonus = charData.idleDamageBonus || 0;
    game.player.greenCombatDamagePenalty = charData.combatDamagePenalty || 0;
    game.player.backstabMultiplier = charData.backstabMultiplier || 1.0;
    // Reset green ranger state when switching characters
    game.player.actionCooldown = 0;
    game.player.rollCharge = game.player.actionCooldownMax; // Start with full charge
    game.player.continuousRollActive = false;

    // Yellow Mage gets one free mana slot the moment they become Yellow.
    // Further mana slots (Yellow or otherwise) are earned via the well/hut
    // upgrade path, one slot at a time — same mechanism for every character.
    if (type === 'yellow') {
      game.magicSystem?.grantYellowFreeManaSlot(game.player);
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

    // Weapons Master training — permanent per-character, per-weapon-category bonus.
    const trained = game.inventorySystem?.characterInventories?.[game.activeCharacterType]?.trainedWeapons;
    const trainingBonus = (a) => {
      const category = a?.weaponSubtype || a?.weaponType;
      return (trained && category && trained[category]) ? 1 : 0;
    };

    if (Array.isArray(attack)) {
      return attack.map(a => ({ ...a, damage: Math.max(1, (a.damage || 1) + baseBonus + trainingBonus(a)) }));
    }
    const bonus = baseBonus + trainingBonus(attack);
    if (bonus === 0) return attack;
    return { ...attack, damage: Math.max(1, (attack.damage || 1) + bonus) };
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
    if (player.fishingLocked || game.menuOpen || game.bridgeMenuOpen || game.cheatMenu.isOpen) return;

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
          const enemies = game.currentRoom ? game.currentRoom.enemies : [];
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

    game.activeCharacterType = newType;
    game.applyCharacterType(newType);

    game.spawnCharacterNPCs();

    const charData = CHARACTER_TYPES[newType];
    game.showPickupMessage(charData.name);
  }
}
