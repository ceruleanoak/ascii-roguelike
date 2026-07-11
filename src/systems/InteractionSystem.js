import { Item } from '../entities/Item.js';
import { BackgroundObject } from '../entities/BackgroundObject.js';
import { Leshy } from '../entities/Leshy.js';
import { Fairy } from '../entities/Fairy.js';
import { isIngredient, isItem, generateEnemyDrops } from '../data/items.js';
import { getZoneRandomEnemy } from '../data/enemies.js';
import { CHARACTER_TYPES } from '../data/characters.js';
import { createDebris } from '../entities/Debris.js';
import { createIceBurst, Particle } from '../entities/Particle.js';
import { INTERACTION_RANGE, OBJECT_ANIMATIONS, GRID, GAME_STATES } from '../game/GameConfig.js';
import { inSamePlane, planeOf, objectOnPlane } from './PlaneSystem.js';
import { WiseFellow } from '../entities/WiseFellow.js';

export class InteractionSystem {
  constructor(game) {
    this.game = game;
    this._lavaWaterCheckTimer = 0;
  }

  // SPACE in REST with nothing nearby to interact with — expanding fade-out
  // ring at the player as feedback. Tracks the player's live position (see
  // RestRenderer), so no position is captured here. Decayed/removed in
  // WorldEffectsSystem.
  spawnIdleEcho() {
    this.game.idleEchoes.push({ age: 0 });
  }

  // Each zone's rocks hide a different mineral (rock-harvest rare slot and the
  // once-per-rock poke drop). Red owns Metal; yellow is the gem/magic zone;
  // cyan feeds the bow path. Unlisted zones (gray, blue) hide nothing extra.
  getZoneMineral(zone) {
    switch (zone) {
      case 'green':  return '❦';                       // Moss
      case 'red':    return 'M';                       // Metal
      case 'yellow': {                                 // Gemstone
        const gems = ['1', '9', '`', '?', '('];
        return gems[Math.floor(Math.random() * gems.length)];
      }
      case 'cyan':   return '△';                       // Arrowhead
      default:       return null;
    }
  }

  // Vault (V room): true when the player stands south of the vault's bottom
  // wall, roughly centered, with the vault key ߃ held.
  canUnlockVault() {
    const game = this.game;
    // Only check in EXPLORE mode with a current room and vault
    const state = game.stateMachine.getCurrentState();
    if (state !== GAME_STATES.EXPLORE || !game.currentRoom || !game.currentRoom.vaultInfo) {
      return false;
    }

    const vault = game.currentRoom.vaultInfo;

    // Check if vault is already unlocked
    if (vault.unlocked) {
      return false;
    }

    // Check if player has the vault key equipped (in active quick slot)
    const hasKey = game.player.heldItem && game.player.heldItem.char === '߃';
    if (!hasKey) {
      return false;
    }

    // Player must be SOUTH (outside) of the bottom wall and horizontally centered
    const playerGridX = Math.floor(game.player.position.x / GRID.CELL_SIZE);
    const playerGridY = Math.floor(game.player.position.y / GRID.CELL_SIZE);

    const isSouthOfVault = playerGridY > vault.bottomWallRow; // Player is below/south of the wall
    const distanceToCenter = Math.abs(playerGridX - vault.centerCol);
    const maxCenterDist = vault.size / 2 + 2; // Lenient horizontal range
    const isNearCenter = distanceToCenter <= maxCenterDist;

    return isSouthOfVault && isNearCenter;
  }

