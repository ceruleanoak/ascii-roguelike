import { Ingredient } from '../entities/Ingredient.js';
import { Item } from '../entities/Item.js';
import { isIngredient, isItem, generateEnemyDrops } from '../data/items.js';
import { planeOf } from './PlaneSystem.js';
import { GRID } from '../game/GameConfig.js';

export class LootSystem {
  constructor(game) {
    this.game = game;
  }

  // Canonical ingredient grant — routes special pickups (Emerald Robe goo heal,
  // active-meter mana refill), otherwise banks/carries via game.addIngredient,
  // then removes the ingredient from the world. Shared by the player attraction
  // pickup in all three states and the boomerang fetch.
  collectIngredient(ingredient) {
    const game = this.game;
    const player = game.player;
    if (ingredient.char === 'g' && player.gooConsume) {
      // Emerald Robe: goo consumed for 1HP heal instead of going to inventory
      player.hp = Math.min(player.hp + 1, player.maxHp);
    } else if (ingredient.char === '𝑚' && player.magicMeter?.active) {
      // Mana drop auto-refills the meter once the well/cauldron has
      // activated it; bypass inventory entirely.
      game.magicSystem.addMana(player, 2);
    } else {
      game.addIngredient(ingredient.char);
    }
    game.audioSystem?.playSFX('ingredient_pickup');
    game.physicsSystem.removeEntity(ingredient);
    const idx = game.ingredients.indexOf(ingredient);
    if (idx !== -1) game.ingredients.splice(idx, 1);
  }

  // REST starter bundle: SPACE near the bundle destroys it and scatters its
  // ingredients in a ring. Returns true if the bundle was in range and burst.
  scatterRestBundle() {
    const game = this.game;
    if (!game.restBundle) return false;
    const dist = Math.hypot(
      game.player.position.x - game.restBundle.position.x,
      game.player.position.y - game.restBundle.position.y
    );
    if (dist >= GRID.CELL_SIZE * 3) return false;

    const cx = game.restBundle.position.x;
    const cy = game.restBundle.position.y;
    const count = game.restBundle.chars.length;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const r = GRID.CELL_SIZE * (1.5 + Math.random());
      const ing = new Ingredient(
        game.restBundle.chars[i],
        cx + Math.cos(angle) * r,
        cy + Math.sin(angle) * r
      );
      ing.pickupCooldown = 0.25;
      game.ingredients.push(ing);
      game.physicsSystem.addEntity(ing);
    }
    game.restBundle = null;
    return true;
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
    // hutPlane covers both hut and dungeon interiors — they share game.activeFloor and
    // the same overlay render path. Without this, dungeon-spawned loot drops would
    // render at wrong screen coords and slip past the overlay's hutPlane filter.
    if (this.game.activeFloor) ingredient.hutPlane = true;
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
    if (this.game.activeFloor) item.hutPlane = true;
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
