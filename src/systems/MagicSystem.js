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
  '◇': 4, // Topaz
  '⬥': 4, // Garnet
  '⬦': 5, // Emerald
  '◈': 5, // Ruby
  '⬨': 5, // Sapphire
  '⬧': 6, // Onyx
  '⧫': 8  // Diamond
};

// Capacity contributed by each converted mana slot. The pool is cumulative —
// two slots hold twice the mana of one — rather than a fixed total split
// across however many slots are active.
const PER_SLOT_MANA_MAX = 10;

export class MagicSystem {
  constructor(game) {
    this.game = game;
  }

  // ─── Meter activation ────────────────────────────────────────────────────

  // Recompute meter.max from the current slot count and clamp current to it.
  // Call after any mutation of meter.slots — this is the single source of
  // truth for pool capacity (never set meter.max directly elsewhere).
  recalcMax(meter) {
    if (!meter) return;
    meter.max = PER_SLOT_MANA_MAX * Math.max(1, meter.slots?.length || 0);
    meter.current = Math.min(meter.current || 0, meter.max);
  }

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
      // Lowest consumable-slot index not already claimed as mana. This index
      // is unrelated to the weapon quick-slot array — consumable slots have
      // no "destroyed" concept of their own.
      target = 0;
      while (meter.slots.includes(target)) target++;
    }
    if (target == null || target < 0) return false;
    if (meter.slots.includes(target)) return false;

    const wasActive = this.effectiveManaSlotCount(player) > 0;
    meter.slots.push(target);
    meter.slots.sort((a, b) => a - b);
    meter.active = this.effectiveManaSlotCount(player) > 0;
    if (!wasActive && meter.active) meter.current = 0;
    this.recalcMax(meter);
    return true;
  }

  // Per-slot fill for rendering: slots fill front-to-back (lowest equipment
  // index first) and drain back-to-front, purely as a function of where each
  // slot sits in the sorted meter.slots array and the single current/max
  // scalar pool — no separate per-slot state to keep in sync.
  getSlotFill(player, slotIndex) {
    const meter = player?.magicMeter;
    if (!meter?.active || !meter.slots) return null;
    const position = meter.slots.indexOf(slotIndex);
    if (position === -1) return null;
    const perSlotMax = meter.max / meter.slots.length;
    const filledBefore = perSlotMax * position;
    const current = Math.max(0, Math.min(perSlotMax, meter.current - filledBefore));
    return { current, max: perSlotMax };
  }

  // Yellow Mage's one free mana slot — granted once, the moment they become
  // Yellow. Any further mana slots are earned the same way as every other
  // character (well ritual / infused coin) via activateMagicMeter above.
  grantYellowFreeManaSlot(player) {
    if (!player?.magicMeter) return false;
    if (player.magicMeter.freeSlotGranted) return false;
    const granted = this.activateMagicMeter(player);
    if (granted) player.magicMeter.freeSlotGranted = true;
    return granted;
  }

  // Character-specific modifier applied on top of earned mana-slot conversions.
  // Yellow's +1 is granted directly as a real converted slot (see
  // grantYellowFreeManaSlot) so it isn't double-counted here — only Red
  // Warrior's -1 penalty applies, delaying when the mana meter goes active.
  characterManaModifier(characterType) {
    return characterType === 'red' ? -1 : 0;
  }

  effectiveManaSlotCount(player) {
    const raw = player?.magicMeter?.slots?.length || 0;
    return Math.max(0, raw + this.characterManaModifier(player?.characterType));
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

  // Mana Potion auto-trigger: the only way to gain a mana slot without a true
  // (well/cauldron/Yellow-Mage) slot. While it's running, meter.active is true
  // just like a real slot, so the mana spawn trigger (main.js kill drops) and
  // the mana refill mechanic (LootSystem/CraftingSystem bypass-to-addMana)
  // apply identically — they only ever gate on meter.active.
  grantTempManaSlot(player, cd) {
    if (player?.magicMeter?.active) return false;
    this.activateTemporaryManaSlot(player, cd.duration ?? 30);
    return true;
  }

  activateTemporaryManaSlot(player, duration) {
    const meter = player?.magicMeter;
    if (!meter) return;
    meter.tempTimer = Math.max(meter.tempTimer || 0, duration);
    meter.active = true;
    meter.current = 0;
  }

  // Reverts to the true-slot state (or fully inactive) once the temporary
  // slot's timer runs out. Called every frame from update().
  _updateTempManaSlot(dt) {
    const meter = this.game.player?.magicMeter;
    if (!meter?.tempTimer) return;
    meter.tempTimer -= dt;
    if (meter.tempTimer <= 0) {
      meter.tempTimer = 0;
      meter.active = this.effectiveManaSlotCount(this.game.player) > 0;
      if (!meter.active) meter.current = 0;
    }
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
    this.game.audioSystem?.stopSFXByName('wand_charge');
  }

  // Per-frame: complete any gem-wand cast whose charge has finished.
  update(dt) {
    this._updateGemWandAutoCast();
    this._updateChargeHammer();
    this._updateTempManaSlot(dt);
  }

  _updateGemWandAutoCast() {
    const player = this.game.player;
    const wand = player?.heldItem;
    if (!wand?.data?.gemWand) return;
    if (!wand.isCharging) return;
    if (wand.chargeTime < wand.data.chargeTime) return;

    // Final mana check (could have been spent elsewhere mid-charge)
    if (!this.hasMana(player, wand.data.manaCost)) {
      wand.cancelGemWandCharge();
      this.game.audioSystem?.stopSFXByName('wand_charge');
      this.game.menuSystem?.showPickupMessage?.('NOT ENOUGH MANA');
      return;
    }

    const attack = wand.releaseGemWand();
    if (!attack) return;

    this.spendMana(player, wand.data.manaCost);
    this.game.audioSystem?.stopSFXByName('wand_charge');
    this.runSpellEffect(attack);
  }

  // Crystal Maul charge-hammer auto-fire — same hold-to-threshold lifecycle as
  // gem wands, but releases a melee attack set (no mana cost).
  _updateChargeHammer() {
    const game = this.game;
    const weapon = game.player?.heldItem;
    if (!weapon?.data?.chargeHammer || !weapon.isCharging || weapon.chargeAttackUsed) return;
    if (weapon.chargeTime < weapon.data.chargeTime) return;

    const attacks = weapon.fireChargeHammerAttack();
    if (!attacks) return;

    game.combatSystem.createAttack(game.applyGreenDamageModifier(attacks), game.currentRoom ? game.currentRoom.enemies : []);
    game._emitSoundEvent();
    const hits = Array.isArray(attacks) ? attacks : [attacks];
    const trigger = hits.find(a => a?.triggerShockwave);
    if (trigger) {
      game.playerShockwave = {
        x: trigger.shockwaveOrigin.x,
        y: trigger.shockwaveOrigin.y,
        radius: 0, prevRadius: 0,
        maxRadius: GRID.CELL_SIZE * 5,
        speed: GRID.CELL_SIZE * 8,
        color: trigger.shockwaveColor || trigger.color,
      };
    }
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

  // Layer routing delegates to the canonical game accessors (single source of truth).
  // These previously checked only inHut (missing inDungeon) and read the surface mirror,
  // so magic leaked to the surface when cast in a dungeon. Maze is suppressed by design.
  _activeEnemies() {
    return this.game._activeEnemies();
  }

  _activeBackgroundObjects() {
    return this.game._activeBackgroundObjects();
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
    // 'zap', not 'stun' — chain lightning is electric; zap carries the shake
    // visual and electric-affinity auto-immunity (EFFECT_AFFINITY).
    nearest.applyStatusEffect('zap', 2.0);
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
    this.game.lightningStrikeSystem.createChainLightning(source, nearest, enemies);
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
