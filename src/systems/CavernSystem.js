import { GRID } from '../game/GameConfig.js';
import { BackgroundObject } from '../entities/BackgroundObject.js';
import { FriendlyGoblin } from '../entities/FriendlyGoblin.js';
import { isInteriorActive } from './PlaneSystem.js';

/**
 * CavernSystem — owns the Cavern: the small secret interior hidden behind a
 * Bombable Rock in a conspicuous cluster of Cavern Rocks (seeded on the
 * surface by roomFeatures.seedCavern).
 *
 * A Cavern rides the hut interior system rather than being a fourth interior
 * controller: once revealed, `room.cavern` is a hut record (`hutKind:
 * 'cavern'`) that HutSystem enters, exits and caches exactly like any other
 * hut. This system supplies the pieces that are Cavern-specific:
 *
 *   - bombBlast()             — a bomb explosion breaks Bombable Rocks and
 *                               reveals the Cavern's door where one stood.
 *                               Also the sole destroyer of Puzzle Room
 *                               Bombable Walls (any `data.bombable` object on
 *                               the active layer), opening their cell —
 *                               and opens a bombable V room Vault wall.
 *   - generateCavernInterior() — the cave floor HutSystem._enterHut builds.
 *   - updateInterior()        — torch glow bookkeeping while inside.
 *   - dropTorchLoot()         — what a broken Cavern Torch drops.
 *
 * Holds no state of its own — everything lives on the room's cavern record
 * and the cached floor, so room regeneration resets it for free.
 */

const CS = GRID.CELL_SIZE;

// Cavern floor: hut-sized (isHutFloor keys on gridCols <= 12).
const CAVERN_COLS = 10;
const CAVERN_ROWS = 10;

// Inner rock cells that break the square room into a rough cave outline —
// the four corners are knocked in so the walls read as rock, not masonry.
const CAVERN_INNER_ROCK_CELLS = [
  { col: 1, row: 1 }, { col: 2, row: 1 }, { col: 1, row: 2 },
  { col: 8, row: 1 }, { col: 7, row: 1 }, { col: 8, row: 2 },
  { col: 1, row: 8 }, { col: 2, row: 8 }, { col: 1, row: 7 },
  { col: 8, row: 8 }, { col: 7, row: 8 }, { col: 8, row: 7 },
];

// The two lit torches flank the back wall, with the goblin between them.
const CAVERN_TORCH_CELLS = [{ col: 3, row: 1 }, { col: 6, row: 1 }];

// Goblin sits centered between the torches, well over the 2-cell exit-door
// radius so SPACE near him opens dialogue rather than leaving the Cavern
// (the exit check runs before dialogue in main.js's SPACE order).
const GOBLIN_POSITION = { x: 4.5 * CS, y: 2 * CS };

// Chance a broken Cavern Torch also drops Slick Oil alongside its Stick.
const TORCH_OIL_CHANCE = 0.15;

const STICK_CHAR = '|';
const SLICK_OIL_CHAR = '🜁';

export class CavernSystem {
  constructor(game) {
    this.game = game;
  }

  // ─── Bomb reveal ──────────────────────────────────────────────────────────

  /**
   * A bomb exploded at (x, y) with the given blast radius. Breaks every
   * Bombable Rock in range on the player's current layer; a broken rock that
   * was hiding a Cavern leaves the Cavern's door in its cell.
   *
   * Called from the two bomb explosion paths only (Bomb windup in
   * ConsumableWindupEffects, Remote Bomb in TrapSystem) — nothing else in the
   * game can open a Bombable Rock. Also opens a bombable Vault wall
   * (InteractionSystem.tryBombVaultWall).
   */
  bombBlast(x, y, radius) {
    const { game } = this;
    // A V room's Vault wall (every zone but yellow) is a surface structure —
    // an interior blast can't reach it.
    if (!isInteriorActive(game)) game.interactionSystem?.tryBombVaultWall(x, y, radius);
    const backgroundObjects = game._activeBackgroundObjects();
    if (!backgroundObjects?.length) return;

    // Snapshot the rocks first: revealing a door appends to the same list.
    const rocks = backgroundObjects.filter(obj =>
      obj.data?.bombable && !obj.destroyed && !obj.destroyAfterAnimation &&
      this._withinBlast(obj, x, y, radius));

    for (const rock of rocks) {
      rock.destroyAfterAnimation = true;
      rock._playAnimation('crack');
      this._openCollisionCell(rock);
      this._revealCavernAt(rock, backgroundObjects);
    }
    if (rocks.length) game.renderer.markBackgroundDirty();
  }

  // A Puzzle Room's Bombable Wall stands in a cell its template stamped solid
  // (dungeonPuzzleTemplates.js 'B'); breaking it opens that cell. Any broken
  // bombable leaves its cell walkable, so this is correct for a Cavern rock too.
  _openCollisionCell(rock) {
    const { collisionMap } = this.game.activeGridBounds();
    const col = Math.round(rock.position.x / CS);
    const row = Math.round(rock.position.y / CS);
    if (collisionMap?.[row]?.[col]) collisionMap[row][col] = false;
  }

