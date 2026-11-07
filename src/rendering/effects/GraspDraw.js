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
  ROCK_EDGE_COLOR, ROCK_GLYPH, ROCK_CAP_GLYPH, STREAK_COLOR, FINGER_ART,
  FINGER_CREASE_EVERY, GRASP_COLOR, GRASP_NAIL_COLOR, GRASP_CREASE_COLOR,
  CLUTCH_COLOR, GRASP_TUNING as T,
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

// Bottom-up from the tip: nail rows, then shaft with a crease every few rows.
function drawFinger(renderer, finger) {
  const flash = finger.flash > 0;
  const tipRow = Math.floor(finger.tipY / CS) - 1;
  for (let i = 0; tipRow - i >= -1; i++) {
    const y = finger.tipY - (i + 1) * CS;
    if (y + CS < 0) break;
    const isTip = i < FINGER_ART.tip.length;
    const crease = !isTip && (i - FINGER_ART.tip.length) % FINGER_CREASE_EVERY === FINGER_CREASE_EVERY - 1;
    const row = isTip ? FINGER_ART.tip[i] : crease ? FINGER_ART.crease : FINGER_ART.shaft;
    const color = flash ? FLASH_COLOR : i === 1 ? GRASP_NAIL_COLOR : crease ? GRASP_CREASE_COLOR : GRASP_COLOR;
    for (let col = 0; col < row.length; col++) {
      const glyph = row[col];
      if (glyph === ' ') continue;
      renderer.drawTextWithAlpha(finger.x + col * CS + HALF, y + HALF, glyph, color, 1);
    }
  }
}

export function drawGraspParts(renderer, game) {
  const grasp = game.graspSystem;
  if (!grasp?.active) return;
  const ground = game.zoneSystem.getBlendedEnvironmentColors(game.currentRoom.zone).background;
  for (const hand of grasp.hands) drawHand(renderer, hand, ground);
  for (const finger of grasp.fingers) drawFinger(renderer, finger);
  for (const m of grasp.clutch.members) {
    renderer.drawTextWithAlpha(m.x + HALF, m.y + HALF, m.glyph, m.flash > 0 ? FLASH_COLOR : CLUTCH_COLOR, 1);
  }
}
