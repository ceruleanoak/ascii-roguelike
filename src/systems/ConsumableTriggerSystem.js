import { getPotionEffectParams } from '../data/alchemy.js';
import { GAME_STATES, GRID } from '../game/GameConfig.js';
import { clearStatusEffect } from './StatusEffects.js';
import { FAIRY_HEAL } from '../entities/Fairy.js';
import { entityCenter } from '../game/Telegraph.js';
import { enemyDistance, enemyInRadius, enemyNearestPoint } from './enemyHitTest.js';

// Every consumable use is a throw: the item arcs up and lands before its
// effect resolves (checkTriggerCondition only gates whether it CAN fire;
// applyEffect() does the actual mutation once the throw animation lands).
// A uniform windup duration doubles as the flight time for self-targeted
// items (heal, buffs, etc) — the offensive items below keep their own
// tuned windup/flight times.
const THROW_DURATION = 0.45;

// How far a manual Jolt Jar flies along the player's facing when there is no
// enemy to aim at (px).
const JOLT_FACING_THROW_DISTANCE = 100;

// How far a thrown liquid Bottle (a Liquid Splash) flies along the player's
// facing (px) — far enough that the plus it lands as clears the player's cell.
const LIQUID_SPLASH_THROW_DISTANCE = GRID.CELL_SIZE * 4;

// The point `distance` px along the player's facing, from their true center
// (a Liquid Splash lands on cells, so the legacy +20 offset would skew it).
function facingThrowTarget(player, distance) {
  const c = entityCenter(player);
  let fx = player.facing?.x ?? 0;
  let fy = player.facing?.y ?? 1;
  if (fx === 0 && fy === 0) fy = 1;
  const len = Math.sqrt(fx * fx + fy * fy);
  return {
    targetX: c.x + (fx / len) * distance,
    targetY: c.y + (fy / len) * distance,
  };
}

// Effect types with no AoE landing zone — the windup renderer skips the
// pulsing radius ring for these (they always resolve on the player).
const SELF_ONLY_EFFECTS = new Set([
  'heal', 'fairyHeal', 'manaSlot', 'speed', 'block', 'cleanse', 'invuln',
  'stoneskin', 'regen',
  'damageBuff',
]);

// Evaluates and dispatches consumable trigger conditions (auto and manual),
// and owns the keys-4-8-select / SPACE-fires manual consumable flow.
// Auto-trigger = emergency gate; manual (SPACE) trigger = tactics, bypasses
// HP/proximity/count gates but not physical preconditions.
export class ConsumableTriggerSystem {
  constructor(game) {
    this.game = game;
  }

  // ── The Armed Consumable ────────────────────────────────────────────────
  // What SPACE uses next: a consumable slot (keys 4-8, player.selected-
  // ConsumableIndex) or a Bottle armed from the Bottles column
  // (player.armedBottle). Arming one disarms the other. Every SPACE consumer
  // reads it through armed(), which returns a Bottle Ref (BottlesSystem)
  // plus the Item — { item, source: 'slot'|'bottles', index } — or null.
  armed() {
    const player = this.game.player;
    if (!player) return null;
    const bottle = player.armedBottle;
    if (bottle) {
      const index = this.game.inventorySystem.bottles.indexOf(bottle);
      if (index !== -1) return { item: bottle, source: 'bottles', index };
      player.armedBottle = null; // it left Bottles (equipped, sold, spent)
    }
    const slot = player.selectedConsumableIndex ?? -1;
    const item = slot >= 0 ? player.equippedConsumables?.[slot] : null;
    return item ? { item, source: 'slot', index: slot } : null;
  }

  // Turn the Armed Consumable into `newChar` where it sits (filling an armed
  // Empty Bottle). Returns the new Item, or null when nothing is armed.
  replaceArmed(newChar) {
    const ref = this.armed();
    return ref ? this.game.bottlesSystem.replaceAt(ref, newChar) : null;
  }

  disarm() {
    const player = this.game.player;
    if (!player) return;
    player.selectedConsumableIndex = -1;
    player.armedBottle = null;
  }

  // Arm a consumable slot for the next SPACE press (keys 4-8).
  selectSlot(index) {
    const game = this.game;
    const state = game.stateMachine.getCurrentState();
    if (state !== GAME_STATES.EXPLORE && state !== GAME_STATES.REST && state !== GAME_STATES.NEUTRAL) return;
    if (index >= game.inventorySystem.maxConsumableSlots) return; // locked slot — no-op
    if (!game.player.equippedConsumables?.[index]) return; // nothing to select
    game.player.armedBottle = null;
    game.player.selectedConsumableIndex = index;
    game.updateUI();
  }

