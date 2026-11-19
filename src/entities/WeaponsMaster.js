import { NeutralCharacter } from './NeutralCharacter.js';
import { initParry } from './enemyMechanics/ParryMechanic.js';

// One line of mechanically-grounded advice per weapon category. Melee weapons
// key by weaponSubtype; ranged/wand weapons have no subtype and fall back to
// weaponType (BOW/GUN) — see resolveWeaponCategory().
const WEAPON_MASTER_ADVICE = {
  sword:   'A SWORD CUTS IN AN ARC IN FRONT OF YOU.',
  torch:   'A TORCH SETS WHAT IT HITS ON FIRE. DEEP WATER PUTS IT OUT.',
  dagger:  'A DAGGER HAS SHORT REACH. IT STABS AT THE END OF A ROLL.',
  pickaxe: 'A PICKAXE BREAKS ROCK. IT IS A WEAK WEAPON.',
  axe:     'AN AXE IS SLOW AND HITS HARD. IT CUTS DOWN TREES.',
  hammer:  'A HAMMER SENDS A SHOCKWAVE THROUGH THE GROUND. IT BREAKS ROCK.',
  spear:   'A SPEAR HITS HARDEST AT THE FULL LENGTH OF ITS REACH.',
  staff:   'HOLD A STAFF UP TO BLOCK. IT STOPS EVERY ARROW.',
  bat:     'WIND A BAT UP LONGER TO HIT HARDER AND KNOCK THEM FURTHER.',
  wand:    'A WAND CASTS THE ELEMENT OF ITS GEM. EACH CAST COSTS MANA.',
  whip:    'A WHIP HITS IN A LONG LINE AND KNOCKS WEAPONS OUT OF HANDS.',
  BOW:     'A BOW HAS A LIMITED NUMBER OF ARROWS IN EACH ROOM.',
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
    if (!category) return ['I TRAIN WEAPONS. YOU AREN\'T HOLDING ONE.'];
    const trained = game.inventorySystem?.characterInventories?.[game.activeCharacterType]?.trainedWeapons;
    if (trained?.[category]) return ['YOU ARE ALREADY TRAINED IN THIS.'];
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
    // Mid-lesson his parry tell ']' takes the place of the talk '!'.
    if (game?.weaponsMasterSystem?.parryLesson?.isTeaching(this)) {
      if (this.parryActive) this.setIndicator(']', '#eeeeff');
      else this.clearIndicator();
      return;
    }
    this.updateTalkIndicator(game);
  }
}
