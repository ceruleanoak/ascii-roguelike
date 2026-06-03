import { GRID } from '../game/GameConfig.js';
import { Ingredient } from '../entities/Ingredient.js';
import { INGREDIENTS } from '../data/items.js';
import { coverFor } from '../data/cipher.js';

/**
 * MazeSystem — manages the Maze (M) room interior.
 *
 * A single continuous 19×19 cell DFS maze (9×9 logical cells with 1-cell walls).
 * At 16 px/cell this is 304×304 px, rendered as a PiP centered on the 480×480 canvas.
 *
 * Maze objects are placed at dead-end corridors (degree-1 nodes in the maze).
 * Each takes 3 hits to break; standing adjacent reveals the hidden ingredient beneath.
 *
 * Countdown timer (5 s):
 *   - Starts when the first object is broken.
 *   - Each expiry: 1 ghost spawns (converted from a random surviving object, or
 *     at a random open cell if none remain), then the timer resets.
 *   - After 4 cumulative ghost spawns all ghosts become "phasing" (pass through walls,
 *     move 2× faster). They continue to multiply every 5 s indefinitely.
 *
 * Ghosts (U+2689 '⚉'):
 *   - Immune to all damage; no knockback on player contact.
 *   - 1 damage per 0.75 s touch.
 *   - Normal mode: slide around walls toward player.
 *   - Phasing mode: move directly through walls at 2× speed.
 *
 * Re-entry: once the player exits the maze door is permanently sealed.
 */

// ─── Constants ───────────────────────────────────────────────────────────────

const LOGICAL_SIZE = 9;                              // 9×9 logical maze cells
const PHYS         = LOGICAL_SIZE * 2 + 1;           // 19×19 physical grid
const CS           = GRID.CELL_SIZE;                 // 16 px per cell

// Proximity radius for exterior door interaction (px from door center)
const DOOR_INTERACT_RADIUS = CS * 2;

const GHOST_CHAR           = '⚉';  // U+2689
const GHOST_COLOR_NORMAL   = '#9988cc';
const GHOST_COLOR_PHASING  = '#ccbbff';
const GHOST_SPEED_NORMAL   = 35;   // px/s
const GHOST_SPEED_PHASING  = 35;   // px/s — same speed; phasing grants wall-pass only
const GHOST_DAMAGE         = 1;
const GHOST_DAMAGE_INTERVAL = 0.75; // s between damage ticks

const TIMER_DURATION = 5.0; // s per countdown

// Maze object cover color — actual cover glyph is derived from the hidden
// ingredient via the cipher (see coverFor). Each cover taught is a cipher
// pairing learned.
const OBJ_COLOR  = '#9977aa';

// Hidden ingredient rewards — tiered by depth
const REWARDS_COMMON   = ['c', 'b', 'd', 'a', 'l', 'r', 'h', 'f', 't', 'm', '0'];
const REWARDS_UNCOMMON = ['g', 'w', 's', 'e', 'k', 'o', 'v', 'F', 'M', 'j', 'i'];
const REWARDS_RARE     = ['1', '9', '`', '_', '?', '(', '6'];

// ─── MazeObject ────────────────────────────────────────────────────────────

class MazeObject {
  constructor(char, col, row, hiddenChar) {
    this.char       = char;
    this.color      = OBJ_COLOR;
    this.col        = col;
    this.row        = row;
    this.position   = { x: col * CS, y: row * CS };
    this.hp         = 3;
    this.maxHp      = 3;
    this.hiddenChar = hiddenChar;
    this.destroyed  = false;
    this.hitFlash   = 0;     // white flash (s) when struck
    this.hitCooldown = 0;    // prevent same-attack double-hit
    this.revealed   = false; // true when player is adjacent → show hidden char
  }
}

// ─── MazeGhost ─────────────────────────────────────────────────────────────

