// GraspDraw — the Grasp (GraspSystem), Mist Battle Act 1's boss.
//
// drawGraspScenery (ground layer): the North Barrier, the open border rows of
// the climb, Climb Scenery rock and the speed streaks.
// drawGraspParts (combat layer): the Great Hands, the Fingers and the Clutch —
// every GraspUnit is isBossEntity, so this is their only draw.
//
// Surface-plane only: the Mist Battle arena has no Interior. Alpha stays on
// whole steps (retro quantization): no gradients anywhere.
import { GRID } from '../../game/GameConfig.js';
import {
  HAND_ART, HAND_COLS, mirrorArt, handGlyphColor, BARRIER_ROWS, BARRIER_GLYPHS, ROCK_COLOR,
  ROCK_EDGE_COLOR, ROCK_GLYPH, ROCK_CAP_GLYPH, STREAK_COLOR, FINGER_ART, FINGER_COLS,
  FINGER_KNUCKLE_EVERY, FINGER_TEXTURE, FINGER_TEXTURE_DENSITY, GRASP_COLOR, GRASP_NAIL_COLOR,
  GRASP_CREASE_COLOR, CLUTCH_COLOR, CLUTCH_SIZE, GRASP_TUNING as T,
} from '../../data/grasp.js';

const CS = GRID.CELL_SIZE;
const HALF = CS / 2;
const FLOOR_TOP = (GRID.ROWS - 1) * CS;
const FLASH_COLOR = '#ffffff';
const TRAP_LINE_Y = (GRID.ROWS - 1 - T.TRAP_LINE_ROWS) * CS;

const HAND_FRAMES = {
  left: HAND_ART,
  right: Object.fromEntries(Object.entries(HAND_ART).map(([k, rows]) => [k, mirrorArt(rows)])),
};
const FRAME_FOR_STATE = { rise: 'grip', grip: 'grip', flex: 'flex', reach: 'open', grab: 'fist', retract: 'open', flee: 'open' };
// A hand passes through `half` for this long as it opens to reach or
// unclenches into a retract.
const HALF_FRAME_TIME = 0.12;
// Reaching, it twitches between `open` and `openB` once per this many seconds.
const RESTLESS_PERIOD = 0.35;

/** Which HAND_ART frame a hand shows this frame, from its state and timer. */
function handFrame(hand) {
  const reaching = hand.state === 'reach';
  if ((reaching || hand.state === 'retract') && hand.timer < HALF_FRAME_TIME) return 'half';
  if (!reaching) return FRAME_FOR_STATE[hand.state] ?? 'grip';
  // Once splayed near its target it holds the splay until the grab.
  if (hand.splayed) return 'splay';
  return Math.floor(hand.timer / RESTLESS_PERIOD) % 2 ? 'openB' : 'open';
}

// Paint `share` (0..1) of a border row open, from the middle outward, so the
// wall builds back from both ends toward the center as `share` falls to 0.
function paintOpenRow(ctx, row, share, color) {
  if (share <= 0) return;
  const interior = GRID.COLS - 2;
  const open = Math.round(interior * share);
  const first = 1 + Math.floor((interior - open) / 2);
  ctx.fillStyle = color;
  ctx.fillRect(first * CS, row * CS, open * CS, CS);
}

function drawRock(renderer, x, y, w, h) {
  const ctx = renderer.fgCtx;
  ctx.fillStyle = '#2c2a30';
  ctx.fillRect(x, y, w, h);
  for (let cy = 0; cy < h; cy += CS) {
    for (let cx = 0; cx < w; cx += CS) {
      const glyph = cy === 0 ? ROCK_CAP_GLYPH : ROCK_GLYPH;
      renderer.drawTextWithAlpha(x + cx + HALF, y + cy + HALF, glyph, cy === 0 ? ROCK_EDGE_COLOR : ROCK_COLOR, 1);
    }
  }
}

export function drawGraspScenery(renderer, game) {
  const grasp = game.graspSystem;
  if (!grasp?.active) return;
  const ctx = renderer.fgCtx;
  const c = grasp.climb;
  const ground = game.zoneSystem.getBlendedEnvironmentColors(game.currentRoom.zone).background;

  // The barrier trembles before the Hands rise.
  if (c.barrier) {
    const shake = grasp.phase === 'tremble' ? Math.round(Math.sin(grasp.clock * 60)) : 0;
    for (let row = 1; row <= BARRIER_ROWS; row++) {
      const glyph = BARRIER_GLYPHS[row - 1] ?? ROCK_GLYPH;
      for (let col = 1; col < GRID.COLS - 1; col++) {
        ctx.fillStyle = '#2c2a30';
        ctx.fillRect(col * CS, row * CS, CS, CS);
        renderer.drawTextWithAlpha(col * CS + HALF + shake, row * CS + HALF, glyph, row === 1 ? ROCK_EDGE_COLOR : ROCK_COLOR, 1);
      }
    }
  }

  paintOpenRow(ctx, 0, c.northOpen, ground);
  paintOpenRow(ctx, GRID.ROWS - 1, c.southOpen, ground);

  // Speed streaks — whole-step alpha by how fast the climb is going.
  if (c.speed > 0) {
    const alpha = Math.min(0.5, Math.round((c.speed / T.CLIMB_SPEED_FAST) * 5) / 10);
    for (const s of c.streaks) renderer.drawTextWithAlpha(s.x, s.y, s.glyph, STREAK_COLOR, alpha);
  }

  // Scenery rides under the south lip and out of sight.
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, GRID.WIDTH, FLOOR_TOP);
  ctx.clip();
  for (const r of c.scenery) drawRock(renderer, r.x, r.y, r.w, r.h);
  ctx.restore();

  // The Trap Line, once Fingers reach: a faint row of marks along it.
  if (grasp.fingers.length > 0 && grasp.fingersHp > 0) {
    for (let col = 1; col < GRID.COLS - 1; col += 2) {
      renderer.drawTextWithAlpha(col * CS + HALF, TRAP_LINE_Y, '.', GRASP_CREASE_COLOR, 0.5);
    }
  }
}

