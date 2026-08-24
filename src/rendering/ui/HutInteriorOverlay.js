import { GRID } from '../../game/GameConfig.js';
import { drawInteriorFrame } from './interiorFrame.js';
import { hasTorchLight, drawPlayerTorchLight } from './torchLight.js';
import {
  TORCH_LIGHT_RADIUS, TORCH_ALPHA_HIGH, TORCH_ALPHA_LOW,
  TORCH_PULSE_SPEED, TORCH_LIT_COLOR, TORCH_UNLIT_COLOR,
} from '../../systems/MazeSystem.js';
import { drawWires } from '../effects/WireEffects.js';
import { drawCoinArc } from '../effects/ArcTossEffects.js';
import { drawStatusPips } from '../effects/StatusPipEffects.js';
import { drawTamedRats } from './CompanionRenderers.js';
import { SLOT_CHROME } from '../../data/slotChrome.js';

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

export class HutInteriorOverlay {
  constructor(renderer, renderController) {
    this.renderer = renderer;
    this.renderController = renderController;
  }

  render(game) {
    if ((!game.player?.inHut && !game.player?.inDungeon) || !game.activeFloor) return;

    const ctx = this.renderer.fgCtx;

    // Shared PiP frame: dim + panel + border + interior-coord translate + clip +
    // font (auto-sizes for hut vs dungeon from the active floor's grid). The clip
    // keeps any surface-coord content that leaked past hutPlane filters (e.g.
    // untagged puddles/gooBlobs) from drawing on top of the PiP frame.
    drawInteriorFrame(ctx, {
      gridCols: game.activeFloor.gridCols,
      gridRows: game.activeFloor.gridRows,
      panelColor: '#111108',
      borderColor: BORDER_COLOR,
      clip: true,
    });

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
      const gapCells = game.activeFloor.gapCells;
      for (let r = 0; r < cm.length; r++) {
        for (let c = 0; c < (cm[r]?.length ?? 0); c++) {
          if (!cm[r][c]) continue;
          // Puzzle Room impassable gap (Whip Trial's chasm, and any other
          // template's 'G' cells) — reads as a crossable-by-reach-only void
          // rather than an ordinary blocked tile: true void (skip draw, bare
          // panel background shows through) in the interior of a gap band;
          // an edge glyph on the boundary cell facing the walkable side. All
          // four orthogonal neighbors are checked (not just row-above/below)
          // so gap shapes with a horizontal edge — e.g. Boomerang Trial's
          // hourglass, which narrows and widens along columns rather than
          // just rows — get an edge glyph instead of silently reading as
          // void; vertical takes priority on the shape's outer corners
          // (open on both axes at once) since '∧'/'∨' is the established
          // look and a 5th diagonal glyph isn't worth the extra case.
          if (gapCells) {
            const isGap = gapCells.has(`${r},${c}`);
            if (isGap) {
              const aboveGap = gapCells.has(`${r - 1},${c}`);
              const belowGap = gapCells.has(`${r + 1},${c}`);
              const leftGap = gapCells.has(`${r},${c - 1}`);
              const rightGap = gapCells.has(`${r},${c + 1}`);
              if (aboveGap && belowGap && leftGap && rightGap) continue; // fully enclosed — true void
              let glyph;
              if (!aboveGap || !belowGap) {
                glyph = aboveGap ? '∨' : '∧';
              } else {
                glyph = leftGap ? '>' : '<';
              }
              ctx.fillStyle = '#6a4830';
              ctx.fillText(glyph, c * CS + CS / 2, r * CS + CS / 2);
              continue;
            }
          }
          ctx.fillStyle = '#3a2a1c';
          ctx.fillRect(c * CS, r * CS, CS, CS);
          ctx.fillStyle = '#6a4830';
          ctx.fillText('≡', c * CS + CS / 2, r * CS + CS / 2);
        }
      }
    }