class MazeGhost {
  constructor(x, y) {
    this.char           = GHOST_CHAR;
    this.color          = GHOST_COLOR_NORMAL;
    this.position       = { x, y };
    this.speed          = GHOST_SPEED_NORMAL;
    this.damageCooldown = 0;
    this.phasesWalls    = false;
    // Immune — absorbs all weapon hits silently
    this.hp             = Infinity;
    this.takeDamage     = () => 0;
  }
}

// ─── MazeSystem ───────────────────────────────────────────────────────────

export class MazeSystem {
  constructor(game) {
    this.game = game;
  }

  // ─── Interior Generation ─────────────────────────────────────────────────

  generateMazeInterior() {
    // All solid to start
    const collisionMap = Array.from({ length: PHYS }, () => new Array(PHYS).fill(true));

    // DFS maze — carve logical cells and passages
    const visited = Array.from({ length: LOGICAL_SIZE }, () => new Array(LOGICAL_SIZE).fill(false));
    const degrees = Array.from({ length: LOGICAL_SIZE }, () => new Array(LOGICAL_SIZE).fill(0));

    const physR = (lr) => lr * 2 + 1;
    const physC = (lc) => lc * 2 + 1;

    const carve = (lr, lc) => {
      visited[lr][lc] = true;
      collisionMap[physR(lr)][physC(lc)] = false; // open the room cell

      const dirs = [[-1,0],[1,0],[0,-1],[0,1]].sort(() => Math.random() - 0.5);
      for (const [dr, dc] of dirs) {
        const nr = lr + dr, nc = lc + dc;
        if (nr < 0 || nr >= LOGICAL_SIZE || nc < 0 || nc >= LOGICAL_SIZE) continue;
        if (visited[nr][nc]) continue;
        // Carve wall between current and neighbor
        collisionMap[physR(lr) + dr][physC(lc) + dc] = false;
        degrees[lr][lc]++;
        degrees[nr][nc]++;
        carve(nr, nc);
      }
    };
    carve(0, 0);

    // Place maze objects at dead-end logical cells (degree 1)
    const mazeObjects = [];
    const depth   = this.game.getCurrentZoneDepth?.() ?? 0;
    const rewards = this._shuffledRewards(depth);
    for (let lr = 0; lr < LOGICAL_SIZE; lr++) {
      for (let lc = 0; lc < LOGICAL_SIZE; lc++) {
        if (degrees[lr][lc] !== 1) continue; // only dead ends
        const hidden = rewards.shift() || 'c';
        const char   = coverFor(hidden);
        mazeObjects.push(new MazeObject(char, physC(lc), physR(lr), hidden));
        // Object is solid — player must hit it, not walk through it
        collisionMap[physR(lr)][physC(lc)] = true;
      }
    }

    // Exit/entrance: open bottom-right corner cell (logical [8][8])
    const exitRow = physR(LOGICAL_SIZE - 1); // 17
    const exitCol = physC(LOGICAL_SIZE - 1); // 17
    // Open the south-side border cell so the player can step out
    collisionMap[PHYS - 1][exitCol] = false; // row 18, the outer wall
    // Also open the room cell itself (may have been re-sealed by an object)
    collisionMap[exitRow][exitCol] = false;

    const spawnPoint = { x: exitCol * CS, y: (exitRow - 1) * CS };

    return {
      gridCols: PHYS,
      gridRows: PHYS,
      collisionMap,
      mazeObjects,
      ghosts: [],
      timer:      { active: false, time: 0 },
      spawnCount: 0,   // cumulative ghosts spawned by timer
      exitsSealed: false,
      exitRow: PHYS - 1, // outer south wall row (player steps here to exit)
      exitCol,
      spawnPoint,
    };
  }

