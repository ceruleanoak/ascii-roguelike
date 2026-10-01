import { GRID, ROOM_TYPES } from '../game/GameConfig.js';
import { BackgroundObject } from '../entities/BackgroundObject.js';
import { Item } from '../entities/Item.js';
import { Ingredient } from '../entities/Ingredient.js';
import { ZONES } from '../data/zones.js';
import { generateAquiferLayout, inConfluence } from './aquiferLayout.js';
import { performCrossZoneWarp } from './CrossZoneWarp.js';
import { PLANE_SURFACE } from './PlaneSystem.js';

/**
 * AquiferSystem — the Quagmire's Whirlpool and the Aquifer Current beneath it.
 *
 * Once a Quagmire (Q) room's round combat has fully cleared, one Pond tile
 * becomes a Whirlpool. Any form that steps onto it is pulled under into the
 * Aquifer and carried by the Aquifer Current: an inflow channel to the Confluence at
 * room center, where the current splits into three branches to three room
 * edges. Each branch's center line is tinted by the Zone it delivers to, and
 * reaching its end warps the player there:
 *   yellow → the Oasis, whose exit then opens into a fresh yellow room
 *   red    → the Caldera (red Camp room)
 *   cyan   → the Frosted Maw's lake arena, exits open, the Maw asleep as a
 *            drifting shadow until a fishing cast wakes it
 *
 * A walker can only steer across the current (and choose a branch at the
 * Confluence), never swim back: whatever part of their stroke points
 * upstream, the current matches. A Frog swims nearly
 * against it — enough to push up the narrow Offshoots, whose current runs
 * back out into the channel. One Offshoot always holds ◓ Chromablade,
 * another § Sword of the Letter, any others a gem; all are taken on contact
 * (a Frog's SPACE is its tongue, not a pickup).
 *
 * The Aquifer is an Interior (kind 'aquifer'): nothing fights across it and
 * the Quagmire above, so it is a Freeze layer like a hut — the surface room
 * freezes on entry and the Aquifer's floor owns the frame through the shared
 * PiP overlay (InteriorManager.enterFloor). The layout is built lazily on
 * first entry (aquiferLayout.js) and cached on `room.aquifer`, its floor on
 * `room.aquifer.floor`. The ride is one-way: branch ends are the only way
 * out, and reaching one warps the player instantly — no exit-edge animation,
 * which belongs to surface room exits — into the destination's own body of
 * water.
 */
const CS = GRID.CELL_SIZE;