    // ── 3c. Puzzle Room torch fixtures (fixture glyph + pulsing light) ────────
    // Maze-parity rendering (mirrors MazeInteriorOverlay's own torch block
    // exactly, reusing the same exported MazeSystem constants) minus
    // ghost-shielding, which dungeons have no use for.
    //
    // Two independent torch sources share this exact glyph/glow draw:
    // decorative ambient torches (game.activeFloor.torches, lit state on
    // `.lit`, never gates anything) and torch-KIND puzzle triggers
    // (game.activeFloor.triggers, lit state on `.active` — see
    // DungeonPuzzleSystem._updatePuzzleRoom's torch branch, which feeds the
    // exit-unlock check). Different field names because they're genuinely
    // different lifecycles; drawTorchFixture takes the already-resolved lit
    // boolean so the pulse/glow math lives in one place instead of twice.
    {
      const CS = GRID.CELL_SIZE;
      const drawTorchFixture = (fixture, lit) => {
        const cx = fixture.col * CS + CS / 2;
        const cy = fixture.row * CS + CS / 2;

        if (lit) {
          const s = 0.5 + 0.5 * Math.sin(fixture.pulseTimer * TORCH_PULSE_SPEED);
          const alpha = TORCH_ALPHA_LOW + (TORCH_ALPHA_HIGH - TORCH_ALPHA_LOW) * s;
          this.renderer.drawCircle(cx, cy, TORCH_LIGHT_RADIUS, TORCH_LIT_COLOR, true, alpha);
        }

        ctx.fillStyle = lit ? TORCH_LIT_COLOR : TORCH_UNLIT_COLOR;
        ctx.fillText(fixture.char, cx, cy);
      };

      if (game.activeFloor.torches) {
        for (const torch of game.activeFloor.torches) drawTorchFixture(torch, torch.lit);
      }
      if (game.activeFloor.triggers) {
        for (const trigger of game.activeFloor.triggers) {
          if (trigger.kind === 'torch') drawTorchFixture(trigger, trigger.active);
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

    // Condenser reveal — base ingredient as Greek symbol, floating upward with dissolve
    // (AlchemySystem.revealCondenser/update animates position and alpha).
    const reveal = game.activeFloor.condenserReveal;
    if (reveal) {
      ctx.save();
      ctx.globalAlpha = reveal.alpha;
      ctx.fillStyle = reveal.color;
      ctx.fillText(reveal.baseChar, reveal.x, reveal.y);
      ctx.restore();
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
    if (coinAnim) drawCoinArc(this.renderer, coinAnim);

    // Weapons Master coin pay — same shared spinning-arc draw helper.
    const weaponsMasterCoinAnim = game.weaponsMasterSystem?.getCoinAnim?.();
    if (weaponsMasterCoinAnim) drawCoinArc(this.renderer, weaponsMasterCoinAnim);

    // Shopkeeper purchases are menu-confirmed (ShopSystem's barter modal) —
    // no coin-arc animation, just the shared coin_plink SFX for parity.

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

    // ── 10b. Player tongue attacks (frog form) + enemy frog/mimic tongues ──────
    // Enemy + mimic tongue helpers read game._activeEnemies() (= activeFloor here),
    // so they render the interior layer's tongues under the overlay translate.
    this.renderController.exploreRenderer.drawPlayerTongueAttacks(game, true);
    this.renderController.exploreRenderer.drawEnemyTongues(game);
    this.renderController.exploreRenderer.drawMimicTongues(game);

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

    // ── 15b. Triplines (committed segments + live preview + red-X) ────────────
    // Interior-coord variant: reads activeFloor.triplines; ctx translate already applied.
    drawWires(this.renderer, game, true);

    // ── 15c. Torch light (cosmetic glow when Torch equipped) ───────────────────
    if (hasTorchLight(game)) {
      drawPlayerTorchLight(
        this.renderer,
        game.player.position.x + GRID.CELL_SIZE / 2,
        game.player.position.y + GRID.CELL_SIZE / 2
      );
    }

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
    drawStatusPips(this.renderer, game.player);

    // ── 16b. Camp companion (uses interior coords because it tracks player) ──
    if (game.companion) {
      game.companion.render(ctx, (gx, gy) => ({
        x: gx * GRID.CELL_SIZE,
        y: gy * GRID.CELL_SIZE
      }));
    }

    // ── 16b-2. Pet companions (crows + tamed rats), dungeon descents only ────
    // They snap onto each floor beside the player (CompanionSystem), so their
    // coordinates are floor-space while inside — drawn here under the overlay
    // translate, same as the camp companion above. Huts stay pet-free by
    // design, hence the inDungeon guard rather than any-interior.
    if (game.player?.inDungeon) {
      if (game.tamedRats?.length) {
        drawTamedRats(this.renderer, game, () => true);
      }
      if (game.companionCrows?.length) {
        for (const crow of game.companionCrows) {
          this.renderController.exploreRenderer._drawCrow(crow);
        }
      }
    }

    // ── 16c. Sapping enemies on top of player (bats latched on player) ────────
    this.renderController.exploreRenderer.drawSappingEnemies(game, game.activeFloor.enemies);

    // ── 16c-3. Dungeon boss composite (Hoardmaw) — interior coords, drawn in
    // this translated pass; the surface boss-composite path skips interiors.
    if (game.dungeonBossSystem?.hoardmaw) {
      this.renderController.exploreRenderer.bossRenderer.renderBossComposite(game);
    }

    // ── 16c2. Tomb Ghosts (DungeonGhostSystem) — bespoke, not part of
    //      game.activeFloor.enemies, so drawSappingEnemies above never sees
    //      them; drawn the same way MazeInteriorOverlay draws its own
    //      MazeGhosts (see that file's "6. Ghosts" block). Guarded: this
    //      overlay is shared with Hut (InteriorOverlay.js), whose floor
    //      objects carry no tombGhosts field at all.
    if (game.activeFloor.tombGhosts) {
      for (const ghost of game.activeFloor.tombGhosts) {
        this.renderer.drawEntity(
          ghost.position.x + GRID.CELL_SIZE / 2,
          ghost.position.y + GRID.CELL_SIZE / 2,
          ghost.char,
          ghost.color
        );
      }
    }

    // ── 16d. Trap throw reticule + in-flight throwables (interior plane) ──────
    this.renderController.exploreRenderer.drawTrapReticule(game);
    this.renderController.exploreRenderer.drawThrowPreview(game);
    this.renderController.exploreRenderer.drawInFlightTraps(game, true);

    // ── 17. Bow charge indicator (reads game.player.position — offset applies) ─
    this.renderController.bowChargeIndicator.render(game);

    // ── 18. Green ranger indicator ─────────────────────────────────────────────
    this.renderController.greenRangerIndicator.render(game);

    // ── 19b. Puzzle Room weapon pedestal — [x][x][x] Slot chrome, the shared
    // world-Slot vocabulary from slotChrome.js (same stone/pending pair the
    // Pyramid's Legend of Three registers are built from). Uses the same
    // shared-divider bracket technique as CraftingStation.render(): three
    // slots at a 2-col pitch, each '[' + content + ']', touching brackets
    // land on the same column so the later draw wins. Grayed decorative
    // ingredient glyphs fill the outer two slots; the center slot's content
    // is the real pickup-able weapon, rendered separately by the normal Item
    // loop above — not redrawn here. Drawn directly rather than as
    // BackgroundObjects because '~' is real interactive water in
    // BACKGROUND_OBJECTS — see DungeonFloorGenerator.generatePuzzleRoom's
    // opt-in pedestal handling (originated as Whip Trial's own pedestal,
    // now any puzzle template can set one via a "pedestal" marker cell).
    if (game.activeFloor.weaponPedestal) {
      const { row, leftX, centerX, rightX, leftChar, rightChar } = game.activeFloor.weaponPedestal;
      const CS = GRID.CELL_SIZE;
      const cy = row * CS + CS / 2;
      ctx.save();
      ctx.font = `${CS}px 'Unifont', monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = SLOT_CHROME.STONE;
      for (const slotX of [leftX, centerX, rightX]) {
        ctx.fillText(SLOT_CHROME.BRACKET_LEFT, slotX * CS + CS / 2, cy);
        ctx.fillText(SLOT_CHROME.BRACKET_RIGHT, (slotX + 2) * CS + CS / 2, cy);
      }
      ctx.fillStyle = SLOT_CHROME.PENDING;
      ctx.fillText(leftChar, (leftX + 1) * CS + CS / 2, cy);
      ctx.fillText(rightChar, (rightX + 1) * CS + CS / 2, cy);
      ctx.restore();
    }

    // ── Restore interior offset ────────────────────────────────────────────────
    ctx.restore(); // removes translate + restores outer state
  }
}