  _shuffledRewards(depth = 0) {
    let pool;
    if (depth <= 3) {
      // Early: mostly common, small uncommon sprinkling
      pool = [...REWARDS_COMMON, ...REWARDS_COMMON, ...REWARDS_UNCOMMON];
    } else if (depth <= 6) {
      // Mid: balanced
      pool = [...REWARDS_COMMON, ...REWARDS_UNCOMMON, ...REWARDS_UNCOMMON, ...REWARDS_RARE];
    } else {
      // Deep: uncommon + rare dominant
      pool = [...REWARDS_UNCOMMON, ...REWARDS_UNCOMMON, ...REWARDS_RARE, ...REWARDS_RARE];
    }
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool;
  }

  // ─── Entry / Exit ────────────────────────────────────────────────────────

  /** Returns true if player is close enough to the exterior maze door to interact. */
  nearExteriorDoor() {
    const { game } = this;
    if (!game.player || game.player.inMaze || game.player.inHut) return false;
    if (!game.currentRoom?.maze) return false;
    if (game.currentRoom.maze.sealed) return false;
    if ((game.player._mazeEntryCooldown ?? 0) > 0) return false;
    const { doorPosition } = game.currentRoom.maze;
    if (!doorPosition) return false;
    return this._nearCell(game.player, doorPosition.col * CS, doorPosition.row * CS);
  }

  _enterMaze() {
    const { game } = this;
    game.player.mazeExitPosition = { x: game.player.position.x, y: game.player.position.y };
    game.mazeInterior = this.generateMazeInterior();
    game.currentRoom.maze.interiorGenerated = true;

    game.player.setCollisionMap(game.mazeInterior.collisionMap);
    game.player.position.x = game.mazeInterior.spawnPoint.x;
    game.player.position.y = game.mazeInterior.spawnPoint.y;
    game.player.inMaze = true;
    game.renderer.backgroundDirty = true;
  }

  checkInteriorExit() {
    const { game } = this;
    if (!game.player?.inMaze || !game.mazeInterior) return;
    const mi = game.mazeInterior;
    if (mi.exitsSealed) return;

    // Player exits when they walk off the bottom of the maze
    if (game.player.position.y >= mi.exitRow * CS) {
      this._exitMaze();
    }
  }

  _exitMaze() {
    const { game } = this;

    if (game.player.mazeExitPosition) {
      game.player.position.x = game.player.mazeExitPosition.x;
      game.player.position.y = game.player.mazeExitPosition.y;
    }
    game.player._mazeEntryCooldown = 0.5;

    if (game.currentRoom?.collisionMap) {
      game.player.setCollisionMap(game.currentRoom.collisionMap);
    }

    if (game.currentRoom?.maze) {
      game.currentRoom.maze.sealed = true;
      const { doorPosition } = game.currentRoom.maze;
      // Close the gap in the room collision map
      if (game.currentRoom.collisionMap) {
        game.currentRoom.collisionMap[doorPosition.row][doorPosition.col] = true;
      }
      // Replace door glyph '∩' with wall '≡'
      const doorPx = doorPosition.col * CS;
      const doorPy = doorPosition.row * CS;
      const doorObj = game.backgroundObjects?.find(
        o => o.char === '∩' && o.position.x === doorPx && o.position.y === doorPy
      );
      if (doorObj) { doorObj.char = '≡'; doorObj.color = '#888888'; }
    }

    game.player.inMaze = false;

    // Drop maze-plane loot (abandoned on exit)
    game.ingredients = game.ingredients.filter(i => !i.mazePlane);
    game.items       = game.items.filter(i => !i.mazePlane);

    game.mazeInterior = null;
    game.renderer.backgroundDirty = true;
  }

  // ─── Update Loop ─────────────────────────────────────────────────────────

