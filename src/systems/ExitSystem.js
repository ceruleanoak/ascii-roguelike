import { EXIT_LETTERS, SECRET_PATTERNS } from '../data/exitLetters.js';
import { ZONES, ZONE_COLORS } from '../data/zones.js';
import { GRID } from '../game/GameConfig.js';

// Letters whose weights get boosted when the player has the well-vested luck
// blessing. V (Vault), K (Key Room), ? (Mystery), C (Camp) — all desirable
// stops that make luck feel like it's reshaping the run, not just fattening
// the loot table.
const LUCKY_BOOST = { 'V': 2.5, 'K': 2.0, '?': 2.0, 'C': 1.5 };

// Green is the starting zone — it always dangles an alternative-color exit to
// teach the player that color = destination. Every other zone tempts more
// rarely: only SOMETIMES does an un-progressed room offer a way out of the
// current color, so staying put feels like the default rather than a refusal.
const ALT_EXIT_CHANCE_NON_GREEN = 0.5;

// Walks the alphabet forward from `currentLetter`, returning the first letter
// that is a defined entry in EXIT_LETTERS. Wraps A→...→Z→A. Non-alphabet
// inputs (e.g. '?') start the search from before 'A'. Used by the
// Sword of the Letter to cycle exit destinations on hit.
export function cycleExitLetter(currentLetter) {
  const startCode = /^[A-Z]$/.test(currentLetter) ? currentLetter.charCodeAt(0) : 64;
  for (let i = 1; i <= 26; i++) {
    const next = String.fromCharCode(((startCode - 65 + i) % 26) + 65);
    if (EXIT_LETTERS[next]) return next;
  }
  return currentLetter;
}

// ── Exit-letter mutation surface ──────────────────────────────────────────────
// Single source of truth for exit letter slot positions and mutations. Used by
// the Sword of the Letter (cycles letters on hit) and the Fairy fountain
// (fairies dust an exit, mutating its letter to 'F'). Any future mechanic that
// rewrites exit letters at runtime should go through mutateExitLetter so the
// renderer (and future systems) can react to mutations via exit.mutationSource.

export const EXIT_SLOT_POSITIONS = {
  north: { col: Math.floor(GRID.COLS / 2), row: 1 },
  east:  { col: GRID.COLS - 2,             row: Math.floor(GRID.ROWS / 2) },
  west:  { col: 1,                         row: Math.floor(GRID.ROWS / 2) }
};

export function getExitSlotPosition(direction) {
  return EXIT_SLOT_POSITIONS[direction] || null;
}

// Returns { direction, exit } for the first exit letter slot whose cell
// overlaps the given rect (x, y in pixels; width/height default to 0 for a
// point test, which still falls inside the cell). Returns null if no overlap
// or if the room has no exits.
export function findExitAtPoint(room, x, y, width = 0, height = 0) {
  if (!room || !room.exits) return null;
  const cs = GRID.CELL_SIZE;
  for (const [dir, slot] of Object.entries(EXIT_SLOT_POSITIONS)) {
    const exit = room.exits[dir];
    if (!exit || !exit.letter) continue;
    const lx = slot.col * cs;
    const ly = slot.row * cs;
    if (x < lx + cs && x + width > lx && y < ly + cs && y + height > ly) {
      return { direction: dir, exit };
    }
  }
  return null;
}

// Lenient exit trigger. Each exit gap is exactly one cell (player-width) wide,
// so the positional crossing checks in updateExploreState only fire once the
// player squeezes pixel-perfectly into the opening. This catches the common
// case where the player is pressed against the wall beside the gap and actively
// holding the key toward it — "close enough, touching the gap, pressing the
// right way" leaves the room without fiddly alignment. `keys` is the WASD
// intent map; callers still apply the exit guards (locked exits, plane, exit
// existence) at the call site.
export function isPressingIntoExitGap(player, keys, direction) {
  if (!player || !keys) return false;
  const cs = GRID.CELL_SIZE;
  const centerX = Math.floor(GRID.COLS / 2);
  const centerY = Math.floor(GRID.ROWS / 2);
  const left = player.position.x;
  const right = player.position.x + player.width;
  const top = player.position.y;
  const bottom = player.position.y + player.height;
  const TOL = 3; // px of slack for "touching" the wall
  // Player box must overlap the gap lane on the perpendicular axis (horizontal
  // for N/S, vertical for E/W) — i.e. genuinely touching the gap.
  const overlapsCol = left < (centerX + 1) * cs && right > centerX * cs;
  const overlapsRow = top < (centerY + 1) * cs && bottom > centerY * cs;
  switch (direction) {
    case 'north': return keys.w && overlapsCol && top <= cs + TOL;
    case 'south': return keys.s && overlapsCol && bottom >= (GRID.ROWS - 1) * cs - TOL;
    case 'east':  return keys.d && overlapsRow && right >= (GRID.COLS - 1) * cs - TOL;
    case 'west':  return keys.a && overlapsRow && left <= cs + TOL;
    default: return false;
  }
}

