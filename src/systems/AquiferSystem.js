import { GRID, ROOM_TYPES } from '../game/GameConfig.js';
import { BackgroundObject } from '../entities/BackgroundObject.js';
import { ZONES } from '../data/zones.js';
import { generateAquiferLayout, inConfluence } from './aquiferLayout.js';
import { performCrossZoneWarp } from './CrossZoneWarp.js';
import { PLANE_SURFACE, PLANE_TUNNEL } from './PlaneSystem.js';

/**
 * AquiferSystem — the Quagmire's Whirlpool and the Aquifer Current beneath it.
 *
 * Once a Quagmire (Q) room's round combat has fully cleared, one Pond tile
 * becomes a Whirlpool. Any form that steps onto it is pulled down to plane 1
 * and carried by the Aquifer Current: an inflow channel to the Confluence at
 * room center, where the current splits into three branches to three room
 * edges. Each branch's center line is tinted by the Zone it delivers to, and
 * reaching its end warps the player there:
 *   yellow → the Oasis, whose exit then opens into a fresh yellow room
 *   red    → the Caldera (red Camp room)
 *   cyan   → the Frosted Maw's lake arena, exits open
 *
 * The current outpaces walking, so a walker can only steer across it (and
 * choose a branch at the Confluence), never swim back. A Frog swims nearly
 * against it.
 *
 * Like the Sinkhole cave, the Aquifer is plane-1 content laid directly onto
 * the surface room rather than a registered InteriorManager interior. The
 * layout is built lazily on first entry (aquiferLayout.js) and cached on
 * `room.aquifer`. The ride is one-way: branch ends are the only way out.
 */
const CS = GRID.CELL_SIZE;

// Current speed along a channel, px/s. Above the player's 180 walk cap, so a
// walker pushing upstream still drifts down (~60 px/s) while full walking
// speed across the flow keeps lateral steering.
const CURRENT_SPEED = 240;
// Inside the Confluence the current slackens so the player can pick a branch.
const CONFLUENCE_FACTOR = 0.6;
// A Frog feels only this fraction of the current — its stroke outpaces it.
const FROG_RESIST = 0.35;
// How strongly a rider off the center line is drawn back toward it, relative
// to the downstream push. Keeps riders off the stair-stepped channel walls.
const CENTERING = 0.6;
// A rider crossing the Confluence's middle with less offset than this is
// carried straight on, in the inflow's direction.
const CONFLUENCE_DEADZONE = CS * 0.75;
// Offsets within this angle (radians) of the inflow's side of the Confluence
// are still pulled in toward the middle rather than out to a branch.
const INFLOW_SECTOR = Math.PI * 5 / 18; // 50°

// Surface Whirlpool: the gentle suck toward it, and the reach of that suck.
const PULL_SPEED = 60;
const PULL_RADIUS = CS * 2;
// Stepping within this of the Whirlpool's center takes the player under.
const ENTRY_RADIUS = CS * 0.5;
// Reaching within this of a branch's last center-line cell ends the ride.
const BRANCH_END_RADIUS = CS * 1.5;

export class AquiferSystem {
  constructor(game) {
    this.game = game;
  }

  update(dt) {
    const p = this.game.player;
    if (!p) return;
    const room = this.game.currentRoom;
    const whirlpool = room?.whirlpool;
    if (!whirlpool) {
      if (p.aquiferCurrent) p.aquiferCurrent = null;
      return;
    }
    if (p.inAquifer) this._updateRide(room, p);
    else this._updateSurface(room, whirlpool, p);
  }

  // ── Surface: the Whirlpool ─────────────────────────────────────────────────

  _updateSurface(room, whirlpool, p) {
    p.aquiferCurrent = null;
    // The Whirlpool only opens once every round of the Quagmire is down.
    if (!whirlpool.whirlpoolActive) {
      if (!room.cleared) return;
      whirlpool.whirlpoolActive = true;
    }
    if (p.plane !== PLANE_SURFACE || this.game.animationSystem.isAnimating(p)) return;

    const dx = whirlpool.position.x - p.position.x;
    const dy = whirlpool.position.y - p.position.y;
    const d = Math.hypot(dx, dy);
    if (d < ENTRY_RADIUS && !p.dodgeRoll?.active) {
      this._enter(room, whirlpool, p);
    } else if (d < PULL_RADIUS && d > 0) {
      p.aquiferCurrent = { x: (dx / d) * PULL_SPEED, y: (dy / d) * PULL_SPEED };
    }
  }

