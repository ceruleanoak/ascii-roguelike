import { GRID } from '../game/GameConfig.js';
import { FISHING_TABLES, pickRandomCatch } from '../data/fishingTables.js';
import { Bobber } from '../entities/Bobber.js';
import { FishEntity } from '../entities/FishEntity.js';
import { RewardObject } from '../entities/RewardObject.js';
import { Rusalka } from '../entities/Rusalka.js';

const STATES = {
  IDLE: 'IDLE',
  CHARGING: 'CHARGING',
  BOBBING: 'BOBBING',
  BITE_WINDOW: 'BITE_WINDOW',
  WINDOW_CLOSED: 'WINDOW_CLOSED'
};

const MAX_CHARGE_TIME = 1.5;
const BITE_WINDOW_DURATION = 0.5;
const FISH_SPAWN_INTERVAL_MIN = 3.0;
const FISH_SPAWN_INTERVAL_MAX = 8.0;
const FISH_SEARCH_RADIUS = GRID.CELL_SIZE * 6; // How far to scan for water tiles to place fish
const CAST_WATER_RADIUS = GRID.CELL_SIZE * 8;  // Max cast distance to find water

/**
 * FishingSystem — state machine for the fishing minigame.
 *
 * States:
 *   IDLE → CHARGING (hold space with pole) → BOBBING (release space)
 *        → BITE_WINDOW (0.5s) → WINDOW_CLOSED (reset) → IDLE
 *
 * Movement is locked from startCharge() through BITE_WINDOW expiry.
 */
export class FishingSystem {
  constructor() {
    this.state = STATES.IDLE;
    this.chargeTime = 0;
    this.biteTimer = 0;     // countdown until bite occurs
    this.windowTimer = 0;   // countdown during BITE_WINDOW

    this.bobber = null;
    this.rewardObjects = [];
    this.rusalka = null;
    this.rusalkaHasAppeared = false; // True once a Rusalka has been summoned this room visit
    this.fishEntities = [];
    this.targetedFish = null; // The specific fish entity the current cast is aimed at
    this.maxFishCount = 3; // Decreases with each successful catch
    this.fishSpawnTimer = 0;
    this.rusalkaKilledPlayer = false;
    // Electrified water killed the fish this room visit — they drop Meat and
    // the minigame stays disabled until the player leaves the room.
    this.fishingElectrocuted = false;
  }

  // ── Condition checks ─────────────────────────────────────────────────────

  isLakeRoom(game) {
    return game.currentRoom?.letterTemplate?.name === 'Lake';
  }

  // Ocean ('O') rooms fish like lakes but roll the dedicated 'ocean' table
  // (ocean creatures + the blue-zone supply line).
  isOceanRoom(game) {
    return game.currentRoom?.letterTemplate?.name === 'Ocean';
  }

  isOpenWaterRoom(game) {
    return this.isLakeRoom(game) || this.isOceanRoom(game);
  }

  // Fountain ('F') rooms support fishing with the FOUNTAIN_CATCHES table.
  // Treated as a "fishable room" parallel to Lake — same minigame, different table.
  isFountainRoom(game) {
    return game.currentRoom?.letterTemplate?.name === 'Fountain'
        || game.currentRoom?.type === 'FOUNTAIN';
  }

  isFishableRoom(game) {
    return this.isOpenWaterRoom(game) || this.isFountainRoom(game);
  }

  fishingZone(game) {
    if (this.isFountainRoom(game)) return 'fountain';
    if (this.isOceanRoom(game)) return 'ocean';
    return game.currentRoom?.zone || 'green';
  }

  roomCleared(game) {
    // A frozen room (player inside a hut/dungeon/maze) has its enemies parked
    // on _frozenEnemies, not actually defeated — don't read it as cleared.
    if (game.currentRoom?._frozenEnemies) return false;
    return game.currentRoom?.enemies?.length === 0;
  }

  holdingFishingRod(game) {
    return game.player?.heldItem?.data?.isFishingRod === true;
  }