  update(dt) {
    const { game } = this;
    if (!game.player) return;

    if ((game.player._mazeEntryCooldown ?? 0) > 0) {
      game.player._mazeEntryCooldown -= dt;
    }

    if (!game.player.inMaze || !game.mazeInterior) {
      return;
    }

    const mi = game.mazeInterior;

    // Hit detection: player attacks vs maze objects
    this._checkObjectHits(mi);

    // Per-object flash/cooldown/reveal
    for (const obj of mi.mazeObjects) {
      if (obj.hitFlash    > 0) obj.hitFlash    -= dt;
      if (obj.hitCooldown > 0) obj.hitCooldown -= dt;
      if (!obj.destroyed) obj.revealed = this._isAdjacentToPlayer(obj);
    }

    // Countdown timer
    if (mi.timer.active) {
      mi.timer.time -= dt;
      if (mi.timer.time <= 0) this._onTimerExpired(mi);
    }

    // Ghost AI
    for (const ghost of mi.ghosts) {
      ghost.speed = ghost.phasesWalls ? GHOST_SPEED_PHASING : GHOST_SPEED_NORMAL;
      ghost.color = ghost.phasesWalls ? GHOST_COLOR_PHASING : GHOST_COLOR_NORMAL;
      this._updateGhost(ghost, dt, mi);
    }

    // Ghost contact damage (no knockback)
    this._checkGhostDamage(mi, dt);

    this.checkInteriorExit();
  }

  // ─── Object Hits ─────────────────────────────────────────────────────────

  _checkObjectHits(mi) {
    const { game } = this;
    const melee = game.combatSystem.getMeleeAttacks();
    const projs = game.combatSystem.getProjectiles();

    for (const obj of mi.mazeObjects) {
      if (obj.destroyed || obj.hitCooldown > 0) continue;

      const ox = obj.position.x + CS / 2;
      const oy = obj.position.y + CS / 2;
      let hit = false;

      for (const atk of melee) {
        const r = (atk.radius || CS) + CS * 0.6;
        if ((atk.position.x + CS / 2 - ox) ** 2 + (atk.position.y + CS / 2 - oy) ** 2 < r * r) {
          hit = true; break;
        }
      }
      if (!hit) {
        for (const proj of projs) {
          if ((proj.position.x + CS / 2 - ox) ** 2 + (proj.position.y + CS / 2 - oy) ** 2 < (CS * 1.2) ** 2) {
            hit = true; break;
          }
        }
      }

      if (hit) {
        obj.hp--;
        obj.hitFlash    = 0.12;
        obj.hitCooldown = 0.2;
        this.game.audioSystem?.playSFX('hit');
        if (obj.hp <= 0) this._destroyObject(obj, mi);
      }
    }
  }

  _destroyObject(obj, mi) {
    const { game } = this;
    obj.destroyed = true;
    mi.collisionMap[obj.row][obj.col] = false; // clear solid cell

    // Drop hidden ingredient
    if (INGREDIENTS[obj.hiddenChar]) {
      const ing = new Ingredient(obj.hiddenChar, obj.position.x, obj.position.y);
      ing.mazePlane = true;
      game.ingredients.push(ing);
      game.physicsSystem.addEntity(ing);
    }

    // Start timer on first break
    if (!mi.timer.active) {
      mi.timer.active = true;
      mi.timer.time   = TIMER_DURATION;
    }
  }

  // ─── Timer Expiry ────────────────────────────────────────────────────────

  _onTimerExpired(mi) {
    mi.spawnCount++;

    if (mi.spawnCount < 3) {
      // 1st and 2nd expiry: spawn 1 ghost from a random surviving object
      const alive = mi.mazeObjects.filter(o => !o.destroyed);
      if (alive.length > 0) {
        const src = alive[Math.floor(Math.random() * alive.length)];
        mi.ghosts.push(new MazeGhost(src.position.x, src.position.y));
        src.destroyed = true;
        mi.collisionMap[src.row][src.col] = false;
        this.game.audioSystem?.playSFX('ghost_spawn');
      }
      mi.timer.time = TIMER_DURATION; // restart
    } else {
      // 3rd expiry: doom — ALL remaining objects become ghosts, all phase through walls
      let doomSpawned = false;
      for (const obj of mi.mazeObjects) {
        if (obj.destroyed) continue;
        mi.ghosts.push(new MazeGhost(obj.position.x, obj.position.y));
        obj.destroyed = true;
        mi.collisionMap[obj.row][obj.col] = false;
        doomSpawned = true;
      }
      if (doomSpawned) this.game.audioSystem?.playSFX('ghost_spawn');
      // Activate phasing on every ghost (including the 2 spawned earlier)
      for (const ghost of mi.ghosts) {
        ghost.phasesWalls = true;
      }
      mi.timer.active = false; // no more countdowns after doom
    }
  }

