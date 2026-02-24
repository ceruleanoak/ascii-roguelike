export const CHARACTER_TYPES = {
  'default': {
    name: 'Default',
    color: '#00ffff',
    rollType: 'dodge',
    rollDuration: 0.15,
    rollCooldown: 0.5,
    rollSpeed: 600,
    weaponAffinities: {} // No bonuses
  },
  'green': {
    name: 'Green Ranger',
    color: '#00ff00',
    rollType: 'dodge',
    rollDuration: 0.18,
    rollCooldown: 0.45,
    rollSpeed: 580,
    weaponAffinities: {
      'ranged': { damageBonus: 0.15 } // 15% bonus ranged damage
    }
  },
  'red': {
    name: 'Red Warrior',
    color: '#ff4444',
    rollType: 'damage', // Leaves damaging trail
    rollDuration: 0.2,
    rollCooldown: 0.6,
    rollSpeed: 550,
    weaponAffinities: {
      'melee': { windupReduction: 0.2 } // 20% faster melee windup
    }
  },
  'cyan': {
    name: 'Cyan Rogue',
    color: '#44ffff',
    rollType: 'hide', // Invisibility during roll
    rollDuration: 0.25,
    rollCooldown: 0.4,
    rollSpeed: 650,
    weaponAffinities: {
      'bow': { cooldownReduction: 0.15 } // 15% faster bow fire rate
    }
  },
  'yellow': {
    name: 'Yellow Mage',
    color: '#ffff44',
    rollType: 'blink', // Instant teleport
    rollDuration: 0, // Instant
    rollCooldown: 0.8,
    rollSpeed: 0, // Teleports instantly
    weaponAffinities: {
      'gun': { fireRateBonus: 0.2 } // 20% faster gun fire rate
    }
  },
  'gray': {
    name: 'Gray Assassin',
    color: '#888888',
    rollType: 'dodge',
    rollDuration: 0.12, // Faster dodge
    rollCooldown: 0.35,
    rollSpeed: 700,
    weaponAffinities: {
      'trap': { additionalCharge: 1 } // +1 trap capacity (if traps exist)
    }
  }
};
