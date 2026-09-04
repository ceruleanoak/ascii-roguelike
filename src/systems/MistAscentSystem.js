/**
 * MistAscentSystem — drives the gray-zone Ascent (A room) bone-slope + mist
 * mechanics.
 *
 * `RoomGenerator.generateAscentRoom()` seeds `room.ascentMist` when
 * `room.zone === 'gray'`: bone slope tiles apply a brief grab-lock on push,
 * and the plateau area is exempt from gray-zone fog (GrayZoneSystem reads
 * `room.ascentMist.mistExempt`).
 *
 * On room clear: the plateau radius shrinks by 1 cell (minimum 1), so the
 * safe zone contracts over successive rooms — "ten steps and then nothing."
 * Bone slope tiles are rebuilt at the new radius.
 */

import { GRID } from '../game/GameConfig.js';
import { BackgroundObject } from '../entities/BackgroundObject.js';

const BONE_SLOPE_LOCK_DURATION = 0.4; // seconds of movement lock per push
const MIN_PLATEAU_RADIUS = 1;

export class MistAscentSystem {
  constructor(game) {
    this.game = game;
    // Edge tracker for the bone-slope grab — see update().
    this._playerOnBoneSlope = false;
  }

  isActive(room) { return !!room?.ascentMist; }

  update(dt) {
    const room = this.game.currentRoom;
    const player = this.game.player;

    // The lock ticks BEFORE the room gate, and this system is dispatched from
    // main.js's state-shared player path, so it burns down everywhere. Both
    // matter: the slope belt pushes outward, straight at the room border, so a
    // locked player can be carried through an exit mid-lock. Ticking behind the
    // gate would leave the timer frozen above zero in the next room and the
    // movement clamp in Player.update would hold for the rest of the run.
    if (player?.boneSlopeLock > 0) {
      player.boneSlopeLock -= dt;
      // Don't clear `grabbed` — that's GooHead's contract. Just clear the lock.
      if (player.boneSlopeLock <= 0) player.boneSlopeLock = 0;
    }

    if (!room || !this.isActive(room)) {
      // Drop the edge tracker on the way out. It is a "was the player standing
      // on a slope last frame" memo, and carrying a stale `true` into the next
      // gray Ascent room would swallow that room's first grab — the player
      // would arrive on the belt already flagged as standing on it.
      this._playerOnBoneSlope = false;
      return;
    }

    // The grab fires when the player STEPS ONTO a bone slope, not every frame
    // they stand on one — a per-frame refresh would pin them to the belt for
    // as long as they touched it, which is a trap, not the brief grab the
    // slope is supposed to be. The edge is detected here rather than at the
    // push site because PhysicsSystem holds no game reference to call through.
    const tile = this._boneSlopeUnder(player, room);
    if (tile && !this._playerOnBoneSlope) this.applyBonePush(player, tile);
    this._playerOnBoneSlope = !!tile;
  }

  /** Bone slope tile the player currently overlaps, or null. */
  _boneSlopeUnder(player, room) {
    if (!player) return null;
    const pw = player.width || GRID.CELL_SIZE;
    const ph = player.height || GRID.CELL_SIZE;
    for (const obj of room.backgroundObjects) {
      if (obj.destroyed || !obj.boneSlope) continue;
      const b = obj.getHitbox();
      if (player.position.x < b.x + b.width && player.position.x + pw > b.x &&
          player.position.y < b.y + b.height && player.position.y + ph > b.y) {
        return obj;
      }
    }
    return null;
  }

  /** Lock the player briefly — the bone slope's grab as it shoves them along. */
  applyBonePush(player, slopeTile) {
    if (!player || !slopeTile?.boneSlope) return;
    player.boneSlopeLock = BONE_SLOPE_LOCK_DURATION;
  }

  /** Called on room clear to shrink the plateau. */
  onRoomClear(room) {
    const mist = room?.ascentMist;
    if (!mist) return;
    if (mist.plateauRadius <= MIN_PLATEAU_RADIUS) return;

    mist.plateauRadius--;
    // Rebuild bone slope tiles at new radius (outer ring becomes floor,
    // new outer ring = slopes). This is a visual + collision update.
    this._rebuildSlopes(room, mist);
  }

  _rebuildSlopes(room, mist) {
    const C = GRID.CELL_SIZE;
    const newRadius = mist.plateauRadius;
    const outerRadius = newRadius + 3; // slope belt width

    // Remove old slope tiles that are now outside the new outer radius
    const toRemove = [];
    for (const obj of room.backgroundObjects) {
      if (!obj.slope || !obj.boneSlope) continue;
      const dx = Math.round(obj.position.x / C) - mist.plateauCenterCol;
      const dy = Math.round(obj.position.y / C) - mist.plateauCenterRow;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < newRadius || dist > outerRadius) {
        toRemove.push(obj);
      }
    }
    for (const obj of toRemove) {
      const idx = room.backgroundObjects.indexOf(obj);
      if (idx !== -1) room.backgroundObjects.splice(idx, 1);
    }

    // Add new bone slope tiles in the ring [newRadius, outerRadius]
    for (let col = 1; col < GRID.COLS - 1; col++) {
      for (let row = 1; row < GRID.ROWS - 1; row++) {
        const dx = col - mist.plateauCenterCol;
        const dy = row - mist.plateauCenterRow;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < newRadius || dist > outerRadius) continue;
        // Check if a slope already exists here
        const exists = room.backgroundObjects.some(o =>
          o.slope && Math.round(o.position.x / C) === col && Math.round(o.position.y / C) === row
        );
        if (exists) continue;

        // Determine direction
        const absDx = Math.abs(dx);
        const absDy = Math.abs(dy);
        let slopeChar, slopeDirection;
        if (absDy >= absDx) {
          if (dy < 0) { slopeChar = '\u028C'; slopeDirection = 'up'; }
          else        { slopeChar = 'v'; slopeDirection = 'down'; }
        } else {
          if (dx < 0) { slopeChar = '<'; slopeDirection = 'left'; }
          else        { slopeChar = '>'; slopeDirection = 'right'; }
        }

        const slopeTile = new BackgroundObject(slopeChar, col * C, row * C);
        slopeTile.data = {
          name: `Bone Slope (${slopeDirection})`,
          color: '#aaaaaa',
          solid: false,
          bulletInteraction: 'pass-through',
          flammability: 'none',
          conductivity: 'none',
          indestructible: true,
          environmental: true,
          interactions: { default: { animation: 'none', message: null } }
        };
        slopeTile.slope = true;
        slopeTile.slopeDirection = slopeDirection;
        slopeTile.boneSlope = true;
        slopeTile.color = '#aaaaaa';
        slopeTile.animationColor = '#aaaaaa';
        slopeTile.bulletInteraction = 'pass-through';
        slopeTile.indestructible = true;
        room.backgroundObjects.push(slopeTile);
      }
    }

    // The slope belt is static scenery, so it lives in the cached background
    // layer — which only repaints when something asks it to. Without this the
    // ring the player is actually walking on and the ring they can see stay out
    // of step until some unrelated event happens to dirty the background.
    this.game.renderer?.markBackgroundDirty?.();
  }
}
