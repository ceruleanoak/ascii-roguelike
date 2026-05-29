/**
 * RestRenderer - Renders the REST state (safe hub area)
 *
 * Responsibilities:
 * - Render background with crafting station and equipment slots
 * - Display warp zone indicator for north exit
 * - Highlight interactive slots when player is near
 * - Show projectiles and melee attacks (weapon preview)
 * - Display particles, NPCs, and player
 * - Show WASD movement keys and arrow dodge keys
 * - Display contextual floating text
 * - Show pickup messages and path announcements
 * - Render inventory overlay when 'i' is held
 * - Render cheat menu if open
 */

import { GRID, COLORS, EQUIPMENT, CRAFTING } from '../../game/GameConfig.js';
import { getItemData } from '../../data/items.js';
import { PixelatedDissolve } from '../effects/TextEffects.js';

export class RestRenderer {
  constructor(renderer, renderController) {
    this.renderer = renderer;
    this.renderController = renderController;
    // Dissolve effect for the CRAFT label (fades in/out based on proximity)
    this._craftDissolve = new PixelatedDissolve({ speed: 1.5, blockSize: 6 });
    // Vacuum particle state — pixel motes cycling upward into the north exit
    this._vacuumParticles = [];
    this._lastVacuumTime = 0;
    for (let i = 0; i < 24; i++) {
      this._vacuumParticles.push(this._makeVacuumParticle());
    }
  }

