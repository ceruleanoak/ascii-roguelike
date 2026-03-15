/**
 * EnemySpawnSystem - Handles all mid-combat enemy spawning
 *
 * Responsibilities:
 * - Collect and process spawn requests from enemy update results (spawning config)
 * - Enforce the room enemy cap (max 10 enemies)
 * - Handle spawn-on-death behavior
 * - Notify parent spawners when a spawned enemy dies
 */

export class EnemySpawnSystem {
  constructor(game) {
    this.game = game;
    this._pendingRequests = [];
  }

  /**
   * Queue a spawn request from an enemy's update result.
   * Call this during the enemy update loop when updateResult.shouldSpawn is true.
   */
  queueRequest(spawner, spawnData) {
    this._pendingRequests.push({ spawner, spawnData });
  }

  /**
   * Process all queued spawn requests.
   * Call this after the enemy update loop, before combat updates.
   */
  flush() {
    for (const request of this._pendingRequests) {
      if (this.game.currentRoom.enemies.length >= 10) break;
      const newEnemies = this.game.roomGenerator.spawnEnemiesFrom(
        this.game,
        request.spawner,
        request.spawnData
      );
      for (const newEnemy of newEnemies) {
        request.spawner.registerSpawn(newEnemy);
      }
      this.game.currentRoom.enemies.push(...newEnemies);
    }
    this._pendingRequests = [];
  }

  /**
   * Handle spawn-on-death behavior and parent spawner notification.
   * Call this when an enemy's hp reaches 0, before removing it from the room.
   */
  handleEnemyDeath(enemy) {
    if (enemy.spawning && enemy.spawning.spawnOnDeath) {
      const deathSpawns = this.game.roomGenerator.spawnEnemiesFrom(this.game, enemy, {
        spawnChar: enemy.spawning.spawnChar,
        spawnCount: enemy.spawning.spawnOnDeathCount || 3,
        spawnRange: enemy.spawning.spawnRange,
        spawnerPosition: { x: enemy.position.x, y: enemy.position.y }
      });
      this.game.currentRoom.enemies.push(...deathSpawns);
    }

    if (enemy.spawner) {
      enemy.spawner.notifySpawnDeath(enemy);
    }
  }
}
