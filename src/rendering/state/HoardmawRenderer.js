import { GRID } from '../../game/GameConfig.js';
import {
  BODY_COLS, BODY_ROWS, LID_ROWS,
  GLINT_POSITIONS, GLINT_PULSE_PERIOD,
  DENT_TIME, DENT_DEPTH,
} from '../../entities/Hoardmaw.js';

/**
 * HoardmawRenderer — the green dungeon boss's body.
 *
 * Split out of BossRenderer because this boss does not render like the Layer-1
 * composites: they are glyph arrangements stamped on the arena cell grid, and
 * this one is a single object drawn on its own sub-cell pitch around a root
 * that moves. Mixing the two models in one file would have meant every future
 * reader guessing which set of rules a given block followed.
 *
 * It is a CHEST. Everything below serves one read:
 *
 *   - a body that sits on the floor and breathes, never slides;
 *   - a lid hinged along its back edge that opens and slams believably, and
 *     is passively ajar even at rest, because a sealed chest is furniture;
 *   - two clean rim lines with teeth between them that do not quite mesh;
 *   - and behind the rims, a masked interior that was always there and is
 *     merely uncovered — the mouth, which is the whole identity of the boss.
 *
 * This file is a PURE READER. Every pose, angle and timer it draws was
 * decided by Hoardmaw._tickDeform; nothing here advances state. It also asks
 * the entity for every position through glyphAt()/offsetPx() rather than
 * recomputing from position + CELL_SIZE, so the picture and the hitboxes
 * cannot drift apart.
 *
 * Called under the interior overlay's translate (the vault is plane-1 content;
 * the surface pass never sees this boss) — see BossRenderer.renderBossComposite.
 */

// ─── Palette ────────────────────────────────────────────────────────────────
const C_LID_PLANK  = '#8a6a2e'; // aged brass-bound wood
const C_LID_RIM    = '#ffd76a'; // THE line — brightest thing on the body
const C_BODY_HIDE  = '#5c4527';
const C_BODY_RIM   = '#8a6a2e'; // deliberately duller than the lid rim
const C_TOOTH      = '#e8d49a';
const C_SCALE      = '#ffd700';
const C_DENT       = '#6b512c';
const C_FLASH      = '#ffffff';
const C_TONGUE     = '#e0a83c';

// Interior darkness, drawn as three flat bands rather than a gradient: canvas
// alpha here hard-rounds to 10% steps and gradients bypass the quantization
// entirely, so a gradient would be the one thing on screen that isn't retro.
const C_MOUTH_BANDS = ['#2a1c08', '#170e03', '#080400'];
const C_HOARD_MOTE  = '#8a6a2e';
const C_SPECK       = '#b8a67e';

// ─── Geometry ───────────────────────────────────────────────────────────────
const LID_MAX_LIFT  = 2.6;
const LID_REST_AJAR = 0.55; // pitch units the lip stays off the rim when "shut"   // pitch units the front lip rises at full gape
const LID_MAX_ANGLE = 0.42;  // radians each lid glyph tilts at full gape
const GLYPH_SCALE   = 0.62;  // glyphs drawn smaller to match the tighter pitch
const TOOTH_COUNT   = 7;     // teeth per rim — odd, so one sits dead center
const INTERIOR_DEPTH = 6;    // pitch units of interior drawn above the aperture

export class HoardmawRenderer {
  constructor(renderer) {
    this.renderer = renderer;
  }

