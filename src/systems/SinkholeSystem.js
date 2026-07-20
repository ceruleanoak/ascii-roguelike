import { GRID, ROOM_TYPES, INTERACTION_RANGE } from '../game/GameConfig.js';
import { ZONES } from '../data/zones.js';
import { BackgroundObject } from '../entities/BackgroundObject.js';
import { cellularCaveGrid, bfsFarthestOpenPath } from './roomFeatures.js';

const CS = GRID.CELL_SIZE;
const EXIT_RADIUS = CS * 1.5;

// Grace period after a Sinkhole surfaces before SPACE can dive it — gives the
// player a beat to register the newly-revealed glyph instead of falling in
// on the same breath as the swing that cut the last concealing grass blade.
const REVEAL_COOLDOWN_MS = 1000;

/**
 * SinkholeSystem — the concealed-grass shortcut in a Grass (G) room. See
 * GLOSSARY.md "Sinkhole". Two distinct events, not one warp:
 *
 *  - Dive (SPACE on a revealed ⬤): a plane flip within the SAME G room —
 *    surface (plane 0) → that room's own plane-1 cave. Only this room's
 *    plane-0 enemies are cleared; no zone/depth state changes.
 *  - Cross (reaching the cave river's guaranteed exit while on plane 1): the
 *    actual cross-zone transition — a fresh yellow-zone U room is generated
 *    with a guaranteed lake + river trail and swapped in via the mandatory
 *    `Game.applyRoomSwap` path (bug #93 warp-divergence precedent).
 *
 * One-way only: no return trigger anywhere in this system.
 */
export class SinkholeSystem {
  constructor(game) {
    this.game = game;
  }

  // Swaps a concealed Sinkhole's grass tile for its revealed ⬤ glyph.
  reveal(sink) {
    if (!sink || sink.revealed) return;
    sink.revealed = true;
    sink.revealedAt = performance.now();

    const room = this.game.currentRoom;
    if (!room) return;

    const glyph = new BackgroundObject('⬤', sink.col, sink.row);
    glyph.sinkholeRef = sink;
    sink.glyphObj = glyph;

    const idx = room.backgroundObjects.indexOf(sink.anchor);
    if (idx !== -1) room.backgroundObjects[idx] = glyph;
    else room.backgroundObjects.push(glyph);

    this.game.renderer.markBackgroundDirty();
  }

  // Scans this room's Sinkholes directly for a revealed, not-yet-dived one
  // in range — independent of InteractionSystem's generic single-object
  // scan, so no unrelated background object (rocks, containers, signs) can
  // accidentally block it. Only uncut grass is meant to hide it, and that's
  // enforced by the caller (main.js), not here.
  findNearby() {
    const { game } = this;
    const sinkholes = game.currentRoom?.sinkholes;
    if (!sinkholes?.length) return null;
    for (const sink of sinkholes) {
      if (!this.isInteractable(sink)) continue;
      const distance = game.physicsSystem.getDistance(game.player, sink.glyphObj);
      if (distance < INTERACTION_RANGE) return sink.glyphObj;
    }
    return null;
  }

  // True once a Sinkhole has surfaced, cleared its post-reveal grace period,
  // and hasn't been dived yet. Shared by findNearby() (SPACE dispatch) and
  // ExploreRenderer (the in-range highlight) so both agree on when SPACE
  // would actually trigger a dive.
  isInteractable(sink) {
    if (!sink?.revealed || sink.dived || !sink.glyphObj) return false;
    return performance.now() - sink.revealedAt >= REVEAL_COOLDOWN_MS;
  }

  // EXPLORE SPACE dispatch: revealed Sinkholes supersede attacking, same as
  // spacebar-openable containers. Routes into the generic interact/effect
  // pipeline, which calls dive() below via the 'sinkholeDive' effect.
  handleSpacePress() {
    const glyph = this.findNearby();
    if (!glyph) return false;
    this.game.interactWithObject(glyph);
    return true;
  }

  // SPACE on a revealed Sinkhole, routed here via InteractionSystem's
  // 'sinkholeDive' effect branch.
  dive(room, sink) {
    if (!sink || !room || !sink.revealed || sink.dived) return;
    sink.dived = true;

    const { game } = this;

    // Lightweight local reset: only this room's plane-0 enemies clear. This
    // is layer 1 of the current room, not a new room — no full regeneration.
    for (let i = room.enemies.length - 1; i >= 0; i--) {
      const enemy = room.enemies[i];
      if (enemy.plane !== 0) continue;
      game.physicsSystem.removeEntity(enemy);
      room.enemies.splice(i, 1);
    }

    if (!sink.cave) sink.cave = this._generateSinkholeCave(room, sink);

    game.player.plane = 1;
    game.player.position.x = sink.cave.spawn.x;
    game.player.position.y = sink.cave.spawn.y;
    game.renderer.markBackgroundDirty();
  }

