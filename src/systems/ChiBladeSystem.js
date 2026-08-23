import { BackgroundObject } from '../entities/BackgroundObject.js';

const BUZZ_MAX_RADIUS = 400;   // px — beyond this, silence
const BUZZ_MIN_VOLUME = 0.05;  // floor volume while in range (never fully silent)
const X_ITEM_PATTERN = /x/i;
const REVEAL_ITEM_THRESHOLD = 3;

/**
 * ChiBladeSystem — X-room ("Crossroads") secret: a red χ hidden in grass,
 * proximity-buzzed by x/X-named equipment, that yields the χ-blade (a
 * universal-key sword) when struck while 3 qualifying items are equipped.
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
    this.game.renderer.markBackgroundDirty();
    this.game.audioSystem?.stopSFXByName?.('chi_buzz');
    this.game.lootSystem.spawnItemDrop('☓', target.position.x, target.position.y, null, target);
    this.game.chiBladeFound = true;
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
