import { GRID, ROOM_TYPES, NPC_INTERACTION_RANGE } from '../game/GameConfig.js';
import { BackgroundObject } from '../entities/BackgroundObject.js';
import { BridgeWorker } from '../entities/BridgeWorker.js';
import { protectRegion } from './roomFeatures.js';

export const BRIDGE_MATERIALS = [
  { key: 'stick', char: '|', need: 15 },
  { key: 'metal', char: 'M', need: 5  },
  { key: 'rock',  char: '0', need: 15 },
];

// How long each bridge row takes to appear during the build animation
const ANIM_ROW_INTERVAL = 0.35; // seconds per row (bottom → top)
const DONATION_ARC_DURATION = 0.55;
// Exported so RoomGenerator can pre-place an already-built bridge (see
// generateRidgeRoom's game.ridgeBridgeBuilt skip path) using the same
// geometry, instead of duplicating these numbers.
export const BRIDGE_COL_MIN = 14;
export const BRIDGE_COL_MAX = 16;
export const BRIDGE_ROW_MIN = 2; // topmost plank row
export const BRIDGE_ROW_MAX = 9; // bottom row (appears first)

/**
 * Pre-places a fully built bridge directly into a freshly generated room —
 * used by RoomGenerator.generateRidgeRoom() when game.ridgeBridgeBuilt is
 * already true (a bridge was completed earlier this run, so this Ridge room
 * skips the errand and hands the player an already-crossed bridge). Mirrors
 * what _placeBridgeRow()/_finishBridgeAnimation() do at runtime, but must
 * run standalone during generation: game.backgroundObjects is only aliased
 * to the current room at room-entry time, so this writes to
 * room.backgroundObjects only, never game.backgroundObjects.
 */
export function placeFinishedBridge(room, CS) {
  for (let r = BRIDGE_ROW_MIN; r <= BRIDGE_ROW_MAX; r++) {
    for (let c = BRIDGE_COL_MIN; c <= BRIDGE_COL_MAX; c++) {
      room.collisionMap[r][c] = false;
      const plank = new BackgroundObject('=', c * CS, r * CS);
      plank.color = '#8b6914';
      plank.animationColor = '#8b6914';
      plank.indestructible = true;
      plank.solid = false;
      // Ravine rows are a protectRegion() (see generateRidgeRoom) —
      // cleanupStrayBackgroundObjects() strips any non-structural object
      // inside a protected region, so these planks must opt out.
      plank.structural = true;
      room.backgroundObjects.push(plank);
    }
  }
  // Row 1 (border-adjacent) has no visible plank — see
  // _finishBridgeAnimation — but still needs collision opened so the north
  // exit cell is reachable.
  for (let c = BRIDGE_COL_MIN; c <= BRIDGE_COL_MAX; c++) {
    room.collisionMap[1][c] = false;
  }
}

/**
 * Ridge room ('R') — the entire top 9 rows are an impassable ravine.
 * A BridgeWorker NPC stands south of the cliff; donating sticks/metal/rocks
 * (or casting BRIDGE with a wish) builds planks row-by-row across cols
 * 14-16, opening a 3-cell-wide path to the north exit.
 *
 * The dark cliff visual is painted by ExploreRenderer's ravine gradient
 * (rows 0..ravineRows). Background objects in those rows are stripped so
 * trees/grass don't poke through the ravine fill.
 *
 * Combat-free by design (room.noCombat — see RoomGenerator.addEnemyToRoom):
 * the room is a construction errand, and a fight on the cliff-edge approach
 * would fight the bridge-building beat rather than support it.
 *
 * Called from RoomGenerator.generateRidgeRoom(room) — gen is the
 * RoomGenerator instance (for generateBackgroundObjects).
 */