  nearFish(game) {
    if (!game.player || this.fishEntities.length === 0) return false;
    const px = game.player.position.x;
    const py = game.player.position.y;
    const threshold = GRID.CELL_SIZE * 4;
    return this.fishEntities.some(fish => {
      const dx = fish.position.x - px;
      const dy = fish.position.y - py;
      return dx * dx + dy * dy < threshold * threshold;
    });
  }

  // Nearest fountain water tile within casting range, or null.
  // Fountains have no ambient fish entities — the player just casts at the water.
  nearestFountainWater(game) {
    if (!game.player || !this.isFountainRoom(game)) return null;
    const objs = game.currentRoom?.backgroundObjects || [];
    const px = game.player.position.x;
    const py = game.player.position.y;
    const threshold = GRID.CELL_SIZE * 4;
    let nearest = null;
    let nearestDist = threshold * threshold;
    for (const obj of objs) {
      if (!obj.fountainWater || obj.destroyed) continue;
      const dx = obj.position.x - px;
      const dy = obj.position.y - py;
      const d = dx * dx + dy * dy;
      if (d < nearestDist) {
        nearestDist = d;
        nearest = obj;
      }
    }
    return nearest;
  }

  canFish(game) {
    if (this.fishingElectrocuted) return false; // dead water — nothing left to catch
    if (!this.isFishableRoom(game) || !this.roomCleared(game)) return false;
    if (!this.holdingFishingRod(game) || this.state !== STATES.IDLE) return false;
    // Fountain rooms: cast at the water itself, no ambient fish required.
    if (this.isFountainRoom(game)) return this.nearestFountainWater(game) !== null;
    return this.nearFish(game);
  }

  // ── State transitions ─────────────────────────────────────────────────────

  startCharge(game) {
    this.state = STATES.CHARGING;
    this.chargeTime = 0;
    game.player.fishingLocked = true;
  }

  releaseCharge(game) {
    if (this.state !== STATES.CHARGING) return;

    const chargeRatio = Math.min(this.chargeTime / MAX_CHARGE_TIME, 1.0);

    // Lake: aim at the nearest fish entity. Fountain: aim at the nearest water tile.
    const px = game.player.position.x;
    const py = game.player.position.y;
    let targetX, targetY;
    if (this.isFountainRoom(game)) {
      const tile = this.nearestFountainWater(game);
      if (!tile) { this.resetMinigame(game); return; }
      targetX = tile.position.x;
      targetY = tile.position.y;
      this.targetedFish = null;
    } else {
      const nearest = this.findNearestFish(game);
      if (!nearest) { this.resetMinigame(game); return; }
      this.targetedFish = nearest;
      targetX = nearest.position.x;
      targetY = nearest.position.y;
    }

    // Bobber flies from player position to the target tile in a parabolic arc
    this.bobber = new Bobber(px, py, targetX, targetY, chargeRatio);

    // Bite timer starts AFTER bobber lands (-1 = not yet initialized)
    this.biteTimer = -1;
    this.state = STATES.BOBBING;
  }

  onSpacePress(game) {
    if (this.state === STATES.BOBBING) {
      // Cancel fishing mid-cast — despawn the targeted fish
      this.cancelFishing(game);
      return;
    }

    if (this.state !== STATES.BITE_WINDOW) return;

    // Successful catch — despawn the targeted fish and reduce the population cap
    this.despawnTargetedFish();
    this.maxFishCount = Math.max(0, this.maxFishCount - 1);

    this.resolveCatch(game);
    this.resetMinigame(game);
  }

  cancelFishing(game) {
    this.despawnTargetedFish();
    this.resetMinigame(game);
  }

  despawnTargetedFish() {
    if (!this.targetedFish) return;
    const idx = this.fishEntities.indexOf(this.targetedFish);
    if (idx !== -1) this.fishEntities.splice(idx, 1);
    this.targetedFish = null;
  }

