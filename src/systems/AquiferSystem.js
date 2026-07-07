import { GRID } from '../game/GameConfig.js';
import { Ingredient } from '../entities/Ingredient.js';
import { Item } from '../entities/Item.js';
import { Enemy } from '../entities/Enemy.js';
import { BackgroundObject } from '../entities/BackgroundObject.js';
import { INGREDIENTS } from '../data/items.js';
import { EEL } from '../data/enemies.js';

// Discovery pools — one Key Item per dive at a far dead-end; the rest rare Ingredients.
const KEY_ITEMS = ['§', '⊙'];
const RARE_INGREDIENTS = ['v', 'e', 'k', '`', '1', '?', 'h', 'r'];

/**
 * AquiferSystem — the frog-only underwater dive in a Quagmire (Q) room.
 *
 * Unlike Hut/Dungeon/Maze, the Aquifer is NOT a registered InteriorManager
 * interior: it is plane-1 content laid directly onto the surface room, reusing
 * the underground (U-room) render/physics path. RoomGenerator.generateAquifer
 * carves a free-form `}` cave-wall layout (tunnelWall, solid on plane 1) and sets
 * `room.underground` (with empty entrances, so the physics auto-plane-flip stays
 * off — this system flips the plane explicitly on SPACE) for cave fog + plane-1
 * entity visibility.
 *
 * Dive: a polymorphed Frog presses SPACE on the dark Pond tile (`room.pondEntry`)
 * while on plane 0 → flip to plane 1 at the cave mouth; rare Ingredients + one Key
 * Item spawn at far dead-ends, and eels patrol fixed paths as contact hazards.
 * Surface: SPACE near the cave mouth → flip back to plane 0; uncollected
 * discoveries are abandoned and eels despawn.
 */
const CS = GRID.CELL_SIZE;
const DIVE_RADIUS = CS * 2;
// Just over the CS*1.2 entity-separation distance, so a patrolling eel held
// against the frog by contact resolution still registers a bite each frame.
const EEL_CONTACT_RADIUS = CS * 1.35;
const EEL_CONTACT_COOLDOWN = 1.0; // seconds between contact hits from one eel

export class AquiferSystem {
  constructor(game) {
    this.game = game;
  }

  // ── Entry detection ─────────────────────────────────────────────────────────

  /** True when a Frog stands on the Quagmire's dark Pond entrance on the surface. */
  _nearPondEntrance() {
    const p = this.game.player;
    if (!p || p.inAquifer || !p.polymorphed) return false; // frog-only
    if ((p._aquiferCooldown ?? 0) > 0) return false;
    const entry = this.game.currentRoom?.pondEntry;
    if (!entry || entry.destroyed) return false;
    return this._near(p, entry.position.x, entry.position.y);
  }

  // ── SPACE: dive / surface ─────────────────────────────────────────────────

  handleSpacePress() {
    const { game } = this;
    const p = game.player;
    if (!p) return false;
    if ((p._aquiferCooldown ?? 0) > 0) return false;

    if (!p.inAquifer) {
      if (this._nearPondEntrance()) { this._dive(); return true; }
      return false;
    }
    // Submerged: SPACE near the cave mouth surfaces back to the Quagmire.
    const aq = game.currentRoom?.aquifer;
    if (aq && this._near(p, aq.spawn.x, aq.spawn.y)) { this._surface(); return true; }
    return false;
  }

  // ── Generation ──────────────────────────────────────────────────────────────

  /**
   * Build the free-form, organic plane-1 Aquifer onto the Quagmire room. Reuses
   * the underground render/physics path: `}` cave walls (tunnelWall, plane-1
   * solid) + `room.underground` metadata for cave fog and plane-1 entity
   * visibility. `entrances` is left empty so the physics auto-plane-flip stays
   * off — diving/surfacing is explicit (SPACE). Idempotent: the layout is cached
   * on `room.aquifer`; this system spawns/despawns the entities per dive.
   */
  generateAquifer(room) {
    if (room.aquifer) return room.aquifer;
    const COLS = GRID.COLS, ROWS = GRID.ROWS, C = CS;
    const entry = room.pondEntry;
    if (!entry) return null;
    const entryCol = Math.round(entry.position.x / C);
    const entryRow = Math.round(entry.position.y / C);

    // Organic cave via the shared cellular-automata helper; keep a 3x3 open
    // pocket around the dive point so the frog never lands walled in.
    const isPocket = (c, r) => Math.abs(c - entryCol) <= 1 && Math.abs(r - entryRow) <= 1;
    const grid = this.game.roomGenerator._cellularCaveGrid(COLS, ROWS, isPocket, 0.46, 4);

    // Flood-fill the open region reachable from the entry; wall off the rest so
    // no discovery is ever stranded in an isolated pocket.
    const reachable = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
    const dist = Array.from({ length: ROWS }, () => Array(COLS).fill(-1));
    const queue = [{ c: entryCol, r: entryRow }];
    reachable[entryRow][entryCol] = true;
    dist[entryRow][entryCol] = 0;
    while (queue.length) {
      const { c, r } = queue.shift();
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nc = c + dc, nr = r + dr;
        if (nc < 1 || nr < 1 || nc >= COLS - 1 || nr >= ROWS - 1) continue;
        if (reachable[nr][nc] || grid[nr][nc] === 1) continue;
        reachable[nr][nc] = true;
        dist[nr][nc] = dist[r][c] + 1;
        queue.push({ c: nc, r: nr });
      }
    }

