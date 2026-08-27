/**
 * BossRenderer — composite rendering for multi-character zone bosses.
 *
 * Extracted from ExploreRenderer (architecture budget). Owns the Goo Dragon,
 * Turtle, and Lake Boss composite draws plus their shared helpers (necks,
 * heads, flame cone). Entry point: renderBossComposite(game), called by
 * ExploreRenderer when game.bossSystem is active.
 */

import { GRID } from '../../game/GameConfig.js';
import { CHARGE_DURATION, ROLL_CHARS } from '../../entities/TurtleShell.js';
import { HEAD_FLASH_FREQ } from '../../entities/TurtleHead.js';
import {
  GLINT_POSITIONS, GLINT_PULSE_PERIOD,
} from '../../entities/Hoardmaw.js';
import { BREACH_RADIUS, BREACH_TELEGRAPH } from '../../entities/LakeBoss.js';

export class BossRenderer {
  constructor(renderer) {
    this.renderer = renderer;
  }

  /**
   * Renders the full Goo Dragon boss as a multi-character composite:
   *   - Central body (5 chars wide)
   *   - Three necks as chains of '~' between body and each head
   *   - Three heads (3 chars wide each): middle head is the main weak point,
   *     side heads are secondary (damageable only during grab escape)
   *   - Red eye indicator on the middle head when vulnerable
   */
  renderBossComposite(game) {
    const bs = game.bossSystem;
    // Dungeon boss outranks the surface-boss gate — the vault is its own
    // context and bossSystem is inactive there.
    if (game.dungeonBossSystem?.hoardmaw) { this.renderHoardmawComposite(game); return; }
    if (!bs?.active) return;
    if (bs.lakeBoss)    { this.renderLakeBossComposite(game); return; }
    if (bs.turtleShell) { this.renderTurtleBossComposite(game); return; }
    if (bs.pandoraBox)  { this.renderPandoraBoxComposite(game); return; }
    if (!bs.dragon) return;

    const dragon = bs.dragon;
    const cs  = GRID.CELL_SIZE;
    const ctx = this.renderer.fgCtx;

    // Body is anchored at the dragon's float center (static reference point)
    const bx = dragon.floatCenterX;
    const by = dragon.floatCenterY;

    const baseColor = dragon.color;
    const stunTimer = dragon.bossStunTimer;
    const isStunned = stunTimer > 0;
    // Last second: flash between light blue and white at 10 Hz
    const stunFlash = isStunned && stunTimer < 1.0 && Math.floor(stunTimer * 10) % 2 === 0;

    const bodyColor = stunFlash ? '#ffffff'
                    : isStunned ? '#88bbff'
                    : baseColor;

    // I-frame flash: alternate body/neck/heads to white only when iframes were triggered by player damage
    const dragonFlash  = !isStunned && dragon.hitFlash && Math.floor(performance.now() / 1000 * 24) % 2 === 0;
    // Near-death blink (dark red) outranks every other body color — mirrors the player
    const nearDeathColor = dragon.getNearDeathBlinkColor();
    const drawBodyColor = nearDeathColor ?? (dragonFlash ? '#ffffff' : bodyColor);

    // ── Body + middle neck + middle head ──────────────────────────────────
    const bodyChars = ['{', '~', '=', '~', '}'];
    for (let i = 0; i < bodyChars.length; i++) {
      this.renderer.drawEntity(bx + (i - 2) * cs, by, bodyChars[i], drawBodyColor);
    }

    this._drawBossNeck(dragon.position, { x: bx, y: by }, drawBodyColor);
    this._drawBossHead(dragon, 'middle', stunFlash, isStunned, dragonFlash);

    // ── Side heads (each has its own i-frame state) ────────────────────────
    for (const head of bs.heads) {
      const headInvulnerable = head.invulnerabilityTimer > 0;
      const headFlash = headInvulnerable && Math.floor(performance.now() / 1000 * 24) % 2 === 0;
      const headNeckColor = headFlash ? '#ffffff' : bodyColor;

      if (!head.detached) this._drawBossNeck(head.position, { x: bx, y: by }, headNeckColor);
      this._drawBossHead(head, 'side', stunFlash, isStunned, headFlash);
    }

    // ── HP bar (shown only after first damage) ────────────────────────────
    if (dragon.hasTakenDamage) {
      const BAR_W = cs * 5, BAR_H = 4;
      const barX  = bx - BAR_W / 2;
      const barY  = by - cs * 1.5;
      ctx.fillStyle = '#333333';
      ctx.fillRect(barX, barY, BAR_W, BAR_H);
      ctx.fillStyle = dragon.bossPhase >= 3 ? '#cc3300' : dragon.bossPhase === 2 ? '#aacc22' : '#22cc44';
      ctx.fillRect(barX, barY, BAR_W * Math.max(0, dragon.hp / dragon.maxHp), BAR_H);
    }
  }