  render(game) {
    const maw = game.dungeonBossSystem?.hoardmaw;
    if (!maw || maw.defeated) return;

    const pitch = maw.bodyRect().pitch;
    const flash = maw.hitFlash > 0
      && Math.floor(performance.now() / 1000 * 24) % 2 === 0;

    if (maw.dormant) { this._drawDormantPile(maw, pitch); return; }

    // Back to front. The interior goes down first and everything else covers
    // it, so what shows through the aperture is genuinely what is inside
    // rather than a patch drawn to look like a hole.
    this._drawInterior(game, maw, pitch);
    this._drawCarcass(maw, pitch, flash);
    this._drawBodyRim(maw, pitch);
    this._drawLid(maw, pitch, flash);
    this._drawGlint(game, maw, pitch);
    this._drawTongue(maw, pitch);
    this._drawSlamTelegraph(maw);
    this._drawInhaleMotes(game, maw);
    this._drawHealthBar(maw, pitch);
  }

  // ── Prologue ──────────────────────────────────────────────────────────────

  /**
   * Dormant, it is a heap of coins with a dull band across it and nothing
   * else — no rims, no teeth, no breathing. Every instinct the player has
   * says loot it, and nothing on screen argues. The transformation into the
   * full body IS the ambush reveal, so the pile must give away nothing.
   */
  _drawDormantPile(maw, pitch) {
    for (let row = LID_ROWS; row < BODY_ROWS; row++) {
      // Heap silhouette: narrower at the top, spilling wider toward the floor.
      const inset = Math.max(0, BODY_ROWS - 1 - row - 1);
      for (let col = inset; col < BODY_COLS - inset; col++) {
        const { x, y } = maw.glyphAt(row, col);
        this.renderer.drawEntityScaled(x, y, '$', '#8a7a3a', GLYPH_SCALE);
      }
    }
    for (let col = 2; col < BODY_COLS - 2; col++) {
      const { x, y } = maw.glyphAt(LID_ROWS - 1, col);
      this.renderer.drawEntityScaled(x, y, '=', '#6e5f2e', GLYPH_SCALE);
    }
  }

  // ── The mouth ─────────────────────────────────────────────────────────────

  /**
   * Aperture bounds in world px: the band uncovered between the lid's risen
   * lip and the body rim. Height is zero when the lid is shut, which is why
   * the lid never quite shuts.
   */
  _aperture(maw, pitch) {
    const lip = maw.glyphAt(LID_ROWS - 1, 0).y + pitch / 2 - this._lidLift(maw, LID_ROWS - 1, pitch);
    const rim = maw.glyphAt(LID_ROWS, 0).y - pitch / 2;
    // Inset by a third of a glyph: at full width the band's corners stick out
    // past the outermost lid and rim glyphs and the mouth reads as a pasted
    // rectangle rather than a cavity inside the body.
    const halfW = (BODY_COLS * pitch) / 2 - pitch * 0.34;
    return { top: lip, bottom: rim, left: maw.rootX() - halfW, right: maw.rootX() + halfW };
  }

  /**
   * How far a given lid row has risen. Zero at the hinge row, full at the lip.
   *
   * LID_REST_AJAR is added before the ramp so the lip is off the rim even at
   * lidOpen 0. A chest that seals reads as furniture between attacks; the
   * permanent sliver of dark under the lip is what keeps it reading as a mouth
   * that happens to be closed rather than a box that happens to be shut.
   */
  _lidLift(maw, row, pitch) {
    const ramp = LID_ROWS > 1 ? row / (LID_ROWS - 1) : 1;
    return (LID_REST_AJAR + maw.lidOpen * LID_MAX_LIFT) * pitch * ramp;
  }

