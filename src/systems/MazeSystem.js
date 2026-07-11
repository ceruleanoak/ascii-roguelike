import { GRID } from '../game/GameConfig.js';
import { Ingredient } from '../entities/Ingredient.js';
import { Item } from '../entities/Item.js';
import { INGREDIENTS } from '../data/items.js';
import { coverFor } from '../data/cipher.js';
import { freezeSurfaceRoom, thawSurfaceRoom } from './PlaneSystem.js';

/**
 * MazeSystem — manages the Maze (M) room interior.
 *
 * A single continuous 19×19 cell DFS maze (9×9 logical cells with 1-cell walls).
 * At 16 px/cell this is 304×304 px, rendered as a PiP centered on the 480×480 canvas.
 *
 * Maze objects are placed at dead-end corridors (degree-1 nodes in the maze).
 * Each takes 3 hits to break, dropping the hidden ingredient beneath its cipher cover.
 *
 * Blink warning:
 *   - Nothing blinks until the first maze object is broken open — that
 *     disturbance is what summons the doom system.
 *   - One object at a time (the "candidate") blinks — a visible on/off toggle.
 *   - After 5 completed blinks unbroken, the candidate converts into a ghost.
 *   - Breaking the candidate before its 5th blink cancels the threat; a 5 s
 *     cooldown follows before a different surviving object becomes the candidate.
 *   - Once 2 ghosts have spawned this way ("doom"), every surviving object blinks
 *     simultaneously with no cooldown/candidate gating.
 *   - Clearing every object AND collecting every dropped ingredient without ever
 *     spawning a ghost grants Spectacles at the maze center.
 *
 * Ghosts (U+2689 '⚉'):
 *   - Immune to all damage; no knockback on player contact.
 *   - 1 damage per 0.75 s touch.
 *   - Pac-man style pathing toward the player; always blocked by walls.
 *
 * Maze Torches (5 per maze, distributed at non-dead-end cells):
 *   - Lit by walking near one while wielding the Torch item — permanent once lit.
 *   - A lit torch's light radius fully shields nearby tombs from ever spawning
 *     a ghost (never selected as blink candidate, immune even in doom mode).
 *   - Once all 5 are lit, every tomb's blink persists 3x as long (same
 *     flicker cadence, 3x the completed blinks required) before conversion.
 *   - Ghosts destroy any torch they touch — snuffed out for the rest of the
 *     run, losing its shielding/all-lit contribution.
 *
 * Re-entry: once the player exits the maze door is permanently sealed.
 */

// ─── Constants ───────────────────────────────────────────────────────────────

const LOGICAL_SIZE = 9;                              // 9×9 logical maze cells
const PHYS         = LOGICAL_SIZE * 2 + 1;           // 19×19 physical grid
const CS           = GRID.CELL_SIZE;                 // 16 px per cell
const MAZE_CENTER_CELL = Math.floor(LOGICAL_SIZE / 2) * 2 + 1; // logical-center room cell (phys coords)

// Proximity radius for exterior door interaction (px from door center)
const DOOR_INTERACT_RADIUS = CS * 2;

const GHOST_CHAR           = '⚉';  // U+2689
const GHOST_COLOR          = '#9988cc';
const GHOST_SPEED          = 35;   // px/s
const GHOST_DAMAGE         = 1;
const GHOST_DAMAGE_INTERVAL = 0.75; // s between damage ticks

const BLINK_INTERVAL  = 0.4; // s per on/off toggle
const BLINKS_TO_GHOST = 5;   // completed on-blinks before conversion
const BLINK_COOLDOWN  = 5.0; // s pause before the next single candidate blinks
const DOOM_THRESHOLD  = 2;   // ghosts spawned before all-remaining-blink mode