  // Arm a Bottle from Bottles for the next SPACE press (the Bottles column).
  armBottle(item) {
    const game = this.game;
    if (!game.player || !game.inventorySystem.bottles.includes(item)) return;
    game.player.selectedConsumableIndex = -1;
    game.player.armedBottle = item;
    game.updateUI();
  }

  // Fires the Armed Consumable (if any) and hands SPACE control back to the
  // weapon slot. Returns true if something was armed (whether or not the
  // consumable actually triggered), so the caller knows SPACE was consumed.
  fireSelected(state) {
    const game = this.game;
    const validState = state === GAME_STATES.EXPLORE || state === GAME_STATES.REST
      || state === GAME_STATES.NEUTRAL || state === GAME_STATES.ARCADE_DEMO;
    const ref = validState ? this.armed() : null;
    if (!ref) return false;

    // REST: a ground item in reach wins over the armed slot. The REST crafting
    // workflow leaves a potion armed whenever a SHIFT-place into a slot fails,
    // so SPACE on a dropped item beside the slots drank the potion (slot →
    // Empty Bottle) instead of picking the item up. Declining here lets SPACE
    // fall through to the REST pickup; the slot stays armed.
    if (state === GAME_STATES.REST &&
        game.inventorySystem.hasNearbyGroundItem(game.items, game.player, game.physicsSystem)) {
      return false;
    }

    // Alchemy Lab: an armed potion is not drunk here. Declining lets SPACE
    // reach the stations, the Condenser reading the armed potion first.
    if (game.alchemySystem?.armedPotionInLab()) return false;

    // Gold Breath curse: the slots are coins now — SPACE flips one instead of
    // firing the remedy behind it (consumable use suspended, ratified). The
    // curse owner performs the discharge; an empty wallet spends nothing but
    // still consumes the press, same as a consumable that refuses to fire.
    if (game.goldBreathCurseActive) {
      game.dungeonBossSystem?.dischargeCoin();
      this.disarm();
      game.updateUI();
      return true;
    }

    if (ref.source === 'slot') this.manualTrigger(ref.index, game.player, game.currentRoom);
    else this.manualTriggerBottle(ref.item, game.player, game.currentRoom);
    this.disarm();
    game.updateUI();
    return true;
  }

  // SPACE on a Bottle armed from Bottles — manualTrigger's gates without the
  // slot. An oil (the Venom Vial) only works equipped, where it coats the
  // weapon; the Bomb Bag is not a Bottle.
  manualTriggerBottle(item, player, currentRoom) {
    if (item.data.oilEffect) return false;
    const result = this.checkTriggerCondition(item.data, player, currentRoom, item, true);
    if (!result) return false;
    return this.game.bottlesSystem.trigger(item, result, player);
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
    // The Bomb Bag throws a Bomb without spending itself — BombBagSystem.
    if (cd.bombBag) return this.game.bombBagSystem.throwFrom(slotIndex, consumable, player);

    const result = this.checkTriggerCondition(cd, player, currentRoom, consumable, true);
    if (!result) return false;

    const triggerData = result.windup ? result : null;
    inv._triggerConsumable(slotIndex, consumable, triggerData, player);
    return true;
  }

  // Auto-trigger scan over the equipped slots — the emergency gate. Only a
  // slot auto-fires: a Bottle in Bottles never does, which is what equipping
  // one buys. Moved here from InventorySystem (checkConsumableActivation),
  // which still owns the per-slot arrays it reads.
  checkAutoTriggers(inv, player, currentRoom) {
    if (!player.equippedConsumables) return;

    for (let i = 0; i < player.equippedConsumables.length; i++) {
      const consumable = player.equippedConsumables[i];
      if (!consumable) continue;
      if (inv.spentConsumableSlots[i]) continue; // One-shot consumables already used

      // Skip if on cooldown (reusable consumables)
      if (inv.consumableCooldowns[i] > 0) continue;

      // Skip if already winding up
      if (inv.consumableWindups.some(w => w.slotIndex === i)) continue;

      let shouldTrigger = false;
      let triggerData = null; // Store trigger conditions for offensive items
      const cd = consumable.data;

      // Oils are passive augments — they apply to bow/dagger attacks via Item.js
      // and never auto-trigger on their own.
      if (cd.oilEffect) continue;

      // Tactical items (proximity/count-gated) auto-trigger is for emergencies
      // only; manualOnly items only fire via manualTrigger (SPACE).
      if (cd.manualOnly) continue;

      // Check trigger condition based on effect type
      shouldTrigger = this.checkTriggerCondition(cd, player, currentRoom, consumable);
      if (shouldTrigger && shouldTrigger.windup) {
        triggerData = shouldTrigger;
        shouldTrigger = true;
      }

      if (shouldTrigger) {
        inv._triggerConsumable(i, consumable, triggerData, player);
      }
    }
  }

