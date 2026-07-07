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

/** Resolves the held item's training/advice category, or null if unarmed. */
export function resolveWeaponCategory(weapon) {
  if (!weapon?.data) return null;
  return weapon.data.weaponSubtype || weapon.data.weaponType || null;
}

/**
 * WeaponsMaster — hut interior NPC who advises on the player's currently
 * equipped weapon and, for a coin, permanently trains that weapon's category
 * (+1 damage) for the current character. See WeaponsMasterSystem for the
 * paid training flow; this class only speaks (DialogueSystem).
 */
export class WeaponsMaster extends NeutralCharacter {
  constructor(x, y) {
    super('m', '#c08840', x, y);
  }

  getDialogueLines(game) {
    const category = resolveWeaponCategory(game.player?.heldItem);
    if (!category) {
      return ['COME BACK WHEN YOU CARRY A WEAPON.'];
    }

    const advice = WEAPON_MASTER_ADVICE[category] || 'EVERY WEAPON HAS ITS OWN LESSON.';
    const trained = game.inventorySystem?.characterInventories?.[game.activeCharacterType]?.trainedWeapons;
    if (trained?.[category]) {
      return [advice, 'YOU HAVE ALREADY LEARNED ALL I CAN TEACH OF THIS.'];
    }
    return [advice, "GOT A COIN? I CAN SHARPEN YOUR TECHNIQUE."];
  }

  update(dt, game) {
    super.update(dt); // pulse animation
    this.updateTalkIndicator(game);
  }
}
