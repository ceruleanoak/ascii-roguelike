// WireSystem — two-stage placeable wires (Sticky Tripline, Electric Tripline)
// anchored between two points in the room.
//
// Flow: SPACE anchors one end, SPACE anchors the other and commits the segment
// to the room (one use per room). Each end is placed one of two ways:
//   - standing next to an eligible anchor (bg object or wall) → the end bites
//     onto that anchor directly.
//   - standing nowhere near one → SPACE charges a throw instead (TrapSystem's
//     'wire' throw), and the end sticks wherever it comes to rest. Either end
//     can be thrown, so a wire can be strung entirely at range.
// Between the two placements the player carries the loose end: the live preview
// segment runs from the anchored end to the player (or to the end in mid-air)
// and already applies the wire's status to enemies.
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
    // Brief countdown shown as a red X above the player after a SPACE that could
    // neither anchor nor throw (mazes). Cleared on success or when it expires.
    this.redXTimer = 0;
    // The thrown end while it is still in the air — the TrapSystem inFlightTraps
    // entry itself, so the preview segment can track it and a landing from a
    // room the player has already left can be recognized as stale.
    this.flyingEnd = null;
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
  // Wires fully claim SPACE while equipped: next to an anchor SPACE bites the end onto it,
  // away from one SPACE charges a throw of that end instead. Lets the player swap quick
  // slots to interact with anything else.
  handleSpacePress() {
    const player = this.game.player;
    const held = player?.heldItem;
    if (!held?.data?.wire) return false;
    if (held.charges != null && held.charges <= 0) return true;
    if (this.flyingEnd) return true; // an end is already in the air — wait for it to land

    const anchor = this.getEligibleAnchor(player);
    if (anchor) {
      this._attachEnd(anchor.x, anchor.y, anchor.plane ?? 0, held);
      return true;
    }

    // Nothing in reach: throw this end instead. TrapSystem charges the arc off
    // held SPACE and calls attachThrownEnd() when it comes to rest. Mazes are the
    // one place a wire can't be placed at all (see getEligibleAnchor), so the red
    // X keeps its old meaning there rather than launching an unanchorable end.
    if (player?.inMaze) {
      this.redXTimer = 0.6;
      return true;
    }
    this.game.trapSystem.startTrapCharge('deploy');
    return true;
  }

  // Anchor one end of the wire at (x, y). The first call arms the pending anchor
  // (the player walks off carrying the loose end); the second commits the finished
  // segment to the layer. Shared by both placement routes — standing next to an
  // anchor and landing a thrown end — so they can't drift apart.
  _attachEnd(x, y, plane, held) {
    const wireChar = held.char;
    const wireType = held.data.wireType || 'slime';

    if (!this.pendingAnchor) {
      // Place point 1; preview segment goes live from player → anchor.
      this.pendingAnchor = { x, y, plane, wireChar, wireType };
      return;
    }

    // Point 2: commit a permanent tripline to the layer if the same point wasn't reused.
    if (Math.hypot(x - this.pendingAnchor.x, y - this.pendingAnchor.y) < GRID.CELL_SIZE * 0.5) {
      return; // same spot — swallow but don't commit a zero-length wire
    }
    const triplines = this._activeTriplines();
    if (triplines) {
      triplines.push({
        x1: this.pendingAnchor.x,
        y1: this.pendingAnchor.y,
        x2: x,
        y2: y,
        plane,
        wireType
      });
    }
    this.pendingAnchor = null;
    // Consume one charge through the standard trap path — updates slot UI and
    // advances activeSlotIndex when depleted.
    this.game.trapSystem.markTrapUsed();
  }

  // TrapSystem hands the in-flight entry over the moment the throw fires.
  onWireThrown(entry) {
    this.flyingEnd = entry;
  }

  // The thrown end came to rest — anchor it there. TrapSystem stops the flight on
  // walls and solid objects, so a throw into a wall sticks against it and an
  // unobstructed throw sticks where it lands.
  attachThrownEnd(entry) {
    if (entry !== this.flyingEnd) return; // stale — the player left the room mid-flight
    this.flyingEnd = null;
    const held = this.game.player?.heldItem;
    // The player swapped the wire away mid-flight: the end has nothing to connect
    // back to, so it simply doesn't land.
    if (!held?.data?.wire || held.char !== entry.char) return;
    this._attachEnd(entry.x, entry.y, entry.plane ?? 0, held);
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
    if (wireType === 'electric') {
      // Route through the canonical electric-contact path rather than applying
      // 'zap' here: shockEntity() carries the electric-affinity auto-immunity,
      // the Stingray Mantle exemption, and the same iframe-gated contact damage
      // electrified water uses. Electric-affinity enemies walk it for free.
      this.game.electricitySystem?.shockEntity(entity);
      return;
    }
    if (!entity || typeof entity.applyStatusEffect !== 'function') return;
    if (wireType === 'slime') {
      if (entity.data?.affinities?.includes('goo')) return; // goo-affinity immune
      entity.applyStatusEffect('goo', 5.0);
    }
  }

  // Test a segment against player + enemies on its plane, apply status on contact.
  // Preview segments (still being placed) skip the player — only committed
  // segments threaten the placer.
  _tickSegment(seg) {
    const game = this.game;
    const player = game.player;
    const HIT = GRID.CELL_SIZE * 0.45;
    const segPlane = seg.plane ?? 0;

    // A dodge roll clears the wire: the roll is the answer to a strung room, the
    // same way its iframes answer a telegraphed hit.
    const playerExempt = !player || player.isDead || player.dodgeRoll?.active;

    if (!seg.isPreview && !playerExempt && (player.plane ?? 0) === segPlane) {
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

  // The half-placed wire, drawn and ticked live (status on enemies; player exempt).
  // Its far end is whichever end isn't settled yet — an end in mid-air while a throw
  // is running, otherwise the loose end in the player's hand. `anchoredN` tells the
  // renderer which ends have actually bitten and so earn an origin bead.
  _previewSegment() {
    const player = this.game.player;
    if (!player) return null;
    const held = player.heldItem;
    if (!held?.data?.wire) return null;
    const flying = this.flyingEnd;
    if (!this.pendingAnchor && !flying) return null;
    if (this.pendingAnchor && held.char !== this.pendingAnchor.wireChar) return null;

    // With an anchor already placed AND an end in the air, the player is out of the
    // picture entirely — the wire runs anchor → airborne end. Otherwise one end is
    // still in hand.
    const fromAnchor = !!(this.pendingAnchor && flying);
    const near = fromAnchor
      ? { x: this.pendingAnchor.x, y: this.pendingAnchor.y, anchored: true }
      : {
        x: player.position.x + player.width / 2,
        y: player.position.y + player.height / 2,
        anchored: false
      };
    const far = flying
      ? { x: flying.x, y: flying.y, anchored: false }
      : { x: this.pendingAnchor.x, y: this.pendingAnchor.y, anchored: true };

    return {
      x1: near.x,
      y1: near.y,
      x2: far.x,
      y2: far.y,
      plane: this.pendingAnchor?.plane ?? (player.plane ?? 0),
      wireType: this.pendingAnchor?.wireType ?? (held.data.wireType || 'slime'),
      isPreview: true,
      anchored1: near.anchored,
      anchored2: far.anchored
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
    // Dropping flyingEnd here is what marks a still-airborne end as stale, so it
    // can't anchor itself into whatever room the player walked into.
    const layer = this._activeLayer();
    if (this._lastLayer !== null && layer !== this._lastLayer) {
      this.pendingAnchor = null;
      this.flyingEnd = null;
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
