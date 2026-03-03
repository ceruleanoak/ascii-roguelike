import { PHYSICS, GRID } from '../game/GameConfig.js';

/**
 * Check if two entities are in the same plane
 * Used for vision, combat, and interaction checks
 * @param {Object} entity1 - First entity (must have .plane property)
 * @param {Object} entity2 - Second entity (must have .plane property)
 * @returns {boolean} True if both entities are in the same plane
 */
export function inSamePlane(entity1, entity2) {
  const plane1 = entity1.plane !== undefined ? entity1.plane : 0;
  const plane2 = entity2.plane !== undefined ? entity2.plane : 0;
  return plane1 === plane2;
}

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

  update(deltaTime, backgroundObjects = [], room = null) {
    const waterResults = [];
    for (const entity of this.entities) {
      const result = this.updateEntity(entity, deltaTime, backgroundObjects, room);
      if (result) waterResults.push({ entity, ...result });
    }
    return waterResults;
  }

  updateEntity(entity, deltaTime, backgroundObjects = [], room = null) {
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
    let slowingMultiplier = 1.0; // For numeric slowing values (trees, stumps)
    let damagingLiquid = null; // Track lava damage
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
          // Check for mud beds (RED zone - dry mud becomes wet and slowing)
          if (obj.isDryMud && !obj.slowing) {
            // Convert dry mud to wet mud on first step
            obj.isDryMud = false;
            obj.color = '#664422';  // Dark brown (wet)
            obj.slowing = true;
            obj.name = 'Wet Mud';
          }

          // Check for water (or lava in RED zone)
          if (obj.char === '~') {
            // Check if it's damaging lava
            if (obj.damaging && obj.damage) {
              damagingLiquid = { damage: obj.damage, name: obj.name || 'Lava' };
            }

            const wState = obj.getWaterState ? obj.getWaterState() : 'normal';
            if (wState === 'frozen') { onIce = true; }
            else { inLiquid = true; liquidState = wState; }
            break;
          }
          // Check for objects with numeric slowing first (trees, stumps)
          if (obj.data && typeof obj.data.slowing === 'number') {
            // Use the numeric value as speed multiplier (0.1 = 10% speed)
            slowingMultiplier = Math.min(slowingMultiplier, obj.data.slowing);
          }
          // Check for tall grass (boolean slowing)
          else if (obj.data && obj.data.slowing === true) {
            inGrass = true;  // 75% speed for grass
          }
          // Check for wet mud (instance property, boolean slowing)
          else if (obj.slowing === true && !obj.isDryMud) {
            inGrass = true;  // 75% speed for mud
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

    // Apply velocity multiplier for liquid water, grass, and slowing objects
    // Dodge roll ignores grass/terrain slowdown
    const isDodgeRolling = entity.dodgeRoll && entity.dodgeRoll.active;
    let velocityMultiplier = 1.0;
    if (inLiquid) {
      velocityMultiplier = 0.5; // Water slows to 50%
    } else if (inGrass && !isDodgeRolling) {
      velocityMultiplier = 0.75; // Grass slows to 75% (dodge roll ignores)
    } else if (slowingMultiplier < 1.0 && !isDodgeRolling) {
      velocityMultiplier = slowingMultiplier; // Trees/stumps use numeric value (dodge roll ignores)
    }

    // Update position with velocity multiplier
    const newX = entity.position.x + entity.velocity.vx * deltaTime * velocityMultiplier;
    const newY = entity.position.y + entity.velocity.vy * deltaTime * velocityMultiplier;

    // Collision detection (if entity has collision)
    if (entity.hasCollision) {
      const collision = this.checkCollision(entity, newX, newY, backgroundObjects);
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

    // Update plane if in tunnel room
    if (room && room.tunnel && entity.plane !== undefined) {
      this.updatePlane(entity, room.tunnel);
    }

    // Resolve tunnel wall overlaps (push entities towards tunnel center)
    if (room && room.tunnel && entity.plane === 1 && backgroundObjects) {
      this.resolveTunnelWallOverlap(entity, room.tunnel, backgroundObjects);
    }

    return { inLiquid, liquidState, damagingLiquid };
  }

  checkCollision(entity, newX, newY, backgroundObjects = []) {
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

    // Check background object collisions (for tunnel walls and solid objects)
    if (backgroundObjects && backgroundObjects.length > 0) {
      const bgCollision = this.checkBackgroundObjectCollision(entity, newX, newY, backgroundObjects);
      collision.x = collision.x || bgCollision.x;
      collision.y = collision.y || bgCollision.y;
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

  /**
   * Check collision with solid background objects (especially tunnel walls)
   * CRITICAL: Tunnel walls ONLY collide when entity.plane === 1
   */
  checkBackgroundObjectCollision(entity, newX, newY, backgroundObjects) {
    const collision = { x: false, y: false };
    const width = entity.width || GRID.CELL_SIZE;
    const height = entity.height || GRID.CELL_SIZE;
    const entityPlane = entity.plane !== undefined ? entity.plane : 0;

    for (const obj of backgroundObjects) {
      if (obj.destroyed) continue;

      // TUNNEL WALL LOGIC: Only collide if entity is in tunnel plane
      if (obj.data.tunnelWall) {
        if (entityPlane !== 1) {
          // NOT in tunnel plane - tunnel walls are passable
          continue;
        }
        // IN tunnel plane - tunnel walls are solid
        // Fall through to collision check below
      } else {
        // Objects with numeric slowing are passable (trees, stumps) - player walks through slowly
        if (obj.data && typeof obj.data.slowing === 'number') continue;

        // Non-tunnel objects: only check collision if they have solid property or block bullets
        const isSolid = obj.data.solid || obj.data.bulletInteraction === 'block' || obj.data.bulletInteraction === 'interact-preserve';
        if (!isSolid) continue;
      }

      const objBox = obj.getHitbox();

      // Use ellipse collision if object has elliptical collision shape
      if (obj.collisionShape === 'ellipse') {
        const xCollision = this.checkEllipseRectCollision(objBox, {
          x: newX,
          y: entity.position.y,
          width,
          height
        });
        const yCollision = this.checkEllipseRectCollision(objBox, {
          x: entity.position.x,
          y: newY,
          width,
          height
        });

        if (xCollision) collision.x = true;
        if (yCollision) collision.y = true;
      } else {
        // Standard AABB collision for rectangular objects
        // Check X-axis collision (test new X with current Y)
        const testXBox = {
          x: newX,
          y: entity.position.y,
          width,
          height
        };
        const xOverlap =
          testXBox.x < objBox.x + objBox.width &&
          testXBox.x + testXBox.width > objBox.x &&
          testXBox.y < objBox.y + objBox.height &&
          testXBox.y + testXBox.height > objBox.y;

        if (xOverlap) {
          collision.x = true;
        }

        // Check Y-axis collision (test new Y with current X)
        const testYBox = {
          x: entity.position.x,
          y: newY,
          width,
          height
        };
        const yOverlap =
          testYBox.x < objBox.x + objBox.width &&
          testYBox.x + testYBox.width > objBox.x &&
          testYBox.y < objBox.y + objBox.height &&
          testYBox.y + testYBox.height > objBox.y;

        if (yOverlap) {
          collision.y = true;
        }
      }

      // Early exit if both axes collide
      if (collision.x && collision.y) break;
    }

    return collision;
  }

  /**
   * Check collision between an ellipse and a rectangle (AABB)
   * Ellipse is defined by its bounding box (center and semi-axes from width/height)
   */
  checkEllipseRectCollision(ellipseBox, rectBox) {
    // Ellipse center and semi-axes
    const ex = ellipseBox.x + ellipseBox.width / 2;
    const ey = ellipseBox.y + ellipseBox.height / 2;
    const a = ellipseBox.width / 2;  // Semi-axis X
    const b = ellipseBox.height / 2; // Semi-axis Y

    // Find closest point on rectangle to ellipse center
    const closestX = Math.max(rectBox.x, Math.min(ex, rectBox.x + rectBox.width));
    const closestY = Math.max(rectBox.y, Math.min(ey, rectBox.y + rectBox.height));

    // Calculate distance from ellipse center to closest point
    const dx = closestX - ex;
    const dy = closestY - ey;

    // Check if closest point is inside ellipse using ellipse equation
    // (dx/a)² + (dy/b)² <= 1
    const normalized = (dx * dx) / (a * a) + (dy * dy) / (b * b);

    return normalized <= 1.0;
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

  /**
   * Resolve tunnel wall overlaps by pushing entities towards tunnel center
   * Prevents entities from getting stuck in walls
   */
  resolveTunnelWallOverlap(entity, tunnelData, backgroundObjects) {
    const { orientation, bounds } = tunnelData;
    const entityBox = {
      x: entity.position.x,
      y: entity.position.y,
      width: entity.width || GRID.CELL_SIZE,
      height: entity.height || GRID.CELL_SIZE
    };

    // Find all tunnel walls the entity is overlapping with
    for (const obj of backgroundObjects) {
      if (!obj.data || !obj.data.tunnelWall || obj.destroyed) continue;

      const objBox = obj.getHitbox();

      // Check if entity is overlapping with this wall
      const overlapping =
        entityBox.x < objBox.x + objBox.width &&
        entityBox.x + entityBox.width > objBox.x &&
        entityBox.y < objBox.y + objBox.height &&
        entityBox.y + entityBox.height > objBox.y;

      if (!overlapping) continue;

      // Entity is overlapping with a tunnel wall - push towards tunnel center
      const wallGridX = Math.floor(obj.position.x / GRID.CELL_SIZE);
      const wallGridY = Math.floor(obj.position.y / GRID.CELL_SIZE);

      const PUSH_DISTANCE = 2; // Pixels to push per frame

      if (orientation === 'horizontal') {
        // Horizontal tunnel: walls are on top and bottom
        // Determine if this is the top wall or bottom wall
        const tunnelCenterRow = (bounds.minRow + bounds.maxRow) / 2;

        if (wallGridY < tunnelCenterRow) {
          // Top wall - push down
          entity.position.y += PUSH_DISTANCE;
        } else {
          // Bottom wall - push up
          entity.position.y -= PUSH_DISTANCE;
        }
      } else {
        // Vertical tunnel: walls are on left and right
        // Determine if this is the left wall or right wall
        const tunnelCenterCol = (bounds.minCol + bounds.maxCol) / 2;

        if (wallGridX < tunnelCenterCol) {
          // Left wall - push right
          entity.position.x += PUSH_DISTANCE;
        } else {
          // Right wall - push left
          entity.position.x -= PUSH_DISTANCE;
        }
      }
    }
  }

  /**
   * Update entity's plane based on tunnel entrances
   * CRITICAL: Plane switches ONLY occur when crossing entrance objects, NOT at tunnel walls
   * - Enter tunnel (plane 0 → 1): Cross entrance moving INTO tunnel
   * - Exit tunnel (plane 1 → 0): Cross entrance moving OUT OF tunnel (opposite direction)
   */
  updatePlane(entity, tunnelData) {
    const { entrances, entranceAxis } = tunnelData;
    if (!entrances || entrances.length === 0) return;

    // Convert entity position to grid coordinates
    const entityGridX = Math.floor(entity.position.x / GRID.CELL_SIZE);
    const entityGridY = Math.floor(entity.position.y / GRID.CELL_SIZE);

    const isPlayer = entity.char === '@';
    const currentPlane = entity.plane !== undefined ? entity.plane : 0;

    // Check if entity is on any entrance
    const onEntrance = entrances.find(e => e.col === entityGridX && e.row === entityGridY);

    if (!onEntrance) {
      // Not on an entrance - no plane switch possible
      return;
    }

    // Entity is on an entrance - check if they should switch planes
    // This requires checking movement direction (are they entering or exiting?)

    // For now, we'll use a simpler approach:
    // - If on plane 0 and moving towards tunnel interior → switch to plane 1
    // - If on plane 1 and moving towards tunnel exterior → switch to plane 0

    // Determine movement direction based on velocity
    const movingRight = entity.velocity && entity.velocity.vx > 0;
    const movingLeft = entity.velocity && entity.velocity.vx < 0;
    const movingDown = entity.velocity && entity.velocity.vy > 0;
    const movingUp = entity.velocity && entity.velocity.vy < 0;

    let shouldSwitch = false;
    let newPlane = currentPlane;

    if (entranceAxis === 'horizontal') {
      // Horizontal tunnel: entrances on left/right
      if (onEntrance.direction === 'left') {
        // Left entrance: enter by moving RIGHT, exit by moving LEFT
        if (currentPlane === 0 && movingRight) {
          shouldSwitch = true;
          newPlane = 1;
        } else if (currentPlane === 1 && movingLeft) {
          shouldSwitch = true;
          newPlane = 0;
        }
      } else if (onEntrance.direction === 'right') {
        // Right entrance: enter by moving LEFT, exit by moving RIGHT
        if (currentPlane === 0 && movingLeft) {
          shouldSwitch = true;
          newPlane = 1;
        } else if (currentPlane === 1 && movingRight) {
          shouldSwitch = true;
          newPlane = 0;
        }
      }
    } else if (entranceAxis === 'vertical') {
      // Vertical tunnel: entrances on top/bottom
      if (onEntrance.direction === 'up') {
        // Top entrance: enter by moving DOWN, exit by moving UP
        if (currentPlane === 0 && movingDown) {
          shouldSwitch = true;
          newPlane = 1;
        } else if (currentPlane === 1 && movingUp) {
          shouldSwitch = true;
          newPlane = 0;
        }
      } else if (onEntrance.direction === 'down') {
        // Bottom entrance: enter by moving UP, exit by moving DOWN
        if (currentPlane === 0 && movingUp) {
          shouldSwitch = true;
          newPlane = 1;
        } else if (currentPlane === 1 && movingDown) {
          shouldSwitch = true;
          newPlane = 0;
        }
      }
    }

    if (shouldSwitch) {
      entity.plane = newPlane;
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
