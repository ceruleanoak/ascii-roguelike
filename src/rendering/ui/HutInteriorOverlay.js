import { GRID } from '../../game/GameConfig.js';

/**
 * HutInteriorOverlay — picture-in-picture rendering for both Hut and Dungeon interiors.
 *
 * Canvas: 480×480 (30×30 cells × 16px)
 * Panel size and offset are computed dynamically from game.activeFloor.gridCols/gridRows:
 *   Hut (10×10)    → 160×160 panel, centered at offset (160, 160)
 *   Dungeon (24×24) → 384×384 panel, centered at offset (48, 48)
 *
 * Coordinate contract:
 *   ctx.translate(offsetX, offsetY) is applied before entity rendering so that
 *   interior pixel (x, y) maps to canvas (offsetX+x, offsetY+y).
 */

const BORDER_COLOR = '#c8a96e';
const DIM_ALPHA = 0.55;

export class HutInteriorOverlay {
  constructor(renderer, renderController) {
    this.renderer = renderer;
    this.renderController = renderController;
  }

  render(game) {
    if ((!game.player?.inHut && !game.player?.inDungeon) || !game.activeFloor) return;

    // Compute panel dimensions from interior grid size (auto-sizes for hut vs dungeon)
    const interiorPxW = game.activeFloor.gridCols * GRID.CELL_SIZE;
    const interiorPxH = game.activeFloor.gridRows * GRID.CELL_SIZE;
    const offsetX = Math.floor((GRID.WIDTH  - interiorPxW) / 2);
    const offsetY = Math.floor((GRID.HEIGHT - interiorPxH) / 2);

    const ctx = this.renderer.fgCtx;
    ctx.save(); // outer save — protects all global canvas state

    // ── 1. Dim exterior (absolute coords) ─────────────────────────────────────
    ctx.fillStyle = `rgba(0,0,0,${DIM_ALPHA})`;
    ctx.fillRect(0, 0, GRID.WIDTH, GRID.HEIGHT);

    // ── 2. Interior background panel ──────────────────────────────────────────
    ctx.fillStyle = '#111108';
    ctx.fillRect(offsetX, offsetY, interiorPxW, interiorPxH);

    // ── 3. Decorative border ──────────────────────────────────────────────────
    ctx.strokeStyle = BORDER_COLOR;
    ctx.lineWidth = 2;
    ctx.strokeRect(offsetX - 1, offsetY - 1, interiorPxW + 2, interiorPxH + 2);

    // ── Apply interior-coordinate offset for all entity rendering ─────────────
    // After this point, drawing at (x, y) appears at canvas (offsetX+x, offsetY+y).
    // Clip to the interior grid so any surface-coord content that leaks past
    // hutPlane filters (e.g. puddles/gooBlobs missing the tag) gets clipped out
    // rather than rendering on top of the PiP frame.
    ctx.translate(offsetX, offsetY);
    ctx.beginPath();
    ctx.rect(0, 0, interiorPxW, interiorPxH);
    ctx.clip();

    ctx.font = `${GRID.CELL_SIZE}px 'Unifont', monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // ── 3a. Interior puddles + goo blobs + steam clouds (slime trails, etc.) ───
    // hutPlane=true selects only entries tagged with hutPlane=true on spawn,
    // i.e. those that originated inside the active interior.
    this.renderController.exploreRenderer.drawPuddles(game, true);
    this.renderController.exploreRenderer.drawGooBlobs(game, true);
    this.renderController.exploreRenderer.drawSteamClouds(game, true);

    // ── 3b. Dungeon wall tiles ─────────────────────────────────────────────────
    // Render solid collision-map cells as visible stone walls.
    // Hut interiors are open floor only (10 cols); dungeon interiors are 24 cols.
    if (game.activeFloor.collisionMap && game.activeFloor.gridCols > 12) {
      const CS = GRID.CELL_SIZE;
      const cm = game.activeFloor.collisionMap;
      for (let r = 0; r < cm.length; r++) {
        for (let c = 0; c < (cm[r]?.length ?? 0); c++) {
          if (!cm[r][c]) continue;
          ctx.fillStyle = '#3a2a1c';
          ctx.fillRect(c * CS, r * CS, CS, CS);
          ctx.fillStyle = '#6a4830';
          ctx.fillText('≡', c * CS + CS / 2, r * CS + CS / 2);
        }
      }
    }

    // ── 4. Interior background objects ─────────────────────────────────────────
    for (const obj of game.activeFloor.backgroundObjects) {
      if (obj.destroyed) continue;
      if (obj.onFire && !obj.isCampfire) continue; // drawn by the shared flicker pass below
      const renderData = obj.getRenderPosition();
      ctx.fillStyle = renderData.color;
      ctx.fillText(
        renderData.char,
        renderData.x + GRID.CELL_SIZE / 2,
        renderData.y + GRID.CELL_SIZE / 2
      );
    }

    // Burning interior objects flicker per-frame via the shared helper
    // (hutPlane=true selects activeFloor objects; ctx translate already applied).
    this.renderController.exploreRenderer.drawBurningObjects(game, true);

    // ── 5-7. Hutplane debris / ingredients / items ────────────────────────────
    // Delegates to the shared helpers on ExploreRenderer with hutPlane=true filter.
    this.renderController.exploreRenderer.drawDebris(game, true);
    this.renderController.exploreRenderer.drawIngredients(game, true);
    this.renderController.exploreRenderer.drawItems(game, true);

    // ── 7b. Placed traps tagged as interior (armed where they landed) ─────────
    this.renderController.exploreRenderer.drawPlacedTraps(game, true);

    // ── 8. Interior enemies (full indicator rendering) ─────────────────────────
    // Use the shared non-sapping pass, then redraw sapping ones on top of player below.
    this.renderController.exploreRenderer.drawNonSappingEnemies(game, game.activeFloor.enemies);
    // Key indicator one full cell above hasKey enemies (vault key char '߃')
    for (const enemy of game.activeFloor.enemies) {
      if (enemy.hasKey) {
        ctx.fillStyle = '#ffcc00';
        ctx.fillText(
          '߃',
          enemy.position.x + GRID.CELL_SIZE / 2,
          enemy.position.y - GRID.CELL_SIZE
        );
      }
    }

    // ── 8b. Interior NPCs (WiseFellow, Witch, ErrandCharacter) ────────────────
    // Delegate to each NPC's own render() so ErrandCharacter draws its hop
    // animation and stage-colored requested-item indicator, matching E-rooms.
    const npcGridToPixel = (gx, gy) => ({ x: gx * GRID.CELL_SIZE, y: gy * GRID.CELL_SIZE });
    for (const npc of game.activeFloor.npcs) {
      npc.render(ctx, npcGridToPixel);
      // Restore overlay font in case the NPC's render() swapped it.
      ctx.font = `${GRID.CELL_SIZE}px 'Unifont', monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      // NPC speech now goes through the SPACE-driven dialogue box
      // (DialogueSystem + DialogueBox) — no passive proximity text here.
    }

