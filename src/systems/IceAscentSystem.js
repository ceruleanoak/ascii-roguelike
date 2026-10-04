/**
 * IceAscentSystem — the Maw Shadow under the cyan Ascent's frozen pond.
 *
 * `roomFeatures.seedFrozenAscent()` lays out the room: a frozen pond in the
 * middle, three Pits around it, and `room.ascentIce = { pondTiles, mawShadow }`.
 * The pond is ordinary frozen water (slippery, same as the Frosted Maw's
 * sheet) — this system adds nothing to its physics.
 *
 * The Maw Shadow drifts beneath the pond between random pond tiles. Every few
 * seconds it stops, the ice above it shakes (the telegraph), and then it
 * erupts: the tile it is under breaks to open water — a hole that stays until
 * something refreezes it — and a staggered cone of freeze shots flies at the
 * player. Freeze shots pass over a player standing in a Pit (pits.js), so the
 * room is cleared by reading the telegraph and moving between Pits.
 *
 * When the room is cleared the Shadow is gone for good (`mawShadow = null`).
 * Exits are the normal enemy-clear gate; the Shadow never locks or holds them.
 *
 * All state lives on the room, so it dies with the room and needs no Reset
 * Registry entry. The Shadow is not `room.mawShadow` — that field is the
 * Aquifer's dormant Frosted Maw, which a fishing cast wakes into the Boss fight.
 */

import { GRID } from '../game/GameConfig.js';

const DRIFT_SPEED = 25;        // px/s — matches MawShadowSystem's lazy circling
const ARRIVE_DIST = 4;         // px — close enough to pick the next tile
const VOLLEY_INTERVAL = 4.5;   // s of drifting between eruptions
const FIRST_VOLLEY_DELAY = 3;  // s after entry before the first eruption
const TELEGRAPH_DURATION = 1;  // s the ice shakes before it breaks

// Freeze volley — the Frosted Maw's ice stream, lighter for an Ascent room.
const SHOTS = 5;
const SHOT_SPEED = 110;              // px/s, same as the Lake Boss's stream
const SHOT_STAGGER = 0.08;           // s between shots in one volley
const CONE_SPREAD = Math.PI / 5;
const SHOT_DAMAGE = 2;

// Stand-in attacker for the volley: names the Shadow on the tombstone
// (DeathLedgerSystem.deathCauseOf) and gives pits.js a shooter position. It
// cannot be hurt — thorns/reflect damage aimed back at it does nothing.
function createShadowAttacker(maw) {
  return {
    name: 'Maw Shadow',
    char: 'M',
    color: '#4488aa',
    description: 'Something huge beneath the ice.',
    position: { x: maw.x, y: maw.y },
    takeDamage() { return false; }
  };
}

export class IceAscentSystem {
  constructor(game) {
    this.game = game;
  }

  update(deltaTime) {
    const room = this.game.currentRoom;
    const ice = room?.ascentIce;
    const maw = ice?.mawShadow;
    if (!maw) return;

    if (room.cleared) {
      ice.mawShadow = null;
      return;
    }

    if (maw.telegraph > 0) {
      maw.telegraph -= deltaTime;
      if (maw.telegraph <= 0) this._erupt(ice, maw);
      return;
    }

    maw.volleyTimer += deltaTime;
    const due = maw.erupted ? VOLLEY_INTERVAL : FIRST_VOLLEY_DELAY;
    if (maw.volleyTimer >= due) {
      maw.volleyTimer = 0;
      maw.telegraph = TELEGRAPH_DURATION;
      this._tileUnder(ice, maw)?._playAnimation('shake');
      return;
    }

    this._drift(ice, maw, deltaTime);
  }

  _drift(ice, maw, deltaTime) {
    const dx = maw.tx - maw.x, dy = maw.ty - maw.y;
    const dist = Math.hypot(dx, dy);
    if (dist <= ARRIVE_DIST) { this._retarget(ice, maw); return; }
    const step = Math.min(dist, DRIFT_SPEED * deltaTime);
    maw.x += (dx / dist) * step;
    maw.y += (dy / dist) * step;
  }

  _retarget(ice, maw) {
    const tiles = ice.pondTiles.filter(t => !t.destroyed);
    if (tiles.length === 0) return;
    const tile = tiles[Math.floor(Math.random() * tiles.length)];
    maw.tx = tile.position.x;
    maw.ty = tile.position.y;
  }

  /** The pond tile nearest the Shadow (both in tile top-left space). */
  _tileUnder(ice, maw) {
    let best = null, bestDist = Infinity;
    for (const tile of ice.pondTiles) {
      if (tile.destroyed) continue;
      const d = Math.hypot(tile.position.x - maw.x, tile.position.y - maw.y);
      if (d < bestDist) { best = tile; bestDist = d; }
    }
    return best;
  }

  _erupt(ice, maw) {
    maw.erupted = true;
    const tile = this._tileUnder(ice, maw);
    if (tile && tile.getWaterState?.() === 'frozen') {
      tile.setWaterState('normal', 0);
      tile._playAnimation('shake');
    }
    this._spawnShards(maw);
    this._fireVolley(maw);
  }

  _fireVolley(maw) {
    const game = this.game;
    const player = game.player;
    if (!player) return;
    const owner = createShadowAttacker(maw);
    const base = Math.atan2(player.position.y - maw.y, player.position.x - maw.x);
    for (let i = 0; i < SHOTS; i++) {
      const angle = base - CONE_SPREAD / 2 + (i / (SHOTS - 1)) * CONE_SPREAD;
      game.combatSystem.createEnemyAttack({
        position:    { x: maw.x, y: maw.y },
        velocity:    { vx: Math.cos(angle) * SHOT_SPEED, vy: Math.sin(angle) * SHOT_SPEED },
        damage:      SHOT_DAMAGE,
        char:        '*',
        color:       '#88ddff',
        onHit:       'freeze',
        // Not freezesWater: the holes the Shadow breaks stay open until the
        // player (or a frost trap) chooses to refreeze them.
        reflectable: false,
        reflected:   false,
        owner,
        delay:       i * SHOT_STAGGER
      });
    }
  }

  // Ice thrown up out of the new hole — printable ASCII per the encoding rule.
  _spawnShards(maw) {
    const SHARDS = ['*', '+', '.', ':'];
    const cx = maw.x + GRID.CELL_SIZE / 2, cy = maw.y + GRID.CELL_SIZE / 2;
    for (let i = 0; i < 12; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 45 + Math.random() * 70;
      this.game.particles.push({
        x: cx, y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 40,
        life: 0.4 + Math.random() * 0.3,
        maxLife: 0.7,
        char: SHARDS[Math.floor(Math.random() * SHARDS.length)],
        color: Math.random() < 0.5 ? '#ffffff' : '#cceeff'
      });
    }
  }
}