  /**
   * What is in there.
   *
   * Everything is drawn tall — well above the aperture — and clipped to it, so
   * opening the lid uncovers more of something that was already present
   * instead of popping new glyphs into a gap. That difference is the whole
   * reason the mouth reads as a cavity and not as a hatch.
   */
  _drawInterior(game, maw, pitch) {
    const ap = this._aperture(maw, pitch);
    const h = ap.bottom - ap.top;
    if (h <= 0.5) return;

    const ctx = this.renderer.fgCtx;
    ctx.save();
    ctx.beginPath();
    ctx.rect(ap.left, ap.top, ap.right - ap.left, h);
    ctx.clip();

    // 1. Void, in flat bands. Darkest at the bottom of the throat.
    const bandH = h / C_MOUTH_BANDS.length;
    for (let i = 0; i < C_MOUTH_BANDS.length; i++) {
      ctx.fillStyle = C_MOUTH_BANDS[i];
      ctx.fillRect(ap.left, ap.top + i * bandH, ap.right - ap.left, bandH + 1);
    }

    // 2. Hoard glimmer: swallowed treasure still settling. Positions are
    //    hashed off the column, not rolled, so it drifts instead of strobing.
    const t = performance.now() / 1000;
    for (let col = 0; col < BODY_COLS; col++) {
      const seed = ((col * 2654435761) >>> 0) / 4294967296;
      const drift = ((seed + t * 0.06) % 1) * INTERIOR_DEPTH * pitch;
      const x = maw.rootX() + (col - (BODY_COLS - 1) / 2) * pitch;
      const y = ap.bottom - drift;
      this.renderer.drawEntityScaled(x, y, seed > 0.5 ? '.' : ',', C_HOARD_MOTE, GLYPH_SCALE);
    }

    // 3. Something in there. Two or three pale specks that come up toward the
    //    opening when the player is close and sink away when they are not.
    //    They never resolve into anything, and nothing in the fight ever
    //    explains them — the suggestion is the entire content.
    const player = game.player;
    const near = player
      ? 1 - Math.min(1, Math.hypot(player.position.x - maw.rootX(),
                                   player.position.y - maw.mouthY()) / (GRID.CELL_SIZE * 9))
      : 0;
    for (let i = 0; i < 3; i++) {
      const sway = Math.sin(t * (0.5 + i * 0.17) + i * 2.1);
      const x = maw.rootX() + sway * pitch * 2.4 + (i - 1) * pitch * 1.6;
      const y = ap.bottom - (0.6 + (1 - near) * (INTERIOR_DEPTH - 1)) * pitch
                          + Math.cos(t * 0.4 + i) * pitch * 0.3;
      this.renderer.drawEntityScaled(x, y, i === 1 ? 'o' : '.', C_SPECK, GLYPH_SCALE * 0.9);
    }

    // 4. Tongue root — the strip has to come from somewhere inside.
    if (maw.tongue) {
      this.renderer.drawEntityScaled(maw.rootX(), ap.bottom - pitch * 0.4, '~', C_TONGUE, GLYPH_SCALE);
    }

    ctx.restore();
  }

  // ── The body ──────────────────────────────────────────────────────────────

  /** The carcass: bare hide, the coin-scale armor over it, and fresh dents. */
  _drawCarcass(maw, pitch, flash) {
    const hide = flash ? C_FLASH : C_BODY_HIDE;
    for (let row = LID_ROWS; row < BODY_ROWS; row++) {
      for (let col = 0; col < BODY_COLS; col++) {
        const { x, y } = maw.glyphAt(row, col);
        this.renderer.drawEntityScaled(x, y, '#', hide, GLYPH_SCALE);
      }
    }

    for (const key of maw.scales) {
      const [row, col] = key.split(',').map(Number);
      const { x, y } = maw.glyphAt(row, col);
      this.renderer.drawEntityScaled(x, y, '$', flash ? C_FLASH : C_SCALE, GLYPH_SCALE);
    }

    // A chipped cell sinks inward and shrinks before settling as bare hide.
    // Armor that simply stops being drawn does not read as armor coming off.
    for (const dent of maw.dents) {
      const k = dent.t / DENT_TIME;
      const { x, y } = maw.glyphAt(dent.row, dent.col);
      this.renderer.drawEntityScaled(
        x, y + (1 - k) * DENT_DEPTH * pitch, 'o', C_DENT, GLYPH_SCALE * (0.3 + 0.5 * k));
    }
  }

