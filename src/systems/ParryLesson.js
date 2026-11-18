import { GRID, PHYSICS } from '../game/GameConfig.js';
import { TREASURE_CHARS, WEAPON_TYPES } from '../data/items.js';
import { initParry, tickParry, expendParry, playParrySound } from '../entities/enemyMechanics/ParryMechanic.js';

// The Weapons Master's own parry while he teaches, in real seconds. 360°: he
// turns to meet a swing from any side. The cycle repeats for the whole lesson,
// so the ']' tell rises and drops at a steady beat the player can learn.
// His guard is up 70% of each 2.0s cycle (1.4s); the opening a swing has to
// land in is the 0.6s of cooldown + windup, when the guard is down.
const LESSON_PARRY = {
  parryArcDegrees: 360,
  parryWindup: 0.3,
  parryDuration: 1.4,
  parryCooldown: 0.3,
  parryColor: '#eeeeff'
};

// Swings that land on him while his parry is down to finish the lesson.
const LESSON_SUCCESSES = 2;

// A swing he parries: no damage, the player is knocked back and stunned.
// Player stun ticks in real seconds. The stun doesn't disarm (his lesson
// doesn't knock the weapon out of your hand).
const PARRIED_STUN = 0.75;
const PARRIED_KNOCKBACK = PHYSICS.DEFAULT_DAMAGE_KNOCKBACK;

// After a swing resolves, further hitboxes are ignored this long so one swing
// (a spear's segments, a sweep's arc) counts once.
const SWING_RESOLVE_GAP = 0.4;

const BUCKLER = '◍';
const BUCKLER_COIN_PRICE = 2;
const ARTIFACT = '⚜';
const PEARL = '●';
// Gems he takes for the Buckler: the treasures, less the Artifact and the Pearl.
const GEMS = [...TREASURE_CHARS].filter(c => c !== ARTIFACT && c !== PEARL);

/**
 * ParryLesson — what the Weapons Master offers once there is nothing left to
 * train (the held weapon is melee and already trained):
 *
 *   1. The Parry Lesson, one coin, once per run. He runs a visible parry cycle
 *      (the ']' tell over him). A melee swing that meets his raised parry
 *      does nothing and knocks the player back, stunned. A swing that lands
 *      while it is down counts; two end the lesson.
 *   2. After the lesson, a Buckler, once per run. He asks for a gem if the
 *      player carries one, else 2 coins, else an Artifact.
 *
 * Owned by WeaponsMasterSystem, which dispatches SPACE and the frame tick here.
 */
export class ParryLesson {
  constructor(game) {
    this.game = game;
    this.running = null;   // { master, successes, gap }
    this.taken = false;    // the lesson was bought this run
    this.bucklerSold = false;
    this.seenSwings = new WeakSet();
  }

  /** Run reset (Reset Registry, via WeaponsMasterSystem.resetRunState). */
  resetRunState() {
    this._end();
    this.taken = false;
    this.bucklerSold = false;
  }

  isRunning() {
    return !!this.running;
  }

  /** True while `master` is mid-lesson: his parry tell replaces his talk '!'. */
  isTeaching(master) {
    return this.running?.master === master;
  }

  // ── Offers ──────────────────────────────────────────────────────────────

  /** The lesson is on offer: held weapon melee (and trained — the caller checks), not taken this run. */
  lessonOffered() {
    return !this.taken && this.game.player?.heldItem?.data?.weaponType === WEAPON_TYPES.MELEE;
  }

  bucklerOffered() {
    return this.taken && !this.bucklerSold;
  }

  /** The Buckler's price right now: a gem, else 2 coins, else an Artifact. */
  bucklerPrice() {
    const inv = this.game.inventorySystem;
    const gem = GEMS.find(c => inv?.countIngredient(c) > 0);
    if (gem) return { kind: 'gem', char: gem };
    if (inv?.hasCoin(BUCKLER_COIN_PRICE)) return { kind: 'coins' };
    if (inv?.countIngredient(ARTIFACT) > 0) return { kind: 'artifact', char: ARTIFACT };
    return { kind: 'coins' }; // what he asks for when you have none of it
  }

  /** His closing line when one of these is on offer, else null. */
  offerLine() {
    if (this.lessonOffered()) return 'ONE COIN AND I WILL SHOW YOU HOW TO GET PAST A PARRY.';
    if (!this.bucklerOffered()) return null;
    const price = this.bucklerPrice();
    const ask = price.kind === 'gem' ? 'ONE GEM'
      : price.kind === 'artifact' ? 'ONE ARTIFACT'
        : `${BUCKLER_COIN_PRICE} COINS`;
    return `A BUCKLER PARRIES A HIT AND STUNS THE ONE WHO SWUNG. ${ask} FOR ONE.`;
  }

