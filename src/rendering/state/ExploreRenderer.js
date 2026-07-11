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

import { GRID, COLORS, ROOM_TYPES } from '../../game/GameConfig.js';
import { drawOffscreenEnemyIndicators } from '../ui/OffscreenEnemyIndicators.js';
import { drawTamedRats } from '../ui/CompanionRenderers.js';
import { INGREDIENTS } from '../../data/items.js';
import { BRIDGE_MATERIALS } from '../../systems/RidgeSystem.js';
import { PixelatedDissolve, SplitReveal } from '../effects/TextEffects.js';
import { BossRenderer } from './BossRenderer.js';
import { spectaclesTransform, spectaclesTransformString, isSpectaclesActive, CIPHER_FONT_SCALE, cipherFont } from '../../data/cipher.js';
import { isInteriorActive } from '../../systems/PlaneSystem.js';
import { hasTorchLight, drawPlayerTorchLight } from '../ui/torchLight.js';
import { stepConcealmentAlpha } from '../../systems/WorldEffectsSystem.js';
import { ConsumableTriggerSystem } from '../../systems/ConsumableTriggerSystem.js';

// Peak height (px) of a thrown consumable's toss arc, and how many full
// spins it completes over the flight — shared by every consumable windup so
// heal potions and bombs read as the same "thrown object" motion.
const THROW_ARC_HEIGHT = 46;
const THROW_SPINS = 2;