  // ── Turtle boss composite (red zone) ──────────────────────────────────────

  renderTurtleBossComposite(game) {
    const bs    = game.bossSystem;
    const shell = bs.turtleShell;
    const head  = bs.turtleHead;
    const cs    = GRID.CELL_SIZE;
    const ctx   = this.renderer.fgCtx;

    const shellFlash   = shell.hitFlash && Math.floor(performance.now() / 1000 * 24) % 2 === 0;
    // Near-death blink (dark red) on the whole body — shell HP is the boss HP; mirrors the player
    const nearDeathColor = shell.getNearDeathBlinkColor();
    const shellColor   = nearDeathColor ?? (shellFlash ? '#ffffff' : shell.color);
    const isCharging   = shell.shellState === 'charging';

    // shell.position.x/y is the visual body center
    const sx = shell.position.x;
    const sy = shell.position.y;

    // ── Legs (4 corners, visible always — sold as part of the turtle body) ──
    const legBaseColor = shell.bossPhase >= 2 ? '#ffaa66' : '#a07820';
    const legColor     = shellFlash ? '#ffffff' : legBaseColor;
    for (const leg of bs.turtleLegs) {
      const legFlash  = leg.hitFlash && Math.floor(performance.now() / 1000 * 24) % 2 === 0;
      const lc        = nearDeathColor ?? (legFlash ? '#ffffff' : legColor);
      // leg.position is top-left of 1×1; center = position + cs/2
      this.renderer.drawEntity(leg.position.x + cs * 0.5, leg.position.y + cs * 0.5, leg.char, lc);
    }

    // ── Shell body (5×2): brackets + inner fill ───────────────────────────
    // When stopped/charging: solid shell pattern (@); when rolling: animated chars
    const innerA  = isCharging ? '@' : (ROLL_CHARS[shell.rollAnimFrame] ?? 'O');
    const innerB  = isCharging ? '@' : (ROLL_CHARS[(shell.rollAnimFrame + 2) % ROLL_CHARS.length] ?? '0');
    const bracketL = isCharging ? '{' : '(';
    const bracketR = isCharging ? '}' : ')';
    // Top row
    this.renderer.drawEntity(sx - cs * 2, sy - cs * 0.5, bracketL, shellColor);
    this.renderer.drawEntity(sx - cs,     sy - cs * 0.5, innerA,   shellColor);
    this.renderer.drawEntity(sx,          sy - cs * 0.5, innerB,   shellColor);
    this.renderer.drawEntity(sx + cs,     sy - cs * 0.5, innerA,   shellColor);
    this.renderer.drawEntity(sx + cs * 2, sy - cs * 0.5, bracketR, shellColor);
    // Bottom row
    this.renderer.drawEntity(sx - cs * 2, sy + cs * 0.5, bracketL, shellColor);
    this.renderer.drawEntity(sx - cs,     sy + cs * 0.5, innerB,   shellColor);
    this.renderer.drawEntity(sx,          sy + cs * 0.5, innerA,   shellColor);
    this.renderer.drawEntity(sx + cs,     sy + cs * 0.5, innerB,   shellColor);
    this.renderer.drawEntity(sx + cs * 2, sy + cs * 0.5, bracketR, shellColor);

    // ── HP bar (shown only after first damage) ────────────────────────────
    if (shell.hasTakenDamage) {
      const BAR_W = cs * 5, BAR_H = 4;
      const barX  = sx - BAR_W / 2;
      const barY  = sy - cs * 1.5;
      ctx.fillStyle = '#333333';
      ctx.fillRect(barX, barY, BAR_W, BAR_H);
      ctx.fillStyle = shell.bossPhase >= 2 ? '#ffaa66' : '#cc3300';
      ctx.fillRect(barX, barY, BAR_W * Math.max(0, shell.hp / shell.maxHp), BAR_H);
    }

    // ── Phase 1: flame charge cone overlay ────────────────────────────────
    if (shell.bossPhase === 1 && shell.shellState === 'charging' && head) {
      this._renderFlameChargeCone(ctx, shell, head, cs);
    }

    // ── Head rendering ────────────────────────────────────────────────────
    if (head) {
      if (shell.bossPhase === 1 && head.headState === 'extended') {
        this._renderTurtleHeadP1(ctx, head, cs);
      } else if (shell.bossPhase >= 2) {
        this._renderTurtleHeadP2(ctx, shell, head, cs);
      }
    }
  }

