import { NeutralCharacter } from './NeutralCharacter.js';

/**
 * AlchemistNPC — the Settlement Alchemy hut's advisor, rescued from the
 * Quagmire on a lucky final-round clear (RoundCombatSystem._spawnAlchemistRescue).
 * Distinct from the hostile 'q' Alchemist enemy (enemies.js) — both are
 * legitimately named "Alchemist" in-world (captured researcher vs. hostile
 * potion-thrower), disambiguated by class vs. data-driven Enemy.
 *
 * Dialogue-only advisor, never wired into Captive.js/unlockedCharacters — he
 * is not a playable character.
 *
 * State progression (see GLOSSARY follow-up: "the Alchemist's Path"):
 *   1. Rescue (Quagmire, placement = null) — one-time thanks + invitation.
 *   2. Hut, first visit (placement = 'hut', !lessonGiven) — explains the
 *      surviving note, asks for help, speculates hot water purifies an
 *      unstable ingredient. Sets lessonGiven.
 *   3. Once lessonGiven, HutSystem only places him in the hut while the
 *      player currently carries Hot Water (🜊) — otherwise he roams
 *      red-L/yellow-O/cyan-T (see setLocation()).
 *   4. Hut, carrying Hot Water, first time after the lesson — unlocks "the
 *      Alchemist's Path" (purified potions are devoid of color but still
 *      condenser-detectable). Sets pathUnlocked.
 */
export class AlchemistNPC extends NeutralCharacter {
  constructor(x, y) {
    super('a', '#55ccaa', x, y);

    this.rescued = true;           // only ever constructed at rescue time
    this.lessonGiven = false;
    this.pathUnlocked = false;

    // null | 'hut' | 'red-L' | 'yellow-O' | 'cyan-T' — tracked on the
    // singleton so only one room ever hosts him at once (see main.js
    // applyRoomSwap / HutSystem._syncAlchemistHutPresence).
    this.placement = null;
    this.location = null; // roaming sub-location, set via setLocation()

    this._rescueDialogueGiven = false;
    this._pathPool = [];   // shuffle-bag for post-unlock repeat visits
    this._lastPathLine = null;
  }

  /** Called by roomFeatures.maybeSpawnRoamingAlchemist to pick the zone-flavored dialogue branch. */
  setLocation(placement) {
    this.location = placement;
  }

  /**
   * Called by main.js applyRoomSwap on every room transition. Releases a
   * roaming placement (red-L/yellow-O/cyan-T) when the player leaves the
   * room currently hosting him — EXPLORE rooms are generated fresh per visit
   * and never revisited, so without this he'd be stuck "placed" in a room
   * nothing can reach again. Hut presence is governed separately by
   * HutSystem._syncAlchemistHutPresence, not room-swap, hence the 'hut' guard.
   */
  releaseIfLeftRoom(room) {
    if (this.placement && this.placement !== 'hut' && room.alchemistNPC !== this) {
      this.placement = null;
    }
  }

  /** Shuffle-bag draw (BridgeWorker pattern) for post-Path-unlock hut chatter. */
  _drawPathLine() {
    const POOL = [
      "COLOR LIES. THE CONDENSER DOESN'T.",
      "WHAT A POTION STARTS AS, IT REMAINS — NO MATTER HOW FAR IT'S CARRIED.",
      "PURITY ISN'T INVISIBLE. IT'S JUST HONEST.",
    ];
    if (this._pathPool.length === 0) {
      this._pathPool = [...POOL];
      for (let i = this._pathPool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [this._pathPool[i], this._pathPool[j]] = [this._pathPool[j], this._pathPool[i]];
      }
      if (this._pathPool.length > 1 && this._pathPool[0] === this._lastPathLine) {
        const swapIdx = 1 + Math.floor(Math.random() * (this._pathPool.length - 1));
        [this._pathPool[0], this._pathPool[swapIdx]] = [this._pathPool[swapIdx], this._pathPool[0]];
      }
    }
    const line = this._pathPool.shift();
    this._lastPathLine = line;
    return line;
  }

  getDialogueLines() {
    // 1. Rescue — one-time, delivered wherever he's first spoken to.
    if (!this._rescueDialogueGiven) {
      this._rescueDialogueGiven = true;
      return [
        "I AM FREE! YOU HAVE MY THANKS",
        'FIND ME IN THE ALCHEMY LAB.',
      ];
    }

    // 2. Hut, first visit — explain the note, ask for help, speculate hot water.
    if (this.placement === 'hut' && !this.lessonGiven) {
      this.lessonGiven = true;
      return [
        'THE CONDENSER REVEALS THE BASE.',
        'BRING HOT WATER.',
      ];
    }

    // 3. Hut, carrying Hot Water, after the lesson — unlock the Path.
    if (this.placement === 'hut' && this.lessonGiven && !this.pathUnlocked) {
      this.pathUnlocked = true;
      return [
        'YOU BROUGHT IT. LET\'S SEE.',
        "HOT WATER PURIFIES THE BASE, YET NOTE THE CONDENSER",
        "LIQUID. BASE. SUPPLEMENT.",
        "THIS IS THE ALCHEMIST'S PATH.",
      ];
    }

    // 4. Hut, repeat visits after the Path is unlocked.
    if (this.placement === 'hut') {
      return [this._drawPathLine()];
    }

    // 5. Roaming — zone-flavored lore, gated on lessonGiven by roomFeatures
    //    before placement is ever set to a roaming location.
    if (this.location === 'red-L') {
      return [Math.random() < 0.5
        ? "A RELIABLE SOURCE OF MUD ALL AROUND."
        : 'I AM NOT BRAVE ENOUGH TO BOTTLE LAVA.'];
    }
    if (this.location === 'yellow-O') {
      return [Math.random() < 0.5
        ? "HOW VOLATILE IS ELECTRIFIED WATER!"
        : "LONG AGO ALFALFA WAS BOTTLED FOR SOME STRANGE PURPOSE."];
    }
    if (this.location === 'cyan-T') {
      return [Math.random() < 0.5
        ? "THE RARE INDIGO FLOWER DOES NOT WILT IN THE COLD."
        : "COULD ICE BE BOTTLED SOMEHOW?"];
    }

    // Fallback — still in the Quagmire room, or between placements.
    return ["I AM IN YOUR DEBT."];
  }

  update(dt, game) {
    super.update(dt); // pulse animation
    this.updateTalkIndicator(game);
  }
}
