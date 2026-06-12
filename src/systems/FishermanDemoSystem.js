import { GRID } from '../game/GameConfig.js';
import { pickRandomCatch } from '../data/fishingTables.js';
import { Fisherman } from '../entities/Fisherman.js';

const TALK_RANGE = GRID.CELL_SIZE * 2.5;
const COIN_ARC_DURATION = 0.55; // matches the well/camp-NPC coin arcs
const CAST_DELAY = 0.9;  // coin lands → fish appears
const CUT_DELAY  = 1.2;  // fish on display → fisherman cuts it open

/**
 * FishermanDemoSystem — the hut fisherman's paid lesson.
 *
 * SPACE near the hut Fisherman (after his tips have been heard once) spends a
 * wallet coin: he produces a fish, pauses, then demonstrates cutting it open —
 * the catch's ingredients scatter and are picked up by the normal passive
 * pickup mechanics. Teaches "a blade opens the catch" by showing, not telling.
 *
 * Hut interiors only (the lakeside fisherman talks but doesn't trade).
 */
export class FishermanDemoSystem {
  constructor(game) {
    this.game = game;
    this.state = null; // { phase: 'cast'|'cut', timer, fisherman, fish: {char,color,x,y,drops} }
    this.coinAnim = null; // { startX, startY, endX, endY, t, spinPhase, fisherman } — interior coords
  }

  getFishMarker() {
    return this.state?.fish ?? null;
  }

  getCoinAnim() {
    return this.coinAnim;
  }

  /** SPACE dispatch — returns true when the press was consumed. */
  trySpacePress() {
    const game = this.game;
    const player = game.player;
    if (!player?.inHut || !game.activeFloor) return false;

    const fisherman = game.activeFloor.npcs?.find(n => n instanceof Fisherman);
    if (!fisherman || !fisherman.coinDemoEnabled) return false;

    const dist = Math.hypot(
      player.position.x - fisherman.position.x,
      player.position.y - fisherman.position.y
    );
    if (dist > TALK_RANGE) return false;

    // Demo already running (or coin in flight) — swallow the press so SPACE
    // can't reopen tips dialogue over the demonstration.
    if (this.state || this.coinAnim) return true;

    // First interaction is always the tips; the trade unlocks after.
    if (!fisherman.spokenOnce) return false;
    if (!game.inventorySystem?.hasCoin()) return false;

    // Pay: the coin arcs from player to fisherman (well/camp-NPC ritual);
    // the demonstration starts when it lands.
    game.inventorySystem.removeCoin();
    this.coinAnim = {
      startX: player.position.x + GRID.CELL_SIZE / 2,
      startY: player.position.y + GRID.CELL_SIZE / 2,
      endX: fisherman.position.x + GRID.CELL_SIZE / 2,
      endY: fisherman.position.y + GRID.CELL_SIZE / 2,
      t: 0, spinPhase: 0,
      fisherman
    };
    return true;
  }

  update(dt) {
    if (!this.state && !this.coinAnim) return;
    const game = this.game;

    // Player left the hut mid-demo — cancel quietly.
    if (!game.player?.inHut || !game.activeFloor) {
      this.state = null;
      this.coinAnim = null;
      return;
    }

    if (this.coinAnim) {
      this.coinAnim.t += dt;
      this.coinAnim.spinPhase += dt * 12;
      if (this.coinAnim.t >= COIN_ARC_DURATION) {
        const fisherman = this.coinAnim.fisherman;
        this.coinAnim = null;
        game.audioSystem?.playSFX?.('coin_plink');
        game.dialogueSystem?.open(fisherman, ['WATCH CLOSE.']);
        this.state = { phase: 'cast', timer: CAST_DELAY, fisherman, fish: null };
      }
      return;
    }

    this.state.timer -= dt;
    if (this.state.timer > 0) return;

    if (this.state.phase === 'cast') {
      // Fish appears beside the fisherman.
      const f = this.state.fisherman;
      const catchData = this._rollIngredientCatch();
      this.state.fish = {
        char: catchData.char,
        color: catchData.color,
        x: f.position.x - GRID.CELL_SIZE,
        y: f.position.y,
        drops: catchData.drops
      };
      this.state.phase = 'cut';
      this.state.timer = CUT_DELAY;
      return;
    }

    // 'cut' — the demonstration: ingredients burst out of the fish and land
    // for normal passive pickup (LootSystem tags them hutPlane automatically).
    const fish = this.state.fish;
    const scatter = () => (Math.random() - 0.5) * GRID.CELL_SIZE * 2;
    for (const dropChar of fish.drops) {
      game.lootSystem.spawnIngredientDrop(
        dropChar,
        fish.x + scatter(),
        fish.y + scatter()
      );
    }
    game.dialogueSystem?.open(this.state.fisherman, ['A BLADE OPENS THE CATCH.']);
    this.state = null;
  }

  /**
   * Roll the hut zone's table for a catch that actually carries ingredients —
   * re-roll specials-only catches (e.g. Empty Bottle) so the lesson always
   * has something to cut open.
   */
  _rollIngredientCatch() {
    const zone = this.state.fisherman.zoneName || 'green';
    for (let i = 0; i < 8; i++) {
      const c = pickRandomCatch(zone);
      if (c?.drops?.length) return c;
    }
    return { char: 'ծ', color: '#aaddff', drops: ['m'] };
  }
}
