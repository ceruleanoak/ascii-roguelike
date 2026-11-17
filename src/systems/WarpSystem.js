import { GRID } from '../game/GameConfig.js';
import { isCellSealed } from './roomFeatures.js';
import { tagInteriorPlane, isInteriorActive } from './PlaneSystem.js';
import { bodyInExitLane } from './ExitSystem.js';

// Rejections that end a blink's walk rather than being stepped over: past
// the grid edge nothing further along is inside either, and a sealed
// structure is not crossed. An exit lane is narrow, so a blink along the
// wall hops over it and lands beyond.
const BLINK_STOPS_WALK = new Set(['bounds', 'sealed']);

export class WarpSystem {
  constructor(game) {
    this.game = game;
  }

  // Check whether a candidate landing spot is inside the live grid and clear
  // of the places a teleport must never put the player. Walls and solid
  // objects are not checked here — resolveBlinkTeleport skips past those —
  // so this decides only whether the walk may go on (see BLINK_STOPS_WALK).
  // `player` is the blinking body — game.player unless a Mist Battle Flank
  // mirrors the roll (MistBattleSystem).
  //
  // Returns null when the spot is a valid landing, else why it is not:
  //   'bounds' — outside the live grid's one-cell perimeter ring
  //   'sealed' — inside a sealed structure a blink must not reach
  //   'exit'   — inside a surface exit lane (the landing would leave the room)
  blinkRejection(x, y, player = this.game.player) {
    const w = player.width;
    const h = player.height;
    const C = GRID.CELL_SIZE;

    // The live grid is the interior's own inside a hut, dungeon floor or the
    // Maze (activeGridBounds), not the 30x30 surface. Its outer ring of cells
    // is the perimeter wall, so the body must sit wholly inside it. This used
    // to be a 2-cell margin off the surface edge on every side, which also
    // refused the first cell inside the wall: a mage standing against the
    // border could not blink along it, nor away from it (the first step was
    // already "out of bounds" and ended the walk).
    const { cols, rows } = this.game.activeGridBounds?.() ?? { cols: GRID.COLS, rows: GRID.ROWS };
    if (x < C || x + w > (cols - 1) * C) return 'bounds';
    if (y < C || y + h > (rows - 1) * C) return 'bounds';

    // Blinking through a wall is the point of the ability; blinking *into* a
    // sealed structure (the Maze shell) is a trap — its perimeter is solid and
    // its interior has no exit, so the player would be stuck there for the run.
    if (this._overlapsSealedRegion(x, y, w, h)) return 'sealed';

    // The exit lanes are what the old blanket margin was guarding: a landing
    // in one fires the room's exit warp. Interiors leave by stairs and doors,
    // not edge lanes. Half-width 1 also covers REST's 3-cell warp column.
    if (!isInteriorActive(this.game) && bodyInExitLane(x, y, w, h, 1)) return 'exit';

    return null;
  }

  // True when any cell the player would occupy at (x, y) is inside one of the
  // active room's sealed structure regions. A region marked `blinkPassable`
  // (a locked Vault: sealed against placement, but the blink is its way in
  // and back out) does not count.
  _overlapsSealedRegion(x, y, w, h) {
    const room = this.game.activeRoom ?? this.game.currentRoom;
    const regions = (room?.sealedRegions || []).filter(region => !region.blinkPassable);
    if (!regions.length) return false;
    const C = GRID.CELL_SIZE;
    const col0 = Math.floor(x / C), col1 = Math.floor((x + w - 1) / C);
    const row0 = Math.floor(y / C), row1 = Math.floor((y + h - 1) / C);
    for (let row = row0; row <= row1; row++) {
      for (let col = col0; col <= col1; col++) {
        if (isCellSealed({ sealedRegions: regions }, col, row)) return true;
      }
    }
    return false;
  }

  // Yellow mage blink: find the furthest valid position along the blink direction, emit trail particles, then move.
  // The path may cross walls (that's the ability), but the landing spot must be
  // clear of collisionMap walls and solid objects: landing inside one left the
  // physics eject pass to shove the mage out over the next frames, drawn in the
  // wall the whole time. A blocked far end falls back to the furthest clear
  // spot before it; no clear spot at all means the blink stays put.
  resolveBlinkTeleport({ direction, distance }, player = this.game.player) {
    const C = GRID.CELL_SIZE;
    const step = C / 4; // 4px steps for fine collision resolution

    const originX = player.position.x;
    const originY = player.position.y;
    const backgroundObjects = this.game._activeBackgroundObjects?.() ?? [];
    const room = this.game.activeRoom ?? this.game.currentRoom ?? null;

    // Walk forward until the grid edge / a sealed structure, keep the last
    // clear spot. Walls, solid objects and exit lanes are stepped over.
    let bestX = originX;
    let bestY = originY;
    for (let d = step; d <= distance; d += step) {
      const testX = originX + direction.x * d;
      const testY = originY + direction.y * d;
      const rejection = this.blinkRejection(testX, testY, player);
      if (rejection && BLINK_STOPS_WALK.has(rejection)) break;
      if (rejection) continue;
      if (this.game.physicsSystem.overlapsSolid(player, testX, testY, backgroundObjects, room)) continue;
      bestX = testX;
      bestY = testY;
    }

    // Center points for trail calculations
    const ox = originX + player.width / 2;
    const oy = originY + player.height / 2;
    const dx = (bestX + player.width / 2) - ox;
    const dy = (bestY + player.height / 2) - oy;
    const trailDist = Math.sqrt(dx * dx + dy * dy);

    // Origin burst
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      const speed = 30 + Math.random() * 25;
      this.game.particles.push(tagInteriorPlane(this.game, { x: ox, y: oy, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        life: 0.35, maxLife: 0.35, char: '*', color: player.color }));
    }

    // Path trail (static dots that fade out)
    if (trailDist > 2) {
      const steps = Math.max(2, Math.floor(trailDist / (C / 2)));
      for (let i = 1; i < steps; i++) {
        const t = i / steps;
        this.game.particles.push(tagInteriorPlane(this.game, { x: ox + dx * t, y: oy + dy * t, vx: 0, vy: 0,
          life: 0.25, maxLife: 0.25, char: '.', color: player.color }));
      }
    }

    // Destination burst
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      const speed = 25 + Math.random() * 30;
      this.game.particles.push(tagInteriorPlane(this.game, { x: ox + dx, y: oy + dy, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        life: 0.4, maxLife: 0.4, char: '*', color: player.color }));
    }

    // Apply teleport
    player.position.x = bestX;
    player.position.y = bestY;
  }
}