function drawDizzyOrbitals(ctx, cx, cy, timer) {
  const r = 6;
  const wobbleFreq = 2.5;
  const orbitSpeed = 1.0;
  const tilt = Math.sin(timer * wobbleFreq) * (Math.PI / 2);
  const b = r * Math.abs(Math.sin(tilt));
  const phi = timer * orbitSpeed * Math.PI * 2;
  const planeAngle = Math.PI / 4;
  ctx.save();
  ctx.fillStyle = '#ddbb00';
  for (let i = 0; i < 3; i++) {
    const theta = phi + (i * Math.PI * 2 / 3);
    const lx = Math.cos(theta) * r;
    const ly = Math.sin(theta) * b;
    const sx = cx + lx * Math.cos(planeAngle) - ly * Math.sin(planeAngle);
    const sy = cy + lx * Math.sin(planeAngle) + ly * Math.cos(planeAngle);
    ctx.beginPath();
    ctx.arc(sx, sy, 1.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export class ExploreRenderer {
  constructor(renderer, renderController) {
    this.renderer = renderer;
    this.renderController = renderController;
    this.bossRenderer = new BossRenderer(renderer);

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

    // Vacuum particle state — pixel motes cycling downward into the south exit
    this._southVacuumParticles = [];
    this._lastSouthVacuumTime = 0;
    for (let i = 0; i < 24; i++) {
      this._southVacuumParticles.push(this._makeSouthVacuumParticle());
    }
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

    // Draw ravine gradient for RIDGE rooms (overpaints gray collision cells with depth-shaded dark fills)
    if (game.currentRoom?.type === ROOM_TYPES.RIDGE) {
      const ravineShades = [
        '#0a0a0f','#0a0a0f','#0a0a0f', // rows 0-2: deep void
        '#111118','#111118','#111118', // rows 3-5
        '#1a1a22','#1a1a22','#1a1a22', // rows 6-8: cliff face
        '#222230',                      // row 9: cliff lip
      ];
      const ravineRows = game.currentRoom.ravineRows ?? 9;
      for (let row = 0; row <= ravineRows; row++) {
        this.renderer.bgCtx.fillStyle = ravineShades[row] ?? '#111118';
        for (let col = 0; col < GRID.COLS; col++) {
          this.renderer.bgCtx.fillRect(col * GRID.CELL_SIZE, row * GRID.CELL_SIZE, GRID.CELL_SIZE, GRID.CELL_SIZE);
        }
      }
    }

    // Draw border after collision map so zone color overwrites the gray perimeter cells.
    this.renderer.drawBorder(borderExits, game.currentRoom.borderColor);

    // Draw recipe sign FIRST (under all other background objects)
    if (game.currentRoom.recipeSign) {
      for (const char of game.currentRoom.recipeSign.characters) {
        const x = char.x + GRID.CELL_SIZE / 2;
        const y = char.y + GRID.CELL_SIZE / 2;
        this.renderer.bgCtx.fillStyle = char.color;
        this.renderer.bgCtx.fillText(char.char, x, y);
      }
    }

    // Draw static background objects (exclude water, grass, tunnel walls, and
    // campfires — those animate each frame and are drawn on the foreground)
    for (const obj of game.backgroundObjects) {
      const isGrass = obj.char === '|' || obj.char === '\\' || obj.char === '/' || obj.char === ',';
      const isTunnelWall = obj.data && obj.data.tunnelWall;
      if (obj.isCampfire) continue;
      if (obj.onFire) continue; // burning objects flicker on the foreground (drawBurningObjects)
      if (!obj.currentAnimation && obj.char !== '~' && !isGrass && !isTunnelWall) {
        // Check plane-aware rendering (tunnel entrances, etc.)
        if (!this.shouldRenderBackgroundObject(obj, game.player)) continue;

        const x = obj.position.x + GRID.CELL_SIZE / 2;
        const y = obj.position.y + GRID.CELL_SIZE / 2;
        this.renderer.bgCtx.fillStyle = obj.color;
        // Deflectors render as Path2D filled triangles at 1.5× cell size so
        // every collision system (bullets, boulders, player) lines up exactly
        // with the visible hypotenuse and legs.
        if (obj.data?.boulderDeflector) {
          this._drawDeflectorTriangle(this.renderer.bgCtx, x, y, obj.data.deflectorElbow, obj.color);
        } else {
          this.renderer.bgCtx.fillText(obj.char, x, y);
        }
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
    const restLabelX = GRID.WIDTH / 2;
    const restLabelY = (GRID.ROWS - 3) * GRID.CELL_SIZE + GRID.CELL_SIZE / 2;
    if (game.currentRoom.exits.south) {
      const spectaclesOn = isSpectaclesActive(game);
      // VentureArcade has limited glyph coverage; under spectacles fall back to
      // Unifont which renders the Greek substitutes correctly.
      const restFont = spectaclesOn
        ? `${Math.round(GRID.CELL_SIZE * CIPHER_FONT_SCALE)}px 'Unifont', monospace`
        : `${GRID.CELL_SIZE}px 'VentureArcade', 'Unifont', monospace`;
      this._restDissolve.render(this.renderer.fgCtx, {
        text: spectaclesTransformString(' R E S T', spectaclesOn),
        font: restFont,
        color: '#666666',
        x: restLabelX,
        y: restLabelY,
        visible: southExitOpen,
      });

      // Overlay lit letters on top of dissolve (one-shot blink)
      if (this._restDissolve.alpha > 0) {
        const FLASH_MS = 220;
        const now = performance.now();
        const flashMap = game.keyFlashMap || {};
        const text = spectaclesTransformString(' R E S T', spectaclesOn);
        // Flash lookup uses the original Latin letter so keypress R/E/S/T still lights the right slot.
        const flashLookup = ' R E S T';
        const ctx = this.renderer.fgCtx;
        ctx.save();
        ctx.globalAlpha = this._restDissolve.alpha;
        ctx.font = restFont;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        const totalW = ctx.measureText(text).width;
        const charW = totalW / text.length;
        let cx = restLabelX - totalW / 2;
        for (let i = 0; i < text.length; i++) {
          const ch = text[i];
          const upper = flashLookup[i].toUpperCase();
          if (upper !== ' ' && flashMap[upper] !== undefined && (now - flashMap[upper]) < FLASH_MS) {
            ctx.fillStyle = '#7a7a7a';
            ctx.fillText(ch, cx, restLabelY);
          }
          cx += charW;
        }
        ctx.globalAlpha = 1;
        ctx.restore();
      }
    }

    // South vacuum particles — pixel motes cycling downward into the south exit
    const _svpNow = performance.now();
    const _svpDt = Math.min((_svpNow - (this._lastSouthVacuumTime || _svpNow)) / 1000, 0.05);
    this._lastSouthVacuumTime = _svpNow;
    if (southExitOpen) {
      this._updateAndDrawSouthVacuumParticles(_svpDt);
    }

    // Settlement room: a wooden sign hovering above each hut's door, a
    // smaller capital letter centered on it identifying the hut kind.
    if (game.currentRoom.huts?.length) {
      const HUT_DOOR_LABELS = { press: 'P', wise_man: 'W', alchemy: 'A', neutral_npc: 'E', fisherman: 'F', weapons_master: 'M' };
      const CS = GRID.CELL_SIZE;
      const ctx = this.renderer.fgCtx;
      for (const hut of game.currentRoom.huts) {
        const label = HUT_DOOR_LABELS[hut.hutKind];
        if (!label || !hut.doorPosition) continue;
        const cx = hut.doorPosition.col * CS + CS / 2;
        const cy = (hut.doorPosition.row - 1) * CS + CS / 2;
        ctx.save();
        ctx.fillStyle = '#5a3a22';
        ctx.fillRect(cx - CS / 2 + 1, cy - CS / 2 + 1, CS - 2, CS - 2);
        ctx.strokeStyle = '#2e1f12';
        ctx.lineWidth = 1;
        ctx.strokeRect(cx - CS / 2 + 1, cy - CS / 2 + 1, CS - 2, CS - 2);
        ctx.font = `${Math.round(CS * 0.65)}px 'VentureArcade', monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#00ff00';
        ctx.fillText(label, cx, cy);
        ctx.restore();
      }
    }

    // Draw exit letters (if exits are unlocked) - only for north/east/west
    // South is boolean (returns to REST), not a letter
    if (!game.currentRoom.exitsLocked) {
      const FLASH_MS = 220;
      const now = performance.now();
      const flashMap = game.keyFlashMap || {};
      const lightenHex = (hex, t) => {
        const c = hex.replace('#', '');
        const r = Math.round(parseInt(c.slice(0, 2), 16) + t * (255 - parseInt(c.slice(0, 2), 16)));
        const g = Math.round(parseInt(c.slice(2, 4), 16) + t * (255 - parseInt(c.slice(2, 4), 16)));
        const b = Math.round(parseInt(c.slice(4, 6), 16) + t * (255 - parseInt(c.slice(4, 6), 16)));
        return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
      };
      // Per-color lerp toward white — tuned per zone since saturated colors behave differently
      const LIGHTEN_T = {
        '#00ff00': 0.40, // green
        '#ff4400': 0.40, // red
        '#44ffff': 0.30, // cyan
        '#ffff44': 0.75, // yellow — R+G maxed, only B moves so needs larger t
        '#888888': 0.40, // gray
      };
      const litExitColor = (letter, baseColor) => {
        const upper = letter.toUpperCase();
        if (flashMap[upper] !== undefined && (now - flashMap[upper]) < FLASH_MS) {
          const t = LIGHTEN_T[baseColor] ?? 0.40;
          return lightenHex(baseColor, t);
        }
        return baseColor;
      };
      // Fairy-dusted exits use a static pink tint. No animation — animated
      // letters are reserved for keyboard-input prompts (F key, etc.).
      const DUSTED_EXIT_COLOR = '#ffaaff';

      const spectaclesOn = isSpectaclesActive(game);
      // drawEntityVA uses the VentureArcade font, which lacks Greek glyph
      // coverage. Route ciphered letters through drawEntity (Unifont) instead.
      const drawExitLetter = (x, y, letter, color) => {
        if (spectaclesOn) {
          const ctx = this.renderer.fgCtx;
          ctx.save();
          ctx.font = `${Math.round(GRID.CELL_SIZE * CIPHER_FONT_SCALE)}px 'Unifont', monospace`;
          ctx.fillStyle = color;
          ctx.fillText(spectaclesTransform(letter, true), x, y);
          ctx.restore();
        } else {
          this.renderer.drawEntityVA(x, y, letter, color);
        }
      };

      // North exit
      if (game.currentRoom.exits.north && game.currentRoom.exits.north.letter) {
        const ex = game.currentRoom.exits.north;
        const { letter, color: baseColor } = ex;
        let displayColor;
        if ((game.preBossGateActive || game.preMinibossGateActive) && letter === 'B') {
          // Sinusoidal orange-to-red pulse (~3s period)
          const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 160);
          displayColor = `rgb(255,${Math.round(80 + 80 * pulse)},0)`;
        } else if (ex.mutated && ex.mutationSource === 'fairyDust') {
          displayColor = DUSTED_EXIT_COLOR;
        } else {
          displayColor = litExitColor(letter, baseColor);
        }
        drawExitLetter(
          centerX * GRID.CELL_SIZE + GRID.CELL_SIZE / 2,
          1 * GRID.CELL_SIZE + GRID.CELL_SIZE / 2,
          letter,
          displayColor
        );
      }

      // East exit
      if (game.currentRoom.exits.east && game.currentRoom.exits.east.letter) {
        const ex = game.currentRoom.exits.east;
        const { letter, color } = ex;
        const displayColor = (ex.mutated && ex.mutationSource === 'fairyDust')
          ? DUSTED_EXIT_COLOR
          : litExitColor(letter, color);
        drawExitLetter(
          (GRID.COLS - 2) * GRID.CELL_SIZE + GRID.CELL_SIZE / 2,
          centerY * GRID.CELL_SIZE + GRID.CELL_SIZE / 2,
          letter,
          displayColor
        );
      }

      // West exit
      if (game.currentRoom.exits.west && game.currentRoom.exits.west.letter) {
        const ex = game.currentRoom.exits.west;
        const { letter, color } = ex;
        const displayColor = (ex.mutated && ex.mutationSource === 'fairyDust')
          ? DUSTED_EXIT_COLOR
          : litExitColor(letter, color);
        drawExitLetter(
          1 * GRID.CELL_SIZE + GRID.CELL_SIZE / 2,
          centerY * GRID.CELL_SIZE + GRID.CELL_SIZE / 2,
          letter,
          displayColor
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

    // Draw campfires on foreground each frame so the flicker animation reads
    for (const obj of game.backgroundObjects) {
      if (!obj.isCampfire || obj.destroyed) continue;
      const renderData = obj.getRenderPosition();
      this.renderer.drawEntity(
        renderData.x + GRID.CELL_SIZE / 2,
        renderData.y + GRID.CELL_SIZE / 2,
        renderData.char,
        renderData.color
      );
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

    // Draw tunnel/cave walls on foreground (dithered when player is inside, invisible when outside).
    // Checks both tunnel (T rooms) and underground (U rooms) since both use tunnelWall bg objects.
    if ((game.currentRoom?.tunnel || game.currentRoom?.underground) && game.player.plane === 1) {
      for (const obj of game.backgroundObjects) {
        if (!obj.data || !obj.data.tunnelWall || obj.destroyed) continue;
        const x = obj.position.x + GRID.CELL_SIZE / 2;
        const y = obj.position.y + GRID.CELL_SIZE / 2;
        this.renderer.drawEntityDithered(x, y, obj.char, obj.color);
      }
    }

    // Draw puddles + goo blobs (surface entries only — interior entries routed via overlay).
    // hutPlane=false here selects the surface set; hutPlane=true is called by HutInteriorOverlay.
    this.drawPuddles(game, false);
    this.drawGooBlobs(game, false);

    // Draw debris + ingredients (surface entries only — interior entries routed via overlay).
    this.drawDebris(game, false);
    this.drawIngredients(game, false);

    // Draw crows (first explore room flavor)
    if (game.currentRoom.crows && game.currentRoom.crows.length > 0) {
      for (const crow of game.currentRoom.crows) {
        this._drawCrow(crow);
      }
    }

    // Draw follower flock (persists across rooms after feeding events).
    if (game.followerCrows && game.followerCrows.length > 0) {
      for (const crow of game.followerCrows) {
        this._drawCrow(crow);
      }
    }

    if (game.companionCrows && game.companionCrows.length > 0) {
      for (const c of game.companionCrows) {
        this._drawCrow(c);
      }
    }

    // Draw items (surface entries only — interior entries routed via overlay).
    this.drawItems(game, false);

    // Draw placed traps (surface only — interior-tagged entries draw via overlay).
    for (const entry of game.placedTraps) {
      const { item } = entry;
      if (entry.interior === true) continue;
      if (entry.blinkVisible === false) continue;
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

    // Draw camp NPC (idle/interested in current room) and companion (cross-room)
    this._renderCampNPCs(game);

    // ── Bridge donation panel ─────────────────────────────────────────────────
    if (game.bridgeMenuOpen && game.currentRoom?.type === ROOM_TYPES.RIDGE) {
      this._renderBridgePanel(game);
    }

    // ── Bridge donation arc ───────────────────────────────────────────────────
    const donAnim = game.ridgeSystem?.getDonationArc?.();
    if (donAnim) this._renderDonationArc(donAnim);

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

    // When player is inside a hut, all interior-coord entities (player, combat,
    // particles) are rendered by HutInteriorOverlay at the correct canvas offset.
    // Skip them here to prevent ghosting at unshifted positions.
    const playerInInterior = isInteriorActive(game);

    // Draw consumable windups — every consumable throw arcs up and spins
    // before landing, where its effect resolves (ConsumableTriggerSystem).
    for (const windup of !playerInInterior ? game.inventorySystem.consumableWindups : []) {
      const progress = 1 - (windup.timer / windup.maxTimer);

      // Jolt Jar bakes its own arc lift into windup.y (see InventorySystem
      // updateConsumableWindups) since it's also interpolating toward a
      // fixed target — don't double-apply the lift for it.
      const arcLift = windup.effectType === 'jolt'
        ? 0
        : Math.sin(Math.min(1, Math.max(0, progress)) * Math.PI) * THROW_ARC_HEIGHT;
      const spinAngle = progress * Math.PI * 2 * THROW_SPINS;

      this.renderer.drawEntityRotated(
        windup.x,
        windup.y - arcLift,
        windup.consumable.char,
        windup.consumable.color,
        spinAngle
      );

      // Self-targeted potions (heal, buffs, shields, ...) have no AoE landing
      // zone to telegraph — skip the ring entirely for those.
      if (ConsumableTriggerSystem.isSelfOnlyEffect(windup.effectType)) continue;

      const aoeRadius = game.consumableTriggerSystem.getWindupAoeRadius(windup);

      // Draw pulsing ring to show AoE damage radius.
      // Jolt Jar is a thrown projectile — show the ring at the locked impact
      // target, not around the moving jar.
      const pulse = Math.sin(progress * Math.PI * 6) * 0.15; // Subtle pulse
      const displayRadius = aoeRadius * (1 + pulse);
      const ringX = (windup.effectType === 'jolt' && windup.targetX != null) ? windup.targetX : windup.x;
      const ringY = (windup.effectType === 'jolt' && windup.targetY != null) ? windup.targetY : windup.y;

      this.renderer.fgCtx.save();
      this.renderer.fgCtx.strokeStyle = windup.consumable.color;
      this.renderer.fgCtx.globalAlpha = 0.4 + Math.sin(progress * Math.PI * 8) * 0.2;
      this.renderer.fgCtx.lineWidth = 2;
      this.renderer.fgCtx.beginPath();
      this.renderer.fgCtx.arc(ringX, ringY, displayRadius, 0, Math.PI * 2);
      this.renderer.fgCtx.stroke();

      // Draw inner ring at 50% radius for better depth perception
      this.renderer.fgCtx.globalAlpha = 0.2;
      this.renderer.fgCtx.lineWidth = 1;
      this.renderer.fgCtx.beginPath();
      this.renderer.fgCtx.arc(ringX, ringY, displayRadius * 0.5, 0, Math.PI * 2);
      this.renderer.fgCtx.stroke();

      this.renderer.fgCtx.restore();
    }

    // Draw non-sapping enemies first (so they render behind player)
    // Skip when interior (overlay calls drawNonSappingEnemies after translate with activeFloor enemies)
    if (!playerInInterior) {
      this.drawNonSappingEnemies(game, game.activeRoom.enemies);
      drawOffscreenEnemyIndicators(this.renderer, game, game.activeRoom.enemies);
      // Tamed rats render through a dedicated minimal path — NPCRat doesn't
      // implement the full Enemy indicator surface (windup/memory/detection
      // /hover/sapping/spawn/blind indicators) so reusing the Enemy renderer
      // would crash. See CompanionRenderers.drawTamedRats.
      if (game.tamedRats?.length) drawTamedRats(this.renderer, game, this.shouldRenderEntity);
    }

    // Detection system overlay (toggle with 'v' key)
    if (game.showVectors && !playerInInterior) {
      this._renderDetectionVisuals(game);
    }

    // Surface projectiles only — interior projectiles routed via overlay's drawProjectiles(true).
    this.drawProjectiles(game, false);

    // Surface enemy projectiles + melee — interior versions routed via overlay.
    this.drawEnemyProjectiles(game, false);
    this.drawMeleeAttacks(game, false);

    // Player shockwave (Crystal Maul charged attack) is invisible by design —
    // it manifests only through background objects shaking as the ring sweeps
    // them (handled in InteractionSystem). Mirrors the cyan-zone boss pattern.

    // Surface enemy melee — interior versions routed via overlay.
    this.drawEnemyMeleeAttacks(game, false);

    // Enemy frog tongues + mimic tongues — interior versions routed via overlay
    // (both helpers read game._activeEnemies(), so they resolve to the active layer).
    if (!playerInInterior) {
      this.drawEnemyTongues(game);
      this.drawMimicTongues(game);
    }

    // Surface frog-tongue attacks — interior versions routed via overlay.
    this.drawPlayerTongueAttacks(game, false);

    // Sticky triplines: permanent committed segments + live preview from player
    // to pendingAnchor. Red X above player when wire equipped but not over an anchor.
    if (!playerInInterior) this._drawWires(game);

    // Draw cure Rusalka (polymorph reversal, Lake rooms) — skip when inHut/inMaze
    if (!playerInInterior && game.cureRusalka) {
      const r = game.cureRusalka;
      const ra = r.getPulseAlpha ? r.getPulseAlpha() : 1.0;
      this.renderer.drawTextWithAlpha(
        r.position.x + GRID.CELL_SIZE / 2,
        r.position.y + GRID.CELL_SIZE / 2,
        r.char,
        r.color,
        ra
      );
    }

    // Surface stuck arrows — interior versions routed via overlay.
    this.drawStuckArrows(game, false);

    // Draw wand proximity failure indicators — skip when inHut
    if (!playerInInterior && game.combatSystem.wandProximityFailures) {
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

    // Draw wand AOE effects — skip when inHut
    if (!playerInInterior && game.combatSystem.aoeEffects) {
      const fgCtx = this.renderer.fgCtx;
      for (const effect of game.combatSystem.aoeEffects) {
        const alpha = effect.maxTimer
          ? (effect.timer / effect.maxTimer) * 0.5
          : Math.min(effect.timer / 0.3, 0.5);
        if (effect.type === 'cone') {
          fgCtx.save();
          fgCtx.globalAlpha = alpha;
          fgCtx.fillStyle = effect.color;
          fgCtx.beginPath();
          fgCtx.moveTo(effect.x, effect.y);
          fgCtx.arc(effect.x, effect.y, effect.radius,
            effect.angle - effect.halfAngle, effect.angle + effect.halfAngle);
          fgCtx.closePath();
          fgCtx.fill();
          fgCtx.restore();
        } else {
          this.renderer.drawCircle(effect.x, effect.y, effect.radius, effect.color, true, alpha);
        }
      }
    }

    // Surface combat flourish — interior versions routed via overlay.
    this.drawLightningStrikes(game, false);
    this.drawChainArcs(game, false);
    this.drawDamageNumbers(game, false);
    this.drawParticles(game, false);
    this.drawSteamClouds(game, false);

    // Draw player — skip when inHut (overlay renders player at correct interior offset)
    // Tall-grass concealment fades rapidly in/out so stepping into cover
    // doesn't pop the player sprite.
    if (!playerInInterior) {
    const playerHidden = this._isOnTallGrass(game, game.player.position.x, game.player.position.y);
    const concealAlpha = stepConcealmentAlpha(game.player, !playerHidden);
    if (concealAlpha > 0.005) {
    const playerAlpha = game.player.getVisibilityAlpha();
    // Moss Cloak 𐤒 active: render the player as a bush `%` in moss-green.
    const mossActive = game.player.mossCloakActive === true;
    const playerChar = mossActive ? '%' : game.player.char;
    const playerColor = mossActive ? '#228822' : game.player.getDisplayColor();
    const playerOnTunnelPlane = game.player.plane === 1;
    const ctx = this.renderer.fgCtx;
    const needsAlpha = concealAlpha < 0.999;
    if (needsAlpha) { ctx.save(); ctx.globalAlpha = concealAlpha; }

    // Use dithered rendering when on tunnel plane
    if (playerOnTunnelPlane) {
      this.renderer.drawTextWithAlphaDithered(
        game.player.position.x + GRID.CELL_SIZE / 2,
        game.player.position.y + GRID.CELL_SIZE / 2,
        playerChar,
        playerColor,
        playerAlpha
      );
    } else if (game.player.dodgeRoll?.type === 'whirlwind' && game.player.dodgeRoll.active) {
      // Whirlwind Cape: render player spinning rapidly (no alpha — iframes are short)
      const spinAngle = game.player.statusBlinkTimer * Math.PI * 20; // ~10 rotations/sec
      this.renderer.drawEntityRotated(
        game.player.position.x + GRID.CELL_SIZE / 2,
        game.player.position.y + GRID.CELL_SIZE / 2,
        playerChar,
        playerColor,
        spinAngle
      );
    } else {
      this.renderer.drawTextWithAlpha(
        game.player.position.x + GRID.CELL_SIZE / 2,
        game.player.position.y + GRID.CELL_SIZE / 2,
        playerChar,
        playerColor,
        playerAlpha
      );
    }
    if (needsAlpha) ctx.restore();
    }
    } // end player render block

    // Dizzy orbital particles — player
    if (!playerInInterior && game.player.isDizzy()) {
      drawDizzyOrbitals(
        this.renderer.fgCtx,
        game.player.position.x + GRID.CELL_SIZE / 2,
        game.player.position.y + GRID.CELL_SIZE / 2,
        game.player.statusBlinkTimer
      );
    }

    // Draw staff-block stance: staff held perpendicular to facing direction,
    // ~1 cell forward from player center.
    if (!playerInInterior && game.player.isStaffBlocking && game.player.heldItem) {
      const facingAngle = Math.atan2(game.player.facing.y, game.player.facing.x);
      const offset = GRID.CELL_SIZE * 0.9;
      const cx = game.player.position.x + GRID.CELL_SIZE / 2 + Math.cos(facingAngle) * offset;
      const cy = game.player.position.y + GRID.CELL_SIZE / 2 + Math.sin(facingAngle) * offset;
      const staffChar = game.player.heldItem.data?.meleeChar || game.player.heldItem.char || '|';
      const staffColor = game.player.heldItem.color || '#ffffff';
      // Rotate the (vertical-glyph) staff so it lies perpendicular to facing.
      this.renderer.drawEntityRotated(cx, cy, staffChar, staffColor, facingAngle);
    }

    // Draw known-spell indicators above player
    if (!playerInInterior && game.knownSpells?.size > 0) {
      this._renderKnownSpellHints(game);
    }

    // Coin-in-pocket hint when standing in a usable W room. Tells the player
    // they have something coin-shaped without explaining what it's for.
    if (!playerInInterior) {
      this._renderWellCoinHint(game);
    }

    // Draw "SPACE ENTER" prompt near exterior hut/dungeon/maze doors
    if (!playerInInterior) {
      this._renderDoorPrompts(game);
    }

    // Draw gem wand held aloft (with shake) while charging
    if (!playerInInterior) {
      const held = game.player.heldItem;
      if (held?.data?.gemWand && held.isCharging) {
        const C = GRID.CELL_SIZE;
        const ctx = this.renderer.fgCtx;
        // Charge progress 0..1 — shake intensifies as the spell nears completion
        const t = Math.min(1, held.chargeTime / (held.data.chargeTime || 1));
        const shakeAmp = 0.5 + 2.5 * t;
        const jitterX = (Math.random() - 0.5) * shakeAmp;
        const jitterY = (Math.random() - 0.5) * shakeAmp;
        ctx.save();
        ctx.font = `${C}px 'Unifont', monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = held.color || '#ffffff';
        ctx.fillText(
          held.char,
          game.player.position.x + C / 2 + jitterX,
          game.player.position.y - C * 0.6 + jitterY
        );
        ctx.restore();
      }
    }

    // Draw blinking trap charge count above player (hidden during charge-up)
    if (!playerInInterior && !game.trapCharging) {
      const held = game.player.heldItem;
      if (held?.charges != null && held.charges > 0 && Math.floor(performance.now() / 200) % 2 === 0) {
        const C = GRID.CELL_SIZE;
        const ctx = this.renderer.fgCtx;
        ctx.save();
        ctx.font = `${C * 0.7}px 'Unifont', monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = held.color || '#ffffff';
        ctx.fillText(held.charges.toString(), game.player.position.x + C / 2, game.player.position.y - C * 0.4);
        ctx.restore();
      }
    }

    // Draw trap throw reticule while charging (traps only) or a translucent weapon
    // ghost at the estimated landing spot (thrown weapons only).
    if (!playerInInterior) {
      this.drawTrapReticule(game);
      this.drawThrowPreview(game);
    }

    // Draw in-flight throwables (traps + thrown weapons).
    if (!playerInInterior) this.drawInFlightTraps(game, false);

    // Draw sapping enemies on top of player — skip when interior (overlay handles via its own drawSappingEnemies call)
    if (!playerInInterior) this.drawSappingEnemies(game, game.activeRoom.enemies);

    // Draw boss composite (body + necks + multi-char heads) — skips individual entity rendering
    if (!playerInInterior && game.bossSystem?.active) {
      this.bossRenderer.renderBossComposite(game);
    }

    // Draw grass on foreground AFTER player so it appears on top
    // Includes tall grass (|, \, /) and cut grass (,)
    // Only draw exterior grass when player is NOT inside a PiP interior — interiors
    // render their own foreground layer, and exterior grass must not bleed over the overlay.
    if (!playerInInterior) {
      for (const obj of game.backgroundObjects) {
        if (obj.onFire) continue; // burning grass is drawn by the flicker pass below
        const isGrass = obj.char === '|' || obj.char === '\\' || obj.char === '/' || obj.char === ',';
        if (isGrass && !obj.currentAnimation && !obj.destroyed) {
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

      // Burning objects flicker on the foreground each frame (same idea as the
      // campfire loop) — drawn after grass so the fire reads on top of the field.
      this.drawBurningObjects(game, false);
    }

    // Draw rolling rocks and edge-warning arrows (red zone only)
    if (!playerInInterior && game.boulderSystem) {
      const { rocks, warnings } = game.boulderSystem.getRenderData();
      const BOULDER_COLOR = '#aa7744';
      const WARN_COLOR = '#ffff00';

      // Warning arrows — blink yellow/transparent at 5 Hz
      const WARN_CHAR = { north: 'v', south: '^', east: '<', west: '>' };
      const blinkOn = Math.floor(performance.now() / 200) % 2 === 0;
      for (const w of warnings) {
        // lateralPx is the float pixel position along the entry edge
        const inside = GRID.CELL_SIZE * 1.5; // just inside the border
        let wx, wy;
        if (w.direction === 'north')      { wx = w.lateralPx; wy = inside; }
        else if (w.direction === 'south') { wx = w.lateralPx; wy = GRID.HEIGHT - inside; }
        else if (w.direction === 'west')  { wx = inside;      wy = w.lateralPx; }
        else                              { wx = GRID.WIDTH - inside; wy = w.lateralPx; }
        this.renderer.drawTextWithAlpha(wx, wy, WARN_CHAR[w.direction], WARN_COLOR, blinkOn ? 1.0 : 0.0);
      }

      // Active rocks — cycle through chars to look like rolling
      const ROLL_CHARS = ['O', 'o', '0', 'Q'];
      for (const r of rocks) {
        if (r.x <= GRID.CELL_SIZE || r.x >= (GRID.COLS - 1) * GRID.CELL_SIZE ||
            r.y <= GRID.CELL_SIZE || r.y >= (GRID.ROWS - 1) * GRID.CELL_SIZE) continue;
        this.renderer.drawEntity(r.x, r.y, ROLL_CHARS[r.animFrame], BOULDER_COLOR);
      }
    }

    // Draw bow charge indicator — skip when inHut (overlay renders these)
    if (!playerInInterior) this.renderController.bowChargeIndicator.render(game);

    // Draw green ranger action cooldown indicator — skip when inHut
    if (!playerInInterior) this.renderController.greenRangerIndicator.render(game);

    // Sandstorm sand motes — yellow zone wind. Drawn over entities so motes
    // pass in front, under interior overlays so they don't bleed into the PiP.
    if (!playerInInterior) {
      game.sandstormSystem?.render(this.renderer.fgCtx);
    }

    // Old exit indicator system removed - now using colored exit letters
    // (Letters render at actual exit positions when exits unlock)

    // Underground fog-of-war overlay: darken everything outside the player's visibility circle.
    // Drawn after all entities so it clips both fg content and the bg canvas beneath.
    // Uses evenodd fill rule to punch a transparent hole at the player's position.
    if (game.currentRoom?.underground && game.player?.plane === 1) {
      const torchLit = hasTorchLight(game);
      const fogRadius = (game.currentRoom.underground.caveFogRadius || 5) * GRID.CELL_SIZE * (torchLit ? 1.5 : 1);
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
      if (torchLit) drawPlayerTorchLight(this.renderer, px, py);
    }

    // Gray zone mist: surface-plane '~' glyph field (cave fog above owns plane 1).
    // After entities — mist hangs in front of them — before Tab overlay and PiPs.
    if (!playerInInterior) {
      game.grayZoneSystem?.renderMist(this.renderer.fgCtx, game);
    }

    // Draw inventory overlay when Tab is held
    if (game.keys.tab) {
      this.renderController.inventoryOverlay.render(game);
    }

    // Render the active interior overlay (picture-in-picture). Single dispatch
    // point — routes to hut/dungeon/maze (and future pond) by active kind.
    this.renderController.interiorOverlay.render(game);

    // Well ritual: spinning coin arc + post-ritual screen flash
    this._renderWellRitual(game);

    // Pickup/notification message — drawn last so it sits above hut/maze overlays
    if (game.pickupMessage && game.pickupMessageTimer > 0) {
      const ctx = this.renderer.fgCtx;
      const spectaclesOn = isSpectaclesActive(game);
      ctx.save();
      ctx.font = cipherFont(GRID.CELL_SIZE * 2, spectaclesOn);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = COLORS.ITEM;
      this.renderer.drawWrappedText(ctx, spectaclesTransformString(game.pickupMessage, spectaclesOn), GRID.WIDTH / 2, GRID.HEIGHT / 2 - 100, GRID.WIDTH * 0.8, GRID.CELL_SIZE * 2.5);
      ctx.restore();
    }

    // Render cheat menu overlay (if open)
    game.cheatMenu.render(this.renderer);
  }

  _renderDonationArc(anim) {
    const ctx = this.renderer.fgCtx;
    const dur = 0.55;
    const peak = GRID.CELL_SIZE * 4;
    const t = Math.min(1, anim.t / dur);
    const x = anim.startX + (anim.endX - anim.startX) * t;
    const arcLift = 4 * t * (1 - t);
    const baseY = anim.startY + (anim.endY - anim.startY) * t;
    const y = baseY - peak * arcLift;
    const frames = [anim.char, 'O', '|', 'O'];
    const frame = frames[Math.floor(anim.spinPhase) % frames.length];
    ctx.save();
    ctx.font = `${GRID.CELL_SIZE * 1.25}px 'Unifont', monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ccaa66';
    ctx.shadowColor = '#aa8833';
    ctx.shadowBlur = 6;
    ctx.fillText(frame, x, y);
    ctx.restore();
  }

  // Spinning Infused Coin in a north-peaked arc + the white flash that fires
  // once the coin reaches the well center.
  _renderWellRitual(game) {
    const ctx = this.renderer.fgCtx;
    const anim = game.wellCoinAnim;

    if (anim) {
      const dur = 0.55; // must match WellSystem.ARC_DURATION
      const peak = GRID.CELL_SIZE * 4;
      const t = Math.min(1, anim.t / dur);
      const x = anim.startX + (anim.endX - anim.startX) * t;
      // Parabolic arc peaking northward (negative y is up). 4t(1-t) hits 1 at t=0.5.
      const arcLift = 4 * t * (1 - t);
      const baseY = anim.startY + (anim.endY - anim.startY) * t;
      const y = baseY - peak * arcLift;

      // Spin frames + color depend on the offering type. Infused (¤) → warm gold;
      // Lucky (★) → bright yellow with star frames; raw (c) → dull copper.
      let frames, fillStyle, shadowColor;
      if (anim.offeringType === 'lucky') {
        frames = ['★', '✦', '|', '✦'];
        fillStyle = '#ffff66';
        shadowColor = '#ffdd33';
      } else if (anim.offeringType === 'raw') {
        frames = ['c', 'o', '|', 'o'];
        fillStyle = '#cc9955';
        shadowColor = '#aa6633';
      } else {
        frames = ['¤', 'O', '|', 'O'];
        fillStyle = '#ffcc66';
        shadowColor = '#ffaa33';
      }
      const frame = frames[Math.floor(anim.spinPhase) % frames.length];

      ctx.save();
      ctx.font = `${GRID.CELL_SIZE * 1.25}px 'Unifont', monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = fillStyle;
      ctx.shadowColor = shadowColor;
      ctx.shadowBlur = 6;
      ctx.fillText(frame, x, y);
      ctx.restore();
    }

    if (game.wellFlashTimer > 0 && game.wellFlashDuration > 0) {
      const alpha = (game.wellFlashTimer / game.wellFlashDuration) * 0.85;
      ctx.save();
      ctx.fillStyle = `rgba(255, 240, 200, ${alpha})`;
      ctx.fillRect(0, 0, GRID.WIDTH, GRID.HEIGHT);
      ctx.restore();
    }
  }

  // Camp NPC rendering: idle/interested NPC in current room, hired companion,
  // coin-offering arc, and hint text overlay.
  _renderCampNPCs(game) {
    // Skip rendering when player is inside a sub-area where NPCs aren't drawn.
    // (HutInterior/DungeonFloor are still in EXPLORE; companion follows in.)
    if (game.player?.inMaze) return;

    const ctx = this.renderer.fgCtx;
    const gridToPixel = (gx, gy) => ({ x: gx * GRID.CELL_SIZE, y: gy * GRID.CELL_SIZE });

    const drawn = new Set();

    const idle = game.currentRoom?.campNPC;
    if (idle && !game.player?.inHut) {
      idle.render(ctx, gridToPixel);
      drawn.add(idle);
    }

    const companion = game.companion;
    // When the player is inside a hut/dungeon PiP, the companion is rendered
    // by HutInteriorOverlay instead of the main fg pass.
    if (companion && !drawn.has(companion) && !game.player?.inHut && !game.player?.inDungeon) {
      companion.render(ctx, gridToPixel);
    }

    // Coin arc — north-peaked parabola from player → NPC, mirroring well ritual
    const anim = game.campNPCSystem?.getCoinAnim?.();
    if (anim) this.drawCoinArc(anim);

    // Camp NPC hints speak through the dialogue box (DialogueSystem), not
    // center-screen text — that style is reserved for the narrator voice.
  }

  // Spinning wallet-coin arc (player → recipient). Shared by the surface
  // camp-NPC pass and the hut PiP (fisherman coin trade) — the PiP path works
  // because fgCtx is already translated to interior coords when this runs.
  drawCoinArc(anim) {
    const ctx = this.renderer.fgCtx;
    const dur = 0.55;
    const peak = GRID.CELL_SIZE * 4;
    const t = Math.min(1, anim.t / dur);
    const x = anim.startX + (anim.endX - anim.startX) * t;
    const arcLift = 4 * t * (1 - t);
    const baseY = anim.startY + (anim.endY - anim.startY) * t;
    const y = baseY - peak * arcLift;
    const frames = ['c', 'O', '|', 'O'];
    const frame = frames[Math.floor(anim.spinPhase) % frames.length];
    ctx.save();
    ctx.font = `${GRID.CELL_SIZE * 1.25}px 'Unifont', monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffcc66';
    ctx.shadowColor = '#ffaa33';
    ctx.shadowBlur = 6;
    ctx.fillText(frame, x, y);
    ctx.restore();
  }

  _renderExitSplits(game, centerX, centerY) {
    const cs = GRID.CELL_SIZE;
    const ctx = this.renderer.fgCtx;
    const exits = game.currentRoom.exits;
    const exitsUnlocked = !game.currentRoom.exitsLocked;
    // Use the zone border color so the closing panel blends with the perimeter.
    const wallColor = game.currentRoom.borderColor;

    // On room change: start all splits fully open so they animate closed if
    // exits are locked (enemies present), or stay open if already unlocked.
    if (this._lastRoom !== game.currentRoom) {
      this._lastRoom = game.currentRoom;
      for (const split of Object.values(this._exitSplits)) split.startOpen();
    }

    // Hold the doors open while the inbound entrance tween is still running —
    // the closing animation should only begin once the player has control.
    const entering = !!game.animationSystem?.isAnimating(game.player);

    // Must match the extra pixels widened in ASCIIRenderer.drawBorder.
    const extra = 2;

    // South exit: opens as escape route even while locked (playerHasNoItems).
    const southOpen = !!(exits.south && (exitsUnlocked || game.playerHasNoItems() || entering));
    if (exits.south) {
      this._exitSplits.south.render(ctx, {
        x: centerX * cs - extra, y: (GRID.ROWS - 1) * cs,
        width: cs + extra * 2, height: cs, color: wallColor, visible: southOpen,
      });
    }

    if (exits.north) {
      this._exitSplits.north.render(ctx, {
        x: centerX * cs - extra, y: 0,
        width: cs + extra * 2, height: cs, color: wallColor, visible: exitsUnlocked || entering,
      });
    }

    if (exits.east) {
      this._exitSplits.east.render(ctx, {
        x: (GRID.COLS - 1) * cs, y: centerY * cs - extra,
        width: cs, height: cs + extra * 2, color: wallColor, visible: exitsUnlocked || entering,
      });
    }

    if (exits.west) {
      this._exitSplits.west.render(ctx, {
        x: 0, y: centerY * cs - extra,
        width: cs, height: cs + extra * 2, color: wallColor, visible: exitsUnlocked || entering,
      });
    }
  }

  // Returns true if (x, y) sits inside a tall-grass cluster dense enough to
  // act as cover. RoomGenerator emits two BackgroundObject instances per
  // visual blade (6px apart, so each blade can straddle two grid cells), so
  // we count raw '|' instances in the standing cell plus its 4 cardinal
  // neighbours and require ≥ 6 — ~3 visual blades minimum. Same rule drives
  // grassStealth detection and universal player/item/enemy concealment.
  _isOnTallGrass(game, x, y) {
    const bgObjects = game._activeBackgroundObjects
      ? game._activeBackgroundObjects()
      : (game.currentRoom?.backgroundObjects ?? []);
    const cs = GRID.CELL_SIZE;
    const cx = Math.floor(x / cs);
    const cy = Math.floor(y / cs);
    let onCell = 0;
    let nearby = 0;
    for (const obj of bgObjects) {
      if (obj.destroyed || obj.char !== '|') continue;
      const ox = Math.floor(obj.position.x / cs);
      const oy = Math.floor(obj.position.y / cs);
      const dx = Math.abs(ox - cx);
      const dy = Math.abs(oy - cy);
      if (dx === 0 && dy === 0) onCell++;
      if (dx + dy <= 1) nearby++;
    }
    return onCell > 0 && nearby >= 6;
  }

  // Draw a single intermittent sparkle at the center of a tile.
  // Sequence: dot → slowly spinning asterisk → dot, then a quiet tail.
  // Period ~1.8s with a 0.6s active window. Per-position phase offset so
  // adjacent sparkles don't sync.
  _drawGrassSparkle(cx, cy) {
    const phase = (((cx * 73856093) ^ (cy * 19349663)) >>> 0) % 1800 / 1000;
    const t = (performance.now() / 1000 + phase) % 1.8;
    if (t > 0.6) return;
    const color = '#ffffcc';
    if (t < 0.15 || t >= 0.45) {
      // Pixel-sized dot — head and tail of the sparkle.
      this.renderer.drawEntity(cx, cy, '·', color);
    } else {
      // Spinning asterisk — gentle ~1/6 rotation across the 0.3s mid window.
      const angle = ((t - 0.15) / 0.3) * (Math.PI * 2 / 3);
      this.renderer.drawEntityRotated(cx, cy, '*', color, angle);
    }
  }

  // Draws a deflector as a filled right triangle centered at (cx, cy). The
  // triangle fills the cell exactly so it lines up with the collision shape
  // used by PhysicsSystem / BoulderSystem / CombatSystem.
  _drawDeflectorTriangle(ctx, cx, cy, elbow, color) {
    const h = GRID.CELL_SIZE * 0.5;
    let v0, v1, v2;
    switch (elbow) {
      case 'NE': v0 = [cx - h, cy + h]; v1 = [cx - h, cy - h]; v2 = [cx + h, cy + h]; break;
      case 'NW': v0 = [cx + h, cy + h]; v1 = [cx + h, cy - h]; v2 = [cx - h, cy + h]; break;
      case 'SE': v0 = [cx - h, cy - h]; v1 = [cx - h, cy + h]; v2 = [cx + h, cy - h]; break;
      case 'SW': v0 = [cx + h, cy - h]; v1 = [cx + h, cy + h]; v2 = [cx - h, cy - h]; break;
      default:   return;
    }
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(v0[0], v0[1]);
    ctx.lineTo(v1[0], v1[1]);
    ctx.lineTo(v2[0], v2[1]);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  _drawCrow(crow) {
    const offsetY = crow.getRenderOffsetY();
    this.renderer.drawEntity(
      crow.position.x + GRID.CELL_SIZE / 2,
      crow.position.y + GRID.CELL_SIZE / 2 + offsetY,
      crow.char,
      crow.color
    );
    // Beak pixel: shown for either the wild hoard glyph or a companion's
    // ferried ingredient. Same visual language — single colored pixel
    // matched to the glyph — so the player reads both cases as "this crow
    // is holding something."
    const beakGlyph = (crow.hoardItem && !crow.droppedHoard)
      ? crow.hoardItem
      : crow.carriedIngredient;
    if (beakGlyph) {
      const dot = INGREDIENTS[beakGlyph]?.color || '#ffffff';
      const prev = this.renderer.fgCtx.fillStyle;
      this.renderer.fgCtx.fillStyle = dot;
      this.renderer.fgCtx.fillRect(
        Math.round(crow.position.x + GRID.CELL_SIZE / 2 + 3),
        Math.round(crow.position.y + GRID.CELL_SIZE / 2 + offsetY + 1),
        1, 1
      );
      this.renderer.fgCtx.fillStyle = prev;
    }
  }

  renderEnemy(game, enemy) {
    // Tall-grass stealth: any non-flying enemy standing inside a 3+ blade
    // cluster fades to hidden. grassStealth enemies use the same rule — the
    // flag is now redundant for ground enemies but kept for future flying
    // variants. Use the active layer's background objects so interior enemies
    // check interior grass, not exterior grass.
    const groundEnemy = enemy.data?.float !== true;
    const applyGrass = !enemy.data?.isDummy && (enemy.data?.grassStealth || groundEnemy);
    let concealAlpha = 1;
    if (applyGrass) {
      const hidden = this._isOnTallGrass(game, enemy.position.x, enemy.position.y);
      concealAlpha = stepConcealmentAlpha(enemy, !hidden);
      if (concealAlpha < 0.005) return;
    }
    const _enemyCtx = this.renderer.fgCtx;
    const _enemyNeedsAlpha = concealAlpha < 0.999;
    if (_enemyNeedsAlpha) { _enemyCtx.save(); _enemyCtx.globalAlpha = concealAlpha; }
    try {

    // Shell camouflage: render as a rock when in shell form
    if (enemy.data?.shellCamouflage && enemy.inShellForm) {
      const blinkCycle = Math.floor(Date.now() / 250) % 2 === 0;
      const shellColor = (enemy.inLava && blinkCycle) ? '#ff4400' : '#996633';
      this.renderer.drawEntity(
        enemy.position.x + GRID.CELL_SIZE / 2,
        enemy.position.y + GRID.CELL_SIZE / 2,
        '0',
        shellColor
      );
      return; // Skip normal enemy rendering and indicators
    }

    // Mimic disguise: render as a floor item until revealed
    if (enemy.data?.mimicMechanic?.enabled && !enemy.mimicRevealed) {
      const flashPhase = enemy.mimicFlashTimer > 0;
      const disguiseChar = flashPhase
        ? (Math.floor(Date.now() / 80) % 2 === 0 ? enemy.disguisedAs : enemy.char)
        : enemy.disguisedAs;
      this.renderer.drawEntity(
        enemy.position.x + GRID.CELL_SIZE / 2,
        enemy.position.y + GRID.CELL_SIZE / 2,
        disguiseChar,
        '#ccaa66'
      );
      return; // Skip normal enemy indicators while disguised
    }

    // Collapsed Risen: inert bone pile; a last-second shiver is the only tell.
    if (enemy.collapsed && enemy.data?.riseAgain) {
      const shiverX = enemy.riseTimer < 1.0
        ? Math.round(Math.sin(Date.now() / 40) * 1.5)
        : 0;
      this.renderer.drawEntity(
        enemy.position.x + GRID.CELL_SIZE / 2 + shiverX,
        enemy.position.y + GRID.CELL_SIZE / 2,
        enemy.data.riseAgain.pileChar || '8',
        '#998877'
      );
      return; // Skip normal enemy indicators while collapsed
    }

    if (enemy.shouldRenderVisible()) {
      // iframe flash (white) takes priority, then DOT blink, then base color
      const iframeColor = enemy.getIframeFlashColor();
      const dotColor = iframeColor === null ? enemy.getDOTBlinkColor() : null;
      let displayColor = iframeColor !== null ? iframeColor
                       : dotColor !== null     ? dotColor
                       : enemy.color;
      // Blink red when standing in lava (lava-immune enemies only)
      if (enemy.inLava && enemy.data?.lavaImmune && iframeColor === null) {
        displayColor = Math.floor(Date.now() / 250) % 2 === 0 ? '#ff3300' : displayColor;
      }

      // Boss/miniboss near-death warning: blink dark red — highest-priority signal (mirrors the player)
      const nearDeathColor = enemy.getNearDeathBlinkColor();
      if (nearDeathColor !== null) displayColor = nearDeathColor;

      // Use dithered rendering for tunnel plane entities (plane 1)
      const useDithering = enemy.plane === 1 && game.player.plane === 1;
      const drawMethod = useDithering ? 'drawEntityDithered' : 'drawEntity';

      // Force Wand root: vibrate enemy position while rooted
      let shakeX = 0, shakeY = 0;
      if (enemy.forceRootTimer > 0) {
        const t = Date.now() / 1000;
        shakeX = Math.round(Math.sin(t * 60 + enemy.position.x * 0.1) * 2);
        shakeY = Math.round(Math.cos(t * 67 + enemy.position.y * 0.1) * 2);
      }

      // Zap (electric-affinity stun): rapid hi-frequency shake distinguishes it from plain stun.
      if (enemy.isZapped?.()) {
        const t = Date.now() / 1000;
        shakeX += Math.round(Math.sin(t * 140 + enemy.position.x) * 2);
        shakeY += Math.round(Math.cos(t * 137 + enemy.position.y) * 2);
      }

      // Death-shake: enemy with deathExplosion shakes urgently before detonating
      if (enemy.isDying) {
        const t = Date.now() / 1000;
        shakeX = Math.round(Math.sin(t * 120 + enemy.position.x) * 3);
        shakeY = Math.round(Math.cos(t * 113 + enemy.position.y) * 3);
        // Pulse toward the explosion color as the timer runs down
        const de = enemy.data.deathExplosion;
        const deathColor = de.projectileType === 'fire' ? '#ff6600'
                         : de.projectileType === 'freeze' ? '#88ccff'
                         : de.projectileType === 'magic' ? '#cc88ff'
                         : '#ffcc44';
        displayColor = Math.floor(Date.now() / 120) % 2 === 0 ? deathColor : displayColor;
      }

      if (enemy.data?.isDummy) {
        const pos = enemy.position;
        let wobbleX = 0;
        if (enemy.invulnerabilityTimer > 0) {
          const t = Date.now() / 1000;
          wobbleX = Math.round(Math.sin(t * 90 + pos.x) * 2);
        }
        const cx = pos.x + GRID.CELL_SIZE / 2 + wobbleX;
        const cy = pos.y + GRID.CELL_SIZE / 2;
        this.renderer[drawMethod](cx, cy + GRID.CELL_SIZE, '|', displayColor);
        this.renderer[drawMethod](cx, cy, '@', displayColor);
      } else if (enemy.char === 'M' && enemy.data?.splitOnDamage?.enabled) {
        // Giant Slime renders as a huge 'o' (same as regular slime, just enormous).
        // Gated on splitOnDamage, not just char 'M' — Moose (HuntingSystem) shares it.
        // Lift visually during the leap arc; compress slightly during windup so the player reads the telegraph.
        const liftY = enemy.leapArcLift || 0;
        const windupSquash = enemy.leapWindupActive ? Math.min(0.85, 1 - (enemy.leapWindupTimer / (enemy.data.leapAttack?.windupTime || 1)) * 0.15) : 1;
        this.renderer.fgCtx.save();
        this.renderer.fgCtx.font = `${GRID.CELL_SIZE * 3 * windupSquash}px 'Unifont', monospace`;
        this.renderer[drawMethod](
          enemy.position.x + GRID.CELL_SIZE / 2 + shakeX,
          enemy.position.y + GRID.CELL_SIZE / 2 + shakeY - liftY,
          'o',
          displayColor
        );
        this.renderer.fgCtx.restore();
      } else if (enemy.char === 'B') {
        // Goblin Brute — hulking chief reads as visibly larger than its pack.
        this.renderer.fgCtx.save();
        this.renderer.fgCtx.font = `${Math.round(GRID.CELL_SIZE * 1.8)}px 'Unifont', monospace`;
        this.renderer[drawMethod](
          enemy.position.x + GRID.CELL_SIZE / 2 + shakeX,
          enemy.position.y + GRID.CELL_SIZE / 2 + shakeY,
          enemy.char,
          displayColor
        );
        this.renderer.fgCtx.restore();
      } else {
        const arcLift = enemy.jumpArcLift || 0;
        this.renderer[drawMethod](
          enemy.position.x + GRID.CELL_SIZE / 2 + shakeX,
          enemy.position.y + GRID.CELL_SIZE / 2 + shakeY - arcLift,
          enemy.char,
          displayColor
        );
      }
    }

    // Parry indicator (Duelist): show ']' above enemy when parry is active
    if (enemy.parryActive) {
      const parryColor = enemy.data?.parryMechanic?.parryColor || '#eeeeff';
      this.renderer.drawEntity(
        enemy.position.x + GRID.CELL_SIZE / 2,
        enemy.position.y + GRID.CELL_SIZE / 2 - GRID.CELL_SIZE,
        ']',
        parryColor
      );
    }

    // Reflect shield indicator (Mirror Imp): show '|' above when shield is active
    if (enemy.shieldActive) {
      const shieldColor = enemy.data?.reflectShield?.shieldColor || '#ffffff';
      const shieldFlash = Math.floor(Date.now() / 100) % 2 === 0 ? shieldColor : '#8888ff';
      this.renderer.drawEntity(
        enemy.position.x + GRID.CELL_SIZE / 2,
        enemy.position.y + GRID.CELL_SIZE / 2 - GRID.CELL_SIZE,
        '|',
        shieldFlash
      );
    }

    // Siren singing indicator: pulse lure char near siren
    if (enemy.lureSinging) {
      const lureColor = `rgba(100, 200, 220, ${0.4 + 0.3 * Math.sin(Date.now() / 300)})`;
      this.renderer.drawEntity(
        enemy.position.x + GRID.CELL_SIZE / 2,
        enemy.position.y + GRID.CELL_SIZE / 2 - GRID.CELL_SIZE,
        '~',
        '#66ccdd'
      );
    }

    // Shaman buff windup indicator
    if (enemy.buffWindupActive) {
      this.renderer.drawEntity(
        enemy.position.x + GRID.CELL_SIZE / 2,
        enemy.position.y + GRID.CELL_SIZE / 2 - GRID.CELL_SIZE,
        '*',
        '#ffaa00'
      );
    }

    // Boar charge telegraph: line from boar to target during windup, locked
    // direction during the dash. Pulses brighter as windup completes.
    if (enemy.data?.chargeMechanic?.enabled && enemy.target) {
      const ex = enemy.position.x + GRID.CELL_SIZE / 2;
      const ey = enemy.position.y + GRID.CELL_SIZE / 2;
      const cfg = enemy.data.chargeMechanic;
      const length = cfg.chargeSpeed * cfg.chargeDuration;
      if (enemy.chargeState === 'windup') {
        const t = 1 - (enemy.chargeWindupTimer / cfg.chargeWindup);
        const tx = ex + (enemy.target.position.x - enemy.position.x) /
                   Math.hypot(enemy.target.position.x - enemy.position.x,
                              enemy.target.position.y - enemy.position.y || 1) * length;
        const ty = ey + (enemy.target.position.y - enemy.position.y) /
                   Math.hypot(enemy.target.position.x - enemy.position.x,
                              enemy.target.position.y - enemy.position.y || 1) * length;
        const alpha = Math.floor(60 + 180 * t).toString(16).padStart(2, '0');
        this.renderer.drawLine(ex, ey, tx, ty, '#ff5533' + alpha);
      } else if (enemy.chargeState === 'charging') {
        const tx = ex + enemy.chargeDir.x * length;
        const ty = ey + enemy.chargeDir.y * length;
        this.renderer.drawLine(ex, ey, tx, ty, '#ff773344');
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

    // Draw trap-layer indicator (... while charging, yellow ! while fleeing)
    const trapLayerIndicator = enemy.getTrapLayerIndicator();
    if (trapLayerIndicator) {
      this.renderer.drawEntity(
        enemy.position.x + GRID.CELL_SIZE / 2,
        enemy.position.y + GRID.CELL_SIZE / 2 + trapLayerIndicator.offsetY,
        trapLayerIndicator.char,
        trapLayerIndicator.color
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

    // Dizzy orbital particles
    if (enemy.statusEffects.dizzy?.active && enemy.shouldRenderVisible()) {
      drawDizzyOrbitals(
        this.renderer.fgCtx,
        enemy.position.x + GRID.CELL_SIZE / 2,
        enemy.position.y + GRID.CELL_SIZE / 2,
        enemy.dotBlinkTimer
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
    } finally {
      if (_enemyNeedsAlpha) _enemyCtx.restore();
    }
  }

  /**
   * Sound-detection system overlay — drawn when game.showVectors is active ('v' key).
   *
   * Renders:
   *  • Per enemy: hearing range ring (7-cell radius) colour-coded by alert state,
   *               emergency contact ring (2-cell radius).
   *  • Active sound events: expanding ripple ring animating from birth to death.
   *  • Player noise indicator: dim ring showing player's sound-emission radius.
   */
  _renderDetectionVisuals(game) {
    const HEARING_RANGE   = GRID.CELL_SIZE * 7;   // must match Enemy.js constant
    const EMERGENCY_RANGE = GRID.CELL_SIZE * 2;   // must match Enemy.js constant
    const SOUND_RADIUS    = GRID.CELL_SIZE * 7;   // visual for emitted sound pulse
    const SOUND_LIFETIME  = 0.5;                  // must match _emitSoundEvent lifetime

    for (const enemy of game.activeRoom.enemies) {
      const cx = enemy.position.x + GRID.CELL_SIZE / 2;
      const cy = enemy.position.y + GRID.CELL_SIZE / 2;

      // Determine alert state for colour coding
      const isEnraged      = enemy.enraged;
      const isChasing      = enemy.state === 'chase' || enemy.state === 'attack' || enemy.state === 'windup';
      const isMemory       = enemy.aggroMemoryActive;
      const isIdle         = !isEnraged && !isChasing && !isMemory;

      // Hearing range ring colour: gray = idle, yellow = sound heard, red = fully alerted
      let hearingColor;
      let hearingAlpha;
      if (isEnraged || isChasing) {
        hearingColor = '#ff3300';
        hearingAlpha = 0.35;
      } else if (isMemory) {
        hearingColor = '#ff9900';
        hearingAlpha = 0.25;
      } else {
        // Check if enemy is currently hearing a sound event
        const soundEvents = game.soundEvents || [];
        const hearing = soundEvents.some(ev => {
          const dx = ev.x - enemy.position.x;
          const dy = ev.y - enemy.position.y;
          return dx * dx + dy * dy <= HEARING_RANGE * HEARING_RANGE;
        });
        hearingColor = hearing ? '#ffdd00' : '#555555';
        hearingAlpha = hearing ? 0.30 : 0.12;
      }

      // Draw hearing range ring (dashed appearance via low alpha fill + stroke)
      this.renderer.drawCircle(cx, cy, HEARING_RANGE, hearingColor, true,  hearingAlpha * 0.3);
      this.renderer.drawCircle(cx, cy, HEARING_RANGE, hearingColor, false, hearingAlpha);

      // Draw emergency contact ring (always visible, red)
      const emergencyAlpha = isIdle ? 0.30 : 0.55;
      this.renderer.drawCircle(cx, cy, EMERGENCY_RANGE, '#ff2200', true,  emergencyAlpha * 0.3);
      this.renderer.drawCircle(cx, cy, EMERGENCY_RANGE, '#ff2200', false, emergencyAlpha);
    }

    // Draw active sound event ripples
    for (const ev of (game.soundEvents || [])) {
      const progress = 1.0 - (ev.lifetime / SOUND_LIFETIME); // 0 at birth → 1 at expiry
      const rippleRadius = SOUND_RADIUS * progress;
      const rippleAlpha  = (1.0 - progress) * 0.75; // fades as it expands
      this.renderer.drawCircle(ev.x, ev.y, rippleRadius, '#ffffff', false, rippleAlpha);
    }

    // Draw player noise indicator — dim ring showing the emission radius
    if (game.player) {
      const px = game.player.position.x + GRID.CELL_SIZE / 2;
      const py = game.player.position.y + GRID.CELL_SIZE / 2;
      const hasActiveSound = (game.soundEvents || []).length > 0;
      const playerRingColor = hasActiveSound ? '#ffaa00' : '#ffffff';
      const playerRingAlpha = hasActiveSound ? 0.45 : 0.12;
      this.renderer.drawCircle(px, py, SOUND_RADIUS, playerRingColor, false, playerRingAlpha);
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
    const entityPlane = entity.plane !== undefined ? entity.plane : 0;

    // Standard plane (0) ALWAYS renders
    if (entityPlane === 0) {
      return true;
    }

    // No tunnel/underground room - plane 1 still hides (e.g. burrowed game animals)
    if (!room.tunnel && !room.underground) return false;

    const playerPlane = player.plane !== undefined ? player.plane : 0;

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

    // Surface-only obstacles: hide when player is underground
    if (obj.surfaceOnly) {
      const playerPlane = player.plane !== undefined ? player.plane : 0;
      return playerPlane === 0;
    }

    // Check renderOnlyOnPlane flag (tunnel walls)
    if (obj.data && obj.data.renderOnlyOnPlane !== undefined) {
      const playerPlane = player.plane !== undefined ? player.plane : 0;
      return playerPlane === obj.data.renderOnlyOnPlane;
    }

    // Default: render all objects
    return true;
  }

  _renderBridgePanel(game) {
    const ctx = this.renderer.fgCtx;
    const room = game.currentRoom;
    const donated = room.bridgeDonated ?? { stick: 0, metal: 0, rock: 0 };
    const inv = game.player?.inventory ?? [];

    // Count player inventory for each material (inventory stores plain char strings)
    const have = {};
    for (const mat of BRIDGE_MATERIALS) {
      have[mat.key] = inv.filter(i => i === mat.char).length;
    }

    const PAN_W = 208;
    const ROW_H = 18;
    const ROWS  = BRIDGE_MATERIALS.length;
    const PAN_H = 14 + ROWS * ROW_H + 22; // top-pad + rows + prompt
    const panX  = Math.round((GRID.WIDTH  - PAN_W) / 2);
    const panY  = Math.round((GRID.HEIGHT - PAN_H) / 2) + 32; // nudge below center

    ctx.save();

    // Panel background + border
    ctx.fillStyle = 'rgba(8, 8, 12, 0.92)';
    ctx.fillRect(panX, panY, PAN_W, PAN_H);
    ctx.strokeStyle = '#cc9933';
    ctx.lineWidth = 1;
    ctx.strokeRect(panX + 0.5, panY + 0.5, PAN_W - 1, PAN_H - 1);

    ctx.font = `${GRID.CELL_SIZE}px Unifont, monospace`;
    ctx.textBaseline = 'top';

    // One material row per line: [icon]  [have]  →  [donated/need]
    const colIcon    = panX + 12;
    const colHave    = panX + 36;
    const colArrow   = panX + 78;
    const colDonated = panX + 106;
    const colCheck   = panX + 180;

    for (let i = 0; i < BRIDGE_MATERIALS.length; i++) {
      const mat  = BRIDGE_MATERIALS[i];
      const don  = donated[mat.key] ?? 0;
      const done = don >= mat.need;
      const rowY = panY + 10 + i * ROW_H;

      // Icon
      const iconColors = { stick: '#8b6533', metal: '#aaaaaa', rock: '#777777' };
      ctx.fillStyle = done ? '#557755' : iconColors[mat.key];
      ctx.textAlign = 'left';
      ctx.fillText(mat.char, colIcon, rowY);

      // Player have count
      ctx.fillStyle = done ? '#557755' : (have[mat.key] > 0 ? '#dddddd' : '#555555');
      ctx.textAlign = 'right';
      ctx.fillText(String(have[mat.key]), colHave, rowY);

      // Arrow
      ctx.fillStyle = '#555555';
      ctx.textAlign = 'left';
      ctx.fillText('\u2192', colArrow, rowY);

      // Donated / need
      ctx.fillStyle = done ? '#44bb66' : '#aaaaaa';
      ctx.textAlign = 'left';
      ctx.fillText(`${don}\u2009/\u2009${mat.need}`, colDonated, rowY);

      // Checkmark when complete
      if (done) {
        ctx.fillStyle = '#44bb66';
        ctx.textAlign = 'left';
        ctx.fillText('\u2713', colCheck, rowY);
      }
    }

    // Prompt
    const anyLeft = BRIDGE_MATERIALS.some(m => (donated[m.key] ?? 0) < m.need);
    const canDonate = anyLeft && BRIDGE_MATERIALS.some(m => have[m.key] > 0 && (donated[m.key] ?? 0) < m.need);
    ctx.textAlign = 'center';
    ctx.font = `12px Unifont, monospace`;
    ctx.fillStyle = canDonate ? '#ffff44' : (anyLeft ? '#444444' : '#44bb66');
    ctx.fillText(
      anyLeft ? (canDonate ? '[SPACE] donate' : 'need more materials') : 'bridge complete',
      panX + PAN_W / 2,
      panY + PAN_H - 14
    );

    ctx.restore();
  }

  /**
   * Draws all known spells as small labels stacked above the player.
   * Letters matching the current typed buffer prefix light up; the rest stay dim.
   * First-learned spell sits closest to the player; newer ones stack upward.
   */
  _renderKnownSpellHints(game) {
    const knownSpells = game.knownSpells;
    if (!knownSpells?.size) return;

    const C = GRID.CELL_SIZE;
    const keyBuffer = game.keyBuffer ?? [];
    const ctx = this.renderer.fgCtx;

    ctx.save();
    ctx.font = `${Math.round(C * 0.65)}px 'Unifont', monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const charW = ctx.measureText('M').width;
    const spacing = charW * 1.35;
    const ROW_H = C * 0.82;
    const cx = game.player.position.x + C / 2;
    const baseY = game.player.position.y - C * 0.9;

    let row = 0;
    for (const word of knownSpells) {
      const totalW = spacing * (word.length - 1);
      const startX = cx - totalW / 2;
      const cy = baseY - row * ROW_H;

      // Count how many leading letters of this word are in the buffer tail
      let progress = 0;
      for (let len = Math.min(keyBuffer.length, word.length); len >= 1; len--) {
        const suffix = keyBuffer.slice(keyBuffer.length - len).join('');
        if (word.startsWith(suffix)) { progress = len; break; }
      }

      const specOn = isSpectaclesActive(game);
      for (let i = 0; i < word.length; i++) {
        ctx.fillStyle = i < progress ? '#88ff88' : '#333333';
        ctx.fillText(spectaclesTransform(word[i], specOn), startX + i * spacing, cy);
      }

      row++;
    }

    ctx.restore();
  }

  /**
   * Renders a small dim 'c' above the player when they're in a W (well) room
   * holding at least one Coin ingredient. Only shown while the well is still
   * usable. Mirrors the spell-hint style so the player reads it as "you have
   * something" without explanation.
   */
  _renderWellCoinHint(game) {
    const room = game.currentRoom;
    if (!room || room.type !== ROOM_TYPES.WELL) return;
    if (!room.well || room.well.consumed) return;
    if (!game.inventorySystem?.hasCoin()) return;

    const C = GRID.CELL_SIZE;
    const ctx = this.renderer.fgCtx;
    const cx = game.player.position.x + C / 2;
    // Sit above any existing spell hints by a row.
    const knownCount = game.knownSpells?.size || 0;
    const cy = game.player.position.y - C * 0.9 - knownCount * (C * 0.82);

    ctx.save();
    ctx.font = `${Math.round(C * 0.65)}px 'Unifont', monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffff66';
    ctx.globalAlpha = 0.55;
    ctx.fillText(spectaclesTransform('c', isSpectaclesActive(game)), cx, cy);
    ctx.restore();
  }

  /**
   * Renders a "SPACE  ENTER" prompt above the door glyph when the player
   * is within interaction range of an exterior hut, dungeon, or maze door.
   */
  _renderDoorPrompts(game) {
    if (!game.player) return;

    let doorPosition = null;
    if (game.hutSystem?.nearExteriorDoor()) {
      doorPosition = game.currentRoom?.hut?.doorPosition;
    } else if (game.dungeonSystem?.nearExteriorDoor()) {
      doorPosition = game.currentRoom?.dungeon?.doorPosition;
    } else if (game.mazeSystem?.nearExteriorDoor()) {
      doorPosition = game.currentRoom?.maze?.doorPosition;
    }

    if (!doorPosition) return;

    const C = GRID.CELL_SIZE;
    const ctx = this.renderer.fgCtx;
    ctx.save();
    ctx.font = `10px 'Unifont', monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ccccaa';
    ctx.fillText(
      spectaclesTransformString('SPACE  ENTER', isSpectaclesActive(game)),
      doorPosition.col * C + C / 2,
      doorPosition.row * C - C * 0.75
    );
    ctx.restore();
  }

  /** Creates a single south vacuum particle with a random initial cycle phase. */
  _makeSouthVacuumParticle() {
    const colors = ['#cc9a3c', '#d4a84a', '#dbb85a', '#c8943a'];
    return {
      xOffset: (Math.random() - 0.5) * GRID.CELL_SIZE * 4,
      t: Math.random(),
      cycleSpeed: 0.20 + Math.random() * 0.12,
      size: Math.random() < 0.65 ? 1 : 2,
      color: colors[Math.floor(Math.random() * colors.length)],
      maxAlpha: 0.3 + Math.random() * 0.4,
    };
  }

  /** Advances each south particle's cycle phase and draws it within the 2-cell exit zone. */
  _updateAndDrawSouthVacuumParticles(dt) {
    const exitX = GRID.WIDTH / 2;
    // Zone reaches from the south exit gap up to above the REST label
    const zoneDepth = 4 * GRID.CELL_SIZE + GRID.CELL_SIZE / 2 + 5;
    const ctx = this.renderer.fgCtx;

    for (const p of this._southVacuumParticles) {
      p.t = (p.t + p.cycleSpeed * dt) % 1;

      // t=0 → top of zone (above REST label), t=1 → at the exit gap (south border)
      const y = GRID.HEIGHT - (1 - p.t) * zoneDepth;
      // Spread converges toward center as the particle falls toward the exit
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

  // ─── Shared render passes ────────────────────────────────────────────────
  // Called from both surface render (no transform) and interior overlays
  // (after applying ctx.translate). Body must use entity-local coords so the
  // active transform places them correctly in either context. Plane-aware
  // checks degrade to no-ops in interior since interior entities are plane 0.

  drawProjectiles(game, hutPlane = false) {
    for (const proj of game.combatSystem.getProjectiles()) {
      if (!!proj.hutPlane !== hutPlane) continue;
      if (!this.shouldRenderEntity(proj, game.player, game.currentRoom)) continue;
      const useDithering = proj.plane === 1 && game.player.plane === 1;
      const cx = proj.position.x + GRID.CELL_SIZE / 2;
      const cy = proj.position.y + GRID.CELL_SIZE / 2;
      if (proj.drawAngle != null) {
        const method = useDithering ? 'drawEntityRotatedDithered' : 'drawEntityRotated';
        this.renderer[method](cx, cy, proj.char, proj.color, proj.drawAngle);
      } else {
        const method = useDithering ? 'drawEntityDithered' : 'drawEntity';
        this.renderer[method](cx, cy, proj.char, proj.color);
      }
    }
  }

  drawEnemyProjectiles(game, hutPlane = false) {
    for (const proj of game.combatSystem.getEnemyProjectiles()) {
      if (!!proj.hutPlane !== hutPlane) continue;
      if (!this.shouldRenderEntity(proj, game.player, game.currentRoom)) continue;
      const useDithering = proj.plane === 1 && game.player.plane === 1;
      const drawMethod = useDithering ? 'drawEntityDithered' : 'drawEntity';
      const projColor = (proj.reflectable && !proj.reflected) ? '#00ff66' : proj.color;
      this.renderer[drawMethod](
        proj.position.x + GRID.CELL_SIZE / 2,
        proj.position.y + GRID.CELL_SIZE / 2,
        proj.char,
        projColor
      );
    }
  }

  drawMeleeAttacks(game, hutPlane = false) {
    for (const attack of game.combatSystem.getMeleeAttacks()) {
      if (!!attack.hutPlane !== hutPlane) continue;
      const useDithering = attack.shooterPlane === 1 && game.player.plane === 1;
      const cx = attack.position.x + GRID.CELL_SIZE / 2;
      const cy = attack.position.y + GRID.CELL_SIZE / 2;
      const scale = attack.drawScale || 1.0;
      if (attack.drawAngle != null) {
        if (useDithering) {
          this.renderer.drawEntityRotatedDithered(cx, cy, attack.char, attack.color, attack.drawAngle, scale);
        } else {
          this.renderer.drawEntityRotated(cx, cy, attack.char, attack.color, attack.drawAngle, scale);
        }
      } else if (scale !== 1.0) {
        this.renderer.drawEntityScaled(cx, cy, attack.char, attack.color, scale);
      } else {
        const drawMethod = useDithering ? 'drawEntityDithered' : 'drawEntity';
        this.renderer[drawMethod](cx, cy, attack.char, attack.color);
      }
    }
  }

  drawEnemyMeleeAttacks(game, hutPlane = false) {
    for (const attack of game.combatSystem.getEnemyMeleeAttacks()) {
      if (!!attack.hutPlane !== hutPlane) continue;
      const displayColor = attack.flashWhite ? '#ffffff' : attack.color;
      const alpha = attack.alpha !== undefined ? attack.alpha : 1.0;
      const cx = attack.position.x + GRID.CELL_SIZE / 2;
      const cy = attack.position.y + GRID.CELL_SIZE / 2;
      const scale = attack.drawScale || 1.0;
      if (attack.drawAngle != null) {
        const ctx = this.renderer.fgCtx;
        const prevAlpha = ctx.globalAlpha;
        ctx.globalAlpha = alpha;
        this.renderer.drawEntityRotated(cx, cy, attack.char, displayColor, attack.drawAngle, scale);
        ctx.globalAlpha = prevAlpha;
      } else if (scale !== 1.0) {
        const ctx = this.renderer.fgCtx;
        const prevAlpha = ctx.globalAlpha;
        ctx.globalAlpha = alpha;
        this.renderer.drawEntityScaled(cx, cy, attack.char, displayColor, scale);
        ctx.globalAlpha = prevAlpha;
      } else {
        this.renderer.drawTextWithAlpha(cx, cy, attack.char, displayColor, alpha);
      }
    }
  }

  drawStuckArrows(game, hutPlane = false) {
    for (const arrow of game.combatSystem.getStuckArrows()) {
      if (!!arrow.hutPlane !== hutPlane) continue;
      this.renderer.drawEntity(
        arrow.position.x + GRID.CELL_SIZE / 2,
        arrow.position.y + GRID.CELL_SIZE / 2,
        arrow.char,
        arrow.color
      );
    }
  }

  drawLightningStrikes(game, hutPlane = false) {
    if (!game.lightningStrikeSystem) return;
    const ctx = this.renderer.fgCtx;
    const strikes = game.lightningStrikeSystem.getStrikes();
    for (const s of strikes) {
      if (!!s.hutPlane !== hutPlane) continue;

      if (s.warningTimer > 0) {
        // Warning circle — pulses, color crossfades yellow → white as t→0
        const t = 1 - (s.warningTimer / s.warningDuration); // 0..1 toward strike
        const pulse = 0.55 + 0.35 * Math.sin(t * Math.PI * 8);
        const r = Math.floor(255);
        const g = Math.floor(255);
        const b = Math.floor(120 + 135 * t);
        const color = `rgb(${r},${g},${b})`;
        this.renderer.drawCircle(s.x, s.y, s.radius, color, false, pulse);
        // A second ring just inside makes the telegraph readable on noisy ground
        this.renderer.drawCircle(s.x, s.y, s.radius * 0.65, color, false, pulse * 0.6);
      } else if (s.flashTimer > 0) {
        // Strike flash — jagged bolt from top of canvas to strike point
        const alpha = Math.max(0, s.flashTimer / 0.12);
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
        ctx.shadowColor = '#ffff88';
        ctx.shadowBlur = 8;
        const segs = 10;
        const startY = 0;
        ctx.beginPath();
        ctx.moveTo(s.x, startY);
        for (let i = 1; i < segs; i++) {
          const f = i / segs;
          const y = startY + (s.y - startY) * f;
          const jitter = (Math.random() - 0.5) * GRID.CELL_SIZE * 0.9;
          ctx.lineTo(s.x + jitter, y);
        }
        ctx.lineTo(s.x, s.y);
        ctx.stroke();
        ctx.restore();
        // Bright impact flash on the ground
        this.renderer.drawCircle(s.x, s.y, s.radius, '#ffffff', true, alpha * 0.5);
      }
    }
  }

  drawChainArcs(game, hutPlane = false) {
    if (!game.combatSystem.getChainArcs) return;
    const ctx = this.renderer.fgCtx;
    for (const arc of game.combatSystem.getChainArcs()) {
      if (!!arc.hutPlane !== hutPlane) continue;
      const alpha = Math.max(0, arc.timer / arc.duration);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = arc.color;
      ctx.lineWidth = 2;
      const dx = arc.x2 - arc.x1;
      const dy = arc.y2 - arc.y1;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      const px = -dy / len;
      const py = dx / len;
      const segs = 4;
      ctx.beginPath();
      ctx.moveTo(arc.x1, arc.y1);
      for (let s = 1; s < segs; s++) {
        const t = s / segs;
        const jitter = (Math.random() - 0.5) * 8;
        ctx.lineTo(arc.x1 + dx * t + px * jitter, arc.y1 + dy * t + py * jitter);
      }
      ctx.lineTo(arc.x2, arc.y2);
      ctx.stroke();
      ctx.restore();
    }
  }

  drawDamageNumbers(game, hutPlane = false) {
    const ctx = this.renderer.fgCtx;
    for (const dmgNum of game.combatSystem.getDamageNumbers()) {
      if (!!dmgNum.hutPlane !== hutPlane) continue;
      const scale = dmgNum.scale || 1;
      ctx.save();
      ctx.globalAlpha = dmgNum.alpha;
      ctx.fillStyle = dmgNum.color;
      ctx.font = `${GRID.CELL_SIZE * scale}px 'Unifont', monospace`;
      ctx.fillText(dmgNum.value.toString(), dmgNum.x, dmgNum.y);
      ctx.restore();
    }
  }

  drawParticles(game, hutPlane = false) {
    for (const particle of game.particles) {
      if (!!particle.hutPlane !== hutPlane) continue;
      if (particle.getAlpha) {
        const alpha = particle.getAlpha();
        this.renderer.drawTextWithAlpha(
          particle.position.x + GRID.CELL_SIZE / 2,
          particle.position.y + GRID.CELL_SIZE / 2,
          particle.char,
          particle.color,
          alpha
        );
      } else {
        const alpha = Math.max(0, particle.life / particle.maxLife);
        this.renderer.drawTextWithAlpha(particle.x, particle.y, particle.char, particle.color, alpha);
      }
    }
  }

  drawNonSappingEnemies(game, enemies) {
    for (const enemy of enemies) {
      if (enemy.sapping) continue;
      if (enemy.isBossEntity) continue;
      if (!this.shouldRenderEntity(enemy, game.player, game.currentRoom)) continue;
      this.renderEnemy(game, enemy);
    }
  }

  drawSappingEnemies(game, enemies) {
    for (const enemy of enemies) {
      if (!enemy.sapping) continue;
      if (enemy.isBossEntity) continue;
      if (enemy.shouldRenderVisible()) {
        const iframeColor = enemy.getIframeFlashColor();
        const dotColor = iframeColor === null ? enemy.getDOTBlinkColor() : null;
        const displayColor = iframeColor !== null ? iframeColor
                           : dotColor !== null     ? dotColor
                           : enemy.color;
        this.renderer.drawEntity(
          enemy.position.x + GRID.CELL_SIZE / 2,
          enemy.position.y + GRID.CELL_SIZE / 2,
          enemy.char,
          displayColor
        );
      }
      // Sapping indicator (red * when latched to player; offset varies with bat count)
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
  }

  // Puddles, goo blobs, and steam clouds use the `hutPlane` discriminator (same
  // convention as debris/ingredients/items) to route between surface and interior
  // render contexts. Surface caller passes hutPlane=false (skips interior-spawned
  // entries); HutInteriorOverlay caller passes hutPlane=true (skips surface entries).
  // Spawn sites tag with `entity.hutPlane = !!game.activeFloor`.
  // Draw burning objects on the foreground each frame so the fire flicker reads
  // (modeled on the campfire loop in renderForeground — same per-frame approach).
  // Keeps each object's own char; only the color cycles through fire tones.
  // hutPlane=true is the interior overlay path (activeFloor objects), matching
  // the drawPuddles/drawDebris helper convention.
  drawBurningObjects(game, hutPlane = false) {
    const objects = hutPlane
      ? (game.activeFloor?.backgroundObjects ?? [])
      : game.backgroundObjects;
    const FIRE_COLORS = ['#ff4400', '#ff8800', '#ffaa00'];
    for (const obj of objects) {
      if (!obj.onFire || obj.destroyed || obj.isCampfire) continue;
      if (!hutPlane && !this.shouldRenderBackgroundObject(obj, game.player)) continue;
      // Campfire-like cadence (~0.13s per swap), keyed off the object's own
      // fireTimer with a per-cell phase offset so a field doesn't blink in unison.
      const phase = Math.floor(obj.position.x / GRID.CELL_SIZE) * 7 +
                    Math.floor(obj.position.y / GRID.CELL_SIZE) * 13;
      const color = FIRE_COLORS[(Math.floor(obj.fireTimer * 8) + phase) % FIRE_COLORS.length];
      const offsetX = obj.grassRenderOffset ? obj.grassRenderOffset.x : 0;
      this.renderer.drawEntity(
        obj.position.x + GRID.CELL_SIZE / 2 + offsetX,
        obj.position.y + GRID.CELL_SIZE / 2,
        obj.char,
        color
      );
    }
  }

  drawPuddles(game, hutPlane = false) {
    if (!game.puddles?.length) return;
    const playerPlane = game.player.plane ?? 0;
    const isPlaneRoom = !!(game.currentRoom?.tunnel || game.currentRoom?.underground);
    const ctx = this.renderer.fgCtx;
    for (const puddle of game.puddles) {
      if (!!puddle.hutPlane !== hutPlane) continue;
      if (isPlaneRoom && (puddle.plane ?? 0) !== playerPlane) continue;
      const { x, y } = puddle.position;
      const r = puddle.radius;
      ctx.save();
      ctx.globalAlpha = puddle.opaque ? 1.0 : 0.28;
      ctx.fillStyle = puddle.fillColor;
      if (puddle.shape === 'square') {
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
      } else {
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      ctx.save();
      ctx.globalAlpha = 0.45;
      for (const pt of puddle.scatterPoints) {
        this.renderer.drawEntity(x + pt.dx, y + pt.dy, puddle.char, puddle.color);
      }
      ctx.restore();
    }
  }

  drawGooBlobs(game, hutPlane = false) {
    const playerPlane = game.player.plane ?? 0;
    const isPlaneRoom = !!(game.currentRoom?.tunnel || game.currentRoom?.underground);
    for (const gooBlob of game.gooBlobs) {
      if (!!gooBlob.hutPlane !== hutPlane) continue;
      if (isPlaneRoom && (gooBlob.plane ?? 0) !== playerPlane) continue;
      const scale = gooBlob.getCurrentScale();
      this.renderer.fgCtx.save();
      const screenX = gooBlob.position.x;
      const screenY = gooBlob.position.y;
      this.renderer.fgCtx.translate(screenX, screenY);
      this.renderer.fgCtx.scale(scale, scale);
      this.renderer.fgCtx.translate(-screenX, -screenY);
      this.renderer.fgCtx.globalAlpha = 0.7;
      this.renderer.drawEntity(screenX, screenY, gooBlob.char, gooBlob.color);
      this.renderer.fgCtx.restore();
    }
  }

  drawSteamClouds(game, hutPlane = false) {
    if (!game.steamClouds?.length) return;
    for (const cloud of game.steamClouds) {
      if (!!cloud.hutPlane !== hutPlane) continue;
      const maxTimer = 7.0;
      const alpha = Math.min(0.9, (cloud.timer / maxTimer) * 0.9 + 0.1);
      const steamChars = ['=', '~', '=', '-'];
      for (let s = 0; s < 4; s++) {
        const jx = cloud.x + (Math.random() - 0.5) * cloud.radius * 1.6;
        const jy = cloud.y + (Math.random() - 0.5) * cloud.radius * 1.6;
        const dx = jx - cloud.x, dy = jy - cloud.y;
        if (dx * dx + dy * dy <= cloud.radius * cloud.radius) {
          this.renderer.drawTextWithAlpha(jx, jy, steamChars[s % steamChars.length], cloud.color || '#8c8c8c', alpha);
        }
      }
    }
  }

  // Reticule + in-flight + placed traps share a single render path so the
  // surface canvas and the interior overlay (HutInteriorOverlay) can both
  // call them in their respective coord spaces.
  drawTrapReticule(game) {
    if (!game.trapCharging || game.player?.heldItem?.data?.type !== 'TRAP') return;
    const pos = game.trapSystem.getTrapReticulePos();
    if (!pos) return;
    const blink = Math.floor(performance.now() / 120) % 2 === 0;
    const held = game.player.heldItem;
    const ctx = this.renderer.fgCtx;
    ctx.save();
    ctx.font = `${GRID.CELL_SIZE}px 'Unifont', monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = blink ? (held?.color || '#ffffff') : '#555555';
    ctx.fillText('x', pos.x, pos.y);
    ctx.restore();
  }

  // Ghost of the held weapon at its current estimated landing spot while charging
  // a throw (non-trap items only — traps show the 'x' reticule instead). Reuses
  // TrapSystem's cheap trig landing calc (no wall raycast) and the same
  // facing-based rotation formula TrapSystem.releaseTrapThrow uses for spears, so
  // the preview always matches the actual throw exactly.
  drawThrowPreview(game) {
    if (!game.trapCharging) return;
    const held = game.player?.heldItem;
    if (!held || held.data?.type === 'TRAP') return;
    const pos = game.trapSystem.getTrapReticulePos();
    if (!pos) return;
    const f = game.player.facing;
    const rotation = held.data?.weaponSubtype === 'spear'
      ? Math.atan2(f.y, f.x) + Math.PI / 2
      : 0;
    const ctx = this.renderer.fgCtx;
    ctx.save();
    ctx.font = `${GRID.CELL_SIZE}px 'Unifont', monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = held.color || '#ffffff';
    if (rotation) {
      ctx.translate(pos.x, pos.y);
      ctx.rotate(rotation);
      ctx.fillText(held.char, 0, 0);
    } else {
      ctx.fillText(held.char, pos.x, pos.y);
    }
    ctx.restore();
  }

  drawInFlightTraps(game, interior = false) {
    if (!game.inFlightTraps.length) return;
    const ctx = this.renderer.fgCtx;
    const C = GRID.CELL_SIZE;
    ctx.save();
    ctx.font = `${C}px 'Unifont', monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const t of game.inFlightTraps) {
      if ((t.interior === true) !== interior) continue;
      ctx.fillStyle = t.color || '#ffffff';
      if (t.rotation) {
        ctx.save();
        ctx.translate(t.x, t.y);
        ctx.rotate(t.rotation);
        ctx.fillText(t.char, 0, 0);
        ctx.restore();
      } else {
        ctx.fillText(t.char, t.x, t.y);
      }
    }
    ctx.restore();
  }

  drawPlacedTraps(game, interior = false) {
    const C = GRID.CELL_SIZE;
    for (const entry of game.placedTraps) {
      if ((entry.interior === true) !== interior) continue;
      const { item } = entry;
      if (entry.blinkVisible === false) continue;
      this.renderer.drawEntity(
        item.position.x + C / 2,
        item.position.y + C / 2,
        item.char,
        item.color
      );
    }
  }

  drawDebris(game, hutPlane = false) {
    for (const piece of game.debris) {
      if (!!piece.hutPlane !== hutPlane) continue;
      if (!this.shouldRenderEntity(piece, game.player, game.currentRoom)) continue;
      const piecePlane = piece.plane !== undefined ? piece.plane : 0;
      const useDithering = piecePlane === 1 && game.player.plane === 1;
      const drawMethod = useDithering ? 'drawEntityDithered' : 'drawEntity';
      this.renderer[drawMethod](
        piece.position.x + GRID.CELL_SIZE / 2,
        piece.position.y + GRID.CELL_SIZE / 2,
        piece.char,
        piece.color
      );
    }
  }

  drawIngredients(game, hutPlane = false) {
    for (const ingredient of game.ingredients) {
      if (!!ingredient.hutPlane !== hutPlane) continue;
      if (!this.shouldRenderEntity(ingredient, game.player, game.currentRoom)) continue;
      const ingredientPlane = ingredient.plane !== undefined ? ingredient.plane : 0;
      const useDithering = ingredientPlane === 1 && game.player.plane === 1;
      const drawMethod = useDithering ? 'drawEntityDithered' : 'drawEntity';
      const bobY = ingredient.inWater ? Math.sin(ingredient.bobTimer * 4) * 2 : 0;
      const bounceY = ingredient.getDropBounceOffsetY ? ingredient.getDropBounceOffsetY() : 0;
      const cx = ingredient.position.x + GRID.CELL_SIZE / 2;
      const cy = ingredient.position.y + GRID.CELL_SIZE / 2 + bobY + bounceY;
      // Tall-grass concealment is a no-op in interiors (no tall grass) so the helper is safe to share.
      if (this._isOnTallGrass(game, ingredient.position.x, ingredient.position.y)) {
        const now = performance.now() / 1000;
        if (ingredient._concealedSince === undefined) ingredient._concealedSince = now;
        if (now - ingredient._concealedSince >= 3) this._drawGrassSparkle(cx, cy);
        continue;
      }
      ingredient._concealedSince = undefined;
      this.renderer[drawMethod](cx, cy, ingredient.char, ingredient.color);
    }
  }

  drawItems(game, hutPlane = false) {
    for (const item of game.items) {
      if (!!item.hutPlane !== hutPlane) continue;
      if (!this.shouldRenderEntity(item, game.player, game.currentRoom)) continue;
      const itemPlane = item.plane !== undefined ? item.plane : 0;
      const cx = item.position.x + GRID.CELL_SIZE / 2;
      const cy = item.position.y + GRID.CELL_SIZE / 2;
      // Tall-grass concealment is a no-op in interiors (no tall grass) so the helper is safe to share.
      if (this._isOnTallGrass(game, item.position.x, item.position.y)) {
        const now = performance.now() / 1000;
        if (item._concealedSince === undefined) item._concealedSince = now;
        if (now - item._concealedSince >= 3) this._drawGrassSparkle(cx, cy);
        continue;
      }
      item._concealedSince = undefined;
      const useDithering = itemPlane === 1 && game.player.plane === 1;
      const drawMethod = useDithering ? 'drawEntityDithered' : 'drawEntity'; // bob = SPACE-pickup float cue (satchel/crows), position-phased to avoid lockstep
      this.renderer[drawMethod](cx, cy + Math.sin(performance.now() / 400 + (item.position.x + item.position.y) * 0.01) * 3, item.char, item.color);
    }
  }


  // Sticky triplines. `interior=true` is called from HutInteriorOverlay with the
  // interior-coord translate already applied to fgCtx, so triplines come from
  // activeFloor (where WireSystem commits them) and player/preview coords —
  // also interior-space — need no remapping.
  _drawWires(game, interior = false) {
    const ctx = this.renderer.fgCtx;
    const triplines = (interior ? game.activeFloor?.triplines : game.currentRoom?.triplines) || [];
    const drawSeg = (seg, alpha) => {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = seg.wireType === 'slime' ? '#88dd88' : '#88ccff';
      ctx.lineWidth = 1.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(seg.x1, seg.y1);
      ctx.lineTo(seg.x2, seg.y2);
      ctx.stroke();
      ctx.restore();
    };
    for (const seg of triplines) drawSeg(seg, 1.0);

    const preview = game.wireSystem?.getPreviewSegment();
    if (preview) drawSeg(preview, 0.7);

    // Red X above player — only flashes after the player pressed SPACE without
    // a nearby anchor. WireSystem sets a brief timer; it ticks down each frame.
    if (game.wireSystem?.redXTimer > 0) {
      ctx.save();
      ctx.font = `${GRID.CELL_SIZE * 0.9}px 'Unifont', monospace`;
      ctx.fillStyle = '#ff0000';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(
        'X',
        game.player.position.x + game.player.width / 2,
        game.player.position.y - GRID.CELL_SIZE * 0.6
      );
      ctx.restore();
    }
  }

  // Shared tongue stroke: line from (sx,sy) to tip (ex,ey) + a small tip circle.
  _drawTongueSegment(sx, sy, ex, ey, color) {
    const ctx = this.renderer.fgCtx;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(ex, ey, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Enemy frog-form tongues. The tongue list is global, so filter to owners on
  // the active layer (_activeEnemies resolves to activeFloor in interiors); the
  // interior overlay applies its coord translate before calling this.
  drawEnemyTongues(game) {
    const enemies = game._activeEnemies?.() ?? [];
    for (const tongue of game.combatSystem.getTongueAttacks()) {
      if (tongue.currentLength <= 0) continue;
      const owner = tongue.owner;
      if (!owner || !enemies.includes(owner)) continue;
      const sx = owner.position.x + GRID.CELL_SIZE / 2;
      const sy = owner.position.y + GRID.CELL_SIZE / 2;
      const ex = sx + tongue.direction.x * tongue.currentLength;
      const ey = sy + tongue.direction.y * tongue.currentLength;
      this._drawTongueSegment(sx, sy, ex, ey, tongue.color);
    }
  }

  // Mimic tongues — extend toward the player, then track them once hooked.
  drawMimicTongues(game) {
    const enemies = game._activeEnemies?.() ?? [];
    for (const enemy of enemies) {
      if (!enemy.mimicTongue || !enemy.mimicRevealed) continue;
      const tongue = enemy.mimicTongue;
      const sx = enemy.position.x + GRID.CELL_SIZE / 2;
      const sy = enemy.position.y + GRID.CELL_SIZE / 2;
      let ex, ey;
      if (tongue.phase === 'hooked') {
        ex = game.player.position.x + game.player.width / 2;
        ey = game.player.position.y + game.player.height / 2;
      } else {
        ex = sx + tongue.direction.x * tongue.currentLength;
        ey = sy + tongue.direction.y * tongue.currentLength;
      }
      this._drawTongueSegment(sx, sy, ex, ey, '#ff8866');
    }
  }

  drawPlayerTongueAttacks(game, hutPlane = false) {
    if (!game.playerTongueAttacks?.length) return;
    const tctx = this.renderer.fgCtx;
    for (const tongue of game.playerTongueAttacks) {
      if (!!tongue.hutPlane !== hutPlane) continue;
      if (tongue.currentLength <= 0) continue;
      const sx = game.player.position.x + GRID.CELL_SIZE / 2;
      const sy = game.player.position.y + GRID.CELL_SIZE / 2;
      const ex = sx + tongue.direction.x * tongue.currentLength;
      const ey = sy + tongue.direction.y * tongue.currentLength;
      tctx.save();
      tctx.strokeStyle = tongue.color;
      tctx.lineWidth = 2.5;
      tctx.lineCap = 'round';
      tctx.beginPath();
      tctx.moveTo(sx, sy);
      tctx.lineTo(ex, ey);
      tctx.stroke();
      tctx.fillStyle = tongue.color;
      tctx.beginPath();
      tctx.arc(ex, ey, 3, 0, Math.PI * 2);
      tctx.fill();
      tctx.restore();
    }
  }
}
