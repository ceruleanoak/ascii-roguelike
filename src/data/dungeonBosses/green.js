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

  // Phase-3 Temptation: the corner coin pile — raw greed (the currency the
  // whole zone runs on), left sitting in a room corner while the boss stands
  // fully passive. One-time spawn, no refusal loop — touching it punishes,
  // ignoring it and finishing the boss is the win.
  temptationPile: { char: 'c', count: 6 },

  // Help register: ground bread within lunge reach redirects a lunge beat.
  helpDecoyChar: '⌬',

  // Truth register: carried Compass brightens while the Vulnerable Window is
  // open (extends the Compass's existing dungeon-beep scope; ADR-backlog
  // 2026-08-13).
  truthItemChar: '⌖',

  // Chipped scales mint coins on collection — the closed greed loop.
  scalePickup: { char: '$', mintCoin: 'c' },

  // WiseFellow rare saying unlocked on first win (zones.js rareSayings slot).
  victorySaying: 'THE HOARD YIELDS TO AN EMPTY HAND',

  // Payout shower on defeat: a rarity-weighted gemstone roll, one tiered
  // weapon from the generic pool (gear from the delvers it swallowed), and
  // guaranteed mana (#215's boss-tier flag fix is what makes the Miniboss
  // side of this contract hold; the maw's own shower is authored here). No
  // coin drop — that was a leftover from the scrapped throwable-coin design;
  // coin currency is earned in-fight via scale chipping, not at the corpse.
  payout: {
    gemChance: 0.6,
    weaponAffinities: ['generic'],
    guaranteedMana: true,
  },
};
