import { GRID } from '../game/GameConfig.js';

export class WarpSystem {
  constructor(game) {
    this.game = game;
  }

  // Check if a candidate position is free of walls, objects, and exit zones
  isValidBlinkPosition(x, y) {
    const player = this.game.player;
    const w = player.width;
    const h = player.height;
    const C = GRID.CELL_SIZE;

    // 3-cell safety margin from all edges — blocks perimeter walls, exit gaps, and exit trigger zones
    const margin = C * 3;
    if (x < margin || x + w > GRID.WIDTH - margin) return false;
    if (y < margin || y + h > GRID.HEIGHT - margin) return false;

    // Wall collision map check
    if (player.collisionMap) {
      const cx1 = Math.floor(x / C);
      const cy1 = Math.floor(y / C);
      const cx2 = Math.floor((x + w - 1) / C);
      const cy2 = Math.floor((y + h - 1) / C);
      for (let cy = cy1; cy <= cy2; cy++) {
        for (let cx = cx1; cx <= cx2; cx++) {
          if (player.collisionMap[cy]?.[cx]) return false;
        }
      }
    }

    // Solid background object check
    const bgObjects = this.game._activeBackgroundObjects();
    for (const obj of bgObjects) {
      if (obj.destroyed || !obj.data?.solid) continue;
      if (x < obj.position.x + GRID.CELL_SIZE && x + w > obj.position.x &&
          y < obj.position.y + GRID.CELL_SIZE && y + h > obj.position.y) return false;
    }

    return true;
  }

  // Yellow mage blink: find the furthest valid position along the blink direction, emit trail particles, then move
  resolveBlinkTeleport({ direction, distance }) {
    const player = this.game.player;
    const C = GRID.CELL_SIZE;
    const step = C / 4; // 4px steps for fine collision resolution

    const originX = player.position.x;
    const originY = player.position.y;

    // Walk forward until collision, keep last valid spot
    let bestX = originX;
    let bestY = originY;
    for (let d = step; d <= distance; d += step) {
      const testX = originX + direction.x * d;
      const testY = originY + direction.y * d;
      if (this.isValidBlinkPosition(testX, testY)) {
        bestX = testX;
        bestY = testY;
      } else {
        break;
      }
    }

    // If blocked at origin, retry with shorter distances (25px decrements)
    if (bestX === originX && bestY === originY && distance > 25) {
      for (let retryDist = distance - 25; retryDist >= 25; retryDist -= 25) {
        for (let d = step; d <= retryDist; d += step) {
          const testX = originX + direction.x * d;
          const testY = originY + direction.y * d;
          if (this.isValidBlinkPosition(testX, testY)) {
            bestX = testX;
            bestY = testY;
          } else {
            break;
          }
        }
        if (bestX !== originX || bestY !== originY) break;
      }
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
      this.game.particles.push({ x: ox, y: oy, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        life: 0.35, maxLife: 0.35, char: '*', color: player.color });
    }

    // Path trail (static dots that fade out)
    if (trailDist > 2) {
      const steps = Math.max(2, Math.floor(trailDist / (C / 2)));
      for (let i = 1; i < steps; i++) {
        const t = i / steps;
        this.game.particles.push({ x: ox + dx * t, y: oy + dy * t, vx: 0, vy: 0,
          life: 0.25, maxLife: 0.25, char: '.', color: player.color });
      }
    }

    // Destination burst
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      const speed = 25 + Math.random() * 30;
      this.game.particles.push({ x: ox + dx, y: oy + dy, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        life: 0.4, maxLife: 0.4, char: '*', color: player.color });
    }

    // Apply teleport
    player.position.x = bestX;
    player.position.y = bestY;
  }
}
