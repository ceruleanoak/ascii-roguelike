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
  }

  // ── Condition checks ─────────────────────────────────────────────────────

  isLakeRoom(game) {
    return game.currentRoom?.letterTemplate?.name === 'Lake';
  }

  roomCleared(game) {
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

  canFish(game) {
    return (
      this.isLakeRoom(game) &&
      this.roomCleared(game) &&
      this.holdingFishingRod(game) &&
      this.nearFish(game) &&
      this.state === STATES.IDLE
    );
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

    // Always cast to the nearest fish's tile so the bobber lands where the fish is
    const nearest = this.findNearestFish(game);
    if (!nearest) {
      // No fish nearby — cancel
      this.resetMinigame(game);
      return;
    }
    this.targetedFish = nearest;

    // Bobber flies from player position to the fish's water tile in a parabolic arc
    const px = game.player.position.x;
    const py = game.player.position.y;
    this.bobber = new Bobber(px, py, nearest.position.x, nearest.position.y, chargeRatio);

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
    const zone = game.currentRoom?.zone || 'green';
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

    // Spawn ambient fish when room is cleared (Lake room only)
    if (this.isLakeRoom(game) && this.roomCleared(game)) {
      this.fishSpawnTimer -= dt;
      if (this.fishSpawnTimer <= 0) {
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

    const allWater = (game.backgroundObjects || []).filter(o => o.char === '~');
    if (allWater.length === 0) return;

    // Build a set of occupied grid cells for fast adjacency lookup
    const waterSet = new Set(
      allWater.map(o => `${Math.round(o.position.x / GRID.CELL_SIZE)},${Math.round(o.position.y / GRID.CELL_SIZE)}`)
    );

    // Only spawn on tiles that have at least 2 cardinal-direction water neighbors
    const eligible = allWater.filter(tile => {
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
  // spawnIngredientFn is provided by main.js: (char, x, y) => void
  hitRewardObject(reward, spawnIngredientFn) {
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
    // rusalkaHasAppeared is intentionally NOT reset — it's a permanent run toggle
    if (player) {
      player.fishingLocked = false;
    }
  }

  get STATES() {
    return STATES;
  }
}
