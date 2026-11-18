import { GRID } from '../game/GameConfig.js';
import { WeaponsMaster, resolveWeaponCategory } from '../entities/WeaponsMaster.js';
import { TRAINING_TECHNIQUES } from '../data/items.js';
import { ParryLesson } from './ParryLesson.js';
import { menuIntent } from './MenuInput.js';
import { WeaponsMasterOverlay } from '../rendering/ui/WeaponsMasterOverlay.js';

const COIN_ARC_DURATION = 0.55; // matches the well/camp-NPC/fisherman coin arcs

// How each training technique reads back to the player on the training message.
const TRAINING_TECHNIQUE_LABELS = {
  doubleHit: 'DOUBLE HIT',
  stun: 'STUN LASH'
};

// ASK ABOUT rows: topic → its bare label.
const TOPICS = {
  weapon:  'WEAPON',
  armor:   'ARMOR',
  lesson:  'LESSON',
  buckler: 'BUCKLER'
};

/**
 * WeaponsMasterSystem — the hut Weapons Master's ASK ABOUT menu and paid
 * training.
 *
 * SPACE near him opens ASK ABOUT, a PauseSystem modal with the rows WEAPON,
 * ARMOR and LESSON (BUCKLER once the lesson is taken; gone once the Buckler
 * is sold). Picking a row closes the menu and he answers it in the dialogue
 * box. An answer that ends in an offer (training, the lesson, the Buckler) is
 * remembered as `pendingOffer`; picking that row again once he has been heard
 * out (`spokenOnce`) pays for it. Hearing any other answer in between means
 * the offer has to be heard again.
 *
 * Training spends a wallet coin to permanently train the held weapon's
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
    this.overlay = new WeaponsMasterOverlay();

    // The offer his last answer ended on ('weapon:<category>', 'lesson',
    // 'buckler'), or null. Bought by picking its row again once heard out.
    this.pendingOffer = null;

    // ASK ABOUT modal state.
    this.master = null;
    this.rows = [];       // [{ label, topic }]
    this.menuIndex = 0;
    this.openedAt = 0;
    this.inputReadyAt = 0;
  }

  /** Run reset (Reset Registry): the Parry Lesson and Buckler are once per run. */
  resetRunState() {
    this.coinAnim = null;
    this.pendingOffer = null;
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
    // caldera Weapons Master — same menu either way.
    const master = game.interiorManager.activeNpcs().find(n => n instanceof WeaponsMaster);
    if (!master) return false;

    if (!master.isInRange(player)) return false;

    // Training in progress — swallow the press so SPACE can't reopen the menu.
    if (this.coinAnim) return true;

    // Mid-lesson SPACE is a swing at him (his speech is suspended meanwhile).
    if (this.parryLesson.isRunning()) return false;

    // An answer with lines still untold: SPACE tells the next one
    // (DialogueSystem.tryOpenNearby), one line per press as for every speaker.
    if (game.dialogueSystem.isMidSpeech(master)) return false;

    this.open(master);
    return true;
  }

  // ── ASK ABOUT (PauseSystem modal) ───────────────────────────────────────────

  open(master) {
    if (!this.game.pauseSystem.openModal(this)) return;
    this.master = master;
    this.rows = this._menuRows();
    this.menuIndex = 0;
    this.openedAt = performance.now();
    // Same lockout + fade as the Shop: the SPACE that opened the menu can't
    // also pick a row.
    this.inputReadyAt = this.openedAt + 1000;
  }

  /** WEAPON, ARMOR, then LESSON — BUCKLER after the lesson, nothing once it's sold. */
  _menuRows() {
    const topics = ['weapon', 'armor'];
    if (!this.parryLesson.taken) topics.push('lesson');
    else if (this.parryLesson.bucklerOffered()) topics.push('buckler');
    return topics.map(topic => ({ label: TOPICS[topic], topic }));
  }

  handleKey(key, event) {
    if (event?.repeat) return;
    if (performance.now() < this.inputReadyAt) return;
    const intent = menuIntent(event);
    if (intent === 'up') {
      this.menuIndex = Math.max(0, this.menuIndex - 1);
    } else if (intent === 'down') {
      this.menuIndex = Math.min(this.rows.length - 1, this.menuIndex + 1);
    } else if (intent === 'confirm') {
      const master = this.master;
      const { topic } = this.rows[this.menuIndex];
      this.game.pauseSystem.closeModal();
      this._ask(master, topic);
    } else if (intent === 'shift') {
      this.game.pauseSystem.closeModal();
    }
  }

  render(renderer, game) {
    this.overlay.render(renderer, game, this);
  }

  onClose() {
    this.master = null;
    this.rows = [];
    this.menuIndex = 0;
  }

  // ── Answers ────────────────────────────────────────────────────────────────

  _ask(master, topic) {
    if (topic === 'weapon') this._askWeapon(master);
    else if (topic === 'armor') this._speak(master, master.armorLines(this.game));
    else if (topic === 'lesson') this._askLesson(master);
    else this._askBuckler(master);
  }

  _askWeapon(master) {
    const inv = this.game.inventorySystem;
    const category = this._untrainedCategory();
    const offer = category ? `weapon:${category}` : null;
    if (offer && this._heard(master, offer) && inv?.hasCoin()) {
      inv.removeCoin();
      this.pendingOffer = null;
      this._flyCoin(master, { category });
      return;
    }
    this._speak(master, master.weaponLines(this.game), offer);
  }

  _askLesson(master) {
    const lesson = this.parryLesson;
    if (!lesson.lessonOffered()) {
      this._speak(master, ['THE LESSON IS FOR A MELEE WEAPON. YOU AREN\'T HOLDING ONE.']);
      return;
    }
    if (this._untrainedCategory()) {
      this._speak(master, ['I TRAIN YOU IN THAT WEAPON BEFORE I TEACH THE LESSON.']);
      return;
    }
    if (this._heard(master, 'lesson') && lesson.buyLesson()) {
      this.pendingOffer = null;
      this._flyCoin(master, { onArrive: () => lesson.begin(master) });
      return;
    }
    this._speak(master, [lesson.offerLine()], 'lesson');
  }

  _askBuckler(master) {
    const lesson = this.parryLesson;
    if (this._heard(master, 'buckler') && lesson.buyBuckler(master)) {
      this.pendingOffer = null;
      return;
    }
    this._speak(master, [lesson.offerLine()], 'buckler');
  }

  /** He answers `lines`; `offer` is what picking the same row again will buy. */
  _speak(master, lines, offer = null) {
    this.pendingOffer = offer;
    master.spokenOnce = false;
    this.game.dialogueSystem?.open(master, lines);
  }

  /** True once `offer` was his last answer and it has been told in full. */
  _heard(master, offer) {
    return this.pendingOffer === offer && master.spokenOnce;
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
