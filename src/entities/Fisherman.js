import { FISHING_TABLES } from '../data/fishingTables.js';
import { getItemData } from '../data/items.js';
import { NeutralCharacter } from './NeutralCharacter.js';

/**
 * Fisherman — hut interior NPC who teaches the lake-fishing loop.
 *
 * Like the WiseFellow, he speaks ONE line per visit, rolled from his tip pool
 * at spawn (collecting the full set takes repeat visits — knowledge is the
 * progression):
 *   - The rusalka warning — only in zones whose fishing table can roll her.
 *   - What the local waters yield — derived from the zone's common catches
 *     (rare low-weight catches stay undisclosed; discovery is the reward).
 *   - The extraction hint — catches must be opened with a blade.
 *   - Ocean: the pearl legend. Hut: the coin-trade breadcrumb.
 */
export class Fisherman extends NeutralCharacter {
  constructor(x, y) {
    super('f', '#66aadd', x, y);
    this.dialogueLines = ['THE FISH BITE WHERE THE WATER IS STILL.'];
    this.zoneName = 'green';
    // Hut fishermen trade: a coin buys the cutting demonstration
    // (FishermanDemoSystem). Lakeside fishermen only talk.
    this.coinDemoEnabled = false;
  }

  /**
   * Bind zone-specific tips. Accepts a zone color OR 'ocean' (O rooms fish
   * their own saltwater table; the ocean fisherman also carries the pearl
   * legend — the breadcrumb toward the blue zone path).
   */
  setZone(zoneName, { coinDemo = false } = {}) {
    this.zoneName = FISHING_TABLES[zoneName] ? zoneName : 'green';
    this.coinDemoEnabled = coinDemo;
    const table = FISHING_TABLES[zoneName] || FISHING_TABLES.green;

    // Common catches only (weight >= 10) — rare catches stay a secret.
    const dropChars = new Set();
    for (const c of table.catches) {
      if (c.weight < 10) continue;
      for (const ch of c.drops) dropChars.add(ch);
    }
    const names = [...dropChars]
      .map(ch => getItemData(ch)?.name?.toUpperCase())
      .filter(Boolean);

    const lines = [];
    if (table.rusalkaChance > 0) lines.push('BEWARE THE RUSALKA.');
    lines.push(names.length > 0
      ? `THE WATERS HERE GIVE ${names.join(', ')}.`
      : 'THE WATERS HERE KEEP THEIR SECRETS.');
    lines.push('EVERY GOOD FISHERMAN CARRIES A BLADE TO OPEN THE CATCH.');
    if (zoneName === 'ocean') {
      lines.push('OLD LEGEND SAYS THE TIDE ITSELF PARTS FOR ONE WHO CARRIES A PEARL.');
    }
    if (coinDemo) {
      lines.push("GOT A COIN? I'LL SHOW YOU THE TRICK.");
    }
    // One saying per visit (WiseFellow pattern) — rolled once at spawn.
    this.dialogueLines = [lines[Math.floor(Math.random() * lines.length)]];
  }

  getDialogueLines() {
    return this.dialogueLines;
  }

  update(dt, game) {
    super.update(dt); // pulse animation
    this.updateTalkIndicator(game);
  }
}
