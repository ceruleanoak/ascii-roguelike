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
 *   - Ocean: the pearl legend. Hut and shore: the coin-trade breadcrumb.
 */
// What a Fisherman gives the player on a Cursed Run, at his feet.
const CURSED_OFFERING = '∝'; // Fish

export class Fisherman extends NeutralCharacter {
  constructor(x, y) {
    super('f', '#66aadd', x, y);
    this.dialogueLines = ['THE FISH BITE WHERE THE WATER IS STILL.'];
    this.zoneName = 'green';
    // Hut fishermen trade: a coin buys the cutting demonstration
    // (FishermanDemoSystem).
    this.coinDemoEnabled = false;
    // Shore fishermen (ShoreFishermanSystem) trade one Fishing Pole for a Pearl
    // or two coins and walk over to cut open what the player catches, then walk back.
    this.sellsRod = false;
    this.rodSold = false;
    this.homePosition = { x, y };
    this.cutTimer = 0;
    this.velocity = { x: 0, y: 0, vx: 0, vy: 0 }; // vx/vy: steerToward's
    // Cursed Run: whether his one offering has been handed over.
    this.offeringGiven = false;
  }

  /**
   * Bind zone-specific tips. Accepts a zone color OR 'ocean' (O rooms fish
   * their own saltwater table; the ocean fisherman also carries the pearl
   * legend — the breadcrumb toward the Ocean pedestal).
   */
  setZone(zoneName, { coinDemo = false, sellsRod = false } = {}) {
    this.zoneName = FISHING_TABLES[zoneName] ? zoneName : 'green';
    this.coinDemoEnabled = coinDemo;
    this.sellsRod = sellsRod;
    // The hut fisherman's lesson and the shore fisherman's rod are separate
    // systems; PERSUADE goes to whichever this one offers.
    this.persuadeOwner = coinDemo ? 'fishermanDemoSystem' : sellsRod ? 'shoreFishermanSystem' : null;
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
    if (sellsRod) {
      lines.push("A PEARL OR TWO COINS, AND MY SPARE ROD IS YOURS.");
    }
    // One saying per visit (WiseFellow pattern) — rolled once at spawn.
    this.dialogueLines = [lines[Math.floor(Math.random() * lines.length)]];
  }

  getDialogueLines(game) {
    // Cursed Run: he gives the player a Fish and is Forsaken — never met
    // again this run. His trades refuse (FishermanDemoSystem /
    // ShoreFishermanSystem), and he has nothing more to say.
    if (game?.cursedRun) {
      if (this.offeringGiven) return [];
      this.offeringGiven = true;
      game.cursedRunSystem.forsake(game, this);
      game.lootSystem.spawnItemDrop(CURSED_OFFERING, this.position.x, this.position.y, null, this);
      return ["T-TAKE IT. F-FISHING'S GOOD HERE."];
    }
    return this.dialogueLines;
  }

  update(dt, game) {
    super.update(dt); // pulse animation
    this.updateTalkIndicator(game);
  }
}