    // `}` cave walls (tunnelWall, plane 1) on every non-reachable cell.
    const passage = [];
    for (let r = 1; r < ROWS - 1; r++) {
      for (let c = 1; c < COLS - 1; c++) {
        if (reachable[r][c]) { passage.push({ col: c, row: r, d: dist[r][c] }); continue; }
        room.backgroundObjects.push(new BackgroundObject('}', c * C, r * C));
      }
    }

    // Discoveries at the farthest reachable dead-ends, spaced apart; one Key Item.
    const far = passage.filter(p => p.d >= 6).sort((a, b) => b.d - a.d);
    const sites = [];
    for (const cell of far) {
      if (sites.length >= 5) break;
      if (sites.some(s => Math.abs(s.col - cell.col) + Math.abs(s.row - cell.row) < 4)) continue;
      sites.push({ col: cell.col, row: cell.row });
    }
    const keyIdx = sites.length ? Math.floor(Math.random() * sites.length) : -1;
    const discoveries = sites.map((s, i) => ({
      col: s.col, row: s.row,
      kind: i === keyIdx ? 'keyItem' : 'ingredient',
      char: i === keyIdx
        ? KEY_ITEMS[Math.floor(Math.random() * KEY_ITEMS.length)]
        : RARE_INGREDIENTS[Math.floor(Math.random() * RARE_INGREDIENTS.length)],
    }));

    // Eel patrol paths: short cardinal runs of contiguous passage, mid-distance
    // from the entry. Each is a 2-point ping-pong loop in pixel coords.
    const eelPaths = [];
    const mid = passage.filter(p => p.d >= 4 && p.d <= 12);
    this.game.roomGenerator._shuffleArray(mid);
    for (const start of mid) {
      if (eelPaths.length >= 2) break;
      const [dc, dr] = [[1, 0], [0, 1]][Math.floor(Math.random() * 2)];
      let len = 0, c = start.col, r = start.row;
      while (len < 5 && reachable[r + dr]?.[c + dc]) { c += dc; r += dr; len++; }
      if (len < 2) continue;
      const ax = start.col * C, ay = start.row * C;
      if (eelPaths.some(p => Math.abs(p[0].x - ax) + Math.abs(p[0].y - ay) < 4 * C)) continue;
      eelPaths.push([{ x: ax, y: ay }, { x: c * C, y: r * C }]);
    }