export function generateRidgeRoomImpl(gen, room) {
  const CS = GRID.CELL_SIZE;
  const RAVINE_ROW_MAX = 9; // last row of the ravine; player ground starts at row 10

  // Standard background pass for terrain/decor on the player's side.
  gen.generateBackgroundObjects(room);

  // Protect the ravine band so the cleanup pass strips anything dropped
  // into it — the ravine gradient covers stray objects visually but they'd
  // flicker through animations and confuse pathing.
  protectRegion(room, { kind: 'rows', minRow: 1, maxRow: RAVINE_ROW_MAX });

  // Solidify the entire ravine band (excluding border columns, which are
  // already solid). _placeBridgeRow opens cols 14-16 of rows 2-9 as planks
  // are placed (or placeFinishedBridge opens them all at once, below).
  for (let r = 1; r <= RAVINE_ROW_MAX; r++) {
    for (let c = 1; c < GRID.COLS - 1; c++) {
      room.collisionMap[r][c] = true;
    }
  }

  // Tell ExploreRenderer how tall the ravine is (paints the cliff gradient).
  room.ravineRows = RAVINE_ROW_MAX;

  // Ridge is a construction errand, not a fight — no enemy source targets
  // it today, but this flag makes that a locked contract rather than an
  // absence of code: addEnemyToRoom() refuses any enemy pushed at a
  // noCombat room instead of silently accepting one from a future spawner.
  room.noCombat = true;

  // North exit always reads as "gray zone" from a Ridge room — the ridge
  // climbs into the misted high country. forceZone makes the transition
  // immediate (single exit), not the procedural 3-consecutive-color rule.
  if (room.exits?.north) {
    room.exits.north.color = '#888888';
    room.exits.north.forceZone = 'gray';
  }

  // Bridge state — donations + worker reference. main.js reads bridgeWorker
  // on room entry to register the NPC into game.neutralCharacters.
  room.bridgeDonated = { stick: 0, metal: 0, rock: 0 };
  room.bridgeBuilt = false;
  room.bridgeAnimating = false;

  // A Ridge bridge built earlier this run proves the worker's trust is
  // already earned — skip the errand entirely and hand the player an
  // already-crossed bridge instead of a second BridgeWorker.
  if (gen.game?.ridgeBridgeBuilt) {
    room.bridgeBuilt = true;
    placeFinishedBridge(room, CS);
  } else {
    // Place worker south of the cliff lip, on the bridge-approach centerline.
    const workerCol = 15;
    const workerRow = 14;
    room.bridgeWorker = new BridgeWorker(workerCol * CS, workerRow * CS);
  }

  // Spawn zones — keep the player south of the cliff regardless of which
  // direction they warped in from.
  const safeY = (RAVINE_ROW_MAX + 6) * CS; // row 15
  room.spawnZones = {
    north:   { x: 15 * CS, y: safeY }, // bridge approach
    south:   { x: 15 * CS, y: (GRID.ROWS - 3) * CS },
    east:    { x: 2 * CS,  y: safeY },
    west:    { x: (GRID.COLS - 3) * CS, y: safeY },
    default: { x: 15 * CS, y: safeY },
  };

  room.exitsLocked = false;
}

export class RidgeSystem {
  constructor(game) {
    this.game = game;
    // Matches the standard NPC talk range (BridgeWorker.getInteractionDistance
    // mirrors this) — was a wider hand-rolled 4-cell radius.
    this.CLOSE_RANGE = NPC_INTERACTION_RANGE;
    // Animation state
    this._animRoom     = null;
    this._animRow      = BRIDGE_ROW_MAX; // next row to place (counts down)
    this._animTimer    = 0;
    this._arcAnim      = null; // donation arc overlay
  }

  getDonationArc() { return this._arcAnim; }

  _startDonationArc(char) {
    const C = GRID.CELL_SIZE;
    const player = this.game.player;
    const worker = this.getWorker();
    const startX = player.position.x + C / 2;
    const startY = player.position.y + C / 2;
    const endX = worker ? worker.position.x + C / 2 : GRID.WIDTH / 2;
    const endY = worker ? worker.position.y + C / 2 : C * 3;
    this._arcAnim = { startX, startY, endX, endY, t: 0, spinPhase: 0, char };
  }

  // Called by main.js on entry into a RIDGE room. Also registers the
  // worker into game.neutralCharacters — absent entirely when RoomGenerator
  // pre-built the bridge via game.ridgeBridgeBuilt (see generateRidgeRoom).
  // The worker is no longer dismissed on bridge completion
  // (_finishBridgeAnimation repositions instead), so this is a plain
  // presence check, not a bridgeBuilt gate.
  attachToRoom(room) {
    if (!room.bridgeDonated) {
      room.bridgeDonated = { stick: 0, metal: 0, rock: 0 };
    }
    if (room.bridgeWorker) {
      this.game.neutralCharacters.push(room.bridgeWorker);
    }
  }