  _enter(room, whirlpool, p) {
    const layout = room.aquifer ?? this._build(room, whirlpool);
    p.position.x = layout.whirlpool.col * CS;
    p.position.y = layout.whirlpool.row * CS;
    p.velocity.vx = 0;
    p.velocity.vy = 0;
    p.plane = PLANE_TUNNEL;
    p.inAquifer = true;
    this.game.renderer.markBackgroundDirty();
  }

  /**
   * Lay the Aquifer onto the room: `≈` Cave River over every channel cell
   * (branch center lines tinted per instance by destination — the registry
   * entry stays blue), `}` cave wall everywhere else on plane 1, and
   * `room.underground` for cave fog and the plane-1 visibility path.
   * `entrances` stays empty so the physics auto-plane-flip never fires — this
   * system owns the plane change.
   */
  _build(room, whirlpool) {
    const layout = generateAquiferLayout({
      col: Math.round(whirlpool.position.x / CS),
      row: Math.round(whirlpool.position.y / CS),
    });

    const tints = new Map();
    for (const path of layout.paths) {
      if (path.kind !== 'branch') continue;
      const tint = ZONES[path.color].exitColor;
      for (const { col, row } of path.centerline) tints.set(row * GRID.COLS + col, tint);
    }

    const added = [];
    for (let r = 1; r < GRID.ROWS - 1; r++) {
      for (let c = 1; c < GRID.COLS - 1; c++) {
        if (!layout.mask[r][c]) {
          added.push(new BackgroundObject('}', c * CS, r * CS));
          continue;
        }
        const water = new BackgroundObject('≈', c * CS, r * CS);
        const tint = tints.get(r * GRID.COLS + c);
        if (tint) water.color = water.animationColor = tint;
        added.push(water);
      }
    }
    room.backgroundObjects.push(...added);
    // After a REST round-trip the game's surface list is a copy of the room's
    // rather than the same array; keep both in step. Marked layer-guard-ok
    // because this stamps room terrain, not a combat spawn, and no interior
    // is ever live on this path — the Whirlpool is a surface tile.
    const surface = this.game.backgroundObjects;   // layer-guard-ok
    if (surface && surface !== room.backgroundObjects) surface.push(...added);

    const caveGrid = layout.mask.map(row => row.map(open => (open ? 0 : 1)));
    room.underground = { entrances: [], entranceAxis: 'all', caveFogRadius: 5, caveGrid };
    room.aquifer = layout;
    return layout;
  }

  // ── Plane 1: the ride ──────────────────────────────────────────────────────

  _updateRide(room, p) {
    const layout = room.aquifer;
    if (!layout || layout.exited) { p.aquiferCurrent = null; return; }

    const px = p.position.x + CS / 2, py = p.position.y + CS / 2;
    for (const path of layout.paths) {
      if (path.kind !== 'branch') continue;
      const end = path.centerline[path.centerline.length - 1];
      if (Math.hypot(px - (end.col * CS + CS / 2), py - (end.row * CS + CS / 2)) < BRANCH_END_RADIUS) {
        this._exitBranch(layout, path, p);
        return;
      }
    }

    const flow = this._flowAt(layout, px, py);
    const scale = CURRENT_SPEED * (p.polymorphed ? FROG_RESIST : 1);
    p.aquiferCurrent = flow ? { x: flow.x * scale, y: flow.y * scale } : null;
  }

  /**
   * Current at a pixel point, as a vector whose length is the fraction of
   * CURRENT_SPEED it carries (1 in a channel, less in the Confluence). Null
   * outside every channel.
   */
  _flowAt(layout, px, py) {
    const col = Math.floor(px / CS), row = Math.floor(py / CS);
    if (!layout.mask[row]?.[col]) return null;
    if (inConfluence(col, row)) return this._confluenceFlow(layout, px, py);

    const near = layout.near[row][col];
    if (!near) return null;
    const line = layout.paths[near.p].centerline;
    const here = line[near.k];
    // Downstream along the center line: a couple of cells ahead, or along the
    // last segment once at the line's end.
    const ahead = line[Math.min(near.k + 2, line.length - 1)];
    const behind = line[Math.max(near.k - 2, 0)];
    let fx = ahead.col - here.col, fy = ahead.row - here.row;
    if (fx === 0 && fy === 0) { fx = here.col - behind.col; fy = here.row - behind.row; }
    const fl = Math.hypot(fx, fy) || 1;

    // Draw an off-line rider back toward the center line (capped at one cell).
    let cx = (here.col * CS + CS / 2 - px) / CS, cy = (here.row * CS + CS / 2 - py) / CS;
    const cl = Math.hypot(cx, cy);
    if (cl > 1) { cx /= cl; cy /= cl; }
    const vx = fx / fl + cx * CENTERING, vy = fy / fl + cy * CENTERING;
    const vl = Math.hypot(vx, vy) || 1;
    return { x: vx / vl, y: vy / vl };
  }

