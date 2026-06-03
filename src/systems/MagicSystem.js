/**
 * MagicSystem — owns the gem-wand cast lifecycle and the player's mana meter.
 *
 * Responsibilities:
 * - Drive auto-cast when a charging gem wand reaches its required chargeTime
 * - Validate mana before allowing a cast to begin or complete
 * - Mutate player.magicMeter (current/max), convert ingredients into mana
 * - Activate / deactivate the magic-meter slot (cauldron in Phase 3, cheat menu now)
 * - Dispatch spell effects per gem (fire AOE, blizzard, chain stun, blind cone,
 *   grass circle, charm AOE)
 */

import { BackgroundObject } from '../entities/BackgroundObject.js';
import { Particle } from '../entities/Particle.js';
import { GRID } from '../game/GameConfig.js';

// Mana yield per ingredient char. Phase 1 only Goo is exposed in the UI;
// remaining entries are reserved for the Phase 2 conversion menu expansion.
export const INGREDIENT_MANA_VALUES = {
  g: 1,   // Goo
  s: 2,   // Scale
  F: 3,   // Fire Essence
  d: 1,   // Dust / Ash
  e: 2,   // Eye
  h: 1,   // Herb
  r: 1,   // Root
  v: 2,   // Venom
  // Gems
  '1': 4, // Topaz
  '9': 4, // Garnet
  '`': 5, // Emerald
  '?': 5, // Ruby
  '(': 5, // Sapphire
  '6': 6, // Onyx
  '_': 8  // Diamond
};

export class MagicSystem {
  constructor(game) {
    this.game = game;
  }

  // ─── Meter activation ────────────────────────────────────────────────────

  // Add a single consumable slot to the magic meter. Called by the well
  // ritual, cauldron hex, or cheat menu — the per-slot upgrade path.
  // If slotIndex is omitted, picks the first non-destroyed slot that isn't
  // already a mana slot. Returns true if a new slot was activated.
  activateMagicMeter(player, slotIndex = null) {
    if (!player) return false;
    const meter = player.magicMeter;
    if (!meter.slots) meter.slots = [];

    let target = slotIndex;
    if (target == null) {
      const destroyed = player.destroyedSlots || [];
      // Find lowest non-destroyed slot that isn't already mana
      const limit = Math.max(destroyed.length, meter.slots.length, 1);
      for (let i = 0; i < limit + 5; i++) {
        if (destroyed[i]) continue;
        if (meter.slots.includes(i)) continue;
        target = i;
        break;
      }
    }
    if (target == null || target < 0) return false;
    if (meter.slots.includes(target)) return false;

    const wasEmpty = meter.slots.length === 0;
    meter.slots.push(target);
    meter.slots.sort((a, b) => a - b);
    meter.active = true;
    if (wasEmpty) meter.current = 0;
    return true;
  }

  // Yellow Mage auto-conversion: lock every available consumable slot into
  // mana mode and return any currently-equipped consumables to inventory.
  // Idempotent — safe to call on room transitions while already yellow.
  activateAllMagicMeterSlots(player) {
    if (!player) return false;
    const inv = this.game.inventorySystem;
    const maxSlots = inv?.maxConsumableSlots ?? player.equippedConsumables?.length ?? 2;

    const meter = player.magicMeter;
    if (!meter.slots) meter.slots = [];
    const wasEmpty = meter.slots.length === 0;

    for (let i = 0; i < maxSlots; i++) {
      // Unequip whatever's currently in this slot back to consumable inventory.
      const equipped = inv?.equippedConsumables?.[i];
      if (equipped) {
        inv.consumableInventory.push(equipped);
        inv.equippedConsumables[i] = null;
      }
      if (player.equippedConsumables && player.equippedConsumables[i]) {
        player.equippedConsumables[i] = null;
      }
      if (!meter.slots.includes(i)) meter.slots.push(i);
    }
    meter.slots.sort((a, b) => a - b);
    meter.active = meter.slots.length > 0;
    if (wasEmpty) meter.current = 0;
    return true;
  }

  // Clear all mana slots — used when swapping away from Yellow Mage so the
  // next character starts from their own (well/hut-earned) state.
  deactivateAllMagicMeterSlots(player) {
    if (!player?.magicMeter) return;
    player.magicMeter.slots = [];
    player.magicMeter.active = false;
    player.magicMeter.current = 0;
  }

  // ─── Mana mutation ───────────────────────────────────────────────────────

  hasMana(player, cost) {
    return !!player?.magicMeter?.active && player.magicMeter.current >= cost;
  }

  spendMana(player, cost) {
    if (!this.hasMana(player, cost)) return false;
    player.magicMeter.current -= cost;
    return true;
  }

