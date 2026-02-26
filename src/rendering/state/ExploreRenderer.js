/**
 * ExploreRenderer - Renders the EXPLORE state (combat rooms)
 *
 * Responsibilities:
 * - Render background with collision map and background objects
 * - Draw warp zone indicators for exits
 * - Display exit letters when exits are unlocked
 * - Render enemies with indicators (windup, memory, detection, sapping, spawn)
 * - Show projectiles, melee attacks, and stuck arrows
 * - Display debris, ingredients, items, placed traps, captives
 * - Render consumable windups with AoE radius indicators
 * - Show particles, goo blobs, steam clouds
 * - Display damage numbers
 * - Draw player with status effects
 * - Render grass on top layer
 * - Show bow charge indicator
 * - Display pickup messages and inventory overlay
 * - Render cheat menu if open
 * - Debug visualization (vectors, vision) when enabled
 */

import { GRID, COLORS } from '../../game/GameConfig.js';

export class ExploreRenderer {
  constructor(renderer, renderController) {
    this.renderer = renderer;
    this.renderController = renderController;
  }

  render(game) {
    if (!game.currentRoom || !game.player) return;

    this.renderBackground(game);
    this.renderForeground(game);
  }

  renderBackground(game) {
    // Render background (only if dirty)
    if (!this.renderer.backgroundDirty) return;

    this.renderer.clearBackground();

    // Only create holes in border when exits are unlocked
    // Exception: south exit opens if player has no items (escape route)
    const borderExits = game.currentRoom.exitsLocked ?
      { north: false, south: game.currentRoom.exits.south && game.playerHasNoItems(), east: false, west: false } :
      game.currentRoom.exits;
    this.renderer.drawBorder(borderExits, game.currentRoom.borderColor);

    // Draw collision map
    for (let y = 0; y < GRID.ROWS; y++) {
      for (let x = 0; x < GRID.COLS; x++) {
        if (game.currentRoom.collisionMap[y][x]) {
          this.renderer.drawCell(x, y, '█', '#444444');
        }
      }
    }

    // Draw recipe sign FIRST (under all other background objects)
    if (game.currentRoom.recipeSign) {
      for (const char of game.currentRoom.recipeSign.characters) {
        const x = char.x + GRID.CELL_SIZE / 2;
        const y = char.y + GRID.CELL_SIZE / 2;
        this.renderer.bgCtx.fillStyle = char.color;
        this.renderer.bgCtx.fillText(char.char, x, y);
      }
    }

    // Draw static background objects (exclude water and grass - they render on foreground for dynamic state)
    for (const obj of game.backgroundObjects) {
      const isGrass = obj.char === '|' || obj.char === '\\' || obj.char === '/' || obj.char === ',';
      if (!obj.currentAnimation && obj.char !== '~' && !isGrass) {
        // Draw directly to background context (not foreground)
        const x = obj.position.x + GRID.CELL_SIZE / 2;
        const y = obj.position.y + GRID.CELL_SIZE / 2;
        this.renderer.bgCtx.fillStyle = obj.color;
        this.renderer.bgCtx.fillText(obj.char, x, y);
      }
    }

    this.renderer.backgroundDirty = false;
  }

