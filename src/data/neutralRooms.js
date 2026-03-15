import { GRID } from '../game/GameConfig.js';
import { BackgroundObject } from '../entities/BackgroundObject.js';
import { Item } from '../entities/Item.js';
import { Ingredient } from '../entities/Ingredient.js';
import { ITEMS, INGREDIENTS, getItemData, isIngredient } from './items.js';

/**
 * Neutral Room Scripts
 * Define lifecycle hooks: onGenerate, onInteract, onUpdate, onExit
 */

export const NEUTRAL_ROOMS = {
  /**
   * Leshy Grove - Secret room from green zone chase event
   * 3x3 grid of tall grass, player can cut 3 of 9 for prizes
   */
  leshyGrove: {
    onGenerate(room, state) {
      // Initialize state
      state.cutsRemaining = 3;
      state.prizes = this.generatePrizes();

      const centerX = Math.floor(GRID.COLS / 2);
      const centerY = Math.floor(GRID.ROWS / 2);

      // ===== DECORATIVE BACKGROUND OBJECTS (just for looks) =====

      // Create magical forest clearing atmosphere with decorative objects
      // These are indestructible and purely visual - only the 3x3 grass grid is interactive

      // Ring of trees around the perimeter (slightly irregular for organic feel)
      const treePositions = [
        // North wall - varied spacing
        { x: 4, y: 3 }, { x: 8, y: 3 }, { x: 13, y: 3 }, { x: 18, y: 3 }, { x: 23, y: 3 }, { x: 26, y: 3 },
        // South wall - varied spacing
        { x: 5, y: 27 }, { x: 10, y: 27 }, { x: 14, y: 27 }, { x: 19, y: 27 }, { x: 24, y: 27 },
        // East wall - irregular
        { x: 27, y: 6 }, { x: 27, y: 10 }, { x: 27, y: 15 }, { x: 27, y: 20 }, { x: 27, y: 24 },
        // West wall - irregular
        { x: 3, y: 5 }, { x: 3, y: 9 }, { x: 3, y: 14 }, { x: 3, y: 19 }, { x: 3, y: 23 }
      ];

      for (const pos of treePositions) {
        const tree = new BackgroundObject('&', pos.x * GRID.CELL_SIZE, pos.y * GRID.CELL_SIZE);
        tree.indestructible = true; // Decorative only
        room.backgroundObjects.push(tree);
      }

      // Scattered mushrooms (magical grove theme) - organic clustering
      const mushroomPositions = [
        { x: 7, y: 5 }, { x: 8, y: 6 }, { x: 23, y: 6 }, { x: 24, y: 7 },
        { x: 5, y: 11 }, { x: 6, y: 10 }, { x: 24, y: 11 }, { x: 25, y: 12 },
        { x: 5, y: 16 }, { x: 25, y: 14 }, { x: 6, y: 19 }, { x: 24, y: 21 },
        { x: 7, y: 24 }, { x: 9, y: 25 }, { x: 21, y: 24 }, { x: 23, y: 25 },
        { x: 12, y: 4 }, { x: 17, y: 5 }, { x: 11, y: 26 }, { x: 20, y: 26 }
      ];

      for (const pos of mushroomPositions) {
        const mushroom = new BackgroundObject('n', pos.x * GRID.CELL_SIZE, pos.y * GRID.CELL_SIZE);
        mushroom.indestructible = true; // Decorative only
        room.backgroundObjects.push(mushroom);
      }

      // Magical crystals scattered (glowing with mystical energy)
      const crystalPositions = [
        { x: 4, y: 4 }, { x: 26, y: 5 }, { x: 5, y: 26 }, { x: 25, y: 26 },
        { x: 8, y: 9 }, { x: 21, y: 8 }, { x: 9, y: 21 }, { x: 23, y: 23 },
        { x: 15, y: 4 }, { x: 15, y: 26 } // Two extra for mystical feel
      ];

      for (const pos of crystalPositions) {
        const crystal = new BackgroundObject('*', pos.x * GRID.CELL_SIZE, pos.y * GRID.CELL_SIZE);
        crystal.indestructible = true; // Decorative only
        room.backgroundObjects.push(crystal);
      }

      // Bushes scattered between trees (varied placement)
      const bushPositions = [
        { x: 6, y: 3 }, { x: 11, y: 3 }, { x: 16, y: 3 }, { x: 21, y: 3 },
        { x: 7, y: 27 }, { x: 12, y: 27 }, { x: 17, y: 27 }, { x: 22, y: 27 }, { x: 26, y: 27 },
        { x: 27, y: 8 }, { x: 27, y: 13 }, { x: 27, y: 17 }, { x: 27, y: 22 },
        { x: 3, y: 7 }, { x: 3, y: 11 }, { x: 3, y: 16 }, { x: 3, y: 20 }
      ];

      for (const pos of bushPositions) {
        const bush = new BackgroundObject('%', pos.x * GRID.CELL_SIZE, pos.y * GRID.CELL_SIZE);
        bush.indestructible = true; // Decorative only
        room.backgroundObjects.push(bush);
      }

      // Ancient stumps (adds character to the grove) - asymmetric placement
      const stumpPositions = [
        { x: 9, y: 9 }, { x: 21, y: 10 }, { x: 10, y: 20 }, { x: 20, y: 21 },
        { x: 11, y: 12 }, { x: 19, y: 14 }, { x: 12, y: 18 }, { x: 18, y: 16 },
        { x: 6, y: 8 }, { x: 24, y: 22 } // Two extra for variety
      ];

      for (const pos of stumpPositions) {
        const stump = new BackgroundObject('Y', pos.x * GRID.CELL_SIZE, pos.y * GRID.CELL_SIZE);
        stump.indestructible = true; // Decorative only
        room.backgroundObjects.push(stump);
      }

      // Brambles for natural undergrowth (organic clustering)
      const bramblePositions = [
        { x: 5, y: 5 }, { x: 6, y: 6 }, { x: 24, y: 5 }, { x: 25, y: 6 },
        { x: 5, y: 24 }, { x: 6, y: 25 }, { x: 24, y: 24 }, { x: 25, y: 25 },
        { x: 10, y: 8 }, { x: 20, y: 7 }, { x: 11, y: 22 }, { x: 19, y: 23 },
        { x: 7, y: 12 }, { x: 22, y: 14 }, { x: 8, y: 18 }, { x: 23, y: 16 }
      ];

      for (const pos of bramblePositions) {
        const bramble = new BackgroundObject('+', pos.x * GRID.CELL_SIZE, pos.y * GRID.CELL_SIZE);
        bramble.indestructible = true; // Decorative only
        room.backgroundObjects.push(bramble);
      }

      // ===== INTERACTIVE ELEMENT: 3x3 Grid of Grass Clusters (minigame) =====

      // Each "bunch" is a 5x5 cluster of grass blades
      // Create 9 clusters arranged in a 3x3 grid
      const clusterSpacing = GRID.CELL_SIZE * 6; // 6 cells between cluster centers
      const clusterSize = 5; // 5x5 grass blades per cluster
      state.cutClusters = new Set(); // Track which clusters have been cut

      let clusterIndex = 0;
      for (let row = -1; row <= 1; row++) {
        for (let col = -1; col <= 1; col++) {
          const clusterCenterX = centerX + col * 6;
          const clusterCenterY = centerY + row * 6;

          // Create 5x5 cluster of grass blades
          for (let gy = -2; gy <= 2; gy++) {
            for (let gx = -2; gx <= 2; gx++) {
              const grassX = (clusterCenterX + gx) * GRID.CELL_SIZE;
              const grassY = (clusterCenterY + gy) * GRID.CELL_SIZE;

              const grass = new BackgroundObject('|', grassX, grassY);
              grass.leshyGrass = true;
              grass.clusterIndex = clusterIndex; // All grass in same cluster share index

              room.backgroundObjects.push(grass);
            }
          }

          clusterIndex++;
        }
      }
    },

    /**
     * Generate prize array: 9 ingredient bunches across 2 tiers.
     * 3 premium clusters (4-5 rare ingredients), 6 standard clusters (2-3 common ones).
     * Blessings are a separate system and are not items — handled in a future pass.
     */
    generatePrizes() {
      const prizes = [];

      // Rare ingredients (green-zone drops, crafting staples)
      const rarePool   = ['k', 'e', 's', 'F', 'h', 'i']; // Silk, Eye, Scale, Fire Essence, Herb, Ice
      const commonPool = ['g', 'M', 'w', 'b', 'f', 't']; // Goo, Metal, Wing, Bone, Fur, Teeth

      // 3 premium bunches (signal the best picks)
      for (let i = 0; i < 3; i++) {
        const size = 4 + Math.floor(Math.random() * 2); // 4-5 items
        const bunch = [];
        for (let j = 0; j < size; j++) {
          bunch.push(rarePool[Math.floor(Math.random() * rarePool.length)]);
        }
        prizes.push(bunch);
      }

      // 6 standard bunches
      for (let i = 0; i < 6; i++) {
        const size = 2 + Math.floor(Math.random() * 2); // 2-3 items
        const bunch = [];
        for (let j = 0; j < size; j++) {
          bunch.push(commonPool[Math.floor(Math.random() * commonPool.length)]);
        }
        prizes.push(bunch);
      }

      // Shuffle so premium clusters are distributed among the 9
      for (let i = prizes.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [prizes[i], prizes[j]] = [prizes[j], prizes[i]];
      }

      return prizes;
    },

    onInteract(target, player, room, state) {
      // Check if target is a Leshy grass blade
      if (!target.leshyGrass || target.char !== '|') {
        return null; // Not a grass blade
      }

      // Check if player has cuts remaining
      if (state.cutsRemaining <= 0) {
        return null; // Don't cut if no cuts left
      }

      const clusterIndex = target.clusterIndex;

      // Check if this cluster has already been cut
      if (state.cutClusters.has(clusterIndex)) {
        return null; // Already cut this cluster
      }

      // Mark cluster as cut (prevents re-cutting)
      state.cutClusters.add(clusterIndex);

      // Cut ALL grass blades in this cluster
      let cutCount = 0;
      const clusterCenter = { x: 0, y: 0 };
      for (const obj of room.backgroundObjects) {
        if (obj.leshyGrass && obj.clusterIndex === clusterIndex && obj.char === '|') {
          // Accumulate positions for prize spawn point
          clusterCenter.x += obj.position.x;
          clusterCenter.y += obj.position.y;
          cutCount++;

          // Animate grass cutting
          if (obj.cutGrass) {
            obj.cutGrass();
          }
        }
      }

      // Calculate center of cluster for prize spawn
      if (cutCount > 0) {
        clusterCenter.x /= cutCount;
        clusterCenter.y /= cutCount;
      }

      // Spawn prize items at cluster center
      const prizeChars = state.prizes[clusterIndex];
      const spawnedItems = [];

      for (const char of prizeChars) {
        const itemData = getItemData(char);
        if (!itemData) {
          console.error(`[LESHY SPAWN] ERROR: Invalid char '${char}'`);
          continue;
        }

        // Create proper entity type (Ingredient vs Item)
        let entity;
        const isIngr = isIngredient(char);
        if (isIngr) {
          entity = new Ingredient(char, clusterCenter.x, clusterCenter.y);
          entity.pickupCooldown = 1.5; // Same cooldown as enemy drops — prevents instant magnet
        } else {
          entity = new Item(char, clusterCenter.x, clusterCenter.y);
        }

        // Add velocity for visual scatter effect
        entity.velocity = {
          vx: (Math.random() - 0.5) * 100,
          vy: (Math.random() - 0.5) * 100
        };
        spawnedItems.push(entity);
      }

      // Decrement cuts
      state.cutsRemaining--;

      // After 3 picks: auto-cut remaining clusters and start celebration
      if (state.cutsRemaining === 0) {
        for (const obj of room.backgroundObjects) {
          if (obj.leshyGrass && obj.char === '|') {
            obj.cutGrass();
          }
        }
        state.celebrationActive = true;
        state.celebrationTimer = 4.0;
        state.celebrationTime = 0;
      }

      // Return spawned items so they can be added to game
      return { spawnedItems };
    },

    onUpdate(deltaTime, room, player, state) {
      if (state.celebrationActive) {
        state.celebrationTimer -= deltaTime;
        state.celebrationTime = (state.celebrationTime || 0) + deltaTime;
        if (state.celebrationTimer <= 0) {
          state.celebrationActive = false;
        }
      }
    },

    onRender(renderer, room, player, state) {
      if (!state.celebrationActive) return;

      const centerX = Math.floor(GRID.COLS / 2) * GRID.CELL_SIZE + GRID.CELL_SIZE / 2;
      const centerY = Math.floor(GRID.ROWS / 2) * GRID.CELL_SIZE + GRID.CELL_SIZE / 2;
      // Hop at ~5 cycles per second, 4px amplitude; fade out in the last 0.5s
      const bobOffset = Math.sin(state.celebrationTime * Math.PI * 10) * 4;
      const alpha = Math.min(1, state.celebrationTimer / 0.5);
      renderer.drawTextWithAlpha(centerX, centerY + bobOffset, 'l', '#00ff00', alpha);
    },

    onExit(room, player, state) {
      // Clean exit - no special logic needed
    }
  }
};