  // ── SPACE ───────────────────────────────────────────────────────────────

  /**
   * SPACE near a master who has nothing to train. Returns
   * `{ lesson: true }` when a coin was taken for the lesson (the caller
   * flies the coin and calls begin() when it lands), `{ buckler: true }` when
   * the Buckler was bought, or null.
   */
  trySpacePress(master) {
    const inv = this.game.inventorySystem;
    if (this.lessonOffered()) {
      if (!inv?.removeCoin(1)) return null;
      this.taken = true;
      return { lesson: true };
    }
    if (this.bucklerOffered() && this._payForBuckler()) {
      this._handOverBuckler(master);
      return { buckler: true };
    }
    return null;
  }

  _payForBuckler() {
    const inv = this.game.inventorySystem;
    const price = this.bucklerPrice();
    if (price.kind === 'coins') return inv.removeCoin(BUCKLER_COIN_PRICE);
    return !!inv.removeIngredient(price.char);
  }

  // Drops the Buckler one cell toward the player (ShoreFishermanSystem pattern).
  _handOverBuckler(master) {
    const game = this.game;
    this.bucklerSold = true;
    const side = game.player.position.x >= master.position.x ? 1 : -1;
    game.lootSystem.spawnItemDrop(BUCKLER, master.position.x + side * GRID.CELL_SIZE, master.position.y, null, master);
    game.audioSystem?.playSFX?.('coin_plink');
    // A new offer comes up later only after he is heard out again.
    master.spokenOnce = false;
    game.dialogueSystem?.open(master, ['IT IS YOURS.']);
  }

  // ── The lesson ──────────────────────────────────────────────────────────

  begin(master) {
    initParry(master);
    master.talkSuspended = true; // SPACE swings at him instead of opening his speech
    this.running = { master, successes: 0, gap: 0 };
    this.game.dialogueSystem?.open(master, ['HIT ME WHEN MY GUARD IS DOWN.']);
  }

  update(dt) {
    const lesson = this.running;
    if (!lesson) return;
    const game = this.game;
    const { master } = lesson;

    // Left the hut, or the outdoor master's room — the lesson is over.
    if (!game.interiorManager.activeNpcs().includes(master)) {
      this._end();
      return;
    }

    tickParry(master, LESSON_PARRY, dt, () => true);
    if (lesson.gap > 0) {
      lesson.gap -= dt;
      return;
    }

    const swing = this._swingOnMaster(master);
    if (!swing) return;
    lesson.gap = SWING_RESOLVE_GAP;

    if (master.parryActive) {
      expendParry(master, LESSON_PARRY);
      this._parried(master);
      return;
    }

    lesson.successes++;
    if (lesson.successes < LESSON_SUCCESSES) {
      game.dialogueSystem?.open(master, ['GOOD. AGAIN.']);
      return;
    }
    this._end();
    // The Buckler offer waits for him to be heard out.
    master.spokenOnce = false;
    game.dialogueSystem?.open(master, ['GOOD. HIT AFTER THE PARRY DROPS AND IT LANDS.']);
  }

  /** A player melee hitbox overlapping him this frame, not yet counted. */
  _swingOnMaster(master) {
    const game = this.game;
    const player = game.player;
    const attacks = game.combatSystem?.meleeAttacks ?? [];
    // He is drawn centered on his position; the box is a little generous so
    // a swing that visibly reaches him counts.
    const c = GRID.CELL_SIZE;
    const box = { x: master.position.x - c * 0.75, y: master.position.y - c * 0.75, width: c * 1.5, height: c * 1.5 };
    for (const attack of attacks) {
      if (attack.owner && attack.owner !== player) continue;
      if (this.seenSwings.has(attack)) continue;
      const hit = attack.position.x < box.x + box.width && attack.position.x + attack.width > box.x
        && attack.position.y < box.y + box.height && attack.position.y + attack.height > box.y;
      if (!hit) continue;
      this.seenSwings.add(attack);
      return attack;
    }
    return null;
  }

  // His parry catches the swing: no damage; the player is stunned and knocked back.
  _parried(master) {
    const game = this.game;
    const player = game.player;
    playParrySound(game);
    player.applyStatusEffect('stun', PARRIED_STUN, 1);
    if (player.statusEffects?.stun) player.statusEffects.stun.disarm = false;
    game.physicsSystem?.applyKnockback(player, master.position.x, master.position.y, PARRIED_KNOCKBACK);
    game.dialogueSystem?.open(master, ['PARRIED. WAIT FOR MY GUARD TO DROP.']);
  }

  _end() {
    const master = this.running?.master;
    if (master) {
      master.talkSuspended = false;
      initParry(master);
    }
    this.running = null;
  }
}
