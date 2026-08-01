import { GRID } from '../game/GameConfig.js';
import { WeaponsMaster, resolveWeaponCategory } from '../entities/WeaponsMaster.js';
import { TRAINING_TECHNIQUES } from '../data/items.js';

const COIN_ARC_DURATION = 0.55; // matches the well/camp-NPC/fisherman coin arcs

// How each training technique reads back to the player on the training message.
const TRAINING_TECHNIQUE_LABELS = {
  doubleHit: 'DOUBLE HIT',
  stun: 'STUN LASH'
};

/**
 * WeaponsMasterSystem — the hut Weapons Master's paid training.
 *
 * SPACE near the hut WeaponsMaster (after advice has been heard once) spends
 * a wallet coin to permanently train the player's currently held weapon
 * category, for the active character only, once per category per character.
 *
 * Training grants +1 damage by default — see CharacterSystem.applyGreenDamageModifier
 * for where that bonus is applied. Categories listed in TRAINING_TECHNIQUES get
 * that category's technique instead of the damage: the dagger earns `doubleHit`
 * (Item.createMeleeMultistab), the whip earns `stun` (Item.createMeleeWhipcrack).
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
      // The player holds a live reference to this map (CharacterSystem points
      // it there). Re-point it in case the guard above created a fresh one.
      if (game.player) game.player.trainedWeapons = entry.trainedWeapons;
    }

    const reward = TRAINING_TECHNIQUE_LABELS[TRAINING_TECHNIQUES[category]] || '+1 DAMAGE';
    game.audioSystem?.playSFX?.('coin_plink');
    game.menuSystem?.showPickupMessage?.(`TRAINED IN ${category.toUpperCase()}. ${reward}.`);
    game.dialogueSystem?.open(master, ['TRAINED.']);
  }
}
