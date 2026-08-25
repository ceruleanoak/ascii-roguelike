/**
 * Green-zone dungeon-boss spec — the Hoardmaw encounter data
 * (claudedocs/dungeon-boss-green.md). Tuning lives on the entity
 * (src/entities/Hoardmaw.js); this file carries the zone-flavored content
 * other zones will vary under the shared DungeonBossSystem template:
 * temptation tables, register-window currencies, payout shape, hint line.
 *
 * Template spine every zone follows: three phases · three soft Legend-of-
 * Three register windows · one temptation finale won by refusing · one Game
 * Changer. Yellow/red/cyan specs are future data, not new systems.
 */

export const GREEN_HOARDMAW_SPEC = {
  id: 'green_hoardmaw',
  zone: 'green',

  // Phase-3 bribe: what the mound offers (raw greed — the currency the whole
  // zone runs on). Each offer scatters a handful beside the maw's mouth.
  bribeLoot: { char: 'c', count: 8 },

  // Justice register: raw coins only (ratified — Infused Coin stays a
  // crafting component). A tossed coin landing in the seam cell during gape
  // staggers the maw.
  justiceCurrency: 'c',

  // Help register: ground bread within lunge reach redirects a lunge beat.
  helpDecoyChar: '⌬',

  // Truth register: carried Compass pulses toward the true glint (extends
  // the Compass's existing dungeon-beep scope; ADR-backlog 2026-08-13).
  truthItemChar: '⌖',

  // Chipped scales mint coins on collection — the closed greed loop.
  scalePickup: { char: '$', mintCoin: 'c' },

  // WiseFellow rare saying unlocked on first win (zones.js rareSayings slot).
  victorySaying: 'THE HOARD YIELDS TO AN EMPTY HAND',

  // Payout shower on defeat: coin burst, a rarity-weighted gemstone roll, one
  // tiered weapon from the generic pool (gear from the delvers it swallowed),
  // and guaranteed mana (#215's boss-tier flag fix is what makes the Miniboss
  // side of this contract hold; the maw's own shower is authored here).
  payout: {
    coinBurst: 14,
    gemChance: 0.6,
    weaponAffinities: ['generic'],
    guaranteedMana: true,
  },
};
