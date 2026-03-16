import { Item } from '../entities/Item.js';
import { BackgroundObject } from '../entities/BackgroundObject.js';
import { Leshy } from '../entities/Leshy.js';
import { isIngredient, isItem, generateEnemyDrops } from '../data/items.js';
import { CHARACTER_TYPES } from '../data/characters.js';
import { createDebris } from '../entities/Debris.js';
import { INTERACTION_RANGE, OBJECT_ANIMATIONS, GRID } from '../game/GameConfig.js';

export class InteractionSystem {
  constructor(game) {
    this.game = game;
  }

  findNearbyBackgroundObject() {
    const game = this.game;
    // When inside a hut/dungeon, search the interior objects only
    const objects = (game.player?.inHut && game.hutInterior)
      ? game.hutInterior.backgroundObjects
      : (game.currentRoom ? game.currentRoom.backgroundObjects : game.backgroundObjects);
    for (const obj of objects) {
      const distance = game.physicsSystem.getDistance(game.player, obj);
      if (distance < INTERACTION_RANGE) {
        return obj;
      }
    }
    return null;
  }

  interactWithObject(obj) {
    const game = this.game;
    const heldItemChar = game.player.heldItem ? game.player.heldItem.char : null;
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

  handleObjectEffect(effect, obj) {
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

    // Check for zone-specific drop tables (e.g., gemstones from RED zone rocks)
    if (obj.dropTable && effect.includes('destroyObject')) {
      obj.destroyAfterAnimation = true;
      game.renderer.markBackgroundDirty();

      const rarityProfile = obj.dropTable === 'rare_gemstone' ? 'elite' : 'normal';
      const drops = generateEnemyDrops(obj.dropTable, rarityProfile, 1);

      for (const drop of drops) {
        if (isIngredient(drop)) {
          game.lootSystem.spawnIngredientDrop(drop, obj.position.x, obj.position.y);
        }
      }
      return;
    }

    // Handle destroy + spawn combined effects
    if (effect.startsWith('destroyObject:spawnIngredient:')) {
      const ingredientChar = effect.split(':')[2];
      obj.destroyAfterAnimation = true;
      game.renderer.markBackgroundDirty();
      game.lootSystem.spawnIngredientDrop(ingredientChar, obj.position.x, obj.position.y);
    } else if (effect === 'destroyObject:spawnRandom') {
      obj.destroyAfterAnimation = true;
      game.renderer.markBackgroundDirty();

      const drops = generateEnemyDrops('generic', 'weak', 1);
      for (const drop of drops) {
        if (isIngredient(drop)) {
          game.lootSystem.spawnIngredientDrop(drop, obj.position.x, obj.position.y);
        } else if (isItem(drop)) {
          game.lootSystem.spawnItemDrop(drop, obj.position.x, obj.position.y);
        }
      }
    } else if (effect === 'destroyObject') {
      obj.destroyAfterAnimation = true;
      game.renderer.markBackgroundDirty();
    } else if (effect === 'destroyObject:spawnGemstone') {
      obj.destroyAfterAnimation = true;
      game.renderer.markBackgroundDirty();
      const GEM_CHARS = ['1', '9', '`', '_', '6', '?', '('];
      const gemChar = GEM_CHARS[Math.floor(Math.random() * GEM_CHARS.length)];
      game.lootSystem.spawnIngredientDrop(gemChar, obj.position.x, obj.position.y);
    } else if (effect.startsWith('spawnIngredient:')) {
      const ingredientChar = effect.split(':')[1];
      game.lootSystem.spawnIngredientDrop(ingredientChar, obj.position.x, obj.position.y);
    } else if (effect.startsWith('spawnMultiple:')) {
      // Format: spawnMultiple:char:count
      const parts = effect.split(':');
      const ingredientChar = parts[1];
      const count = parseInt(parts[2]) || 2;

      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2 + Math.random() * 0.5;
        game.lootSystem.spawnIngredientDrop(ingredientChar, obj.position.x, obj.position.y, angle);
      }
    } else if (effect.startsWith('transformObject:')) {
      // Format: transformObject:newChar
      const newChar = effect.split(':')[1];

      const index = game.currentRoom.backgroundObjects.indexOf(obj);
      if (index !== -1) {
        const newObj = new BackgroundObject(newChar, obj.position.x, obj.position.y);
        game.currentRoom.backgroundObjects[index] = newObj;

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
      game.currentRoom.backgroundObjects.push(fire);
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
