/**
 * MawShadowSystem — the dormant Frosted Maw in the lake arena reached through
 * the Aquifer's cyan branch.
 *
 * That arena is entered by the back door: exits open, no fight started. The
 * Maw is only a Maw Shadow — a dark patch drifting slowly beneath the water
 * between random lake tiles. Nothing announces it. Casting a fishing line in
 * the room wakes it: the real LakeBoss rises from the shadow's position and
 * the ordinary Boss encounter takes over (exits re-lock through
 * ExitSystem.updateRoomClearState once a counted enemy is present again;
 * defeat runs BossSystem's usual Lake Boss path).
 *
 * Shadow coordinates are in LakeBoss position space (a tile's top-left), so
 * the Boss rises exactly where the shadow was.
 *
 * The shadow's state lives on the room (`room.mawShadow`), so it dies with
 * the room and needs no Reset Registry entry. Owned by BossSystem — the
 * dormant half of the cyan Boss encounter — which ticks it while no Boss is
 * active.
 */

import { GRID } from '../game/GameConfig.js';

const DRIFT_SPEED = 25; // px/s — a slow, lazy circling
const ARRIVE_DIST = 4;  // px — close enough to pick the next tile

export class MawShadowSystem {
  constructor(game) {
    this.game = game;
  }

  /** Place a Maw Shadow where the Boss would spawn, drifting toward a random tile. */
  seed(room) {
    const cx = GRID.WIDTH / 2, cy = GRID.HEIGHT / 2;
    room.mawShadow = { x: cx, y: cy, tx: cx, ty: cy };
    this._retarget(room);
  }

  update(deltaTime) {
    const room = this.game.currentRoom;
    const shadow = room?.mawShadow;
    if (!shadow) return;
    const dx = shadow.tx - shadow.x, dy = shadow.ty - shadow.y;
    const dist = Math.hypot(dx, dy);
    if (dist <= ARRIVE_DIST) { this._retarget(room); return; }
    const step = Math.min(dist, DRIFT_SPEED * deltaTime);
    shadow.x += (dx / dist) * step;
    shadow.y += (dy / dist) * step;
  }

  /** Called by FishingSystem when a cast lands in a Maw Shadow room. */
  wake() {
    const { game } = this;
    const room = game.currentRoom;
    const shadow = room?.mawShadow;
    if (!shadow) return;
    room.mawShadow = null;
    room.isZoneBossRoom = true;

    game.bossSystem.activate(room, 'cyan', { x: shadow.x, y: shadow.y });
    const boss = game.bossSystem.lakeBoss;
    game.wireRoomEnemies(room);
    game.physicsSystem.addEntity(boss);
    game.audioSystem.scheduleBossSequence();
  }

  _retarget(room) {
    const water = room.backgroundObjects.filter(o => !o.destroyed && o.isWater?.());
    if (water.length === 0) return;
    const tile = water[Math.floor(Math.random() * water.length)];
    room.mawShadow.tx = tile.position.x;
    room.mawShadow.ty = tile.position.y;
  }
}