  resetMinigame(game) {
    this.bobber = null;
    this.targetedFish = null;
    this.state = STATES.IDLE;
    this.chargeTime = 0;
    this.biteTimer = 0;
    this.windowTimer = 0;
    if (game?.player) {
      game.player.fishingLocked = false;
    }
  }

  // ── Catch resolution ──────────────────────────────────────────────────────

  resolveCatch(game) {
    const zone = this.fishingZone(game);
    const table = FISHING_TABLES[zone];
    if (!table) return;

    // Check Rusalka (green zone only)
    if (table.rusalkaChance > 0 && Math.random() < table.rusalkaChance) {
      this.spawnRusalka(game);
      return;
    }

    const catchData = pickRandomCatch(zone);
    if (!catchData) return;

    this.spawnRewardObject(game, catchData);
  }

  spawnRewardObject(game, catchData) {
    if (!this.bobber) return;

    const reward = new RewardObject(
      this.bobber.position.x,
      this.bobber.position.y,
      catchData
    );
    this.rewardObjects.push(reward);
  }

  spawnRusalka(game) {
    if (!this.bobber) return;
    this.spawnRusalkaAt(game, this.bobber.position.x, this.bobber.position.y);
  }

  spawnRusalkaAt(game, x, y) {
    // Remove any existing Rusalka first
    if (this.rusalka) {
      this.rusalka.cleanup(game.player);
    }

    this.rusalka = new Rusalka(x, y);
    this.rusalkaHasAppeared = true;
    // Rusalka is updated by FishingSystem.update() and rendered by ExploreRenderer
    // (not added to neutralCharacters to avoid double-update)
  }

  // ── Update ────────────────────────────────────────────────────────────────

  update(dt, game) {
    if (!game.currentRoom) return;

    // Update state machine
    switch (this.state) {
      case STATES.CHARGING:
        this.chargeTime = Math.min(this.chargeTime + dt, MAX_CHARGE_TIME);
        break;

      case STATES.BOBBING:
        if (this.bobber) this.bobber.update(dt);

        if (this.bobber && !this.bobber.flying) {
          // Bobber has landed — initialize bite timer on first landed frame
          if (this.biteTimer < 0) {
            this.biteTimer = 2.0 + Math.random() * 6.0;
          }
          this.biteTimer -= dt;
          if (this.biteTimer <= 0) {
            // Bite! Hide bobber, start window
            this.bobber.visible = false;
            this.windowTimer = BITE_WINDOW_DURATION;
            this.state = STATES.BITE_WINDOW;
          }
        }
        break;

      case STATES.BITE_WINDOW:
        this.windowTimer -= dt;
        if (this.windowTimer <= 0) {
          // Window expired — unlock and return to IDLE
          this.resetMinigame(game);
        }
        break;

      case STATES.WINDOW_CLOSED:
        this.resetMinigame(game);
        break;
    }

    // Update reward objects
    for (let i = this.rewardObjects.length - 1; i >= 0; i--) {
      const reward = this.rewardObjects[i];
      if (!reward.alive) {
        this.rewardObjects.splice(i, 1);
        continue;
      }
      reward.update(dt, game.player?.position);
    }

    // Update Rusalka (managed here, not in neutralCharacters)
    if (this.rusalka) {
      if (!this.rusalka.alive) {
        this.rusalka.cleanup(game.player);
        this.rusalka = null;
      } else {
        this.rusalka.update(dt, game);
      }
    }

    // Spawn ambient fish when room is cleared — open water (Lake/Ocean) only.
    // Fountains are fishable but visually a clean sanctuary; the fountain
    // catch table is rolled at cast time, no ambient fish needed.
    if (this.isOpenWaterRoom(game) && this.roomCleared(game)) {
      // Electrified water kills fish on contact (the cascade front sweeps the
      // lake and pops them one by one into Meat drops).
      this.checkFishElectrocution(game);

      this.fishSpawnTimer -= dt;
      if (this.fishSpawnTimer <= 0 && !this.fishingElectrocuted) {
        this.spawnAmbientFish(game);
        this.fishSpawnTimer = FISH_SPAWN_INTERVAL_MIN +
          Math.random() * (FISH_SPAWN_INTERVAL_MAX - FISH_SPAWN_INTERVAL_MIN);
      }

      // Update existing fish
      for (let i = this.fishEntities.length - 1; i >= 0; i--) {
        this.fishEntities[i].update(dt);
      }
    }
  }

