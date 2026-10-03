import { GRID } from '../game/GameConfig.js';
import { getPickupCategory, getItemData } from '../data/items.js';
import { Charon } from '../entities/Charon.js';

// Every REST visit from deeper than this depth finds Charon at the north exit.
const CHARON_MIN_DEPTH = 1;
// His toll: this fraction of the ingredient pile (treasures included in the
// count, coins not), rounded up. Coins are only what he takes first.
const TOLL_DIVISOR = 3;
const TAKE_INTERVAL = 0.15;  // seconds between taken ingredients
const FLIGHT_TIME = 0.45;    // seconds for a taken glyph to reach him
const FADE_TIME = 0.8;       // seconds for him to vanish once paid

/**
 * CharonSystem — the toll at REST's north exit.
 *
 * On REST entry above L1 the north exit closes and Charon stands in it.
 * SPACE near him opens his dialogue; closing it starts the toll: one third of
 * the ingredient count (rounded up, coins not counted), paid coins first,
 * then random ingredients — never treasures. A hero lost to the gray mist
 * hands off to the next one at REST without him (waiveNextVisit). Each taken
 * glyph flies from the player to him, then he fades out and the exit reopens.
 *
 * State lives on game.charon (null when absent; Reset Registry, run scope):
 *   { npc, phase: 'waiting'|'taking'|'leaving', toll: [char], takeTimer, flights }
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

  /** REST entry: bar the north exit when the player is returning from deeper than L1. */
  onEnterRest(room) {
    const game = this.game;
    game.charon = null;
    const waived = this.waived;
    this.waived = false;
    if (waived) return;
    const depth = game.zoneDepths[game.zoneSystem.currentZone] || 0;
    if (depth <= CHARON_MIN_DEPTH || !room) return;

    const centerX = Math.floor(GRID.COLS / 2);
    game.charon = {
      npc: new Charon(centerX * GRID.CELL_SIZE, GRID.CELL_SIZE),
      phase: 'waiting',
      toll: [],
      takeTimer: 0,
      flights: [],
    };
    this._setNorthExitOpen(room, false);
  }

  /** REST SPACE: talk to him, and start the toll once his line is closed. */
  trySpacePress() {
    const game = this.game;
    const charon = game.charon;
    if (!charon || charon.phase !== 'waiting') return false;
    const dialogue = game.dialogueSystem;

    if (dialogue.isOpen() && dialogue.getState().npc === charon.npc) {
      dialogue.advance();
      if (!dialogue.isOpen()) this._beginToll(charon);
      return true;
    }
    if (!charon.npc.isInRange(game.player)) return false;
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

  // Coins first, then random non-treasure pile ingredients, up to the toll.
  _beginToll(charon) {
    const inv = this.game.inventorySystem;
    const pile = inv.getIngredients();
    const coins = inv.getCoinCount();
    let owed = Math.ceil(pile.length / TOLL_DIVISOR);

    const toll = [];
    const coinsTaken = Math.min(coins, owed);
    for (let i = 0; i < coinsTaken; i++) toll.push('c');
    owed -= coinsTaken;

    const takeable = pile.filter(char => getPickupCategory(char) !== 'treasure');
    while (owed > 0 && takeable.length > 0) {
      const i = Math.floor(Math.random() * takeable.length);
      toll.push(takeable.splice(i, 1)[0]);
      owed--;
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
