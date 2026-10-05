import { GRID } from '../game/GameConfig.js';
import { getPickupCategory, getItemData } from '../data/items.js';
import { Charon } from '../entities/Charon.js';

// Every REST visit from deeper than this depth finds Charon at the north exit.
const CHARON_MIN_DEPTH = 1;
// His toll: this fraction of the ingredient pile (treasures included in the
// count, coins not), rounded up. Coins are only what he takes first.
const TOLL_DIVISOR = 3;
// Coins he takes never exceed the depth returned from ÷ this, rounded up;
// the rest of the toll is paid in ingredients.
const COIN_LIMIT_DIVISOR = 3;
const TAKE_INTERVAL = 0.15;  // seconds between taken ingredients
const FLIGHT_TIME = 0.45;    // seconds for a taken glyph to reach him
const FADE_TIME = 0.8;       // seconds for him to vanish once paid
// Stick, Rock, Fur, Goo — beneath him. He takes them only once nothing else
// takeable is left in the pile.
const SCORNED_INGREDIENTS = new Set(['|', '0', 'f', 'g']);

/**
 * CharonSystem — the toll at REST's north exit.
 *
 * On REST entry above L1 the north exit closes and Charon stands in it —
 * unless the player came back at full HP, when he doesn't stand there.
 * SPACE near him opens his dialogue; closing it starts the toll: one third of
 * the ingredient count (rounded up, coins not counted), paid coins first —
 * at most a third of the depth returned from, rounded up — then random
 * ingredients — never treasures, and Stick/Rock/Fur/Goo only once nothing
 * else is left. He speaks once per run (game.charonGreeted);
 * after that, SPACE goes straight to the toll. A hero lost to the gray mist
 * hands off to the next one at REST without him (waiveNextVisit). Each taken
 * glyph flies from the player to him, then he fades out and the exit reopens.
 *
 * A Cursed Run changes the visit (CursedRunSystem.charonVisit): first his
 * cursed line over the same toll, then — as the curse runs on — no Charon at
 * all, and finally, once REST has given way, one last visit with no toll: he
 * says farewell, and EXPLORE's way back to REST is shut for the run.
 *
 * State lives on game.charon (null when absent; Reset Registry, run scope):
 *   { npc, phase: 'waiting'|'taking'|'leaving', toll: [char], coinLimit, takeTimer, flights }
 * The farewell visit is the npc whose voice is 'farewell'.
 */
export class CharonSystem {
  constructor(game) {
    this.game = game;
    // One-shot: the next REST entry finds no Charon. Consumed by onEnterRest.
    this.waived = false;
  }

  /** The next REST entry is a hand-off, not a return — he doesn't stand there. */
  waiveNextVisit() {
    this.waived = true;
  }

  /**
   * REST entry: bar the north exit when the player is returning from deeper
   * than L1 and hurt. `arrivedAtFullHp` is read off the player who walked in,
   * before REST's rebuild heals them.
   */
  onEnterRest(room, { arrivedAtFullHp = false } = {}) {
    const game = this.game;
    game.charon = null;
    const waived = this.waived;
    this.waived = false;
    if (waived || !room) return;
    const visit = game.cursedRunSystem.charonVisit(game);
    if (visit === 'absent') return;
    // His farewell is owed whatever depth or health the player comes back with.
    const depth = game.zoneDepths[game.zoneSystem.currentZone] || 0;
    if (visit !== 'farewell' && (depth <= CHARON_MIN_DEPTH || arrivedAtFullHp)) return;

    const centerX = Math.floor(GRID.COLS / 2);
    game.charon = {
      npc: new Charon(centerX * GRID.CELL_SIZE, GRID.CELL_SIZE, visit ?? 'ferry'),
      phase: 'waiting',
      toll: [],
      coinLimit: Math.ceil(depth / COIN_LIMIT_DIVISOR),
      takeTimer: 0,
      flights: [],
    };
    this._setNorthExitOpen(room, false);
  }