  addMana(player, amount) {
    if (!player?.magicMeter?.active) return 0;
    const before = player.magicMeter.current;
    player.magicMeter.current = Math.min(player.magicMeter.max, before + amount);
    return player.magicMeter.current - before;
  }

  // Convert one unit of an ingredient from inventory into mana. Returns the
  // mana amount actually added (0 on failure).
  convertIngredientToMana(player, ingredientChar) {
    if (!player?.magicMeter?.active) return 0;
    const yieldAmount = INGREDIENT_MANA_VALUES[ingredientChar];
    if (!yieldAmount) return 0;
    const idx = player.inventory.indexOf(ingredientChar);
    if (idx === -1) return 0;
    if (player.magicMeter.current >= player.magicMeter.max) return 0;

    player.inventory.splice(idx, 1);
    return this.addMana(player, yieldAmount);
  }

  // ─── Cast lifecycle ──────────────────────────────────────────────────────

  // Called from main.js handleSpacePress when held item is a gem wand.
  // Returns true if a charge was initiated.
  tryStartCharge(player) {
    const wand = player?.heldItem;
    if (!wand?.data?.gemWand) return false;
    if (wand.isCharging) return false;
    if (!this.hasMana(player, wand.data.manaCost)) {
      this.game.menuSystem?.showPickupMessage?.('NOT ENOUGH MANA');
      return false;
    }
    // Item.use() handles the isCharging state — caller invokes it.
    return true;
  }

  // Called when player releases the attack key. Cancels in-progress charges
  // that haven't completed yet. No mana cost.
  handleSpaceRelease(player) {
    const wand = player?.heldItem;
    if (!wand?.data?.gemWand) return;
    if (!wand.isCharging) return;
    // If the cast was about to fire this frame, MagicSystem.update handled it.
    if (wand.chargeTime >= wand.data.chargeTime) return;
    wand.cancelGemWandCharge();
  }

  // Per-frame: complete any gem-wand cast whose charge has finished.
  update(_dt) {
    const player = this.game.player;
    const wand = player?.heldItem;
    if (!wand?.data?.gemWand) return;
    if (!wand.isCharging) return;
    if (wand.chargeTime < wand.data.chargeTime) return;

    // Final mana check (could have been spent elsewhere mid-charge)
    if (!this.hasMana(player, wand.data.manaCost)) {
      wand.cancelGemWandCharge();
      this.game.menuSystem?.showPickupMessage?.('NOT ENOUGH MANA');
      return;
    }

    const attack = wand.releaseGemWand();
    if (!attack) return;

    this.spendMana(player, wand.data.manaCost);
    this.runSpellEffect(attack);
  }

  // Dispatches the cast to its concrete effect. attack.position is the player
  // center at release time; attack.facing is the player's facing vector.
  runSpellEffect(attack) {
    switch (attack.spellEffect) {
      case 'fire_aoe':     return this._castFireAOE(attack);
      case 'blizzard':     return this._castBlizzard(attack);
      case 'chain_stun':   return this._castChainStun(attack);
      case 'blind_cone':   return this._castBlindCone(attack);
      case 'grass_circle': return this._castGrassCircle(attack);
      case 'charm_aoe':    return this._castCharmAOE(attack);
      case 'force_blast':  return this._castForceBlast(attack);
    }
  }

  // ─── Visual helpers ─────────────────────────────────────────────────────

