import { GRID } from '../game/GameConfig.js';
import { WeaponsMaster, resolveWeaponCategory } from '../entities/WeaponsMaster.js';

const COIN_ARC_DURATION = 0.55; // matches the well/camp-NPC/fisherman coin arcs

/**
 * WeaponsMasterSystem — the hut Weapons Master's paid training.
 *
 * SPACE near the hut WeaponsMaster (after advice has been heard once) spends
 * a wallet coin to permanently train the player's currently held weapon
 * category (+1 damage), for the active character only, once per category per
 * character. See CharacterSystem.applyGreenDamageModifier for where the
 * bonus is actually applied.
 */
export class WeaponsMasterSystem {
  constructor(game) {
    this.game = game;
    this.coinAnim = null; // { startX, startY, endX, endY, t, spinPhase, master, category }
  }

  getCoinAnim() {
    return this.coinAnim;
  }

  /** SPACE dispatch — returns true when the press was consumed. */
  trySpacePress() {
    const game = this.game;
    const player = game.player;

    // Hut Weapons Master (Settlement S room) or the rare outdoor Red Zone
    // caldera Weapons Master — same training flow either way.
    const master = (player?.inHut && game.activeFloor)
      ? game.activeFloor.npcs?.find(n => n instanceof WeaponsMaster)
      : game.neutralCharacters?.find(n => n instanceof WeaponsMaster);
    if (!master) return false;

    if (!master.isInRange(player)) return false;

    // Training in progress — swallow the press so SPACE can't reopen advice.
    if (this.coinAnim) return true;

    // Advice must be heard before training unlocks (Fisherman pattern).
    if (!master.spokenOnce) return false;

    const category = resolveWeaponCategory(player.heldItem);
    if (!category) return false;

    const trained = game.inventorySystem?.characterInventories?.[game.activeCharacterType]?.trainedWeapons;
    if (trained?.[category]) return false;

    if (!game.inventorySystem?.hasCoin()) return false;

    game.inventorySystem.removeCoin();
    this.coinAnim = {
      startX: player.position.x + GRID.CELL_SIZE / 2,
      startY: player.position.y + GRID.CELL_SIZE / 2,
      endX: master.position.x + GRID.CELL_SIZE / 2,
      endY: master.position.y + GRID.CELL_SIZE / 2,
      t: 0, spinPhase: 0,
      master, category
    };
    return true;
  }

  update(dt) {
    if (!this.coinAnim) return;
    const game = this.game;

    // Player left the hut, or the outdoor master's room was left behind —
    // cancel quietly, coin is already spent.
    const { master } = this.coinAnim;
    const stillPresent = game.player?.inHut
      ? game.activeFloor?.npcs?.includes(master)
      : game.neutralCharacters?.includes(master);
    if (!stillPresent) {
      this.coinAnim = null;
      return;
    }

    this.coinAnim.t += dt;
    this.coinAnim.spinPhase += dt * 12;
    if (this.coinAnim.t < COIN_ARC_DURATION) return;

    const { category } = this.coinAnim;
    this.coinAnim = null;

    const charType = game.activeCharacterType;
    const entry = game.inventorySystem.characterInventories[charType];
    if (entry) {
      if (!entry.trainedWeapons) entry.trainedWeapons = {};
      entry.trainedWeapons[category] = true;
    }

    game.audioSystem?.playSFX?.('coin_plink');
    game.menuSystem?.showPickupMessage?.(`TRAINED IN ${category.toUpperCase()}. +1 DAMAGE.`);
    game.dialogueSystem?.open(master, ['TRAINED.']);
  }
}
