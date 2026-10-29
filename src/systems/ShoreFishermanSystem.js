import { GRID } from '../game/GameConfig.js';
import { steerToward } from './npcSteering.js';
import { isInteriorActive } from './PlaneSystem.js';

const COIN_ARC_DURATION = 0.55; // matches the well/camp-NPC/hut-fisherman coin arcs
const FISHING_POLE = 'ߒ';
const WALK_SPEED = 55;                    // px/s — an unhurried stroll down the bank
const CUT_REACH = GRID.CELL_SIZE * 1.2;   // close enough to bring the blade down
const CUT_DELAY = 0.5;                    // arrives → cuts
const HOME_REACH = GRID.CELL_SIZE * 0.4;

/**
 * ShoreFishermanSystem — the Fisherman on a peaceful Lake/Ocean shore
 * (roomFeatures.spawnShoreFisherman, `room.lakeFisherman`).
 *
 * - Trade: once his tips have been heard, SPACE near him spends a wallet
 *   coin, which arcs to him, and he sets a Fishing Pole down beside him. One
 *   rod per fisherman.
 * - Cutting: whenever a catch that needs a blade has landed by the player
 *   (FishingSystem reward objects), he walks over and cuts it open, then
 *   walks back to his spot. A Caught Fish (grabbed by hand, wasted by a
 *   blade) is left alone.
 *
 * The hut Fisherman's paid demonstration is FishermanDemoSystem's.
 */
export class ShoreFishermanSystem {
  constructor(game) {
    this.game = game;
    this.coinAnim = null; // { startX, startY, endX, endY, t, spinPhase, fisherman }
  }

  getCoinAnim() {
    return this.coinAnim;
  }

  _fisherman() {
    const f = this.game.currentRoom?.lakeFisherman;
    return f && this.game.neutralCharacters.includes(f) ? f : null;
  }

  /** EXPLORE SPACE dispatch — returns true when the press was consumed. */
  trySpacePress() {
    const game = this.game;
    const player = game.player;
    const fisherman = this._fisherman();
    if (!fisherman || isInteriorActive(game) || !fisherman.isInRange(player)) return false;
    if (this.coinAnim) return true;
    // First interaction is always the tips; the trade unlocks after.
    if (!fisherman.sellsRod || !fisherman.spokenOnce || fisherman.rodSold) return false;
    if (!game.inventorySystem?.hasCoin()) return false;

    game.inventorySystem.removeCoin();
    fisherman.rodSold = true;
    this.coinAnim = {
      startX: player.position.x + GRID.CELL_SIZE / 2,
      startY: player.position.y + GRID.CELL_SIZE / 2,
      endX: fisherman.position.x + GRID.CELL_SIZE / 2,
      endY: fisherman.position.y + GRID.CELL_SIZE / 2,
      t: 0, spinPhase: 0,
      fisherman
    };
    return true;
  }

  update(dt) {
    const fisherman = this._fisherman();
    if (!fisherman) {
      this.coinAnim = null;
      return;
    }
    this._updateCoin(dt);
    this._updateCutting(dt, fisherman);
  }

  _updateCoin(dt) {
    const anim = this.coinAnim;
    if (!anim) return;
    anim.t += dt;
    anim.spinPhase += dt * 12;
    if (anim.t < COIN_ARC_DURATION) return;
    this.coinAnim = null;
    this.game.audioSystem?.playSFX?.('coin_plink');
    this._setRodDown(anim.fisherman);
  }

  // The rod lands one cell toward the player, on his side of the bank.
  _setRodDown(f) {
    const game = this.game;
    const side = Math.sign(game.player.position.x - f.position.x) || 1;
    game.lootSystem.spawnItemDrop(FISHING_POLE, f.position.x + side * GRID.CELL_SIZE, f.position.y, null, f);
  }

  // ── PERSUADE (InfluenceSystem) ──────────────────────────────────────────────

  /** He has one rod to give; once it's gone (or on its way) he has nothing. */
  persuadeRefusal(fisherman) {
    return fisherman.rodSold ? 'I HAVE NOTHING.' : null;
  }

  /** The rod, without the coin and without hearing his tips first. */
  persuade(fisherman) {
    if (fisherman.rodSold) return;
    fisherman.rodSold = true;
    this._setRodDown(fisherman);
  }

  _updateCutting(dt, fisherman) {
    const fishing = this.game.fishingSystem;
    // He waits for the catch to land by the player rather than wading out
    // after it while it's still flying in over the water.
    const target = fishing.rewardObjects.find(r => r.alive && r.arrived && !r.directPickupItem);

    if (!target) {
      fisherman.cutTimer = 0;
      this._walk(dt, fisherman, fisherman.homePosition, HOME_REACH);
      return;
    }
    if (!this._walk(dt, fisherman, target.position, CUT_REACH)) {
      fisherman.cutTimer = 0;
      return;
    }
    fisherman.cutTimer += dt;
    if (fisherman.cutTimer < CUT_DELAY) return;
    fisherman.cutTimer = 0;
    fishing.cutRewardObject(this.game, target);
  }

  /** Steer toward `to`; returns true once within `reach` (and stops). */
  _walk(dt, fisherman, to, reach) {
    const dx = to.x - fisherman.position.x;
    const dy = to.y - fisherman.position.y;
    if (dx * dx + dy * dy <= reach * reach) {
      fisherman.velocity.vx = 0;
      fisherman.velocity.vy = 0;
      return true;
    }
    steerToward(this.game, fisherman, to.x, to.y, WALK_SPEED);
    // He isn't a PhysicsSystem body — integrate here against the room's
    // collision map (UndeadSystem pattern).
    const map = this.game.currentRoom?.collisionMap;
    const nx = fisherman.position.x + fisherman.velocity.vx * dt;
    if (!blocked(map, nx, fisherman.position.y)) fisherman.position.x = nx;
    const ny = fisherman.position.y + fisherman.velocity.vy * dt;
    if (!blocked(map, fisherman.position.x, ny)) fisherman.position.y = ny;
    return false;
  }
}

function blocked(map, x, y) {
  if (!map) return false;
  const row = map[Math.floor((y + GRID.CELL_SIZE / 2) / GRID.CELL_SIZE)];
  const col = Math.floor((x + GRID.CELL_SIZE / 2) / GRID.CELL_SIZE);
  if (!row || col < 0 || col >= row.length) return true;
  return !!row[col];
}