  canBuild() {
    const room = this.game.currentRoom;
    return !!(room?.type === 'RIDGE' && !room?.bridgeBuilt);
  }

  getWorker() {
    return this.game.currentRoom?.bridgeWorker ?? null;
  }

  getWorkerDistance() {
    const worker = this.getWorker();
    if (!worker || !this.game.player) return Infinity;
    const dx = this.game.player.position.x - worker.position.x;
    const dy = this.game.player.position.y - worker.position.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /** Returns { [materialKey]: count } over the whole ingredient pile. */
  getHaveCounts() {
    const have = {};
    for (const mat of BRIDGE_MATERIALS) {
      have[mat.key] = this.game.countIngredient(mat.char);
    }
    return have;
  }

  /** Returns { sufficient, missing } accounting for already-donated amounts. */
  _checkMaterials() {
    const room = this.game.currentRoom;
    const donated = room?.bridgeDonated ?? { stick: 0, metal: 0, rock: 0 };
    const have = this.getHaveCounts();
    const missing = [];
    for (const mat of BRIDGE_MATERIALS) {
      const stillNeeded = mat.need - (donated[mat.key] ?? 0);
      if (stillNeeded <= 0) continue;
      if (have[mat.key] < stillNeeded) missing.push(`${mat.char} x${stillNeeded - have[mat.key]}`);
    }
    return { sufficient: missing.length === 0, missing };
  }

  /**
   * Donate whatever the player currently has toward unmet requirements.
   * Materials gathered on an earlier run count the same as ones picked up this
   * run — there is one pile, so the worker sees everything the player holds.
   * Returns true if the bridge completed (animation will begin).
   */
  donateAvailable() {
    const room = this.game.currentRoom;
    if (!room || room.bridgeBuilt || room.bridgeAnimating) return false;

    const donated = room.bridgeDonated;
    let anyDonated = false;
    let firstDonatedChar = null;

    for (const mat of BRIDGE_MATERIALS) {
      let remaining = mat.need - (donated[mat.key] ?? 0);
      while (remaining > 0 && this.game.removeIngredient(mat.char)) {
        donated[mat.key]++;
        remaining--;
        if (!anyDonated) firstDonatedChar = mat.char;
        anyDonated = true;
      }
    }

    const complete = BRIDGE_MATERIALS.every(m => (donated[m.key] ?? 0) >= m.need);
    if (complete) {
      this._startBridgeAnimation(room);
      this.closeMenu();
      return true;
    }

    if (anyDonated) {
      this._startDonationArc(firstDonatedChar);
      this.game.updateUI();
    }
    return false;
  }

  /**
   * Begin the row-by-row build animation. The worker stays put (still south
   * of the ravine) and watches it form — they don't cross until it's
   * finished, see _finishBridgeAnimation.
   */
  _startBridgeAnimation(room) {
    room.bridgeAnimating = true;

    // Show spell-style response
    this.game.spellResponse = { text: 'BUILDING...', startTime: performance.now() };

    // Reset animation cursor to bottom row
    this._animRoom  = room;
    this._animRow   = BRIDGE_ROW_MAX;
    this._animTimer = 0;

    this.game.renderer.backgroundDirty = true;
    this.game.updateUI();
  }

  /** Called every frame by main.js during EXPLORE state. Drives build animation. */
  update(deltaTime) {
    if (this._arcAnim) {
      this._arcAnim.t += deltaTime;
      this._arcAnim.spinPhase += deltaTime * 12;
      if (this._arcAnim.t >= DONATION_ARC_DURATION) this._arcAnim = null;
    }

    if (!this._animRoom?.bridgeAnimating) return;

    this._animTimer += deltaTime;
    if (this._animTimer < ANIM_ROW_INTERVAL) return;
    this._animTimer -= ANIM_ROW_INTERVAL;

    this._placeBridgeRow(this._animRoom, this._animRow);
    this._animRow--;

    if (this._animRow < BRIDGE_ROW_MIN) {
      // Animation complete — finalize
      this._finishBridgeAnimation(this._animRoom);
    }
  }

  /** Place one row of planks and open that row in the collision map. */
  _placeBridgeRow(room, row) {
    const CS = GRID.CELL_SIZE;

    for (let col = BRIDGE_COL_MIN; col <= BRIDGE_COL_MAX; col++) {
      // Clear collision for this cell
      room.collisionMap[row][col] = false;

      // Skip row 1 (border) — only place visible planks for rows 2-9
      if (row >= BRIDGE_ROW_MIN) {
        const plank = new BackgroundObject('=', col * CS, row * CS);
        plank.color = '#8b6914';
        plank.animationColor = '#8b6914';
        plank.indestructible = true;
        plank.solid = false;
        room.backgroundObjects.push(plank);
        this.game.backgroundObjects.push(plank);
      }
    }

    this.game.renderer.backgroundDirty = true;
  }

  /** Called once when the last row is placed. */
  _finishBridgeAnimation(room) {
    room.bridgeAnimating = false;
    room.bridgeBuilt = true;
    this._animRoom = null;

    // Also open row 1 (the border-adjacent row) in the collision map so the
    // north exit cell is accessible from the bridge path.
    for (let col = BRIDGE_COL_MIN; col <= BRIDGE_COL_MAX; col++) {
      room.collisionMap[1][col] = false;
    }

    // The worker crosses to the far (north) end of the bridge they just
    // built — kept around rather than dismissed, so "I HAVE NO REGRETS."
    // has someone to say it. Stays registered in game.neutralCharacters;
    // never removed.
    const worker = room.bridgeWorker;
    if (worker) {
      worker.tradeComplete = true;
      worker.position.x = (BRIDGE_COL_MIN + BRIDGE_COL_MAX) / 2 * GRID.CELL_SIZE;
      worker.position.y = BRIDGE_ROW_MIN * GRID.CELL_SIZE;
    }

    // Run-scoped: once a Ridge bridge is built anywhere this run, the
    // errand is proven — future Ridge rooms hand the player an
    // already-crossed bridge instead of a second BridgeWorker.
    this.game.ridgeBridgeBuilt = true;

    this.game.renderer.backgroundDirty = true;
    this.game.spellResponse = { text: 'THE BRIDGE FORMS.', startTime: performance.now() };
    this.game.updateUI();
  }

  /** Direct build (spell path): drains all remaining needed mats at once. */
  buildBridge() {
    const room = this.game.currentRoom;
    if (!room || room.bridgeBuilt || room.bridgeAnimating) return;
    const donated = room.bridgeDonated;
    for (const mat of BRIDGE_MATERIALS) {
      let remaining = mat.need - (donated[mat.key] ?? 0);
      while (remaining > 0 && this.game.removeIngredient(mat.char)) {
        donated[mat.key]++;
        remaining--;
      }
    }
    this._startBridgeAnimation(room);
    this.closeMenu();
  }

  buildBridgeViaSpell() {
    this.buildBridge();
  }

  openMenu() {
    this.game.bridgeMenuOpen = true;
  }

  closeMenu() {
    this.game.bridgeMenuOpen = false;
  }

  // SPACE handling for the bridge donation flow, moved out of main.js's
  // handleSpacePress() to match every other system's own handleSpacePress()
  // convention (aquiferSystem, interiorManager, pressSystem, wellSystem, ...).
  handleSpacePress() {
    const room = this.game.currentRoom;
    if (room?.type === ROOM_TYPES.RIDGE && !room?.bridgeBuilt && !room?.bridgeAnimating) {
      if (this.game.bridgeMenuOpen) {
        // SPACE while menu open: donate then close
        this.donateAvailable();
        this.closeMenu();
        return true;
      }
      const worker = this.getWorker();
      if (worker && this.getWorkerDistance() < this.CLOSE_RANGE) {
        // Dialogue gates the trade: a fresh approach must be greeted first.
        // Returning false here lets the press fall through to
        // dialogueSystem.tryOpenNearby() later in main.js's handleSpacePress
        // chain, which calls worker.getDialogueLines() and flips
        // worker.readyToTrade — only then does the next SPACE open the menu.
        if (!worker.readyToTrade) return false;
        this.openMenu();
        return true;
      }
    }
    // Safety: close bridge menu if somehow still open outside RIDGE context
    if (this.game.bridgeMenuOpen) {
      this.closeMenu();
      return true;
    }
    return false;
  }

  // SHIFT closes the bridge menu without donating. Mirrors handleSpacePress()
  // above for the same reason.
  handleShiftPress() {
    if (this.game.bridgeMenuOpen) {
      this.closeMenu();
      return true;
    }
    return false;
  }
}
