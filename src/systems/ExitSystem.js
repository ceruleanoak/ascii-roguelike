import { EXIT_LETTERS, SECRET_PATTERNS } from '../data/exitLetters.js';
import { ZONES, ZONE_COLORS } from '../data/zones.js';

export class ExitSystem {
  constructor(zoneSystem) {
    this.zoneSystem = zoneSystem;
  }

  generateExits(currentDepth, roomType, zoneType, progressionColor = null) {
    // Generate 3 UNIQUE letters (no duplicates)
    const letters = [];
    const maxAttempts = 50; // Prevent infinite loop

    for (let i = 0; i < 3; i++) {
      let attempts = 0;
      let letter;

      do {
        letter = this.selectExitLetter(currentDepth, zoneType);
        attempts++;

        // Special rule: 'O' (Ocean) cannot be a west exit
        // (entering from west would place player in the ocean)
        if (i === 2 && letter === 'O') {
          continue; // Reroll if Ocean selected for west exit
        }

      } while ((letters.includes(letter) || (i === 2 && letter === 'O')) && attempts < maxAttempts);

      letters.push(letter);
    }

    // Assign colors based on zone and progression state
    const colors = this.assignExitColors(letters, zoneType, progressionColor);

    // Return exit objects with letter + color
    const exits = {
      north: { letter: letters[0], color: colors[0] },
      east: { letter: letters[1], color: colors[1] },
      west: { letter: letters[2], color: colors[2] },
      south: zoneType !== 'gray'  // South is boolean (return to REST)
    };

    return exits;
  }

  selectExitLetter(depth, zoneType) {
    const weights = this.getLetterWeightsForZone(zoneType, depth);
    return this.weightedRandomChoice(weights);
  }

  assignExitColors(letters, zoneType, progressionColor = null) {
    const zone = ZONES[zoneType];
    const colors = [zone.exitColor, zone.exitColor, zone.exitColor];

    // Gray zone: all exits gray (no alternatives)
    if (zone.alternativeZones.length === 0) {
      return colors;
    }

    // Pick 1 random exit for alternative color
    const altIndex = Math.floor(Math.random() * 3);

    if (progressionColor && progressionColor !== zone.exitColor) {
      // Mid-progression: use progression color
      colors[altIndex] = progressionColor;
    } else {
      // No progression: use random alternative
      const altZone = zone.alternativeZones[Math.floor(Math.random() * zone.alternativeZones.length)];
      colors[altIndex] = ZONE_COLORS[altZone];
    }

    return colors;
  }

  getLetterWeightsForZone(zoneType, depth) {
    const weights = {};

    // Build weights from EXIT_LETTERS
    for (const [letter, data] of Object.entries(EXIT_LETTERS)) {
      let weight = data.weight;

      // Apply zone boosts if defined
      if (data.zoneBoosts && data.zoneBoosts[zoneType]) {
        weight *= data.zoneBoosts[zoneType];
      }

      // Increase boss chance at higher depths
      if (letter === 'B' && depth >= 5) {
        weight *= 2;
      }

      weights[letter] = weight;
    }

    return weights;
  }

  checkSecretPattern(pathHistory) {
    if (!pathHistory || pathHistory.length < 3) return null;

    // Check entire path history for pattern matches (not just recent letters)
    // Patterns can be discovered later even if first few rooms were random
    const fullPath = pathHistory.join('-');

    for (const [pattern, data] of Object.entries(SECRET_PATTERNS)) {
      // Check if pattern appears anywhere in the full path
      if (fullPath.includes(pattern)) {
        // Only trigger once per pattern (check if we just completed it)
        const patternLength = pattern.split('-').length;
        const lastNLetters = pathHistory.slice(-patternLength).join('-');

        if (lastNLetters === pattern) {
          return { pattern, ...data };
        }
      }
    }
    return null;
  }

  weightedRandomChoice(weights) {
    const total = Object.values(weights).reduce((a, b) => a + b, 0);
    let random = Math.random() * total;

    for (const [letter, weight] of Object.entries(weights)) {
      random -= weight;
      if (random <= 0) return letter;
    }
    return 'X'; // Fallback to Crossroads
  }

  checkSecretPattern(pathHistory) {
    if (!pathHistory || pathHistory.length < 3) return null;

    // Extract letters from exit objects
    const letterPath = pathHistory.map(exit => exit.letter);
    const fullPath = letterPath.join('-');

    for (const [pattern, data] of Object.entries(SECRET_PATTERNS)) {
      if (fullPath.includes(pattern)) {
        const patternLength = pattern.split('-').length;
        const lastNLetters = letterPath.slice(-patternLength).join('-');

        if (lastNLetters === pattern) {
          return { pattern, ...data };
        }
      }
    }
    return null;
  }
}
