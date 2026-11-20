import { CHARACTER_TYPES } from '../../data/characters.js';
import { GRID } from '../../game/GameConfig.js';
import { ZONES } from '../../data/zones.js';
import { ZENITH_SUMMIT_MAP, ZENITH_SOLID_KEYS } from '../../data/zenithSummit.js';
import { motePosition, moteShimmer, prepareMoteFont } from './MistMotes.js';

// ZenithDraw — the Z room's Zenith Platforms, the energy running from each one
// to the summit cairn, who stands on them, and the clouds below the mountain
// (ZenithSystem). Three Frame Passes: spots and pennants on the ground, the
// standing characters and the climbing motes over items (combat), the clouds
// over everything (indicators). The summit itself (cliffs, trail, cairn) is
// background objects laid by ZenithSystem.generateZenithRoom.
//
// A pennant line is dark until energy runs along it: only the pennants at the
// pulse (or the climbing mote) light, in the character's color. A missing
// character's station is a hollow ring, and their line never lights.

const SPOT_GLYPH = '⦾';          // a station whose character is there
const EMPTY_SPOT_GLYPH = '⚬';    // a station still waiting for its character
const PENNANT_GLYPH = '▾';
const PENNANT_SPACING = 12;      // px between pennants along a line
const LINE_END_GAP = 1.5;        // cells left bare at each end, so the cairn and the spot keep clear ground round them
const LINE_SAG = 5;              // px a line sags at its middle
const TRAIL = [0, 0.06, 0.12];   // mote trail: how far behind the head each glyph lags (progress units)
const LIT_BEHIND_PX = 26;        // pennants this far behind the energy's head are still lit
const LIT_AHEAD_PX = 4;          // and this far ahead of it already

// Clouds, by how many cells a low cell lies from the mountain: the veil that
// sinks the ground there, and how thick the mist motes over it are. Thin at
// the cliff foot, so the cliffs rise out of them.
const CLOUD_VEIL = [0, 0.5, 0.7, 0.85];
const CLOUD_MOTE_ALPHA = [0, 0.5, 0.75, 0.9];

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

    // Pennants, platform to cairn, lit only where energy is passing: a pulse
    // in turn with the other present lines while they wait, and the mote
    // itself while the five climb. No energy runs on a missing one's line.
    const length = Math.hypot(zenith.center.x - p.cx, zenith.center.y - p.cy);
    let head = null;
    if (progress !== null) head = moteReach(progress);
    else if (isPresent && zenith.phase === 'waiting') {
      head = system.energyPulse(zenith, length, present.indexOf(p.characterType), present.length).head;
    }
    if (head !== null) {
      const gap = (LINE_END_GAP * GRID.CELL_SIZE) / length;
      const count = Math.max(1, Math.floor((length * (1 - 2 * gap)) / PENNANT_SPACING));
      for (let i = 0; i <= count; i++) {
        const t = gap + (i / count) * (1 - 2 * gap);
        const behindPx = (head - t) * length;
        if (behindPx < -LIT_AHEAD_PX || behindPx > LIT_BEHIND_PX) continue;
        const at = linePoint(p, zenith.center, t);
        if (overSolid(at)) continue;
        ctx.fillText(PENNANT_GLYPH, at.x, at.y);
      }
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

export function drawZenithClouds(renderer, game) {
  const zenith = game.currentRoom?.zenith;
  if (!zenith || zenith.cloudCover <= 0) return;
  const ctx = renderer.fgCtx;
  const CS = GRID.CELL_SIZE;
  const cover = zenith.cloudCover;
  const band = (row, col) => CLOUD_VEIL[Math.min(CLOUD_VEIL.length - 1, zenith.cloudDepth[row][col])];

  ctx.save();
  // The veil: whole cells sink as units, a 10% step each (G5), deeper further out.
  ctx.fillStyle = ZONES[game.currentRoom.zone]?.environmentColors?.background ?? '#000000';
  zenith.cloudDepth.forEach((line, row) => line.forEach((depth, col) => {
    if (depth === 0) return;
    const alpha = Math.round(cover * band(row, col) * 10) / 10;
    if (alpha < 0.1) return;
    ctx.globalAlpha = alpha;
    ctx.fillRect(col * CS, row * CS, CS, CS);
  }));

  // The mist itself, drifting over the low ground.
  prepareMoteFont(ctx);
  const t = zenith.clock;
  for (const m of zenith.clouds) {
    const depth = Math.min(CLOUD_MOTE_ALPHA.length - 1, zenith.cloudDepth[m.row][m.col]);
    const { x, y } = motePosition(m, t);
    ctx.globalAlpha = Math.max(0, Math.min(0.95, cover * (CLOUD_MOTE_ALPHA[depth] + moteShimmer(m, t))));
    ctx.fillStyle = m.color;
    ctx.fillText('~', x, y);
  }
  ctx.restore();
}