  // ─── Space Interaction ───────────────────────────────────────────────────

  /**
   * SPACE near exterior maze door: enter the maze.
   * SPACE inside maze: directly damage the nearest adjacent maze object.
   * Returns true if handled (prevents default SPACE weapon-attack behavior).
   */
  handleSpacePress() {
    const { game } = this;

    // Exterior entry
    if (!game.player?.inMaze && this.nearExteriorDoor()) {
      this._enterMaze();
      return true;
    }

    if (!game.player?.inMaze || !game.mazeInterior) return false;

    const mi = game.mazeInterior;
    const px = game.player.position.x + CS / 2;
    const py = game.player.position.y + CS / 2;

    let closest = null;
    let closestDist = Infinity;

    for (const obj of mi.mazeObjects) {
      if (obj.destroyed || obj.hitCooldown > 0) continue;
      const ox = obj.position.x + CS / 2;
      const oy = obj.position.y + CS / 2;
      const dist = Math.sqrt((ox - px) ** 2 + (oy - py) ** 2);
      if (dist < CS * 1.5 && dist < closestDist) {
        closest = obj;
        closestDist = dist;
      }
    }

    if (!closest) return false;

    closest.hp--;
    closest.hitFlash = 0.12;
    closest.hitCooldown = 0.2;
    game.audioSystem?.playSFX('hit');
    if (closest.hp <= 0) this._destroyObject(closest, mi);
    return true;
  }

  // ─── Ghost AI ────────────────────────────────────────────────────────────

  _updateGhost(ghost, dt, mi) {
    const { game } = this;
    if (!game.player) return;

    const dx = game.player.position.x - ghost.position.x;
    const dy = game.player.position.y - ghost.position.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 1) return;

    if (ghost.phasesWalls) {
      // Phasing ghosts move directly through walls
      ghost.position.x += (dx / dist) * ghost.speed * dt;
      ghost.position.y += (dy / dist) * ghost.speed * dt;
      return;
    }

    // Pac-man style: commit to a target cell, only choose next direction on arrival
    if (!ghost._targetCell) {
      const gc = Math.floor(ghost.position.x / CS);
      const gr = Math.floor(ghost.position.y / CS);
      ghost._targetCell = { col: gc, row: gr };
      this._chooseGhostNextCell(ghost, mi);
    }

    const tx = ghost._targetCell.col * CS;
    const ty = ghost._targetCell.row * CS;
    const tdx = tx - ghost.position.x;
    const tdy = ty - ghost.position.y;
    const tdist = Math.sqrt(tdx * tdx + tdy * tdy);

