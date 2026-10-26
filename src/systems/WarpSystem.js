import { GRID } from '../game/GameConfig.js';
import { isCellSealed } from './roomFeatures.js';
import { tagInteriorPlane } from './PlaneSystem.js';

export class WarpSystem {
  constructor(game) {
    this.game = game;
  }

  // Check if a candidate position is within bounds and outside the perimeter safety margin
  // (allows warping through any background object walls inside the perimeter)
  // `player` is the blinking body — game.player unless a Mist Battle Flank
  // mirrors the roll (MistBattleSystem).
  isValidBlinkPosition(x, y, player = this.game.player) {
    const w = player.width;
    const h = player.height;
    const C = GRID.CELL_SIZE;

    // 2-cell safety margin from all edges — blocks perimeter walls, exit gaps, and exit trigger zones
    const margin = C * 2;
    if (x < margin || x + w > GRID.WIDTH - margin) return false;
    if (y < margin || y + h > GRID.HEIGHT - margin) return false;

    // Blinking through a wall is the point of the ability; blinking *into* a
    // sealed structure (the Maze shell) is a trap — its perimeter is solid and
    // its interior has no exit, so the player would be stuck there for the run.
    if (this._overlapsSealedRegion(x, y, w, h)) return false;

    return true;
  }

  // True when any cell the player would occupy at (x, y) is inside one of the
  // active room's sealed structure regions.
  _overlapsSealedRegion(x, y, w, h) {
    const room = this.game.currentRoom;
    if (!room?.sealedRegions?.length) return false;
    const C = GRID.CELL_SIZE;
    const col0 = Math.floor(x / C), col1 = Math.floor((x + w - 1) / C);
    const row0 = Math.floor(y / C), row1 = Math.floor((y + h - 1) / C);
    for (let row = row0; row <= row1; row++) {
      for (let col = col0; col <= col1; col++) {
        if (isCellSealed(room, col, row)) return true;
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

    // Walk forward until the room edge / a sealed structure, keep the last clear spot
    let bestX = originX;
    let bestY = originY;
    for (let d = step; d <= distance; d += step) {
      const testX = originX + direction.x * d;
      const testY = originY + direction.y * d;
      if (!this.isValidBlinkPosition(testX, testY, player)) break;
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
