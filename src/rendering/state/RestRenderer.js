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

import { GRID, COLORS, EQUIPMENT } from '../../game/GameConfig.js';
import { getItemData } from '../../data/items.js';

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

    // Draw prominent warp zone indicator for north exit (3 rows of arrows)
    const centerX = Math.floor(GRID.COLS / 2);
    const warpZoneColor = 'rgba(100, 200, 255, 0.5)';

    this.renderer.drawRect(
      (centerX - 1) * GRID.CELL_SIZE,
      1 * GRID.CELL_SIZE,
      3 * GRID.CELL_SIZE,
      3 * GRID.CELL_SIZE,
      warpZoneColor,
      true
    );

    const arrowColor = 'rgba(150, 220, 255, 0.8)';
    for (let row = 0; row < 3; row++) {
      for (let i = -1; i <= 1; i++) {
        this.renderer.drawEntity(
          (centerX + i) * GRID.CELL_SIZE + GRID.CELL_SIZE / 2,
          (1.5 + row) * GRID.CELL_SIZE,
          '^',
          arrowColor
        );
      }
    }

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

    // Draw starter bundle (world object, destroyed on SPACE)
    if (game.restBundle) {
      this.renderer.drawEntity(
        game.restBundle.position.x + GRID.CELL_SIZE / 2,
        game.restBundle.position.y + GRID.CELL_SIZE / 2,
        game.restBundle.char,
        game.restBundle.color
      );

      // Show PRESS SPACE when player is near the bundle
      const bundleDist = Math.hypot(
        game.player.position.x - game.restBundle.position.x,
        game.player.position.y - game.restBundle.position.y
      );
      if (bundleDist < GRID.CELL_SIZE * 3) {
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
    if (nearestSlot) {
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

    // Draw North exit indicator
    this.renderer.drawEntity(
      GRID.WIDTH / 2,
      GRID.CELL_SIZE / 2,
      '↑',
      COLORS.TEXT
    );

    // Draw "EXPLORE" label just below the north exit warp zone
    this.renderer.fgCtx.save();
    this.renderer.fgCtx.font = `${GRID.CELL_SIZE}px 'VentureArcade', 'Unifont', monospace`;
    this.renderer.fgCtx.textAlign = 'center';
    this.renderer.fgCtx.textBaseline = 'middle';
    this.renderer.fgCtx.fillStyle = '#666666';
    this.renderer.fgCtx.fillText(' E X P L O R E', GRID.WIDTH / 2, 4 * GRID.CELL_SIZE + GRID.CELL_SIZE / 2 + 5);
    this.renderer.fgCtx.restore();

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

    // Draw inventory overlay when 'i' key is held
    if (game.keys.i) {
      this.renderController.inventoryOverlay.render(game);
    }

    // Render cheat menu overlay (if open)
    game.cheatMenu.render(this.renderer);
  }
}
