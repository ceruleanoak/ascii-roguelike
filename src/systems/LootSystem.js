import { Ingredient } from '../entities/Ingredient.js';
import { Item } from '../entities/Item.js';
import { isIngredient, isItem, generateEnemyDrops } from '../data/items.js';

export class LootSystem {
  constructor(game) {
    this.game = game;
  }

  spawnLoot(enemy) {
    const game = this.game;
    const luckMult = (game.player && game.player.luckTimer > 0) ? 1.75 : 1.0;

    let drops = [];
    if (enemy.data.dropTable && enemy.data.rarityProfile) {
      const baseDropCount = enemy.data.isBoss ? 3 : null;
      const generatedDrops = generateEnemyDrops(
        enemy.data.dropTable,
        enemy.data.rarityProfile,
        baseDropCount
      );

      if (luckMult > 1.0 && Math.random() < 0.4) {
        const bonusDrop = generateEnemyDrops(enemy.data.dropTable, enemy.data.rarityProfile, 1);
        generatedDrops.push(...bonusDrop);
      }

      drops = generatedDrops;
    } else if (enemy.data.drops) {
      for (const drop of enemy.data.drops) {
        const adjustedChance = Math.min(1.0, drop.chance * luckMult);
        if (Math.random() < adjustedChance) {
          drops.push(drop.char);
        }
      }
    }

    for (let i = 0; i < drops.length; i++) {
      const drop = drops[i];
      const angle = (i / Math.max(drops.length, 1)) * Math.PI * 2 + Math.random() * 0.8;
      if (isIngredient(drop)) {
        this.spawnIngredientDrop(drop, enemy.position.x, enemy.position.y, angle);
      } else if (isItem(drop)) {
        this.spawnItemDrop(drop, enemy.position.x, enemy.position.y, angle);
      }
    }
  }

  spawnIngredientDrop(char, x, y, angle = null) {
    const ingredient = new Ingredient(char, x, y);
    ingredient.pickupCooldown = 1.5;
    if (this.game.player?.inHut) ingredient.hutPlane = true;
    const a = angle !== null ? angle : Math.random() * Math.PI * 2;
    const speed = 60 + Math.random() * 80;
    ingredient.velocity.vx = Math.cos(a) * speed;
    ingredient.velocity.vy = Math.sin(a) * speed;
    this.game.ingredients.push(ingredient);
    this.game.physicsSystem.addEntity(ingredient);
    return ingredient;
  }

  spawnItemDrop(char, x, y, angle = null) {
    const item = new Item(char, x, y);
    if (this.game.player?.inHut) item.hutPlane = true;
    const a = angle !== null ? angle : Math.random() * Math.PI * 2;
    const speed = 60 + Math.random() * 80;
    item.velocity.vx = Math.cos(a) * speed;
    item.velocity.vy = Math.sin(a) * speed;
    this.game.items.push(item);
    this.game.physicsSystem.addEntity(item);
    return item;
  }
}