  // Open the vault: clear the bottom wall, consume the key, debris burst.
  unlockVault() {
    const game = this.game;
    const vault = game.currentRoom.vaultInfo;
    if (!vault || vault.unlocked) return;

    // Remove bottom wall from collision map
    const bottomRow = vault.bottomWallRow;
    for (let col = vault.minCol; col <= vault.maxCol; col++) {
      game.currentRoom.collisionMap[bottomRow][col] = false;
    }

    // Mark vault as unlocked
    vault.unlocked = true;

    // Remove key from active quick slot (consumed)
    if (game.player.heldItem && game.player.heldItem.char === '߃') {
      game.player.quickSlots[game.player.activeSlotIndex] = null;

      // Auto-switch to next filled slot if available
      const nextFilled = game.player.quickSlots.findIndex((slot, idx) =>
        idx !== game.player.activeSlotIndex && slot !== null
      );
      if (nextFilled !== -1) {
        game.player.activeSlotIndex = nextFilled;
      }
    }

    // Mark background dirty to show wall removal
    game.renderer.markBackgroundDirty();

    // Visual feedback - create some debris particles
    const centerX = vault.centerCol * GRID.CELL_SIZE + (GRID.CELL_SIZE / 2);
    const bottomY = bottomRow * GRID.CELL_SIZE + (GRID.CELL_SIZE / 2);

    for (let i = 0; i < 10; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 50 + Math.random() * 50;
      const particle = new Particle(
        centerX,
        bottomY,
        '#',                    // char
        '#888888',              // color
        {                       // velocity
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed
        },
        0.8                     // lifetime
      );
      game.particles.push(particle);
    }
  }

  // Artifact ⚜ → wise fellow: consume the artifact, unlock the rare-tier hint
  // for the current zone. Returns true if a wise fellow in range took it.
  tryGiveArtifactToWiseFellow(npcArray) {
    const game = this.game;
    if (!npcArray) return false;
    for (const npc of npcArray) {
      if (!(npc instanceof WiseFellow)) continue;
      const dist = Math.hypot(
        game.player.position.x - npc.position.x,
        game.player.position.y - npc.position.y
      );
      if (dist > GRID.CELL_SIZE * 2) continue;
      const idx = game.player.inventory.indexOf('⚜');
      if (idx === -1) continue;
      game.player.inventory.splice(idx, 1);
      npc.unlockRareHint(game.currentRoom?.zone || 'green');
      return true;
    }
    return false;
  }

  // Check lava tiles adjacent to water tiles and solidify them
  update(deltaTime, backgroundObjects) {
    // ── Player shockwave — runs every frame (creation handled in main.js) ────
    const sw = this.game.playerShockwave;
    if (sw) {
      sw.prevRadius = sw.radius;
      sw.radius += sw.speed * deltaTime;

      const playerPlane = planeOf(this.game.player);

      // Shake any background object the ring sweeps past (only on player's plane).
      for (const obj of backgroundObjects) {
        if (obj.destroyed) continue;
        if (!objectOnPlane(obj, playerPlane)) continue;
        const cx = obj.position.x + GRID.CELL_SIZE / 2;
        const cy = obj.position.y + GRID.CELL_SIZE / 2;
        const dist = Math.hypot(cx - sw.x, cy - sw.y);
        if (dist > sw.prevRadius && dist <= sw.radius) {
          obj._playAnimation?.('shake');
        }
      }

      // Knock back enemies the ring sweeps past (only on player's plane).
      for (const enemy of this.game._activeEnemies()) {
        if (enemy.hp <= 0) continue;
        if (!inSamePlane(this.game.player, enemy)) continue;
        const cx = enemy.position.x + GRID.CELL_SIZE / 2;
        const cy = enemy.position.y + GRID.CELL_SIZE / 2;
        const dist = Math.hypot(cx - sw.x, cy - sw.y);
        if (dist > sw.prevRadius && dist <= sw.radius) {
          this.game.physicsSystem.applyKnockback(enemy, sw.x, sw.y, 320, 0.18);
        }
      }

      if (sw.radius >= sw.maxRadius) {
        this.game.playerShockwave = null;
      }
    }

    // ── Lava/water solidification (throttled) ────────────────────────────────
    this._lavaWaterCheckTimer -= deltaTime;
    if (this._lavaWaterCheckTimer > 0) return;
    this._lavaWaterCheckTimer = 0.5;

    const combatSystem = this.game.combatSystem;
    const adjacentDist = GRID.CELL_SIZE * 1.5;

    for (const lava of backgroundObjects) {
      if (!lava.isLava || !lava.isLava()) continue;
      let solidified = false;
      for (const other of backgroundObjects) {
        if (other === lava || other.destroyed) continue;
        const dx = lava.position.x - other.position.x;
        const dy = lava.position.y - other.position.y;
        if (dx * dx + dy * dy > adjacentDist * adjacentDist) continue;

        const isWaterTile = (other.isWater && other.isWater()) || other.char === '=';
        if (isWaterTile) {
          lava.solidifyToRock();
          combatSystem.newSteamClouds.push({
            x: lava.position.x + GRID.CELL_SIZE / 2,
            y: lava.position.y + GRID.CELL_SIZE / 2,
            radius: GRID.CELL_SIZE * 2,
            timer: 3.0
          });
          solidified = true;
          break;
        }

        // Lava burns flammable neighbors. Rock/wall/metal (flammability 'none')
        // and other lava are immune.
        if (other.isLava && other.isLava()) continue;
        if (other.isFlammable && other.isFlammable() && !other.onFire) {
          other.ignite(other.data?.burnDuration || 2.0);
        }
      }
      if (solidified) continue;
    }
  }

