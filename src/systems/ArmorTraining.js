import { ARMOR_TRAINING, GEM_CHARS } from '../data/items.js';
import { INGREDIENTS } from '../data/ingredients.js';

const DIAMOND = '⧫';

// Gems in the order he takes them when "a gem" or "three gems" is the price:
// the least valuable first, so a Diamond goes last.
const GEMS_CHEAPEST_FIRST = [...GEM_CHARS].sort(
  (a, b) => (INGREDIENTS[a]?.value ?? 0) - (INGREDIENTS[b]?.value ?? 0)
);

// What each training does, in his plain, in-world voice (one line per kind):
// literal, but no levels or percentages — those are the pickup notice's.
const DESCRIPTIONS = {
  dodge:   'I TEACH YOU TO SLIP A BLOW. EACH TIME YOU TRAIN, MORE HITS MISS YOU.',
  defense: 'I TEACH YOU TO TAKE A BLOW. EACH TIME YOU TRAIN, EVERY HIT HURTS LESS.'
};
// What he has nothing left to teach of, once a kind is fully trained.
const MASTERED = {
  dodge:   'I HAVE TAUGHT YOU ALL I KNOW OF DODGING.',
  defense: 'I HAVE TAUGHT YOU ALL I KNOW OF TAKING A BLOW.'
};
const LABELS = { dodge: 'DODGE', defense: 'DEFENSE' };
const NUMBER_WORDS = ['ZERO', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE'];

/** One price alternative spoken: { coins: 5 } → 'FIVE COINS'. */
function priceWords(alt) {
  const n = alt.coins ?? alt.gems ?? alt.diamond;
  const count = NUMBER_WORDS[n] ?? String(n);
  if (alt.coins != null) return `${count} ${n === 1 ? 'COIN' : 'COINS'}`;
  if (alt.gems != null) return `${count} ${n === 1 ? 'GEM' : 'GEMS'}`;
  return `${count} ${n === 1 ? 'DIAMOND' : 'DIAMONDS'}`;
}

/**
 * ArmorTraining — the Weapons Master's ARMOR → TRAIN DODGE / TRAIN DEFENSE
 * (owned by WeaponsMasterSystem, which runs the offer-then-pay flow).
 *
 * Each kind has three levels per character, per run, kept on the character's
 * loadout (`armorTraining`, characterLoadout.js) and read at the hit by
 * PlayerDamageSystem. Level 1 costs two coins, level 2 five coins or a gem,
 * level 3 a Diamond or three gems (ARMOR_TRAINING.prices).
 */
export class ArmorTraining {
  constructor(game) {
    this.game = game;
  }

  /** The active character's levels, or null before a loadout exists. */
  _levels() {
    const game = this.game;
    return game.inventorySystem?.characterInventories?.[game.activeCharacterType]?.armorTraining ?? null;
  }

  level(kind) {
    return this._levels()?.[kind] ?? 0;
  }

  /** True when `kind` has a level left to buy. */
  offered(kind) {
    return this.level(kind) < ARMOR_TRAINING.maxLevel;
  }

  /** His answer to TRAIN DODGE / TRAIN DEFENSE: what it does, then the next level's price. */
  offerLines(kind) {
    if (!this.offered(kind)) return [MASTERED[kind]];
    const price = ARMOR_TRAINING.prices[this.level(kind)].map(priceWords).join(' OR ');
    return [DESCRIPTIONS[kind], `${price} AND I WILL TRAIN IT.`];
  }

  /**
   * Takes the next level's price. Returns the glyph to fly to him (a coin 'c'
   * is drawn by the coin arc, so null; a gem returns its char), or false when
   * it can't be paid.
   */
  pay(kind) {
    if (!this.offered(kind)) return false;
    const alt = ARMOR_TRAINING.prices[this.level(kind)].find(a => this._canPay(a));
    if (!alt) return false;
    return this._take(alt);
  }

  _canPay(alt) {
    const inv = this.game.inventorySystem;
    if (alt.coins != null) return !!inv?.hasCoin(alt.coins);
    if (alt.diamond != null) return (inv?.countIngredient(DIAMOND) ?? 0) >= alt.diamond;
    const held = GEM_CHARS.reduce((sum, c) => sum + (inv?.countIngredient(c) ?? 0), 0);
    return held >= alt.gems;
  }

  _take(alt) {
    const inv = this.game.inventorySystem;
    if (alt.coins != null) {
      inv.removeCoin(alt.coins);
      return null;
    }
    if (alt.diamond != null) {
      for (let i = 0; i < alt.diamond; i++) inv.removeIngredient(DIAMOND);
      return DIAMOND;
    }
    let last = null;
    let owed = alt.gems;
    for (const c of GEMS_CHEAPEST_FIRST) {
      while (owed > 0 && inv.countIngredient(c) > 0) {
        inv.removeIngredient(c);
        last = c;
        owed--;
      }
    }
    return last;
  }

  /** Raises `kind` one level for the active character; returns his pickup notice. */
  train(kind) {
    const game = this.game;
    const entry = game.inventorySystem?.characterInventories?.[game.activeCharacterType];
    if (!entry) return null;
    if (!entry.armorTraining) entry.armorTraining = { dodge: 0, defense: 0 };
    entry.armorTraining[kind] = Math.min(ARMOR_TRAINING.maxLevel, (entry.armorTraining[kind] || 0) + 1);
    // The player holds a live reference (CharacterSystem points it there).
    // Re-point it in case the guard above created a fresh one.
    if (game.player) game.player.armorTraining = entry.armorTraining;
    const gain = kind === 'dodge'
      ? `+${Math.round(ARMOR_TRAINING.perLevel.dodge * 100)}%`
      : `+${ARMOR_TRAINING.perLevel.defense}`;
    return `${LABELS[kind]} ${gain}.`;
  }
}
