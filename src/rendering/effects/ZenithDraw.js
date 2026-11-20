import { CHARACTER_TYPES } from '../../data/characters.js';
import { GRID } from '../../game/GameConfig.js';
import { ZENITH_SUMMIT_MAP, ZENITH_SOLID_KEYS } from '../../data/zenithSummit.js';

// ZenithDraw — the Z room's Zenith Platforms, the pennant lines strung from
// each one to the summit cairn, and who stands on them (ZenithSystem). Two
// Frame Passes: spots and pennants on the ground, the standing characters and
// the climbing motes over items (combat). The summit itself (cliffs, trail,
// cairn) is background objects laid by ZenithSystem.generateZenithRoom.
//
// A missing character reads by shape, not by a darker hue (a dimmed color
// lands on the cliffs' own olive and slate): their station is a hollow ring,
// and their line keeps only every other pennant, hollow.

const SPOT_GLYPH = '⦾';          // a station whose character is there
const EMPTY_SPOT_GLYPH = '⚬';    // a station still waiting for its character
const PENNANT_GLYPH = '▾';
const EMPTY_PENNANT_GLYPH = '▿';
const PENNANT_SPACING = 12;      // px between pennants along a line
const LINE_END_GAP = 1.5;        // cells left bare at each end, so the cairn and the spot keep clear ground round them
const LINE_SAG = 5;              // px a line sags at its middle
const TRAIL = [0, 0.06, 0.12];   // mote trail: how far behind the head each glyph lags (progress units)
// An energy pulse's tail: [px behind the head, how far toward white]. Stepped,
// not a gradient (G5), so the pulse reads as a bright head trailing off.
const ENERGY_TAIL = [[6, 1], [18, 0.6], [32, 0.3]];
const ENERGY_LEAD_PX = 4;        // a pennant this far ahead of the head is already caught

// A point on the pennant line from the platform (t = 0) to the cairn (t = 1), sagging between them.
function linePoint(p, center, t) {
  return {
    x: p.cx + (center.x - p.cx) * t,
    y: p.cy + (center.y - p.cy) * t + Math.sin(Math.PI * t) * LINE_SAG
  };
}

// True when a point lies over a cliff or the cairn: no pennant hangs there.
function overSolid(at) {
  const row = ZENITH_SUMMIT_MAP[Math.floor(at.y / GRID.CELL_SIZE)];
  return ZENITH_SOLID_KEYS.has(row?.[Math.floor(at.x / GRID.CELL_SIZE)]);
}

// How far up its line a mote has climbed (0..1), the same easing the motes draw with.
function moteReach(progress) {
  return progress === null ? 0 : progress * progress;
}

// Blend two #rrggbb colors; amount 0 = a, 1 = b.
function mix(a, b, amount) {
  const ch = (hex, i) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  return '#' + [0, 1, 2].map(i =>
    Math.round(ch(a, i) + (ch(b, i) - ch(a, i)) * amount).toString(16).padStart(2, '0')
  ).join('');
}

// A pennant's color as an energy pulse passes it: white at the pulse's head,
// stepping back to the line's own color over the ENERGY_TAIL px behind it.
// Pennants ahead of the head (or with no pulse on the line) keep their color.
function energyColor(color, behindPx) {
  if (behindPx === null || behindPx < -ENERGY_LEAD_PX) return color;
  const step = ENERGY_TAIL.find(([until]) => behindPx < until);
  return step ? mix(color, '#ffffff', step[1]) : color;
}

export function drawZenithPlatforms(renderer, game) {
  const zenith = game.currentRoom?.zenith;
  if (!zenith?.center) return;
  const ctx = renderer.fgCtx;
  const system = game.zenithSystem;
  const present = system.presentTypes(zenith);
  const progress = system.convergeProgress(zenith);

  for (const p of zenith.platforms) {
    const isPresent = present.includes(p.characterType);
    // The player's own station shows its true glyph even while empty: it is the one waiting for them.
    const own = p.characterType === game.activeCharacterType;
    ctx.fillStyle = p.color;

    // Pennants, platform to cairn. Energy runs up a present character's line:
    // a pulse in turn with the other present lines while they wait, and the
    // mote itself while the five climb. No energy on a missing one's line.
    const length = Math.hypot(zenith.center.x - p.cx, zenith.center.y - p.cy);
    let head = null;
    if (progress !== null) head = moteReach(progress);
    else if (isPresent && zenith.phase === 'waiting') {
      head = system.energyPulse(zenith, length, present.indexOf(p.characterType), present.length).head;
    }
    const gap = (LINE_END_GAP * GRID.CELL_SIZE) / length;
    const count = Math.max(1, Math.floor((length * (1 - 2 * gap)) / PENNANT_SPACING));
    for (let i = 0; i <= count; i++) {
      if (!isPresent && i % 2) continue;
      const t = gap + (i / count) * (1 - 2 * gap);
      const at = linePoint(p, zenith.center, t);
      if (overSolid(at)) continue;
      const behindPx = head !== null && head >= 0 && head <= 1 + ENERGY_TAIL.at(-1)[0] / length
        ? (head - t) * length
        : null;
      ctx.fillStyle = energyColor(p.color, behindPx);
      ctx.fillText(isPresent ? PENNANT_GLYPH : EMPTY_PENNANT_GLYPH, at.x, at.y);
    }

    ctx.fillStyle = p.color;
    ctx.fillText(isPresent || own ? SPOT_GLYPH : EMPTY_SPOT_GLYPH, p.cx, p.cy);
  }
}

export function drawZenithGathering(renderer, game) {
  const zenith = game.currentRoom?.zenith;
  if (!zenith?.center) return;
  const system = game.zenithSystem;

  // Each rescued character not being played stands on their own platform.
  for (const type of system.standingCharacters(game)) {
    const p = zenith.platforms.find(pl => pl.characterType === type);
    if (p) renderer.drawEntity(p.cx, p.cy, '@', CHARACTER_TYPES[type].color);
  }

  // The five motes climb their pennant lines to the cairn, gathering speed as they go.
  const progress = system.convergeProgress(zenith);
  if (progress === null) return;
  for (const p of zenith.platforms) {
    TRAIL.forEach((lag, i) => {
      const at = linePoint(p, zenith.center, moteReach(Math.max(0, progress - lag)));
      if (i === 0) renderer.drawEntity(at.x, at.y, '*', p.color);
      else renderer.drawTextWithAlpha(at.x, at.y, '.', p.color, 1 - i * 0.3);
    });
  }
}
