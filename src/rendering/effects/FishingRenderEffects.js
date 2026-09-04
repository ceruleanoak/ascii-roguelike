import { GRID } from '../../game/GameConfig.js';

/**
 * Fishing system render passes — fish, bobber, charge bar, bite indicator,
 * rusalka, and reward objects. Extracted from ExploreRenderer to reduce
 * that file's architecture budget.
 */
export function renderFishingPasses(renderer, game) {
  const fishingSystem = game.fishingSystem;
  if (!fishingSystem) return;

  // Ambient fish (jump arcs from water)
  for (const fish of fishingSystem.fishEntities) {
    renderer.drawEntity(
      fish.getRenderX(),
      fish.getRenderY(),
      fish.char,
      fish.color
    );
  }

  // Bobber (visible while BOBBING state)
  if (fishingSystem.bobber?.visible) {
    const bobber = fishingSystem.bobber;
    renderer.drawEntity(
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
    renderer.drawRect(
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
    const ctx = renderer.fgCtx;
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
    const ctx = renderer.fgCtx;
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

    renderer.drawEntity(
      reward.getRenderX(),
      reward.getRenderY(),
      reward.char,
      reward.color
    );

    // "CAUGHT: NAME" text above the char (fades out after 2s)
    if (reward.messageTimer > 0) {
      const ctx = renderer.fgCtx;
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