  findNearbyBackgroundObject() {
    const game = this.game;
    // When inside a hut/dungeon/maze, search the appropriate objects
    const objects = (game.player?.inMaze && game.mazeInterior)
      ? [] // Maze objects handled by MazeSystem, not InteractionSystem
      : ((game.player?.inHut || game.player?.inDungeon) && game.activeFloor)
        ? game.activeFloor.backgroundObjects
        : (game.currentRoom ? game.currentRoom.backgroundObjects : game.backgroundObjects);
    const playerPlane = planeOf(game.player);
    for (const obj of objects) {
      if (!objectOnPlane(obj, playerPlane)) continue;
      const distance = game.physicsSystem.getDistance(game.player, obj);
      if (distance < INTERACTION_RANGE) {
        return obj;
      }
    }
    return null;
  }

  // Fairy touch resolution. Called per-frame from main.js for each Fairy in
  // neutralCharacters. Returns true if the fairy was consumed by the touch
  // (heal or bottle conversion), so the caller can despawn it.
  //
  // Outcomes (priority order):
  //   1. Player has an Empty Bottle ('B') equipped + is at full HP →
  //      convert the bottle slot to 'fairy_in_a_bottle' (⚱). One-shot revive.
  //   2. Otherwise → heal to full.
  //
  // Only fires while the fairy is in 'flutter' state. Fleeing/dusting/
  // delivering fairies don't react to touch.
  // Shared by Game.updateExploreState and Game.updateNeutralState — handles
  // Leshy (chase-start on reaching an exit) and Fairy (bottle-catch via
  // checkFairyTouch) neutral characters. The Leshy branch is a no-op in
  // NEUTRAL state since no Leshy is ever pushed into neutralCharacters there.
  updateNeutralCharacters(deltaTime) {
    const game = this.game;
    for (let i = game.neutralCharacters.length - 1; i >= 0; i--) {
      const char = game.neutralCharacters[i];
      char.update(deltaTime, game);

      if (char instanceof Leshy && char.reachedExit) {
        const exitDirection = char.targetExit;
        if (game.currentRoom.exits[exitDirection]) {
          if (typeof game.currentRoom.exits[exitDirection] === 'object') {
            game.currentRoom.exits[exitDirection].chaseEvent = true;
          } else {
            game.currentRoom.exits[exitDirection] = {
              chaseEvent: true,
              letter: game.currentRoom.exits[exitDirection].letter || '?',
              color: game.currentRoom.exits[exitDirection].color || '#00ff00'
            };
          }
          game.zoneSystem.startLeshyChase(exitDirection);
        }
        game.neutralCharacters.splice(i, 1);
        continue;
      }

      if (char instanceof Fairy) {
        this.checkFairyTouch?.(char);
        if (char.consumed || char.state === 'exited') {
          game.neutralCharacters.splice(i, 1);
          continue;
        }
      }
    }
  }

