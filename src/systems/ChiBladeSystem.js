import { BackgroundObject } from '../entities/BackgroundObject.js';
import { GAME_STATES } from '../game/GameConfig.js';
import { isInteriorActive } from './PlaneSystem.js';

const BUZZ_MAX_RADIUS = 400;   // px — beyond this, silence
const BUZZ_MIN_VOLUME = 0.05;  // floor volume while in range (never fully silent)
const X_ITEM_PATTERN = /x/i;
const REVEAL_ITEM_THRESHOLD = 3;

/**
 * ChiBladeSystem — X-room ("Crossroads") secret: a red χ hidden in grass,
 * proximity-buzzed by x/X-named equipment, that yields the χ-blade (a
 * universal-key sword) when struck while 3 qualifying items are equipped.
 *
 * XCAVATE, the X room's Completion Spell, brings the blade up without the
 * chain (canExcavate / excavate).
 *
 * Room state lives on the χ BackgroundObject itself (puzzleSignal contract,
 * see BackgroundObject.js) — nothing persists here except the one-per-run
 * `game.chiBladeFound` flag on `game`.
 */
export class ChiBladeSystem {
  constructor(game) {
    this.game = game;
  }

  update(deltaTime) {
    const room = this.game.currentRoom;
    if (!room) {
      this.game.audioSystem?.stopSFXByName?.('chi_buzz');
      return;
    }

    const target = room.backgroundObjects?.find(obj =>
      obj.chiGrass || (obj.char === 'χ' && obj.puzzleSignal)
    );

    if (!target) {
      this.game.audioSystem?.stopSFXByName?.('chi_buzz');
      return;
    }

    this._updateBuzz(target);
    this._resolveStrike(target);
  }

  // Buzzing hint SFX — plays louder the closer the player gets to the χ
  // target, but only while a qualifying item is equipped. Never interrupts
  // music (separate SFX gain graph, see AudioSystem).
  _updateBuzz(target) {
    const audio = this.game.audioSystem;
    if (!audio) return;

    if (this._equippedXItemCount() < 1) {
      audio.stopSFXByName?.('chi_buzz');
      return;
    }

    const player = this.game.player;
    if (!player) {
      audio.stopSFXByName?.('chi_buzz');
      return;
    }

    const dist = Math.hypot(player.position.x - target.position.x, player.position.y - target.position.y);
    if (dist >= BUZZ_MAX_RADIUS) {
      audio.stopSFXByName?.('chi_buzz');
      return;
    }

    const proximity = 1 - dist / BUZZ_MAX_RADIUS;
    const volume = BUZZ_MIN_VOLUME + proximity * (1 - BUZZ_MIN_VOLUME);

    if (audio.stoppableSources?.['chi_buzz']) {
      audio.setLoopingSFXVolume('chi_buzz', volume);
    } else {
      audio.playLoopingSFX('chi_buzz', volume);
    }
  }

  // Blade resolution — only meaningful once the χ marker exists (post-cut).
  _resolveStrike(target) {
    if (target.char !== 'χ' || !target.puzzleSignal) return;
    if (target.destroyed || target.destroyAfterAnimation) return;
    if (!target.glitterHit) return;
    target.glitterHit = false;

    if (this._equippedXItemCount() < REVEAL_ITEM_THRESHOLD) return;

    target.destroyAfterAnimation = true;
    this._grantBlade(target.position.x, target.position.y, target);
  }

  // The χ-blade comes up: dropped at (x, y), the buzz stops, and the run's
  // one blade is spent (chiBladeFound — SecretEventSystem stops hiding χs).
  _grantBlade(x, y, source) {
    this.game.renderer.markBackgroundDirty();
    this.game.audioSystem?.stopSFXByName?.('chi_buzz');
    this.game.lootSystem.spawnItemDrop('☓', x, y, null, source);
    this.game.chiBladeFound = true;
  }

  // ── XCAVATE (the X room's Completion Spell) ─────────────────────────────────

  /**
   * XCAVATE may be wished: EXPLORE, out in a Crossroads (not inside one of its
   * interiors), the run's blade not yet found.
   */
  canExcavate() {
    const game = this.game;
    return game.stateMachine?.getCurrentState() === GAME_STATES.EXPLORE && !isInteriorActive(game) &&
      game.currentRoom?.letterTemplate?.chiSecret === true &&
      !game.chiBladeFound;
  }

  /**
   * XCAVATE's wish: the χ-blade comes up out of the Crossroads whether or not
   * the hidden χ rolled for this visit. Where it was hidden — under its grass
   * or as the revealed χ — it comes up there, and the hiding place is spent;
   * otherwise it comes up at the player's feet.
   */
  excavate() {
    const game = this.game;
    const target = game._activeBackgroundObjects().find(obj =>
      obj.chiGrass || (obj.char === 'χ' && obj.puzzleSignal && !obj.destroyAfterAnimation)
    );
    if (target?.chiGrass) {
      target.chiGrass = false;
      game.currentRoom.chiRevealed = true;
    } else if (target) {
      target.destroyAfterAnimation = true;
    }
    const at = target?.position ?? game.player.position;
    this._grantBlade(at.x, at.y, target ?? game.player);
  }

  // Equip pool spans quick-slot weapons + equipped consumable + equipped
  // armor — the two exact-char precedents ('X' Dual Pistols, 'x' Stone Skin)
  // span both weapon and consumable slots.
  _equippedXItemCount() {
    const pool = [
      ...(this.game.player?.quickSlots || []),
      this.game.inventorySystem?.equippedConsumables ? [...this.game.inventorySystem.equippedConsumables] : [],
      this.game.inventorySystem?.equippedArmor
    ].flat();

    return pool.filter(item => this._itemHasX(item)).length;
  }

  _itemHasX(item) {
    if (!item) return false;
    return X_ITEM_PATTERN.test(item.char || '') || X_ITEM_PATTERN.test(item.data?.name || item.name || '');
  }
}