export const TORCH_COUNT           = 5;
export const TORCH_LIGHT_RADIUS    = CS * 3.5;   // "decent sized radius" of a lit torch's glow
const TORCH_INTERACT_RADIUS = CS * 1.2;   // proximity needed to ignite
const GHOST_TORCH_DESTROY_RADIUS = CS * 1.0; // ghost proximity that destroys a torch
export const TORCH_ALPHA_HIGH      = 0.3;
export const TORCH_ALPHA_LOW       = 0.1;
export const TORCH_PULSE_SPEED     = 2.0;        // rad/s
export const TORCH_LIT_COLOR       = '#ffaa33';
export const TORCH_UNLIT_COLOR     = '#664422';
const DISTURBED_BLINKS_MULT = 3;          // blink duration multiplier once all torches lit — same flicker cadence, 3x more blinks required

// Maze object cover color — actual cover glyph is derived from the hidden
// ingredient via the cipher (see coverFor). Each cover taught is a cipher
// pairing learned.
const OBJ_COLOR  = '#9977aa';

// Maze loot table — each entry has a baseWeight (at depth 0) and a depthBonus
// added per zone-depth level.  Commons stay flat so basic ingredients are always
// reliably available; uncommons grow steadily; gems start at zero and only
// appear once the player has gone deep enough to earn the risk vs. reward.
//
// Effective weight at depth d: max(0, baseWeight + d * depthBonus)
const MAZE_LOOT_TABLE = [
  // ── Common ──────────────────────────────────────────────────────────────────
  { char: 'c', baseWeight: 18, depthBonus: 0.0 }, // Coin
  { char: 'b', baseWeight: 16, depthBonus: 0.0 }, // Bone
  { char: 'd', baseWeight: 14, depthBonus: 0.0 }, // Dust
  { char: 'a', baseWeight: 14, depthBonus: 0.0 }, // Ash
  { char: 'l', baseWeight: 14, depthBonus: 0.0 }, // Leaf
  { char: 'r', baseWeight: 12, depthBonus: 0.0 }, // Root
  { char: 'h', baseWeight: 12, depthBonus: 0.0 }, // Herb
  { char: 'f', baseWeight: 10, depthBonus: 0.0 }, // Fur
  { char: 't', baseWeight: 10, depthBonus: 0.0 }, // Teeth
  { char: 'm', baseWeight: 10, depthBonus: 0.0 }, // Meat
  { char: '0', baseWeight:  8, depthBonus: 0.0 }, // Rock
  { char: 'g', baseWeight: 12, depthBonus: 0.0 }, // Goo

  // ── Uncommon ─────────────────────────────────────────────────────────────────
  { char: 'w', baseWeight:  5, depthBonus: 0.8 }, // Wing
  { char: 's', baseWeight:  5, depthBonus: 0.8 }, // Scale
  { char: 'e', baseWeight:  4, depthBonus: 0.8 }, // Eye
  { char: 'k', baseWeight:  4, depthBonus: 0.8 }, // Silk
  { char: 'o', baseWeight:  4, depthBonus: 0.8 }, // Oil
  { char: 'v', baseWeight:  4, depthBonus: 0.8 }, // Venom
  { char: 'F', baseWeight:  3, depthBonus: 1.0 }, // Fire Essence
  { char: 'M', baseWeight:  3, depthBonus: 1.0 }, // Metal
  { char: 'j', baseWeight:  3, depthBonus: 1.0 }, // Jaw
  { char: 'i', baseWeight:  3, depthBonus: 1.0 }, // Ice

  // ── Rare (gemstones) ─────────────────────────────────────────────────────────
  // Zero at depth 0 — only appear once you've gone deep enough.
  { char: '◇', baseWeight:  0, depthBonus: 1.5 }, // Topaz
  { char: '⬥', baseWeight:  0, depthBonus: 1.5 }, // Garnet
  { char: '⬦', baseWeight:  0, depthBonus: 1.5 }, // Emerald
  { char: '⧫', baseWeight:  0, depthBonus: 1.2 }, // Diamond
  { char: '◈', baseWeight:  0, depthBonus: 1.8 }, // Ruby  — "ruby is the stone of flame"
  { char: '⬨', baseWeight:  0, depthBonus: 1.5 }, // Sapphire
  { char: '⬧', baseWeight:  0, depthBonus: 1.2 }, // Onyx
];

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
    this.blinking   = false; // true while this object is the blink candidate
    this.blinkOn    = false; // current on/off toggle state
    this.blinkTimer = 0;     // s until next toggle
    this.blinkCount = 0;     // completed on-blinks (0..BLINKS_TO_GHOST)
  }
}

