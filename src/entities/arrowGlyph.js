// The directional arrow glyph for a flight angle — shared by player-fired
// arrows (Item) and enemy archers (Enemy), which each kept an identical copy.

// Map angle to 8 directional arrows (45° segments).
// 0° = right, 90° = down, 180° = left, 270° = up
export function arrowCharForAngle(angle) {
  // Normalize angle to 0-2π range
  let normalizedAngle = angle % (Math.PI * 2);
  if (normalizedAngle < 0) normalizedAngle += Math.PI * 2;

  // Convert to degrees for easier mental mapping
  const degrees = normalizedAngle * (180 / Math.PI);

  if (degrees >= 337.5 || degrees < 22.5) return '→';      // Right
  else if (degrees >= 22.5 && degrees < 67.5) return '↘';  // Down-right
  else if (degrees >= 67.5 && degrees < 112.5) return '↓'; // Down
  else if (degrees >= 112.5 && degrees < 157.5) return '↙'; // Down-left
  else if (degrees >= 157.5 && degrees < 202.5) return '←'; // Left
  else if (degrees >= 202.5 && degrees < 247.5) return '↖'; // Up-left
  else if (degrees >= 247.5 && degrees < 292.5) return '↑'; // Up
  else return '↗'; // Up-right (292.5-337.5)
}