  /**
   * Kill any fish whose water tile is electrified: the fish pops into a Meat
   * ('m') ingredient drop, and fishing is disabled for the rest of this room
   * visit (the catch is dead — nothing left to hook). An in-progress cast is
   * cancelled so the player isn't stuck waiting on a bite from a dead lake.
   */
  checkFishElectrocution(game) {
    if (this.fishEntities.length === 0) return;
    const C = GRID.CELL_SIZE;
    const electrifiedCells = new Set();
    for (const obj of game.currentRoom?.backgroundObjects ?? []) {
      if (obj.destroyed || !obj.isWater?.()) continue;
      if (obj.waterState !== 'electrified') continue;
      electrifiedCells.add(`${Math.round(obj.position.x / C)},${Math.round(obj.position.y / C)}`);
    }
    if (electrifiedCells.size === 0) return;

    for (let i = this.fishEntities.length - 1; i >= 0; i--) {
      const fish = this.fishEntities[i];
      const key = `${Math.round(fish.position.x / C)},${Math.round(fish.position.y / C)}`;
      if (!electrifiedCells.has(key)) continue;

      this.fishEntities.splice(i, 1);
      this.fishingElectrocuted = true;
      game.lootSystem?.spawnIngredientDrop?.('m', fish.position.x, fish.position.y);
      game.combatSystem?.createDamageNumber?.('⚡', fish.position.x, fish.position.y - C * 0.5, '#ffff00');

      // Cancel an in-flight cast (charging/bobbing/bite) — the lake is dead.
      if (this.state !== STATES.IDLE) {
        this.state = STATES.IDLE;
        this.bobber = null;
        this.chargeTime = 0;
        this.biteTimer = 0;
        this.windowTimer = 0;
        this.targetedFish = null;
        if (game.player) game.player.fishingLocked = false;
      }
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  /**
   * Returns the nearest fish entity to the player.
   * The bobber always lands on that fish's tile.
   */
  findNearestFish(game) {
    if (!game.player || this.fishEntities.length === 0) return null;
    const px = game.player.position.x;
    const py = game.player.position.y;
    let nearest = null;
    let nearestDist = Infinity;
    for (const fish of this.fishEntities) {
      const dx = fish.position.x - px;
      const dy = fish.position.y - py;
      const dist = dx * dx + dy * dy;
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = fish;
      }
    }
    return nearest;
  }

  /**
   * Finds the water tile whose distance from the player best matches
   * the preferred cast distance derived from chargeRatio (0=near, 1=far).
   */
  findWaterTileAtDistance(game, chargeRatio) {
    if (!game.backgroundObjects || !game.player) return null;

    const playerX = game.player.position.x;
    const playerY = game.player.position.y;
    const minDist = GRID.CELL_SIZE * 2;
    const preferredDist = minDist + chargeRatio * (CAST_WATER_RADIUS - minDist);

    let best = null;
    let bestDelta = Infinity;

    for (const obj of game.backgroundObjects) {
      if (obj.char !== '~') continue;

      const dx = obj.position.x - playerX;
      const dy = obj.position.y - playerY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist > CAST_WATER_RADIUS) continue;

      const delta = Math.abs(dist - preferredDist);
      if (delta < bestDelta) {
        bestDelta = delta;
        best = obj;
      }
    }

    return best ? { x: best.position.x, y: best.position.y } : null;
  }