    if (tdist < 2) {
      // Arrived at cell: snap and pick next target
      ghost.position.x = tx;
      ghost.position.y = ty;
      this._chooseGhostNextCell(ghost, mi);
    } else {
      const nx = ghost.position.x + (tdx / tdist) * ghost.speed * dt;
      const ny = ghost.position.y + (tdy / tdist) * ghost.speed * dt;
      if (!this._ghostCollides(nx, ny, mi)) {
        ghost.position.x = nx;
        ghost.position.y = ny;
      }
    }
  }

  _chooseGhostNextCell(ghost, mi) {
    const { game } = this;
    if (!game.player) return;
    const col = ghost._targetCell.col;
    const row = ghost._targetCell.row;
    const pc = Math.floor(game.player.position.x / CS);
    const pr = Math.floor(game.player.position.y / CS);
    const path = this._bfsPath(col, row, pc, pr, mi);
    if (path && path.length > 0) {
      ghost._targetCell = path[0];
    }
    // If no path (player at same cell), stay put until next arrival
  }

  _bfsPath(startCol, startRow, goalCol, goalRow, mi) {
    if (startCol === goalCol && startRow === goalRow) return [];
    const queue  = [[startCol, startRow]];
    const parent = new Map();
    parent.set(`${startRow},${startCol}`, null);

    while (queue.length > 0) {
      const [col, row] = queue.shift();
      if (col === goalCol && row === goalRow) {
        const path = [];
        let key = `${row},${col}`;
        while (parent.get(key) !== null) {
          const [r, c] = key.split(',').map(Number);
          path.unshift({ col: c, row: r });
          key = parent.get(key);
        }
        return path;
      }
      for (const [dc, dr] of [[0,-1],[0,1],[-1,0],[1,0]]) {
        const nc = col + dc, nr = row + dr;
        if (nc < 0 || nc >= PHYS || nr < 0 || nr >= PHYS) continue;
        if (mi.collisionMap[nr][nc]) continue;
        const key = `${nr},${nc}`;
        if (parent.has(key)) continue;
        parent.set(key, `${row},${col}`);
        queue.push([nc, nr]);
      }
    }
    return null; // maze fully connected via DFS — this shouldn't occur
  }

  _ghostCollides(x, y, mi) {
    const hw = CS * 0.3;
    for (const { cx, cy } of [
      { cx: x + hw,      cy: y + hw      },
      { cx: x + CS - hw, cy: y + hw      },
      { cx: x + hw,      cy: y + CS - hw },
      { cx: x + CS - hw, cy: y + CS - hw },
    ]) {
      const gc = Math.floor(cx / CS), gr = Math.floor(cy / CS);
      if (gc < 0 || gc >= PHYS || gr < 0 || gr >= PHYS) return true;
      if (mi.collisionMap[gr][gc]) return true;
    }
    return false;
  }

  // ─── Ghost Contact Damage ────────────────────────────────────────────────

  _checkGhostDamage(mi, dt) {
    const { game } = this;
    const player = game.player;
    if (!player) return;
    const px = player.position.x + CS / 2;
    const py = player.position.y + CS / 2;

    for (const ghost of mi.ghosts) {
      if (ghost.damageCooldown > 0) { ghost.damageCooldown -= dt; continue; }
      const gx = ghost.position.x + CS / 2, gy = ghost.position.y + CS / 2;
      if ((px - gx) ** 2 + (py - gy) ** 2 < (CS * 1.2) ** 2) {
        const hpBefore = player.hp;
        player.takeDamage(GHOST_DAMAGE); // no knockback args — Player.takeDamage doesn't apply knockback
        ghost.damageCooldown = GHOST_DAMAGE_INTERVAL;
        game.audioSystem?.playSFX('hit');
        if (hpBefore > 0 && player.hp <= 0) player._killedByGhost = true;
      }
    }
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  _isAdjacentToPlayer(obj) {
    const { game } = this;
    if (!game.player) return false;
    const dx = Math.abs(game.player.position.x + CS / 2 - (obj.position.x + CS / 2));
    const dy = Math.abs(game.player.position.y + CS / 2 - (obj.position.y + CS / 2));
    return dx < CS * 2.5 && dy < CS * 2.5;
  }

  _nearCell(player, cellPx, cellPy) {
    const px = player.position.x + CS / 2;
    const py = player.position.y + CS / 2;
    const cx = cellPx + CS / 2;
    const cy = cellPy + CS / 2;
    const dx = px - cx, dy = py - cy;
    return Math.sqrt(dx * dx + dy * dy) < DOOR_INTERACT_RADIUS;
  }

  _overlapsCell(player, cellPx, cellPy) {
    const px = player.position.x, py = player.position.y;
    return px < cellPx + CS && px + CS > cellPx && py < cellPy + CS && py + CS > cellPy;
  }
}
