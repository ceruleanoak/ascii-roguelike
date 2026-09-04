import { GRID } from '../game/GameConfig.js';

// HoardmawTongue — the Hoardmaw's travelling grab strip (GooHead grab
// precedent: a child entity whose job is contact + reel, not independent AI).
// Spawned by the maw mid-lunge; extends from the mouth toward the target,
// latches the player on overlap (player.grabbed/grabbedBy pair — see
// ADR-backlog 2026-07-27: general-purpose movement-lock primitive), then
// reels them toward the mouth. Broken by any face-melee hit (takeDamage
// returns true once) exactly like GooHead's grab escape grammar.
export class HoardmawTongue {
  constructor(maw, originX, originY, targetX, targetY) {
    this.maw = maw;
    this.position = { x: originX, y: originY };
    this.char = '~';
    this.color = '#e0a83c';
    this.width = GRID.CELL_SIZE;
    this.height = GRID.CELL_SIZE;
    // Interior membership, not PlaneSystem's plane 1 — that constant is
    // PLANE_TUNNEL (underground passages), and claiming it here would have
    // made the tongue collide and render against tunnel walls. Every other
    // thing DungeonBossSystem spawns into the vault is tagged this way.
    this.hutPlane = true;

    // Motion: fixed-length extension toward the aim point, then retract.
    const dx = targetX - originX;
    const dy = targetY - originY;
    const dist = Math.hypot(dx, dy) || 1;
    this.dirX = dx / dist;
    this.dirY = dy / dist;
    this.maxTravel = Math.min(dist, TONGUE_RANGE);
    this.travelled = 0;
    this.retracting = false;

    // Latch state
    this.grabbedPlayer = false;
    // One-shot break flag: a face-melee hit sets this and the tongue pops.
    this.broken = false;
    this.done = false;
  }

  update(dt, player) {
    if (this.done) return;

    // Break wins instantly — the player earned the release.
    if (this.broken) {
      this._release(player);
      this.done = true;
      return;
    }

    if (!this.retracting) {
      // Extend toward the aim point.
      const step = TONGUE_SPEED * dt;
      this.travelled += step;
      this.position.x += this.dirX * step;
      this.position.y += this.dirY * step;

      // Latch on player overlap (dodge i-frames and an active dodge roll
      // both slip the tongue).
      if (!this.grabbedPlayer && player
          && player.invulnerabilityTimer <= 0 && !player.dodgeRoll?.active) {
        const cx = this.position.x + this.width / 2;
        const cy = this.position.y + this.height / 2;
        const px = player.position.x + player.width / 2;
        const py = player.position.y + player.height / 2;
        if (Math.hypot(cx - px, cy - py) < GRID.CELL_SIZE * 0.8) {
          this.grabbedPlayer = true;
          this.retracting = true;
          player.grabbed = true;
          player.grabbedBy = this.maw; // face-melee escape reads grabbedBy
        }
      }

      if (this.travelled >= this.maxTravel) this.retracting = true;
    } else {
      // Retract home; a latched player is dragged along (reel).
      const step = TONGUE_RETRACT_SPEED * dt;
      const mx = this.maw.mouthX();
      const my = this.maw.mouthY();
      const dx = mx - this.position.x;
      const dy = my - this.position.y;
      const dist = Math.hypot(dx, dy);
      if (dist <= step || dist < 1) {
        // Reached the mouth: swallow beat if the player came along.
        if (this.grabbedPlayer) this.maw.onSwallow?.();
        this._release(player);
        this.done = true;
        return;
      }
      this.position.x += (dx / dist) * step;
      this.position.y += (dy / dist) * step;
      if (this.grabbedPlayer && player) {
        player.position.x = this.position.x;
        player.position.y = this.position.y;
      }
    }
  }

  // Face-melee escape — same contract GooHead's grab honors: a hit while
  // latched breaks the grip instead of damaging the maw.
  takeDamage() {
    if (this.grabbedPlayer || !this.done) {
      this.broken = true;
      return true;
    }
    return false;
  }

  _release(player) {
    if (this.grabbedPlayer && player) {
      player.grabbed = false;
      player.grabbedBy = null;
      this.grabbedPlayer = false;
    }
  }
}

const TONGUE_SPEED = 260;         // px/s extension
const TONGUE_RETRACT_SPEED = 180; // px/s reel-in (slower than the strike — readable)
const TONGUE_RANGE = GRID.CELL_SIZE * 5;