  _renderFlameChargeCone(ctx, shell, head, cs) {
    const progress     = Math.min(shell.chargeTimer / CHARGE_DURATION, 1.0);
    const CONE_HALF    = Math.PI / 5;   // must match TurtleShell CONE_HALF_SPREAD (±36°)
    const coneLen      = cs * 7;
    // Cone originates from head center, not shell center
    const ox = head.position.x + cs;
    const oy = head.position.y + cs;
    const angle = shell.chargeTargetAngle;

    ctx.save();

    // Filled danger cone — darkens as charge builds
    ctx.globalAlpha = 0.15 + progress * 0.30;
    ctx.fillStyle   = '#ff4400';
    ctx.beginPath();
    ctx.moveTo(ox, oy);
    ctx.arc(ox, oy, coneLen, angle - CONE_HALF, angle + CONE_HALF);
    ctx.closePath();
    ctx.fill();

    // Pulsing edge lines
    const pulseAlpha = 0.4 + Math.sin(performance.now() / 1000 * 8) * 0.3;
    ctx.globalAlpha  = pulseAlpha;
    ctx.strokeStyle  = '#ff8800';
    ctx.lineWidth    = 1.5;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(ox, oy);
      ctx.lineTo(ox + Math.cos(angle + side * CONE_HALF) * coneLen,
                 oy + Math.sin(angle + side * CONE_HALF) * coneLen);
      ctx.stroke();
    }