  renderForeground(game) {
    // Render foreground
    this.renderer.clearForeground();

    // Draw semi-transparent warp zone indicators for all exits (only when unlocked)
    const centerX = Math.floor(GRID.COLS / 2);
    const centerY = Math.floor(GRID.ROWS / 2);
    const warpZoneColor = 'rgba(100, 150, 255, 0.15)'; // Light blue, semi-transparent
    const exitsUnlocked = !game.currentRoom.exitsLocked;

    // North exit warp zone (3 cells wide, 2 cells deep)
    if (game.currentRoom.exits.north && exitsUnlocked) {
      this.renderer.drawRect(
        (centerX - 1) * GRID.CELL_SIZE,
        0 * GRID.CELL_SIZE,
        3 * GRID.CELL_SIZE,
        2 * GRID.CELL_SIZE,
        warpZoneColor,
        true
      );
    }

    // South exit warp zone (3 cells wide, 2 cells deep)
    // Opens when unlocked OR when player has no items (escape route)
    const southExitOpen = exitsUnlocked || game.playerHasNoItems();
    if (game.currentRoom.exits.south && southExitOpen) {
      this.renderer.drawRect(
        (centerX - 1) * GRID.CELL_SIZE,
        (GRID.ROWS - 2) * GRID.CELL_SIZE,
        3 * GRID.CELL_SIZE,
        2 * GRID.CELL_SIZE,
        warpZoneColor,
        true
      );
    }

    // East exit warp zone (2 cells wide, 3 cells tall)
    if (game.currentRoom.exits.east && exitsUnlocked) {
      this.renderer.drawRect(
        (GRID.COLS - 2) * GRID.CELL_SIZE,
        (centerY - 1) * GRID.CELL_SIZE,
        2 * GRID.CELL_SIZE,
        3 * GRID.CELL_SIZE,
        warpZoneColor,
        true
      );
    }

    // West exit warp zone (2 cells wide, 3 cells tall)
    if (game.currentRoom.exits.west && exitsUnlocked) {
      this.renderer.drawRect(
        0 * GRID.CELL_SIZE,
        (centerY - 1) * GRID.CELL_SIZE,
        2 * GRID.CELL_SIZE,
        3 * GRID.CELL_SIZE,
        warpZoneColor,
        true
      );
    }

    // Draw exit letters (if exits are unlocked) - only for north/east/west
    // South is boolean (returns to REST), not a letter
    if (!game.currentRoom.exitsLocked) {
      // North exit
      if (game.currentRoom.exits.north && game.currentRoom.exits.north.letter) {
        this.renderer.drawEntity(
          centerX * GRID.CELL_SIZE + GRID.CELL_SIZE / 2,
          1 * GRID.CELL_SIZE + GRID.CELL_SIZE / 2,
          game.currentRoom.exits.north.letter,
          game.currentRoom.exits.north.color
        );
      }

      // East exit
      if (game.currentRoom.exits.east && game.currentRoom.exits.east.letter) {
        this.renderer.drawEntity(
          (GRID.COLS - 2) * GRID.CELL_SIZE + GRID.CELL_SIZE / 2,
          centerY * GRID.CELL_SIZE + GRID.CELL_SIZE / 2,
          game.currentRoom.exits.east.letter,
          game.currentRoom.exits.east.color
        );
      }

      // West exit
      if (game.currentRoom.exits.west && game.currentRoom.exits.west.letter) {
        this.renderer.drawEntity(
          1 * GRID.CELL_SIZE + GRID.CELL_SIZE / 2,
          centerY * GRID.CELL_SIZE + GRID.CELL_SIZE / 2,
          game.currentRoom.exits.west.letter,
          game.currentRoom.exits.west.color
        );
      }
    }

    // Draw animating background objects
    for (const obj of game.backgroundObjects) {
      if (obj.currentAnimation) {
        const renderData = obj.getRenderPosition();
        this.renderer.drawEntity(
          renderData.x + GRID.CELL_SIZE / 2 + obj.animationOffset.x,
          renderData.y + GRID.CELL_SIZE / 2 + obj.animationOffset.y,
          renderData.char,
          renderData.color
        );
      }
    }

    // Draw water tiles on foreground so state changes (frozen '=', electrified blink) render each frame
    for (const obj of game.backgroundObjects) {
      if (obj.char === '~' && !obj.currentAnimation) {
        const renderData = obj.getRenderPosition();
        this.renderer.drawEntity(
          renderData.x + GRID.CELL_SIZE / 2,
          renderData.y + GRID.CELL_SIZE / 2,
          renderData.char,
          renderData.color
        );
      }
    }

    // Draw goo blobs (ground layer - under enemies and player)
    for (const gooBlob of game.gooBlobs) {
      const scale = gooBlob.getCurrentScale();
      this.renderer.fgCtx.save();
      const screenX = gooBlob.position.x;
      const screenY = gooBlob.position.y;

      // Apply scale
      this.renderer.fgCtx.translate(screenX, screenY);
      this.renderer.fgCtx.scale(scale, scale);
      this.renderer.fgCtx.translate(-screenX, -screenY);

      // Draw without glow
      this.renderer.fgCtx.globalAlpha = 0.7;
      this.renderer.drawEntity(screenX, screenY, gooBlob.char, gooBlob.color);

      this.renderer.fgCtx.restore();
    }

    // Draw debris (enemy remains)
    for (const piece of game.debris) {
      this.renderer.drawEntity(
        piece.position.x + GRID.CELL_SIZE / 2,
        piece.position.y + GRID.CELL_SIZE / 2,
        piece.char,
        piece.color
      );
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

    // Draw placed traps
    for (const entry of game.placedTraps) {
      const { item } = entry;
      this.renderer.drawEntity(
        item.position.x + GRID.CELL_SIZE / 2,
        item.position.y + GRID.CELL_SIZE / 2,
        item.char,
        item.color
      );
    }

    // Draw captives (pulsing @ characters)
    for (const captive of game.captives) {
      if (!captive.freed) {
        captive.render(this.renderer.fgCtx, (gx, gy) => ({
          x: gx * GRID.CELL_SIZE,
          y: gy * GRID.CELL_SIZE
        }));
      }
    }

    // Draw consumable windups (dropped items during charge-up)
    for (const windup of game.consumableWindups) {
      // Blink effect: show/hide every 0.15 seconds, faster as timer runs out
      const blinkSpeed = Math.max(0.1, windup.timer * 0.15);
      const shouldShow = Math.floor(windup.blinkTimer / blinkSpeed) % 2 === 0;

      if (shouldShow) {
        // Draw dropped consumable
        this.renderer.drawEntity(
          windup.x,
          windup.y,
          windup.consumable.char,
          windup.consumable.color
        );

        // Calculate actual AoE radius based on effect type
        const cd = windup.consumable.data;
        let aoeRadius = 0;
        switch (windup.effectType) {
          case 'explode':
            aoeRadius = cd.radius * 2; // Bomb uses 2x radius
            break;
          case 'curse':
            aoeRadius = cd.radius; // Cursed Skull
            break;
          case 'slow':
            aoeRadius = 50; // Slime Ball
            break;
          case 'poison':
            aoeRadius = 55; // Poison Flask
            break;
          case 'venomcloud':
            aoeRadius = 60; // Venom Vial
            break;
          case 'jolt':
            aoeRadius = 999; // Room-wide (show large ring)
            break;
          case 'throwSteam':
            aoeRadius = cd.radius; // Steam Vial
            break;
          default:
            aoeRadius = 40;
        }

        // Draw pulsing ring to show AoE damage radius
        const progress = 1 - (windup.timer / windup.maxTimer);
        const pulse = Math.sin(progress * Math.PI * 6) * 0.15; // Subtle pulse
        const displayRadius = aoeRadius * (1 + pulse);

        this.renderer.fgCtx.save();
        this.renderer.fgCtx.strokeStyle = windup.consumable.color;
        this.renderer.fgCtx.globalAlpha = 0.4 + Math.sin(progress * Math.PI * 8) * 0.2;
        this.renderer.fgCtx.lineWidth = 2;
        this.renderer.fgCtx.beginPath();
        this.renderer.fgCtx.arc(windup.x, windup.y, displayRadius, 0, Math.PI * 2);
        this.renderer.fgCtx.stroke();

        // Draw inner ring at 50% radius for better depth perception
        this.renderer.fgCtx.globalAlpha = 0.2;
        this.renderer.fgCtx.lineWidth = 1;
        this.renderer.fgCtx.beginPath();
        this.renderer.fgCtx.arc(windup.x, windup.y, displayRadius * 0.5, 0, Math.PI * 2);
        this.renderer.fgCtx.stroke();

        this.renderer.fgCtx.restore();
      }
    }

    // Draw non-sapping enemies first (so they render behind player)
    for (const enemy of game.currentRoom.enemies) {
      // Skip sapping enemies - they render on top later
      if (enemy.sapping) continue;

      this.renderEnemy(game, enemy);
    }

    // Draw projectiles
    for (const proj of game.combatSystem.getProjectiles()) {
      this.renderer.drawEntity(
        proj.position.x + GRID.CELL_SIZE / 2,
        proj.position.y + GRID.CELL_SIZE / 2,
        proj.char,
        proj.color
      );
    }

    // Draw enemy projectiles
    for (const proj of game.combatSystem.getEnemyProjectiles()) {
      this.renderer.drawEntity(
        proj.position.x + GRID.CELL_SIZE / 2,
        proj.position.y + GRID.CELL_SIZE / 2,
        proj.char,
        proj.color
      );
    }

    // Draw melee attacks
    for (const attack of game.combatSystem.getMeleeAttacks()) {
      this.renderer.drawEntity(
        attack.position.x + GRID.CELL_SIZE / 2,
        attack.position.y + GRID.CELL_SIZE / 2,
        attack.char,
        attack.color
      );
    }

    // Draw enemy melee attacks
    for (const attack of game.combatSystem.getEnemyMeleeAttacks()) {
      const displayColor = attack.flashWhite ? '#ffffff' : attack.color;
      const alpha = attack.alpha !== undefined ? attack.alpha : 1.0;

      this.renderer.drawTextWithAlpha(
        attack.position.x + GRID.CELL_SIZE / 2,
        attack.position.y + GRID.CELL_SIZE / 2,
        attack.char,
        displayColor,
        alpha
      );
    }

    // Draw stuck arrows (arrows embedded in enemies)
    for (const arrow of game.combatSystem.getStuckArrows()) {
      this.renderer.drawEntity(
        arrow.position.x + GRID.CELL_SIZE / 2,
        arrow.position.y + GRID.CELL_SIZE / 2,
        arrow.char,
        arrow.color
      );
    }

    // Draw damage numbers
    for (const dmgNum of game.combatSystem.getDamageNumbers()) {
      this.renderer.drawTextWithAlpha(
        dmgNum.x,
        dmgNum.y,
        dmgNum.value.toString(),
        dmgNum.color,
        dmgNum.alpha
      );
    }

    // Draw particles (embers, explosions, clouds)
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

    // Draw goo blobs with pulsing scale effect
    for (const gooBlob of game.gooBlobs) {
      const scale = gooBlob.getCurrentScale();
      // Render with pulsing
      this.renderer.fgCtx.save();
      const screenX = gooBlob.position.x;
      const screenY = gooBlob.position.y;

      // Apply scale
      this.renderer.fgCtx.translate(screenX, screenY);
      this.renderer.fgCtx.scale(scale, scale);
      this.renderer.fgCtx.translate(-screenX, -screenY);

      // Draw without glow
      this.renderer.fgCtx.globalAlpha = 0.7;
      this.renderer.drawEntity(screenX, screenY, gooBlob.char, gooBlob.color);

      this.renderer.fgCtx.restore();
    }

    // Draw steam clouds (fire+water smokescreen)
    for (const cloud of game.steamClouds) {
      const maxTimer = 7.0;
      const alpha = Math.min(0.9, (cloud.timer / maxTimer) * 0.9 + 0.1);
      const steamChars = ['=', '~', '=', '-'];
      for (let s = 0; s < 4; s++) {
        const jx = cloud.x + (Math.random() - 0.5) * cloud.radius * 1.6;
        const jy = cloud.y + (Math.random() - 0.5) * cloud.radius * 1.6;
        const dx = jx - cloud.x, dy = jy - cloud.y;
        if (dx * dx + dy * dy <= cloud.radius * cloud.radius) {
          this.renderer.drawTextWithAlpha(jx, jy, steamChars[s % steamChars.length], '#8c8c8c', alpha);
        }
      }
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

    // Draw sapping enemies on top of player
    for (const enemy of game.currentRoom.enemies) {
      if (!enemy.sapping) continue;

      if (enemy.shouldRenderVisible()) {
        // Check for DOT blink color, otherwise use normal color
        const dotColor = enemy.getDOTBlinkColor();
        const displayColor = dotColor !== null ? dotColor : enemy.color;

        this.renderer.drawEntity(
          enemy.position.x + GRID.CELL_SIZE / 2,
          enemy.position.y + GRID.CELL_SIZE / 2,
          enemy.char,
          displayColor
        );
      }

      // Draw sapping indicator (red * when latched to player)
      const sappingIndicator = enemy.getSappingIndicator();
      if (sappingIndicator) {
        this.renderer.drawEntity(
          enemy.position.x + GRID.CELL_SIZE / 2,
          enemy.position.y + GRID.CELL_SIZE / 2 + sappingIndicator.offsetY,
          sappingIndicator.char,
          sappingIndicator.color
        );
      }
    }

    // Draw grass on foreground AFTER player so it appears on top
    // Includes tall grass (|, \, /) and cut grass (,)
    // Apply horizontal offset to make tall grass appear to bend in direction
    for (const obj of game.backgroundObjects) {
      const isGrass = obj.char === '|' || obj.char === '\\' || obj.char === '/' || obj.char === ',';
      if (isGrass && !obj.currentAnimation && !obj.destroyed) {
        const offsetX = obj.grassRenderOffset ? obj.grassRenderOffset.x : 0;
        this.renderer.drawEntity(
          obj.position.x + GRID.CELL_SIZE / 2 + offsetX,
          obj.position.y + GRID.CELL_SIZE / 2,
          obj.char,
          obj.color
        );
      }
    }

    // Draw bow charge indicator (shared between REST and EXPLORE states)
    this.renderController.bowChargeIndicator.render(game);

    // Old exit indicator system removed - now using colored exit letters
    // (Letters render at actual exit positions when exits unlock)

    // Draw pickup message if active
    if (game.pickupMessage && game.pickupMessageTimer > 0) {
      this.renderer.fgCtx.save();
      this.renderer.fgCtx.font = `bold ${GRID.CELL_SIZE * 2}px "Courier New", monospace`;
      this.renderer.fgCtx.textAlign = 'center';
      this.renderer.fgCtx.textBaseline = 'middle';
      this.renderer.fgCtx.fillStyle = COLORS.ITEM;
      this.renderer.fgCtx.fillText(game.pickupMessage, GRID.WIDTH / 2, GRID.HEIGHT / 2);
      this.renderer.fgCtx.restore();
    }

    // Draw inventory overlay when 'i' key is held
    if (game.keys.i) {
      this.renderController.inventoryOverlay.render(game);
    }

    // Render cheat menu overlay (if open)
    game.cheatMenu.render(this.renderer);
  }

  renderEnemy(game, enemy) {
    if (enemy.shouldRenderVisible()) {
      // Check for DOT blink color, otherwise use normal color
      const dotColor = enemy.getDOTBlinkColor();
      const displayColor = dotColor !== null ? dotColor : enemy.color;

      this.renderer.drawEntity(
        enemy.position.x + GRID.CELL_SIZE / 2,
        enemy.position.y + GRID.CELL_SIZE / 2,
        enemy.char,
        displayColor
      );
    }

    // Draw windup telegraph
    const windupIndicator = enemy.getWindupIndicator();
    if (windupIndicator) {
      this.renderer.drawEntity(
        enemy.position.x + GRID.CELL_SIZE / 2,
        enemy.position.y + GRID.CELL_SIZE / 2 + windupIndicator.offsetY,
        windupIndicator.char,
        windupIndicator.color
      );
    }

    // Draw memory/vision lost indicator
    const memoryIndicator = enemy.getMemoryIndicator();
    if (memoryIndicator) {
      this.renderer.drawEntity(
        enemy.position.x + GRID.CELL_SIZE / 2,
        enemy.position.y + GRID.CELL_SIZE / 2 + memoryIndicator.offsetY,
        memoryIndicator.char,
        memoryIndicator.color
      );
    }

    // Draw detection/aggro indicator
    const detectionIndicator = enemy.getDetectionIndicator();
    if (detectionIndicator) {
      this.renderer.drawEntity(
        enemy.position.x + GRID.CELL_SIZE / 2,
        enemy.position.y + GRID.CELL_SIZE / 2 + detectionIndicator.offsetY,
        detectionIndicator.char,
        detectionIndicator.color
      );
    }

    // Draw sapping indicator (red * when latched to player)
    const sappingIndicator = enemy.getSappingIndicator();
    if (sappingIndicator) {
      this.renderer.drawEntity(
        enemy.position.x + GRID.CELL_SIZE / 2,
        enemy.position.y + GRID.CELL_SIZE / 2 + sappingIndicator.offsetY,
        sappingIndicator.char,
        sappingIndicator.color
      );
    }

    // Draw spawn indicator (purple + symbol during windup)
    const spawnIndicator = enemy.getSpawnIndicator();
    if (spawnIndicator) {
      this.renderer.drawEntity(
        enemy.position.x + GRID.CELL_SIZE / 2,
        enemy.position.y + GRID.CELL_SIZE / 2 + spawnIndicator.offsetY,
        spawnIndicator.char,
        spawnIndicator.color
      );
    }

    // Draw debug vectors (toggle with 'v' key)
    if (game.showVectors && enemy.target && enemy.state === 'chase') {
      const enemyCenter = {
        x: enemy.position.x + GRID.CELL_SIZE / 2,
        y: enemy.position.y + GRID.CELL_SIZE / 2
      };

      // 1. Draw line of sight to player (yellow) - shortened at obstruction
      const playerCenter = {
        x: enemy.target.position.x + GRID.CELL_SIZE / 2,
        y: enemy.target.position.y + GRID.CELL_SIZE / 2
      };
      const visionPoint = enemy.getVisionObstructionPoint(
        enemyCenter,
        playerCenter,
        enemy.visionLength
      );
      this.renderer.drawLine(
        enemyCenter.x,
        enemyCenter.y,
        visionPoint.x,
        visionPoint.y,
        visionPoint.blocked ? '#ff000088' : '#00ff0088' // Red if blocked, green if clear
      );

      // 2. Draw current pathfinding direction (cyan) - actual movement vector
      if (enemy.currentDirection.x !== 0 || enemy.currentDirection.y !== 0) {
        const dirLength = enemy.navigationLength;
        const dirEndX = enemyCenter.x + enemy.currentDirection.x * dirLength;
        const dirEndY = enemyCenter.y + enemy.currentDirection.y * dirLength;
        this.renderer.drawLine(enemyCenter.x, enemyCenter.y, dirEndX, dirEndY, '#00ffffff');
      }

      // 3. Draw memory mark if pursuing last known position
      if (enemy.aggroMemoryActive && enemy.lastKnownPosition) {
        // Draw line to memory mark (orange)
        this.renderer.drawLine(
          enemyCenter.x,
          enemyCenter.y,
          enemy.lastKnownPosition.x + GRID.CELL_SIZE / 2,
          enemy.lastKnownPosition.y + GRID.CELL_SIZE / 2,
          '#ff880088'
        );

        // Draw memory mark position (orange dot)
        this.renderer.drawEntity(
          enemy.lastKnownPosition.x + GRID.CELL_SIZE / 2,
          enemy.lastKnownPosition.y + GRID.CELL_SIZE / 2,
          'X',
          '#ff8800'
        );
      }

      // 4. Draw mark on player when in sight
      if (!visionPoint.blocked) {
        this.renderer.drawEntity(
          playerCenter.x,
          playerCenter.y,
          '◎',
          '#00ff00'
        );
      }
    }
  }
}