  // Outward AOE burst — particles emanate radially from the cast point.
  // Used by ring-shaped spells (fire, frost, charm).
  _spawnRingBurst(x, y, radius, count, chars, colors, lifetime = 0.7) {
    const particles = this.game.particles;
    if (!particles) return;
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.4;
      const speed = (radius / lifetime) * (0.7 + Math.random() * 0.6);
      const char = chars[Math.floor(Math.random() * chars.length)];
      const color = colors[Math.floor(Math.random() * colors.length)];
      const p = new Particle(x, y, char, color,
        { vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed },
        lifetime * (0.7 + Math.random() * 0.5)
      );
      p.boundToGrid = false;
      p.decelerationRate = 0.94;
      particles.push(p);
    }
  }

  // Forward cone burst — particles fly from the cast point along facing.
  _spawnConeBurst(x, y, facing, reach, count, chars, colors, lifetime = 0.6) {
    const particles = this.game.particles;
    if (!particles) return;
    const baseAngle = Math.atan2(facing.y || -1, facing.x || 0);
    const halfAngle = Math.PI / 4;
    for (let i = 0; i < count; i++) {
      const angle = baseAngle + (Math.random() - 0.5) * halfAngle * 2;
      const speed = (reach / lifetime) * (0.6 + Math.random() * 0.6);
      const char = chars[Math.floor(Math.random() * chars.length)];
      const color = colors[Math.floor(Math.random() * colors.length)];
      const p = new Particle(x, y, char, color,
        { vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed },
        lifetime * (0.7 + Math.random() * 0.5)
      );
      p.boundToGrid = false;
      p.decelerationRate = 0.92;
      particles.push(p);
    }
  }

  // ─── Spell effects ──────────────────────────────────────────────────────

  // Returns the enemy list active for the player's current layer.
  _activeEnemies() {
    const game = this.game;
    if (game.player?.inMaze && game.mazeInterior) return game.mazeInterior.ghosts || [];
    if (game.player?.inHut && game.activeFloor) return game.activeFloor.enemies;
    return game.currentRoom?.enemies ?? [];
  }

  // Returns the background-object list active for the player's current layer.
  _activeBackgroundObjects() {
    const game = this.game;
    if (game.player?.inMaze && game.mazeInterior) return game.mazeInterior.mazeObjects || [];
    if (game.player?.inHut && game.activeFloor) return game.activeFloor.backgroundObjects;
    return game.backgroundObjects ?? [];
  }

  // Ruby Staff — fire blast at player location. Burn applied across radius.
  _castFireAOE(attack) {
    const enemies = this._activeEnemies();
    const objs = this._activeBackgroundObjects();
    const radius = 60;
    const damage = 6;
    const burnDuration = 3.0;

    this.game.combatSystem.createExplosion(
      attack.position.x, attack.position.y, radius, damage, enemies, objs, 0.4
    );
    this.game.combatSystem.applyAOEStatus(
      attack.position, radius, 'burn', burnDuration, enemies
    );
    this._spawnRingBurst(
      attack.position.x, attack.position.y, radius, 28,
      ['*', '!', '+', '\'', '·'],
      ['#ff2200', '#ff6600', '#ffaa00', '#ffdd44'],
      0.7
    );
  }

  // Sapphire Staff — blizzard, freezes all enemies in a wide ring around player.
  _castBlizzard(attack) {
    const enemies = this._activeEnemies();
    const radius = 90;
    const freezeDuration = 5.0;
    this.game.combatSystem.applyAOEStatus(
      attack.position, radius, 'freeze', freezeDuration, enemies
    );
    this._spawnRingBurst(
      attack.position.x, attack.position.y, radius, 32,
      ['*', '+', '·', '✻', '.'],
      ['#aaddff', '#88ccff', '#cceeff', '#ffffff'],
      0.9
    );
  }

  // Topaz Staff — chain lightning that originates on the nearest enemy and
  // hops outward, stunning each link.
  _castChainStun(attack) {
    const enemies = this._activeEnemies();
    if (enemies.length === 0) {
      this._spawnRingBurst(
        attack.position.x, attack.position.y, 50, 16,
        ['|', '-', '+', '·'],
        ['#ffff00', '#ffffaa', '#88ddff'],
        0.4
      );
      return;
    }

    let nearest = null;
    let nearestDist = Infinity;
    for (const enemy of enemies) {
      const dx = enemy.position.x - attack.position.x;
      const dy = enemy.position.y - attack.position.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < nearestDist) { nearest = enemy; nearestDist = dist; }
    }
    if (!nearest) return;

    const damage = 3;
    nearest.takeDamage(damage);
    nearest.applyStatusEffect('stun', 2.0);
    this.game.combatSystem.createDamageNumber?.(
      damage, nearest.position.x, nearest.position.y, '#88ddff'
    );

    // Visual arc from caster to the seed enemy
    const cs = (nearest.width || GRID.CELL_SIZE) / 2;
    this.game.combatSystem.chainArcs?.push({
      x1: attack.position.x,
      y1: attack.position.y,
      x2: nearest.position.x + cs,
      y2: nearest.position.y + cs,
      color: '#ffff66',
      timer: 0.18,
      duration: 0.18
    });

    const source = { damage, chainCount: 4 };
    this.game.combatSystem.createChainLightning(source, nearest, enemies);
  }

  // Onyx Staff — blinds enemies in a forward cone (90° spread, ~120px reach).
  _castBlindCone(attack) {
    const enemies = this._activeEnemies();
    const reach = 120;
    const halfAngle = Math.PI / 4; // 90° total
    const fx = attack.facing.x || 0;
    const fy = attack.facing.y || -1;
    const facingAngle = Math.atan2(fy, fx);
    const blindDuration = 3.0;

    for (const enemy of enemies) {
      const dx = enemy.position.x - attack.position.x;
      const dy = enemy.position.y - attack.position.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > reach || dist < 0.001) continue;
      const angle = Math.atan2(dy, dx);
      let delta = Math.abs(angle - facingAngle);
      if (delta > Math.PI) delta = 2 * Math.PI - delta;
      if (delta <= halfAngle) {
        enemy.applyStatusEffect('blind', blindDuration);
      }
    }

    this._spawnConeBurst(
      attack.position.x, attack.position.y,
      { x: Math.cos(facingAngle), y: Math.sin(facingAngle) },
      reach, 24,
      ['·', '°', '*', '.', '◌'],
      ['#222244', '#444466', '#665577', '#9988aa'],
      0.7
    );
  }

  // Emerald Staff — sprouts a filled disc of tall grass around the player.
  // Grass spawns on every walkable, unoccupied cell within radius (excluding
  // the player's own cell so the player isn't trapped in their own grass).
  _castGrassCircle(attack) {
    const game = this.game;
    const objs = this._activeBackgroundObjects();
    const collision = game.player?.collisionMap || game.currentRoom?.collisionMap;
    if (!objs || !collision) return;

    const C = GRID.CELL_SIZE;
    const centerCol = Math.floor(attack.position.x / C);
    const centerRow = Math.floor(attack.position.y / C);
    const radius = 3;

    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx === 0 && dy === 0) continue; // leave the player's tile clear
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > radius + 0.5) continue;

        const col = centerCol + dx;
        const row = centerRow + dy;
        if (row < 1 || row >= GRID.ROWS - 1 || col < 1 || col >= GRID.COLS - 1) continue;
        if (collision[row]?.[col]) continue;

        const x = col * C;
        const y = row * C;
        const occupied = objs.some(o =>
          Math.abs(o.position.x - x) < 1 && Math.abs(o.position.y - y) < 1
        );
        if (occupied) continue;

        // Paired stalks (mirrors RoomGenerator.generateGrassSwaths) — a single
        // blade looks too thin; the second blade at +6px gives the dense visual.
        objs.push(new BackgroundObject('|', x, y));
        objs.push(new BackgroundObject('|', x + 6, y));
      }
    }
    game.renderer?.markBackgroundDirty?.();

    this._spawnRingBurst(
      attack.position.x, attack.position.y, radius * C, 24,
      [',', '.', '\'', '`', '*'],
      ['#88dd44', '#55aa33', '#aaff66', '#225511'],
      0.6
    );
  }

  // Garnet Staff — charms all enemies in radius (they fight one another).
  _castCharmAOE(attack) {
    const enemies = this._activeEnemies();
    const radius = 80;
    const charmDuration = 10.0;
    this.game.combatSystem.applyAOEStatus(
      attack.position, radius, 'charm', charmDuration, enemies
    );
    this._spawnRingBurst(
      attack.position.x, attack.position.y, radius, 24,
      ['♥', '♡', '*', '+', '·'],
      ['#ff66cc', '#ff99dd', '#ffccee', '#cc3399'],
      0.8
    );
  }

  // Force Wand — roots enemies in a forward arc, interrupting attacks, then
  // hurls them in the player's facing direction. Enemies pin to walls on impact.
  _castForceBlast(attack) {
    const enemies = this._activeEnemies();
    const radius = 90;
    const halfAngle = Math.PI / 3; // 120° total spread
    const rootDuration = 0.9;
    const blastForce = 900;

    const fx = attack.facing?.x ?? 0;
    const fy = attack.facing?.y ?? -1;
    const flen = Math.sqrt(fx * fx + fy * fy) || 1;
    const ndx = fx / flen;
    const ndy = fy / flen;
    const facingAngle = Math.atan2(ndy, ndx);

    for (const enemy of enemies) {
      if (enemy.destroyed) continue;
      const ex = enemy.position.x - attack.position.x;
      const ey = enemy.position.y - attack.position.y;
      const dist = Math.sqrt(ex * ex + ey * ey);
      if (dist > radius) continue;

      // Cone check: enemy must be within the forward arc
      const enemyAngle = Math.atan2(ey, ex);
      let delta = Math.abs(enemyAngle - facingAngle);
      if (delta > Math.PI) delta = 2 * Math.PI - delta;
      if (delta > halfAngle) continue;

      enemy.applyStatusEffect('stun', rootDuration);
      enemy.forceRootTimer = rootDuration;
      enemy.forceBlastDir = { dx: ndx, dy: ndy };
      enemy.forceBlastForce = blastForce;
    }

    // AOE zone flash — cone sector rendered by ExploreRenderer
    this.game.combatSystem.aoeEffects.push({
      type: 'cone',
      x: attack.position.x + GRID.CELL_SIZE / 2,
      y: attack.position.y + GRID.CELL_SIZE / 2,
      angle: facingAngle,
      halfAngle,
      radius,
      timer: 0.4,
      maxTimer: 0.4,
      color: '#88ccff'
    });

    this._spawnConeBurst(
      attack.position.x, attack.position.y,
      { x: ndx, y: ndy },
      radius, 28,
      ['·', '°', '+', '~', '-'],
      ['#aaddff', '#88ccff', '#cceeff', '#ffffff'],
      0.5
    );
  }
}
