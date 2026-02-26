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

import { GRID, COLORS } from '../../game/GameConfig.js';

export class RestRenderer {
  constructor(renderer, renderController) {
    this.renderer = renderer;
    this.renderController = renderController;
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

      // Draw equipment slots
      this.renderController.equipmentSlots.render(game);

      this.renderer.backgroundDirty = false;
    }

    // Render foreground
    this.renderer.clearForeground();

    // Draw prominent warp zone indicator for north exit (below the wall)
    const centerX = Math.floor(GRID.COLS / 2);
    const warpZoneColor = 'rgba(100, 200, 255, 0.5)'; // Brighter blue, more opaque

    this.renderer.drawRect(
      (centerX - 1) * GRID.CELL_SIZE,
      1 * GRID.CELL_SIZE,
      3 * GRID.CELL_SIZE,
      2 * GRID.CELL_SIZE,
      warpZoneColor,
      true
    );

    // Add decorative border arrows pointing up to make exit more obvious
    const arrowColor = 'rgba(150, 220, 255, 0.8)';
    for (let i = -1; i <= 1; i++) {
      this.renderer.drawEntity(
        (centerX + i) * GRID.CELL_SIZE + GRID.CELL_SIZE / 2,
        1.5 * GRID.CELL_SIZE,
        '^',
        arrowColor
      );
    }

    // Highlight the nearest interactive slot only (prevents multi-slot highlighting)
    const nearestSlot = game.getNearestInteractiveSlot();

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
      this.renderer.drawEntity(
        proj.position.x + GRID.CELL_SIZE / 2,
        proj.position.y + GRID.CELL_SIZE / 2,
        proj.char,
        proj.color
      );
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

    // Draw contextual floating text above player when near a slot
    if (nearestSlot) {
      this.renderer.fgCtx.save();
      this.renderer.fgCtx.font = `${GRID.CELL_SIZE * 0.8}px "Courier New", monospace`;
      this.renderer.fgCtx.textAlign = 'center';
      this.renderer.fgCtx.textBaseline = 'middle';
      this.renderer.fgCtx.fillStyle = COLORS.TEXT;
      const floatingTextY = game.player.position.y - GRID.CELL_SIZE * 1.5;

      // Armor and consumable slots only use SPACE
      const isArmorOrConsumable = nearestSlot.type === 'equipment-armor' ||
                                   nearestSlot.type === 'equipment-consumable1' ||
                                   nearestSlot.type === 'equipment-consumable2';
      const instructionText = isArmorOrConsumable ? 'SPACE' : 'SPACE or SHIFT';

      this.renderer.fgCtx.fillText(instructionText, game.player.position.x + GRID.CELL_SIZE / 2, floatingTextY);
      this.renderer.fgCtx.restore();
    }

    // Draw North exit indicator
    this.renderer.drawEntity(
      GRID.WIDTH / 2,
      GRID.CELL_SIZE / 2,
      '↑',
      COLORS.TEXT
    );

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
    this.renderer.bgCtx.font = `${GRID.CELL_SIZE}px "Courier New", monospace`; // Remove bold

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

    // Restore original bold font
    this.renderer.bgCtx.restore();

    // Draw "M O V E" text below WASD (left side)
    this.renderer.fgCtx.save();
    this.renderer.fgCtx.font = `${GRID.CELL_SIZE * 0.7}px "Courier New", monospace`;
    this.renderer.fgCtx.textBaseline = 'middle';
    this.renderer.fgCtx.textAlign = 'center';
    const labelY = GRID.HEIGHT - GRID.CELL_SIZE * 2;

    this.renderer.fgCtx.fillStyle = COLORS.TEXT;
    this.renderer.fgCtx.fillText('M O V E', wasdCenterX, labelY);

    this.renderer.fgCtx.restore();

    // Draw pickup message if active (crafted items)
    if (game.pickupMessage && game.pickupMessageTimer > 0) {
      this.renderer.fgCtx.save();
      this.renderer.fgCtx.font = `bold ${GRID.CELL_SIZE * 2}px "Courier New", monospace`;
      this.renderer.fgCtx.textAlign = 'center';
      this.renderer.fgCtx.textBaseline = 'middle';
      this.renderer.fgCtx.fillStyle = COLORS.ITEM;
      this.renderer.fgCtx.fillText(game.pickupMessage, GRID.WIDTH / 2, GRID.HEIGHT / 2);
      this.renderer.fgCtx.restore();
    }

    // Draw path announcement if active (Path Amulet)
    if (game.pathAnnouncement && game.pathAnnouncementTimer > 0) {
      this.renderer.fgCtx.save();
      this.renderer.fgCtx.font = `bold ${GRID.CELL_SIZE * 2}px "Courier New", monospace`;
      this.renderer.fgCtx.textAlign = 'center';
      this.renderer.fgCtx.textBaseline = 'middle';
      this.renderer.fgCtx.fillStyle = '#ffaa00'; // Yellow-orange for path
      this.renderer.fgCtx.fillText(game.pathAnnouncement, GRID.WIDTH / 2, GRID.HEIGHT / 2);
      this.renderer.fgCtx.restore();
    }

    // Draw inventory overlay when 'i' key is held
    if (game.keys.i) {
      this.renderController.inventoryOverlay.render(game);
    }

    // Render cheat menu overlay (if open)
    game.cheatMenu.render(this.renderer);
  }
}
