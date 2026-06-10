import { CharacterNPC } from '../entities/CharacterNPC.js';
import { CHARACTER_TYPES } from '../data/characters.js';
import { GRID } from '../game/GameConfig.js';
import { BackgroundObject } from '../entities/BackgroundObject.js';

export class CharacterSystem {
  constructor(game) {
    this.game = game;
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
      source: 'lightning_sword'
    });
  }

  // Spawn lava background tiles in a 15° forward arc from the player on grid.
  // Called when a weapon flagged with `placesLava` completes its swing.
  spawnLavaSweep(player, room) {
    if (!room || !room.backgroundObjects) return;
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
      if (col < 1 || col >= GRID.COLS - 1 || row < 1 || row >= GRID.ROWS - 1) continue;
      if (room.collisionMap?.[row]?.[col]) continue;

      const x = col * C;
      const y = row * C;
      const occupied = room.backgroundObjects.some(obj =>
        !obj.destroyed &&
        Math.abs(obj.position.x - x) < C / 2 &&
        Math.abs(obj.position.y - y) < C / 2
      );
      if (occupied) continue;

      room.backgroundObjects.push(BackgroundObject.createVariant('lava', x, y));
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
    // future swap-back. Yellow's all-slots state is regenerated on demand and
    // doesn't need persistence, but we still snapshot it for consistency.
    const inv = game.inventorySystem;
    const prevType = inv._activeCharacterType;
    if (prevType && game.player?.magicMeter) {
      const prevEntry = inv.characterInventories[prevType];
      if (prevEntry) {
        const m = game.player.magicMeter;
        prevEntry.manaState = {
          slots: [...(m.slots || [])],
          current: m.current,
          max: m.max
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
        m.max = saved.max;
      } else {
        m.slots = [];
        m.current = 0;
      }
      m.active = m.slots.length > 0;
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

    // Yellow Mage is always "on with mana" — auto-lock every consumable slot
    // into mana mode and unequip anything currently sitting there. All other
    // characters use the well/hut upgrade path to convert slots one at a time.
    if (type === 'yellow') {
      game.magicSystem?.activateAllMagicMeterSlots(game.player);
    }
  }

  applyGreenDamageModifier(attack) {
    const game = this.game;
    if (!attack) return attack;
    // Green idle/combat bonus is applied at hit time (per-enemy) in CombatSystem.
    // Only bake in shrine/consumable damage bonuses here.
    let bonus = 0;
    if (game.player.damageBonusTimer > 0) bonus += game.player.damageBonusAmount;
    if (bonus === 0) return attack;
    if (Array.isArray(attack)) {
      return attack.map(a => ({ ...a, damage: Math.max(1, (a.damage || 1) + bonus) }));
    }
    return { ...attack, damage: Math.max(1, (attack.damage || 1) + bonus) };
  }

  triggerGreenActionCooldown() {
    const game = this.game;
    if (game.activeCharacterType === 'green' && game.player) {
      // Guns fire on their own weapon cooldown — they don't consume the ranger's action stamina
      const heldItem = game.player.heldItem;
      if (heldItem && heldItem.data.weaponType === 'GUN') return;
      game.player.actionCooldown = game.player.actionCooldownMax;
    }
  }

  spawnCharacterNPCs() {
    const game = this.game;
    // Clear existing NPCs
    game.characterNPCs = [];

    const availableCharacters = game.unlockedCharacters.filter(
      type => type !== game.activeCharacterType && !game.deadCharacters.includes(type)
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