// Mutates an exit's letter in place and tags the mutation so the renderer
// (and any future system) can react. Source examples: 'sword', 'fairyDust'.
// Returns true if the letter actually changed.
export function mutateExitLetter(exit, newLetter, { source = null } = {}) {
  if (!exit || !newLetter) return false;
  if (exit.letter === newLetter) return false;
  exit.letter = newLetter;
  exit.mutated = true;
  exit.mutationSource = source;
  return true;
}

export class ExitSystem {
  constructor(zoneSystem, game = null) {
    this.zoneSystem = zoneSystem;
    this.game = game;
  }

  generateExits(currentDepth, roomType, zoneType, progressionColor = null, currentLetter = null) {
    // Generate 3 UNIQUE letters (no duplicates, never the same letter as the room we're in)
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

      } while (
        attempts < maxAttempts &&
        (letters.includes(letter) || letter === currentLetter || (i === 2 && letter === 'O'))
      );

      letters.push(letter);
    }

    // Guarantee the miniboss ('B') exit is always on offer from L5 onward
    // until this zone's miniboss has been cleared this run (gray excluded,
    // same as the miniboss gating elsewhere).
    if (currentDepth >= 5 && zoneType !== 'gray' && currentLetter !== 'B' &&
        !letters.includes('B') && !this.zoneSystem?.clearedZones?.has(zoneType)) {
      letters[Math.floor(Math.random() * letters.length)] = 'B';
    }

    // Assign colors based on zone and progression state
    const colors = this.assignExitColors(letters, zoneType, progressionColor);

    // Return exit objects with letter + color
    const exits = {
      north: { letter: letters[0], color: colors[0] },
      east: { letter: letters[1], color: colors[1] },
      west: { letter: letters[2], color: colors[2] },
      south: !ZONES[zoneType]?.noRest  // South is boolean (return to REST); noRest zones have no way back
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
    } else if (zoneType === 'green' || Math.random() < ALT_EXIT_CHANCE_NON_GREEN) {
      // No progression: use random alternative, excluding zones whose boss is defeated.
      // Green always offers one; other zones only sometimes (gate above).
      const available = zone.alternativeZones.filter(
        z => !this.zoneSystem.isZoneDefeated(z)
      );
      if (available.length > 0) {
        const altZone = available[Math.floor(Math.random() * available.length)];
        colors[altIndex] = ZONE_COLORS[altZone];
      }
      // If all alternativeZones are defeated, all exits show the current zone color (no alt)
    }

    return colors;
  }

  getLetterWeightsForZone(zoneType, depth) {
    const weights = {};
    const blessed = !!this.game?.player?.luckBlessed;

    // Build weights from EXIT_LETTERS
    for (const [letter, data] of Object.entries(EXIT_LETTERS)) {
      let weight = data.weight;

      // Apply zone boosts if defined. A boost of 0 is a hard zone gate, so the
      // check must be !== undefined, not truthy (resolved bug #103).
      if (data.zoneBoosts && data.zoneBoosts[zoneType] !== undefined) {
        weight *= data.zoneBoosts[zoneType];
      }

      // Boss mini-room: locked out before L5, then ramps from x2 at L5 up to
      // x8 at L9, where the miniboss becomes mandatory (see main.js).
      if (letter === 'B') {
        if (depth < 5) {
          weight = 0;
        } else {
          const t = Math.min(depth, 9) - 5; // 0 at depth 5, 4 at depth 9+
          weight *= 2 + (6 * t / 4);        // 2 -> 8 linearly over depths 5..9
        }
      }

      // Lucky blessing reshapes the route: more vaults, key rooms, mystery,
      // and camps. Boss is intentionally excluded — depth pacing owns it.
      if (blessed && LUCKY_BOOST[letter]) {
        weight *= LUCKY_BOOST[letter];
      }

      weights[letter] = weight;
    }

    // Penalize recently visited letters so the same room type is less likely to
    // repeat. Most-recent = heaviest penalty; penalty fades over 5 rooms.
    const history = this.game?.zoneSystem?.pathHistory;
    if (history?.length) {
      const RECENCY_PENALTIES = [0.1, 0.25, 0.45, 0.65, 0.82];
      const penalized = new Set();
      for (let i = 0; i < history.length && i < RECENCY_PENALTIES.length; i++) {
        const recent = history[history.length - 1 - i].letter;
        if (!penalized.has(recent) && weights[recent] !== undefined) {
          weights[recent] *= RECENCY_PENALTIES[i];
          penalized.add(recent);
        }
      }
    }

    return weights;
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

  updateExitCollisions(room, player) {
    if (!room || !room.collisionMap) return;

    const centerX = Math.floor(GRID.COLS / 2);
    const centerY = Math.floor(GRID.ROWS / 2);
    const locked = !!room.exitsLocked;

    if (room.exits.north) {
      room.collisionMap[0][centerX] = locked;
    }
    if (room.exits.south) {
      room.collisionMap[GRID.ROWS - 1][centerX] = locked;
    }
    if (room.exits.east) {
      room.collisionMap[centerY][GRID.COLS - 1] = locked;
    }
    if (room.exits.west) {
      room.collisionMap[centerY][0] = locked;
    }

    // Don't overwrite the player's collision map while inside a maze/hut/dungeon interior
    if (!player.inMaze && !player.inHut && !player.inDungeon) {
      player.setCollisionMap(room.collisionMap);
    }
  }
}