  checkFairyTouch(fairy) {
    const game = this.game;
    const player = game.player;
    if (!player || !fairy) return false;
    if (fairy.state !== 'flutter') return false;
    if (fairy.consumed) return false;
    // Spawn-grace: ignore touches for the first ~2s so the player can see the
    // fairy before incidentally consuming it.
    if ((fairy.touchImmunityTimer ?? 0) > 0) return false;

    // AABB overlap between player hitbox and fairy hitbox
    const fh = fairy.getHitbox();
    const px = player.position.x;
    const py = player.position.y;
    const pw = player.width  ?? GRID.CELL_SIZE;
    const ph = player.height ?? GRID.CELL_SIZE;
    if (px + pw < fh.x || px > fh.x + fh.width)  return false;
    if (py + ph < fh.y || py > fh.y + fh.height) return false;

    // Bottle conversion path: empty bottle ('B') equipped + at full HP
    const consumables = player.equippedConsumables;
    const fullHP = player.hp >= player.maxHp;
    if (fullHP && Array.isArray(consumables)) {
      for (let i = 0; i < consumables.length; i++) {
        const slot = consumables[i];
        if (slot?.data?.char === 'B') {
          // Replace the empty bottle with a fairy_in_a_bottle (⚱)
          const inv = game.inventorySystem;
          if (inv) {
            inv.replaceConsumableSlot?.(i, '⚱')
              || this._fallbackReplaceConsumableSlot(i, '⚱');
          } else {
            this._fallbackReplaceConsumableSlot(i, '⚱');
          }
          game.menuSystem?.showPickupMessage?.('CAUGHT A FAIRY!');
          game.audioSystem?.playSFX?.('fairy_pickup');
          game.menuSystem?.updateUI?.();
          fairy.consume();
          return true;
        }
      }
    }

    // Default: full heal. No text — the HP readout blinks instead.
    player.hp = player.maxHp;
    game.audioSystem?.playSFX?.('fairy_pickup');
    game.menuSystem?.updateUI?.();
    this._blinkHPDisplay();
    fairy.consume();
    return true;
  }

  // Retrigger the HP heal-blink CSS animation by toggling the class off/on.
  _blinkHPDisplay() {
    const el = document.getElementById('hp-display');
    if (!el) return;
    el.classList.remove('heal-blink');
    // Force reflow so removing+re-adding restarts the animation.
    void el.offsetWidth;
    el.classList.add('heal-blink');
  }

  // Fallback when InventorySystem doesn't expose a slot-replace helper. Writes
  // a minimal item-like wrapper directly into both inventory and player slots.
  _fallbackReplaceConsumableSlot(slotIndex, newChar) {
    const game = this.game;
    const newItem = new Item(newChar, 0, 0);
    const inv = game.inventorySystem;
    if (inv?.equippedConsumables) {
      inv.equippedConsumables[slotIndex] = newItem;
    }
    if (game.player?.equippedConsumables) {
      game.player.equippedConsumables[slotIndex] = newItem;
    }
  }

  // Spacebar-triggered container open: bypasses HP/damage and runs the
  // object's dropEffect directly. Used for barrels, crates, metal boxes —
  // any object whose acceptsInteractions includes 'spacebar' or 'all'.
  openContainer(obj) {
    if (!obj || obj.destroyed || obj.destroyAfterAnimation) return;
    if (!obj.data.dropEffect) return;
    obj.destroyAfterAnimation = true;
    obj._playAnimation('crack');
    this.handleObjectEffect(obj.data.dropEffect, obj);
    this.game.renderer.markBackgroundDirty();
  }

  interactWithObject(obj) {
    const game = this.game;
    const heldItemChar = game.player.heldItem ? game.player.heldItem.char : null;

    // Liquid discovery: check if player has empty bottle and is interacting with liquid tile
    if (heldItemChar === 'B' && this._isLiquidTile(obj)) {
      const liquidChar = this._getLiquidType(obj);
      if (liquidChar) {
        this._discoverLiquidBottle(liquidChar);
        return;
      }
    }

    const result = obj.interact(heldItemChar);

    // Leshy spawn event: trigger on ANY interaction with shaking bush (not just destruction)
    if (obj.leshyBush && !obj.leshySpawned) {
      obj.leshySpawned = true; // Mark to prevent multiple spawns
      const leshy = new Leshy(obj.position.x, obj.position.y, game.currentRoom.exits);
      leshy.startFleeing();
      game.neutralCharacters.push(leshy);
      game.zoneSystem.startLeshyChase(leshy.targetExit);
      console.log(`[Secret] Leshy discovered! Fleeing to ${leshy.targetExit} exit`);
    }

    if (result.effect) {
      this.handleObjectEffect(result.effect, obj);
    }

    if (result.message) {
      console.log(result.message);
    }
  }