    // Fisherman coin pay — spinning arc from player to the fisherman
    // (interior coords; shared draw helper, ctx translate already applied).
    const coinAnim = game.fishermanDemoSystem?.getCoinAnim?.();
    if (coinAnim) this.renderController.exploreRenderer.drawCoinArc(coinAnim);

    // Fisherman coin-demo fish — transient marker beside the NPC while he
    // demonstrates cutting the catch open.
    const demoFish = game.fishermanDemoSystem?.getFishMarker();
    if (demoFish) {
      ctx.fillStyle = demoFish.color;
      ctx.fillText(
        demoFish.char,
        demoFish.x + GRID.CELL_SIZE / 2,
        demoFish.y + GRID.CELL_SIZE / 2
      );
    }

    // ── 9. Player projectiles (interior coords) ────────────────────────────────
    this.renderController.exploreRenderer.drawProjectiles(game, true);

    // ── 10. Enemy projectiles (interior coords) ────────────────────────────────
    this.renderController.exploreRenderer.drawEnemyProjectiles(game, true);

    // ── 10b. Player tongue attacks (frog form) ─────────────────────────────────
    this.renderController.exploreRenderer.drawPlayerTongueAttacks(game, true);

    // ── 11. Player melee attacks ───────────────────────────────────────────────
    this.renderController.exploreRenderer.drawMeleeAttacks(game, true);

    // ── 12. Enemy melee attacks ────────────────────────────────────────────────
    this.renderController.exploreRenderer.drawEnemyMeleeAttacks(game, true);

    // ── 13. Stuck arrows ───────────────────────────────────────────────────────
    this.renderController.exploreRenderer.drawStuckArrows(game, true);

    // ── 13b. Chain lightning arcs ─────────────────────────────────────────────
    this.renderController.exploreRenderer.drawLightningStrikes(game, true);
    this.renderController.exploreRenderer.drawChainArcs(game, true);

    // ── 14. Damage numbers ─────────────────────────────────────────────────────
    this.renderController.exploreRenderer.drawDamageNumbers(game, true);

    // ── 15. Particles ─────────────────────────────────────────────────────────
    this.renderController.exploreRenderer.drawParticles(game, true);

    // ── 16. Player ────────────────────────────────────────────────────────────
    const playerAlpha = game.player.getVisibilityAlpha?.() ?? 1.0;
    const mossActive = game.player.mossCloakActive === true;
    const playerChar = mossActive ? '%' : game.player.char;
    const playerColor = mossActive
      ? '#228822'
      : (game.player.getDisplayColor?.() ?? game.player.color);
    this.renderer.drawTextWithAlpha(
      game.player.position.x + GRID.CELL_SIZE / 2,
      game.player.position.y + GRID.CELL_SIZE / 2,
      playerChar,
      playerColor,
      playerAlpha
    );

