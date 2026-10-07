import { NeutralCharacter } from './NeutralCharacter.js';

// One line of mechanically-grounded advice per weapon category. Melee weapons
// key by weaponSubtype; ranged/wand weapons have no subtype and fall back to
// weaponType (BOW/GUN) — see resolveWeaponCategory().
const WEAPON_MASTER_ADVICE = {
  sword:   'A SWORD REWARDS BALANCE — QUICK IN EITHER HAND.',
  torch:   'FIRE SPREADS WHERE YOU LEAST EXPECT IT.',
  dagger:  'A DAGGER FROM BEHIND CUTS DEEPEST.',
  pickaxe: 'A PICKAXE OPENS STONE BEFORE IT OPENS A FOE.',
  axe:     'AN AXE IS SLOW TO SWING BUT HEAVY TO MEET.',
  hammer:  'A HAMMER DOES NOT CARE WHAT STANDS BETWEEN IT AND THE GROUND.',
  scythe:  'A SCYTHE CUTS A WIDE CIRCLE — MIND WHAT STANDS BESIDE YOU.',
  spear:   'A SPEAR KEEPS DANGER AT A DISTANCE.',
  staff:   'A STAFF CHANNELS WHAT THE HAND ALONE CANNOT.',
  bat:     'A BAT SENDS THEM BACK WHERE THEY CAME FROM.',
  wand:    'A WAND SPEAKS THE ELEMENT IT WAS FORGED WITH.',
  whip:    'A WHIP REACHES FAR AND STRIKES IN A LINE.',
  flail:   'A FLAIL SWINGS WHERE IT WILL — WATCH THE ARC.',
  BOW:     'A BOW REWARDS PATIENCE AND A STEADY DRAW.',
  GUN:     'A GUN IS LOUD AND FAST — MIND YOUR SHOTS.'
};

// What he says of worn armor that belongs to no Armor Flavor family (robes,
// crowns, mantles), and of no armor at all. Family remarks live with the
// families themselves: ARMOR_FLAVORS[x].masterRemark in items.js.
const UNFAMILIAR_ARMOR_REMARK = 'THAT IS NO ARMOR I KNOW HOW TO JUDGE.';
const BARE_REMARK = 'NOTHING ON YOUR BACK. BOLD, OR CARELESS.';

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
  }

  // Weapon first, then the armor remark as his secondary topic, then the
  // training offer last so it is what the player walks away with.
  getDialogueLines(game) {
    const remark = armorRemark(game);
    const category = resolveWeaponCategory(game.player?.heldItem);
    if (!category) {
      return [remark, 'COME BACK WHEN YOU CARRY A WEAPON.'];
    }

    const advice = WEAPON_MASTER_ADVICE[category] || 'EVERY WEAPON HAS ITS OWN LESSON.';
    const trained = game.inventorySystem?.characterInventories?.[game.activeCharacterType]?.trainedWeapons;
    if (trained?.[category]) {
      return [advice, remark, 'YOU HAVE ALREADY LEARNED ALL I CAN TEACH OF THIS.'];
    }
    return [advice, remark, "GOT A COIN? I CAN SHARPEN YOUR TECHNIQUE."];
  }

  update(dt, game) {
    super.update(dt); // pulse animation
    this.updateTalkIndicator(game);
  }
}