  /**
   * REST SPACE: talk to him, and start the toll once his line is closed —
   * or, for his farewell, seal REST and let him go without one.
   */
  trySpacePress() {
    const game = this.game;
    const charon = game.charon;
    if (!charon || charon.phase !== 'waiting') return false;
    const dialogue = game.dialogueSystem;

    if (dialogue.isOpen() && dialogue.getState().npc === charon.npc) {
      dialogue.advance();
      if (!dialogue.isOpen()) this._afterLine(charon);
      return true;
    }
    if (!charon.npc.isInRange(game.player)) return false;
    // Already heard this line this run — no second speech, straight to the toll.
    if (game.charonGreeted === charon.npc.voice) {
      this._beginToll(charon);
      return true;
    }
    game.charonGreeted = charon.npc.voice;
    return dialogue.open(charon.npc, charon.npc.getDialogueLines(game));
  }

  update(dt) {
    const game = this.game;
    const charon = game.charon;
    if (!charon) return;
    charon.npc.update(dt, game);
    if (game.dialogueSystem.getState()?.npc === charon.npc) game.dialogueSystem.update();

    for (const f of charon.flights) f.t += dt / FLIGHT_TIME;
    charon.flights = charon.flights.filter(f => f.t < 1);

    if (charon.phase === 'taking') {
      charon.takeTimer -= dt;
      if (charon.takeTimer <= 0 && charon.toll.length > 0) {
        this._takeOne(charon, charon.toll.shift());
        charon.takeTimer = TAKE_INTERVAL;
      }
      if (charon.toll.length === 0 && charon.flights.length === 0) charon.phase = 'leaving';
    } else if (charon.phase === 'leaving') {
      charon.npc.fade = Math.max(0, charon.npc.fade - dt / FADE_TIME);
      if (charon.npc.fade === 0) {
        this._setNorthExitOpen(game.currentRoom, true);
        game.charon = null;
      }
    }
  }

  _afterLine(charon) {
    if (charon.npc.voice !== 'farewell') {
      this._beginToll(charon);
      return;
    }
    this.game.cursedRunSystem.sealRest();
    charon.phase = 'leaving';
  }

  // Coins first (up to his coin limit), then random non-treasure pile
  // ingredients (scorned ones last), up to the toll.
  _beginToll(charon) {
    const inv = this.game.inventorySystem;
    const pile = inv.getIngredients();
    const coins = inv.getCoinCount();
    let owed = Math.ceil(pile.length / TOLL_DIVISOR);

    const toll = [];
    const coinsTaken = Math.min(coins, owed, charon.coinLimit);
    for (let i = 0; i < coinsTaken; i++) toll.push('c');
    owed -= coinsTaken;

    const takeable = pile.filter(char => getPickupCategory(char) !== 'treasure');
    const prized = takeable.filter(char => !SCORNED_INGREDIENTS.has(char));
    const scorned = takeable.filter(char => SCORNED_INGREDIENTS.has(char));
    for (const pool of [prized, scorned]) {
      while (owed > 0 && pool.length > 0) {
        const i = Math.floor(Math.random() * pool.length);
        toll.push(pool.splice(i, 1)[0]);
        owed--;
      }
    }

    charon.toll = toll;
    charon.takeTimer = 0;
    charon.phase = 'taking';
  }

  _takeOne(charon, char) {
    const game = this.game;
    if (!game.removeIngredient(char)) return;
    const C = GRID.CELL_SIZE;
    charon.flights.push({
      char,
      color: getItemData(char)?.color ?? '#ffffff',
      fromX: game.player.position.x + C / 2,
      fromY: game.player.position.y + C / 2,
      t: 0,
    });
    game.updateUI();
  }

  _setNorthExitOpen(room, open) {
    if (!room) return;
    room.exits.north = open;
    const centerX = Math.floor(GRID.COLS / 2);
    if (room.collisionMap?.[0]) room.collisionMap[0][centerX] = !open;
    this.game.renderer.markBackgroundDirty();
  }
}