// Current speed along a channel, px/s — about 5-6 cells a second, slow enough
// to watch the channel go by. Holding back a walker doesn't rest on this
// outpacing the 180 walk cap: the upstream part of a walker's stroke is
// cancelled outright (_rideCurrent), so any speed boost or dodge roll is
// cancelled too, while full walking speed across the flow keeps steering.
const CURRENT_SPEED = 90;
// Inside the Confluence the current slackens so the player can pick a branch.
const CONFLUENCE_FACTOR = 0.6;
// A Frog feels only this fraction of the current (36 px/s) and its stroke is
// never cancelled; under its ~58 px/s average swim, that's slow headway up an
// Offshoot.
const FROG_RESIST = 0.4;
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
// In line with an Offshoot's mouth and swimming at it, the current turns to
// square the rider up with the 1-cell gap: pull per cell of lateral offset.
const MOUTH_ALIGN = 4;
// Touching Offshoot loot within this distance takes it.
const LOOT_CONTACT_RADIUS = CS;
// Offshoot mouths get a dim tint so the gap in the channel wall reads.
const OFFSHOOT_MOUTH_COLOR = '#1e4a66';
// Cave-fog reach around the rider, in cells (HutInteriorOverlay's fog pass).
const CAVE_FOG_RADIUS = 5;
// The Oasis's main lake blob (neutralRooms.js `oasis` nodes[0]); the Yellow
// branch surfaces in the water nearest it.
const OASIS_LAKE = { col: 13, row: 14 };

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
    p.velocity.vx = 0;
    p.velocity.vy = 0;
    this.game.interiorManager.enterFloor('aquifer', layout.floor, layout.floor.spawnPoint);
    if (!layout.lootSpawned) this._spawnOffshootLoot(layout);
  }

  /**
   * Offshoot loot, placed once per room at each Offshoot's tip, on the
   * Aquifer's floor (hutPlane — abandoned if the ride ends without it). Gems are pinned (`noGravitate`) so ingredient attraction can't drag them
   * out of the Offshoot past a rider in the main channel.
   */
  _spawnOffshootLoot(layout) {
    const { game } = this;
    layout.lootSpawned = true;
    layout.loot = [];
    layout.lootTouched = new Set();
    for (const offshoot of layout.offshoots) {
      const tip = offshoot.cells[offshoot.cells.length - 1];
      const x = tip.col * CS, y = tip.row * CS;
      const isGem = !(offshoot.loot === '◓' || offshoot.loot === '§');
      const entity = isGem ? new Ingredient(offshoot.loot, x, y) : new Item(offshoot.loot, x, y);
      entity.hutPlane = true;
      layout.loot.push(entity);
      if (isGem) {
        entity.noGravitate = true;
        game.ingredients.push(entity);
      } else {
        game.items.push(entity);
      }
      game.physicsSystem.addEntity(entity);
    }
  }

  /**
   * Build the Aquifer's floor: `≈` Cave River over every channel cell (branch
   * center lines tinted per instance by destination — the registry entry
   * stays blue), `}` cave wall over the rest, and a collision map that is
   * solid everywhere but the channels. Full-room sized, so the floor's PiP
   * panel covers the frozen Quagmire entirely.
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
    for (const { cells: [root] } of layout.offshoots) {
      tints.set(root.row * GRID.COLS + root.col, OFFSHOOT_MOUTH_COLOR);
    }

    const backgroundObjects = [];
    for (let r = 1; r < GRID.ROWS - 1; r++) {
      for (let c = 1; c < GRID.COLS - 1; c++) {
        if (!layout.mask[r][c]) {
          backgroundObjects.push(new BackgroundObject('}', c * CS, r * CS));
          continue;
        }
        const water = new BackgroundObject('≈', c * CS, r * CS);
        const tint = tints.get(r * GRID.COLS + c);
        if (tint) water.color = water.animationColor = tint;
        backgroundObjects.push(water);
      }
    }

    layout.floor = {
      type: 'AQUIFER',
      gridCols: GRID.COLS,
      gridRows: GRID.ROWS,
      collisionMap: layout.mask.map(row => row.map(open => !open)),
      backgroundObjects,
      enemies: [],
      npcs: [],
      items: [],
      caveFogRadius: CAVE_FOG_RADIUS,
      spawnPoint: { x: layout.whirlpool.col * CS, y: layout.whirlpool.row * CS },
      viewport: { offsetX: 0, offsetY: 0, gridCols: GRID.COLS, gridRows: GRID.ROWS, cellSize: CS },
    };
    room.aquifer = layout;
    return layout;
  }

  // ── Below: the ride ──────────────────────────────────────────────────────

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

    this._takeLootInReach(layout, px, py);

    const flow = this._flowAt(layout, px, py);
    p.aquiferCurrent = flow ? this._rideCurrent(flow, p) : null;
  }

  /**
   * The displacement the current applies to the rider this frame. A Frog
   * feels a fraction of it and swims freely; a walker feels all of it, plus
   * whatever matches the upstream part of their own velocity — so no stroke,
   * roll or speed boost ever makes headway against the flow.
   */
  _rideCurrent(flow, p) {
    if (p.polymorphed) return { x: flow.x * CURRENT_SPEED * FROG_RESIST, y: flow.y * CURRENT_SPEED * FROG_RESIST };
    let x = flow.x * CURRENT_SPEED, y = flow.y * CURRENT_SPEED;
    const fl = Math.hypot(flow.x, flow.y);
    if (fl > 0) {
      const ux = flow.x / fl, uy = flow.y / fl;
      const upstream = Math.min(0, p.velocity.vx * ux + p.velocity.vy * uy);
      x -= upstream * ux; y -= upstream * uy;
    }
    return { x, y };
  }

  /**
   * Contact pickup for Offshoot loot. An Item is offered once per touch — if
   * full quick slots open the slot-choice prompt and the player declines, it
   * isn't offered again until they've drifted off and come back.
   */
  _takeLootInReach(layout, px, py) {
    const { game } = this;
    if (!layout.loot?.length) return;
    const inReach = (e) => Math.hypot(px - (e.position.x + CS / 2), py - (e.position.y + CS / 2)) < LOOT_CONTACT_RADIUS;
    for (const entity of [...layout.loot]) {
      const near = inReach(entity);
      if (!near) { layout.lootTouched.delete(entity); continue; }
      if (layout.lootTouched.has(entity)) continue;
      layout.lootTouched.add(entity);
      const taken = entity instanceof Ingredient
        ? game.lootSystem.collectIngredient(entity)
        : (game.tryPickupItem(), entity.consumed);
      if (!taken) continue;
      layout.loot.splice(layout.loot.indexOf(entity), 1);
      // Once held, the Item belongs to no layer — drop it later and it lies
      // wherever the player is, like any other.
      entity.hutPlane = false;
    }
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
    const offshoot = layout.offshootAt[row][col];
    if (offshoot) return this._offshootFlow(layout.offshoots[offshoot.o], offshoot.k, px, py);
    const approach = layout.approachAt[row][col];
    if (approach !== null && this._swimmingInto(layout.offshoots[approach].dir)) {
      return this._mouthFlow(layout.offshoots[approach], px, py);
    }

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
   * An Offshoot's current runs straight back out toward its mouth at full
   * strength — a walker's stroke into it is cancelled, a Frog outswims it —
   * and holds the rider to the corridor's middle.
   */
  _offshootFlow(offshoot, k, px, py) {
    const cell = offshoot.cells[k];
    const { dir } = offshoot;
    // Lateral offset from the corridor's middle, across `dir`.
    const lx = dir.col === 0 ? (cell.col * CS + CS / 2 - px) / CS : 0;
    const ly = dir.row === 0 ? (cell.row * CS + CS / 2 - py) / CS : 0;
    const vx = -dir.col + lx * CENTERING, vy = -dir.row + ly * CENTERING;
    const vl = Math.hypot(vx, vy) || 1;
    return { x: vx / vl, y: vy / vl };
  }

  /** True when the player's held direction points into an Offshoot. */
  _swimmingInto(dir) {
    const { keys } = this.game;
    const ix = (keys.d ? 1 : 0) - (keys.a ? 1 : 0);
    const iy = (keys.s ? 1 : 0) - (keys.w ? 1 : 0);
    return ix * dir.col + iy * dir.row > 0;
  }

  /**
   * Swimming at an Offshoot's mouth, the channel current gives way to a pull
   * that lines the rider up with the gap — the player's hitbox is a full cell,
   * so without it the channel would sweep them past the opening every time.
   * Nothing pushes them toward the mouth: getting in is still their stroke
   * against the Offshoot's own outflow.
   */
  _mouthFlow(offshoot, px, py) {
    const [root] = offshoot.cells;
    const { dir } = offshoot;
    const lx = dir.col === 0 ? (root.col * CS + CS / 2 - px) / CS : 0;
    const ly = dir.row === 0 ? (root.row * CS + CS / 2 - py) / CS : 0;
    const pull = Math.min(1, Math.hypot(lx, ly) * MOUTH_ALIGN);
    const ll = Math.hypot(lx, ly) || 1;
    return { x: (lx / ll) * pull, y: (ly / ll) * pull };
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
   * The current delivers the player straight into the destination — an
   * instant warp, surfacing in that room's body of water.
   */
  _exitBranch(layout, path, p) {
    layout.exited = true;
    p.aquiferCurrent = null;
    // Surface into the Quagmire's frame first (thaw, drop the floor) so the
    // warp leaves from an ordinary surface room, like any other room exit.
    this.game.interiorManager.exitFloor(null);
    this._warp(path);
  }

  /**
   * Top-left of the `match`ing tile in `room` nearest cell (col,row) — where
   * the player surfaces. Null if the room has no such tile.
   */
  _surfacingPoint(room, col, row, match) {
    let best = null, bestD = Infinity;
    for (const o of room.backgroundObjects) {
      if (o.destroyed || !match(o)) continue;
      const d = Math.hypot(o.position.x - col * CS, o.position.y - row * CS);
      if (d < bestD) { bestD = d; best = o; }
    }
    return best ? { x: best.position.x, y: best.position.y } : null;
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
        this._surfaceAt(this._surfacingPoint(game.currentRoom, OASIS_LAKE.col, OASIS_LAKE.row, o => o.isWater()));
        break;
      case 'red':
        // Surfaces in the Caldera's hot spring, centered on the room.
        performCrossZoneWarp(game, {
          zone: 'red', roomType: ROOM_TYPES.CAMP, exitLetter: 'C',
          afterGenerate: (room) => this._surfacingPoint(room, GRID.COLS / 2, GRID.ROWS / 2, o => o.typeId === 'hot_water'),
        });
        break;
      case 'cyan':
        this._warpToMawLake();
        break;
    }
  }

  /**
   * The Frosted Maw's lake arena, reached by the back door: generated as the
   * zone Boss room (for its L_BOSS terrain) but entered with the exits open
   * and no Boss fight started — the Maw is a Maw Shadow (MawShadowSystem).
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
        // The Maw sleeps as a drifting shadow until a fishing cast wakes it.
        // Once it's dead the lake is just an open arena.
        if (!game.zoneSystem.defeatedBosses.has('cyan')) game.bossSystem.mawShadowSystem.seed(room);
        return this._surfacingPoint(room, GRID.COLS / 2, GRID.ROWS / 2, o => o.isWater());
      },
    });
    game.updateExitCollisions();
  }

  _surfaceAt(point) {
    if (!point) return;
    const p = this.game.player;
    p.position.x = point.x;
    p.position.y = point.y;
  }
}