  // `manual` bypasses HP/proximity/count emergency gates (manual trigger =
  // tactics), but NOT physical preconditions — those stay absolute.
  checkTriggerCondition(cd, player, currentRoom, consumable, manual = false) {
    const enemies = this.game._activeEnemies();

    switch (cd.effect) {
      case 'heal': {
        // Fairy King in a Bottle: fires on a survived hit, not an HP threshold
        if (cd.healOnHit) {
          return (manual || player.hurtPending) ? { windup: THROW_DURATION, effectType: 'heal' } : false;
        }
        const threshold = cd.autoTriggerHP !== undefined ? cd.autoTriggerHP : (cd.amount >= 10 ? 0.25 : 0.5);
        if (manual || player.hp < player.maxHp * threshold) {
          return { windup: THROW_DURATION, effectType: 'heal' };
        }
        return false;
      }
      case 'manaSlot': {
        // Once this character's potion slot is granted, a potion only fills
        // the meter — nothing to give while it is full or not lit.
        const meter = player?.magicMeter;
        if (meter?.potionSlotGranted && (!meter.active || meter.current >= meter.max)) return false;
        return { windup: THROW_DURATION, effectType: 'manaSlot' };
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
          nearestDist = Math.min(nearestDist, enemyDistance(enemy, player.position.x + 20, player.position.y + 20, 20));
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
          if (enemyDistance(enemy, px, py, 20) <= 80) nearbyCount++;
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
          nearestDist = Math.min(nearestDist, enemyDistance(enemy, px, py, 20));
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
          nearestDist = Math.min(nearestDist, enemyDistance(enemy, px, py, 20));
        }
        if (manual || nearestDist <= 55) {
          return { windup: 1.0, effectType: 'poison' };
        }
        return false;
      }
      case 'cleanse': {
        // Tonic: player has burn or wet; manual force-cleanses regardless
        if (manual || player.isBurning() || player.isWet()) {
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
      case 'jolt': {
        // Jolt Jar: auto-fires only with 2+ enemies in the room. A manual
        // throw always fires, like every other thrown consumable: it lands on
        // the nearest live enemy, or a fixed distance along the player's
        // facing when there is none to aim at.
        const px = player.position.x + 20;
        const py = player.position.y + 20;
        const live = enemies.filter(e => !e.isDying && e.hp > 0);
        if (!manual && live.length < 2) return false;
        // The nearest point of the nearest enemy (enemyHitTest): an ordinary
        // enemy's historic +20, a Great Hand's art rather than its frame.
        let nearest = null;
        for (const enemy of live) {
          const p = enemyNearestPoint(enemy, px, py, 20);
          if (p.dist < (nearest?.dist ?? Infinity)) nearest = p;
        }
        let targetX, targetY;
        if (nearest) {
          targetX = nearest.x;
          targetY = nearest.y;
        } else {
          ({ targetX, targetY } = facingThrowTarget(player, JOLT_FACING_THROW_DISTANCE));
        }
        return { windup: 0.7, effectType: 'jolt', targetX, targetY };
      }
      case 'throwSteam': {
        // Steam Vial: creates a steam cloud — START WINDUP
        return { windup: 0.6, effectType: 'throwSteam' };
      }
      case 'releaseSticks':
        // Stick Bundle: manual-only; the Sticks spill out where you stand.
        return manual ? { windup: 0.4, effectType: 'releaseSticks' } : false;
      case 'waterBalloon':
        // Water Balloon: manual-only throw, lands where the Bomb's would
        return manual ? { windup: THROW_DURATION, effectType: 'waterBalloon' } : false;
      case 'cauldronInput':
        // A liquid Bottle (`splash`): manual-only throw along the facing,
        // landing as a Liquid Splash. Fountain waters have no splash.
        if (!manual || !cd.splash) return false;
        return { windup: 0.7, effectType: 'liquidSplash', ...facingThrowTarget(player, LIQUID_SPLASH_THROW_DISTANCE) };
      case 'firecracker': {
        const px = player.position.x + 20, py = player.position.y + 20;
        if (manual) return { windup: 0.5, effectType: 'firecracker' };
        for (const enemy of enemies) {
          if (enemyDistance(enemy, px, py, 20) <= 50) return { windup: 0.5, effectType: 'firecracker' };
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
            if (enemyDistance(enemy, px, py, 20) <= (cd.autoTrigger?.range ?? 80)) {
              return { windup: THROW_DURATION, effectType: 'damageBuff' };
            }
          }
        }
        return false;
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
            if (enemyDistance(enemy, px, py, 20) <= blindRadius) return { windup: THROW_DURATION, effectType: 'panic_blind' };
          }
          // No enemies in radius — still let the throw land (bone dust puffs
          // harmlessly) so a manual trigger doesn't silently no-op.
          if (manual) return { windup: THROW_DURATION, effectType: 'panic_blind' };
        }
        return false;
      }
      case 'revive_on_death': {
        // Fairy in a Bottle: its auto-trigger is the death intercept in
        // main.js's game-over path, not an HP gate here. A manual use drinks
        // the fairy now for the same FAIRY_HEAL.
        if (!manual) return false;
        return { windup: THROW_DURATION, effectType: 'fairyHeal' };
      }
      default:
        return false;
    }
  }

  // Applies a self/AoE-around-player consumable's effect once its throw
  // animation lands. The eight offensive items with their own fixed AoE
  // landing spot (explode, curse, slow, poison, jolt,
  // throwSteam, firecracker) resolve in ConsumableWindupEffects.execute —
  // this covers everything else, resolved against the player's CURRENT
  // position/state at landing time rather than at throw time.
  applyEffect(windup, player, enemies, steamClouds) {
    const consumable = windup.consumable;
    const cd = consumable.data;
    const modifier = consumable?.potionModifier ?? cd.potionModifier;
    const params = () => getPotionEffectParams(consumable?.char || cd.char, modifier);

    switch (windup.effectType) {
      case 'releaseSticks':
        // Three Sticks fan out around the player, as a bundle's melee break does.
        for (let i = 0; i < 3; i++) {
          const angle = (i / 3) * Math.PI * 2 + Math.random() * 0.5;
          this.game.lootSystem.spawnIngredientDrop('|', player.position.x, player.position.y, angle, player);
        }
        break;
      case 'heal': {
        const p = params();
        // An Unstable roll is whole HP: 0+ heals that much, below 0 hurts by
        // that much (POTION_MODIFIERS.H.unstable — "heal 0-7 or damage 2").
        // The potion names itself as the cause, so a death by it gets a
        // tombstone like any other killer.
        const amount = p?.amount ?? cd.amount;
        if (amount < 0) {
          player.takeDamage?.(-amount, { cause: consumable });
          break;
        }
        player.heal(amount);
        this.game.combatSystem.showHeal(amount, player.position.x, player.position.y, player);
        break;
      }
      case 'fairyHeal':
        player.heal(FAIRY_HEAL);
        this.game.combatSystem.showHeal(FAIRY_HEAL, player.position.x, player.position.y, player);
        break;
      case 'manaSlot':
        this.game.magicSystem.drinkManaPotion(player, windup?.slotIndex);
        break;
      case 'speed':
        player.applySpeedBoost(cd.duration || 8);
        break;
      case 'block':
        player.applyBlockBoost(8, 5);
        break;
      case 'cleanse':
        clearStatusEffect(player, 'burn');
        clearStatusEffect(player, 'wet');
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
      case 'stoneskin': {
        const p = params();
        player.applyStoneSkin(p?.duration ?? cd.duration ?? 10);
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
      case 'panic_blind': {
        const px = player.position.x + 20;
        const py = player.position.y + 20;
        const blindRadius = cd.radius ?? 96;
        for (const enemy of enemies) {
          if (enemyInRadius(enemy, px, py, blindRadius, 20)) enemy.applyStatusEffect('blind', cd.duration || 4.0);
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
      case 'waterBalloon': return cd.radius * 2; // same burst as the Bomb
      case 'curse':       return cd.radius;     // Cursed Skull
      case 'slow':        return 50;            // Slime Ball
      case 'poison':      return 55;            // Poison Flask
      case 'jolt':        return cd.radius || 80; // Drawn at target position
      case 'throwSteam':  return cd.radius;     // Steam Vial
      case 'panic_blind': return cd.radius ?? 96; // Bone Dust
      case 'liquidSplash': return GRID.CELL_SIZE * 1.5; // the plus of tiles
      default:            return 40;
    }
  }
}
