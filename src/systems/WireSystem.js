// WireSystem — two-stage placeable wires (Sticky Tripline, etc.) anchored
// between two eligible background objects.
//
// Flow: player stands on an eligible bg object → SPACE anchors point 1 (live
// preview segment from player → point 1 already applies the wire's status).
// Player walks to a second eligible bg object → SPACE anchors point 2 and
// commits the segment to the room. One use per room.
//
// Extensibility: each wire item defines a `wireType` (e.g. 'slime'); the
// applyStatus() switch maps types to status calls. Add new types by extending
// the switch — no new system needed.

import { GRID } from '../game/GameConfig.js';

const ELIGIBLE_ANCHOR_NAMES = new Set([
  'Tree', 'Stump', 'Crystal', 'Boulder', 'Mushroom',
  'Pillar Cluster', 'Shrine', 'Barrel', 'Crate', 'Metal Box',
  'Rock', 'Glittering Rock', 'Secret Vein Rock',
  // Walls also accept anchors — wire can string between any solid wall.
  'Cave Wall', 'Hut Wall', 'Water Wall',
  'Tunnel Wall (Horizontal)', 'Tunnel Wall (Vertical)'
]);

export class WireSystem {
  constructor(game) {
    this.game = game;
    // { x, y, plane, wireChar, wireType } | null — point 1 placed, awaiting point 2.
    this.pendingAnchor = null;
    // Last layer reference seen, for detecting room/floor changes.
    this._lastLayer = null;
    // Brief countdown shown as a red X above the player after a failed SPACE
    // (no eligible anchor under them). Cleared on success or when it expires.
    this.redXTimer = 0;
  }

  // Surface room or interior floor — whichever holds the live bg-object list.
  _activeLayer() {
    const player = this.game.player;
    if (!player) return null;
    if ((player.inHut || player.inDungeon) && this.game.activeFloor) return this.game.activeFloor;
    return this.game.currentRoom || null;
  }

  _activeTriplines() {
    const layer = this._activeLayer();
    if (!layer) return null;
    if (!layer.triplines) layer.triplines = [];
    return layer.triplines;
  }

