import { getPotionEffectParams } from '../data/alchemy.js';
import { GAME_STATES } from '../game/GameConfig.js';

// Every consumable use is a throw: the item arcs up and lands before its
// effect resolves (checkTriggerCondition only gates whether it CAN fire;
// applyEffect() does the actual mutation once the throw animation lands).
// A uniform windup duration doubles as the flight time for self-targeted
// items (heal, buffs, etc) — the offensive items below keep their own
// tuned windup/flight times.
const THROW_DURATION = 0.45;

// Effect types with no AoE landing zone — the windup renderer skips the
// pulsing radius ring for these (they always resolve on the player).
const SELF_ONLY_EFFECTS = new Set([
  'heal', 'manaSlot', 'maxhp', 'speed', 'block', 'cleanse', 'invuln',
  'shield', 'bulwark', 'waterImmunity', 'float', 'stoneskin', 'regen',
  'damageBuff', 'auto_dodge', 'arrowRefill',
]);

// Evaluates and dispatches consumable trigger conditions (auto and manual),
// and owns the keys-4-8-select / SPACE-fires manual consumable flow.
// Auto-trigger = emergency gate; manual (SPACE) trigger = tactics, bypasses
// HP/proximity/count gates but not physical preconditions (liquid contact,
// empty bow slot).
export class ConsumableTriggerSystem {
  constructor(game) {
    this.game = game;
  }

  // Arm a consumable slot for the next SPACE press (keys 4-8).
  selectSlot(index) {
    const game = this.game;
    const state = game.stateMachine.getCurrentState();
    if (state !== GAME_STATES.EXPLORE && state !== GAME_STATES.REST && state !== GAME_STATES.NEUTRAL) return;
    if (index >= game.inventorySystem.maxConsumableSlots) return; // locked slot — no-op
    if (!game.player.equippedConsumables?.[index]) return; // nothing to select
    game.player.selectedConsumableIndex = index;
    game.updateUI();
  }

  // Fires the armed consumable slot (if any) and hands SPACE control back to
  // the weapon slot. Returns true if a slot was armed (whether or not the
  // consumable actually triggered), so the caller knows SPACE was consumed.
  fireSelected(state) {
    const game = this.game;
    const validState = state === GAME_STATES.EXPLORE || state === GAME_STATES.REST
      || state === GAME_STATES.NEUTRAL || state === GAME_STATES.ARCADE_DEMO;
    if (!validState || (game.player?.selectedConsumableIndex ?? -1) < 0) return false;
    this.manualTrigger(game.player.selectedConsumableIndex, game.player, game.currentRoom);
    game.player.selectedConsumableIndex = -1;
    game.updateUI();
    return true;
  }

  manualTrigger(slotIndex, player, currentRoom) {
    const inv = this.game.inventorySystem;
    const consumable = player.equippedConsumables?.[slotIndex];
    if (!consumable) return false;
    if (inv.spentConsumableSlots[slotIndex]) return false;
    if (inv.consumableCooldowns[slotIndex] > 0) return false;
    if (inv.consumableWindups.some(w => w.slotIndex === slotIndex)) return false;

    const cd = consumable.data;
    if (cd.oilEffect) return false;

    const result = this.checkTriggerCondition(cd, player, currentRoom, consumable, true);
    if (!result) return false;

    const triggerData = result.windup ? result : null;
    inv._triggerConsumable(slotIndex, consumable, triggerData, player);
    return true;
  }

