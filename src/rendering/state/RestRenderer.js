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
import { spectaclesTransform, spectaclesTransformString, isSpectaclesActive, CIPHER_FONT_SCALE, cipherFont } from '../../data/cipher.js';

const IDLE_ECHO_DURATION = 0.5;          // seconds — must match WorldEffectsSystem's IDLE_ECHO_DURATION
const IDLE_ECHO_MAX_RADIUS = GRID.CELL_SIZE * 1.5;

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

    // Spectacles state — used at multiple keystroke-label sites below.
    const spectaclesOn = isSpectaclesActive(game);

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

    // Draw armed consumable slot's chest in white on foreground (parity with weapon highlight)
    const selectedConsumableIdx = game.player?.selectedConsumableIndex ?? -1;
    if (selectedConsumableIdx >= 0) {
      const consumableYs = [
        EQUIPMENT.CONSUMABLE1_Y, EQUIPMENT.CONSUMABLE2_Y, EQUIPMENT.CONSUMABLE3_Y,
        EQUIPMENT.CONSUMABLE4_Y, EQUIPMENT.CONSUMABLE5_Y
      ];
      const consumableY = consumableYs[selectedConsumableIdx];
      const consumable = game.player.equippedConsumables?.[selectedConsumableIdx];

      this.renderer.fgCtx.save();
      this.renderer.fgCtx.font = `${GRID.CELL_SIZE}px 'Unifont', monospace`;
      this.renderer.fgCtx.textAlign = 'center';
      this.renderer.fgCtx.textBaseline = 'middle';
      const halfCell = GRID.CELL_SIZE / 2;
      const consumableBaseY = consumableY * GRID.CELL_SIZE + halfCell;

      this.renderer.fgCtx.fillStyle = '#ffffff';
      this.renderer.fgCtx.fillText('[', (EQUIPMENT.CONSUMABLE1_X - 1) * GRID.CELL_SIZE + halfCell, consumableBaseY);
      this.renderer.fgCtx.fillText(']', (EQUIPMENT.CONSUMABLE1_X + 1) * GRID.CELL_SIZE + halfCell, consumableBaseY);
      if (consumable) {
        this.renderer.fgCtx.fillStyle = consumable.color || '#ffffff';
        this.renderer.fgCtx.fillText(consumable.char, EQUIPMENT.CONSUMABLE1_X * GRID.CELL_SIZE + halfCell, consumableBaseY);
      }
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
      const cx = attack.position.x + GRID.CELL_SIZE / 2;
      const cy = attack.position.y + GRID.CELL_SIZE / 2;
      const scale = attack.drawScale || 1.0;
      if (attack.drawAngle != null) {
        this.renderer.drawEntityRotated(cx, cy, attack.char, attack.color, attack.drawAngle, scale);
      } else if (scale !== 1.0) {
        this.renderer.drawEntityScaled(cx, cy, attack.char, attack.color, scale);
      } else {
        this.renderer.drawEntity(cx, cy, attack.char, attack.color);
      }
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

    // Draw thrown weapons in-flight (SHIFT throw from REST mode)
    this.renderController.exploreRenderer.drawInFlightTraps(game, false);

    // Draw idle echoes — expanding fade-out ring shown when SPACE had nothing to interact
    // with. Tracks the player's live position rather than a captured spawn point, so the
    // ring follows the player if they move while it's still fading.
    if (game.idleEchoes.length) {
      const echoX = game.player.position.x + GRID.CELL_SIZE / 2;
      const echoY = game.player.position.y + GRID.CELL_SIZE / 2;
      for (const echo of game.idleEchoes) {
        const t = echo.age / IDLE_ECHO_DURATION;
        this.renderer.drawCircle(echoX, echoY, IDLE_ECHO_MAX_RADIUS * t, COLORS.ITEM, false, 1.0 - t);
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
        this.renderer.fgCtx.font = spectaclesOn
          ? `${Math.round(GRID.CELL_SIZE * 0.8 * CIPHER_FONT_SCALE)}px 'Unifont', monospace`
          : `${GRID.CELL_SIZE * 0.8}px 'VentureArcade', 'Unifont', monospace`;
        this.renderer.fgCtx.textAlign = 'center';
        this.renderer.fgCtx.textBaseline = 'middle';
        this.renderer.fgCtx.fillStyle = COLORS.TEXT;
        this.renderer.fgCtx.fillText(
          spectaclesTransformString('SPACE', spectaclesOn),
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

    // Follower flock (persists across rooms after feeding events).
    if (game.followerCrows && game.followerCrows.length > 0) {
      for (const f of game.followerCrows) {
        const fOff = f.getRenderOffsetY();
        this.renderer.drawEntity(
          f.position.x + GRID.CELL_SIZE / 2,
          f.position.y + GRID.CELL_SIZE / 2 + fOff,
          f.char,
          f.color
        );
      }
    }

    // Companion crows: persist across states; perch around the player.
    if (game.companionCrows && game.companionCrows.length > 0) {
      for (const c of game.companionCrows) {
        const offY = c.getRenderOffsetY();
        this.renderer.drawEntity(
          c.position.x + GRID.CELL_SIZE / 2,
          c.position.y + GRID.CELL_SIZE / 2 + offY,
          c.char,
          c.color
        );
      }
    }

    // Draw bow charge indicator (shared between REST and EXPLORE states)
    this.renderController.bowChargeIndicator.render(game);

    // Draw green ranger action cooldown indicator
    this.renderController.greenRangerIndicator.render(game);

    // Draw contextual floating text above player when near a slot
    if (nearestSlot && activeHint === 'slot') {
      this.renderer.fgCtx.save();
      this.renderer.fgCtx.font = spectaclesOn
        ? `${Math.round(GRID.CELL_SIZE * 0.8 * CIPHER_FONT_SCALE)}px 'Unifont', monospace`
        : `${GRID.CELL_SIZE * 0.8}px 'VentureArcade', 'Unifont', monospace`;
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
        this.renderer.fgCtx.fillText(
          spectaclesTransformString(slotItemName.toUpperCase(), spectaclesOn),
          game.player.position.x + GRID.CELL_SIZE / 2,
          floatingTextY
        );
      }

      this.renderer.fgCtx.restore();
    }

    // Draw "E X P L O R E" label — per-letter so recently-pressed keys blink
    this._drawLitLabel(
      this.renderer.fgCtx,
      ' E X P L O R E',
      GRID.WIDTH / 2,
      4 * GRID.CELL_SIZE + GRID.CELL_SIZE / 2 + 5,
      game.keyFlashMap,
      spectaclesOn
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
    // Extend the trigger one cell downward so it reaches the satchel cell below
    // the station, but keep the tighter radius in every other direction.
    const belowStation = game.player.position.y > stationPy ? GRID.CELL_SIZE : 0;
    const nearCraft = craftDist < GRID.CELL_SIZE * 3 + belowStation;

    const craftFont = spectaclesOn
      ? `${Math.round(GRID.CELL_SIZE * CIPHER_FONT_SCALE)}px 'Unifont', monospace`
      : `${GRID.CELL_SIZE}px 'VentureArcade', 'Unifont', monospace`;
    this._craftDissolve.render(this.renderer.fgCtx, {
      text: spectaclesTransformString(craftText, spectaclesOn),
      font: craftFont,
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
      const displayCraft = spectaclesTransformString(craftText, spectaclesOn);
      ctx.save();
      ctx.globalAlpha = this._craftDissolve.alpha;
      ctx.font = craftFont;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      const totalW = ctx.measureText(displayCraft).width;
      const charW = totalW / displayCraft.length;
      let cx = craftLabelX - totalW / 2;
      for (let i = 0; i < displayCraft.length; i++) {
        const upper = craftText[i].toUpperCase();
        if (upper !== ' ' && flashMap[upper] !== undefined && (now - flashMap[upper]) < FLASH_MS) {
          ctx.fillStyle = '#7a7a7a';
          ctx.fillText(displayCraft[i], cx, craftLabelY);
        }
        cx += charW;
      }
      ctx.globalAlpha = 1;
      ctx.restore();
    }

    // === LEFT SIDE: WASD KEYS WITH "M O V E" ===
    const wasdY = GRID.HEIGHT - GRID.CELL_SIZE * 7.5;
    const wasdCenterX = GRID.WIDTH / 4; // Left quarter of screen

    // Determine colors and sizes based on key state (highlight when pressed) and inactivity blinking
    const isInactive = game.inactivityTimer >= game.INACTIVITY_THRESHOLD;
    const blinkWhite = isInactive && game.wasdBlinkState;
    const inactiveColor = blinkWhite ? '#FFFFFF' : COLORS.TEXT;

    const getWasdStyle = (isPressed) => {
      if (isPressed) {
        return { fontSize: GRID.CELL_SIZE * 1.4, color: COLORS.ITEM };
      } else if (isInactive) {
        return { fontSize: GRID.CELL_SIZE, color: inactiveColor };
      } else {
        return { fontSize: GRID.CELL_SIZE, color: COLORS.TEXT };
      }
    };

    const wStyle = getWasdStyle(game.keys.w);
    const aStyle = getWasdStyle(game.keys.a);
    const sStyle = getWasdStyle(game.keys.s);
    const dStyle = getWasdStyle(game.keys.d);
    const spaceStyle = getWasdStyle(game.keys.space);

    // Draw using foreground context for proper layering with variable font sizes
    const wasdCtx = this.renderer.fgCtx;
    wasdCtx.save();
    wasdCtx.textAlign = 'center';
    wasdCtx.textBaseline = 'middle';
    const half = GRID.CELL_SIZE / 2;

    const wasdTopRow = Math.floor(wasdY / GRID.CELL_SIZE);
    const wasdCenterCol = Math.floor(wasdCenterX / GRID.CELL_SIZE);
    const wasdBottomRow = wasdTopRow + 1;

    // Brackets (static size)
    wasdCtx.font = `${GRID.CELL_SIZE}px 'Unifont', monospace`;
    wasdCtx.fillStyle = COLORS.BORDER;
    wasdCtx.fillText('[', (wasdCenterCol - 1) * GRID.CELL_SIZE + half, wasdTopRow * GRID.CELL_SIZE + half);
    wasdCtx.fillText(']', (wasdCenterCol + 1) * GRID.CELL_SIZE + half, wasdTopRow * GRID.CELL_SIZE + half);

    wasdCtx.fillText('[', (wasdCenterCol - 5) * GRID.CELL_SIZE + half, wasdBottomRow * GRID.CELL_SIZE + half);
    wasdCtx.fillText(']', (wasdCenterCol - 3) * GRID.CELL_SIZE + half, wasdBottomRow * GRID.CELL_SIZE + half);

    wasdCtx.fillText('[', (wasdCenterCol - 1) * GRID.CELL_SIZE + half, wasdBottomRow * GRID.CELL_SIZE + half);
    wasdCtx.fillText(']', (wasdCenterCol + 1) * GRID.CELL_SIZE + half, wasdBottomRow * GRID.CELL_SIZE + half);

    wasdCtx.fillText('[', (wasdCenterCol + 3) * GRID.CELL_SIZE + half, wasdBottomRow * GRID.CELL_SIZE + half);
    wasdCtx.fillText(']', (wasdCenterCol + 5) * GRID.CELL_SIZE + half, wasdBottomRow * GRID.CELL_SIZE + half);

    // W key (top)
    wasdCtx.font = `${wStyle.fontSize}px 'Unifont', monospace`;
    wasdCtx.fillStyle = wStyle.color;
    wasdCtx.fillText(spectaclesTransform('W', spectaclesOn), wasdCenterCol * GRID.CELL_SIZE + half, wasdTopRow * GRID.CELL_SIZE + half);

    // A key (left)
    wasdCtx.font = `${aStyle.fontSize}px 'Unifont', monospace`;
    wasdCtx.fillStyle = aStyle.color;
    wasdCtx.fillText(spectaclesTransform('A', spectaclesOn), (wasdCenterCol - 4) * GRID.CELL_SIZE + half, wasdBottomRow * GRID.CELL_SIZE + half);

    // S key (center)
    wasdCtx.font = `${sStyle.fontSize}px 'Unifont', monospace`;
    wasdCtx.fillStyle = sStyle.color;
    wasdCtx.fillText(spectaclesTransform('S', spectaclesOn), wasdCenterCol * GRID.CELL_SIZE + half, wasdBottomRow * GRID.CELL_SIZE + half);

    // D key (right)
    wasdCtx.font = `${dStyle.fontSize}px 'Unifont', monospace`;
    wasdCtx.fillStyle = dStyle.color;
    wasdCtx.fillText(spectaclesTransform('D', spectaclesOn), (wasdCenterCol + 4) * GRID.CELL_SIZE + half, wasdBottomRow * GRID.CELL_SIZE + half);

    // Draw "M O V E" label below WASD
    const moveY = wasdY + GRID.CELL_SIZE * 2.5;
    wasdCtx.font = spectaclesOn
      ? `${Math.round(GRID.CELL_SIZE * 0.7 * CIPHER_FONT_SCALE)}px 'Unifont', monospace`
      : `${GRID.CELL_SIZE * 0.7}px 'VentureArcade', 'Unifont', monospace`;
    wasdCtx.fillStyle = '#666666';
    wasdCtx.fillText(spectaclesTransformString('M O V E', spectaclesOn), wasdCenterCol * GRID.CELL_SIZE + half, moveY);

    // SPACE key with INTERACT label (on same line or very close)
    const spaceY = moveY + GRID.CELL_SIZE * 1.5;
    const spaceRow = Math.floor(spaceY / GRID.CELL_SIZE);
    wasdCtx.font = `${GRID.CELL_SIZE}px 'Unifont', monospace`;
    wasdCtx.fillStyle = COLORS.BORDER;
    wasdCtx.fillText('[', (wasdCenterCol - 6) * GRID.CELL_SIZE + half, spaceY);
    wasdCtx.fillText(']', (wasdCenterCol + 6) * GRID.CELL_SIZE + half, spaceY);
    wasdCtx.font = `${spaceStyle.fontSize}px 'Unifont', monospace`;
    wasdCtx.fillStyle = spaceStyle.color;
    wasdCtx.fillText('SPACE', wasdCenterCol * GRID.CELL_SIZE + half, spaceY);

    // INTERACT label right below SPACE
    wasdCtx.font = spectaclesOn
      ? `${Math.round(GRID.CELL_SIZE * 0.7 * CIPHER_FONT_SCALE)}px 'Unifont', monospace`
      : `${GRID.CELL_SIZE * 0.7}px 'VentureArcade', 'Unifont', monospace`;
    wasdCtx.fillStyle = '#666666';
    wasdCtx.fillText(spectaclesTransformString('I N T E R A C T', spectaclesOn), wasdCenterCol * GRID.CELL_SIZE + half, spaceY + GRID.CELL_SIZE * 1.3);

    wasdCtx.restore();

    // === RIGHT SIDE: ARROW KEYS WITH "D O D G E" ===
    this.renderController.arrowKeyIndicators.render(game);

    // Draw pickup message if active (crafted items)
    if (game.pickupMessage && game.pickupMessageTimer > 0) {
      const ctx = this.renderer.fgCtx;
      ctx.save();
      ctx.font = cipherFont(GRID.CELL_SIZE * 2, spectaclesOn);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = COLORS.ITEM;
      this.renderer.drawWrappedText(ctx, spectaclesTransformString(game.pickupMessage, spectaclesOn), GRID.WIDTH / 2, GRID.HEIGHT / 2 - 100, GRID.WIDTH * 0.8, GRID.CELL_SIZE * 2.5);
      ctx.restore();
    }

    // Draw path announcement if active (Path Amulet)
    if (game.pathAnnouncement && game.pathAnnouncementTimer > 0) {
      this.renderer.fgCtx.save();
      this.renderer.fgCtx.font = cipherFont(GRID.CELL_SIZE * 2, spectaclesOn);
      this.renderer.fgCtx.textAlign = 'center';
      this.renderer.fgCtx.textBaseline = 'middle';
      this.renderer.fgCtx.fillStyle = '#ffaa00'; // Yellow-orange for path
      this.renderer.fgCtx.fillText(spectaclesTransformString(game.pathAnnouncement, spectaclesOn), GRID.WIDTH / 2, GRID.HEIGHT / 2 - 100);
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
        this.renderer.fgCtx.font = spectaclesOn
          ? `${Math.round(GRID.CELL_SIZE * 0.8 * CIPHER_FONT_SCALE)}px 'Unifont', monospace`
          : `${GRID.CELL_SIZE * 0.8}px 'VentureArcade', 'Unifont', monospace`;
        this.renderer.fgCtx.textAlign = 'center';
        this.renderer.fgCtx.textBaseline = 'middle';
        this.renderer.fgCtx.fillStyle = COLORS.TEXT;
        this.renderer.fgCtx.fillText(
          spectaclesTransformString('SPACE', spectaclesOn),
          game.player.position.x + GRID.CELL_SIZE / 2,
          game.player.position.y - GRID.CELL_SIZE * 1.5
        );
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

  /**
   * Renders a spaced-letter label with recently-pressed keys shown in light gray.
   * Under spectacles, each Latin char is rendered as its Greek cipher form in
   * scaled Unifont (VA lacks Greek coverage), but the flash lookup still uses
   * the original Latin so keypresses light the correct slot.
   */
  _drawLitLabel(ctx, text, centerX, y, keyFlashMap = {}, spectaclesOn = false) {
    const FLASH_MS = 220;
    const now = performance.now();
    ctx.save();
    ctx.font = spectaclesOn
      ? `${Math.round(GRID.CELL_SIZE * CIPHER_FONT_SCALE)}px 'Unifont', monospace`
      : `${GRID.CELL_SIZE}px 'VentureArcade', 'Unifont', monospace`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const displayText = spectaclesTransformString(text, spectaclesOn);
    const totalW = ctx.measureText(displayText).width;
    const charW = totalW / displayText.length;
    let cx = centerX - totalW / 2;
    for (let i = 0; i < displayText.length; i++) {
      const ch = displayText[i];
      const upper = text[i].toUpperCase();
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
      const spectaclesOn = isSpectaclesActive(game);

      // Header: "ended by [Name]"
      ctx.font = cipherFont(GRID.CELL_SIZE * 0.85, spectaclesOn);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillStyle = '#cccccc';
      ctx.fillText(spectaclesTransformString('ended by', spectaclesOn), cx, y + padY);

      ctx.font = cipherFont(GRID.CELL_SIZE, spectaclesOn);
      ctx.fillStyle = cause.color || '#ffffff';
      const nameY = y + padY + GRID.CELL_SIZE * 0.9;
      ctx.fillText(spectaclesTransformString(cause.name.toUpperCase(), spectaclesOn), cx, nameY);

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
        this.renderer.drawWrappedText(ctx, spectaclesTransformString(cause.description, spectaclesOn), cx, sepY + 10, textMaxW, 14);
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
