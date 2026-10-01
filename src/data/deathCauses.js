// Death causes for kills no attacker can be credited with — the environment
// itself. A damage source that has no `attacker` names one of these as its
// `cause` (see PlayerDamageSystem.applyDamage), and the REST tombstone reads
// "ended by <name>" from it exactly as it does for an enemy.
//
// Same shape deathCauseOf() reads off an enemy: name, char, color, description.
// `char` is ledger-only (the tombstone draws no glyph for the cause), and is
// printable ASCII like every other environment glyph.
export const DEATH_CAUSES = {
  lava: {
    name: 'Lava',
    char: '~',
    color: '#ff4400',
    description: 'Burns for as long as you stand in it.'
  },
  drowning: {
    name: 'Deep Water',
    char: '~',
    color: '#3355cc',
    description: 'Holds you under once you have been in it too long.'
  },
  boulder: {
    name: 'Boulder',
    char: 'O',
    color: '#aaaaaa',
    description: 'Rolls through whatever is in its path.'
  },
  lightning: {
    name: 'Lightning',
    char: '!',
    color: '#ffff88',
    description: 'Marks the ground, then strikes it.'
  },
  electricity: {
    name: 'Electricity',
    char: '%',
    color: '#00ffff',
    description: 'Runs through water, and through anything standing in it.'
  },
  burn: {
    name: 'Fire',
    char: '^',
    color: '#ff4400',
    description: 'Keeps burning after the flame is gone.'
  },
  poison: {
    name: 'Poison',
    char: ';',
    color: '#8a9a2e',
    description: 'Keeps working long after the bite.'
  }
};