  /**
   * The Confluence steers by where the rider is. On the inflow's side it pulls
   * toward the middle; anywhere else it carries them to the mouth of the
   * branch whose direction best matches their offset from center — so
   * drifting sideways while crossing the Confluence is what picks the branch.
   */
  _confluenceFlow(layout, px, py) {
    const center = (cell) => ({ x: cell.col * CS + CS / 2, y: cell.row * CS + CS / 2 });
    const c = center(layout.confluence);
    const inflowMouth = center(layout.paths[0].mouth);
    const inflowAngle = Math.atan2(inflowMouth.y - c.y, inflowMouth.x - c.x);
    const ox = px - c.x, oy = py - c.y;
    const gap = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

    let tx, ty;
    if (Math.hypot(ox, oy) < CONFLUENCE_DEADZONE) {
      // Dead center: carry straight on, away from the inflow.
      tx = -Math.cos(inflowAngle); ty = -Math.sin(inflowAngle);
    } else if (gap(Math.atan2(oy, ox), inflowAngle) < INFLOW_SECTOR) {
      tx = -ox; ty = -oy;
    } else {
      const angle = Math.atan2(oy, ox);
      let best = null, bestGap = Infinity;
      for (const path of layout.paths) {
        if (path.kind !== 'branch') continue;
        const m = center(path.mouth);
        const g = gap(angle, Math.atan2(m.y - c.y, m.x - c.x));
        if (g < bestGap) { bestGap = g; best = m; }
      }
      tx = best.x - px; ty = best.y - py;
    }
    const tl = Math.hypot(tx, ty) || 1;
    return { x: (tx / tl) * CONFLUENCE_FACTOR, y: (ty / tl) * CONFLUENCE_FACTOR };
  }

  // ── Branch ends ────────────────────────────────────────────────────────────

  /**
   * The current delivers the player out through the branch's edge. The warp
   * rides the ordinary exit animation, so the arrival reads as walking in
   * from the matching edge of the next room.
   */
  _exitBranch(layout, path, p) {
    layout.exited = true;
    p.aquiferCurrent = null;
    this.game.animateExitWarp(path.edge, () => this._warp(path));
  }

  _warp(path) {
    const { game } = this;
    switch (path.color) {
      case 'yellow':
        // The Oasis return exit would normally lead back to the Quagmire. The
        // Aquifer is one-way, so the saved room is flagged to be dropped for a
        // fresh yellow room instead (NeutralRoomSystem.returnToSavedRoom).
        game.transitionToNeutralRoom('oasis', path.edge);
        if (game.savedExploreState) game.savedExploreState.returnTo = { zone: 'yellow' };
        break;
      case 'red':
        performCrossZoneWarp(game, { zone: 'red', roomType: ROOM_TYPES.CAMP, exitLetter: 'C' });
        break;
      case 'cyan':
        this._warpToMawLake();
        break;
    }
  }

  /**
   * The Frosted Maw's lake arena, reached by the back door: generated as the
   * zone Boss room (for its L_BOSS terrain) but entered with the exits open
   * and no Boss fight started.
   */
  _warpToMawLake() {
    const { game } = this;
    const gen = game.roomGenerator;
    performCrossZoneWarp(game, {
      zone: 'cyan',
      roomType: ROOM_TYPES.BOSS,
      exitLetter: null,
      beforeGenerate: () => { gen.isZoneBossRoom = true; },
      afterGenerate: (room) => {
        gen.isZoneBossRoom = false;
        room.isZoneBossRoom = false;
        room.isMiniboss = false;
        room.exitsLocked = false;
        room.cleared = true;
      },
    });
    game.updateExitCollisions();
  }
}
