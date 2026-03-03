import { GRID } from '../game/GameConfig.js';
import { NeutralCharacter } from './NeutralCharacter.js';

/**
 * Leshy - Forest spirit that flees to exits when discovered
 * Part of the green zone chase event system
 */
export class Leshy extends NeutralCharacter {
  constructor(x, y, exits) {
    // Bright green 'l' character
    super('l', '#00ff00', x, y);

    this.exits = exits;
    this.speed = 120; // Faster than player base speed
    this.targetExit = null; // 'north', 'east', 'west' (never south)
    this.targetPosition = null; // Pixel position of exit
    this.reachedExit = false;
    this.fleeing = false;
  }

  /**
   * Find the nearest available exit (N/E/W only, never south)
   * Returns exit direction ('north', 'east', 'west') or null
   */
  findNearestExit() {
    const centerX = Math.floor(GRID.COLS / 2);
    const centerY = Math.floor(GRID.ROWS / 2);

    // Exit positions in pixels (matching RoomGenerator exitZones)
    const exitPositions = {
      north: { x: centerX * GRID.CELL_SIZE, y: 2 * GRID.CELL_SIZE },
      east: { x: (GRID.COLS - 3) * GRID.CELL_SIZE, y: centerY * GRID.CELL_SIZE },
      west: { x: 2 * GRID.CELL_SIZE, y: centerY * GRID.CELL_SIZE }
    };

    // Filter to only available exits
    const availableExits = ['north', 'east', 'west'].filter(dir => this.exits[dir]);

    if (availableExits.length === 0) {
      console.warn('[Leshy] No exits available!');
      return null; // No exits available (shouldn't happen)
    }

    // Find closest exit
    let nearestExit = null;
    let nearestDistance = Infinity;

    for (const dir of availableExits) {
      const exitPos = exitPositions[dir];
      const dx = exitPos.x - this.position.x;
      const dy = exitPos.y - this.position.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestExit = dir;
      }
    }

    return nearestExit;
  }

  /**
   * Start fleeing toward nearest exit
   */
  startFleeing() {
    this.fleeing = true;
    this.targetExit = this.findNearestExit();

    if (this.targetExit) {
      const centerX = Math.floor(GRID.COLS / 2);
      const centerY = Math.floor(GRID.ROWS / 2);

      const exitPositions = {
        north: { x: centerX * GRID.CELL_SIZE, y: 2 * GRID.CELL_SIZE },
        east: { x: (GRID.COLS - 3) * GRID.CELL_SIZE, y: centerY * GRID.CELL_SIZE },
        west: { x: 2 * GRID.CELL_SIZE, y: centerY * GRID.CELL_SIZE }
      };

      this.targetPosition = exitPositions[this.targetExit];

      // Set white '!' indicator above character
      this.setIndicator('!', '#ffffff', -GRID.CELL_SIZE);
    }
  }

  /**
   * Update flee behavior - run toward target exit
   */
  update(deltaTime, game) {
    // Update base pulse animation
    super.update(deltaTime);

    if (!this.fleeing || !this.targetPosition) {
      return;
    }

    // Calculate direction to exit
    const dx = this.targetPosition.x - this.position.x;
    const dy = this.targetPosition.y - this.position.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // Check if reached exit (within 5 pixels of center)
    if (distance < 5) {
      this.reachedExit = true;
      this.velocity.x = 0;
      this.velocity.y = 0;
      return;
    }

    // Move toward exit
    const dirX = dx / distance;
    const dirY = dy / distance;
    this.velocity.x = dirX * this.speed;
    this.velocity.y = dirY * this.speed;

    // Update position
    this.position.x += this.velocity.x * deltaTime;
    this.position.y += this.velocity.y * deltaTime;
  }
}
