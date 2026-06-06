import { PHYSICS, GRID, BACKGROUND_OBJECT_VARIANTS } from '../game/GameConfig.js';
import {
  PLANE_TUNNEL,
  planeOf,
  inSamePlane,
  objectOnPlane,
} from './PlaneSystem.js';

// Re-exported so existing imports (e.g. Enemy.js) keep working.
// New code should import directly from PlaneSystem.
export { inSamePlane };

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

  /**
   * Apply knockback to an entity away from a source position.
   * Reads entity.knockbackResistance (0 = none, 1 = immune) to scale force.
   */
  applyKnockback(entity, sourceX, sourceY, force, duration = 0.2) {
    const cx = entity.position.x + GRID.CELL_SIZE / 2;
    const cy = entity.position.y + GRID.CELL_SIZE / 2;
    const dx = cx - sourceX;
    const dy = cy - sourceY;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    this._applyKnockbackForce(entity, dx / dist, dy / dist, force, duration);
  }

  /**
   * Apply knockback to an entity along an explicit direction vector.
   * Use when the direction is independent of source position (e.g. boulders).
   */
  applyKnockbackDir(entity, dirX, dirY, force, duration = 0.2) {
    const dist = Math.sqrt(dirX * dirX + dirY * dirY) || 1;
    this._applyKnockbackForce(entity, dirX / dist, dirY / dist, force, duration);
  }

  /**
   * Freeze an entity's position integration for a short duration.
   * Takes the max of any existing timer so multiple simultaneous hits don't fight.
   */
  applyHitstop(entity, duration) {
    if (!entity) return;
    entity.hitstopTimer = Math.max(entity.hitstopTimer ?? 0, duration);
  }

  /**
   * Additive velocity impulse, mass-scaled. Unlike applyKnockback this does not
   * override existing velocity — it nudges it. Used for recoil and soft contact.
   */
  applyImpulse(entity, dirX, dirY, force) {
    const dist = Math.sqrt(dirX * dirX + dirY * dirY) || 1;
    const massScale = 1 / (entity.mass ?? 1);
    entity.velocity.vx += (dirX / dist) * force * massScale;
    entity.velocity.vy += (dirY / dist) * force * massScale;
  }

  /**
   * Soft separation pass: gently push the player and any overlapping enemies apart.
   * Prevents stacking without using knockback (no status effects, no resistance).
   * Call once per frame after the main physics update.
   */
  resolveEntityContacts(player, enemies) {
    if (player.dodgeRoll?.active && player.dodgeRoll.type === 'whirlwind') return; // pass through enemies during spin
    const MIN_DIST = GRID.CELL_SIZE * 1.2;
    const FORCE = 120;
    for (const enemy of enemies) {
      if (enemy.destroyed) continue;
      if (enemy.sapping) continue; // Sapping enemies are intentionally on the player — no separation
      if (enemy.isBossEntity) continue; // Boss entities own their movement — separation would prevent grabs
      if (enemy.chargeState === 'charging') continue; // Charging enemies (boar) plow through — soft push would cancel the dash hit
      if (!inSamePlane(player, enemy)) continue; // Cross-plane enemies are non-interactive
      const dx = player.position.x - enemy.position.x;
      const dy = player.position.y - enemy.position.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      if (dist < MIN_DIST) {
        const overlap = (MIN_DIST - dist) / MIN_DIST;
        const force = FORCE * overlap;
        this.applyImpulse(player, dx, dy, force);
        this.applyImpulse(enemy, -dx, -dy, force);
      }
    }
  }

  _applyKnockbackForce(entity, nx, ny, force, duration) {
    const massResistance = 1 - (1 / (entity.mass ?? 1));
    const resistance = Math.max(massResistance, entity.knockbackResistance ?? 0);
    if (resistance >= 1) return;
    const scaledForce = force * (1 - resistance);
    entity.velocity.vx = nx * scaledForce;
    entity.velocity.vy = ny * scaledForce;
    entity.applyStatusEffect?.('knockback', duration);
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

    // Hitstop: freeze position integration, tick timer
    if (entity.hitstopTimer > 0) {
      entity.hitstopTimer = Math.max(0, entity.hitstopTimer - deltaTime);
      return null;
    }

    // Carried by thrown spear: TrapSystem owns position this frame — skip all physics
    if (entity.carriedBySpear) return null;

    // Pinned to wall/object (spear throw): incoming knockback breaks it, otherwise frozen
    if (entity.pinnedDuration > 0) {
      const spd = Math.sqrt(entity.velocity.vx ** 2 + entity.velocity.vy ** 2);
      if (spd > 80) {
        entity.pinnedDuration = 0; // New knockback breaks the pin
      } else {
        entity.pinnedDuration = Math.max(0, entity.pinnedDuration - deltaTime);
        entity.velocity.vx = 0;
        entity.velocity.vy = 0;
      }
    }

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
    let onSlopeDirection = null; // Ascent room slope push direction
    let onCurrentDirection = null; // Yellow zone river current push direction
    const isProjectile = entity.type === 'bullet' || entity.type === 'arrow';

    // Reset per-frame terrain flags (read by Player.updateDodgeRoll with 1-frame lag)
    if (!isProjectile) {
      entity.isOnSlope = false;
      entity.isOnIce   = false;
    }

    if (!isProjectile && !entity.ignoreBackgroundCollision && backgroundObjects && backgroundObjects.length > 0) {
      const entityPlane = planeOf(entity);
      for (const obj of backgroundObjects) {
        if (obj.destroyed) continue;
        if (!objectOnPlane(obj, entityPlane)) continue;

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
          // Check for slope tiles (Ascent room — push entity in slope direction)
          if (obj.slope) {
            onSlopeDirection = obj.slopeDirection;
            entity.isOnSlope = true; // For dodge roll slope-lock mechanic
          }

          // Check for water/lava/mud (~)
          if (obj.char === '~') {
            const isLavaObj = obj.typeId ? obj.typeId === 'lava'
                                         : (obj.damaging && obj.damage);
            const isMudObj  = obj.typeId ? (obj.typeId === 'mud_dry' || obj.typeId === 'mud_wet')
                                         : (obj.isDryMud || obj.slowing === true);

            // Mud activation: dry → wet on first step
            if (obj.typeId === 'mud_dry') {
              obj.typeId = 'mud_wet';
              obj._variantData = BACKGROUND_OBJECT_VARIANTS['mud_wet'];
              obj.color = obj._variantData.color;
              obj.animationColor = obj._variantData.color;
            } else if (obj.isDryMud && !obj.slowing) {
              // Legacy path
              obj.isDryMud = false;
              obj.color = '#664422';
              obj.slowing = true;
              obj.name = 'Wet Mud';
            }

            if (isLavaObj) {
              const dmg = obj._variantData ? obj._variantData.damage : obj.damage;
              damagingLiquid = { damage: dmg, name: obj.name || 'Lava' };
              // Lava does NOT set inLiquid — no wet status
            } else if (isMudObj) {
              inGrass = true; // 75% speed, same path as grass — but NOT inLiquid
              // Mud does NOT set inLiquid — no wet status, no water state transitions
            } else {
              // Real water
              const wState = obj.getWaterState ? obj.getWaterState() : 'normal';
              if (wState === 'frozen') {
                onIce = true;
                entity.isOnIce = true; // For dodge roll ice-lock mechanic
              } else if (wState === 'crystallized') {
                // Coral Crown platform — walkable, no wet status, no slide.
                // Intentionally leave inLiquid/onIce false.
              } else {
                inLiquid = true;
                liquidState = wState;
                // River-current push: only the center flow tile carries a direction.
                // Sides are static water (no flowDir) and don't shove the entity.
                if (obj.riverFlow && obj.flowDir) onCurrentDirection = obj.flowDir;
              }
            }
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
      const friction = onIce ? PHYSICS.FRICTION * 1.03 : PHYSICS.FRICTION;
      entity.velocity.vx *= friction;
      entity.velocity.vy *= friction;
    }

    // Apply slope push (Ascent room) — constant cardinal acceleration, unaffected by dodge roll
    // Diagonal correction: scale by 1/√2 when entity is moving in both axes so that
    // net slope drift speed is identical regardless of cardinal vs diagonal movement.
    if (onSlopeDirection && !isProjectile) {
      const SLOPE_ACCEL = 400; // px/s² — gives ~67 px/s terminal drift at FRICTION=0.9
      const absVx = Math.abs(entity.velocity.vx);
      const absVy = Math.abs(entity.velocity.vy);
      const isDiagonal = absVx > 10 && absVy > 10;
      const slopeAccel = isDiagonal ? SLOPE_ACCEL / Math.SQRT2 : SLOPE_ACCEL;
      switch (onSlopeDirection) {
        case 'up':    entity.velocity.vy -= slopeAccel * deltaTime; break;
        case 'down':  entity.velocity.vy += slopeAccel * deltaTime; break;
        case 'left':  entity.velocity.vx -= slopeAccel * deltaTime; break;
        case 'right': entity.velocity.vx += slopeAccel * deltaTime; break;
      }
    }

    // River current — constant acceleration along flow direction (8 dirs).
    // Same shape as the slope push above so diagonal vs cardinal movement gives
    // the same net drift. Floating entities are unaffected (handled below).
    if (onCurrentDirection && !isProjectile && !(entity.floatTimer > 0) && !(entity.data?.float)) {
      const CURRENT_ACCEL = 320; // px/s² — gentler than slopes; enemies/items still navigable
      const absVx = Math.abs(entity.velocity.vx);
      const absVy = Math.abs(entity.velocity.vy);
      const isDiagonal = absVx > 10 && absVy > 10;
      const accel = isDiagonal ? CURRENT_ACCEL / Math.SQRT2 : CURRENT_ACCEL;
      const DIAG = 1 / Math.SQRT2;
      const PUSH = {
        up:    [0, -1], down:  [0, 1],
        left:  [-1, 0], right: [1, 0],
        ne:    [DIAG, -DIAG], nw: [-DIAG, -DIAG],
        se:    [DIAG,  DIAG], sw: [-DIAG,  DIAG]
      };
      const [px, py] = PUSH[onCurrentDirection] || [0, 0];
      entity.velocity.vx += px * accel * deltaTime;
      entity.velocity.vy += py * accel * deltaTime;
    }

    // Float (Floating Boots or flying enemies) — immune to all liquid and mud effects
    const hasFloat = (entity.floatTimer > 0) || (entity.data?.float);
    if (hasFloat) {
      inLiquid = false;
      damagingLiquid = null;
      inGrass = false;
    }

    // Apply velocity multiplier for liquid water, grass, and slowing objects
    // Dodge roll ignores grass/terrain slowdown
    const isDodgeRolling = entity.dodgeRoll && entity.dodgeRoll.active;
    let velocityMultiplier = 1.0;
    if (inLiquid) {
      // swimAffinity entities (e.g. frog) glide through water at full speed —
      // they compensate via higher jump velocity in water. Shark Mask divers
      // are treated the same way while their dive is active.
      velocityMultiplier = (entity.data?.swimAffinity || entity.diving) ? 1.0 : 0.5;
    } else if (inGrass && !isDodgeRolling) {
      velocityMultiplier = 0.75; // Grass slows to 75% (dodge roll ignores)
    } else if (slowingMultiplier < 1.0 && !isDodgeRolling) {
      velocityMultiplier = slowingMultiplier; // Trees/stumps use numeric value (dodge roll ignores)
    }

    if (entity.isStaffBlocking && !isDodgeRolling) {
      velocityMultiplier *= 0.5; // Staff block: half-speed while bracing
    }

    // Update position with velocity multiplier
    const newX = entity.position.x + entity.velocity.vx * deltaTime * velocityMultiplier;
    const newY = entity.position.y + entity.velocity.vy * deltaTime * velocityMultiplier;

    // Collision detection (if entity has collision)
    if (entity.hasCollision) {
      const collision = this.checkCollision(entity, newX, newY, backgroundObjects, room);
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
      if (entity.pinOnWallContact && (collision.x || collision.y)) {
        entity.pinnedDuration = 2.0;
        entity.pinOnWallContact = false;
      }

    } else {
      entity.position.x = newX;
      entity.position.y = newY;
    }

    // Bounds checking
    if (entity.boundToGrid) {
      this.enforceGridBounds(entity);
    }

    // Eject entity from any wall cells it currently overlaps (knockback / spawn-inside fix).
    if (!isProjectile && entity.hasCollision) {
      this.resolveCollisionMapOverlap(entity, room);
    }

    // Eject entity from any solid background objects it is already overlapping.
    // This handles cases where an entity spawns inside (or is pushed into) a solid
    // object, which would otherwise leave it permanently stuck.
    if (!isProjectile && !entity.ignoreBackgroundCollision && entity.hasCollision && backgroundObjects && backgroundObjects.length > 0) {
      this.resolveSolidObjectOverlap(entity, backgroundObjects);
    }

    // Update plane if in tunnel room
    if (room && room.tunnel && entity.plane !== undefined) {
      this.updatePlane(entity, room.tunnel);
    }

    // Update plane if in underground room
    if (room && room.underground && entity.plane !== undefined) {
      this.updatePlane(entity, room.underground);
    }

    // Resolve tunnel wall overlaps (push entities towards tunnel center)
    if (room && room.tunnel && planeOf(entity) === PLANE_TUNNEL && backgroundObjects) {
      this.resolveTunnelWallOverlap(entity, room.tunnel, backgroundObjects, deltaTime);
    }

    return { inLiquid, liquidState, damagingLiquid };
  }

  checkCollision(entity, newX, newY, backgroundObjects = [], room = null) {
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
          height,
          'x',
          entity,
          room
        );
      }

      // Test Y-axis movement (keeping current X position)
      if (!collision.y) {
        collision.y = this.checkAxisCollision(
          entity.collisionMap,
          entity.position.x,
          newY,
          width,
          height,
          'y',
          entity,
          room
        );
      }
    }

    // Check background object collisions (for tunnel walls and solid objects)
    if (!entity.ignoreBackgroundCollision && backgroundObjects && backgroundObjects.length > 0) {
      const bgCollision = this.checkBackgroundObjectCollision(entity, newX, newY, backgroundObjects);
      collision.x = collision.x || bgCollision.x;
      collision.y = collision.y || bgCollision.y;
    }

    return collision;
  }

  /**
   * Returns true if the entity can pass through a collisionMap cell due to a
   * room-defined conditional passable zone.
   *
   * Supported conditions (room.passableZones[i].condition):
   *   'float' — entity.floatTimer > 0 (Floating Boots active)
   *   'small' — entity.isSmall truthy (frog form / mini — future)
   *
   * The passableZones array is set on rooms at generation time and is read-only
   * by the physics system.
   */
  _isCellConditionallyPassable(row, col, entity, room) {
    if (!room?.passableZones) return false;
    for (const zone of room.passableZones) {
      if (row < zone.minRow || row > zone.maxRow) continue;
      if (col < zone.minCol || col > zone.maxCol) continue;
      if (zone.condition === 'float' && entity.floatTimer > 0) return true;
      if (zone.condition === 'small' && entity.isSmall)        return true;
    }
    return false;
  }

  /**
   * Check if a specific position collides with walls
   * Helper for independent X/Y axis collision testing
   * For 'x' axis, wall cells use half their tile width (CELL_SIZE/2 inner region)
   */
  checkAxisCollision(collisionMap, testX, testY, width, height, axis = 'y', entity = null, room = null) {
    const cellX = Math.floor(testX / GRID.CELL_SIZE);
    const cellY = Math.floor(testY / GRID.CELL_SIZE);
    const cellX2 = Math.floor((testX + width - 1) / GRID.CELL_SIZE);
    const cellY2 = Math.floor((testY + height - 1) / GRID.CELL_SIZE);

    for (let cy = cellY; cy <= cellY2; cy++) {
      for (let cx = cellX; cx <= cellX2; cx++) {
        if (collisionMap[cy]?.[cx]) {
          if (entity && room && this._isCellConditionallyPassable(cy, cx, entity, room)) continue;
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Push entity out of any wall cells it currently overlaps.
   * Uses minimum-penetration vector per overlapping cell, same approach
   * as resolveSolidObjectOverlap for background objects. Called after
   * position is committed so knockback / spawn-inside cases can't deadlock.
   */
  resolveCollisionMapOverlap(entity, room = null) {
    if (!entity.collisionMap) return;
    const width  = entity.width  || GRID.CELL_SIZE;
    const height = entity.height || GRID.CELL_SIZE;

    // Two passes handle the case where pushing out of one cell causes overlap
    // with an adjacent cell (e.g. tight corridors).
    for (let pass = 0; pass < 2; pass++) {
      const cellX  = Math.floor(entity.position.x / GRID.CELL_SIZE);
      const cellY  = Math.floor(entity.position.y / GRID.CELL_SIZE);
      const cellX2 = Math.floor((entity.position.x + width  - 1) / GRID.CELL_SIZE);
      const cellY2 = Math.floor((entity.position.y + height - 1) / GRID.CELL_SIZE);

      let pushed = false;
      outer: for (let cy = cellY; cy <= cellY2; cy++) {
        for (let cx = cellX; cx <= cellX2; cx++) {
          if (!entity.collisionMap[cy]?.[cx]) continue;
          if (room && this._isCellConditionallyPassable(cy, cx, entity, room)) continue;

          const wallLeft   = cx * GRID.CELL_SIZE;
          const wallRight  = wallLeft  + GRID.CELL_SIZE;
          const wallTop    = cy * GRID.CELL_SIZE;
          const wallBottom = wallTop   + GRID.CELL_SIZE;

          const penL = (entity.position.x + width)  - wallLeft;
          const penR = wallRight  - entity.position.x;
          const penT = (entity.position.y + height) - wallTop;
          const penB = wallBottom - entity.position.y;

          const min = Math.min(penL, penR, penT, penB);
          if (min <= 0) continue;

          if (min === penL) {
            entity.position.x = wallLeft - width;
            entity.velocity.vx = Math.min(0, entity.velocity.vx);
          } else if (min === penR) {
            entity.position.x = wallRight;
            entity.velocity.vx = Math.max(0, entity.velocity.vx);
          } else if (min === penT) {
            entity.position.y = wallTop - height;
            entity.velocity.vy = Math.min(0, entity.velocity.vy);
          } else {
            entity.position.y = wallBottom;
            entity.velocity.vy = Math.max(0, entity.velocity.vy);
          }
          pushed = true;
          break outer;
        }
      }
      if (!pushed) break;
    }
  }

  /**
   * Check collision with solid background objects.
   * Plane affinity is resolved via PlaneSystem.objectOnPlane — objects not on the
   * entity's plane (e.g. tunnel walls when above ground, rocks when below) are skipped.
   */
  checkBackgroundObjectCollision(entity, newX, newY, backgroundObjects) {
    const collision = { x: false, y: false };
    const width = entity.width || GRID.CELL_SIZE;
    const height = entity.height || GRID.CELL_SIZE;
    const entityPlane = planeOf(entity);

    for (const obj of backgroundObjects) {
      if (obj.destroyed) continue;

      // Plane affinity gate — must be present on entity's plane to be collidable.
      if (!objectOnPlane(obj, entityPlane)) continue;

      // tunnelWall objects are unconditionally solid on their plane (no slowing/isSolid check).
      // Other objects (including surfaceOnly) follow normal solidity rules.
      if (!obj.data.tunnelWall) {
        if (obj.data && typeof obj.data.slowing === 'number') continue;
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
        // Standard AABB collision for rectangular objects.
        // Each axis is swept independently: moving X uses current Y; moving Y uses current X.
        //
        // SKIN: the perpendicular-axis check is inset by 1px on each side.
        // This prevents "sticky corners" — when the player is flush against an
        // object's face, floating-point residuals can leave entity.position barely
        // inside the object's X (or Y) range, falsely blocking the other axis.
        // With SKIN=1, the player must be ≥1px INTO the hitbox range before the
        // perpendicular axis is considered overlapping. This mirrors the Zelda NES
        // standard of a 1–2px overlap threshold for smooth wall-sliding.
        const SKIN = 1;

        // Check X-axis collision (test new X with current Y; inset Y by SKIN)
        const xOverlap =
          newX                  < objBox.x + objBox.width &&
          newX + width          > objBox.x &&
          entity.position.y + SKIN         < objBox.y + objBox.height &&
          entity.position.y + height - SKIN > objBox.y;

        if (xOverlap) {
          collision.x = true;
        }

        // Check Y-axis collision (test new Y with current X; inset X by SKIN)
        const yOverlap =
          entity.position.x + SKIN         < objBox.x + objBox.width &&
          entity.position.x + width - SKIN > objBox.x &&
          newY                  < objBox.y + objBox.height &&
          newY + height         > objBox.y;

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
  resolveTunnelWallOverlap(entity, tunnelData, backgroundObjects, deltaTime = 1 / 60) {
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

      const PUSH_SPEED = 120; // Pixels per second (frame-rate independent)
      const pushAmount = PUSH_SPEED * deltaTime;

      if (orientation === 'horizontal') {
        // Horizontal tunnel: walls are on top and bottom
        // Determine if this is the top wall or bottom wall
        const tunnelCenterRow = (bounds.minRow + bounds.maxRow) / 2;

        if (wallGridY < tunnelCenterRow) {
          // Top wall - push down
          entity.position.y += pushAmount;
        } else {
          // Bottom wall - push up
          entity.position.y -= pushAmount;
        }
      } else {
        // Vertical tunnel: walls are on left and right
        // Determine if this is the left wall or right wall
        const tunnelCenterCol = (bounds.minCol + bounds.maxCol) / 2;

        if (wallGridX < tunnelCenterCol) {
          // Left wall - push right
          entity.position.x += pushAmount;
        } else {
          // Right wall - push left
          entity.position.x -= pushAmount;
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

    const currentPlane = planeOf(entity);

    // Use AABB hitbox overlap instead of exact grid-cell match.
    // Grid-cell equality fails for diagonal movement: when the entity first
    // reaches the entrance column, its y has simultaneously drifted outside
    // the entrance row range, so the exact (col, row) pair is never matched.
    // An overlap check fires whenever any part of the hitbox touches an entrance tile.
    const entityW = entity.width  || GRID.CELL_SIZE;
    const entityH = entity.height || GRID.CELL_SIZE;
    const CELL = GRID.CELL_SIZE;
    const OVERLAP_THRESHOLD = CELL * CELL * 0.6; // 60% of entrance cell area — must commit before plane flips
    const onEntrance = entrances.find(e => {
      const ex = e.col * CELL;
      const ey = e.row * CELL;
      const overlapX = Math.max(0, Math.min(entity.position.x + entityW, ex + CELL) - Math.max(entity.position.x, ex));
      const overlapY = Math.max(0, Math.min(entity.position.y + entityH, ey + CELL) - Math.max(entity.position.y, ey));
      return overlapX * overlapY >= OVERLAP_THRESHOLD;
    });

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

    if (entranceAxis === 'all') {
      // Underground rooms: 4-directional entrances.
      // dir = direction the entrance marker points (AWAY from cave, toward surface).
      // Enter cave (plane 0→1): moving opposite to dir (into cave).
      // Exit cave  (plane 1→0): moving same as dir (toward surface).
      const dir = onEntrance.direction;
      const enterCave =
        (dir === 'up'    && movingDown)  ||
        (dir === 'down'  && movingUp)    ||
        (dir === 'right' && movingLeft)  ||
        (dir === 'left'  && movingRight);
      const exitCave =
        (dir === 'up'    && movingUp)    ||
        (dir === 'down'  && movingDown)  ||
        (dir === 'right' && movingRight) ||
        (dir === 'left'  && movingLeft);

      if (currentPlane === 0 && enterCave) {
        entity.plane = 1;
      } else if (currentPlane === 1 && exitCave) {
        entity.plane = 0;
      }
      return;
    }

    if (shouldSwitch) {
      entity.plane = newPlane;
    }
  }


  // Ingredient attraction physics
  applyAttraction(ingredient, target) {
    // Don't attract while pickup cooldown is active
    if (ingredient.pickupCooldown > 0) {
      ingredient.acceleration = { ax: 0, ay: 0 };
      return false;
    }

    // Cross-plane ingredients are unreachable — no attraction, no pickup.
    if (!inSamePlane(ingredient, target)) {
      ingredient.acceleration = { ax: 0, ay: 0 };
      return false;
    }

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

  /**
   * Eject an entity out of any solid background objects it is currently overlapping.
   * Uses the minimum-penetration-depth axis to push the entity cleanly free.
   * Called every frame so entities (e.g. enemies spawned on rocks) escape quickly.
   */
  resolveSolidObjectOverlap(entity, backgroundObjects) {
    const width = entity.width || GRID.CELL_SIZE;
    const height = entity.height || GRID.CELL_SIZE;
    const entityPlane = planeOf(entity);

    // Multi-pass eject — pushing out of one object can put the entity inside
    // another (rocks placed in adjacent cells, knockback into a cluster, etc.).
    // Mirrors the 2-pass approach used by resolveCollisionMapOverlap.
    for (let pass = 0; pass < 4; pass++) {
      let pushed = false;

      for (const obj of backgroundObjects) {
        if (obj.destroyed) continue;
        if (!obj.data) continue;

        // Plane affinity gate.
        if (!objectOnPlane(obj, entityPlane)) continue;

        // tunnelWall is unconditionally solid on its plane; others must clear solidity rules.
        if (!obj.data.tunnelWall) {
          if (typeof obj.data.slowing === 'number') continue;
          const isSolid = obj.data.solid ||
            obj.data.bulletInteraction === 'block' ||
            obj.data.bulletInteraction === 'interact-preserve';
          if (!isSolid) continue;
        }

        const objBox = obj.getHitbox();
        const ex = entity.position.x;
        const ey = entity.position.y;

        // Compute overlap on each axis
        const overlapX = Math.min(ex + width, objBox.x + objBox.width) - Math.max(ex, objBox.x);
        const overlapY = Math.min(ey + height, objBox.y + objBox.height) - Math.max(ey, objBox.y);

        if (overlapX <= 0 || overlapY <= 0) continue; // Not actually overlapping

        // Push along the axis of minimum penetration. Preserve velocity in the
        // direction away from the object (matches resolveCollisionMapOverlap)
        // so the entity can slide along instead of fully stalling.
        if (overlapX < overlapY) {
          const entityCenterX = ex + width / 2;
          const objCenterX = objBox.x + objBox.width / 2;
          if (entityCenterX < objCenterX) {
            entity.position.x -= overlapX;
            entity.velocity.vx = Math.min(0, entity.velocity.vx);
          } else {
            entity.position.x += overlapX;
            entity.velocity.vx = Math.max(0, entity.velocity.vx);
          }
        } else {
          const entityCenterY = ey + height / 2;
          const objCenterY = objBox.y + objBox.height / 2;
          if (entityCenterY < objCenterY) {
            entity.position.y -= overlapY;
            entity.velocity.vy = Math.min(0, entity.velocity.vy);
          } else {
            entity.position.y += overlapY;
            entity.velocity.vy = Math.max(0, entity.velocity.vy);
          }
        }
        pushed = true;
      }

      if (!pushed) break;
    }
  }
}