  render(game) {
    // Guard: Make sure player exists
    if (!game.player) {
      return;
    }

    // Render background (only if dirty)
    if (this.renderer.backgroundDirty) {
      this.renderer.clearBackground();
      // REST always has north exit open
      this.renderer.drawBorder({ north: true, south: false, east: false, west: false });

      // Draw crafting station
      this.renderController.craftingStation.render(game);

      this.renderer.backgroundDirty = false;
    }

    // Equipment slots redraw every frame (outside dirty gate) so the empty-slot
    // blink animation can update — same pattern as ArrowKeyIndicators below.
    this.renderController.equipmentSlots.render(game);

    // Render foreground
    this.renderer.clearForeground();

    // Vacuum particles — pixel-sized motes slowly drawn toward the north exit
    const _vpNow = performance.now();
    const _vpDt = Math.min((_vpNow - (this._lastVacuumTime || _vpNow)) / 1000, 0.05);
    this._lastVacuumTime = _vpNow;
    this._updateAndDrawVacuumParticles(_vpDt);

    // Cycling upgrade animation on center crafting slot (updates every frame)
    this.renderController.craftingStation.renderForeground(game);

    // Draw active quick slot's chest in white on foreground (updates every frame)
    if (game.player) {
      const chestYs = [EQUIPMENT.CHEST1_Y, EQUIPMENT.CHEST2_Y, EQUIPMENT.CHEST3_Y];
      const activeIdx = game.player.activeSlotIndex;
      const activeChestY = chestYs[activeIdx];
      const item = game.player.quickSlots[activeIdx];
      const char = item ? item.char : String(activeIdx + 1);

      this.renderer.fgCtx.save();
      this.renderer.fgCtx.font = `${GRID.CELL_SIZE}px 'Unifont', monospace`;
      this.renderer.fgCtx.textAlign = 'center';
      this.renderer.fgCtx.textBaseline = 'middle';
      const halfCell = GRID.CELL_SIZE / 2;
      const chestBaseY = activeChestY * GRID.CELL_SIZE + halfCell;

      this.renderer.fgCtx.fillStyle = '#ffffff';
      this.renderer.fgCtx.fillText('[', (EQUIPMENT.CHEST_X - 1) * GRID.CELL_SIZE + halfCell, chestBaseY);
      this.renderer.fgCtx.fillText(']', (EQUIPMENT.CHEST_X + 1) * GRID.CELL_SIZE + halfCell, chestBaseY);
      this.renderer.fgCtx.fillStyle = item ? (item.color || '#ffffff') : '#ffffff';
      this.renderer.fgCtx.fillText(char, EQUIPMENT.CHEST_X * GRID.CELL_SIZE + halfCell, chestBaseY);
      this.renderer.fgCtx.restore();
    }

    // Highlight the nearest interactive slot only (prevents multi-slot highlighting)
    const nearestSlot = game.getNearestInteractiveSlot();

    // Determine which single object shows a floating hint — nearest wins, no overlaps.
    // To add a new interactive object, push a { source, dist } entry here.
    const _hintCandidates = [];
    if (nearestSlot) {
      const slotPx = nearestSlot.x * GRID.CELL_SIZE + GRID.CELL_SIZE / 2;
      const slotPy = nearestSlot.y * GRID.CELL_SIZE + GRID.CELL_SIZE / 2;
      _hintCandidates.push({ source: 'slot', dist: Math.hypot(game.player.position.x - slotPx, game.player.position.y - slotPy) });
    }
    if (game.restBundle) {
      const d = Math.hypot(game.player.position.x - game.restBundle.position.x, game.player.position.y - game.restBundle.position.y);
      if (d < GRID.CELL_SIZE * 3) _hintCandidates.push({ source: 'bundle', dist: d });
    }
    if (game.tombstoneActive && game.lastDeathCause && !game.tombstonePopup) {
      const _tombPx = (GRID.COLS - 4) * GRID.CELL_SIZE + GRID.CELL_SIZE / 2;
      const _tombPy = 2 * GRID.CELL_SIZE + GRID.CELL_SIZE / 2;
      const d = Math.hypot(game.player.position.x - _tombPx, game.player.position.y - _tombPy);
      if (d < GRID.CELL_SIZE * 3) _hintCandidates.push({ source: 'tombstone', dist: d });
    }
    _hintCandidates.sort((a, b) => a.dist - b.dist);
    const activeHint = _hintCandidates.length > 0 ? _hintCandidates[0].source : null;

    if (nearestSlot) {
      let highlightX, highlightY;

      // Determine highlight position based on slot type
      if (nearestSlot.type.startsWith('crafting-')) {
        highlightX = (nearestSlot.x + 1) * GRID.CELL_SIZE;
        highlightY = nearestSlot.y * GRID.CELL_SIZE;
      } else {
        highlightX = nearestSlot.x * GRID.CELL_SIZE;
        highlightY = nearestSlot.y * GRID.CELL_SIZE;
      }

      this.renderer.drawRect(
        highlightX,
        highlightY,
        GRID.CELL_SIZE,
        GRID.CELL_SIZE,
        COLORS.HIGHLIGHT,
        true
      );
    }

    // Draw projectiles (for weapon preview)
    for (const proj of game.combatSystem.getProjectiles()) {
      const cx = proj.position.x + GRID.CELL_SIZE / 2;
      const cy = proj.position.y + GRID.CELL_SIZE / 2;
      if (proj.drawAngle != null) {
        this.renderer.drawEntityRotated(cx, cy, proj.char, proj.color, proj.drawAngle);
      } else {
        this.renderer.drawEntity(cx, cy, proj.char, proj.color);
      }
    }

    // Draw melee attacks (for weapon preview)
    for (const attack of game.combatSystem.getMeleeAttacks()) {
      this.renderer.drawEntity(
        attack.position.x + GRID.CELL_SIZE / 2,
        attack.position.y + GRID.CELL_SIZE / 2,
        attack.char,
        attack.color
      );
    }

    // Draw particles (dodge trails, explosions, etc.)
    for (const particle of game.particles) {
      if (particle.getAlpha) {
        // Particle class instance
        const alpha = particle.getAlpha();
        this.renderer.drawTextWithAlpha(
          particle.position.x + GRID.CELL_SIZE / 2,
          particle.position.y + GRID.CELL_SIZE / 2,
          particle.char,
          particle.color,
          alpha
        );
      } else {
        // Simple particle object
        const alpha = Math.max(0, particle.life / particle.maxLife);
        this.renderer.drawTextWithAlpha(
          particle.x,
          particle.y,
          particle.char,
          particle.color,
          alpha
        );
      }
    }

    // Draw starter bundle (world object, destroyed on SPACE)
    if (game.restBundle) {
      // Gentle sinusoidal bob so the satchel reads as a pickup, not scenery.
      const bobOffset = Math.sin(performance.now() / 400) * 3;
      this.renderer.drawEntity(
        game.restBundle.position.x + GRID.CELL_SIZE / 2,
        game.restBundle.position.y + GRID.CELL_SIZE / 2 + bobOffset,
        game.restBundle.char,
        game.restBundle.color
      );

      // Blinking yellow up-arrow under the bundle once the player has been to EXPLORE —
      // a gentle nudge that this starter satchel is still sitting unclaimed.
      if (game.hasLeftRestOnce && (performance.now() % 1000) < 500) {
        this.renderer.fgCtx.save();
        this.renderer.fgCtx.font = `${GRID.CELL_SIZE * 0.7}px 'Unifont', monospace`;
        this.renderer.fgCtx.textAlign = 'center';
        this.renderer.fgCtx.textBaseline = 'middle';
        this.renderer.fgCtx.fillStyle = '#ffcc33';
        this.renderer.fgCtx.fillText(
          '↑',
          game.restBundle.position.x + GRID.CELL_SIZE / 2,
          game.restBundle.position.y + GRID.CELL_SIZE * 1.5
        );
        this.renderer.fgCtx.restore();
      }

      // Show PRESS SPACE when player is near the bundle (activeHint guards against overlap)
      if (activeHint === 'bundle') {
        this.renderer.fgCtx.save();
        this.renderer.fgCtx.font = `${GRID.CELL_SIZE * 0.8}px 'VentureArcade', 'Unifont', monospace`;
        this.renderer.fgCtx.textAlign = 'center';
        this.renderer.fgCtx.textBaseline = 'middle';
        this.renderer.fgCtx.fillStyle = COLORS.TEXT;
        this.renderer.fgCtx.fillText(
          'SPACE',
          game.player.position.x + GRID.CELL_SIZE / 2,
          game.player.position.y - GRID.CELL_SIZE * 1.5
        );
        this.renderer.fgCtx.restore();
      }
    }

    // Draw ingredients
    for (const ingredient of game.ingredients) {
      this.renderer.drawEntity(
        ingredient.position.x + GRID.CELL_SIZE / 2,
        ingredient.position.y + GRID.CELL_SIZE / 2,
        ingredient.char,
        ingredient.color
      );
    }

    // Draw items
    for (const item of game.items) {
      this.renderer.drawEntity(
        item.position.x + GRID.CELL_SIZE / 2,
        item.position.y + GRID.CELL_SIZE / 2,
        item.char,
        item.color
      );
    }

    // Draw character NPCs (other unlocked characters)
    for (const npc of game.characterNPCs) {
      npc.render(this.renderer.fgCtx, (gx, gy) => ({
        x: gx * GRID.CELL_SIZE,
        y: gy * GRID.CELL_SIZE
      }));
    }

    // Draw player (with i-frame alpha fade and status color)
    const playerAlpha = game.player.getVisibilityAlpha();
    const playerColor = game.player.getDisplayColor();
    this.renderer.drawTextWithAlpha(
      game.player.position.x + GRID.CELL_SIZE / 2,
      game.player.position.y + GRID.CELL_SIZE / 2,
      game.player.char,
      playerColor,
      playerAlpha
    );

    // Draw bow charge indicator (shared between REST and EXPLORE states)
    this.renderController.bowChargeIndicator.render(game);

    // Draw green ranger action cooldown indicator
    this.renderController.greenRangerIndicator.render(game);

    // Draw contextual floating text above player when near a slot
    if (nearestSlot && activeHint === 'slot') {
      this.renderer.fgCtx.save();
      this.renderer.fgCtx.font = `${GRID.CELL_SIZE * 0.8}px 'VentureArcade', 'Unifont', monospace`;
      this.renderer.fgCtx.textAlign = 'center';
      this.renderer.fgCtx.textBaseline = 'middle';
      const floatingTextY = game.player.position.y - GRID.CELL_SIZE * 1.5;

      // Try to read the item occupying this slot and show its name in slot color
      let slotItemName = null;
      let slotItemColor = COLORS.TEXT;

      if (nearestSlot.type === 'equipment-chest1') {
        const item = game.player.quickSlots[0];
        if (item) { slotItemName = item.data.name; slotItemColor = '#ff4444'; }
      } else if (nearestSlot.type === 'equipment-chest2') {
        const item = game.player.quickSlots[1];
        if (item) { slotItemName = item.data.name; slotItemColor = '#ff4444'; }
      } else if (nearestSlot.type === 'equipment-chest3') {
        const item = game.player.quickSlots[2];
        if (item) { slotItemName = item.data.name; slotItemColor = '#ff4444'; }
      } else if (nearestSlot.type === 'equipment-armor') {
        const armor = game.inventorySystem.equippedArmor;
        if (armor) { slotItemName = armor.data.name; slotItemColor = '#4488ff'; }
      } else if (nearestSlot.type === 'equipment-consumable1') {
        const cons = game.inventorySystem.equippedConsumables[0];
        if (cons) { slotItemName = cons.data.name; slotItemColor = '#ffff00'; }
      } else if (nearestSlot.type === 'equipment-consumable2') {
        const cons = game.inventorySystem.equippedConsumables[1];
        if (cons) { slotItemName = cons.data.name; slotItemColor = '#ffff00'; }
      } else if (nearestSlot.type === 'equipment-consumable3') {
        const cons = game.inventorySystem.equippedConsumables[2];
        if (cons) { slotItemName = cons.data.name; slotItemColor = '#ffff00'; }
      } else if (nearestSlot.type.startsWith('crafting-')) {
        const state = game.craftingSystem.getState();
        const charMap = { 'crafting-left': state.leftSlot, 'crafting-right': state.rightSlot, 'crafting-center': state.centerSlot };
        const char = charMap[nearestSlot.type];
        if (char) {
          const data = getItemData(char);
          if (data) { slotItemName = data.name; slotItemColor = COLORS.ITEM; }
        }
      }

      if (slotItemName) {
        this.renderer.fgCtx.fillStyle = slotItemColor;
        this.renderer.fgCtx.fillText(slotItemName.toUpperCase(), game.player.position.x + GRID.CELL_SIZE / 2, floatingTextY);
      } else {
        // Slot is empty — show interaction hint
        this.renderer.fgCtx.fillStyle = COLORS.TEXT;
        const hintText = nearestSlot.type.startsWith('crafting-') ? 'SPACE / SHIFT' : 'SPACE';
        this.renderer.fgCtx.fillText(hintText, game.player.position.x + GRID.CELL_SIZE / 2, floatingTextY);
      }

      this.renderer.fgCtx.restore();
    }

    // Draw "E X P L O R E" label — per-letter so recently-pressed keys blink
    this._drawLitLabel(
      this.renderer.fgCtx,
      ' E X P L O R E',
      GRID.WIDTH / 2,
      4 * GRID.CELL_SIZE + GRID.CELL_SIZE / 2 + 5,
      game.keyFlashMap
    );

    // Draw "C R A F T" label — dissolves in when player is near the crafting station,
    // with per-letter key-buffer highlighting overlaid on top.
    const craftText = ' C R A F T';
    const craftLabelX = GRID.WIDTH / 2;
    const craftLabelY = (CRAFTING.STATION_Y + 2) * GRID.CELL_SIZE + GRID.CELL_SIZE / 2;
    const stationPx = CRAFTING.CENTER_SLOT_X * GRID.CELL_SIZE + GRID.CELL_SIZE / 2;
    const stationPy = CRAFTING.STATION_Y * GRID.CELL_SIZE + GRID.CELL_SIZE / 2;
    const craftDist = Math.hypot(
      game.player.position.x - stationPx,
      game.player.position.y - stationPy
    );
    const nearCraft = craftDist < GRID.CELL_SIZE * 3;

    this._craftDissolve.render(this.renderer.fgCtx, {
      text: craftText,
      font: `${GRID.CELL_SIZE}px 'VentureArcade', 'Unifont', monospace`,
      color: '#666666',
      x: craftLabelX,
      y: craftLabelY,
      visible: nearCraft,
    });

    // Overlay lit letters on top of the dissolve (one-shot blink)
    if (this._craftDissolve.alpha > 0) {
      const FLASH_MS = 220;
      const now = performance.now();
      const flashMap = game.keyFlashMap || {};
      const ctx = this.renderer.fgCtx;
      ctx.save();
      ctx.globalAlpha = this._craftDissolve.alpha;
      ctx.font = `${GRID.CELL_SIZE}px 'VentureArcade', 'Unifont', monospace`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      const totalW = ctx.measureText(craftText).width;
      const charW = totalW / craftText.length;
      let cx = craftLabelX - totalW / 2;
      for (const ch of craftText) {
        const upper = ch.toUpperCase();
        if (upper !== ' ' && flashMap[upper] !== undefined && (now - flashMap[upper]) < FLASH_MS) {
          ctx.fillStyle = '#7a7a7a';
          ctx.fillText(ch, cx, craftLabelY);
        }
        cx += charW;
      }
      ctx.globalAlpha = 1;
      ctx.restore();
    }

    // === LEFT SIDE: WASD KEYS WITH "M O V E" ===
    const wasdY = GRID.HEIGHT - GRID.CELL_SIZE * 5;
    const wasdCenterX = GRID.WIDTH / 4; // Left quarter of screen

    // Determine colors based on key state (highlight when pressed) and inactivity blinking
    const isInactive = game.inactivityTimer >= game.INACTIVITY_THRESHOLD;
    const blinkWhite = isInactive && game.wasdBlinkState;
    const inactiveColor = blinkWhite ? '#FFFFFF' : COLORS.TEXT;

    const wColor = game.keys.w ? COLORS.ITEM : (isInactive ? inactiveColor : COLORS.TEXT);
    const aColor = game.keys.a ? COLORS.ITEM : (isInactive ? inactiveColor : COLORS.TEXT);
    const sColor = game.keys.s ? COLORS.ITEM : (isInactive ? inactiveColor : COLORS.TEXT);
    const dColor = game.keys.d ? COLORS.ITEM : (isInactive ? inactiveColor : COLORS.TEXT);

    // Temporarily use lighter font for keys
    this.renderer.bgCtx.save();
    this.renderer.bgCtx.font = `${GRID.CELL_SIZE}px 'Unifont', monospace`;

    // W key (top)
    this.renderer.drawCell(
      Math.floor(wasdCenterX / GRID.CELL_SIZE) - 1,
      Math.floor(wasdY / GRID.CELL_SIZE),
      '[',
      COLORS.BORDER
    );
    this.renderer.drawCell(
      Math.floor(wasdCenterX / GRID.CELL_SIZE),
      Math.floor(wasdY / GRID.CELL_SIZE),
      'W',
      wColor
    );
    this.renderer.drawCell(
      Math.floor(wasdCenterX / GRID.CELL_SIZE) + 1,
      Math.floor(wasdY / GRID.CELL_SIZE),
      ']',
      COLORS.BORDER
    );

    // A S D keys (bottom row)
    const wasdBottomRowY = Math.floor(wasdY / GRID.CELL_SIZE) + 1;

    // A key (left)
    this.renderer.drawCell(
      Math.floor(wasdCenterX / GRID.CELL_SIZE) - 5,
      wasdBottomRowY,
      '[',
      COLORS.BORDER
    );
    this.renderer.drawCell(
      Math.floor(wasdCenterX / GRID.CELL_SIZE) - 4,
      wasdBottomRowY,
      'A',
      aColor
    );
    this.renderer.drawCell(
      Math.floor(wasdCenterX / GRID.CELL_SIZE) - 3,
      wasdBottomRowY,
      ']',
      COLORS.BORDER
    );

    // S key (center)
    this.renderer.drawCell(
      Math.floor(wasdCenterX / GRID.CELL_SIZE) - 1,
      wasdBottomRowY,
      '[',
      COLORS.BORDER
    );
    this.renderer.drawCell(
      Math.floor(wasdCenterX / GRID.CELL_SIZE),
      wasdBottomRowY,
      'S',
      sColor
    );
    this.renderer.drawCell(
      Math.floor(wasdCenterX / GRID.CELL_SIZE) + 1,
      wasdBottomRowY,
      ']',
      COLORS.BORDER
    );

    // D key (right)
    this.renderer.drawCell(
      Math.floor(wasdCenterX / GRID.CELL_SIZE) + 3,
      wasdBottomRowY,
      '[',
      COLORS.BORDER
    );
    this.renderer.drawCell(
      Math.floor(wasdCenterX / GRID.CELL_SIZE) + 4,
      wasdBottomRowY,
      'D',
      dColor
    );
    this.renderer.drawCell(
      Math.floor(wasdCenterX / GRID.CELL_SIZE) + 5,
      wasdBottomRowY,
      ']',
      COLORS.BORDER
    );

    // === RIGHT SIDE: ARROW KEYS WITH "D O D G E" ===
    this.renderController.arrowKeyIndicators.render(game);

    // Restore original font
    this.renderer.bgCtx.restore();

    // Draw "M O V E" text below WASD (left side)
    this.renderer.fgCtx.save();
    this.renderer.fgCtx.font = `${GRID.CELL_SIZE * 0.7}px 'VentureArcade', 'Unifont', monospace`;
    this.renderer.fgCtx.textBaseline = 'middle';
    this.renderer.fgCtx.textAlign = 'center';
    const labelY = GRID.HEIGHT - GRID.CELL_SIZE * 2;

    this.renderer.fgCtx.fillStyle = COLORS.TEXT;
    this.renderer.fgCtx.fillText('M O V E', wasdCenterX, labelY);

    this.renderer.fgCtx.restore();

    // Draw pickup message if active (crafted items)
    if (game.pickupMessage && game.pickupMessageTimer > 0) {
      const ctx = this.renderer.fgCtx;
      ctx.save();
      ctx.font = `${GRID.CELL_SIZE * 2}px 'VentureArcade', 'Unifont', monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = COLORS.ITEM;
      this.renderer.drawWrappedText(ctx, game.pickupMessage, GRID.WIDTH / 2, GRID.HEIGHT / 2 - 100, GRID.WIDTH * 0.8, GRID.CELL_SIZE * 2.5);
      ctx.restore();
    }

    // Draw path announcement if active (Path Amulet)
    if (game.pathAnnouncement && game.pathAnnouncementTimer > 0) {
      this.renderer.fgCtx.save();
      this.renderer.fgCtx.font = `${GRID.CELL_SIZE * 2}px 'VentureArcade', 'Unifont', monospace`;
      this.renderer.fgCtx.textAlign = 'center';
      this.renderer.fgCtx.textBaseline = 'middle';
      this.renderer.fgCtx.fillStyle = '#ffaa00'; // Yellow-orange for path
      this.renderer.fgCtx.fillText(game.pathAnnouncement, GRID.WIDTH / 2, GRID.HEIGHT / 2 - 100);
      this.renderer.fgCtx.restore();
    }

    // Draw tombstone in top-right corner (visible after death, gone when entering explore)
    if (game.tombstoneActive && game.lastDeathCause) {
      const tombCol = GRID.COLS - 4;
      const tombRow = 2;
      const tombPx = tombCol * GRID.CELL_SIZE + GRID.CELL_SIZE / 2;
      const tombPy = tombRow * GRID.CELL_SIZE + GRID.CELL_SIZE / 2;

      this.renderer.fgCtx.save();
      this.renderer.fgCtx.font = `${GRID.CELL_SIZE}px 'Unifont', monospace`;
      this.renderer.fgCtx.textAlign = 'center';
      this.renderer.fgCtx.textBaseline = 'middle';
      this.renderer.fgCtx.fillStyle = '#888888';
      this.renderer.fgCtx.fillText('\u2020', tombPx, tombPy);
      this.renderer.fgCtx.restore();

      // Show SPACE hint when player is near the tombstone (activeHint guards against overlap)
      if (activeHint === 'tombstone') {
        this.renderer.fgCtx.save();
        this.renderer.fgCtx.font = `${GRID.CELL_SIZE * 0.8}px 'VentureArcade', 'Unifont', monospace`;
        this.renderer.fgCtx.textAlign = 'center';
        this.renderer.fgCtx.textBaseline = 'middle';
        this.renderer.fgCtx.fillStyle = COLORS.TEXT;
        this.renderer.fgCtx.fillText('SPACE', game.player.position.x + GRID.CELL_SIZE / 2, game.player.position.y - GRID.CELL_SIZE * 1.5);
        this.renderer.fgCtx.restore();
      }
    }

    // Render tombstone popup
    if (game.tombstonePopup && game.lastDeathCause) {
      this._renderTombstonePopup(game);
    }

    // Render slot popup (animated expand box before equipment/crafting menus open)
    if (game.slotPopup) {
      this._renderSlotPopup(game);
    }

    // Draw inventory overlay when Tab is held
    if (game.keys.tab) {
      this.renderController.inventoryOverlay.render(game);
    }

    // Render cheat menu overlay (if open)
    game.cheatMenu.render(this.renderer);
  }

  /** Creates a single vacuum particle with a random initial cycle phase. */
  _makeVacuumParticle() {
    const colors = ['#8ab4cc', '#9cc4d8', '#b2d2e2', '#c4dce8'];
    return {
      // Wider spread at bottom, converges toward center as particles rise
      xOffset: (Math.random() - 0.5) * GRID.CELL_SIZE * 4,
      // Phase 0→1: particle travels from 2 cells below exit up to the gap
      t: Math.random(),
      cycleSpeed: 0.20 + Math.random() * 0.12,  // full cycle in ~4–5 s
      size: Math.random() < 0.65 ? 1 : 2,
      color: colors[Math.floor(Math.random() * colors.length)],
      maxAlpha: 0.3 + Math.random() * 0.4,
    };
  }

  /** Advances each particle's cycle phase and draws it within the 2-cell exit zone. */
  _updateAndDrawVacuumParticles(dt) {
    const exitX = GRID.WIDTH / 2;
    // Zone reaches from the exit gap down to the top of the EXPLORE label
    const zoneDepth = 4 * GRID.CELL_SIZE + GRID.CELL_SIZE / 2 + 5;
    const ctx = this.renderer.fgCtx;

    for (const p of this._vacuumParticles) {
      p.t = (p.t + p.cycleSpeed * dt) % 1;

      // t=0 → bottom of zone (at EXPLORE label), t=1 → at the exit gap
      const y = (1 - p.t) * zoneDepth;
      // Spread converges toward center as the particle rises toward the exit
      const x = exitX + p.xOffset * (1 - p.t * 0.65);

      // Alpha envelope: fade in [0, 0.25], hold [0.25, 0.72], fade out [0.72, 1]
      let env;
      if (p.t < 0.25) {
        env = p.t / 0.25;
      } else if (p.t < 0.72) {
        env = 1;
      } else {
        env = 1 - (p.t - 0.72) / 0.28;
      }

      const drawAlpha = env * p.maxAlpha;
      if (drawAlpha < 0.01) continue;

      ctx.globalAlpha = drawAlpha;
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(x - p.size * 0.5), Math.round(y - p.size * 0.5), p.size, p.size);
    }

    ctx.globalAlpha = 1;
  }

  /** Renders a spaced-letter label with recently-pressed keys shown in light gray. */
  _drawLitLabel(ctx, text, centerX, y, keyFlashMap = {}) {
    const FLASH_MS = 220;
    const now = performance.now();
    ctx.save();
    ctx.font = `${GRID.CELL_SIZE}px 'VentureArcade', 'Unifont', monospace`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const totalW = ctx.measureText(text).width;
    const charW = totalW / text.length;
    let cx = centerX - totalW / 2;
    for (const ch of text) {
      const upper = ch.toUpperCase();
      const isLit = upper !== ' ' && keyFlashMap[upper] !== undefined && (now - keyFlashMap[upper]) < FLASH_MS;
      ctx.fillStyle = isLit ? '#7a7a7a' : '#666666';
      ctx.fillText(ch, cx, y);
      cx += charW;
    }
    ctx.restore();
  }

  _renderTombstonePopup(game) {
    const { phase } = game.tombstonePopup;
    const cause = game.lastDeathCause;
    const ctx = this.renderer.fgCtx;

    // Box dimensions by phase (in pixels)
    const sizes = [
      { w: 80,  h: 48  },  // phase 0: small empty
      { w: 208, h: 80  },  // phase 1: medium empty
      { w: 336, h: 128 }   // phase 2: full with text
    ];
    const { w, h } = sizes[Math.min(phase, 2)];
    const cx = GRID.WIDTH / 2;
    const cy = GRID.HEIGHT / 2;
    const x = cx - w / 2;
    const y = cy - h / 2;

    ctx.save();

    // Background fill
    ctx.fillStyle = 'rgba(10, 10, 10, 0.94)';
    ctx.fillRect(x, y, w, h);

    // Border
    ctx.strokeStyle = '#555555';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);

    if (phase >= 2 && cause) {
      const padX = 14;
      const padY = 14;
      const textMaxW = w - padX * 2;

      // Header: "ended by [Name]"
      ctx.font = `${GRID.CELL_SIZE * 0.85}px 'VentureArcade', 'Unifont', monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillStyle = '#cccccc';
      ctx.fillText('ended by', cx, y + padY);

      ctx.font = `${GRID.CELL_SIZE}px 'VentureArcade', 'Unifont', monospace`;
      ctx.fillStyle = cause.color || '#ffffff';
      const nameY = y + padY + GRID.CELL_SIZE * 0.9;
      ctx.fillText(cause.name.toUpperCase(), cx, nameY);

      // Separator line
      const sepY = nameY + GRID.CELL_SIZE + 4;
      ctx.strokeStyle = '#444444';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + padX, sepY);
      ctx.lineTo(x + w - padX, sepY);
      ctx.stroke();

      // Description text (word-wrapped)
      if (cause.description) {
        ctx.font = `11px 'Unifont', monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillStyle = '#999999';
        this.renderer.drawWrappedText(ctx, cause.description, cx, sepY + 10, textMaxW, 14);
      }
    }

    ctx.restore();
  }

  _renderSlotPopup(game) {
    const { phase } = game.slotPopup;
    const ctx = this.renderer.fgCtx;
    const sizes = [
      { w: 80,  h: 48 },  // phase 0: small empty
      { w: 208, h: 80 },  // phase 1: medium empty
    ];
    const { w, h } = sizes[Math.min(phase, 1)];
    const x = GRID.WIDTH / 2 - w / 2;
    const y = GRID.HEIGHT / 2 - h / 2;

    ctx.save();
    ctx.fillStyle = 'rgba(10, 10, 10, 0.94)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#555555';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
    ctx.restore();
  }
}
