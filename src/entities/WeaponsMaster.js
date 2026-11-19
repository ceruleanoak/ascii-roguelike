import { NeutralCharacter } from './NeutralCharacter.js';
import { GRID } from '../game/GameConfig.js';
import { initParry } from './enemyMechanics/ParryMechanic.js';

// One line of mechanically-grounded advice per weapon category, said the way
// a man in the world would say it: plain and literal, never game terms
// (no rooms, mana, levels or percentages). Melee weapons
// key by weaponSubtype; ranged/wand weapons have no subtype and fall back to
// weaponType (BOW/GUN) — see resolveWeaponCategory().
// On a Cursed Run he trembles: every few seconds his glyph shakes side to
// side for a moment, then holds still again.
const TREMBLE_GAP_MIN = 1.5;      // seconds of stillness between fits, at least
const TREMBLE_GAP_SPREAD = 2.5;   // ...plus up to this much more, at random
const TREMBLE_DURATION = 0.45;    // seconds one fit lasts
const TREMBLE_STEP = 0.05;        // seconds between side-to-side flips
const TREMBLE_PX = GRID.CELL_SIZE * 0.08;

const WEAPON_MASTER_ADVICE = {
  sword:   'A SWORD CUTS IN AN ARC IN FRONT OF YOU.',
  torch:   'A TORCH SETS WHAT IT HITS ON FIRE. DEEP WATER PUTS IT OUT.',
  dagger:  'A DAGGER HAS SHORT REACH. IT STABS AT THE END OF A ROLL.',
  pickaxe: 'A PICKAXE IS FOR BREAKING ROCK, NOT FOR FIGHTING.',
  axe:     'AN AXE IS SLOW AND HITS HARD. IT CUTS DOWN TREES.',
  hammer:  'A HAMMER SENDS A SHOCKWAVE THROUGH THE GROUND. IT BREAKS ROCK.',
  spear:   'A SPEAR HITS HARDEST AT THE FULL LENGTH OF ITS REACH.',
  staff:   'HOLD A STAFF UP TO BLOCK. IT STOPS EVERY ARROW.',
  bat:     'WIND A BAT UP LONGER TO HIT HARDER AND KNOCK THEM FURTHER.',
  wand:    'A WAND CASTS THE ELEMENT OF ITS GEM. EVERY CAST DRAWS ON YOUR MAGIC.',
  whip:    'A WHIP HITS IN A LONG LINE AND KNOCKS WEAPONS OUT OF HANDS.',
  BOW:     'A BOW CARRIES ONLY SO MANY ARROWS. YOUR QUIVER FILLS AGAIN WHEREVER YOU GO NEXT.',
  GUN:     'A GUN EMPTIES, THEN TAKES A WHILE TO RELOAD. ITS SHOTS SPREAD.'
};

// What he says of worn armor that belongs to no Armor Flavor family (robes,
// crowns, mantles), and of no armor at all. Family remarks live with the
// families themselves: ARMOR_FLAVORS[x].masterRemark in items.js.
const UNFAMILIAR_ARMOR_REMARK = 'I DON\'T KNOW THAT ARMOR.';
const BARE_REMARK = 'YOU HAVE NO ARMOR ON.';

/** His ARMOR answer: a remark on what the player is wearing. */
function armorRemark(game) {
  const armor = game.inventorySystem?.equippedArmor;
  if (!armor) return BARE_REMARK;
  return armor.data?.flavor?.masterRemark ?? UNFAMILIAR_ARMOR_REMARK;
}

/** Resolves the held item's training/advice category, or null if unarmed. */
export function resolveWeaponCategory(weapon) {
  if (!weapon?.data) return null;
  return weapon.data.weaponSubtype || weapon.data.weaponType || null;
}

/**
 * WeaponsMaster — hut interior NPC who advises on the player's currently
 * equipped weapon, remarks on the armor they wear, and, for a coin,
 * permanently trains that weapon's category for the current character (+1 damage, or that category's training technique
 * where one is defined). SPACE opens his ASK ABOUT menu (WeaponsMasterSystem),
 * which picks the topic; this class only supplies the lines (DialogueSystem).
 */
export class WeaponsMaster extends NeutralCharacter {
  constructor(x, y) {
    super('m', '#c08840', x, y);
    this.persuadeOwner = 'weaponsMasterSystem';
    // His parry, raised only during the Parry Lesson (ParryLesson).
    initParry(this);
    // Cursed Run tremble: the glyph's sideways shift this frame, and the
    // countdown to the next fit (negative while one is playing).
    this.trembleX = 0;
    this._trembleWait = TREMBLE_GAP_MIN;
  }

  // ASK ABOUT → WEAPON → CHECK (WeaponsMasterSystem): advice on the held weapon.
  weaponCheckLines(game) {
    const category = resolveWeaponCategory(game.player?.heldItem);
    if (!category) return ['YOU AREN\'T HOLDING A WEAPON.'];
    return [WEAPON_MASTER_ADVICE[category] || 'I DON\'T KNOW THAT WEAPON.'];
  }

  // ASK ABOUT → WEAPON → TRAIN: what training the held weapon can still get.
  weaponTrainLines(game) {
    const category = resolveWeaponCategory(game.player?.heldItem);
    if (!category) return ['PUT A WEAPON IN YOUR HAND AND I WILL TRAIN YOU WITH IT.'];
    const trained = game.inventorySystem?.characterInventories?.[game.activeCharacterType]?.trainedWeapons;
    if (trained?.[category]) return ['I HAVE TAUGHT YOU ALL I KNOW OF THAT ONE.'];
    return ['ONE COIN AND I WILL TRAIN YOU IN IT.'];
  }

  // ASK ABOUT → ARMOR → CHECK: a remark on what the player is wearing.
  armorCheckLines(game) {
    return [armorRemark(game)];
  }

  // His whole say at once, for callers that talk to him outside the ASK ABOUT
  // menu (Beeline, lookHere): weapon, armor, then the Parry Lesson or Buckler
  // offer when one stands.
  getDialogueLines(game) {
    const offer = game.weaponsMasterSystem?.parryLesson?.offerLine() ?? null;
    return [
      ...this.weaponCheckLines(game),
      ...(resolveWeaponCategory(game.player?.heldItem) ? this.weaponTrainLines(game) : []),
      ...this.armorCheckLines(game),
      ...(offer ? [offer] : [])
    ];
  }

  update(dt, game) {
    super.update(dt); // pulse animation
    this._updateTremble(dt, !!game?.cursedRun);
    // Mid-lesson his parry tell ']' takes the place of the talk '!'.
    if (game?.weaponsMasterSystem?.parryLesson?.isTeaching(this)) {
      if (this.parryActive) this.setIndicator(']', '#eeeeff');
      else this.clearIndicator();
      return;
    }
    this.updateTalkIndicator(game);
  }

  _updateTremble(dt, cursed) {
    this.trembleX = 0;
    if (!cursed) return;
    this._trembleWait -= dt;
    if (this._trembleWait > 0) return;
    if (this._trembleWait < -TREMBLE_DURATION) {
      this._trembleWait = TREMBLE_GAP_MIN + Math.random() * TREMBLE_GAP_SPREAD;
      return;
    }
    const flip = Math.floor(-this._trembleWait / TREMBLE_STEP) % 2;
    this.trembleX = flip ? TREMBLE_PX : -TREMBLE_PX;
  }

  render(ctx, gridToPixel) {
    if (!this.trembleX) return super.render(ctx, gridToPixel);
    super.render(ctx, (col, row) => {
      const p = gridToPixel(col, row);
      return { ...p, x: p.x + this.trembleX };
    });
  }
}
