/**
 * SecretEventSystem — post-generation room secret events (key glitter, leshy
 * chase, fairy grass, chi grass, etc.). Extracted out of RoomGenerator (which
 * still calls applySecretEvents via ExitSystem's post-clear hook) since the
 * framework is a self-contained, priority-ordered ruleset rather than
 * generation logic.
 *
 * Priority-based: only 1 event per room, highest priority wins.
 */
export class SecretEventSystem {
  constructor(game) {
    this.game = game;
  }

  _shuffleArray(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }

  /**
   * Secret event type definitions
   * Each event has: priority, condition, eligibleObjects filter, and marking behavior
   * Events are checked in priority order (higher = more important)
   */
  getSecretEventTypes() {
    const zoneSystem = this.game?.zoneSystem;
    return [
      // PRIORITY 1: Key Glitter (overrides all others)
      {
        name: 'key_glitter',
        priority: 10,
        condition: (room) => {
          // Must be K room with key-dropping objects
          return room.letterTemplate?.keyDrops?.enabled === true;
        },
        eligibleObjects: (room) => {
          // Objects that actually drop keys
          return room.backgroundObjects.filter(obj => obj.dropsKey === true);
        },
        mark: (selectedObject) => {
          selectedObject.isGlittering = true;
          selectedObject.keyObject = true;
          selectedObject.glitterColor = '#ffaa00'; // Gold
        }
      },

      // PRIORITY 2: Leshy Chase (green zone shaking bushes)
      {
        name: 'leshy_chase',
        priority: 5,
        condition: (room) => {
          const roomCleared = room.enemies.length === 0;
          // Active chase: guaranteed spawn so the Leshy never silently disappears mid-chase.
          // shouldSpawnShakingBush blocks when leshyChaseActive, so check it separately.
          if (zoneSystem?.leshyChaseActive) {
            return room.zone === 'green' && roomCleared;
          }
          return zoneSystem?.shouldSpawnShakingBush(room.zone, roomCleared) || false;
        },
        eligibleObjects: (room) => {
          return room.backgroundObjects.filter(obj =>
            obj.char === '%' || obj.char === '&' || obj.char === 'Y'
          );
        },
        mark: (selectedObject) => {
          selectedObject.isShaking = true;
          selectedObject.leshyBush = true;
        }
      },

      // PRIORITY 4: χ Grass (Crossroads/X room only, one per run)
      // Hides a single mysterious χ in a tall-grass tile. Cutting it spawns a
      // never-destroyed χ BackgroundObject (puzzleSignal contract) that
      // ChiBladeSystem polls for strikes — see InteractionSystem's cutGrass
      // handler for the reveal and ChiBladeSystem for the resolution.
      {
        name: 'chi_grass',
        priority: 4,
        condition: (room) => {
          if (room.letterTemplate?.chiSecret !== true) return false;
          if (this.game?.chiBladeFound) return false;
          const roomCleared = room.enemies.length === 0;
          if (!roomCleared) return false;
          // 35% per eligible room — one-per-run cap (chiBladeFound) means the
          // rate only governs which particular X-room visit gets it.
          return Math.random() < 0.35;
        },
        eligibleObjects: (room) => {
          return room.backgroundObjects.filter(obj => obj.char === '|');
        },
        mark: (selectedObject) => {
          // Singular secret — unlike fairy_grass, only the one selected tile
          // is marked.
          selectedObject.chiGrass = true;
        }
      },

      // PRIORITY 3: Fairy Grass (any zone, low chance — only when not angered)
      // The fairy is the player's only path to discovering F (Fountain) rooms.
      // Marks multiple tall-grass tiles ('|') so any one of them releases the
      // fairy when cut. InteractionSystem.cutGrass enforces one-per-room via
      // game.currentRoom.fairySpawned.
      {
        name: 'fairy_grass',
        priority: 3,
        condition: (room) => {
          if (this.game?.fairiesAngered) return false;
          const roomCleared = room.enemies.length === 0;
          if (!roomCleared) return false;
          // 25% per eligible room. Multiple grass tiles marked, so first
          // cut spawns the fairy regardless of which marked tile the player hits.
          return Math.random() < 0.25;
        },
        eligibleObjects: (room) => {
          return room.backgroundObjects.filter(obj => obj.char === '|');
        },
        mark: (selectedObject, eligibleObjects) => {
          // Mark roughly a third of eligible grass tiles (min 3, capped at all).
          const count = Math.min(eligibleObjects.length, Math.max(3, Math.ceil(eligibleObjects.length / 3)));
          // Always include the framework-selected object, then fill from a shuffle.
          const pool = eligibleObjects.filter(o => o !== selectedObject);
          this._shuffleArray(pool);
          const marked = [selectedObject, ...pool.slice(0, count - 1)];
          for (const obj of marked) {
            obj.fairyGrass = true;
          }
        }
      }

      // Future events can be added here with appropriate priorities
      // Examples:
      // - treasure_sparkle (priority 8)
      // - cursed_glow (priority 3)
      // - mysterious_hum (priority 2)
    ];
  }

  /**
   * Apply post-generation secret events to room
   * Uses priority system: only 1 event per room, highest priority wins
   */
  applySecretEvents(room) {
    if (!this.game?.zoneSystem) {
      return;
    }

    const eventTypes = this.getSecretEventTypes();

    // Sort by priority (highest first)
    eventTypes.sort((a, b) => b.priority - a.priority);

    // Try each event type in priority order
    for (const eventType of eventTypes) {
      // Check if this event's condition is met
      const conditionMet = eventType.condition(room);

      if (!conditionMet) {
        continue; // Skip this event
      }

      // Get eligible objects for this event
      const eligibleObjects = eventType.eligibleObjects(room);

      if (eligibleObjects.length === 0) {
        continue; // No valid objects
      }

      // Pick random eligible object
      const randomIndex = Math.floor(Math.random() * eligibleObjects.length);
      const selectedObject = eligibleObjects[randomIndex];

      // Mark the object with this event (event may opt to mark additional
      // siblings from `eligibleObjects` — e.g. fairy_grass marks several).
      eventType.mark(selectedObject, eligibleObjects);

      // Store event type on room for rendering reference
      room.activeSecretEvent = eventType.name;

      // Only 1 event per room - stop here
      return;
    }
  }
}