  spawnAmbientFish(game) {
    if (this.fishEntities.length >= this.maxFishCount) return;

    const allWater = (game.backgroundObjects || []).filter(o => o.char === '~' || o.char === '=');
    if (allWater.length === 0) return;

    // Build a set of occupied grid cells for fast adjacency lookup
    const waterSet = new Set(
      allWater.map(o => `${Math.round(o.position.x / GRID.CELL_SIZE)},${Math.round(o.position.y / GRID.CELL_SIZE)}`)
    );

    // Only spawn on tiles that have at least 2 cardinal-direction water
    // neighbors. Electrified tiles are excluded — no fish surfaces into a
    // live current (checkFishElectrocution would just kill it next frame).
    const eligible = allWater.filter(tile => {
      if (tile.waterState === 'electrified') return false;
      const col = Math.round(tile.position.x / GRID.CELL_SIZE);
      const row = Math.round(tile.position.y / GRID.CELL_SIZE);
      let neighbors = 0;
      if (waterSet.has(`${col},${row - 1}`)) neighbors++;
      if (waterSet.has(`${col},${row + 1}`)) neighbors++;
      if (waterSet.has(`${col - 1},${row}`)) neighbors++;
      if (waterSet.has(`${col + 1},${row}`)) neighbors++;
      return neighbors >= 2;
    });

    if (eligible.length === 0) return;

    const tile = eligible[Math.floor(Math.random() * eligible.length)];
    this.fishEntities.push(new FishEntity(tile.position.x, tile.position.y));
  }

  // Called when a melee blade attack hits a reward object.
  // spawnIngredientFn: (char, x, y) => void  (INGREDIENTS namespace)
  // spawnSpecialFn:    (specialKey, x, y) => void  (optional; ITEMS keys or sentinels like 'fairy')
  hitRewardObject(reward, spawnIngredientFn, spawnSpecialFn = null) {
    if (!reward.alive) return;
    reward.alive = false;

    const scatter = () => (Math.random() - 0.5) * GRID.CELL_SIZE * 2;
    for (const dropChar of reward.drops) {
      spawnIngredientFn(
        dropChar,
        reward.position.x + scatter(),
        reward.position.y + scatter()
      );
    }
    if (spawnSpecialFn && reward.specialDrops) {
      for (const specialKey of reward.specialDrops) {
        spawnSpecialFn(
          specialKey,
          reward.position.x + scatter(),
          reward.position.y + scatter()
        );
      }
    }
  }

  checkRewardObjectHits(meleeAttacks, spawnIngredientFn, spawnSpecialFn) {
    if (!this.rewardObjects.length || !meleeAttacks.length) return;
    for (const attack of meleeAttacks) {
      if (!attack.isBlade) continue;
      const atkX = attack.position.x, atkY = attack.position.y;
      const atkR = (attack.radius || GRID.CELL_SIZE) + GRID.CELL_SIZE;
      for (const reward of this.rewardObjects) {
        if (!reward.alive) continue;
        const dx = reward.position.x + GRID.CELL_SIZE / 2 - atkX;
        const dy = reward.position.y + GRID.CELL_SIZE / 2 - atkY;
        if (dx * dx + dy * dy < atkR * atkR) {
          this.hitRewardObject(reward, spawnIngredientFn, spawnSpecialFn);
        }
      }
    }
  }

  resetForNewRoom(player = null) {
    // Clean up all fishing state when entering a new room
    if (this.rusalka) {
      this.rusalka.cleanup(player);
      this.rusalka = null;
    }
    this.state = STATES.IDLE;
    this.bobber = null;
    this.chargeTime = 0;
    this.biteTimer = 0;
    this.windowTimer = 0;
    this.rewardObjects = [];
    this.fishEntities = [];
    this.maxFishCount = 3;
    this.fishSpawnTimer = 0;
    this.rusalkaKilledPlayer = false;
    this.fishingElectrocuted = false; // dead water is per-room — new room, new fish
    // rusalkaHasAppeared is intentionally NOT reset — it's a permanent run toggle
    if (player) {
      player.fishingLocked = false;
    }
  }

  get STATES() {
    return STATES;
  }
}
