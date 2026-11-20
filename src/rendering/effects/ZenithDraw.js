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

// Whose station is occupied right now: the standing characters, plus the
// player's own once they step onto it. After the Gathering, all of them.
function occupiedTypes(game, zenith) {
  const system = game.zenithSystem;
  const occupied = new Set(system.standingCharacters(game));
  const own = zenith.platforms.find(p => p.characterType === game.activeCharacterType);
  if (own && system.isOnPlatform(own)) occupied.add(own.characterType);
  if (zenith.phase === 'gathered') for (const p of zenith.platforms) occupied.add(p.characterType);
  return occupied;
}

export function drawZenithPlatforms(renderer, game) {
  const zenith = game.currentRoom?.zenith;
  if (!zenith?.center) return;
  const ctx = renderer.fgCtx;
  const occupied = occupiedTypes(game, zenith);
  const progress = game.zenithSystem.convergeProgress(zenith);
  const reach = moteReach(progress);

  for (const p of zenith.platforms) {
    const present = occupied.has(p.characterType);
    // The player's own station shows its true glyph even while empty: it is the one waiting for them.
    const own = p.characterType === game.activeCharacterType;
    ctx.fillStyle = p.color;

    // Pennants, platform to cairn. While the motes climb, the pennants they
    // have passed flash white behind them.
    const length = Math.hypot(zenith.center.x - p.cx, zenith.center.y - p.cy);
    const gap = (LINE_END_GAP * GRID.CELL_SIZE) / length;
    const count = Math.max(1, Math.floor((length * (1 - 2 * gap)) / PENNANT_SPACING));
    for (let i = 0; i <= count; i++) {
      if (!present && i % 2) continue;
      const t = gap + (i / count) * (1 - 2 * gap);
      const at = linePoint(p, zenith.center, t);
      if (overSolid(at)) continue;
      ctx.fillStyle = progress !== null && t <= reach ? '#ffffff' : p.color;
      ctx.fillText(present ? PENNANT_GLYPH : EMPTY_PENNANT_GLYPH, at.x, at.y);
    }

    ctx.fillStyle = p.color;
    ctx.fillText(present || own ? SPOT_GLYPH : EMPTY_SPOT_GLYPH, p.cx, p.cy);
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