  // Returns the nearest eligible anchor within reach of the player, or null.
  // Two sources: (1) whitelisted bg-objects, (2) wall cells stamped into the room's
  // collisionMap (interior wall structures, border walls). Uses box-to-box edge gap
  // so collision-blocking anchors register even though the player can't overlap them.
  // Returns { x, y, plane, obj? } so the caller has the anchor coords directly.
  getEligibleAnchor(player) {
    if (!player) return null;
    if (player.inMaze) return null;
    const C = GRID.CELL_SIZE;
    const px = player.position.x + player.width / 2;
    const py = player.position.y + player.height / 2;
    const halfPW = player.width / 2;
    const halfPH = player.height / 2;
    const halfBg = C / 2;
    const MAX_GAP = C * 1.0;

    let nearest = null;
    let nearestGap = Infinity;

    // 1. Whitelisted bg-objects on the active layer.
    const bgs = this.game._activeBackgroundObjects?.() || [];
    for (const obj of bgs) {
      if (obj.destroyed) continue;
      if (!ELIGIBLE_ANCHOR_NAMES.has(obj.data?.name)) continue;
      const ox = obj.position.x + halfBg;
      const oy = obj.position.y + halfBg;
      const dx = Math.max(0, Math.abs(px - ox) - (halfPW + halfBg));
      const dy = Math.max(0, Math.abs(py - oy) - (halfPH + halfBg));
      const gap = Math.hypot(dx, dy);
      if (gap < MAX_GAP && gap < nearestGap) {
        nearest = { x: ox, y: oy, plane: obj.plane ?? 0, obj };
        nearestGap = gap;
      }
    }

    // 2. Collision-map walls — interior wall structures + border walls live here,
    // not as bg-objects. Scan a 3-cell ring around the player.
    const layer = this._activeLayer();
    const cmap = layer?.collisionMap;
    if (cmap) {
      const pcol = Math.floor(px / C);
      const prow = Math.floor(py / C);
      const ROWS = cmap.length;
      const COLS = cmap[0]?.length || 0;
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const r = prow + dr;
          const c = pcol + dc;
          if (r < 0 || c < 0 || r >= ROWS || c >= COLS) continue;
          if (!cmap[r][c]) continue;
          const ox = c * C + halfBg;
          const oy = r * C + halfBg;
          const dx = Math.max(0, Math.abs(px - ox) - (halfPW + halfBg));
          const dy = Math.max(0, Math.abs(py - oy) - (halfPH + halfBg));
          const gap = Math.hypot(dx, dy);
          if (gap < MAX_GAP && gap < nearestGap) {
            nearest = { x: ox, y: oy, plane: 0 };
            nearestGap = gap;
          }
        }
      }
    }

    return nearest;
  }

  // Called from handleSpacePress when a wire is held. Returns true if SPACE was consumed.
  // Wires fully claim SPACE while equipped: on-anchor SPACE places a point, off-anchor SPACE
  // is a no-op (with the red X above the player communicating the lockout). Lets the player
  // swap quick slots to interact with anything else.
  handleSpacePress() {
    const player = this.game.player;
    const held = player?.heldItem;
    if (!held?.data?.wire) return false;
    if (held.charges != null && held.charges <= 0) return true;

    const anchor = this.getEligibleAnchor(player);
    if (!anchor) {
      this.redXTimer = 0.6; // flash the red-X feedback above the player
      return true;
    }

    const cx = anchor.x;
    const cy = anchor.y;
    const plane = anchor.plane ?? 0;
    const wireChar = held.char;
    const wireType = held.data.wireType || 'slime';

    if (!this.pendingAnchor) {
      // Place point 1; preview segment goes live from player → anchor.
      this.pendingAnchor = { x: cx, y: cy, plane, wireChar, wireType };
      return true;
    }

    // Point 2: commit a permanent tripline to the layer if same anchor wasn't reused.
    if (Math.hypot(cx - this.pendingAnchor.x, cy - this.pendingAnchor.y) < GRID.CELL_SIZE * 0.5) {
      return true; // same anchor — swallow but don't commit
    }
    const triplines = this._activeTriplines();
    if (triplines) {
      triplines.push({
        x1: this.pendingAnchor.x,
        y1: this.pendingAnchor.y,
        x2: cx,
        y2: cy,
        plane,
        wireType
      });
    }
    this.pendingAnchor = null;
    // Consume one charge through the standard trap path — updates slot UI and
    // advances activeSlotIndex when depleted.
    player.markTrapUsed();
    return true;
  }

  // Distance from point (px, py) to segment (x1,y1)-(x2,y2).
  _distToSegment(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len2 = dx * dx + dy * dy;
    if (len2 === 0) return Math.hypot(px - x1, py - y1);
    let t = ((px - x1) * dx + (py - y1) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const cx = x1 + t * dx;
    const cy = y1 + t * dy;
    return Math.hypot(px - cx, py - cy);
  }

  _applyStatus(entity, wireType) {
    if (!entity || typeof entity.applyStatusEffect !== 'function') return;
    if (wireType === 'slime') {
      if (entity.getElementalModifier?.('slime') === 0) return; // slime-immune
      entity.applyStatusEffect('goo', 5.0);
    }
    // Future wire types (e.g. 'electric') wire in here.
  }

  // Test a segment against player + enemies on its plane, apply status on contact.
  // Preview segments (still being placed) skip the player — only committed
  // segments threaten the placer.
  _tickSegment(seg) {
    const game = this.game;
    const player = game.player;
    const HIT = GRID.CELL_SIZE * 0.45;
    const segPlane = seg.plane ?? 0;

    if (!seg.isPreview && player && !player.isDead && (player.plane ?? 0) === segPlane) {
      const px = player.position.x + player.width / 2;
      const py = player.position.y + player.height / 2;
      if (this._distToSegment(px, py, seg.x1, seg.y1, seg.x2, seg.y2) < HIT) {
        this._applyStatus(player, seg.wireType);
      }
    }

    const enemies = game._activeEnemies?.() || [];
    for (const enemy of enemies) {
      if ((enemy.plane ?? 0) !== segPlane) continue;
      const ex = enemy.position.x + GRID.CELL_SIZE / 2;
      const ey = enemy.position.y + GRID.CELL_SIZE / 2;
      if (this._distToSegment(ex, ey, seg.x1, seg.y1, seg.x2, seg.y2) < HIT) {
        this._applyStatus(enemy, seg.wireType);
      }
    }
  }

  // Preview segment from player → pendingAnchor (live status on enemies; player exempt).
  _previewSegment() {
    if (!this.pendingAnchor) return null;
    const player = this.game.player;
    if (!player) return null;
    const held = player.heldItem;
    if (!held?.data?.wire || held.char !== this.pendingAnchor.wireChar) return null;
    return {
      x1: player.position.x + player.width / 2,
      y1: player.position.y + player.height / 2,
      x2: this.pendingAnchor.x,
      y2: this.pendingAnchor.y,
      plane: this.pendingAnchor.plane,
      wireType: this.pendingAnchor.wireType,
      isPreview: true
    };
  }

  // Public accessor for the renderer.
  getPreviewSegment() {
    return this._previewSegment();
  }

  update(deltaTime) {
    // Tick down the red-X feedback timer.
    if (this.redXTimer > 0) this.redXTimer = Math.max(0, this.redXTimer - deltaTime);

    // Clear pendingAnchor if layer (room/floor) changed or wire was unequipped.
    const layer = this._activeLayer();
    if (this._lastLayer !== null && layer !== this._lastLayer) {
      this.pendingAnchor = null;
      this.redXTimer = 0;
    }
    this._lastLayer = layer;

    const player = this.game.player;
    if (this.pendingAnchor) {
      const held = player?.heldItem;
      if (!held?.data?.wire || held.char !== this.pendingAnchor.wireChar) {
        this.pendingAnchor = null;
      }
    }

    // Tick committed triplines on the current layer.
    const triplines = this._activeTriplines();
    if (triplines && triplines.length) {
      for (const seg of triplines) this._tickSegment(seg);
    }

    // Tick the live preview segment.
    const preview = this._previewSegment();
    if (preview) this._tickSegment(preview);
  }
}
