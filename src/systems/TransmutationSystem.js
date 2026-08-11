import { GRID } from '../game/GameConfig.js';
import { Enemy } from '../entities/Enemy.js';
import { Item } from '../entities/Item.js';
import { BackgroundObject } from '../entities/BackgroundObject.js';
import { ITEM_TYPES, ITEMS } from '../data/items.js';

// Transmutation Wand resolution. CombatSystem queues a polymorphEvent whenever
// a transmutation_bolt projectile hits an enemy (CombatSystem.polymorphEvents,
// returned each frame as combatResult.polymorphEvents). This system resolves
// what the struck enemy becomes — a separate mechanic from PolymorphSystem,
// which drives the player's own frog-curse transformation (Lake room /
// Rusalka); the two share the word "polymorph" but not a domain.
export class TransmutationSystem {
  constructor(game) {
    this.game = game;
  }

  // Called once per EXPLORE frame with the just-resolved CombatSystem result.
  // No-ops when nothing polymorphed this frame.
  processPolymorphEvents(combatResult) {
    const game = this.game;
    if (!combatResult.polymorphEvents || combatResult.polymorphEvents.length === 0) return;

    for (const event of combatResult.polymorphEvents) {
      const enemy = event.enemy;
      const pos = event.position;

      // Active layer — interior enemies live in activeFloor.enemies, not the surface.
      const polyEnemies = game._activeEnemies();
      const polyRoom = game.activeRoom;
      const enemyIndex = polyEnemies.indexOf(enemy);
      if (enemyIndex !== -1) {
        polyEnemies.splice(enemyIndex, 1);

        // Create transformation particle effect
        for (let i = 0; i < 20; i++) {
          const angle = Math.random() * Math.PI * 2;
          const speed = 50 + Math.random() * 100;
          game.particles.push({
            x: pos.x + GRID.CELL_SIZE / 2,
            y: pos.y + GRID.CELL_SIZE / 2,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life: 0.5 + Math.random() * 0.5,
            maxLife: 1.0,
            char: '*',
            color: '#ff00ff',
            isImpact: true
          });
        }

        // Polymorph transformation - weighted random outcome
        const roll = Math.random() * 100; // 0-100
        let outcome = null;

        if (roll < 20) {
          // 20% - Background object (removes enemy)
          const objects = ['%', '&', '0', 'Y', 'ŋ', '*', '#', 'p', '=', 'i', '!', 'B', 'Q', '~'];
          const randomObj = objects[Math.floor(Math.random() * objects.length)];
          game._activeBackgroundObjects().push(new BackgroundObject(randomObj, pos.x, pos.y));
          outcome = `background object (${randomObj})`;
        } else if (roll < 40) {
          // 20% - Lesser enemy (weaker enemy spawn)
          const lesserEnemies = ['o', 'g']; // Slime, Goblin (basic enemies)
          const randomEnemy = lesserEnemies[Math.floor(Math.random() * lesserEnemies.length)];
          polyEnemies.push(new Enemy(randomEnemy, pos.x, pos.y));
          outcome = `lesser enemy (${randomEnemy})`;
        } else if (roll < 60) {
          // 20% - Item drop (random weapon/armor/consumable)
          const allItems = Object.keys(ITEMS).filter(char =>
            ITEMS[char].type === ITEM_TYPES.WEAPON ||
            ITEMS[char].type === ITEM_TYPES.ARMOR ||
            ITEMS[char].type === ITEM_TYPES.CONSUMABLE
          );
          if (allItems.length > 0) {
            const randomItem = allItems[Math.floor(Math.random() * allItems.length)];
            polyRoom.items.push(new Item(randomItem, pos.x, pos.y));
            outcome = `item drop (${ITEMS[randomItem].name})`;
          }
        } else if (roll < 80) {
          // 20% - Equivalent enemy (different enemy of similar strength)
          const equivalentEnemies = ['o', 'g', 's', 'b', 'r', 't', 'w']; // Various enemies
          const randomEnemy = equivalentEnemies[Math.floor(Math.random() * equivalentEnemies.length)];
          polyEnemies.push(new Enemy(randomEnemy, pos.x, pos.y));
          outcome = `equivalent enemy (${randomEnemy})`;
        } else {
          // 20% - BOSS! (dangerous outcome)
          const bossEnemies = ['D', 'W', 'G', 'S']; // Dragon, Wizard, Golem, etc.
          const randomBoss = bossEnemies[Math.floor(Math.random() * bossEnemies.length)];
          const boss = new Enemy(randomBoss, pos.x, pos.y);
          polyEnemies.push(boss);
          outcome = `BOSS! (${randomBoss})`;
        }

      }
    }
  }
}