  /** Body rim, and the teeth standing up off it. The lower half of the bite. */
  _drawBodyRim(maw, pitch) {
    const rimRow = LID_ROWS;
    for (let col = 0; col < BODY_COLS; col++) {
      const { x, y } = maw.glyphAt(rimRow, col);
      this.renderer.drawEntityScaled(x, y - pitch * 0.5, '=', C_BODY_RIM, GLYPH_SCALE);
    }
    this._drawTeeth(maw, pitch, '^', maw.glyphAt(rimRow, 0).y - pitch * 0.85, 0, 0.5);
  }

  /**
   * The lid. Hinged along its back edge, so the front lip travels furthest and
   * every glyph tilts with it — a hinge, not a sheet sliding upward.
   */
  _drawLid(maw, pitch, flash) {
    const angle = -maw.lidOpen * LID_MAX_ANGLE;
    const plank = flash ? C_FLASH : C_LID_PLANK;

    for (let row = 0; row < LID_ROWS; row++) {
      const lift = this._lidLift(maw, row, pitch);
      for (let col = 0; col < BODY_COLS; col++) {
        const { x, y } = maw.glyphAt(row, col);
        this.renderer.drawEntityRotated(x, y - lift, '=', plank, angle, GLYPH_SCALE);
      }
    }

    // Lid rim: the brightest line on the body, riding the lip. This is the
    // edge the player's eye tracks to know how open the mouth is.
    const lipLift = this._lidLift(maw, LID_ROWS - 1, pitch);
    const lipY = maw.glyphAt(LID_ROWS - 1, 0).y + pitch * 0.35 - lipLift;
    for (let col = 0; col < BODY_COLS; col++) {
      const { x } = maw.glyphAt(LID_ROWS - 1, col);
      this.renderer.drawEntityRotated(x, lipY, '=', C_LID_RIM, angle, GLYPH_SCALE);
    }

    // Upper teeth hang down off that lip and travel with it. At rest they sit
    // just shy of the lower set: near-meshed, never meshed. The near-miss is
    // where the horror actually lives — it is a mouth that is always slightly
    // open, on a thing that is supposed to be a box.
    this._drawTeeth(maw, pitch, 'v', lipY + pitch * 0.55, angle);
  }

  /**
   * One rim's worth of teeth, spread across the body's width.
   *
   * `stagger` slides the row sideways by a fraction of the tooth spacing. The
   * two rows are drawn half a spacing apart so that when the mouth is nearly
   * shut they interlock like a zipper instead of landing on each other — the
   * upper and lower sets stay individually readable at every lid angle.
   */
  _drawTeeth(maw, pitch, char, y, angle, stagger = 0) {
    const span = (BODY_COLS - 2) * pitch;
    const gap = span / (TOOTH_COUNT - 1);
    for (let i = 0; i < TOOTH_COUNT; i++) {
      const t = TOOTH_COUNT === 1 ? 0.5 : i / (TOOTH_COUNT - 1);
      const x = maw.rootX() - span / 2 + t * span + stagger * gap;
      this.renderer.drawEntityRotated(x, y, char, C_TOOTH, angle, GLYPH_SCALE * 0.85);
    }
  }

  // ── Signals the player reads ──────────────────────────────────────────────