    // Empty entrances → no physics auto-flip; caveFogRadius → cave-fog lighting.
    room.underground = { entrances: [], entranceAxis: 'all', caveFogRadius: 5, caveGrid: grid };
    room.aquifer = {
      entryCol, entryRow,
      spawn: { x: entryCol * C, y: entryRow * C },
      discoveries,
      eelPaths,
    };
    return room.aquifer;
  }

  // ── Dive / surface ──────────────────────────────────────────────────────────

  _dive() {
    const { game } = this;
    const p = game.player;
    const room = game.currentRoom;
    const aq = this.generateAquifer(room);
    if (!aq) return;

    p.aquiferExitPosition = { x: p.position.x, y: p.position.y };
    p.position.x = aq.spawn.x;
    p.position.y = aq.spawn.y;
    p.plane = 1;
    p.inAquifer = true;
    p._aquiferCooldown = 0.4; // brief gate so the dive SPACE can't instantly surface

    this._spawnDiscoveries(room, aq);
    this._spawnEels(room, aq);
    game.renderer.markBackgroundDirty();
  }

  _surface() {
    const { game } = this;
    const p = game.player;
    const room = game.currentRoom;
    if (p.aquiferExitPosition) {
      p.position.x = p.aquiferExitPosition.x;
      p.position.y = p.aquiferExitPosition.y;
    }
    p.plane = 0;
    p.inAquifer = false;
    p._aquiferCooldown = 0.5;
    if (room?.aquifer) room.aquifer._consumed = true; // discoveries are one-shot per visit
    this._despawnAquiferEntities(room);
    game.renderer.markBackgroundDirty();
  }

  // ── Spawning ────────────────────────────────────────────────────────────────

  /** Spawn plane-1 discoveries once per visit (consumed after the first surface). */
  _spawnDiscoveries(room, aq) {
    if (aq._consumed || aq._spawned) return;
    const { game } = this;
    for (const d of aq.discoveries) {
      const x = d.col * CS, y = d.row * CS;
      if (d.kind === 'keyItem') {
        const it = new Item(d.char, x, y);
        it.plane = 1;
        it._aquifer = true;
        game.items.push(it);
        game.physicsSystem.addEntity(it);
      } else if (INGREDIENTS[d.char]) {
        const ing = new Ingredient(d.char, x, y);
        ing.plane = 1;
        ing._aquifer = true;
        game.ingredients.push(ing);
        game.physicsSystem.addEntity(ing);
      }
    }
    aq._spawned = true;
  }

  /** Spawn eels along their fixed patrol paths (re-spawned each dive). */
  _spawnEels(room, aq) {
    const { game } = this;
    const depth = game.roomGenerator?.currentDepth ?? 0;
    for (const path of aq.eelPaths) {
      const start = path[0];
      const eel = new Enemy(EEL.char, start.x, start.y, depth, EEL);
      eel.plane = 1;
      eel.state = 'idle';
      eel._aquifer = true;
      eel.uncounted = true; // never gates room-clear / waves
      eel.patrolWaypoints = path.map(pt => ({ x: pt.x, y: pt.y }));
      eel._contactTimer = 0;
      eel.setCollisionMap(room.collisionMap);
      eel.setBackgroundObjects(room.backgroundObjects);
      eel.game = game;
      room.enemies.push(eel);
    }
  }

  _despawnAquiferEntities(room) {
    const { game } = this;
    for (const it of game.items) if (it._aquifer) game.physicsSystem.removeEntity(it);
    for (const ing of game.ingredients) if (ing._aquifer) game.physicsSystem.removeEntity(ing);
    game.items = game.items.filter(i => !i._aquifer);
    game.ingredients = game.ingredients.filter(i => !i._aquifer);
    if (room) room.enemies = room.enemies.filter(e => !e._aquifer);
  }

  // ── Update ────────────────────────────────────────────────────────────────

  update(dt) {
    const { game } = this;
    const p = game.player;
    if (!p) return;
    if ((p._aquiferCooldown ?? 0) > 0) p._aquiferCooldown -= dt;
    if (!p.inAquifer) return;

    // Eel contact damage: eels are pure patrol movers (PatrolMechanic), so the
    // hazard's bite is applied here, per-eel rate-limited.
    for (const e of game.currentRoom?.enemies ?? []) {
      if (!e._aquifer || e.plane !== 1) continue;
      if (e._contactTimer > 0) { e._contactTimer -= dt; continue; }
      const dx = (p.position.x + CS / 2) - (e.position.x + CS / 2);
      const dy = (p.position.y + CS / 2) - (e.position.y + CS / 2);
      if (dx * dx + dy * dy <= EEL_CONTACT_RADIUS * EEL_CONTACT_RADIUS) {
        p.takeDamage(e.damage, { isBullet: false, isMelee: true, attacker: e });
        e._contactTimer = EEL_CONTACT_COOLDOWN;
      }
    }

    // The Key Item is an Item (manual SPACE pickup), but a frog's SPACE is
    // dive/tongue — so auto-collect a plane-1 aquifer Item on contact.
    for (const it of game.items) {
      if (!it._aquifer) continue;
      const dx = p.position.x - it.position.x, dy = p.position.y - it.position.y;
      if (dx * dx + dy * dy < CS * CS) { game.tryPickupItem(); break; }
    }
  }

  _near(p, px, py) {
    const dx = p.position.x + CS / 2 - (px + CS / 2);
    const dy = p.position.y + CS / 2 - (py + CS / 2);
    return Math.sqrt(dx * dx + dy * dy) < DIVE_RADIUS;
  }
}
