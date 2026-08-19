import { GRID } from '../../game/GameConfig.js';
import { spectaclesTransformString, isSpectaclesActive } from '../../data/cipher.js';
import { drawInteriorFrame } from './interiorFrame.js';
import { hasTorchLight, drawPlayerTorchLight } from './torchLight.js';
import { drawWires } from '../effects/WireEffects.js';
import { drawCoinArc } from '../effects/ArcTossEffects.js';
import { drawStatusPips } from '../effects/StatusPipEffects.js';

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
    const { offsetX, offsetY } = drawInteriorFrame(ctx, {
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
      const gapBand = game.activeFloor.gapBand;
      for (let r = 0; r < cm.length; r++) {
        for (let c = 0; c < (cm[r]?.length ?? 0); c++) {
          if (!cm[r][c]) continue;
          // Whip Trial chasm — reads as a crossable-by-reach-only void rather
          // than an ordinary blocked tile: true void (skip draw, bare panel
          // background shows through) between two edge-glyph boundary rows.
          if (gapBand) {
            if (r > gapBand.rowStart && r < gapBand.rowEnd) continue;
            if (r === gapBand.rowStart || r === gapBand.rowEnd) {
              ctx.fillStyle = '#6a4830';
              ctx.fillText(r === gapBand.rowStart ? '∧' : '∨', c * CS + CS / 2, r * CS + CS / 2);
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
    if (coinAnim) drawCoinArc(this.renderer, coinAnim);

    // Weapons Master coin pay — same shared spinning-arc draw helper.
    const weaponsMasterCoinAnim = game.weaponsMasterSystem?.getCoinAnim?.();
    if (weaponsMasterCoinAnim) drawCoinArc(this.renderer, weaponsMasterCoinAnim);

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

    // ── 16a. Alchemy trough fill hint (armed-slot digit, shown once per run) ──
    // Filling requires arming the Bottle slot first (AlchemySystem.tryFillArmedBottle);
    // this surfaces which key to press the same way known-spell letters surface a
    // typed sequence elsewhere — bare glyph, no explanatory text. Stays up for the
    // whole first encounter (every frame the player lingers near the trough with
    // an unarmed Bottle), not just one frame, then is retired for the rest of the
    // run the moment that encounter ends (player leaves, arms the slot, or fills
    // the bottle) — game.player.seenTroughFillHint, cleared on death/reset. The
    // transient _troughHintShown tracks "currently mid-encounter" so the retire
    // check below only fires on the trailing edge, not every not-shown frame.
    const alchemy = game.alchemySystem;
    if (alchemy && !game.player.seenTroughFillHint) {
      const bottleIdx = game.player.equippedConsumables?.findIndex(s => s?.char === 'B') ?? -1;
      const shouldShow = bottleIdx !== -1
        && game.player.selectedConsumableIndex !== bottleIdx
        && (alchemy.nearTrough() || alchemy.nearHotSpring());

      if (shouldShow) {
        const knownCount = game.knownSpells?.size || 0;
        const hintCx = game.player.position.x + GRID.CELL_SIZE / 2;
        const hintCy = game.player.position.y - GRID.CELL_SIZE * 0.9 - knownCount * (GRID.CELL_SIZE * 0.82);
        ctx.save();
        ctx.font = `${Math.round(GRID.CELL_SIZE * 0.65)}px 'Unifont', monospace`;
        ctx.fillStyle = '#ffff66';
        ctx.globalAlpha = 0.55;
        ctx.fillText(spectaclesTransformString(String(bottleIdx + 4), isSpectaclesActive(game)), hintCx, hintCy);
        ctx.restore();
        ctx.font = `${GRID.CELL_SIZE}px 'Unifont', monospace`; // restore overlay font
        game.player._troughHintShown = true;
      } else if (game.player._troughHintShown) {
        game.player.seenTroughFillHint = true; // encounter just ended — retire for the run
      }
    }

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
    this.renderController.exploreRenderer.drawThrowPreview(game);
    this.renderController.exploreRenderer.drawInFlightTraps(game, true);

    // ── 17. Bow charge indicator (reads game.player.position — offset applies) ─
    this.renderController.bowChargeIndicator.render(game);

    // ── 18. Green ranger indicator ─────────────────────────────────────────────
    this.renderController.greenRangerIndicator.render(game);

    // ── 19. Legend of Three pyramid — offer prompts (dungeon floor 4) ──────────
    if (game.activeFloor.pyramidSlots) {
      const CS = GRID.CELL_SIZE;
      for (const slot of Object.values(game.activeFloor.pyramidSlots)) {
        if (slot.filled || !slot.requiredChar) continue;
        const slotCx = slot.col * CS + CS / 2;
        const slotCy = slot.row * CS + CS / 2;
        const pdx = game.player.position.x + CS / 2 - slotCx;
        const pdy = game.player.position.y + CS / 2 - slotCy;
        if (Math.sqrt(pdx * pdx + pdy * pdy) >= CS * 3) continue;
        ctx.save();
        ctx.font = `10px 'Unifont', monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#ccccaa';
        ctx.fillText(
          spectaclesTransformString('SPACE  OFFER', isSpectaclesActive(game)),
          slotCx, slot.row * CS - CS
        );
        ctx.restore();
        ctx.font = `${GRID.CELL_SIZE}px 'Unifont', monospace`;
      }
    }

    // ── 19b. Whip Trial pedestal — [x][x][x] slot chrome (same shared-
    // divider bracket technique as CraftingStation.render(): three slots at
    // a 2-col pitch, each '[' + content + ']', touching brackets land on the
    // same column so the later draw wins). Grayed decorative ingredient
    // glyphs fill the outer two slots; the center slot's content is the
    // real pickup-able weapon, rendered separately by the normal Item loop
    // above — not redrawn here. Drawn directly rather than as
    // BackgroundObjects because '~' is real interactive water in
    // BACKGROUND_OBJECTS — see generateWhipTrial.
    if (game.activeFloor.weaponPedestal) {
      const { row, leftX, centerX, rightX, leftChar, rightChar } = game.activeFloor.weaponPedestal;
      const CS = GRID.CELL_SIZE;
      const cy = row * CS + CS / 2;
      ctx.save();
      ctx.font = `${CS}px 'Unifont', monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#554f3d';
      for (const slotX of [leftX, centerX, rightX]) {
        ctx.fillText('[', slotX * CS + CS / 2, cy);
        ctx.fillText(']', (slotX + 2) * CS + CS / 2, cy);
      }
      ctx.fillStyle = '#8a8470';
      ctx.fillText(leftChar, (leftX + 1) * CS + CS / 2, cy);
      ctx.fillText(rightChar, (rightX + 1) * CS + CS / 2, cy);
      ctx.restore();
    }

    // ── 20. Descent / ascend / unlock prompt ────────────────────────────────────
    if (game.dungeonSystem) {
      const transition = game.dungeonSystem.nearTransition();
      if (transition) {
        let label = null;
        let col, row;
        if (transition.kind === 'ascend') {
          col = game.activeFloor.stairsUpCol;
          row = game.activeFloor.stairsUpRow;
          // Locked (e.g. Trap Room mid-clear) stays silent — the red-tinted
          // footprint is the only signal, same precedent as the Key Vault's
          // locked-without-key case below.
          if (!game.activeFloor.stairsUpLocked) {
            label = 'SPACE  ASCEND';
          }
        } else {
          col = transition.descent.col;
          row = transition.descent.row;
          if (!transition.descent.locked) {
            label = 'SPACE  DESCEND';
          } else if (game.dungeonKeyObtainedThisRun) {
            // Key Vault door — only hinted once the player is actually
            // carrying the key; a locked door with no key stays silent
            // (the dimmed footprint itself is the only signal).
            label = 'SPACE  UNLOCK';
          }
        }
        if (label) {
          ctx.save();
          ctx.font = `10px 'Unifont', monospace`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = '#ccccaa';
          ctx.fillText(
            spectaclesTransformString(label, isSpectaclesActive(game)),
            col * GRID.CELL_SIZE + GRID.CELL_SIZE / 2, row * GRID.CELL_SIZE - GRID.CELL_SIZE
          );
          ctx.restore();
          ctx.font = `${GRID.CELL_SIZE}px 'Unifont', monospace`; // restore font
        }
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
            spectaclesTransformString('SPACE  EXIT', isSpectaclesActive(game)),
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
    ctx.fillText(spectaclesTransformString(label, isSpectaclesActive(game)), GRID.WIDTH / 2, offsetY + 2);
    ctx.restore();

    // ── 19b. Held-key indicator — small corner glyph, non-instructive ─────────
    // Skull key glyph. Uses '8' (the same Bones glyph the key-carrying object
    // renders as in-world — 'Ω' is already claimed by the hut Cauldron, see
    // resolved-bugs.md). True inventory visibility lives in the Tab overlay's
    // KEY ITEMS section (InventoryOverlay.js); this is just an at-a-glance PiP cue.
    if (game.player.inDungeon && game.dungeonKeyObtainedThisRun) {
      ctx.save();
      ctx.font = `${GRID.CELL_SIZE}px 'Unifont', monospace`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillStyle = '#cc3333';
      ctx.fillText(
        spectaclesTransformString('8', isSpectaclesActive(game)),
        offsetX + GRID.CELL_SIZE, offsetY + 2
      );
      ctx.restore();
    }
  }
}
