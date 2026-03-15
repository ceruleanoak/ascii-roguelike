import { ZONES, ZONE_COLORS } from '../data/zones.js';

// Utility function to blend two hex colors
function blendColors(color1, color2, percent) {
  // percent = 0 means 100% color1, percent = 1 means 100% color2
  const parseHex = (hex) => {
    const clean = hex.replace('#', '');
    return {
      r: parseInt(clean.substring(0, 2), 16),
      g: parseInt(clean.substring(2, 4), 16),
      b: parseInt(clean.substring(4, 6), 16)
    };
  };

  const c1 = parseHex(color1);
  const c2 = parseHex(color2);

  const r = Math.round(c1.r + (c2.r - c1.r) * percent);
  const g = Math.round(c1.g + (c2.g - c1.g) * percent);
  const b = Math.round(c1.b + (c2.b - c1.b) * percent);

  const toHex = (n) => {
    const hex = n.toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export class ZoneSystem {
  constructor() {
    this.currentZone = 'green'; // Default starting zone
    this.pathHistory = []; // Last 10 exit choices (objects with {letter, color})
    this.roomsSinceRest = 0;

    // Gray zone unlock tracking (green zone only)
    this.consecutiveGreenRooms = 0;

    // Per-zone captive tracking
    this.lastColoredZone = null; // Track last colored zone (red/cyan/yellow)
    this.roomsClearedInCurrentZone = 0; // Rooms cleared in current colored zone
    this.clearedZones = new Set(); // Zones that have given their captive

    // Leshy chase tracking (green zone only)
    this.leshyChaseActive = false;
    this.leshyChaseCount = 0;
    this.leshyLastExitDirection = null; // 'north', 'east', 'west'
  }

  recordExit(exitObject) {
    this.pathHistory.push({
      letter: exitObject.letter,
      color: exitObject.color
    });
    if (this.pathHistory.length > 10) {
      this.pathHistory.shift(); // Keep only last 10
    }
  }

  checkZoneTransition() {
    // Gray zone: 10 consecutive rooms in green zone only
    if (this.consecutiveGreenRooms >= 10) {
      return 'gray';
    }

    // Color matching: 3 consecutive same color
    if (this.pathHistory.length >= 3) {
      const last3Colors = this.pathHistory.slice(-3).map(exit => exit.color);

      if (last3Colors.every(c => c === ZONE_COLORS.red)) return 'red';
      if (last3Colors.every(c => c === ZONE_COLORS.cyan)) return 'cyan';
      if (last3Colors.every(c => c === ZONE_COLORS.yellow)) return 'yellow';
    }

    return 'green'; // Default
  }

  getProgressionColor() {
    const currentZone = this.checkZoneTransition();
    const currentZoneColor = ZONES[currentZone].exitColor;

    if (this.pathHistory.length === 0) return null;

    // Check last 1-2 exits for progression pattern
    const last2 = this.pathHistory.slice(-2);

    // If last 2 both same non-zone color → mid-progression
    if (last2.length === 2 &&
        last2[0].color === last2[1].color &&
        last2[0].color !== currentZoneColor) {
      return last2[0].color;
    }

    // If last 1 is non-zone color → started progression
    const last1 = this.pathHistory[this.pathHistory.length - 1];
    if (last1.color !== currentZoneColor) {
      return last1.color;
    }

    return null; // No active progression
  }

  // Get progression blend data for visual transitions
  // Returns: { targetZone: string, blendPercent: number } or null
  getProgressionBlend() {
    const currentZone = this.checkZoneTransition();
    const currentZoneColor = ZONES[currentZone].exitColor;

    if (this.pathHistory.length === 0) {
      return null;
    }

    // Count consecutive matching colored exits (max 3 for full transition)
    let consecutiveCount = 0;
    let targetColor = null;

    for (let i = this.pathHistory.length - 1; i >= 0 && i >= this.pathHistory.length - 3; i--) {
      const exitColor = this.pathHistory[i].color;

      // Skip if it matches current zone (not a progression)
      if (exitColor === currentZoneColor) {
        break;
      }

      // First colored exit or matching previous
      if (targetColor === null) {
        targetColor = exitColor;
        consecutiveCount = 1;
      } else if (exitColor === targetColor) {
        consecutiveCount++;
      } else {
        break; // Different color, stop counting
      }
    }

    if (consecutiveCount === 0 || targetColor === null) {
      return null;
    }

    // Find target zone name from color
    let targetZone = null;
    for (const [zoneName, zoneData] of Object.entries(ZONES)) {
      if (zoneData.exitColor === targetColor) {
        targetZone = zoneName;
        break;
      }
    }

    if (!targetZone) {
      return null;
    }

    // Calculate blend percentage:
    // 1 exit = 25%, 2 exits = 50%, 3 exits = full zone transition (handled by checkZoneTransition)
    const blendPercent = consecutiveCount === 1 ? 0.25 : consecutiveCount === 2 ? 0.5 : 1.0;

    return {
      targetZone,
      blendPercent
    };
  }

  incrementRoomCount() {
    this.roomsSinceRest++;

    // Track consecutive green zone rooms for gray zone unlock
    const currentZone = this.checkZoneTransition();
    if (currentZone === 'green') {
      this.consecutiveGreenRooms++;
    } else if (currentZone !== 'gray') {
      // Reset counter if entering colored zone (red/cyan/yellow)
      // Don't reset if already in gray zone (allow staying in gray)
      this.consecutiveGreenRooms = 0;
    }
  }

  recordRoomClear(currentZone) {
    // Track captive progress based on current zone border color (where you ARE)
    // Not based on exit color - zone transitions happen after 3 consecutive colored exits
    // All zones except gray have captive tracking
    if (currentZone !== 'gray') {
      // If we entered a different zone, reset counter
      if (currentZone !== this.lastColoredZone) {
        this.lastColoredZone = currentZone;
        this.roomsClearedInCurrentZone = 0;
      }

      // Increment counter for current zone
      this.roomsClearedInCurrentZone++;
    }
  }

  shouldSpawnCaptive(currentZone) {
    // Gray zone doesn't have captive tracking
    if (currentZone === 'gray') {
      return false;
    }

    // Must have cleared 5 rooms in this zone
    if (this.roomsClearedInCurrentZone < 5) {
      return false;
    }

    // Must not have already rescued captive from this zone
    if (this.clearedZones.has(currentZone)) {
      return false;
    }

    return true;
  }

  markZoneCleared(currentZone) {
    this.clearedZones.add(currentZone);
  }

  resetOnRest() {
    this.roomsSinceRest = 0;
    this.consecutiveGreenRooms = 0; // Reset gray zone progress on rest
    this.currentZone = 'green';
    this.lastColoredZone = null;
    this.roomsClearedInCurrentZone = 0;
    this.resetLeshyChase(); // Reset chase tracking on rest
    // pathHistory persists (allows for letter pattern secrets)
    // clearedZones persists (captive rescues are permanent per run)
  }

  resetOnDeath() {
    // Full reset for new run
    this.roomsSinceRest = 0;
    this.consecutiveGreenRooms = 0;
    this.currentZone = 'green';
    this.pathHistory = [];
    this.lastColoredZone = null;
    this.roomsClearedInCurrentZone = 0;
    this.clearedZones.clear(); // Clear captive progress
    this.resetLeshyChase(); // Reset chase tracking on death
  }

  // Get blended environment colors for current zone with progression
  getBlendedEnvironmentColors(currentZone) {
    const progressionBlend = this.getProgressionBlend();

    // No progression - return current zone colors as-is
    if (!progressionBlend) {
      return ZONES[currentZone].environmentColors;
    }

    // Blend between current zone and target zone
    const currentColors = ZONES[currentZone].environmentColors;
    const targetColors = ZONES[progressionBlend.targetZone].environmentColors;
    const percent = progressionBlend.blendPercent;

    return {
      grass: blendColors(currentColors.grass, targetColors.grass, percent),
      tree: blendColors(currentColors.tree, targetColors.tree, percent),
      background: blendColors(currentColors.background, targetColors.background, percent)
    };
  }

  // ===== Leshy Chase System (Green Zone Secret) =====

  /**
   * Start tracking a Leshy chase event
   * @param {string} exitDirection - 'north', 'east', or 'west'
   */
  startLeshyChase(exitDirection) {
    this.leshyChaseActive = true;
    this.leshyLastExitDirection = exitDirection;
  }

  /**
   * Record whether player followed Leshy through exit
   * @param {boolean} playerFollowed - true if player took same exit as Leshy
   * @returns {string} - 'leshyGrove' (3rd chase), 'continue' (1st/2nd chase), or 'failed' (wrong exit)
   */
  recordLeshyChase(playerFollowed) {
    if (!this.leshyChaseActive) {
      return 'failed';
    }

    if (playerFollowed) {
      this.leshyChaseCount++;

      if (this.leshyChaseCount >= 3) {
        // 3rd consecutive chase - trigger Leshy Grove
        this.resetLeshyChase(); // Reset after successful grove entry
        return 'leshyGrove';
      } else {
        // 1st or 2nd chase - continue tracking
        return 'continue';
      }
    } else {
      // Player took different exit - chase failed, completely reset
      this.resetLeshyChase();
      return 'failed';
    }
  }

  /**
   * Reset all Leshy chase tracking
   */
  resetLeshyChase() {
    this.leshyChaseActive = false;
    this.leshyChaseCount = 0;
    this.leshyLastExitDirection = null;
  }

  /**
   * Check if a shaking bush should spawn in this room
   * @param {string} zone - Current zone name
   * @param {boolean} cleared - Whether room is cleared
   * @returns {boolean} - true if shaking bush should spawn
   */
  shouldSpawnShakingBush(zone, cleared) {
    // Only in green zone, only in cleared rooms, not during active chase
    if (zone !== 'green' || !cleared || this.leshyChaseActive) {
      return false;
    }

    return Math.random() < 0.2;
  }

  getCurrentZoneDepth(zoneDepths) {
    return zoneDepths[this.currentZone] || 0;
  }

  incrementZoneDepth(zoneDepths) {
    const zone = this.currentZone;
    if (zoneDepths[zone] === 0) {
      zoneDepths[zone] = 1;
    } else {
      zoneDepths[zone]++;
    }
  }

  // Serialization for persistence
  toJSON() {
    return {
      currentZone: this.currentZone,
      pathHistory: this.pathHistory,
      roomsSinceRest: this.roomsSinceRest,
      consecutiveGreenRooms: this.consecutiveGreenRooms,
      lastColoredZone: this.lastColoredZone,
      roomsClearedInCurrentZone: this.roomsClearedInCurrentZone,
      clearedZones: Array.from(this.clearedZones)
    };
  }

  fromJSON(data) {
    this.currentZone = data.currentZone || 'green';
    this.pathHistory = data.pathHistory || [];
    this.roomsSinceRest = data.roomsSinceRest || 0;
    this.consecutiveGreenRooms = data.consecutiveGreenRooms || 0;
    this.lastColoredZone = data.lastColoredZone || null;
    this.roomsClearedInCurrentZone = data.roomsClearedInCurrentZone || 0;
    this.clearedZones = new Set(data.clearedZones || []);
  }
}
