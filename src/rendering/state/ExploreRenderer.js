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
import { PixelatedDissolve, SplitReveal } from '../effects/TextEffects.js';

export class ExploreRenderer {
  constructor(renderer, renderController) {
    this.renderer = renderer;
    this.renderController = renderController;

    // REST label pixelated-dissolve effect (speed=1.5 → ~0.67 s full transition)
    // blockSize=6 gives chunky cell-sized blocks that match the VentureArcade font.
    this._restDissolve = new PixelatedDissolve({ speed: 1.5, blockSize: 6 });

    // Per-direction split-reveal effects for exit gap openings.
    // North/south gaps are on horizontal borders → halves slide left/right.
    // East/west gaps are on vertical borders   → halves slide up/down.
    this._exitSplits = {
      north: new SplitReveal({ speed: 3.5, axis: 'horizontal' }),
      south: new SplitReveal({ speed: 3.5, axis: 'horizontal' }),
      east:  new SplitReveal({ speed: 3.5, axis: 'vertical' }),
      west:  new SplitReveal({ speed: 3.5, axis: 'vertical' }),
    };
    this._lastRoom = null;
  }

  render(game) {
    if (!game.currentRoom || !game.player) return;

    this.renderBackground(game);
    this.renderForeground(game);
  }

  renderBackground(game) {
    // Force background redraw when player plane changes (plane-aware bg objects appear/disappear)
    const currentPlane = game.player?.plane ?? 0;
    if (this._lastPlayerPlane !== currentPlane) {
      this._lastPlayerPlane = currentPlane;
      this.renderer.backgroundDirty = true;
    }

    // Force background redraw when the escape-route condition changes so the south
    // border gap appears/disappears as the player picks up or drops all items.
    const hasNoItems = game.playerHasNoItems();
    if (this._lastHasNoItems !== hasNoItems) {
      this._lastHasNoItems = hasNoItems;
      this.renderer.backgroundDirty = true;
    }

    // Force background redraw when exits unlock so the border gap is drawn.
    const exitsLocked = game.currentRoom.exitsLocked;
    if (this._lastExitsLocked !== exitsLocked) {
      this._lastExitsLocked = exitsLocked;
      this.renderer.backgroundDirty = true;
    }

    // Render background (only if dirty)
    if (!this.renderer.backgroundDirty) return;

    // Get zone background color (with progression blending)
    const environmentColors = game.zoneSystem.getBlendedEnvironmentColors(game.currentRoom.zone);
    this.renderer.clearBackground(environmentColors.background);

    // Always draw visual gaps for every exit that exists on this room.
    // The split panels on the foreground act as doors — they cover each gap
    // when closed and slide away when open.  Physics (collision map) stays
    // separate and is controlled by updateExitCollisions().
    const exits = game.currentRoom.exits;
    const borderExits = {
      north: !!exits.north,
      south: !!exits.south,
      east:  !!exits.east,
      west:  !!exits.west,
    };
    this.renderer.drawBorder(borderExits, game.currentRoom.borderColor);

    // Draw collision map — skip every cell that sits on a visual gap position
    // so the gap is never painted over by a solid wall cell.
    const centerX = Math.floor(GRID.COLS / 2);
    const centerY = Math.floor(GRID.ROWS / 2);
    for (let y = 0; y < GRID.ROWS; y++) {
      for (let x = 0; x < GRID.COLS; x++) {
        if (game.currentRoom.collisionMap[y][x]) {
          if (exits.south && y === GRID.ROWS - 1 && x === centerX) continue;
          if (exits.north && y === 0             && x === centerX) continue;
          if (exits.east  && x === GRID.COLS - 1 && y === centerY) continue;
          if (exits.west  && x === 0             && y === centerY) continue;
          this.renderer.drawFilledCell(x, y, '#444444');
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

    // Draw static background objects (exclude water, grass, and tunnel walls)
    // Tunnel walls are rendered in the foreground pass to avoid stale-canvas copy bugs
    // (the old fg→bg drawImage approach caused wrong-scale and previous-frame ghost artifacts)
    for (const obj of game.backgroundObjects) {
      const isGrass = obj.char === '|' || obj.char === '\\' || obj.char === '/' || obj.char === ',';
      const isTunnelWall = obj.data && obj.data.tunnelWall;
      if (!obj.currentAnimation && obj.char !== '~' && !isGrass && !isTunnelWall) {
        // Check plane-aware rendering (tunnel entrances, etc.)
        if (!this.shouldRenderBackgroundObject(obj, game.player)) continue;

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

    const centerX = Math.floor(GRID.COLS / 2);
    const centerY = Math.floor(GRID.ROWS / 2);
    const exitsUnlocked = !game.currentRoom.exitsLocked;

    // "R E S T" label — always call so the dissolve can animate in both directions.
    // PixelatedDissolve handles the fade-out when visible=false.
    const southExitOpen = !!(game.currentRoom.exits.south && (exitsUnlocked || game.playerHasNoItems()));
    if (game.currentRoom.exits.south) {
      this._restDissolve.render(this.renderer.fgCtx, {
        text: ' R E S T',
        font: `${GRID.CELL_SIZE}px 'VentureArcade', 'Unifont', monospace`,
        color: '#666666',
        x: GRID.WIDTH / 2,
        y: (GRID.ROWS - 3) * GRID.CELL_SIZE + GRID.CELL_SIZE / 2,
        visible: southExitOpen,
      });
    }

    // Draw exit letters (if exits are unlocked) - only for north/east/west
    // South is boolean (returns to REST), not a letter
    if (!game.currentRoom.exitsLocked) {
      // North exit
      if (game.currentRoom.exits.north && game.currentRoom.exits.north.letter) {
        this.renderer.drawEntityVA(
          centerX * GRID.CELL_SIZE + GRID.CELL_SIZE / 2,
          1 * GRID.CELL_SIZE + GRID.CELL_SIZE / 2,
          game.currentRoom.exits.north.letter,
          game.currentRoom.exits.north.color
        );
      }

      // East exit
      if (game.currentRoom.exits.east && game.currentRoom.exits.east.letter) {
        this.renderer.drawEntityVA(
          (GRID.COLS - 2) * GRID.CELL_SIZE + GRID.CELL_SIZE / 2,
          centerY * GRID.CELL_SIZE + GRID.CELL_SIZE / 2,
          game.currentRoom.exits.east.letter,
          game.currentRoom.exits.east.color
        );
      }

      // West exit
      if (game.currentRoom.exits.west && game.currentRoom.exits.west.letter) {
        this.renderer.drawEntityVA(
          1 * GRID.CELL_SIZE + GRID.CELL_SIZE / 2,
          centerY * GRID.CELL_SIZE + GRID.CELL_SIZE / 2,
          game.currentRoom.exits.west.letter,
          game.currentRoom.exits.west.color
        );
      }
    }

    // Exit gap split-reveal overlays — drawn after letters so panels mask them
    // during the opening animation, then slide away to reveal the open gap.
    this._renderExitSplits(game, centerX, centerY);

    // Draw animating background objects
    for (const obj of game.backgroundObjects) {
      if (obj.currentAnimation) {
        // Check plane-aware rendering
        if (!this.shouldRenderBackgroundObject(obj, game.player)) continue;

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
        // Check plane-aware rendering
        if (!this.shouldRenderBackgroundObject(obj, game.player)) continue;

        const renderData = obj.getRenderPosition();
        this.renderer.drawEntity(
          renderData.x + GRID.CELL_SIZE / 2,
          renderData.y + GRID.CELL_SIZE / 2,
          renderData.char,
          renderData.color
        );
      }
    }

    // Draw tunnel walls on foreground (dithered when player is inside, invisible when outside)
    // Moved from background pass to avoid: (1) wrong DPR scale from cross-canvas drawImage,
    // and (2) stale previous-frame content being copied from fgCanvas to bgCanvas.
    if (game.currentRoom?.tunnel && game.player.plane === 1) {
      for (const obj of game.backgroundObjects) {
        if (!obj.data || !obj.data.tunnelWall || obj.destroyed) continue;
        const x = obj.position.x + GRID.CELL_SIZE / 2;
        const y = obj.position.y + GRID.CELL_SIZE / 2;
        this.renderer.drawEntityDithered(x, y, obj.char, obj.color);
      }
    }

    // Draw goo blobs (ground layer - under enemies and player)
    for (const gooBlob of game.gooBlobs) {
      if (!this.shouldRenderEntity(gooBlob, game.player, game.currentRoom)) continue;
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
      const bobY = ingredient.inWater ? Math.sin(ingredient.bobTimer * 4) * 2 : 0;
      this.renderer.drawEntity(
        ingredient.position.x + GRID.CELL_SIZE / 2,
        ingredient.position.y + GRID.CELL_SIZE / 2 + bobY,
        ingredient.char,
        ingredient.color
      );
    }

    // Draw items
    for (const item of game.items) {
      const itemPlane = item.plane !== undefined ? item.plane : 0;
      const useDithering = itemPlane === 1 && game.player.plane === 1;
      const drawMethod = useDithering ? 'drawEntityDithered' : 'drawEntity';

      this.renderer[drawMethod](
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

    // Draw neutral characters (Leshy, NPCs, etc.)
    for (const neutralChar of game.neutralCharacters) {
      neutralChar.render(this.renderer.fgCtx, (gx, gy) => ({
        x: gx * GRID.CELL_SIZE,
        y: gy * GRID.CELL_SIZE
      }));
    }

    // ── Fishing system render passes ──────────────────────────────────────────
    const fishingSystem = game.fishingSystem;
    if (fishingSystem) {
      // Ambient fish (jump arcs from water)
      for (const fish of fishingSystem.fishEntities) {
        this.renderer.drawEntity(
          fish.getRenderX(),
          fish.getRenderY(),
          fish.char,
          fish.color
        );
      }

      // Bobber (visible while BOBBING state)
      if (fishingSystem.bobber?.visible) {
        const bobber = fishingSystem.bobber;
        this.renderer.drawEntity(
          bobber.getRenderX(),
          bobber.getRenderY(),
          bobber.char,
          bobber.color
        );
      }

      // Fishing charge bar: shown while holding space to cast (like bow charge)
      if (fishingSystem.state === fishingSystem.STATES.CHARGING && game.player) {
        const chargeRatio = Math.min(fishingSystem.chargeTime / 1.5, 1.0);
        const barHeight = GRID.CELL_SIZE;
        const barX = game.player.position.x + GRID.CELL_SIZE * 1.5;
        const barY = game.player.position.y;
        const filledHeight = barHeight * chargeRatio;
        this.renderer.drawRect(
          barX,
          barY + (barHeight - filledHeight),
          4,
          filledHeight,
          '#8b4513',
          true
        );
      }

      // Bite window indicator: flash '!' when bobber bites
      if (fishingSystem.state === fishingSystem.STATES.BITE_WINDOW) {
        const ctx = this.renderer.fgCtx;
        const pulse = Math.sin(Date.now() / 80) > 0;
        if (pulse && game.player) {
          ctx.save();
          ctx.font = `${GRID.CELL_SIZE}px 'Unifont', monospace`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = '#ffff00';
          ctx.globalAlpha = 0.9;
          ctx.fillText(
            '!',
            game.player.position.x + GRID.CELL_SIZE / 2,
            game.player.position.y - GRID.CELL_SIZE
          );
          ctx.restore();
        }
      }

      // Rusalka (rendered separately from neutralCharacters to avoid double-update)
      if (fishingSystem.rusalka?.alive) {
        const rusalka = fishingSystem.rusalka;
        const ctx = this.renderer.fgCtx;
        ctx.save();
        ctx.font = `${GRID.CELL_SIZE}px 'Unifont', monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.globalAlpha = rusalka.getPulseAlpha();
        ctx.fillStyle = rusalka.color;
        ctx.fillText(
          rusalka.char,
          rusalka.position.x + GRID.CELL_SIZE / 2,
          rusalka.position.y + GRID.CELL_SIZE / 2
        );
        ctx.restore();
      }

      // Reward objects: draw char + "CAUGHT: NAME" label
      for (const reward of fishingSystem.rewardObjects) {
        if (!reward.alive) continue;

        this.renderer.drawEntity(
          reward.getRenderX(),
          reward.getRenderY(),
          reward.char,
          reward.color
        );

        // "CAUGHT: NAME" text above the char (fades out after 2s)
        if (reward.messageTimer > 0) {
          const ctx = this.renderer.fgCtx;
          ctx.save();
          ctx.font = `${GRID.CELL_SIZE}px 'Unifont', monospace`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          ctx.fillStyle = reward.color;
          ctx.globalAlpha = Math.min(0.9, reward.messageTimer); // fade in last second
          ctx.fillText(
            `CAUGHT: ${reward.name}`,
            reward.getRenderX(),
            reward.getRenderY() - GRID.CELL_SIZE / 2 - 2
          );
          ctx.restore();
        }
      }
    }
    // ── End fishing render passes ─────────────────────────────────────────────

    // Draw consumable windups (dropped items during charge-up)
    for (const windup of game.inventorySystem.consumableWindups) {
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

      // Skip if enemy is in different plane than player
      if (!this.shouldRenderEntity(enemy, game.player, game.currentRoom)) continue;

      this.renderEnemy(game, enemy);
    }

    // Draw projectiles
    for (const proj of game.combatSystem.getProjectiles()) {
      // Skip if projectile is in different plane than player
      if (!this.shouldRenderEntity(proj, game.player, game.currentRoom)) continue;

      const useDithering = proj.plane === 1 && game.player.plane === 1;
      const drawMethod = useDithering ? 'drawEntityDithered' : 'drawEntity';

      this.renderer[drawMethod](
        proj.position.x + GRID.CELL_SIZE / 2,
        proj.position.y + GRID.CELL_SIZE / 2,
        proj.char,
        proj.color
      );
    }

    // Draw enemy projectiles
    for (const proj of game.combatSystem.getEnemyProjectiles()) {
      // Skip if projectile is in different plane than player
      if (!this.shouldRenderEntity(proj, game.player, game.currentRoom)) continue;

      const useDithering = proj.plane === 1 && game.player.plane === 1;
      const drawMethod = useDithering ? 'drawEntityDithered' : 'drawEntity';

      this.renderer[drawMethod](
        proj.position.x + GRID.CELL_SIZE / 2,
        proj.position.y + GRID.CELL_SIZE / 2,
        proj.char,
        proj.color
      );
    }

    // Draw melee attacks
    for (const attack of game.combatSystem.getMeleeAttacks()) {
      // Note: Melee attacks inherit plane from attacker via shooterPlane
      const useDithering = attack.shooterPlane === 1 && game.player.plane === 1;
      const cx = attack.position.x + GRID.CELL_SIZE / 2;
      const cy = attack.position.y + GRID.CELL_SIZE / 2;

      if (attack.drawAngle != null) {
        if (useDithering) {
          this.renderer.drawEntityRotatedDithered(cx, cy, attack.char, attack.color, attack.drawAngle);
        } else {
          this.renderer.drawEntityRotated(cx, cy, attack.char, attack.color, attack.drawAngle);
        }
      } else {
        const drawMethod = useDithering ? 'drawEntityDithered' : 'drawEntity';
        this.renderer[drawMethod](cx, cy, attack.char, attack.color);
      }
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

    // Draw wand proximity failure indicators (blinking outline circle)
    if (game.combatSystem.wandProximityFailures) {
      const blinkOn = Math.floor(performance.now() / 1000 * 8) % 2 === 0; // 8 Hz blink
      if (blinkOn) {
        for (const failure of game.combatSystem.wandProximityFailures) {
          // Draw the proximity requirement radius (blinking outline)
          this.renderer.drawCircle(
            failure.position.x,
            failure.position.y,
            failure.proximityRequired || 100, // Default 100 if not specified
            failure.color,
            false, // Outline only
            0.8
          );
        }
      }
    }

    // Draw wand AOE effects (filled semi-transparent circle)
    if (game.combatSystem.aoeEffects) {
      for (const effect of game.combatSystem.aoeEffects) {
        // Fade out based on timer
        const alpha = Math.min(effect.timer / 0.3, 0.5); // Max 50% opacity
        this.renderer.drawCircle(
          effect.x,
          effect.y,
          effect.radius,
          effect.color,
          true, // Filled
          alpha
        );
      }
    }

    // Draw damage numbers
    for (const dmgNum of game.combatSystem.getDamageNumbers()) {
      const scale = dmgNum.scale || 1;
      if (scale !== 1) {
        const ctx = this.renderer.fgCtx;
        ctx.save();
        ctx.globalAlpha = dmgNum.alpha;
        ctx.fillStyle = dmgNum.color;
        ctx.font = `${GRID.CELL_SIZE * scale}px 'Unifont', monospace`;
        ctx.fillText(dmgNum.value.toString(), dmgNum.x, dmgNum.y);
        ctx.restore();
      } else {
        this.renderer.drawTextWithAlpha(
          dmgNum.x,
          dmgNum.y,
          dmgNum.value.toString(),
          dmgNum.color,
          dmgNum.alpha
        );
      }
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
    const playerOnTunnelPlane = game.player.plane === 1;

    // Use dithered rendering when on tunnel plane
    if (playerOnTunnelPlane) {
      this.renderer.drawTextWithAlphaDithered(
        game.player.position.x + GRID.CELL_SIZE / 2,
        game.player.position.y + GRID.CELL_SIZE / 2,
        game.player.char,
        playerColor,
        playerAlpha
      );
    } else {
      this.renderer.drawTextWithAlpha(
        game.player.position.x + GRID.CELL_SIZE / 2,
        game.player.position.y + GRID.CELL_SIZE / 2,
        game.player.char,
        playerColor,
        playerAlpha
      );
    }

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

      // Draw sapping indicator (red * when latched to player; offset varies with bat count)
      const sappingIndicator = enemy.getSappingIndicator();
      if (sappingIndicator) {
        this.renderer.drawEntity(
          enemy.position.x + GRID.CELL_SIZE / 2 + (sappingIndicator.offsetX || 0),
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
        // Check plane-aware rendering
        if (!this.shouldRenderBackgroundObject(obj, game.player)) continue;

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

    // Draw green ranger action cooldown indicator
    this.renderController.greenRangerIndicator.render(game);

    // Old exit indicator system removed - now using colored exit letters
    // (Letters render at actual exit positions when exits unlock)

    // Underground fog-of-war overlay: darken everything outside the player's visibility circle.
    // Drawn after all entities so it clips both fg content and the bg canvas beneath.
    // Uses evenodd fill rule to punch a transparent hole at the player's position.
    if (game.currentRoom?.underground && game.player?.plane === 1) {
      const fogRadius = (game.currentRoom.underground.caveFogRadius || 5) * GRID.CELL_SIZE;
      const px = game.player.position.x + GRID.CELL_SIZE / 2;
      const py = game.player.position.y + GRID.CELL_SIZE / 2;
      const envColors = game.zoneSystem.getBlendedEnvironmentColors(game.currentRoom.zone);
      const ctx = this.renderer.fgCtx;
      ctx.save();
      ctx.fillStyle = envColors.background || '#000000';
      ctx.beginPath();
      ctx.rect(0, 0, GRID.WIDTH, GRID.HEIGHT);
      ctx.arc(px, py, fogRadius, 0, Math.PI * 2);
      ctx.fill('evenodd');
      ctx.restore();
    }

    // Draw pickup message if active
    if (game.pickupMessage && game.pickupMessageTimer > 0) {
      const ctx = this.renderer.fgCtx;
      ctx.save();
      ctx.font = `${GRID.CELL_SIZE * 2}px 'VentureArcade', Unifont, monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = COLORS.ITEM;
      this.renderer.drawWrappedText(ctx, game.pickupMessage, GRID.WIDTH / 2, GRID.HEIGHT / 2 - 100, GRID.WIDTH * 0.8, GRID.CELL_SIZE * 2.5);
      ctx.restore();
    }

    // Draw inventory overlay when 'i' key is held
    if (game.keys.i) {
      this.renderController.inventoryOverlay.render(game);
    }

    // Render cheat menu overlay (if open)
    game.cheatMenu.render(this.renderer);
  }

  _renderExitSplits(game, centerX, centerY) {
    const cs = GRID.CELL_SIZE;
    const ctx = this.renderer.fgCtx;
    const exits = game.currentRoom.exits;
    const exitsUnlocked = !game.currentRoom.exitsLocked;
    // Use the wall face color (same as collision-map cells) so the closing panel
    // is visually indistinguishable from the adjacent border wall cells.
    const wallColor = '#444444';

    // On room change: start all splits fully open so they animate closed if
    // exits are locked (enemies present), or stay open if already unlocked.
    if (this._lastRoom !== game.currentRoom) {
      this._lastRoom = game.currentRoom;
      for (const split of Object.values(this._exitSplits)) split.startOpen();
    }

    // South exit: opens as escape route even while locked (playerHasNoItems).
    const southOpen = !!(exits.south && (exitsUnlocked || game.playerHasNoItems()));
    if (exits.south) {
      this._exitSplits.south.render(ctx, {
        x: centerX * cs, y: (GRID.ROWS - 1) * cs,
        size: cs, color: wallColor, visible: southOpen,
      });
    }

    if (exits.north) {
      this._exitSplits.north.render(ctx, {
        x: centerX * cs, y: 0,
        size: cs, color: wallColor, visible: exitsUnlocked,
      });
    }

    if (exits.east) {
      this._exitSplits.east.render(ctx, {
        x: (GRID.COLS - 1) * cs, y: centerY * cs,
        size: cs, color: wallColor, visible: exitsUnlocked,
      });
    }

    if (exits.west) {
      this._exitSplits.west.render(ctx, {
        x: 0, y: centerY * cs,
        size: cs, color: wallColor, visible: exitsUnlocked,
      });
    }
  }

  renderEnemy(game, enemy) {
    if (enemy.shouldRenderVisible()) {
      // Check for DOT blink color, otherwise use normal color
      const dotColor = enemy.getDOTBlinkColor();
      const displayColor = dotColor !== null ? dotColor : enemy.color;

      // Use dithered rendering for tunnel plane entities (plane 1)
      const useDithering = enemy.plane === 1 && game.player.plane === 1;
      const drawMethod = useDithering ? 'drawEntityDithered' : 'drawEntity';

      // Boss Slime renders as 'o' at double font size
      if (enemy.char === 'M') {
        this.renderer.fgCtx.save();
        this.renderer.fgCtx.font = `${GRID.CELL_SIZE * 2}px 'Unifont', monospace`;
        this.renderer[drawMethod](
          enemy.position.x + GRID.CELL_SIZE / 2,
          enemy.position.y + GRID.CELL_SIZE / 2,
          'o',
          displayColor
        );
        this.renderer.fgCtx.restore();
      } else {
        this.renderer[drawMethod](
          enemy.position.x + GRID.CELL_SIZE / 2,
          enemy.position.y + GRID.CELL_SIZE / 2,
          enemy.char,
          displayColor
        );
      }
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

    // Draw hover indicator (... when pack hunting)
    const hoverIndicator = enemy.getHoverIndicator();
    if (hoverIndicator) {
      this.renderer.drawEntity(
        enemy.position.x + GRID.CELL_SIZE / 2,
        enemy.position.y + GRID.CELL_SIZE / 2 + hoverIndicator.offsetY,
        hoverIndicator.char,
        hoverIndicator.color
      );
    }

    // Draw sapping indicator (red * when latched to player; offset varies with bat count)
    const sappingIndicator = enemy.getSappingIndicator();
    if (sappingIndicator) {
      this.renderer.drawEntity(
        enemy.position.x + GRID.CELL_SIZE / 2 + (sappingIndicator.offsetX || 0),
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

    // Draw blind indicator (red X when blinded)
    const blindIndicator = enemy.getBlindIndicator();
    if (blindIndicator) {
      this.renderer.drawEntity(
        enemy.position.x + GRID.CELL_SIZE / 2,
        enemy.position.y + GRID.CELL_SIZE / 2 + blindIndicator.offsetY,
        blindIndicator.char,
        blindIndicator.color
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

      // 5. Draw node path waypoints (magenta dots + connecting lines)
      if (enemy.pathNodes && enemy.pathNodes.length > 0) {
        let prevPt = enemyCenter;
        for (let ni = enemy.currentNodeIndex; ni < enemy.pathNodes.length; ni++) {
          const node = enemy.pathNodes[ni];
          const nc = { x: node.x + GRID.CELL_SIZE / 2, y: node.y + GRID.CELL_SIZE / 2 };
          this.renderer.drawLine(prevPt.x, prevPt.y, nc.x, nc.y, '#ff00ff88');
          this.renderer.drawEntity(nc.x, nc.y, ni === enemy.currentNodeIndex ? '>' : '*', '#ff00ff');
          prevPt = nc;
        }
      }

      // 6. Stuck indicator — flash red '!' above enemy when stuckTimer > 0.1
      if (enemy.stuckTimer > 0.1) {
        const alpha = Math.min(enemy.stuckTimer / 0.3, 1.0);
        const hex = Math.floor(alpha * 255).toString(16).padStart(2, '0');
        this.renderer.drawEntity(enemyCenter.x, enemyCenter.y - GRID.CELL_SIZE, '!', `#ff0000${hex}`);
      }
    }
  }

  /**
   * Determine if an entity should be rendered based on plane visibility
   * CRITICAL RULES:
   * - Standard plane (0) entities: ALWAYS visible
   * - Tunnel plane (1) entities: ONLY visible if player is in tunnel (player.plane === 1)
   * - Tunnel walls: Always rendered (handled separately as background objects)
   */
  shouldRenderEntity(entity, player, room) {
    // No tunnel/underground room - always render
    if (!room.tunnel && !room.underground) return true;

    const playerPlane = player.plane !== undefined ? player.plane : 0;
    const entityPlane = entity.plane !== undefined ? entity.plane : 0;

    // Standard plane (0) ALWAYS renders
    if (entityPlane === 0) {
      return true;
    }

    // Tunnel plane (1) ONLY renders if player is in tunnel
    if (entityPlane === 1) {
      return playerPlane === 1;
    }

    // Default: render
    return true;
  }

  /**
   * Check if a background object should render based on plane and visibility flags
   * - alwaysRender: Always visible (e.g., tunnel entrances)
   * - renderOnlyOnPlane: Only visible when player is on specified plane (e.g., tunnel walls)
   */
  shouldRenderBackgroundObject(obj, player) {
    // Always render objects with alwaysRender flag (tunnel entrances)
    if (obj.data && obj.data.alwaysRender) {
      return true;
    }

    // Check renderOnlyOnPlane flag (tunnel walls)
    if (obj.data && obj.data.renderOnlyOnPlane !== undefined) {
      const playerPlane = player.plane !== undefined ? player.plane : 0;
      return playerPlane === obj.data.renderOnlyOnPlane;
    }

    // Default: render all objects
    return true;
  }
}
