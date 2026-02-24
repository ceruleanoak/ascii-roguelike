import { ZONES, ZONE_COLORS } from '../data/zones.js';

export class ZoneSystem {
  constructor() {
    this.currentZone = 'green'; // Default starting zone
    this.pathHistory = []; // Last 10 exit choices (objects with {letter, color})
    this.roomsSinceRest = 0;

    // Per-zone captive tracking
    this.lastColoredZone = null; // Track last colored zone (red/cyan/yellow)
    this.roomsClearedInCurrentZone = 0; // Rooms cleared in current colored zone
    this.clearedZones = new Set(); // Zones that have given their captive
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
    // Gray zone: 10 rooms without rest
    if (this.roomsSinceRest >= 10) {
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

  incrementRoomCount() {
    this.roomsSinceRest++;
  }

  recordRoomClear(currentZone) {
    // Track captive progress based on current zone border color (where you ARE)
    // Not based on exit color - zone transitions happen after 3 consecutive colored exits
    // All zones except gray have captive tracking
    if (currentZone !== 'gray') {
      // If we entered a different zone, reset counter
      if (currentZone !== this.lastColoredZone) {
        console.log(`[ZoneSystem] Entered new zone: ${currentZone} (was: ${this.lastColoredZone || 'none'})`);
        this.lastColoredZone = currentZone;
        this.roomsClearedInCurrentZone = 0;
      }

      // Increment counter for current zone
      this.roomsClearedInCurrentZone++;
      console.log(`[ZoneSystem] Rooms cleared in ${currentZone} zone: ${this.roomsClearedInCurrentZone}`);
    } else {
      // In gray zone - don't track for captive purposes
      console.log(`[ZoneSystem] Room cleared in gray zone (no captive tracking)`);
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
      console.log(`[ZoneSystem] ${currentZone} zone already cleared (captive already rescued)`);
      return false;
    }

    return true;
  }

  markZoneCleared(currentZone) {
    this.clearedZones.add(currentZone);
    console.log(`[ZoneSystem] Marked ${currentZone} zone as cleared (captive rescued)`);
  }

  resetOnRest() {
    this.roomsSinceRest = 0;
    this.currentZone = 'green';
    this.lastColoredZone = null;
    this.roomsClearedInCurrentZone = 0;
    // pathHistory persists (allows for letter pattern secrets)
    // clearedZones persists (captive rescues are permanent per run)
  }

  resetOnDeath() {
    // Full reset for new run
    this.roomsSinceRest = 0;
    this.currentZone = 'green';
    this.pathHistory = [];
    this.lastColoredZone = null;
    this.roomsClearedInCurrentZone = 0;
    this.clearedZones.clear(); // Clear captive progress
  }

  // Serialization for persistence
  toJSON() {
    return {
      currentZone: this.currentZone,
      pathHistory: this.pathHistory,
      roomsSinceRest: this.roomsSinceRest,
      lastColoredZone: this.lastColoredZone,
      roomsClearedInCurrentZone: this.roomsClearedInCurrentZone,
      clearedZones: Array.from(this.clearedZones)
    };
  }

  fromJSON(data) {
    this.currentZone = data.currentZone || 'green';
    this.pathHistory = data.pathHistory || [];
    this.roomsSinceRest = data.roomsSinceRest || 0;
    this.lastColoredZone = data.lastColoredZone || null;
    this.roomsClearedInCurrentZone = data.roomsClearedInCurrentZone || 0;
    this.clearedZones = new Set(data.clearedZones || []);
  }
}
