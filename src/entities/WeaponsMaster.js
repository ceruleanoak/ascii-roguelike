import { NeutralCharacter } from './NeutralCharacter.js';

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

/** His secondary topic: a remark on what the player is wearing. */
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
 * where one is defined). See WeaponsMasterSystem for the paid training flow;
 * this class only speaks (DialogueSystem).
 */
export class WeaponsMaster extends NeutralCharacter {
  constructor(x, y) {
    super('m', '#c08840', x, y);
    this.persuadeOwner = 'weaponsMasterSystem';
  }

  // Weapon first, then the armor remark as his secondary topic, then the
  // training offer last so it is what the player walks away with.
  getDialogueLines(game) {
    const remark = armorRemark(game);
    const category = resolveWeaponCategory(game.player?.heldItem);
    if (!category) {
      return [remark, 'I TRAIN WEAPONS. YOU AREN\'T HOLDING ONE.'];
    }

    const advice = WEAPON_MASTER_ADVICE[category] || 'I DON\'T KNOW THAT WEAPON.';
    const trained = game.inventorySystem?.characterInventories?.[game.activeCharacterType]?.trainedWeapons;
    if (trained?.[category]) {
      return [advice, remark, 'YOU ARE ALREADY TRAINED IN THIS.'];
    }
    return [advice, remark, 'ONE COIN AND I WILL TRAIN YOU IN IT.'];
  }

  update(dt, game) {
    super.update(dt); // pulse animation
    this.updateTalkIndicator(game);
  }
}