  _withinBlast(obj, x, y, radius) {
    // Measure to the rock's cell center; a blast that reaches any part of the
    // cell counts, so the reach is widened by half a cell.
    const dx = (obj.position.x + CS / 2) - x;
    const dy = (obj.position.y + CS / 2) - y;
    const reach = radius + CS / 2;
    return dx * dx + dy * dy <= reach * reach;
  }

  _revealCavernAt(rock, backgroundObjects) {
    const { game } = this;
    const cavern = game.currentRoom?.cavern;
    if (!cavern || cavern.revealed) return;
    // Only a surface rock can be the Cavern's door — a Bombable Wall broken on
    // an interior floor may share the door's cell coordinates by chance.
    if (isInteriorActive(game)) return;
    const col = Math.round(rock.position.x / CS);
    const row = Math.round(rock.position.y / CS);
    if (cavern.doorPosition.col !== col || cavern.doorPosition.row !== row) return;

    const door = new BackgroundObject('∩', col * CS, row * CS);
    door.structural = true;
    backgroundObjects.push(door);
    cavern.revealed = true;
    game.audioSystem?.playSFX('cavern_reveal');
  }

  // ─── Interior ─────────────────────────────────────────────────────────────

  /**
   * Builds a Cavern floor in the same shape HutSystem.generateHutInterior
   * returns, so HutSystem, InteriorManager and HutInteriorOverlay treat it as
   * an ordinary hut floor. Contents are fixed: two lit Cavern Torches, one
   * friendly goblin, no enemies.
   */
  generateCavernInterior() {
    const cols = CAVERN_COLS;
    const rows = CAVERN_ROWS;

    const collisionMap = [];
    for (let r = 0; r < rows; r++) {
      collisionMap[r] = [];
      for (let c = 0; c < cols; c++) {
        collisionMap[r][c] = (r === 0 || r === rows - 1 || c === 0 || c === cols - 1);
      }
    }
    for (const { col, row } of CAVERN_INNER_ROCK_CELLS) collisionMap[row][col] = true;

    const backgroundObjects = [];
    const torches = [];
    for (const { col, row } of CAVERN_TORCH_CELLS) {
      const torch = new BackgroundObject('!', col * CS, row * CS, { typeId: 'cavern_torch' });
      backgroundObjects.push(torch);
      // Glow fixture read by HutInteriorOverlay's torch pass; the glyph itself
      // is the background object above (see drawTorchFixture).
      torches.push({ col, row, char: '!', lit: true, pulseTimer: Math.random() * Math.PI * 2, backgroundObject: torch });
    }

    // Exit door at south-center, solid like every hut's (SPACE-only exit).
    const exitCol = Math.floor(cols / 2);
    const exitRow = rows - 1;
    backgroundObjects.push(new BackgroundObject('∩', exitCol * CS, exitRow * CS));

    const npcs = [new FriendlyGoblin(GOBLIN_POSITION.x, GOBLIN_POSITION.y)];

    const interiorPxW = cols * CS;
    const interiorPxH = rows * CS;
    return {
      type: 'HUT_INTERIOR',
      gridCols: cols,
      gridRows: rows,
      collisionMap,
      backgroundObjects,
      enemies: [],
      npcs,
      items: [],
      torches,
      doors: [{ col: exitCol, row: exitRow, leadsTo: null }],
      hutKind: 'cavern',
      spawnPoint: { x: exitCol * CS, y: (exitRow - 2) * CS },
      exitCol,
      exitRow,
      viewport: {
        offsetX: Math.floor((GRID.WIDTH - interiorPxW) / 2),
        offsetY: Math.floor((GRID.HEIGHT - interiorPxH) / 2),
        gridCols: cols,
        gridRows: rows,
        cellSize: CS,
      },
      wizardCirclePosition: null,
    };
  }

  /**
   * Per-frame Cavern bookkeeping while the player is inside (HutSystem.update
   * dispatches here for `hutKind === 'cavern'`). Pulses the torch glow and
   * drops the glow of any torch that has been broken.
   */
  updateInterior(dt) {
    const floor = this.game.activeFloor;
    if (!floor?.torches) return;
    floor.torches = floor.torches.filter(torch => {
      const obj = torch.backgroundObject;
      return !(obj.destroyed || obj.destroyAfterAnimation);
    });
    for (const torch of floor.torches) torch.pulseTimer += dt;
  }

  /** Drop for a broken Cavern Torch: always a Stick, rarely Slick Oil too. */
  dropTorchLoot(obj) {
    const loot = this.game.lootSystem;
    loot.spawnIngredientDrop(STICK_CHAR, obj.position.x, obj.position.y, null, obj);
    if (Math.random() < TORCH_OIL_CHANCE) {
      loot.spawnItemDrop(SLICK_OIL_CHAR, obj.position.x, obj.position.y, null, obj);
    }
  }
}
