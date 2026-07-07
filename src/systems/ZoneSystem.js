import { ZONES, ZONE_COLORS } from '../data/zones.js';
import { ROOM_TYPES } from '../game/GameConfig.js';

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

    // River-follow chase tracking (yellow zone only) — independent of Leshy's
    // fields above; tracks a distinct trigger (matching a room's river flow
    // direction on exit) and must not cross-contaminate with Leshy's state.
    this.riverChaseActive = false;
    this.riverChaseCount = 0;
    this.riverLastExitDirection = null; // 'north', 'east', 'west'

    // Boss tracking — persists for the entire run
    this.defeatedBosses = new Set(); // zones whose boss has been killed this run
    this.bossRoomPending = false;    // true once threshold reached, until room is generated
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

  /** Force the next call to checkZoneTransition() to return a specific zone. */
  forceNextZone(zone) {
    this._forcedZone = zone;
  }

  // Consuming read: clears any forced zone. Only the room-generation path in
  // enterExploreState may call this — every other reader (renderers, blend
  // helpers, room counters) must use peekZoneTransition() or the force set for
  // the NEXT room gets eaten mid-warp by a render frame.
  checkZoneTransition() {
    const zone = this.peekZoneTransition();
    this._forcedZone = null;
    return zone;
  }

  peekZoneTransition() {
    // Forced override (e.g. ridge north exit → gray zone)
    if (this._forcedZone) {
      return this._forcedZone;
    }

    // Gray zone is sticky: once entered, every transition stays gray until
    // resetOnRest()/resetOnDeath() restore green ("RETURN IS NOT GIVEN HERE.")
    if (this.currentZone === 'gray') {
      return 'gray';
    }

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
    const currentZone = this.peekZoneTransition();
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
    const currentZone = this.peekZoneTransition();
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
    const currentZone = this.peekZoneTransition();
    if (currentZone === 'green') {
      this.consecutiveGreenRooms++;
    } else if (currentZone !== 'gray') {
      // Reset counter if entering colored zone (red/cyan/yellow)
      // Don't reset if already in gray zone (allow staying in gray)
      this.consecutiveGreenRooms = 0;
    }

    // River-follow chase must be completed within one continuous yellow-zone
    // visit — leaving yellow zone mid-streak drops the progress rather than
    // letting it resume later.
    if (currentZone !== 'yellow') {
      this.resetRiverChase();
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

  shouldSpawnCaptive(currentZone, room) {
    // Gray zone doesn't have captive tracking
    if (currentZone === 'gray') {
      return false;
    }

    // Must have just defeated a miniboss (not the zone-ending boss)
    if (!room?.isMiniboss) {
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

  // ── Boss tracking ──────────────────────────────────────────────────────────

  /**
   * Returns true when the player has reached the boss depth threshold
   * for the given zone and the boss has not yet been defeated this run.
   */
  isBossReady(zone, depth) {
    if (this.defeatedBosses.has(zone)) return false;
    const threshold = ZONES[zone]?.bossDepth;
    if (!threshold) return false;
    return depth >= threshold;
  }

  markBossDefeated(zone) {
    this.defeatedBosses.add(zone);
    this.bossRoomPending = false;
  }

  /** Used by ExitSystem to prevent a defeated zone's color from appearing. */
  isZoneDefeated(zone) {
    return this.defeatedBosses.has(zone);
  }

  // ── Miniboss gating (depth 9 mandatory encounter) ──────────────────────────

  /** True when the room being generated must be a forced miniboss room. */
  isMinibossRequired(zone, depth) {
    return zone !== 'gray' && depth === 9 && !this.clearedZones.has(zone);
  }

  /**
   * Zone-boss / miniboss room-type override, evaluated on every fresh room
   * entry — mid-EXPLORE transitions AND leaving REST. The leavingRest case
   * matters because a character-swap respawn preserves zoneDepths, so a
   * player who died in the boss room must walk straight back into it rather
   * than into a regular room at the same depth.
   *
   * Returns { roomType, isZoneBossRoom } when an override applies, else null.
   */
  resolveForcedRoomType(game, currentZone, roomTransition, leavingRest) {
    const enteringFreshRoom = roomTransition || leavingRest;
    if (!enteringFreshRoom) return null;
    const depth = game.zoneDepths[currentZone];

    if (this.isBossReady(currentZone, depth)) {
      console.log(`[Boss] Zone boss triggered for ${currentZone} at depth ${depth}`);
      // Transition boss music: anticipation mini-loop → full 5-track sequence.
      // If anticipation is running, bossSequencePending queues the switch at
      // the next track boundary; otherwise (fresh entry, e.g. post-respawn or
      // cheat menu) it starts immediately.
      game.audioSystem.scheduleBossSequence();
      return { roomType: ROOM_TYPES.BOSS, isZoneBossRoom: true };
    }

    if (this.isMinibossRequired(currentZone, depth)) {
      return { roomType: ROOM_TYPES.BOSS, isZoneBossRoom: false };
    }

    return null;
  }

  /**
   * Depth-8 room clear steers the exit toward the depth-9 mandatory miniboss,
   * mirroring the pre-boss gate's north-only 'B' exit forcing.
   */
  applyPreMinibossGate(game) {
    const zone = game.currentRoom.zone || 'green';
    const depth = game.zoneDepths[zone] || 0;
    if (zone === 'gray' || depth !== 8 || game.preBossGateActive || this.clearedZones.has(zone)) return;
    game.preMinibossGateActive = true;
    game.currentRoom.exits.east = null;
    game.currentRoom.exits.west = null;
    game.currentRoom.exits.north = { letter: 'B', color: ZONES[zone].exitColor };
  }

  /** Clears both zone-boss and miniboss exit-forcing flags on room transition. */
  resetGates(game) {
    game.preBossGateActive = false;
    game.preMinibossGateActive = false;
  }

  resetOnRest() {
    this.roomsSinceRest = 0;
    this.consecutiveGreenRooms = 0; // Reset gray zone progress on rest
    this.currentZone = 'green';
    this.lastColoredZone = null;
    this.roomsClearedInCurrentZone = 0;
    this.resetLeshyChase(); // Reset chase tracking on rest
    this.resetRiverChase();
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
    this.clearedZones.clear();
    this.defeatedBosses.clear();
    this.bossRoomPending = false;
    this.resetLeshyChase();
    this.resetRiverChase();
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

  // ===== River-Follow Chase System (Yellow Zone Secret) =====

  /**
   * Record whether the player exited a river room along its flow direction.
   * Unlike Leshy (started externally when the NPC reaches an exit), this
   * chase only ever advances from a successful follow — there's no separate
   * "start" call, since the room's own riverFlowDirection is the trigger.
   * @param {boolean} followed - true if the exit taken matched the room's riverFlowDirection
   * @param {string} exitDirection - the direction taken; informs the next room's forced river
   * @returns {string} - 'oasis' (3rd consecutive follow), 'continue' (1st/2nd), or 'failed'
   */
  recordRiverFollow(followed, exitDirection) {
    if (followed) {
      this.riverChaseCount++;
      if (this.riverChaseCount >= 3) {
        this.resetRiverChase();
        return 'oasis';
      }
      this.riverChaseActive = true;
      this.riverLastExitDirection = exitDirection;
      return 'continue';
    }
    this.resetRiverChase();
    return 'failed';
  }

  /**
   * Reset all river-follow chase tracking
   */
  resetRiverChase() {
    this.riverChaseActive = false;
    this.riverChaseCount = 0;
    this.riverLastExitDirection = null;
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
    // bossDepth caps boss zones; maxDepth caps bossless zones (gray's mist
    // takes the character at maxDepth instead — GrayZoneSystem).
    const cap = ZONES[zone]?.bossDepth ?? ZONES[zone]?.maxDepth;
    if (zoneDepths[zone] === 0) {
      zoneDepths[zone] = 1;
    } else if (cap == null || zoneDepths[zone] < cap) {
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