    ctx.restore();
  }

  _renderTurtleHeadP1(ctx, head, cs) {
    const flashOn   = Math.floor(head.flashTimer / HEAD_FLASH_FREQ) % 2 === 0;
    const headColor = flashOn ? '#ffffff' : head.color;
    // head.position is top-left of 2×2; center = (position.x + cs, position.y + cs)
    const hcx = head.position.x + cs;
    const hcy = head.position.y + cs;
    this.renderer.drawEntity(hcx - cs / 2, hcy - cs / 2, 'Ⲑ', headColor);
    this.renderer.drawEntity(hcx + cs / 2, hcy - cs / 2, 'Ⲑ', headColor);
    this.renderer.drawEntity(hcx - cs / 2, hcy + cs / 2, 'Ⲑ', headColor);
    this.renderer.drawEntity(hcx + cs / 2, hcy + cs / 2, 'Ⲑ', headColor);
  }

  _renderTurtleHeadP2(ctx, shell, head, cs) {
    // ── Orbiting head (2×2) ───────────────────────────────────────────────
    const headHitFlash  = head.hitFlash && Math.floor(performance.now() / 1000 * 24) % 2 === 0;
    const preFireFlash  = head.preFireFlashTimer > 0 && Math.floor(performance.now() / 1000 * 20) % 2 === 0;
    const headColor     = (headHitFlash || preFireFlash) ? '#ffffff' : head.color;
    const hcx = head.position.x + cs;
    const hcy = head.position.y + cs;
    this.renderer.drawEntity(hcx - cs / 2, hcy - cs / 2, 'Ⲑ', headColor);
    this.renderer.drawEntity(hcx + cs / 2, hcy - cs / 2, 'Ⲑ', headColor);
    this.renderer.drawEntity(hcx - cs / 2, hcy + cs / 2, 'Ⲑ', headColor);
    this.renderer.drawEntity(hcx + cs / 2, hcy + cs / 2, 'Ⲑ', headColor);
  }

  renderLakeBossComposite(game) {
    const boss = game.bossSystem.lakeBoss;
    const cs   = GRID.CELL_SIZE;
    const ctx  = this.renderer.fgCtx;

    // SUBMERGED: darken nearby water tiles; don't render body. Covers phase 1's
    // 'underwater' and phase 2's 'stalking'/'breaching' — the boss is under the
    // sheet for nearly all of phase 2, and a shadow is the only thing to see.
    if (boss.isSubmerged()) {
      const tx = boss.position.x, ty = boss.position.y;
      const R  = cs * 4;
      const RSq = R * R;
      ctx.save();
      ctx.globalAlpha = 0.4;
      ctx.fillStyle   = '#000033';
      for (const obj of game.currentRoom.backgroundObjects) {
        if (obj.destroyed || !obj.isWater || !obj.isWater()) continue;
        const dx = obj.position.x - tx, dy = obj.position.y - ty;
        if (dx * dx + dy * dy <= RSq)
          ctx.fillRect(obj.position.x, obj.position.y, cs, cs);
      }
      ctx.restore();

      // BREACHING: the anticipation window made visible. Cracks spread outward
      // over the exact disc the eruption will crush, tightening as the timer runs
      // out, so the player can see both where it lands and how long they have.
      // Without this the telegraph is a pause with nothing to read, and the whole
      // beat becomes the coin flip the rework exists to remove.
      if (boss.state === 'breaching') this._drawBreachTelegraph(boss);
      return;  // no body rendered while submerged
    }

    // SURFACED / SLAMMING: draw composite body
    const bx = boss.position.x + cs / 2;
    const by = boss.position.y + cs / 2 + boss.jumpOffset;

    // i-frame color cycle (24 Hz) — only when iframes were triggered by player damage
    const FLASH_COLORS = ['#ff2222', '#ff8800', '#ffee00'];
    const flashColor = boss.hitFlash ? FLASH_COLORS[Math.floor(performance.now() / 1000 * 24) % FLASH_COLORS.length] : null;

    // Near-death blink (dark red) outranks the hit flash and enrage tint — mirrors the player
    const nearDeathColor = boss.getNearDeathBlinkColor();
    const hp_pct   = boss.hp / boss.maxHp;
    const BODY_CLR = nearDeathColor ?? flashColor ?? (hp_pct < 0.4 ? '#ff8888' : '#aaffff');
    // Phase 2 turns the eyes red — the one part of the composite that says the
    // thing hunting under the ice is not the same creature that was circling the
    // lake. Everything else about phase 2 is arena-level; this is the boss itself.
    const enraged  = boss.phase === 2;
    const EYE_CLR  = nearDeathColor ?? flashColor ?? (enraged ? '#ff2200' : '#ffffff');
    const RIM_CLR  = nearDeathColor ?? flashColor ?? '#4488aa';

    const draw = (offX, offY, char, color) =>
      this.renderer.drawEntity(bx + offX * cs, by + offY * cs, char, color);

    // Row -2: eyes. In phase 2 they shake — a fast sub-cell jitter, sampled per
    // eye from offset time seeds so the two never move in lockstep (synchronised
    // jitter reads as the whole head sliding, not as eyes twitching).
    if (enraged) {
      const now   = performance.now() / 1000;
      const SHAKE = cs * 0.18;
      const jitter = seed =>
        Math.sin(now * 47 + seed) * SHAKE + Math.sin(now * 31 + seed * 2.7) * SHAKE * 0.5;
      this.renderer.drawEntity(bx - 2 * cs + jitter(0),   by - 2 * cs + jitter(1.9), '◉', EYE_CLR);
      this.renderer.drawEntity(bx + 2 * cs + jitter(4.1), by - 2 * cs + jitter(6.3), '◉', EYE_CLR);
    } else {
      draw(-2, -2, '◉', EYE_CLR);  // ◉
      draw(+2, -2, '◉', EYE_CLR);
    }

    // Row -1: surface frill
    draw(-1, -1, '~', BODY_CLR);
    draw( 0, -1, '^', BODY_CLR);
    draw(+1, -1, '~', BODY_CLR);

    // Row 0: mouth — forced open during fall phase slam
    const slamming = boss.state === 'slamming';
    const falling  = slamming && boss.jumpPhase === 'fall';
    const mChars   = falling ? ['{', ' ', ' ', ' ', '}'] : boss.getMouthChars();
    for (let i = 0; i < 5; i++) {
      const c = (i === 0 || i === 4) ? RIM_CLR : BODY_CLR;
      draw(i - 2, 0, mChars[i], c);
    }

    // Row +1: exposed lower body while airborne
    if (slamming) {
      ['(', '~', '~', '~', '~', '~', ')'].forEach((ch, i) =>
        draw(i - 3, +1, ch, BODY_CLR));
    }

    // HP bar (above composite, shown only after first damage)
    if (boss.hasTakenDamage) {
      const BAR_W = cs * 6, BAR_H = 4;
      const barX  = bx - BAR_W / 2, barY = by - cs * 3.5;
      ctx.fillStyle = '#333';
      ctx.fillRect(barX, barY, BAR_W, BAR_H);
      ctx.fillStyle = '#aaffff';
      ctx.fillRect(barX, barY, BAR_W * (boss.hp / boss.maxHp), BAR_H);
    }
  }

  /**
   * The Breach telegraph: cracks radiating across the ice over the disc the
   * eruption is about to crush.
   *
   * Reads two things at once. The ring of cracks marks the danger zone at its
   * true BREACH_RADIUS, so the player learns the size by seeing it. The cracks
   * then walk inward and speed up as the timer drains, so how much time is left
   * is legible without a bar or a countdown — which the non-instructive UI rule
   * would not allow anyway.
   */
  _drawBreachTelegraph(boss) {
    const cs = GRID.CELL_SIZE;
    const bx = boss.position.x + cs / 2;
    const by = boss.position.y + cs / 2;

    // 0 at the moment the telegraph starts → 1 at the instant of eruption
    const t = 1 - Math.max(0, Math.min(1, boss.breachTimer / BREACH_TELEGRAPH));

    // Cracks close in on the centre as the timer runs out. They never reach it —
    // the ring stays wide enough to keep reading as "this whole disc", not "this
    // point", because the whole disc is what hits.
    const ringR = BREACH_RADIUS * (1 - t * 0.35);

    // Spokes multiply as it tightens: 6 at first sight, 12 at the last moment.
    const spokes = 6 + Math.round(t * 6);
    const CRACK  = ['/', '|', '\\', '-'];

    // Flicker rate ramps with t so the last half-second reads as urgent. Alpha is
    // left alone — the retro quantizer rounds it to 10% steps, so brightness is
    // carried by the colour swap instead.
    const flickerHz = 4 + t * 10;
    const on = Math.floor(performance.now() / 1000 * flickerHz) % 2 === 0;
    const crackColor = on ? '#ffffff' : (t > 0.6 ? '#88ccff' : '#5588aa');

    for (let i = 0; i < spokes; i++) {
      const angle = (Math.PI * 2 / spokes) * i + t * 0.4;
      // Two chars per spoke: one at the rim, one partway in, so the crack reads
      // as a line spreading rather than a ring of dots.
      for (const frac of [1.0, 0.62]) {
        const r  = ringR * frac;
        const cx = bx + Math.cos(angle) * r;
        const cy = by + Math.sin(angle) * r;
        // Pick the crack glyph whose orientation matches the spoke's direction
        const oct = Math.round(angle / (Math.PI / 4)) % 4;
        this.renderer.drawEntity(cx - cs / 2, cy - cs / 2, CRACK[oct], crackColor);
      }
    }
  }

  /**
   * Draw a chain of '~' chars along the line from bodyCenter to headPos.
   * Skips the first and last segment so chars don't overlap the body or head.
   */
  _drawBossNeck(headPos, bodyCenter, color) {
    const cs = GRID.CELL_SIZE;
    const hx = headPos.x + cs / 2;
    const hy = headPos.y + cs / 2;
    const dx = hx - bodyCenter.x;
    const dy = hy - bodyCenter.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 1) return;

    // Fixed segment count — spacing stretches with neck length instead of chars appearing/disappearing
    const NECK_SEGS = 7;

    // Perpendicular unit vector (rotated 90°)
    const perpX = -dy / dist;
    const perpY =  dx / dist;

    // Travelling sine wave. Envelope sin(t·π) tapers to 0 at both endpoints so the
    // neck connects smoothly to body and head rather than whipping at the joints.
    const waveAmp   = cs * 0.42;
    const timePhase = (performance.now() / 1000) * 2.2;

    for (let i = 1; i < NECK_SEGS; i++) {
      const t        = i / NECK_SEGS;
      const envelope = Math.sin(t * Math.PI);             // 0 at ends, 1 at middle
      const wave     = Math.sin(t * Math.PI * 3 - timePhase) * waveAmp * envelope;
      const nx = bodyCenter.x + dx * t + perpX * wave;
      const ny = bodyCenter.y + dy * t + perpY * wave;
      this.renderer.drawEntity(nx, ny, '~', color);
    }
  }

  /**
   * Draw a 3-char head for the given entity.
   * Middle head: <Ⲱ> (main weak point), red eye circle when vulnerable.
   * Side heads:  (ⲱ) normally, >ⲱ< when actively grabbing.
   */
  // Lerp from #22cc44 (full health) toward #cc3300 (empty) as HP drops
  _bossHeadHealthColor(entity) {
    const t = 1 - Math.max(0, entity.hp / entity.maxHp);
    const r = Math.round(0x22 + (0xcc - 0x22) * t);
    const g = Math.round(0xcc + (0x33 - 0xcc) * t);
    const b = Math.round(0x44 * (1 - t));
    return `rgb(${r},${g},${b})`;
  }

  _drawBossHead(entity, type, stunFlash, isStunned, iframeFlash = false) {
    const cs = GRID.CELL_SIZE;
    const hx = entity.position.x + cs / 2;
    const hy = entity.position.y + cs / 2;

    const dead        = entity.hp <= 0;
    const healthColor = dead ? '#555555' : this._bossHeadHealthColor(entity);
    // Near-death blink (dark red) outranks every other live color — mirrors the player
    const nearDeath   = entity.getNearDeathBlinkColor?.() ?? null;
    let color;

    if (type === 'middle') {
      const mouthOpen = entity.mouthOpenTimer > 0;
      color = dead                    ? '#555555'
            : nearDeath               ? nearDeath
            : stunFlash || iframeFlash ? '#ffffff'
            : isStunned               ? '#88bbff'
            : healthColor;
      const spread = mouthOpen ? cs * 1 : cs * 0.5;
      this.renderer.drawEntity(hx - spread, hy, '<', color);
      this.renderer.drawEntity(hx,          hy, 'Ⲱ', color);
      this.renderer.drawEntity(hx + spread, hy, '>', color);
    } else {
      const grabbing  = entity.isGrabbing;
      const mouthOpen = entity.isLunging && !grabbing;
      color = dead                    ? '#555555'
            : nearDeath               ? nearDeath
            : stunFlash || iframeFlash ? '#ffffff'
            : isStunned               ? '#88bbff'
            : grabbing                ? '#44ff66'
            : healthColor;
      // Open mouth: brackets wide; closed: brackets tucked inside the ⲱ glyph
      const spread = mouthOpen ? cs * 1.2 : cs * 0.5;
      this.renderer.drawEntity(hx - spread, hy, '<', color);
      this.renderer.drawEntity(hx,          hy, 'ⲱ', color);
      this.renderer.drawEntity(hx + spread, hy, '>', color);
    }

    if (type === 'side') return; // brackets already drawn above

    // Red eye dot above vulnerable middle head
    if (type === 'middle' && entity.vulnerable) {
      const ctx = this.renderer.fgCtx;
      ctx.save();
      ctx.fillStyle = '#ff2222';
      ctx.beginPath();
      ctx.arc(hx, hy - cs * 0.75, cs * 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // ── Hoardmaw composite (green dungeon boss) ───────────────────────────────
  // Interior coords — called under HutInteriorOverlay's translate (the vault
  // is plane-1 content; the surface pass never sees this boss). Anatomy: lid
  // bar, `$` scale field over bare hide, mouth interior during gape, ◉ glint,
  // travelling tongue. Dormant it reads as an innocuous treasure pile — the
  // ambush IS the reveal.

  renderHoardmawComposite(game) {
    const maw = game.dungeonBossSystem?.hoardmaw;
    if (!maw || maw.defeated) return;
    const cs = GRID.CELL_SIZE;
    const rect = maw.bodyRect();

    // Dormant prologue: plain pile of coins with a sealed lid line.
    if (maw.dormant) {
      for (let r = rect.rows - 2; r < rect.rows; r++) {
        for (let c = 0; c < rect.cols; c++) {
          this.renderer.drawEntity(rect.left + (c + 0.5) * cs, rect.top + (r + 0.5) * cs, '$', '#8a7a3a');
        }
      }
      for (let c = 1; c < rect.cols - 1; c++) {
        this.renderer.drawEntity(rect.left + (c + 0.5) * cs, rect.top + cs * 0.5, '=', '#6e5f2e');
      }
      return;
    }

    const gape = maw.attackState === 'inhale' || !!maw.tongue || maw.chokeTimer > 0;
    const flash = maw.hitFlash && Math.floor(performance.now() / 1000 * 24) % 2 === 0;

    // Body block: hide texture everywhere, then scales on top.
    const hideColor = flash ? '#ffffff' : '#7a5c33';
    for (let r = 1; r < rect.rows; r++) {
      for (let c = 0; c < rect.cols; c++) {
        this.renderer.drawEntity(rect.left + (c + 0.5) * cs, rect.top + (r + 0.5) * cs, '·', hideColor);
      }
    }
    for (const key of maw.scales) {
      const [r, c] = key.split(',').map(Number);
      this.renderer.drawEntity(rect.left + (c + 0.5) * cs, rect.top + (r + 0.5) * cs, '$', '#ffd700');
    }

    // Lid row: '=' when sealed; opens (draws only at the edges) in gape so the
    // dark mouth interior shows beneath.
    for (let c = 0; c < rect.cols; c++) {
      if (gape && c > 2 && c < rect.cols - 3) continue;
      this.renderer.drawEntity(rect.left + (c + 0.5) * cs, rect.top + 0.5 * cs, '=', '#c9a227');
    }

    // Mouth interior during gape: dark maw cells along the bottom-center.
    if (gape) {
      const midL = Math.floor(rect.cols / 2) - 2;
      for (let c = midL; c < midL + 5; c++) {
        this.renderer.drawEntity(rect.left + (c + 0.5) * cs, rect.top + (rect.rows - 0.5) * cs, 'o', '#3d1500');
      }
    }

    // Phase-2 glint ◉ — pulses with the maw's breath rhythm (the tell).
    if (maw.bossPhase === 2 || maw.chokeTimer > 0) {
      const g = maw.glintPx();
      const pulse = 0.55 + 0.45 * Math.sin((maw.glintPulseTimer / GLINT_PULSE_PERIOD) * Math.PI * 2);
      const glintAlpha = maw.chokeTimer > 0 ? 1 : pulse;
      this.renderer.drawTextWithAlpha(g.x + cs / 2, g.y + cs / 2, '◉', '#ffe9a8', glintAlpha);
      // Truth register: a carried Compass pulses toward the true glint —
      // same breath rhythm the glint itself reads, so the item literally
      // keeps the maw's time for you.
      if (game.dungeonBossSystem?.compassTruthActive) {
        const breath = 0.5 + 0.5 * Math.sin((maw.glintPulseTimer / GLINT_PULSE_PERIOD) * Math.PI * 2);
        this.renderer.drawTextWithAlpha(g.x + cs / 2, g.y - cs * 0.9, '⌖', '#7fdfff', 0.45 + 0.55 * breath);
      }
    }

    // Tongue strip — head cell plus a short trailing tail toward the mouth.
    if (maw.tongue) {
      const t = maw.tongue;
      this.renderer.drawEntity(t.position.x + cs / 2, t.position.y + cs / 2, '~', t.color);
      for (let i = 1; i <= 3; i++) {
        this.renderer.drawEntity(
          t.position.x - t.dirX * i * cs * 0.5 + cs / 2,
          t.position.y - t.dirY * i * cs * 0.5 + cs / 2,
          '~', '#b8892f'
        );
      }
    }

    // Slam telegraph: expanding warning ring from the body edge (flanks safe).
    if (maw.attackState === 'slamTele') {
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

    // Inhale suction: drifting motes between player and mouth read the pull.
    if (maw.inhaleActive) {
      const now = performance.now() / 120;
      for (let i = 0; i < 6; i++) {
        const t = ((now + i * 0.7) % 3) / 3; // 0..1 traveling toward mouth
        const px = game.player?.position.x ?? maw.mouthX();
        const py = game.player?.position.y ?? maw.mouthY();
        const x = px + (maw.mouthX() - px) * t;
        const y = py + (maw.mouthY() - py) * t;
        this.renderer.drawEntity(x + cs / 2, y + cs / 2, '·', '#e0a83c');
      }
    }

    // HP bar above the body (shown once damaged) — Turtle precedent.
    if (maw.hasTakenDamage) {
      const ctx = this.renderer.fgCtx;
      const BAR_W = cs * 6, BAR_H = 4;
      const barX = maw.position.x - BAR_W / 2;
      const barY = rect.top - cs * 0.8;
      ctx.fillStyle = '#333333';
      ctx.fillRect(barX, barY, BAR_W, BAR_H);
      ctx.fillStyle = maw.bossPhase >= 3 ? '#ffd700' : maw.bossPhase === 2 ? '#ffcc44' : '#22cc44';
      ctx.fillRect(barX, barY, BAR_W * Math.max(0, maw.hp / maw.maxHp), BAR_H);
    }
  }

  // ── Pandora's Box (Yellow Zone Boss) ──────────────────────────────────────

  renderPandoraBoxComposite(game) {
    const box = game.bossSystem?.pandoraBox;
    if (!box || box.hp <= 0) return;

    const cs  = GRID.CELL_SIZE;
    const ctx = this.renderer.fgCtx;
    const cx  = box.position.x;
    const cy  = box.position.y + box.bounceOffset;

    // Affinity face characters (2-face view: left face + right face)
    const FACE_CHARS = {
      red:    { left: '|', right: '/' },
      green:  { left: 'o', right: 'O' },
      blue:   { left: '*', right: '+' },
      yellow: { left: '~', right: '⚡' }
    };

    const AFFINITY_COLORS = {
      red:    '#ff3333',
      green:  '#33cc33',
      blue:   '#3388ff',
      yellow: '#ffcc00'
    };

    const face = FACE_CHARS[box.currentAffinity];
    const faceColor = AFFINITY_COLORS[box.currentAffinity];

    // I-frame flash
    const isFlashing = box.hitFlash && box.invulnerabilityTimer > 0
      && Math.floor(performance.now() / 1000 * 24) % 2 === 0;

    // Near-death blink
    const nearDeathColor = box.getNearDeathBlinkColor?.() ?? null;
    const drawColor = nearDeathColor ?? (isFlashing ? '#ffffff' : faceColor);

    // Gray top row
    const topY = cy - cs * 1.5;
    const GRAY = '#666666';
    const grayColor = isFlashing ? '#ffffff' : GRAY;

    // ── Gray top row (4 cells) ─────────────────────────────────────────────
    for (let col = -2; col <= 1; col++) {
      this.renderer.drawEntity(cx + col * cs, topY, '░', grayColor);
    }

    // ── Spinning body (4×3 cells: 4 columns, 3 rows showing 2 faces) ──────
    // The spin is animated by shifting which columns show which face.
    // During spin phase, columns shift left over time.
    const spinProgress = box.cyclePhase === 'spin' ? box.spinProgress : 0;
    const bodyTopY = cy - cs * 0.5;

    for (let row = 0; row < 3; row++) {
      for (let col = -2; col <= 1; col++) {
        // Determine which face this column shows based on spin state
        let showLeftFace;
        if (box.cyclePhase === 'spin') {
          // During spin: columns shift left, wrapping
          const shifted = col + Math.floor(spinProgress * 4);
          showLeftFace = shifted < 0;
        } else {
          // After spin: left 2 cols = current face, right 2 cols = next face preview
          showLeftFace = col < 0;
        }

        const char = showLeftFace ? face.left : face.right;
        const color = drawColor;

        // Lull dimming
        const lullDim = box.isLull ? 0.6 : 1.0;
        const finalColor = this._dimColor(color, lullDim);

        this.renderer.drawEntity(cx + col * cs, bodyTopY + row * cs, char, finalColor);
      }
    }

    // ── Phase 2 indicator: rapid color pulse on all faces ──────────────────
    if (box.bossPhase === 2) {
      const pulse = Math.sin(performance.now() / 1000 * 12) * 0.3 + 0.7;
      const pulseColor = this._dimColor(drawColor, pulse);
      // Draw a border char around the box
      for (let col = -2; col <= 1; col++) {
        this.renderer.drawEntity(cx + col * cs, bodyTopY - cs * 0.5, '·', pulseColor);
        this.renderer.drawEntity(cx + col * cs, bodyTopY + cs * 2.5, '·', pulseColor);
      }
    }

    // ── HP bar ─────────────────────────────────────────────────────────────
    if (box.hasTakenDamage) {
      const BAR_W = cs * 4;
      const BAR_H = 4;
      const barX = cx - BAR_W / 2;
      const barY = topY - cs * 1.0;
      ctx.fillStyle = '#333333';
      ctx.fillRect(barX, barY, BAR_W, BAR_H);
      ctx.fillStyle = box.bossPhase === 2 ? '#ffcc00' : '#8844ff';
      ctx.fillRect(barX, barY, BAR_W * Math.max(0, box.hp / box.maxHp), BAR_H);
    }
  }

  _dimColor(hexColor, factor) {
    // Simple brightness multiplier on a hex color
    const r = parseInt(hexColor.slice(1, 3), 16);
    const g = parseInt(hexColor.slice(3, 5), 16);
    const b = parseInt(hexColor.slice(5, 7), 16);
    return `rgb(${Math.round(r * factor)},${Math.round(g * factor)},${Math.round(b * factor)})`;
  }
}
