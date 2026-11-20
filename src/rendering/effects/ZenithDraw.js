import { CHARACTER_TYPES } from '../../data/characters.js';
import { darkenColor } from '../../systems/roomFeatures.js';

// ZenithDraw — the Z room's Zenith Platforms and who stands on them
// (ZenithSystem). Two Frame Passes: the platforms lie on the floor (ground),
// the standing characters and the converging motes draw over items (combat).

const PLATFORM_DARKEN = 0.7;   // platform floor: the character's color, darkened
const TRAIL = [0, 0.06, 0.12]; // mote trail: how far behind the head each glyph lags (progress units)

export function drawZenithPlatforms(renderer, game) {
  const zenith = game.currentRoom?.zenith;
  if (!zenith) return;
  const ctx = renderer.fgCtx;
  // Once gathered, the platforms stay lit in their full color.
  const lit = zenith.phase === 'gathered';
  for (const p of zenith.platforms) {
    ctx.fillStyle = lit ? darkenColor(p.color, 0.4) : darkenColor(p.color, PLATFORM_DARKEN);
    ctx.fillRect(p.x, p.y, p.size, p.size);
    ctx.strokeStyle = p.color;
    ctx.lineWidth = 1;
    ctx.strokeRect(p.x + 0.5, p.y + 0.5, p.size - 1, p.size - 1);
  }
}

export function drawZenithGathering(renderer, game) {
  const zenith = game.currentRoom?.zenith;
  if (!zenith) return;
  const system = game.zenithSystem;

  // Each rescued character not being played stands on their own platform.
  for (const type of system.standingCharacters(game)) {
    const p = zenith.platforms.find(pl => pl.characterType === type);
    if (p) renderer.drawEntity(p.cx, p.cy, '@', CHARACTER_TYPES[type].color);
  }

  // The five motes, platform to center, eased so they gather speed as they meet.
  const progress = system.convergeProgress(zenith);
  if (progress === null) return;
  for (const p of zenith.platforms) {
    TRAIL.forEach((lag, i) => {
      const t = Math.max(0, progress - lag);
      const eased = t * t;
      const x = p.cx + (zenith.center.x - p.cx) * eased;
      const y = p.cy + (zenith.center.y - p.cy) * eased;
      renderer.drawTextWithAlpha(x, y, i === 0 ? '*' : '.', p.color, 1 - i * 0.3);
    });
  }
  // The meeting point brightens as they close in.
  renderer.drawTextWithAlpha(zenith.center.x, zenith.center.y, '+', '#ffffff', progress);
}