    // ── 16b. Camp companion (uses interior coords because it tracks player) ──
    if (game.companion) {
      game.companion.render(ctx, (gx, gy) => ({
        x: gx * GRID.CELL_SIZE,
        y: gy * GRID.CELL_SIZE
      }));
    }

    // ── 16c. Sapping enemies on top of player (bats latched on player) ────────
    this.renderController.exploreRenderer.drawSappingEnemies(game, game.activeFloor.enemies);

    // ── 16d. Trap throw reticule + in-flight throwables (interior plane) ──────
    this.renderController.exploreRenderer.drawTrapReticule(game);
    this.renderController.exploreRenderer.drawInFlightTraps(game, true);

    // ── 17. Bow charge indicator (reads game.player.position — offset applies) ─
    this.renderController.bowChargeIndicator.render(game);

    // ── 18. Green ranger indicator ─────────────────────────────────────────────
    this.renderController.greenRangerIndicator.render(game);

    // ── 19. Item sacrifice slot (dungeon lock condition) ────────────────────────
    const uc = game.activeFloor.unlockCondition;
    if (uc?.type === 'item_slot') {
      const CS = GRID.CELL_SIZE;
      const slotCx = uc.col * CS + CS / 2;
      const slotCy = uc.row * CS + CS / 2;
      const pdx = game.player.position.x + CS / 2 - slotCx;
      const pdy = game.player.position.y + CS / 2 - slotCy;
      const nearSlot = Math.sqrt(pdx * pdx + pdy * pdy) < CS * 2;
      ctx.fillStyle = nearSlot ? '#ffffff' : '#888888';
      ctx.fillText('[', slotCx - CS, slotCy);
      ctx.fillText(']', slotCx, slotCy);
      if (uc.slotItem) {
        ctx.fillStyle = uc.slotItem.color || '#ffcc00';
        ctx.fillText(uc.slotItem.char, slotCx - CS / 2, slotCy);
      } else {
        ctx.fillStyle = '#444444';
        ctx.fillText('?', slotCx - CS / 2, slotCy);
      }
    }

    // ── 20. Staircase prompt ───────────────────────────────────────────────────
    if (game.dungeonSystem) {
      const stairsType = game.dungeonSystem.nearStairsType();
      if (stairsType) {
        const label = stairsType === 'down' ? 'SPACE  DESCEND' : 'SPACE  ASCEND';
        const floor = game.activeFloor;
        const col = stairsType === 'down' ? floor.stairsDownCol : floor.stairsUpCol;
        const row = stairsType === 'down' ? floor.stairsDownRow : floor.stairsUpRow;
        ctx.save();
        ctx.font = `10px 'Unifont', monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#ccccaa';
        ctx.fillText(label, col * GRID.CELL_SIZE + GRID.CELL_SIZE / 2, row * GRID.CELL_SIZE - GRID.CELL_SIZE);
        ctx.restore();
        ctx.font = `${GRID.CELL_SIZE}px 'Unifont', monospace`; // restore font
      }
    }

    // ── 21. Interior exit door prompt (hut/dungeon) ───────────────────────────
    {
      const isHut = game.activeFloor.gridCols <= 12;
      const nearExit = isHut
        ? game.hutSystem?.nearInteriorExit?.()
        : game.dungeonSystem?.nearInteriorExit?.();

      if (nearExit) {
        const exitCol = game.activeFloor.exitCol;
        const exitRow = game.activeFloor.exitRow;
        if (exitCol != null && exitRow != null) {
          ctx.save();
          ctx.font = `10px 'Unifont', monospace`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = '#ccccaa';
          ctx.fillText(
            'SPACE  EXIT',
            exitCol * GRID.CELL_SIZE + GRID.CELL_SIZE / 2,
            exitRow * GRID.CELL_SIZE - GRID.CELL_SIZE * 0.75
          );
          ctx.restore();
          ctx.font = `${GRID.CELL_SIZE}px 'Unifont', monospace`;
        }
      }
    }

    // ── Restore interior offset ────────────────────────────────────────────────
    ctx.restore(); // removes translate + restores outer state

    // ── 19. Label (absolute coords — drawn after restore) ─────────────────────
    ctx.save();
    ctx.font = `${GRID.CELL_SIZE}px 'Unifont', monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#887755';
    let label;
    if (game.activeFloor.gridCols <= 12) {
      label = '[ HUT ]';
    } else {
      const floorNum = (game.dungeonCurrentFloor ?? 0) + 1;
      label = `[ DUNGEON  FLOOR ${floorNum} ]`;
    }
    ctx.fillText(label, GRID.WIDTH / 2, offsetY + 2);
    ctx.restore();
  }
}
