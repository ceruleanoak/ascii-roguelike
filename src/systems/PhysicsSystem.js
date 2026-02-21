import { PHYSICS, GRID } from '../game/GameConfig.js';

export class PhysicsSystem {
  constructor() {
    this.entities = [];
  }

  addEntity(entity) {
    if (!this.entities.includes(entity)) {
      this.entities.push(entity);
    }
  }

  removeEntity(entity) {
    const index = this.entities.indexOf(entity);
    if (index > -1) {
      this.entities.splice(index, 1);
    }
  }

  clear() {
    this.entities = [];
  }

  update(deltaTime, backgroundObjects = []) {
    const waterResults = [];
    for (const entity of this.entities) {
      const result = this.updateEntity(entity, deltaTime, backgroundObjects);
      if (result) waterResults.push({ entity, ...result });
    }
    return waterResults;
  }

  updateEntity(entity, deltaTime, backgroundObjects = []) {
    if (!entity.position || !entity.velocity) return null;

    // Apply acceleration
    if (entity.acceleration) {
      entity.velocity.vx += entity.acceleration.ax * deltaTime;
      entity.velocity.vy += entity.acceleration.ay * deltaTime;
    }

    // Detect terrain overlap first (affects friction and velocity)
    let onIce = false;
    let inLiquid = false;
    let liquidState = 'normal';
    let inGrass = false;
    const isProjectile = entity.type === 'bullet' || entity.type === 'arrow';

    if (!isProjectile && backgroundObjects && backgroundObjects.length > 0) {
      for (const obj of backgroundObjects) {
        if (obj.destroyed) continue;

        const objBox = obj.getHitbox();
        const entityBox = {
          x: entity.position.x,
          y: entity.position.y,
          width: entity.width || GRID.CELL_SIZE,
          height: entity.height || GRID.CELL_SIZE
        };
        const overlapping =
          entityBox.x < objBox.x + objBox.width && entityBox.x + entityBox.width > objBox.x &&
          entityBox.y < objBox.y + objBox.height && entityBox.y + entityBox.height > objBox.y;

        if (overlapping) {
          // Check for water
          if (obj.char === '~') {
            const wState = obj.getWaterState ? obj.getWaterState() : 'normal';
            if (wState === 'frozen') { onIce = true; }
            else { inLiquid = true; liquidState = wState; }
            break;
          }
          // Check for tall grass (slows movement)
          else if (obj.slowsMovement && obj.slowsMovement()) {
            inGrass = true;
          }
        }
      }
    }

    // Apply friction (ice = less friction = more sliding)
    if (entity.friction !== false) {
      const friction = onIce ? PHYSICS.FRICTION * 1.07 : PHYSICS.FRICTION;
      entity.velocity.vx *= friction;
      entity.velocity.vy *= friction;
    }

    // Apply velocity multiplier for liquid water and tall grass
    const velocityMultiplier = (inLiquid || inGrass) ? 0.5 : 1.0;

    // Update position with velocity multiplier
    const newX = entity.position.x + entity.velocity.vx * deltaTime * velocityMultiplier;
    const newY = entity.position.y + entity.velocity.vy * deltaTime * velocityMultiplier;

    // Collision detection (if entity has collision)
    if (entity.hasCollision) {
      const collision = this.checkCollision(entity, newX, newY);
      if (!collision.x) {
        entity.position.x = newX;
      } else {
        entity.velocity.vx = 0;
      }
      if (!collision.y) {
        entity.position.y = newY;
      } else {
        entity.velocity.vy = 0;
      }
    } else {
      entity.position.x = newX;
      entity.position.y = newY;
    }

    // Bounds checking
    if (entity.boundToGrid) {
      this.enforceGridBounds(entity);
    }

    return { inLiquid, liquidState };
  }

  checkCollision(entity, newX, newY) {
    const collision = { x: false, y: false };

    // Get entity dimensions
    const width = entity.width || GRID.CELL_SIZE;
    const height = entity.height || GRID.CELL_SIZE;

    // Check grid bounds
    if (newX < 0 || newX + width > GRID.WIDTH) {
      collision.x = true;
    }
    if (newY < 0 || newY + height > GRID.HEIGHT) {
      collision.y = true;
    }

    // Check against walls - test X and Y axes independently for smooth sliding
    if (entity.collisionMap) {
      // Test X-axis movement (keeping current Y position)
      if (!collision.x) {
        collision.x = this.checkAxisCollision(
          entity.collisionMap,
          newX,
          entity.position.y,
          width,
          height
        );
      }

      // Test Y-axis movement (keeping current X position)
      if (!collision.y) {
        collision.y = this.checkAxisCollision(
          entity.collisionMap,
          entity.position.x,
          newY,
          width,
          height
        );
      }
    }

    return collision;
  }