  // Carves the G room's own plane-1 cave: cellular-automata walls ('}',
  // tunnelWall, already plane-1-only) around a forced-open pocket at the
  // dive point, plus a guaranteed river ('≈') from that pocket to the
  // farthest reachable cave cell via BFS (never crosses a wall, unlike a
  // straight line through an irregular cave). Cached on sink.cave.
  _generateSinkholeCave(room, sink) {
    const COLS = GRID.COLS, ROWS = GRID.ROWS, C = CS;
    const spawnCol = Math.round(sink.col / C);
    const spawnRow = Math.round(sink.row / C);
    const isPocket = (c, r) => Math.abs(c - spawnCol) <= 1 && Math.abs(r - spawnRow) <= 1;

    const grid = cellularCaveGrid(COLS, ROWS, isPocket);

    for (let r = 1; r < ROWS - 1; r++) {
      for (let c = 1; c < COLS - 1; c++) {
        if (grid[r][c] === 1) {
          room.backgroundObjects.push(new BackgroundObject('}', c * C, r * C));
        }
      }
    }

    const { farCell, path } = bfsFarthestOpenPath(grid, spawnCol, spawnRow);
    for (const { col, row } of path) {
      room.backgroundObjects.push(new BackgroundObject('≈', col * C, row * C));
    }

    // Empty entrances → physics auto-plane-flip stays off; this system flips
    // the plane explicitly on dive/cross, matching the Aquifer's convention.
    room.underground = { entrances: [], entranceAxis: 'all', caveFogRadius: 5, caveGrid: grid };

    return {
      spawn: { x: spawnCol * C, y: spawnRow * C },
      exitCell: { x: farCell.col * C, y: farCell.row * C },
      _consumed: false
    };
  }

  // Per-frame: while on plane 1 with an un-consumed cave, check proximity to
  // its guaranteed river exit.
  update(dt) {
    const { game } = this;
    const p = game.player;
    if (!p || p.plane !== 1) return;

    const room = game.currentRoom;
    const sink = room?.sinkholes?.find(s => s.cave && !s.cave._consumed);
    if (!sink) return;

    const exit = sink.cave.exitCell;
    const dx = (p.position.x + CS / 2) - (exit.x + CS / 2);
    const dy = (p.position.y + CS / 2) - (exit.y + CS / 2);
    if (dx * dx + dy * dy <= EXIT_RADIUS * EXIT_RADIUS) {
      sink.cave._consumed = true;
      this._crossToYellow();
    }
  }

  _crossToYellow() {
    this._performCrossZoneTransition(() => this._doCrossToYellow());
  }

  // Named seam for a future TransitionSystem to pause gameplay, play a scene
  // transition, and resume around the cross-zone hand-off. Deliberately just
  // a synchronous passthrough for now — no placeholder transition is built,
  // this only marks the single place one would wrap.
  _performCrossZoneTransition(applyFn) {
    applyFn();
  }

  _doCrossToYellow() {
    const { game } = this;
    const targetZone = 'yellow';

    // Seed pathHistory with 3 yellow-colored entries so checkZoneTransition()
    // stays consistent for the player's next natural exit (mirrors
    // handleZoneTeleport).
    const targetColor = ZONES[targetZone].exitColor;
    game.zoneSystem.pathHistory = [
      { letter: 'X', color: targetColor },
      { letter: 'X', color: targetColor },
      { letter: 'X', color: targetColor }
    ];
    game.zoneSystem.currentZone = targetZone;
    if (game.zoneDepths[targetZone] === 0) game.zoneDepths[targetZone] = 1;
    game.roomGenerator.setDepth(game.zoneDepths[targetZone]);

    // One-shot flag: generateUndergroundRoom injects a guaranteed lake +
    // river trail + arrival spawn only when this flag is set, so ordinary
    // yellow U rooms reached via normal exits are unaffected.
    game.roomGenerator._forceSinkholeArrival = true;
    const playerPos = { x: game.player.position.x, y: game.player.position.y };
    const newRoom = game.roomGenerator.generateRoom(ROOM_TYPES.UNDERGROUND, playerPos, targetZone, null, 'U');
    newRoom.exitLetter = 'U';

    const spawn = newRoom._sinkholeArrivalSpawn || newRoom.spawnZones?.default || { x: 15 * CS, y: 15 * CS };
    game.currentRoom = newRoom;
    game.player.position.x = spawn.x;
    game.player.position.y = spawn.y;
    game.player.plane = 1;
    game.player.setCollisionMap(newRoom.collisionMap);

    // Canonical, mandatory room-swap path (bug #93 warp-divergence
    // precedent) — must run after the state above is set, since it doesn't
    // set currentRoom/player position/plane itself.
    game.applyRoomSwap(newRoom);

    game.audioSystem.switchZoneMusic(targetZone, import.meta.env.BASE_URL);
    game.updateUI();
  }
}
