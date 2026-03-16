// Exit letter definitions (independent of zone colors)
// Letters represent room types/semantics, colors are assigned dynamically by zone

// Vowels form a distinct category for the secret-sequence system.
// When two-tier exit selection is implemented, the vowel pool will draw
// from this category weight before individual vowel weights are applied.
export const VOWEL_CATEGORY_WEIGHT = 2.5;

export const EXIT_LETTERS = {
  // ── Special room types ──────────────────────────────────────────────────
  'B': {
    name: 'Boss',
    roomType: 'BOSS',
    weight: 0.10,
    zoneBoosts: {
      gray: 3,
      red: 1
    }
  },
  'C': {
    name: 'Camp',
    roomType: 'CAMP',
    weight: 0.07
  },
  '?': {
    name: 'Mystery',
    roomType: 'DISCOVERY',
    weight: 0.05
  },

  // ── Generic combat consonants ────────────────────────────────────────────
  'X': {
    name: 'Crossroads',
    roomType: 'COMBAT',
    weight: 0.20
  },
  'V': {
    name: 'Vault',
    roomType: 'COMBAT',
    weight: 0.05,
    zoneBoosts: {
      gray: 3,
      red: 2
    }
  },
  'P': {
    name: 'Peak',
    roomType: 'COMBAT',
    weight: 0.15
  },
  'T': {
    name: 'Tunnel',
    roomType: 'COMBAT',
    weight: 0.15
  },
  'R': {
    name: 'Ridge',
    roomType: 'COMBAT',
    weight: 0.10
  },

  // ── Pattern / secret consonants (rare) ──────────────────────────────────
  'D': {
    name: 'Descent',
    roomType: 'COMBAT',
    weight: 0.01,
    zoneBoosts: {
      gray: 15
    }
  },
  'N': {
    name: 'North Path',
    roomType: 'COMBAT',
    weight: 0.01,
    zoneBoosts: {
      gray: 10
    }
  },
  'S': {
    name: 'South Path',
    roomType: 'COMBAT',
    weight: 0.01,
    zoneBoosts: {
      gray: 10
    }
  },
  'W': {
    name: 'West Path',
    roomType: 'COMBAT',
    weight: 0.01,
    zoneBoosts: {
      gray: 5
    }
  },
  'G': {
    name: 'Gate',
    roomType: 'COMBAT',
    weight: 0.01
  },
  'K': {
    name: 'Key Room',
    roomType: 'COMBAT',
    weight: 0.08,
    zoneBoosts: {
      green: 2,
      cyan: 1.5
    }
  },

  // ── Hut room ─────────────────────────────────────────────────────────────
  'H': {
    name: 'Hut',
    roomType: 'COMBAT',
    weight: 0.08,
    zoneBoosts: {
      green: 1.5,
      yellow: 1.2
    }
  },

  // ── Dungeon room ─────────────────────────────────────────────────────────
  'D': {
    name: 'Dungeon',
    roomType: 'COMBAT',
    weight: 0.1,
    zoneBoosts: {
      gray: 2.0,
      red: 1.5
    }
  },

  // ── Lake room ────────────────────────────────────────────────────────────
  'L': {
    name: 'Lake',
    roomType: 'COMBAT',
    weight: 0.10,
    zoneBoosts: {
      green: 2.0,
      cyan: 1.5
    }
  },

  // ── Vowels (vowel: true — used by secret-sequence system) ────────────────
  // Combined category weight: VOWEL_CATEGORY_WEIGHT (2.5)
  // Individual weights reflect relative frequency within the vowel pool.
  'A': {
    name: 'Ascent',
    roomType: 'COMBAT',
    weight: 0.30,
    vowel: true
  },
  'E': {
    name: 'Errand',       // Future implementation
    roomType: 'COMBAT',
    weight: 0.20,
    vowel: true
  },
  'I': {
    name: 'Island',
    roomType: 'COMBAT',
    weight: 0.10,
    vowel: true
  },
  'O': {
    name: 'Ocean',
    roomType: 'COMBAT',
    weight: 0.10,
    vowel: true
  },
  'U': {
    name: 'Underground',  // Future implementation
    roomType: 'COMBAT',
    weight: 0.10,
    vowel: true
  }
};

// Secret letter sequences (unchanged from exits.js)
export const SECRET_PATTERNS = {
  'B-A-T': {
    name: 'Bat Belfry',
    rewardType: 'bat_belfry',
    message: 'The darkness swirls with wings...'
  },
  'B-A-D': {
    name: 'Evil Path',
    rewardType: 'cursed_chest',
    message: 'You feel a dark presence...'
  },
  'G-O-O-D': {
    name: 'Blessed Path',
    rewardType: 'holy_chest',
    message: 'Divine light surrounds you...'
  },
  'N-E-W': {
    name: 'Fresh Start',
    rewardType: 'rare_ingredient',
    message: 'Something stirs in the grass...'
  },
  'D-E-A-D': {
    name: 'Death\'s Door',
    rewardType: 'gray_zone_hint',
    message: 'The realm of the dead beckons...'
  }
};
