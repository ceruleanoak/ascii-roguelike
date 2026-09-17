import { GRID } from '../game/GameConfig.js';

// HoardmawTongue — the Hoardmaw's travelling grab strip (GooHead grab
// precedent: a child entity whose job is contact + reel, not independent AI).
// Spawned once the parent's fixed-area telegraph resolves; sweeps a thick
// lane toward the aim point, latches the player on overlap, reels them home,
// then holds a short rectangle "bite" window at the mouth before resolving.
//
// Exactly one counterplay per stage, both a timed dodge roll:
//   sweep → dodge roll (i-frames/active roll) slips the latch entirely
//   bite  → a second, later-timed dodge roll during the bite window escapes
// The old "melee the tongue mid-travel" escape is retired — two competing
// counterplays diluted both.
export class HoardmawTongue {
  constructor(maw, originX, originY, targetX, targetY) {
    this.maw = maw;
    this.position = { x: originX, y: originY };
    this.char = '~';
    this.color = '#e0a83c';
    // Thick sweep footprint — a visible lane, not a thin trail.
    this.width = GRID.CELL_SIZE * 1.6;
    this.height = GRID.CELL_SIZE * 1.6;
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

    // sweep → reel → biting → (done)
    this.state = 'sweep';
    this.grabbedPlayer = false;
    this.biteTimer = 0;
    this.done = false;
  }

  update(dt, player) {
    if (this.done) return;

    switch (this.state) {
      case 'sweep': this._tickSweep(dt, player); break;
      case 'reel':  this._tickReel(dt, player); break;
      case 'biting': this._tickBite(dt, player); break;
      default: this.done = true;
    }
  }

  _tickSweep(dt, player) {
    const step = TONGUE_SPEED * dt;
    this.travelled += step;
    this.position.x += this.dirX * step;
    this.position.y += this.dirY * step;

    // Latch on player overlap (dodge i-frames and an active dodge roll both
    // slip the tongue — the sweep's sole counterplay).
    if (!this.grabbedPlayer && player
        && player.invulnerabilityTimer <= 0 && !player.dodgeRoll?.active) {
      const cx = this.position.x + this.width / 2;
      const cy = this.position.y + this.height / 2;
      const px = player.position.x + player.width / 2;
      const py = player.position.y + player.height / 2;
      if (Math.hypot(cx - px, cy - py) < GRID.CELL_SIZE * 0.9) {
        this.grabbedPlayer = true;
        player.grabbed = true;
        player.grabbedBy = this.maw;
      }
    }

    if (this.travelled >= this.maxTravel) this.state = 'reel';
  }

  _tickReel(dt, player) {
    // Retract home; a latched player is dragged along.
    const step = TONGUE_RETRACT_SPEED * dt;
    const mx = this.maw.mouthX();
    const my = this.maw.mouthY();
    const dx = mx - this.position.x;
    const dy = my - this.position.y;
    const dist = Math.hypot(dx, dy);

    if (dist <= step || dist < 1) {
      this.position.x = mx;
      this.position.y = my;
      if (this.grabbedPlayer) {
        // Caught: hold a short bite window at the mouth rather than
        // resolving on arrival — a distinct, later-timed escape check.
        this.state = 'biting';
        this.biteTimer = BITE_WINDOW;
      } else {
        // Missed entirely: nothing latched, sweep simply retires.
        this.done = true;
      }
      return;
    }

    this.position.x += (dx / dist) * step;
    this.position.y += (dy / dist) * step;
    if (this.grabbedPlayer && player) {
      player.position.x = this.position.x;
      player.position.y = this.position.y;
    }
  }

  _tickBite(dt, player) {
    this.biteTimer -= dt;

    // Second, later-timed dodge roll — a precisely-timed escape right at the
    // bite, distinct from the sweep's earlier check.
    if (player?.dodgeRoll?.active) {
      this._release(player);
      this.done = true;
      return;
    }

    if (this.biteTimer <= 0) {
      this.maw.onSwallow?.();
      this._release(player);
      this.done = true;
    }
  }

  /** Rectangle bite hitbox near the mouth — resolved by the state above, but
   *  exposed for the renderer to draw the fixed-area telegraph during it. */
  biteRect() {
    const w = GRID.CELL_SIZE * 1.8;
    const h = GRID.CELL_SIZE * 1.8;
    return { x: this.maw.mouthX() - w / 2, y: this.maw.mouthY() - h / 2, width: w, height: h };
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
const BITE_WINDOW = 0.55;         // seconds the rectangle bite stays escapable