  _isLiquidTile(obj) {
    return obj.isWater?.() || obj.isLava?.() || obj.isMud?.();
  }

  _getLiquidType(obj) {
    if (obj.isWater?.() && obj.waterState === 'electrified') return 'ε';
    if (obj.isLava?.()) return '◆';
    if (obj.isMud?.()) return '◐';
    if (obj.isWater?.() && obj.waterState === 'normal') return '🜉';
    return null;
  }

  _discoverLiquidBottle(liquidChar) {
    const game = this.game;
    const slots = game.player.equippedConsumables;
    const slotIndex = slots?.findIndex(s => s?.char === 'B') ?? -1;
    if (slotIndex === -1) return;

    game.inventorySystem.replaceConsumableSlot(slotIndex, liquidChar);
    const liquidNames = {
      '🜉': 'BOTTLE OF WATER',
      'ε': 'BOTTLE OF ELECTRIFIED WATER',
      '◆': 'BOTTLE OF MAGMA',
      '◐': 'BOTTLE OF MUD'
    };
    game.menuSystem.showPickupMessage(liquidNames[liquidChar] || 'LIQUID');
    game.audioSystem?.playSFX?.('pickup');
    game.updateUI();
  }

  handleObjectEffect(effect, obj, attack = null) {
    const game = this.game;
    if (!effect) return;

    // Check for key drops in K rooms (vault key system)
    if (obj.dropsKey && effect.includes('destroyObject')) {
      obj.destroyAfterAnimation = true;
      game.renderer.markBackgroundDirty();

      const key = new Item(obj.keyChar, obj.position.x, obj.position.y);
      game.items.push(key);
      game.physicsSystem.addEntity(key);
      return;
    }

    // Rock harvest is checked BEFORE generic dropTable so mineral-formation rocks
    // (which have dropTable='basic' set by RoomGenerator) still get the guaranteed
    // Rock drop. Zone dropTable extras stack on top of the harvest rolls.
    if (effect === 'destroyObject:rockHarvest') {
      obj.destroyAfterAnimation = true;
      game.renderer.markBackgroundDirty();
      // Guaranteed Rock + a ~7% zone mineral (each zone's rocks hide a different
      // rare: knowledge of WHERE to smash rocks is the gate) + 3% Artifact.
      const rolls = [
        { char: '0', chance: 0.50 },
        { char: '⚜', chance: 0.03 }
      ];
      const zoneMineral = this.getZoneMineral(game.currentRoom?.zone);
      if (zoneMineral) rolls.splice(1, 0, { char: zoneMineral, chance: 0.07 });
      let i = 0;
      for (const r of rolls) {
        if (Math.random() < r.chance) {
          const angle = (i / rolls.length) * Math.PI * 2 + Math.random() * 0.4;
          if (isIngredient(r.char)) {
            game.lootSystem.spawnIngredientDrop(r.char, obj.position.x, obj.position.y, angle, obj);
          } else {
            game.lootSystem.spawnItemDrop(r.char, obj.position.x, obj.position.y, angle, obj);
          }
          i++;
        }
      }
      // Zone-formation rocks also roll their dropTable bonus (e.g. red-zone gemstones).
      if (obj.dropTable) {
        const rarityProfile = obj.dropTable === 'rare_gemstone' ? 'elite' : 'normal';
        const extras = generateEnemyDrops(obj.dropTable, rarityProfile, 1);
        for (const drop of extras) {
          if (isIngredient(drop)) {
            const angle = Math.random() * Math.PI * 2;
            game.lootSystem.spawnIngredientDrop(drop, obj.position.x, obj.position.y, angle, obj);
          }
        }
      }
      return;
    }

    // Check for zone-specific drop tables (e.g., gemstones from RED zone rocks)
    if (obj.dropTable && effect.includes('destroyObject')) {
      obj.destroyAfterAnimation = true;
      game.renderer.markBackgroundDirty();

      const rarityProfile = obj.dropTable === 'rare_gemstone' ? 'elite' : 'normal';
      const drops = generateEnemyDrops(obj.dropTable, rarityProfile, 1);

      for (const drop of drops) {
        if (isIngredient(drop)) {
          game.lootSystem.spawnIngredientDrop(drop, obj.position.x, obj.position.y, null, obj);
        }
      }
      return;
    }

    // Handle destroy + spawn combined effects
    if (effect.startsWith('destroyObject:spawnIngredient:')) {
      const ingredientChar = effect.split(':')[2];

      obj.destroyAfterAnimation = true;
      game.renderer.markBackgroundDirty();
      // Not always an ingredient char — e.g. the caldera Ember Bush drops the
      // Unicode/CONSUMABLE Fire Berry, which needs the Item pickup pipeline.
      if (isIngredient(ingredientChar)) {
        game.lootSystem.spawnIngredientDrop(ingredientChar, obj.position.x, obj.position.y, null, obj);
      } else {
        game.lootSystem.spawnItemDrop(ingredientChar, obj.position.x, obj.position.y, null, obj);
      }

      // Tree harvest mirrors rockHarvest: guaranteed Stick above, plus a 15%
      // sap bonus (red/cyan zones carry rare elemental saps; others common ŝ).
      if (obj.originalChar === 'Y' && Math.random() < 0.15) {
        const zone = game.currentRoom?.zone;
        const sapChar = zone === 'red' ? 'š' : zone === 'cyan' ? 'ş' : 'ŝ';
        const angle = Math.random() * Math.PI * 2;
        game.lootSystem.spawnIngredientDrop(sapChar, obj.position.x, obj.position.y, angle, obj);
      }
    } else if (effect === 'destroyObject:spawnRandom') {
      obj.destroyAfterAnimation = true;
      game.renderer.markBackgroundDirty();

      // Barrels are provisions caches: 25% of non-empty barrels yield a bread
      // loaf instead of a generic roll (hut floor-spawn rate was cut in favor
      // of this path). Crates/metal boxes share spawnRandom and are unaffected.
      if (obj.originalChar === 'p' && Math.random() < 0.25) {
        game.lootSystem.spawnItemDrop('⌬', obj.position.x, obj.position.y, null, obj);
      } else {
        const drops = generateEnemyDrops('generic', 'weak', 1);
        for (const drop of drops) {
          if (isIngredient(drop)) {
            game.lootSystem.spawnIngredientDrop(drop, obj.position.x, obj.position.y, null, obj);
          } else if (isItem(drop)) {
            game.lootSystem.spawnItemDrop(drop, obj.position.x, obj.position.y, null, obj);
          }
        }
      }
    } else if (effect === 'destroyObject:spawnChestLoot') {
      obj.destroyAfterAnimation = true;
      game.renderer.markBackgroundDirty();
      game.audioSystem?.playSFX('chest_open');

      const drops = generateEnemyDrops('generic', 'normal', 2);
      for (const drop of drops) {
        if (isIngredient(drop)) {
          game.lootSystem.spawnIngredientDrop(drop, obj.position.x, obj.position.y, null, obj);
        } else if (isItem(drop)) {
          game.lootSystem.spawnItemDrop(drop, obj.position.x, obj.position.y, null, obj);
        }
      }
      // Rare Artifact roll on chests — separate from generic loot pool so it
      // doesn't leak into barrels/crates (which share `generic`). 10% per chest.
      if (Math.random() < 0.10) {
        game.lootSystem.spawnIngredientDrop('⚜', obj.position.x, obj.position.y, null, obj);
      }
    } else if (effect === 'destroyObject') {
      obj.destroyAfterAnimation = true;
      game.renderer.markBackgroundDirty();
    } else if (effect === 'cutGrass') {
      // Frozen grass (tinted by a Freeze Trap) emits an ice burst when sliced.
      if (obj.frozen) {
        game.particles.push(...createIceBurst(
          obj.position.x + GRID.CELL_SIZE / 2,
          obj.position.y + GRID.CELL_SIZE / 2
        ));
      }
      // Grass drop table — rolled independently per grass object cut.
      // Thresholds are 1/8 of the per-swing values so that ~8 blades per swing
      // yields the same expected drop rate as before.
      {
        const roll = Math.random();
        if (roll < 0.0006) {
          // Very rare: chest
          const chest = new BackgroundObject('⊞', obj.position.x, obj.position.y);
          chest.spawnImmunityTimer = 1.0;
          game.currentRoom.backgroundObjects.push(chest);
          game.renderer.markBackgroundDirty();
        } else if (roll < 0.0013) {
          // Very rare: coin
          game.lootSystem.spawnIngredientDrop('c', obj.position.x, obj.position.y, null, obj);
        } else if (roll < 0.00739) {
          // Uncommon: beast lurking in the grass (spawn chance reduced 30% from baseline)
          if (game.currentRoom.enemies.length < 10) {
            const beastChar = getZoneRandomEnemy(game.currentDepth, game.currentRoom?.zone);
            const spawned = game.roomGenerator.spawnEnemiesFrom(game, obj, {
              spawnChar: beastChar,
              spawnCount: 1,
              spawnRange: GRID.CELL_SIZE * 2,
              spawnerPosition: { x: obj.position.x, y: obj.position.y }
            });
            game.currentRoom.enemies.push(...spawned);
          }
        } else if (roll < 0.01179) {
          // Uncommon: stick
          game.lootSystem.spawnIngredientDrop('|', obj.position.x, obj.position.y, null, obj);
        } else if (roll < 0.01619) {
          // Uncommon: rock
          game.lootSystem.spawnIngredientDrop('0', obj.position.x, obj.position.y, null, obj);
        } else if (roll < 0.01929) {
          // Uncommon: pollen (raw oil)
          game.lootSystem.spawnIngredientDrop('ł', obj.position.x, obj.position.y, null, obj);
        } else if (roll < 0.01979) {
          // Rare: axe head
          game.lootSystem.spawnIngredientDrop('⊿', obj.position.x, obj.position.y, null, obj);
        } else if (roll < 0.02029) {
          // Rare: arrowhead
          game.lootSystem.spawnIngredientDrop('△', obj.position.x, obj.position.y, null, obj);
        }
      }
      // Fairy grass: blade-cut releases the fairy. Multiple grass tiles in the
      // room are marked; the first one cut spawns the fairy, the rest are inert.
      if (obj.fairyGrass && !game.currentRoom?.fairySpawned && !game.fairiesAngered) {
        game.currentRoom.fairySpawned = true;
        const fairy = new Fairy(
          obj.position.x + GRID.CELL_SIZE / 2,
          obj.position.y + GRID.CELL_SIZE / 2,
          game.currentRoom.exits
        );
        game.neutralCharacters.push(fairy);
        console.log('[Secret] Fairy discovered!');
      }
    } else if (effect === 'destroyObject:spawnGemstone') {
      obj.destroyAfterAnimation = true;
      game.renderer.markBackgroundDirty();
      // Always drop 1-2 regular stones (building material for bridge quest).
      const stoneCount = Math.random() < 0.5 ? 2 : 1;
      for (let i = 0; i < stoneCount; i++) {
        const angle = (i / stoneCount) * Math.PI * 2 + Math.random() * 0.5;
        game.lootSystem.spawnIngredientDrop('0', obj.position.x, obj.position.y, angle, obj);
      }
      // Gem drop: 25% chance per rock; guaranteed on the last rock if none found yet.
      const GEM_CHARS = ['◇', '⬥', '⬦', '⧫', '⬧', '◈', '⬨'];
      if (!game.currentRoom.miningGemDropped) {
        const rocksRemaining = game._activeBackgroundObjects().filter(
          o => !o.destroyed && o.data?.glitteringRock && o !== obj
        ).length;
        if (rocksRemaining === 0 || Math.random() < 0.25) {
          game.currentRoom.miningGemDropped = true;
          const gemChar = GEM_CHARS[Math.floor(Math.random() * GEM_CHARS.length)];
          game.lootSystem.spawnIngredientDrop(gemChar, obj.position.x, obj.position.y, null, obj);
        }
      }
    } else if (effect.startsWith('destroyObject:spawnWeapon:')) {
      const weaponChar = effect.split(':')[2];
      obj.destroyAfterAnimation = true;
      game.renderer.markBackgroundDirty();
      const weapon = new Item(weaponChar, obj.position.x, obj.position.y);
      game.items.push(weapon);
      game.physicsSystem.addEntity(weapon);
    } else if (effect.startsWith('spawnIngredient:')) {
      let ingredientChar = effect.split(':')[1];

      // Rock poke (bullet/staff '/' interaction): yields the zone mineral
      // instead of the data-table Metal, and only once per rock — the
      // repeatable guaranteed-Metal poke was the gun-leveling faucet.
      if (obj.char === '0' || obj.originalChar === '0') {
        if (obj.pokeMineralClaimed) return;
        obj.pokeMineralClaimed = true;
        const zoneMineral = this.getZoneMineral(game.currentRoom?.zone);
        if (!zoneMineral) return;
        ingredientChar = zoneMineral;
      }

      if (isIngredient(ingredientChar)) {
        game.lootSystem.spawnIngredientDrop(ingredientChar, obj.position.x, obj.position.y, null, obj);
      } else {
        game.lootSystem.spawnItemDrop(ingredientChar, obj.position.x, obj.position.y, null, obj);
      }
    } else if (effect.startsWith('spawnMultiple:')) {
      // Format: spawnMultiple:char:count
      const parts = effect.split(':');
      const ingredientChar = parts[1];
      const count = parseInt(parts[2]) || 2;

      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2 + Math.random() * 0.5;
        game.lootSystem.spawnIngredientDrop(ingredientChar, obj.position.x, obj.position.y, angle, obj);
      }
    } else if (effect.startsWith('transformObject:')) {
      // Format: transformObject:newChar
      const newChar = effect.split(':')[1];

      const activeBgObjects = game._activeBackgroundObjects();
      const index = activeBgObjects.indexOf(obj);
      if (index !== -1) {
        const newObj = new BackgroundObject(newChar, obj.position.x, obj.position.y);
        activeBgObjects[index] = newObj;

        const animData = OBJECT_ANIMATIONS['freeze'] || OBJECT_ANIMATIONS['melt'];
        if (animData) {
          newObj.currentAnimation = {
            type: 'transform',
            data: animData,
            elapsed: 0
          };
        }

        game.renderer.markBackgroundDirty();
      }
    } else if (effect === 'spawnFire') {
      const fire = new BackgroundObject('!', obj.position.x, obj.position.y);
      game._activeBackgroundObjects().push(fire);
      obj.destroyAfterAnimation = true;
      game.renderer.markBackgroundDirty();
    } else if (effect.startsWith('spawnCloud:')) {
      // Format: spawnCloud:type (poison, smoke, etc.)
      const cloudType = effect.split(':')[1];
      const cloudColor = cloudType === 'poison' ? '#88ff00' : '#888888';

      for (let i = 0; i < 10; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 50 + 30;
        const particle = {
          x: obj.position.x + GRID.CELL_SIZE / 2,
          y: obj.position.y + GRID.CELL_SIZE / 2,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 1.0,
          maxLife: 1.0,
          char: '·',
          color: cloudColor,
          size: 4
        };
        game.particles.push(particle);
      }
    }
  }

  checkCaptiveInteraction() {
    const game = this.game;
    if (!game.captives || game.captives.length === 0) return false;

    for (const captive of game.captives) {
      if (captive.freed) continue;

      const dist = Math.hypot(
        game.player.position.x - captive.position.x,
        game.player.position.y - captive.position.y
      );

      if (dist < INTERACTION_RANGE * 2) {
        if (!captive.cageDestroyed) {
          // First interaction: destroy the cage
          captive.cageDestroyed = true;

          const cageDebris = createDebris(
            captive.position.x,
            captive.position.y,
            12,
            '#ffaa00'
          );
          game.debris.push(...cageDebris);

          game.captiveInteractionThisFrame = true;
          return true;
        } else {
          // Second interaction: recruit the character
          captive.freed = true;
          game.unlockedCharacters.push(captive.characterType);
          const charData = CHARACTER_TYPES[captive.characterType];
          game.showPickupMessage(`${charData.name} obtained`);
          game.saveGameState();

          game.captiveInteractionThisFrame = true;
          return true;
        }
      }
    }
    return false;
  }
}
