/**
 * weaponStyles — the plain-language stat presets the CLI offers when the
 * player adds a weapon (cliTables ADD flow). Each style is read off shipped
 * weapons rather than authored as numbers: `from` names a shipped weapon and
 * the stat keys copied from it, so a style keeps up with tuning done to the
 * weapon it is drawn from. `reference` is the weapon the style shows beside
 * its name — the one that carries its defining trait.
 *
 * Damage is never copied — the player picks it on its own step.
 *
 * A catalogue, not a behavior owner: CanonOverlay whitelists every key listed
 * here (STYLE_FIELDS) so a stored style survives a reload.
 */

import { WEAPON_TYPES } from './items.js';

const GUN_TIMING = ['cooldown', 'maxUses', 'reloadTime', 'reloadType'];
const SWING = ['windup', 'recovery', 'patternSpeed', 'range'];

export const WEAPON_STYLES = {
  [WEAPON_TYPES.GUN]: [
    { name: 'STEADY', reference: '¬', from: [['¬', [...GUN_TIMING, 'accuracy']]] },
    { name: 'WILD', reference: 'X', from: [['X', [...GUN_TIMING, 'accuracy', 'inaccuracy']]] },
    { name: 'SHARPSHOOTER', reference: '⊸', from: [['⊸', [...GUN_TIMING, 'bulletSpeed']]],
      set: { accuracy: 1, inaccuracy: 0 } },
    { name: 'SCATTER', reference: 'ᛉ', from: [['ᛉ', [...GUN_TIMING, 'accuracy', 'bulletCount', 'bulletRange']]] },
    { name: 'KEEN', reference: '⋔', from: [['¬', [...GUN_TIMING, 'accuracy']], ['⋔', ['keenAim']]] },
    { name: 'PIERCING', reference: 'ᛏ', from: [['¬', [...GUN_TIMING, 'accuracy']], ['ᛏ', ['pierce']]] },
    { name: 'BOUNCING', reference: 'ᚱ', from: [['ᚱ', [...GUN_TIMING, 'ricochet', 'maxRicochets']]] },
    { name: 'CURSED', reference: '⌭', from: [['⌭', ['cooldown', 'maxUses', 'accuracy', 'bulletChar', 'bulletRange',
      'loopOmega', 'loopRadius', 'loopLinearSpeed', 'onHit', 'plagueBurst']]] },
  ],
  [WEAPON_TYPES.MELEE]: [
    { name: 'BALANCED', reference: '†', from: [['†', SWING]] },
    { name: 'QUICK', reference: '↾', from: [['↾', SWING]] },
    { name: 'HEAVY', reference: 'ᛖ', from: [['ᛖ', SWING]] },
    { name: 'LONG', reference: '⫯', from: [['⫯', [...SWING, 'drawScale', 'critChance']]] },
    { name: 'KEEN', reference: '↿', from: [['↿', [...SWING, 'keenAim', 'keenAimCells']]] },
    // THIRSTY and CURSED outlived their shipped sources (Vampire Dagger, Venom
    // Blade — cut in the mental-load pass), so their stats are set here; the
    // traits stay authorable and their keys stay in STYLE_FIELDS.
    { name: 'THIRSTY', reference: '↾', from: [],
      set: { windup: 0.4, recovery: 0.6, patternSpeed: 0.05, range: 20, lifesteal: 1.0 } },
    { name: 'WILD', reference: 'ᛠ', from: [['ᛠ', [...SWING, 'randomOnHit']]] },
    { name: 'CURSED', reference: '🜕', from: [],
      set: { windup: 0.75, recovery: 0.15, patternSpeed: 0.05, range: 24, onHit: 'poison', poisonStacks: true } },
  ],
};

/** Every stat key any style writes. */
export const STYLE_FIELDS = [...new Set(Object.values(WEAPON_STYLES).flatMap(styles =>
  styles.flatMap(style => [...style.from.flatMap(([, keys]) => keys), ...Object.keys(style.set || {})])))];