  /**
   * Check if a specific position collides with walls
   * Helper for independent X/Y axis collision testing
   */
  checkAxisCollision(collisionMap, testX, testY, width, height) {
    const cellX = Math.floor(testX / GRID.CELL_SIZE);
    const cellY = Math.floor(testY / GRID.CELL_SIZE);
    const cellX2 = Math.floor((testX + width - 1) / GRID.CELL_SIZE);
    const cellY2 = Math.floor((testY + height - 1) / GRID.CELL_SIZE);

    // Check all cells the entity would overlap at this position
    for (let cy = cellY; cy <= cellY2; cy++) {
      for (let cx = cellX; cx <= cellX2; cx++) {
        if (collisionMap[cy] && collisionMap[cy][cx]) {
          return true; // Collision detected
        }
      }
    }

    return false; // No collision
  }

  enforceGridBounds(entity) {
    const hitbox = entity.getHitbox ? entity.getHitbox() : {
      width: entity.width || GRID.CELL_SIZE,
      height: entity.height || GRID.CELL_SIZE
    };

    if (entity.position.x < 0) entity.position.x = 0;
    if (entity.position.y < 0) entity.position.y = 0;
    if (entity.position.x + hitbox.width > GRID.WIDTH) {
      entity.position.x = GRID.WIDTH - hitbox.width;
    }
    if (entity.position.y + hitbox.height > GRID.HEIGHT) {
      entity.position.y = GRID.HEIGHT - hitbox.height;
    }
  }

  // Ingredient attraction physics
  applyAttraction(ingredient, target) {
    const dx = target.position.x - ingredient.position.x;
    const dy = target.position.y - ingredient.position.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance < PHYSICS.ATTRACTION_RADIUS && distance > 0) {
      // Normalize direction and apply attraction
      const dirX = dx / distance;
      const dirY = dy / distance;

      ingredient.acceleration = {
        ax: dirX * PHYSICS.ATTRACTION_STRENGTH,
        ay: dirY * PHYSICS.ATTRACTION_STRENGTH
      };

      return distance < PHYSICS.PICKUP_RADIUS;
    } else {
      ingredient.acceleration = { ax: 0, ay: 0 };
      return false;
    }
  }

  // Check collision between two entities (pixel-perfect)
  checkEntityCollision(entity1, entity2) {
    const box1 = entity1.getHitbox ? entity1.getHitbox() : {
      x: entity1.position.x,
      y: entity1.position.y,
      width: entity1.width || GRID.CELL_SIZE,
      height: entity1.height || GRID.CELL_SIZE
    };

    const box2 = entity2.getHitbox ? entity2.getHitbox() : {
      x: entity2.position.x,
      y: entity2.position.y,
      width: entity2.width || GRID.CELL_SIZE,
      height: entity2.height || GRID.CELL_SIZE
    };

    return box1.x < box2.x + box2.width &&
           box1.x + box1.width > box2.x &&
           box1.y < box2.y + box2.height &&
           box1.y + box1.height > box2.y;
  }

  // Calculate distance between two entities
  getDistance(entity1, entity2) {
    const dx = entity2.position.x - entity1.position.x;
    const dy = entity2.position.y - entity1.position.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  // Check and apply debris pushing
  checkDebrisPush(debris, majorObjects) {
    if (!debris.isPushable) return;

    for (const obj of majorObjects) {
      // Skip if object has no velocity (not moving)
      if (!obj.velocity || (obj.velocity.vx === 0 && obj.velocity.vy === 0)) {
        continue;
      }

      // Check collision
      if (this.checkEntityCollision(debris, obj)) {
        // Apply push force from the moving object
        const mass = obj.mass || 1.0;
        debris.applyPushForce(obj.velocity, mass);
      }
    }
  }

  // Update all debris with push physics
  updateDebris(debrisList, majorObjects) {
    for (const debris of debrisList) {
      this.checkDebrisPush(debris, majorObjects);
    }
  }
}
