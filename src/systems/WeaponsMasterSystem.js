import { GRID } from '../game/GameConfig.js';
import { WeaponsMaster, resolveWeaponCategory } from '../entities/WeaponsMaster.js';
import { TRAINING_TECHNIQUES } from '../data/items.js';
import { ParryLesson } from './ParryLesson.js';

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
 *
 * With nothing left to train, he offers the Parry Lesson and then a Buckler
 * (ParryLesson, owned here).
 */
export class WeaponsMasterSystem {
  constructor(game) {
    this.game = game;
    this.coinAnim = null; // { startX, startY, endX, endY, t, spinPhase, master, category | onArrive }
    this.parryLesson = new ParryLesson(game);
  }

  /** Run reset (Reset Registry): the Parry Lesson and Buckler are once per run. */
  resetRunState() {
    this.coinAnim = null;
    this.parryLesson.resetRunState();
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
    const master = game.interiorManager.activeNpcs().find(n => n instanceof WeaponsMaster);
    if (!master) return false;

    if (!master.isInRange(player)) return false;

    // Training in progress — swallow the press so SPACE can't reopen advice.
    if (this.coinAnim) return true;

    // Mid-lesson SPACE is a swing at him (his speech is suspended meanwhile).
    if (this.parryLesson.isRunning()) return false;

    // Advice must be heard before training unlocks (Fisherman pattern).
    if (!master.spokenOnce) return false;

    const category = this._untrainedCategory();
    if (!category) {
      // Nothing to train: the Parry Lesson, or the Buckler after it.
      const sold = this.parryLesson.trySpacePress(master);
      if (sold?.lesson) this._flyCoin(master, { onArrive: () => this.parryLesson.begin(master) });
      return !!sold;
    }

    if (!game.inventorySystem?.hasCoin()) return false;

    game.inventorySystem.removeCoin();
    this._flyCoin(master, { category });
    return true;
  }

  _flyCoin(master, payload) {
    const player = this.game.player;
    this.coinAnim = {
      startX: player.position.x + GRID.CELL_SIZE / 2,
      startY: player.position.y + GRID.CELL_SIZE / 2,
      endX: master.position.x + GRID.CELL_SIZE / 2,
      endY: master.position.y + GRID.CELL_SIZE / 2,
      t: 0, spinPhase: 0,
      master, ...payload
    };
  }

  update(dt) {
    this.parryLesson.update(dt);
    if (!this.coinAnim) return;
    const game = this.game;

    // Player left the hut, or the outdoor master's room was left behind —
    // cancel quietly, coin is already spent.
    const { master } = this.coinAnim;
    const stillPresent = game.interiorManager.activeNpcs().includes(master);
    if (!stillPresent) {
      this.coinAnim = null;
      return;
    }

    this.coinAnim.t += dt;
    this.coinAnim.spinPhase += dt * 12;
    if (this.coinAnim.t < COIN_ARC_DURATION) return;

    const { category, onArrive } = this.coinAnim;
    this.coinAnim = null;
    if (onArrive) onArrive();
    else this._train(master, category);
  }

  /** The held weapon's category when the active character isn't yet trained in it. */
  _untrainedCategory() {
    const game = this.game;
    const category = resolveWeaponCategory(game.player?.heldItem);
    if (!category) return null;
    const trained = game.inventorySystem?.characterInventories?.[game.activeCharacterType]?.trainedWeapons;
    return trained?.[category] ? null : category;
  }

  // ── PERSUADE (InfluenceSystem) ──────────────────────────────────────────────

  /** He refuses only when there is nothing to train: no weapon held, or one already trained. */
  persuadeRefusal() {
    if (this.coinAnim || !this._untrainedCategory()) return 'THERE IS NOTHING TO TRAIN.';
    return null;
  }

  /** The training, without the coin and without hearing his advice first. */
  persuade(master) {
    const category = this._untrainedCategory();
    if (category) this._train(master, category);
  }

  /** Permanently train `category` for the active character. */
  _train(master, category) {
    const game = this.game;
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
