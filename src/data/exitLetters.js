// Exit letter definitions (independent of zone colors)
// Letters represent room types/semantics, colors are assigned dynamically by zone

// Vowels form a distinct category for the secret-sequence system.
// When two-tier exit selection is implemented, the vowel pool will draw
// from this category weight before individual vowel weights are applied.
export const VOWEL_CATEGORY_WEIGHT = 2.5;

export const EXIT_LETTERS = {
  'A': {
    name: 'Ascent',
    roomType: 'ASCENT',
    weight: 0.30,
    vowel: true,
    spellDescription: 'THE SEEKER PATH.'
  },
  'B': {
    name: 'Boss',
    roomType: 'BOSS',
    weight: 0.10,
    zoneBoosts: {
      gray: 3,
      red: 1
    },
    spellDescription: 'ARE YOU PREPARED?'
  },
  'C': {
    name: 'Camp',
    roomType: 'CAMP',
    weight: 0.07,
    spellDescription: 'THE PATH OF WEAKNESS.'
  },
  'D': {
    name: 'Dungeon',
    roomType: 'DUNGEON',
    weight: 0.1,
    zoneBoosts: {
      gray: 2.0,
      red: 1.5
    },
    spellDescription: 'SEEK THE THIRD STAIR.'
  },
  'E': {
    name: 'Errand',
    roomType: 'COMBAT',
    weight: 0.20,
    vowel: true,
    spellDescription: 'THE SERVANT PATH.'
  },
  // Weight is zero — the only way to encounter an 'F' exit is for a fairy to
  // dust an existing exit. The entry exists so RoomGenerator + the renderer
  // recognize F as a valid letter when it appears via mutation.
  'F': {
    name: 'Fountain',
    roomType: 'FOUNTAIN',
    weight: 0,
    spellDescription: 'A FAIRY GIFT.'
  },
  'G': {
    name: 'Grass',
    roomType: 'COMBAT',
    weight: 0.10,
    zoneBoosts: {
      green: 1.8,
      yellow: 0,
      red: 0,
      cyan: 0,
      gray: 0
    },
    spellDescription: 'HIDDEN IN THE BLADES.'
  },
  'H': {
    name: 'Hut',
    roomType: 'HUT',
    weight: 0.12,
    zoneBoosts: {
      green: 1.5,
      yellow: 1.2
    },
    spellDescription: 'A HUT OF BROWN.'
  },
  'I': {
    name: 'Island',
    roomType: 'COMBAT',
    weight: 0.10,
    vowel: true,
    spellDescription: 'THE HOARDER PATH.'
  },
  'K': {
    name: 'Key Room',
    roomType: 'COMBAT',
    weight: 0.08,
    zoneBoosts: {
      green: 2,
      cyan: 1.5
    },
    spellDescription: 'A GLIMMERING KEY.'
  },
  'L': {
    name: 'Lake',
    roomType: 'COMBAT',
    weight: 0.10,
    zoneBoosts: {
      green: 2.0,
      cyan: 1.5
    },
    spellDescription: 'BEWARE THE RUSALKA.'
  },
  'M': {
    name: 'Maze',
    roomType: 'MAZE',
    weight: 0.08,
    zoneBoosts: {
      yellow: 1.3,
      red: 1.2,
      cyan: 2.0
    },
    spellDescription: 'A TRAP FOR FOOLS.'
  },
  'O': {
    name: 'Ocean',
    roomType: 'COMBAT',
    weight: 0.10,
    vowel: true,
    spellDescription: 'THE MARINER PATH.'
  },
  'P': {
    name: 'Puzzle',
    roomType: 'PUZZLE',
    weight: 0.05,
    zoneBoosts: {
      green: 1.5,
      yellow: 1.5,
      red: 0,
      cyan: 0,
      gray: 0
    },
    spellDescription: 'THE STONES REMEMBER.'
  },
  'Q': {
    name: 'Quagmire',
    roomType: 'COMBAT',
    // Rare and green-only: low base weight, all non-green boosts zeroed.
    weight: 0.04,
    zoneBoosts: {
      green: 1.5,
      yellow: 0,
      red: 0,
      cyan: 0,
      gray: 0
    },
    spellDescription: 'THE MIRE REMEMBERS HER.'
  },
  'R': {
    name: 'Ridge',
    roomType: 'RIDGE',
    weight: 0.10,
    spellDescription: 'HIGH GROUND AHEAD.'
  },
  'S': {
    name: 'Settlement',
    roomType: 'SETTLEMENT',
    weight: 0.10,
    zoneBoosts: {
      green: 1.5,
      yellow: 1.2
    },
    spellDescription: 'WHERE PATHS GATHER.'
  },
  'T': {
    name: 'Tunnel',
    roomType: 'TUNNEL',
    weight: 0.15,
    spellDescription: 'BURROW AND HIDE.'
  },
  'U': {
    name: 'Underground',
    roomType: 'UNDERGROUND',
    weight: 0.10,
    vowel: true,
    spellDescription: 'THE MAGE PATH.'
  },
  'V': {
    name: 'Vault',
    roomType: 'COMBAT',
    weight: 0.05,
    zoneBoosts: {
      gray: 3,
      red: 2
    },
    spellDescription: 'A SIMPLE LOCK.'
  },
  'W': {
    name: 'Well',
    roomType: 'WELL',
    weight: 0.06,
    zoneBoosts: {
      green: 1.5,
      cyan: 1.3
    },
    spellDescription: 'A WISH FOR MORE.'
  },
  'X': {
    name: 'Crossroads',
    roomType: 'COMBAT',
    weight: 0.20,
    spellDescription: 'MANY PATHS CROSS.'
  },
  '?': {
    name: 'Mystery',
    roomType: 'DISCOVERY',
    weight: 0.05,
    spellDescription: 'QUESTIONABLE.'
  },

  // ── Blue-zone (Tidefall) tutorial rooms ──────────────────────────────────
  // Weight 0: these only appear via the linear blue-zone progression (driven
  // by game.blueZoneRoom in main.js), never via the normal weighted picker.
  // The '~' entry exit is opened by the pearl pedestal in an Ocean room
  // (main.js handlePearlPedestalSpace).
  '~': {
    name: 'Shallows',
    roomType: 'COMBAT',
    weight: 0,
    spellDescription: 'THE TIDE HAS PARTED.'
  },
  '⌇': {
    name: 'Reef Walk',
    roomType: 'COMBAT',
    weight: 0,
    spellDescription: 'STEP WHERE NO PATH IS.'
  },
  '⌒': {
    name: 'Wake Drift',
    roomType: 'COMBAT',
    weight: 0,
    spellDescription: 'LEAVE A LIVE TRAIL.'
  },
  '◌': {
    name: 'Pearl Cache',
    roomType: 'CAMP',
    weight: 0,
    spellDescription: 'THE GIFT OF THE DEEP.'
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
  },
  'D-R-A-W': {
    name: 'Gallery',
    neutralScript: 'drawRoom',
    message: 'A blank canvas awaits.'
  }
};
