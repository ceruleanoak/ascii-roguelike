import { menuIntent } from './MenuInput.js';
import { getPickupCategory, TREASURE_OFFERINGS } from '../data/items.js';
import { TreasureOfferingOverlay, VISIBLE_CARDS } from '../rendering/ui/TreasureOfferingOverlay.js';

/**
 * TreasureOfferingSystem — the "which gem do you give up?" prompt at a fairy
 * fountain.
 *
 * SPACE at the pool freezes the world (PauseSystem modal, same contract as
 * SlotReplacementSystem) and lays the player's treasures out as cards. Confirm
 * and a fairy carries that treasure into the water; FountainSystem owns what
 * happens next — a permanent blessing for the four plain treasures, or an
 * elemental attunement for the four gems that have an affinity.
 *
 * One offering per fountain visit, so the menu is a real decision rather than a
 * dispenser: whichever gem goes in, the rest stay in your pocket until the next
 * F room. SHIFT backs out without spending anything.
 *
 * Controls (WASD and arrows both supported):
 *   A/D, ←/→        — move between treasure cards
 *   1–3             — pick a visible card directly
 *   SPACE / ENTER   — offer the selected treasure
 *   SHIFT           — leave without offering
 *
 * More treasures than fit on screen scroll a three-card window; the overlay
 * shows ◀ / ▶ when there is more to either side.
 */

// Brief lockout after opening, matching SlotReplacementSystem's beat: the
// overlay fades the cards in over this window so a held SPACE can't spend a gem
// the instant the menu appears.
const INPUT_LOCKOUT_MS = 400;

export class TreasureOfferingSystem {
  constructor(game) {
    this.game = game;
    this.overlay = new TreasureOfferingOverlay();
    this.treasures = [];    // [{ char, count }] — offerable treasures, stable order
    this.selection = 0;     // index into this.treasures
    this.windowStart = 0;   // first card visible in the three-card window
    this.openedAt = 0;
    this.inputReadyAt = 0;
  }

  /**
   * Dispatch entry from main.js's SPACE chain. Returns true only when the menu
   * actually opened — a spent fountain, an empty pocket or a player standing
   * away from the pool all fall through to the rest of the chain (fishing,
   * bottling, trap deploy, …).
   */
  handleSpacePress() {
    const game = this.game;
    const fountain = game.fountainSystem;
    if (!fountain?.canOffer() || !fountain.isPlayerAtPool()) return false;

    const treasures = this._collectTreasures();
    if (treasures.length === 0) return false;
    if (!game.pauseSystem.openModal(this)) return false;

    this.treasures = treasures;
    this.selection = 0;
    this.windowStart = 0;
    this.openedAt = performance.now();
    this.inputReadyAt = this.openedAt + INPUT_LOCKOUT_MS;
    return true;
  }

  // ── PauseSystem modal contract ───────────────────────────────────────────

  handleKey(key, event) {
    if (event?.repeat) return; // the SPACE that opened this must not also confirm
    if (performance.now() < this.inputReadyAt) return;
    const intent = menuIntent(event);

    if (key >= '1' && key <= String(VISIBLE_CARDS)) {
      const cardIdx = this.windowStart + (parseInt(key) - 1);
      if (cardIdx >= this.treasures.length) return;
      this.selection = cardIdx;
      this._confirmOffering();
      return;
    }

    if (intent === 'shift') {
      this.game.pauseSystem.closeModal(); // back out, nothing spent
    } else if (intent === 'left') {
      this._moveSelection(-1);
    } else if (intent === 'right') {
      this._moveSelection(1);
    } else if (intent === 'confirm') {
      this._confirmOffering();
    }
  }

  render(renderer, game) {
    this.overlay.render(renderer, game, this);
  }

  onClose() {
    this.treasures = [];
  }

  // ── Internals ────────────────────────────────────────────────────────────

  /**
   * Every treasure the player can actually offer, with how many they hold.
   *
   * Coins come from the wallet, which is passive and separate; everything else
   * comes out of the one ingredient pile, so a gem picked up three runs ago is
   * as offerable as one found on the way into the room.
   *
   * Ordering follows the TREASURE_OFFERINGS declaration rather than pickup
   * order, so the cards sit in the same place every visit.
   */
  _collectTreasures() {
    const game = this.game;
    const counts = {};
    for (const char of game.getIngredients()) {
      if (getPickupCategory(char) === 'treasure') {
        counts[char] = (counts[char] || 0) + 1;
      }
    }
    const coins = game.inventorySystem.getCoinCount();
    if (coins > 0) counts['c'] = coins;

    return Object.keys(TREASURE_OFFERINGS)
      .filter(char => counts[char] > 0)
      .map(char => ({ char, count: counts[char] }));
  }

  _moveSelection(dir) {
    const next = this.selection + dir;
    if (next < 0 || next >= this.treasures.length) return;
    this.selection = next;
    // Scroll the window just enough to keep the selection visible.
    if (next < this.windowStart) {
      this.windowStart = next;
    } else if (next >= this.windowStart + VISIBLE_CARDS) {
      this.windowStart = next - VISIBLE_CARDS + 1;
    }
  }

  _confirmOffering() {
    const game = this.game;
    const entry = this.treasures[this.selection];
    if (!entry) return;
    // The fountain can decline if no fairy is free to carry it — leave the menu
    // open and the treasure in the player's pocket rather than eating either.
    if (!game.fountainSystem.startOffering(entry.char)) return;
    game.removeIngredient(entry.char);
    game.updateUI();
    game.pauseSystem.closeModal();
  }
}