  // `manual` bypasses HP/proximity/count emergency gates (manual trigger =
  // tactics), but NOT physical preconditions like liquid contact or an empty
  // bow slot — those stay absolute.
  checkTriggerCondition(cd, player, currentRoom, consumable, manual = false) {
    const enemies = currentRoom ? currentRoom.enemies : [];

    switch (cd.effect) {
      case 'heal': {
        const threshold = cd.autoTriggerHP !== undefined ? cd.autoTriggerHP : (cd.amount >= 10 ? 0.25 : 0.5);
        if (manual || player.hp < player.maxHp * threshold) {
          return { windup: THROW_DURATION, effectType: 'heal' };
        }
        return false;
      }
      case 'manaSlot': {
        if (player?.magicMeter?.active) return false;
        return { windup: THROW_DURATION, effectType: 'manaSlot' };
      }
      case 'maxhp': {
        // Dragon Heart
        return { windup: THROW_DURATION, effectType: 'maxhp' };
      }
      case 'speed': {
        const threshold = cd.autoTriggerHP !== undefined ? cd.autoTriggerHP : 0.4;
        if (manual || player.hp < player.maxHp * threshold) {
          return { windup: THROW_DURATION, effectType: 'speed' };
        }
        return false;
      }
      case 'explode': {
        // Bomb: nearest enemy within 60px — START WINDUP
        let nearestDist = Infinity;
        for (const enemy of enemies) {
          const dx = (enemy.position.x + 20) - (player.position.x + 20);
          const dy = (enemy.position.y + 20) - (player.position.y + 20);
          nearestDist = Math.min(nearestDist, Math.sqrt(dx * dx + dy * dy));
        }
        if (manual || nearestDist <= 60) {
          return { windup: 1.5, effectType: 'explode' };
        }
        return false;
      }
      case 'curse': {
        // Cursed Skull: 3+ enemies within 80px — START WINDUP
        const px = player.position.x + 20;
        const py = player.position.y + 20;
        let nearbyCount = 0;
        for (const enemy of enemies) {
          const dx = (enemy.position.x + 20) - px;
          const dy = (enemy.position.y + 20) - py;
          if (Math.sqrt(dx * dx + dy * dy) <= 80) nearbyCount++;
        }
        if (manual || nearbyCount >= 3) {
          return { windup: 1.2, effectType: 'curse' };
        }
        return false;
      }
      case 'luck': {
        // Lucky Coin is now a pure passive — bonuses are applied via
        // applyEquipmentEffectsToPlayer when the slot is equipped. Never
        // auto-fires, never oneShots.
        return false;
      }
      case 'block': {
        // Metal Block: HP < threshold (emergency); manual bypasses
        const blockThreshold = cd.autoTriggerHP ?? 0.30;
        if (manual || player.hp < player.maxHp * blockThreshold) {
          return { windup: THROW_DURATION, effectType: 'block' };
        }
        return false;
      }
      case 'slow': {
        // Slime Ball: nearest enemy within 50px — START WINDUP
        const px = player.position.x + 20;
        const py = player.position.y + 20;
        let nearestDist = Infinity;
        for (const enemy of enemies) {
          const dx = (enemy.position.x + 20) - px;
          const dy = (enemy.position.y + 20) - py;
          nearestDist = Math.min(nearestDist, Math.sqrt(dx * dx + dy * dy));
        }
        if (manual || nearestDist <= 50) {
          return { windup: 0.8, effectType: 'slow' };
        }
        return false;
      }
      case 'poison': {
        // Poison Flask: nearest enemy within 55px — START WINDUP
        const px = player.position.x + 20;
        const py = player.position.y + 20;
        let nearestDist = Infinity;
        for (const enemy of enemies) {
          const dx = (enemy.position.x + 20) - px;
          const dy = (enemy.position.y + 20) - py;
          nearestDist = Math.min(nearestDist, Math.sqrt(dx * dx + dy * dy));
        }
        if (manual || nearestDist <= 55) {
          return { windup: 1.0, effectType: 'poison' };
        }
        return false;
      }
      case 'cleanse': {
        // Tonic: player has burn or wet; manual force-cleanses regardless
        if (manual || player.burnDuration > 0 || player.wetDuration > 0) {
          return { windup: THROW_DURATION, effectType: 'cleanse' };
        }
        return false;
      }
      case 'invuln': {
        // Smoke Bomb: HP < 25%
        if (manual || player.hp < player.maxHp * 0.25) {
          return { windup: THROW_DURATION, effectType: 'invuln' };
        }
        return false;
      }
      case 'venomcloud': {
        // Venom Vial: 2+ enemies within 60px — START WINDUP
        const px = player.position.x + 20;
        const py = player.position.y + 20;
        let nearbyCount = 0;
        for (const enemy of enemies) {
          const dx = (enemy.position.x + 20) - px;
          const dy = (enemy.position.y + 20) - py;
          if (Math.sqrt(dx * dx + dy * dy) <= 60) nearbyCount++;
        }
        if (manual || nearbyCount >= 2) {
          return { windup: 1.0, effectType: 'venomcloud' };
        }
        return false;
      }
      case 'jolt': {
        // Jolt Jar: normally needs 2+ enemies in room to auto-fire; manual
        // trigger only needs 1 (still refuses with 0 — nothing to throw at).
        const minEnemies = manual ? 1 : 2;
        if (enemies.length < minEnemies) return false;
        const px = player.position.x + 20;
        const py = player.position.y + 20;
        let nearest = null;
        let bestDist = Infinity;
        for (const enemy of enemies) {
          const dx = (enemy.position.x + 20) - px;
          const dy = (enemy.position.y + 20) - py;
          const d2 = dx * dx + dy * dy;
          if (d2 < bestDist) { bestDist = d2; nearest = enemy; }
        }
        if (!nearest) return false;
        return {
          windup: 0.7,
          effectType: 'jolt',
          targetX: nearest.position.x + 20,
          targetY: nearest.position.y + 20,
        };
      }
      case 'shield': {
        // Grants bullet-blocking charges once the throw lands
        if (player.shieldMaxCharges === 0) {
          return { windup: THROW_DURATION, effectType: 'shield' };
        }
        return false;
      }
      case 'bulwark': {
        // Grants all-hit-blocking charges once the throw lands
        if (player.shieldMaxCharges === 0) {
          return { windup: THROW_DURATION, effectType: 'bulwark' };
        }
        return false;
      }
      case 'waterImmunity': {
        // Rubber Boots: only makes sense in liquid — a physical precondition,
        // not an emergency gate, so this stays absolute even under manual.
        if (!player.inLiquid && !player.inDamagingLiquid) return false;
        return { windup: THROW_DURATION, effectType: 'waterImmunity' };
      }
      case 'float': {
        // Floating Boots: same physical-precondition exception as waterImmunity.
        if (!player.inLiquid && !player.inDamagingLiquid) return false;
        return { windup: THROW_DURATION, effectType: 'float' };
      }
      case 'throwSteam': {
        // Steam Vial: creates a steam cloud — START WINDUP
        return { windup: 0.6, effectType: 'throwSteam' };
      }
      case 'firecracker': {
        const px = player.position.x + 20, py = player.position.y + 20;
        if (manual) return { windup: 0.5, effectType: 'firecracker' };
        for (const enemy of enemies) {
          const dx = (enemy.position.x + 20) - px, dy = (enemy.position.y + 20) - py;
          if (Math.sqrt(dx * dx + dy * dy) <= 50) return { windup: 0.5, effectType: 'firecracker' };
        }
        return false;
      }
      case 'stoneskin': {
        const threshold = cd.autoTrigger?.criticalHP ?? 0.20;
        if (manual || player.hp < player.maxHp * threshold) {
          return { windup: THROW_DURATION, effectType: 'stoneskin' };
        }
        return false;
      }
      case 'regen': {
        const threshold = cd.autoTriggerHP ?? 0.50;
        if (manual || player.hp < player.maxHp * threshold) {
          return { windup: THROW_DURATION, effectType: 'regen' };
        }
        return false;
      }
      case 'damageBuff': {
        if (cd.duration && !cd.passive) {
          if (manual) return { windup: THROW_DURATION, effectType: 'damageBuff' };
          const px = player.position.x + 20, py = player.position.y + 20;
          for (const enemy of enemies) {
            const dx = (enemy.position.x + 20) - px, dy = (enemy.position.y + 20) - py;
            if (Math.sqrt(dx * dx + dy * dy) <= (cd.autoTrigger?.range ?? 80)) {
              return { windup: THROW_DURATION, effectType: 'damageBuff' };
            }
          }
        }
        return false;
      }
      case 'auto_dodge': {
        // Fur Cloak: grants a brief invulnerability window when HP is critically low.
        const threshold = cd.autoTrigger?.criticalHP ?? 0.20;
        if (manual || player.hp < player.maxHp * threshold) {
          return { windup: THROW_DURATION, effectType: 'auto_dodge' };
        }
        return false;
      }
      case 'arrowRefill': {
        // Fletch of Arrows: only makes sense with an empty bow slot — a
        // physical precondition, stays absolute even under manual.
        const emptyBow = player.quickSlots.find(s => s?.data?.weaponType === 'BOW' && s.usesRemaining <= 0);
        if (!emptyBow) return false;
        return { windup: THROW_DURATION, effectType: 'arrowRefill' };
      }
      case 'panic_blind': {
        // Bone Dust: blinds nearby enemies at critical HP (emergency); the
        // nearbyEnemies auto-trigger branch was stripped (tactical, not
        // emergency) — the radius scan below is execution, not gating.
        const px = player.position.x + 20;
        const py = player.position.y + 20;
        const blindRadius = cd.radius ?? 96;
        const critThreshold = cd.autoTrigger?.criticalHP ?? 0.12;
        if (manual || player.hp < player.maxHp * critThreshold) {
          for (const enemy of enemies) {
            const dx = (enemy.position.x + 20) - px;
            const dy = (enemy.position.y + 20) - py;
            if (Math.sqrt(dx * dx + dy * dy) <= blindRadius) return { windup: THROW_DURATION, effectType: 'panic_blind' };
          }
          // No enemies in radius — still let the throw land (bone dust puffs
          // harmlessly) so a manual trigger doesn't silently no-op.
          if (manual) return { windup: THROW_DURATION, effectType: 'panic_blind' };
        }
        return false;
      }
      default:
        return false;
    }
  }