// ─── MazeGhost ─────────────────────────────────────────────────────────────

class MazeGhost {
  constructor(x, y) {
    this.char           = GHOST_CHAR;
    this.color          = GHOST_COLOR;
    this.position       = { x, y };
    this.speed          = GHOST_SPEED;
    this.damageCooldown = 0;
    // Immune — absorbs all weapon hits silently
    this.hp             = Infinity;
    this.takeDamage     = () => 0;
  }
}

// ─── MazeTorch ─────────────────────────────────────────────────────────────

class MazeTorch {
  constructor(col, row) {
    this.char       = '!';           // ASCII, per background-object char rule (flame-over-post)
    this.col        = col;
    this.row        = row;
    this.position   = { x: col * CS, y: row * CS };
    this.lit        = false;
    this.pulseTimer = 0;
    this.destroyed  = false;
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
    const depth = this.game.getCurrentZoneDepth?.() ?? 0;
    for (let lr = 0; lr < LOGICAL_SIZE; lr++) {
      for (let lc = 0; lc < LOGICAL_SIZE; lc++) {
        if (degrees[lr][lc] !== 1) continue; // only dead ends
        const hidden = this._weightedLootPick(depth);
        const char   = coverFor(hidden);
        mazeObjects.push(new MazeObject(char, physC(lc), physR(lr), hidden));
        // Object is solid — player must hit it, not walk through it
        collisionMap[physR(lr)][physC(lc)] = true;
      }
    }

    // Place 5 Maze Torches at non-dead-end cells, spread across the maze —
    // one per corner region plus the center, nearest available cell to each anchor.
    const torches = [];
    const torchAnchors = [
      [1, 1], [1, LOGICAL_SIZE - 2],
      [Math.floor(LOGICAL_SIZE / 2), Math.floor(LOGICAL_SIZE / 2)],
      [LOGICAL_SIZE - 2, 1], [LOGICAL_SIZE - 2, LOGICAL_SIZE - 2],
    ];
    const usedTorchCells = new Set();
    for (const [alr, alc] of torchAnchors) {
      let best = null, bestDist = Infinity;
      for (let lr = 0; lr < LOGICAL_SIZE; lr++) {
        for (let lc = 0; lc < LOGICAL_SIZE; lc++) {
          if (degrees[lr][lc] === 1) continue; // leave dead ends to the tombs
          const key = `${lr},${lc}`;
          if (usedTorchCells.has(key)) continue;
          const dist = (lr - alr) ** 2 + (lc - alc) ** 2;
          if (dist < bestDist) { bestDist = dist; best = { lr, lc, key }; }
        }
      }
      if (best) {
        usedTorchCells.add(best.key);
        torches.push(new MazeTorch(physC(best.lc), physR(best.lr)));
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
      torches,
      ghosts: [],
      spawnCount: 0,        // cumulative ghosts spawned via blink expiry
      blinkCooldown: 0,     // s before the next single candidate may blink
      disturbed: false,     // true once the first object is broken open — arms the blink system
      doomMode: false,      // spawnCount >= DOOM_THRESHOLD: all survivors blink
      spectaclesGranted: false,
      exitsSealed: false,
      exitRow: PHYS - 1, // outer south wall row (player steps here to exit)
      exitCol,
      spawnPoint,
    };
  }

  _weightedLootPick(depth) {
    let total = 0;
    for (const entry of MAZE_LOOT_TABLE) {
      total += Math.max(0, entry.baseWeight + depth * entry.depthBonus);
    }
    let roll = Math.random() * total;
    for (const entry of MAZE_LOOT_TABLE) {
      const w = Math.max(0, entry.baseWeight + depth * entry.depthBonus);
      roll -= w;
      if (roll <= 0) return entry.char;
    }
    return MAZE_LOOT_TABLE[0].char;
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
    freezeSurfaceRoom(game);
    game.renderer.backgroundDirty = true;

    // Maze music override: the mono maze track fills both dual-layer slots
    // with the bassline layer muted, mirroring the cyan/green zone pattern.
    if (game.audioSystem.mode === 'dual' || game.audioSystem.mode === 'red') {
      const base = import.meta.env.BASE_URL;
      const mazeTrack = `${base}assets/audio/maze.mp3`;
      game.audioSystem.switchMusic(mazeTrack, mazeTrack)
        .then(() => game.audioSystem.setLayer2Enabled(false));
    }
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
    game.player.hookedByMimic = null;
    thawSurfaceRoom(game);

    // Drop maze-plane loot (abandoned on exit)
    game.ingredients = game.ingredients.filter(i => !i.mazePlane);
    game.items       = game.items.filter(i => !i.mazePlane);

    game.mazeInterior = null;
    game.renderer.backgroundDirty = true;

    // Restore the zone's normal music. Forced because currentMusicZone was
    // never touched by the maze override above.
    game.audioSystem.switchZoneMusic(game.currentRoom?.zone || 'green', import.meta.env.BASE_URL, true);
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

    // Per-object flash/cooldown
    for (const obj of mi.mazeObjects) {
      if (obj.hitFlash    > 0) obj.hitFlash    -= dt;
      if (obj.hitCooldown > 0) obj.hitCooldown -= dt;
    }

    // Maze Torches: pulse while lit; ignite on proximity while wielding Torch
    for (const torch of mi.torches) {
      if (torch.destroyed) continue;
      torch.pulseTimer += dt;
      if (torch.lit) continue;
      if (game.player.heldItem?.data?.name !== 'Torch') continue;
      if (this._within(game.player.position, torch.position, TORCH_INTERACT_RADIUS)) {
        torch.lit = true;
      }
    }

    // Ghosts destroy any torch they touch — snuffs it out and removes its
    // shielding/slowdown contribution for good.
    for (const ghost of mi.ghosts) {
      for (const torch of mi.torches) {
        if (torch.destroyed) continue;
        if (this._within(ghost.position, torch.position, GHOST_TORCH_DESTROY_RADIUS)) {
          torch.destroyed = true;
          torch.lit = false;
        }
      }
    }

    // Blink candidate selection (single-candidate mode only — doom mode keeps
    // every survivor blinking continuously, set once on doom entry). Nothing
    // blinks until the first object is broken open — that disturbance is what
    // summons the doom system.
    if (mi.disturbed && !mi.doomMode) {
      if (mi.blinkCooldown > 0) {
        mi.blinkCooldown -= dt;
      } else if (!mi.mazeObjects.some(o => o.blinking)) {
        this._selectBlinkCandidate(mi);
      }
    }

    // Tick every currently-blinking object toward ghost conversion
    const activeTorches = mi.torches.filter(t => !t.destroyed);
    const allTorchesLit = activeTorches.length > 0 && activeTorches.every(t => t.lit);
    for (const obj of mi.mazeObjects) {
      if (obj.destroyed || !obj.blinking) continue;
      this._tickBlink(obj, mi, dt, allTorchesLit);
    }

    // Win condition: every object destroyed, every dropped ingredient/item
    // actually collected, and no ghost ever spawned → grant Spectacles
    this._checkMazeCleared(mi);

    // Ghost AI
    for (const ghost of mi.ghosts) {
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
    mi.disturbed = true; // breaking any tomb arms the blink/doom system
    mi.collisionMap[obj.row][obj.col] = false; // clear solid cell

    // Breaking the blink candidate defuses it — no ghost. Outside doom mode,
    // pause before a different survivor picks up the warning.
    if (obj.blinking) {
      obj.blinking = false;
      if (!mi.doomMode) mi.blinkCooldown = BLINK_COOLDOWN;
    }

    // Drop hidden ingredient
    if (INGREDIENTS[obj.hiddenChar]) {
      const ing = new Ingredient(obj.hiddenChar, obj.position.x, obj.position.y);
      ing.mazePlane = true;
      game.ingredients.push(ing);
      game.physicsSystem.addEntity(ing);
    }
  }

  // ─── Blink / Ghost Conversion ────────────────────────────────────────────

  _selectBlinkCandidate(mi) {
    const alive = mi.mazeObjects.filter(o => !o.destroyed && !this._nearLitTorch(o, mi));
    if (alive.length === 0) return;
    const obj = alive[Math.floor(Math.random() * alive.length)];
    obj.blinking   = true;
    obj.blinkOn    = false;
    obj.blinkTimer = BLINK_INTERVAL;
    obj.blinkCount = 0;
  }

  _tickBlink(obj, mi, dt, allTorchesLit) {
    // A tomb shielded by a lit torch's light is defused mid-blink — no ghost.
    if (this._nearLitTorch(obj, mi)) {
      obj.blinking  = false;
      obj.blinkOn   = false;
      obj.blinkCount = 0;
      return;
    }
    obj.blinkTimer -= dt;
    if (obj.blinkTimer > 0) return;
    obj.blinkTimer = BLINK_INTERVAL;
    obj.blinkOn = !obj.blinkOn;
    if (obj.blinkOn) {
      obj.blinkCount++;
      const blinksNeeded = allTorchesLit ? BLINKS_TO_GHOST * DISTURBED_BLINKS_MULT : BLINKS_TO_GHOST;
      if (obj.blinkCount >= blinksNeeded) this._convertToGhost(obj, mi);
    }
  }

  _convertToGhost(obj, mi) {
    obj.destroyed = true;
    obj.blinking  = false;
    mi.collisionMap[obj.row][obj.col] = false;
    mi.ghosts.push(new MazeGhost(obj.position.x, obj.position.y));
    mi.spawnCount++;
    this.game.audioSystem?.playSFX('ghost_spawn');

    if (!mi.doomMode && mi.spawnCount >= DOOM_THRESHOLD) {
      mi.doomMode = true;
      mi.blinkCooldown = 0;
      // Every surviving object now blinks simultaneously — no more cooldown gating,
      // except tombs shielded by a lit torch's light, which stay immune.
      for (const survivor of mi.mazeObjects) {
        if (survivor.destroyed || this._nearLitTorch(survivor, mi)) continue;
        survivor.blinking   = true;
        survivor.blinkOn    = false;
        survivor.blinkTimer = BLINK_INTERVAL;
        survivor.blinkCount = 0;
      }
    }
  }

  // ─── Win Condition ───────────────────────────────────────────────────────

  _checkMazeCleared(mi) {
    const { game } = this;
    if (mi.spectaclesGranted || mi.spawnCount !== 0) return;
    if (game.spectaclesObtainedThisRun) return;
    if (!mi.mazeObjects.every(o => o.destroyed)) return;
    if (game.ingredients.some(i => i.mazePlane)) return;
    if (game.items.some(i => i.mazePlane)) return;

    mi.spectaclesGranted = true;
    game.spectaclesObtainedThisRun = true;

    const x = MAZE_CENTER_CELL * CS;
    const y = MAZE_CENTER_CELL * CS;
    const glasses = new Item('⊙', x, y);
    glasses.mazePlane = true;
    game.items.push(glasses);
    game.physicsSystem.addEntity(glasses);
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
        const result = player.takeDamage(GHOST_DAMAGE);
        game.physicsSystem.applyDamageKnockback(player, result, gx, gy);
        ghost.damageCooldown = GHOST_DAMAGE_INTERVAL;
        game.audioSystem?.playSFX('hit');
        if (hpBefore > 0 && player.hp <= 0) player._killedByGhost = true;
      }
    }
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  _within(posA, posB, radius) {
    const dx = posA.x - posB.x, dy = posA.y - posB.y;
    return dx * dx + dy * dy < radius * radius;
  }

  _nearLitTorch(obj, mi) {
    return mi.torches.some(t => t.lit && this._within(obj.position, t.position, TORCH_LIGHT_RADIUS));
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
