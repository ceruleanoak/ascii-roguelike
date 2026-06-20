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
    if (!bs?.active) return;
    if (bs.lakeBoss)    { this.renderLakeBossComposite(game); return; }
    if (bs.turtleShell) { this.renderTurtleBossComposite(game); return; }
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

    // UNDERWATER: darken nearby water tiles; don't render body
    if (boss.state === 'underwater') {
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
    const EYE_CLR  = '#ffffff';
    const RIM_CLR  = nearDeathColor ?? flashColor ?? '#4488aa';

    const draw = (offX, offY, char, color) =>
      this.renderer.drawEntity(bx + offX * cs, by + offY * cs, char, color);

    // Row -2: eyes
    draw(-2, -2, '◉', EYE_CLR);  // ◉
    draw(+2, -2, '◉', EYE_CLR);

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
}