// Each glyph sits on a cell of bare ground, so a hand draped over the North
// Barrier reads in front of the rock rather than tangled in its glyphs.
function drawHand(renderer, hand, ground) {
  const rows = HAND_FRAMES[hand.side][handFrame(hand)];
  const flash = hand.flash > 0;
  const ctx = renderer.fgCtx;
  ctx.fillStyle = ground;
  for (let r = 0; r < rows.length; r++) {
    for (let col = 0; col < HAND_COLS; col++) {
      const glyph = rows[r][col];
      if (!glyph || glyph === ' ') continue;
      const x = hand.x + col * CS;
      const y = hand.y + r * CS;
      ctx.fillRect(x, y, CS, CS);
      const color = flash ? FLASH_COLOR : handGlyphColor(glyph);
      renderer.drawTextWithAlpha(x + HALF, y + HALF, glyph, color, 1);
    }
  }
}

// A fixed 0..1 value per Finger cell, so a fleck stays put on the flesh.
function fleckRoll(laneX, row, col) {
  let h = (laneX * 73856093) ^ (row * 19349663) ^ (col * 83492791);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// The art row `i` rows up from the tip, and the color of its inner glyphs:
// tip, nail plate, then shaft banded by knuckles.
function fingerRow(i) {
  if (i === 0) return { row: FINGER_ART.tip, inner: GRASP_COLOR };
  const nail = i - 1;
  if (nail < FINGER_ART.nail.length) return { row: FINGER_ART.nail[nail], inner: GRASP_NAIL_COLOR };
  const k = (nail - FINGER_ART.nail.length) % FINGER_KNUCKLE_EVERY;
  const band = FINGER_KNUCKLE_EVERY - FINGER_ART.knuckle.length;
  if (k >= band) return { row: FINGER_ART.knuckle[k - band], inner: GRASP_CREASE_COLOR };
  return { row: FINGER_ART.shaft, inner: GRASP_CREASE_COLOR };
}

// Bottom-up from the tip, one row per cell until the Finger leaves the top.
// The art's columns spread evenly across the Finger's current width, so a
// squeezed Finger swells with its outline on its edges. Every cell inside the
// outline is backed with bare ground, so the Finger reads as one solid mass
// over the arena floor.
function drawFinger(renderer, finger, ground) {
  const flash = finger.flash > 0;
  const ctx = renderer.fgCtx;
  const step = (finger.width - CS) / (FINGER_COLS - 1);
  for (let i = 0; ; i++) {
    const y = finger.tipY - (i + 1) * CS;
    if (y + CS < 0) break;
    const { row, inner } = fingerRow(i);
    const first = row.search(/\S/);
    const last = row.trimEnd().length - 1;
    ctx.fillStyle = ground;
    ctx.fillRect(finger.left + first * step, y, (last - first) * step + CS, CS);
    for (let col = first; col <= last; col++) {
      let glyph = row[col];
      if (glyph === ' ') continue;
      const edge = col === 0 || col === FINGER_COLS - 1;
      let color = edge ? GRASP_COLOR : inner;
      if (glyph === '.') {
        const roll = fleckRoll(finger.laneX, i, col);
        if (roll >= FINGER_TEXTURE_DENSITY) continue;
        glyph = FINGER_TEXTURE[Math.floor(roll / FINGER_TEXTURE_DENSITY * FINGER_TEXTURE.length)];
        color = GRASP_CREASE_COLOR;
      } else if (glyph === '+' && !edge) {
        color = GRASP_COLOR;
      }
      renderer.drawTextWithAlpha(finger.left + col * step + HALF, y + HALF, glyph, flash ? FLASH_COLOR : color, 1);
    }
  }
}

export function drawGraspParts(renderer, game) {
  const grasp = game.graspSystem;
  if (!grasp?.active) return;
  const ground = game.zoneSystem.getBlendedEnvironmentColors(game.currentRoom.zone).background;
  for (const hand of grasp.hands) drawHand(renderer, hand, ground);
  for (const finger of grasp.fingers) drawFinger(renderer, finger, ground);
  // The Clutch draw at CLUTCH_SIZE, a glyph filling the unit's whole square.
  const ctx = renderer.fgCtx;
  ctx.save();
  ctx.font = `${CLUTCH_SIZE}px 'Unifont', monospace`;
  for (const m of grasp.clutch.members) {
    renderer.drawTextWithAlpha(m.x + CLUTCH_SIZE / 2, m.y + CLUTCH_SIZE / 2, m.glyph, m.flash > 0 ? FLASH_COLOR : CLUTCH_COLOR, 1);
  }
  ctx.restore();
}
