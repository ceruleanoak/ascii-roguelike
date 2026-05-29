import { Ingredient } from '../entities/Ingredient.js';
import { Item } from '../entities/Item.js';
import { isIngredient, isItem, generateEnemyDrops } from '../data/items.js';
import { planeOf } from './PlaneSystem.js';

export class LootSystem {
  constructor(game) {
    this.game = game;
  }

  spawnLoot(enemy) {
    const game = this.game;
    // Luck has two tiers: full-power while Lucky Coin (★) is equipped, half-power
    // permanently after the coin is vested in a well. The flags are independent
    // (vested coin frees the slot) but luckActive takes priority on the math.
    const player = game.player;
    const luckMult   = player?.luckActive ? 1.75 : (player?.luckBlessed ? 1.375 : 1.0);
    const bonusChance = player?.luckActive ? 0.40 : (player?.luckBlessed ? 0.20 : 0);

    let drops = [];
    const affinities = enemy.data.affinities || (enemy.data.dropTable ? [enemy.data.dropTable] : null);
    const tier = enemy.data.tier || enemy.data.rarityProfile;
    if (affinities && tier) {
      const baseDropCount = enemy.data.isBoss ? 3 : null;
      const generatedDrops = generateEnemyDrops(
        affinities,
        tier,
        baseDropCount
      );

      // FIX 3: Apply luckMult to each drop's probability in the affinity path.
      // generateEnemyDrops already selected candidates; filter them by luck-scaled roll.
      // When luckMult === 1.0 every drop passes (Math.random() < 1.0 is always true), so
      // there is no regression for players without luck.
      const luckyDrops = luckMult <= 1.0
        ? generatedDrops
        : generatedDrops.filter(() => Math.random() < Math.min(1.0, luckMult));

      // FIX 4: Bonus drop for luck — derive a valid affinity source instead of relying on
      // the potentially-undefined enemy.data.dropTable.
      if (bonusChance > 0 && Math.random() < bonusChance) {
        const bonusAffinities = enemy.data.affinities || (enemy.data.dropTable ? [enemy.data.dropTable] : null);
        const bonusTier = enemy.data.tier || enemy.data.rarityProfile;
        if (bonusAffinities && bonusTier) {
          const bonusDrop = generateEnemyDrops(bonusAffinities, bonusTier, 1);
          luckyDrops.push(...bonusDrop);
        }
      }

      drops = luckyDrops;
    } else if (enemy.data.drops && enemy.data.drops.length) {
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
        this.spawnIngredientDrop(drop, enemy.position.x, enemy.position.y, angle, enemy);
      } else if (isItem(drop)) {
        this.spawnItemDrop(drop, enemy.position.x, enemy.position.y, angle, enemy);
      }
    }
  }

  // `source` is the originating entity (enemy or destroyed object). Drops inherit
  // its plane so they spawn on the same layer as the thing they came from.
  spawnIngredientDrop(char, x, y, angle = null, source = null) {
    const ingredient = new Ingredient(char, x, y);
    ingredient.pickupCooldown = 0.75;
    if (source) ingredient.plane = planeOf(source);
    if (this.game.player?.inHut) ingredient.hutPlane = true;
    if (this.game.player?.inMaze) ingredient.mazePlane = true;
    const a = angle !== null ? angle : Math.random() * Math.PI * 2;
    const speed = 60 + Math.random() * 80;
    ingredient.velocity.vx = Math.cos(a) * speed;
    ingredient.velocity.vy = Math.sin(a) * speed;
    this.game.ingredients.push(ingredient);
    this.game.physicsSystem.addEntity(ingredient);
    return ingredient;
  }

  spawnItemDrop(char, x, y, angle = null, source = null) {
    const item = new Item(char, x, y);
    if (source) item.plane = planeOf(source);
    if (this.game.player?.inHut) item.hutPlane = true;
    if (this.game.player?.inMaze) item.mazePlane = true;
    const a = angle !== null ? angle : Math.random() * Math.PI * 2;
    const speed = 60 + Math.random() * 80;
    item.velocity.vx = Math.cos(a) * speed;
    item.velocity.vy = Math.sin(a) * speed;
    this.game.items.push(item);
    this.game.physicsSystem.addEntity(item);
    return item;
  }
}