  // Applies a self/AoE-around-player consumable's effect once its throw
  // animation lands. The eight offensive items with their own fixed AoE
  // landing spot (explode, curse, slow, poison, venomcloud, jolt,
  // throwSteam, firecracker) stay in InventorySystem._executeWindupEffect —
  // this covers everything else, resolved against the player's CURRENT
  // position/state at landing time rather than at throw time.
  applyEffect(windup, player, enemies, steamClouds) {
    const consumable = windup.consumable;
    const cd = consumable.data;
    const modifier = consumable?.potionModifier ?? cd.potionModifier;
    const params = () => getPotionEffectParams(consumable?.char || cd.char, modifier);

    switch (windup.effectType) {
      case 'heal': {
        const p = params();
        const healAmount = p?.amount ?? cd.amount;
        player.heal(healAmount);
        this.game.combatSystem.showHeal(healAmount, player.position.x, player.position.y, player);
        if (p?.isUnstableBadRoll) player.takeDamage?.(Math.abs(Math.round(p.unstableRoll) - cd.amount));
        break;
      }
      case 'manaSlot':
        this.game.magicSystem.grantTempManaSlot(player, cd);
        break;
      case 'maxhp':
        player.maxHp += cd.amount;
        player.hp = player.maxHp;
        break;
      case 'speed':
        player.applySpeedBoost(cd.duration || 8);
        break;
      case 'block':
        player.applyBlockBoost(8, 5);
        break;
      case 'cleanse':
        player.burnDuration = 0;
        player.wetDuration = 0;
        break;
      case 'invuln': {
        const duration = cd.duration || 3.5;
        player.invulnerabilityTimer = Math.max(player.invulnerabilityTimer, duration);
        if (steamClouds) {
          steamClouds.push({
            x: player.position.x + 20,
            y: player.position.y + 20,
            radius: 20 * 3.5, // GRID.CELL_SIZE * 3.5
            timer: duration
          });
        }
        break;
      }
      case 'shield':
        player.shieldCharges = cd.charges || 3;
        player.shieldMaxCharges = cd.charges || 3;
        player.shieldCooldownMax = cd.rechargeCooldown || 5;
        player.shieldCooldown = 0;
        player.shieldBlocksAll = false;
        break;
      case 'bulwark':
        player.shieldCharges = cd.charges || 2;
        player.shieldMaxCharges = cd.charges || 2;
        player.shieldCooldownMax = cd.rechargeCooldown || 8;
        player.shieldCooldown = 0;
        player.shieldBlocksAll = true;
        break;
      case 'waterImmunity':
        player.waterImmunityTimer = cd.duration;
        break;
      case 'float':
        player.floatTimer = cd.duration;
        break;
      case 'stoneskin': {
        const p = params();
        player.applyStoneSkin(cd.duration || 10, p?.defenseBonus ?? cd.defenseBonus ?? 3);
        break;
      }
      case 'regen': {
        const p = params();
        player.applyRegen(cd.duration || 5, p?.regenAmount ?? cd.regenAmount ?? 1, cd.regenInterval || 1.0);
        break;
      }
      case 'damageBuff': {
        const p = params();
        player.applyDamageBuff(cd.duration, p?.damageBonus ?? cd.damageBonus ?? 2);
        break;
      }
      case 'auto_dodge':
        player.invulnerabilityTimer = Math.max(player.invulnerabilityTimer, cd.duration || 10.0);
        break;
      case 'arrowRefill': {
        const emptyBow = player.quickSlots.find(s => s?.data?.weaponType === 'BOW' && s.usesRemaining <= 0);
        if (emptyBow) emptyBow.usesRemaining = Math.min(emptyBow.usesRemaining + (cd.amount || 5), emptyBow.maxUses ?? Infinity);
        break;
      }
      case 'panic_blind': {
        const px = player.position.x + 20;
        const py = player.position.y + 20;
        const blindRadius = cd.radius ?? 96;
        for (const enemy of enemies) {
          const dx = (enemy.position.x + 20) - px;
          const dy = (enemy.position.y + 20) - py;
          if (Math.sqrt(dx * dx + dy * dy) <= blindRadius) enemy.applyStatusEffect('blind', cd.duration || 4.0);
        }
        break;
      }
    }
  }

  // Effect types that have no AoE landing zone (always resolve on the
  // player) — the windup renderer skips the pulsing radius ring for these.
  static isSelfOnlyEffect(effectType) {
    return SELF_ONLY_EFFECTS.has(effectType);
  }

  // Actual AoE radius for a windup's effectType — single source of truth for the
  // damage-radius numbers so the windup-ring renderer doesn't keep its own copy.
  getWindupAoeRadius(windup) {
    const cd = windup.consumable.data;
    switch (windup.effectType) {
      case 'explode':     return cd.radius * 2; // Bomb uses 2x radius
      case 'curse':       return cd.radius;     // Cursed Skull
      case 'slow':        return 50;            // Slime Ball
      case 'poison':      return 55;            // Poison Flask
      case 'venomcloud':  return 60;            // Venom Vial
      case 'jolt':        return cd.radius || 80; // Drawn at target position
      case 'throwSteam':  return cd.radius;     // Steam Vial
      case 'panic_blind': return cd.radius ?? 96; // Bone Dust
      default:            return 40;
    }
  }
}
