import { GRID, BACKGROUND_OBJECTS } from '../game/GameConfig.js';
import { BackgroundObject } from '../entities/BackgroundObject.js';
import { activeInteriorFloor } from './PlaneSystem.js';

/**
 * TinderSystem — the ad hoc campfire.
 *
 *   1. A blade swing that lands on a Stick lying on the ground splits it into
 *      Tinder (`⋀`): a flammable background object in the Stick's cell.
 *   2. Tinder that catches fire (a torch or fire weapon hit, a Fire Trap, or
 *      flames spreading through FireSystem) does not burn away — it becomes a
 *      campfire: the same always-lit `!` station as the C-room campfire, so
 *      FireplaceSystem cooks/smelts/stokes at it.
 *
 * Tinder lives in the active room's background objects, so it is room-scoped
 * for free and needs no Reset Registry entry.
 */

const STICK_CHAR = '|';
const TINDER_CHAR = '⋀';
const CAMPFIRE_CHAR = '!';

export class TinderSystem {
  constructor(game) {
    this.game = game;
  }

  update() {
    const game = this.game;
    if (!game.player || game.player.inMaze) return;
    this._splitSticks();
    this._lightTinder();
  }

  /** Blade swings (player-owned, first frame each) turn ground Sticks into Tinder. */
  _splitSticks() {
    const game = this.game;
    const combat = game.combatSystem;
    const inInterior = !!activeInteriorFloor(game);
    for (const attack of combat.meleeAttacks) {
      if (!attack.isBlade || attack.owner !== game.player || attack._tinderChecked) continue;
      attack._tinderChecked = true;
      for (let i = game.ingredients.length - 1; i >= 0; i--) {
        const stick = game.ingredients[i];
        if (stick.char !== STICK_CHAR) continue;
        if (!!stick.hutPlane !== inInterior) continue;
        if ((stick.plane ?? 0) !== (attack.shooterPlane ?? 0)) continue;
        if (!combat.checkMeleeCollisionWithObject(attack, stick)) continue;
        this._placeTinder(stick);
        game.physicsSystem.removeEntity(stick);
        game.ingredients.splice(i, 1);
      }
    }
  }

  _placeTinder(stick) {
    const game = this.game;
    const C = GRID.CELL_SIZE;
    const col = Math.round(stick.position.x / C);
    const row = Math.round(stick.position.y / C);
    const objects = game._activeBackgroundObjects();
    // One fixture per cell — a Stick dropped onto another object just breaks.
    if (objects.some(o => !o.destroyed && Math.round(o.position.x / C) === col && Math.round(o.position.y / C) === row)) return;
    objects.push(new BackgroundObject(TINDER_CHAR, col * C, row * C));
    game.renderer?.markBackgroundDirty?.();
  }

  /** Burning Tinder becomes a campfire instead of burning away. */
  _lightTinder() {
    const game = this.game;
    for (const obj of game._activeBackgroundObjects()) {
      if (obj.char !== TINDER_CHAR || obj.destroyed || !obj.onFire) continue;
      obj.char = CAMPFIRE_CHAR;
      obj.originalChar = CAMPFIRE_CHAR;
      obj.data = BACKGROUND_OBJECTS[CAMPFIRE_CHAR];
      obj.color = obj.data.color;
      obj.animationColor = obj.data.color;
      obj.flammability = 'none';
      obj.onFire = false;
      obj.indestructible = true;
      obj.isCampfire = true; // flicker animation (BackgroundObject.update) + foreground draw
      obj.burning = true;    // a lit fireplace for FireplaceSystem
      game.renderer?.markBackgroundDirty?.();
    }
  }
}