  /**
   * Phase-2 weak point. The true glint pulses on the maw's breath; decoys
   * sparkle off that rhythm. Both are drawn — the phase is unreadable without
   * the fakes, because "find the one keeping time" needs something to not be
   * keeping time. Only the true one has a hitbox.
   */
  _drawGlint(game, maw, pitch) {
    if (maw.bossPhase !== 2 && maw.chokeTimer <= 0) return;

    const breath = 0.5 + 0.5 * Math.sin((maw.glintPulseTimer / GLINT_PULSE_PERIOD) * Math.PI * 2);
    const t = performance.now() / 1000;

    // Decoys: every position that is not the live one, sparkling on its own
    // irrational period so it can never accidentally match the breath.
    for (let i = 0; i < GLINT_POSITIONS.length; i++) {
      if (i === maw.glintIndex % GLINT_POSITIONS.length) continue;
      const p = GLINT_POSITIONS[i];
      const { x, y } = maw.offsetPx(p.dx, p.dy);
      const fake = 0.5 + 0.5 * Math.sin(t * (2.7 + i * 1.31) + i * 1.9);
      this.renderer.drawTextWithAlpha(x, y, '◉', '#c9b070', 0.15 + 0.35 * fake);
    }

    const g = maw.glintPx();
    // Reaching to grab brightens it for two breaths — the one moment the weak
    // point tells you where it is, paid for by being grabbed.
    const telling = maw.glintTellTimer > 0;
    const alpha = maw.chokeTimer > 0 ? 1 : (telling ? 1 : 0.45 + 0.55 * breath);
    this.renderer.drawTextWithAlpha(g.x, g.y, '◉', '#ffe9a8', alpha);

    // Truth register: a carried Compass keeps the maw's own time for you.
    if (game.dungeonBossSystem?.compassTruthActive) {
      this.renderer.drawTextWithAlpha(
        g.x, g.y - pitch * 1.6, '⌖', '#7fdfff', 0.45 + 0.55 * breath);
    }
  }

  _drawTongue(maw, pitch) {
    const t = maw.tongue;
    if (!t) return;
    const cs = GRID.CELL_SIZE;
    this.renderer.drawEntity(t.position.x + cs / 2, t.position.y + cs / 2, '~', t.color);
    for (let i = 1; i <= 3; i++) {
      this.renderer.drawEntity(
        t.position.x - t.dirX * i * cs * 0.5 + cs / 2,
        t.position.y - t.dirY * i * cs * 0.5 + cs / 2,
        '~', '#b8892f');
    }
  }

  /** Expanding warning ring from the body edge — the flanks stay safe. */
  _drawSlamTelegraph(maw) {
    if (maw.attackState !== 'slamTele') return;
    const progress = Math.min(1, maw.attackTimer / 1.1);
    const ctx = this.renderer.fgCtx;
    ctx.save();
    ctx.strokeStyle = `rgba(255, 80, 40, ${0.35 + 0.4 * progress})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(maw.mouthX(), maw.mouthY(), GRID.CELL_SIZE * (1.4 + 1.8 * progress), 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  /** Motes streaming off the player toward the mouth make the pull legible. */
  _drawInhaleMotes(game, maw) {
    if (!maw.inhaleActive) return;
    const cs = GRID.CELL_SIZE;
    const now = performance.now() / 120;
    for (let i = 0; i < 6; i++) {
      const t = ((now + i * 0.7) % 3) / 3;
      const px = game.player?.position.x ?? maw.mouthX();
      const py = game.player?.position.y ?? maw.mouthY();
      this.renderer.drawEntity(
        px + (maw.mouthX() - px) * t + cs / 2,
        py + (maw.mouthY() - py) * t + cs / 2,
        '·', C_TONGUE);
    }
  }

  /** HP bar above the body, shown once damaged (Turtle precedent). */
  _drawHealthBar(maw, pitch) {
    if (!maw.hasTakenDamage) return;
    const ctx = this.renderer.fgCtx;
    const BAR_W = GRID.CELL_SIZE * 6;
    const BAR_H = 4;
    const barX = maw.rootX() - BAR_W / 2;
    const barY = maw.glyphAt(0, 0).y - pitch * 1.6;
    ctx.fillStyle = '#333333';
    ctx.fillRect(barX, barY, BAR_W, BAR_H);
    ctx.fillStyle = maw.bossPhase >= 3 ? '#ffd700' : maw.bossPhase === 2 ? '#ffcc44' : '#22cc44';
    ctx.fillRect(barX, barY, BAR_W * Math.max(0, maw.hp / maw.maxHp), BAR_H);
  }
}
