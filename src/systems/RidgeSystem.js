import { GRID } from '../game/GameConfig.js';
import { BackgroundObject } from '../entities/BackgroundObject.js';

export const BRIDGE_MATERIALS = [
  { key: 'stick', char: '|', need: 20 },
  { key: 'metal', char: 'M', need: 5  },
  { key: 'rock',  char: '0', need: 5  },
];

// How long each bridge row takes to appear during the build animation
const ANIM_ROW_INTERVAL = 0.35; // seconds per row (bottom → top)
const DONATION_ARC_DURATION = 0.55;
const BRIDGE_COL_MIN = 14;
const BRIDGE_COL_MAX = 16;
const BRIDGE_ROW_MIN = 2; // topmost plank row
const BRIDGE_ROW_MAX = 9; // bottom row (appears first)

export class RidgeSystem {
  constructor(game) {
    this.game = game;
    this.CLOSE_RANGE = GRID.CELL_SIZE * 4;
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

  attachToRoom(room) {
    if (!room.bridgeDonated) {
      room.bridgeDonated = { stick: 0, metal: 0, rock: 0 };
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

  /** Returns { sufficient, missing } accounting for already-donated amounts. */
  _checkMaterials() {
    const room = this.game.currentRoom;
    const donated = room?.bridgeDonated ?? { stick: 0, metal: 0, rock: 0 };
    const inv = this.game.player?.inventory ?? [];
    const missing = [];
    for (const mat of BRIDGE_MATERIALS) {
      const stillNeeded = mat.need - (donated[mat.key] ?? 0);
      if (stillNeeded <= 0) continue;
      const have = inv.filter(i => i === mat.char).length;
      if (have < stillNeeded) missing.push(`${mat.char} x${stillNeeded - have}`);
    }
    return { sufficient: missing.length === 0, missing };
  }

  /**
   * Donate whatever the player currently has toward unmet requirements.
   * Returns true if the bridge completed (animation will begin).
   */
  donateAvailable() {
    const room = this.game.currentRoom;
    if (!room || room.bridgeBuilt || room.bridgeAnimating) return false;

    const inv = this.game.player.inventory;
    const donated = room.bridgeDonated;
    let anyDonated = false;
    let firstDonatedChar = null;

    for (const mat of BRIDGE_MATERIALS) {
      const stillNeeded = mat.need - (donated[mat.key] ?? 0);
      if (stillNeeded <= 0) continue;
      let remaining = stillNeeded;
      for (let i = inv.length - 1; i >= 0 && remaining > 0; i--) {
        if (inv[i] === mat.char) {
          inv.splice(i, 1);
          donated[mat.key]++;
          remaining--;
          if (!anyDonated) firstDonatedChar = mat.char;
          anyDonated = true;
        }
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

  /** Begin the row-by-row build animation. Dismisses the worker immediately. */
  _startBridgeAnimation(room) {
    room.bridgeAnimating = true;

    // Dismiss worker immediately so they don't stand on a forming bridge
    room.bridgeWorker = null;
    for (let i = this.game.neutralCharacters.length - 1; i >= 0; i--) {
      if (this.game.neutralCharacters[i]?.constructor?.name === 'BridgeWorker') {
        this.game.neutralCharacters.splice(i, 1);
        break;
      }
    }

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

    this.game.renderer.backgroundDirty = true;
    this.game.spellResponse = { text: 'THE BRIDGE FORMS.', startTime: performance.now() };
    this.game.updateUI();
  }

  /** Direct build (spell path): drains all remaining needed mats at once. */
  buildBridge() {
    const room = this.game.currentRoom;
    if (!room || room.bridgeBuilt || room.bridgeAnimating) return;
    const inv = this.game.player.inventory;
    const donated = room.bridgeDonated;
    for (const mat of BRIDGE_MATERIALS) {
      let remaining = mat.need - (donated[mat.key] ?? 0);
      for (let i = inv.length - 1; i >= 0 && remaining > 0; i--) {
        if (inv[i] === mat.char) { inv.splice(i, 1); donated[mat.key]++; remaining--; }
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
}
