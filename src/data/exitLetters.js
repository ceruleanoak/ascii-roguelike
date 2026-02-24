// Exit letter definitions (independent of zone colors)
// Letters represent room types/semantics, colors are assigned dynamically by zone

export const EXIT_LETTERS = {
  // Special room types
  'B': {
    name: 'Boss',
    roomType: 'BOSS',
    weight: 0.03,
    zoneBoosts: {
      gray: 10,
      red: 3.3
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

  // Generic combat letters (work in any zone)
  'X': {
    name: 'Crossroads',
    roomType: 'COMBAT',
    weight: 0.20
  },
  'V': {
    name: 'Valley',
    roomType: 'COMBAT',
    weight: 0.15,
    zoneBoosts: {
      gray: 5
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

  // Pattern/secret letters (rare)
  'A': {
    name: 'Ascent',
    roomType: 'COMBAT',
    weight: 0.01,
    zoneBoosts: {
      gray: 10
    }
  },
  'D': {
    name: 'Descent',
    roomType: 'COMBAT',
    weight: 0.01,
    zoneBoosts: {
      gray: 15
    }
  },
  'E': {
    name: 'East Path',
    roomType: 'COMBAT',
    weight: 0.01,
    zoneBoosts: {
      gray: 10
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
  'O': {
    name: 'Opening',
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
  }
};

// Secret letter sequences (unchanged from exits.js)
export const SECRET_PATTERNS = {
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
