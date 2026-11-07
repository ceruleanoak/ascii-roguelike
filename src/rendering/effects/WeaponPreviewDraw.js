import { GRID, COLORS } from '../../game/GameConfig.js';
import { ConsumableTriggerSystem } from '../../systems/ConsumableTriggerSystem.js';
import { blendColors } from '../../systems/ZoneSystem.js';

/**
 * WeaponPreviewDraw — held-weapon and thrown-consumable render passes that
 * don't depend on an enemy being present, so they run identically whether the
 * player is in EXPLORE (testing weapons on real targets) or REST (previewing
 * them in the safe hub). Lifted out of ExploreRenderer for the same reason as
 * MeleeAttackDraw: a single body, called by both `ExploreRenderer.render()`
 * and `RestRenderer.render()` (the render-helper pattern), instead of a
 * second hand-maintained copy living in RestRenderer.
 *
 * Each function takes the ASCIIRenderer + `game` and nothing else — except
 * the held-weapon poses (gem wand charge, held windup, hammer pose, staff
 * block), which take the body holding the weapon, so drawTrine can draw them
 * on every Mist Battle body, not only game.player. No interior/hutPlane
 * parameter, because none of these behaviors currently have
 * a hut-PiP counterpart (out of scope for the Rest/Explore parity fix this
 * module exists for).
 */

// Peak height (px) of a thrown consumable's toss arc, and how many full
// spins it completes over the flight — shared by every consumable windup so
// heal potions and bombs read as the same "thrown object" motion.
const THROW_ARC_HEIGHT = 46;
const THROW_SPINS = 2;

// How many times a second a thrown consumable's AoE ring cycles from its own
// color to white and back.
const AOE_RING_FLASH_HZ = 8;

/** Every consumable throw arcs up and spins before landing, where its effect
 * resolves (ConsumableTriggerSystem). Self-only effects (heal, buffs, ...)
 * skip the AoE ring — there is no landing zone to telegraph for those. */
export function drawConsumableWindups(renderer, game) {
  for (const windup of game.inventorySystem.consumableWindups) {
    const progress = 1 - (windup.timer / windup.maxTimer);

    // A targeted throw (Jolt Jar, Liquid Splash) bakes its own arc lift into
    // windup.y (ConsumableWindupEffects.tick) since it's also interpolating
    // toward a fixed target — don't double-apply the lift for it.
    const arcLift = windup.targetX != null
      ? 0
      : Math.sin(Math.min(1, Math.max(0, progress)) * Math.PI) * THROW_ARC_HEIGHT;
    const spinAngle = progress * Math.PI * 2 * THROW_SPINS;

    renderer.drawEntityRotated(
      windup.x,
      windup.y - arcLift,
      windup.consumable.char,
      windup.consumable.color,
      spinAngle
    );

    if (ConsumableTriggerSystem.isSelfOnlyEffect(windup.effectType)) continue;

    const aoeRadius = game.consumableTriggerSystem.getWindupAoeRadius(windup);

    // Draw ring to show AoE damage radius, cycling consumable color ↔ white.
    // A targeted throw (Jolt Jar, Liquid Splash) shows the ring at the
    // locked impact target, not around the moving bottle.
    const elapsed = windup.maxTimer - windup.timer;
    const flash = (1 - Math.cos(elapsed * Math.PI * 2 * AOE_RING_FLASH_HZ)) / 2;
    const ringX = windup.targetX ?? windup.x;
    const ringY = windup.targetY ?? windup.y;

    renderer.fgCtx.save();
    renderer.fgCtx.strokeStyle = blendColors(windup.consumable.color, '#ffffff', flash);
    renderer.fgCtx.globalAlpha = 0.5;
    renderer.fgCtx.lineWidth = 2;
    renderer.fgCtx.beginPath();
    renderer.fgCtx.arc(ringX, ringY, aoeRadius, 0, Math.PI * 2);
    renderer.fgCtx.stroke();

    // Draw inner ring at 50% radius for better depth perception
    renderer.fgCtx.globalAlpha = 0.2;
    renderer.fgCtx.lineWidth = 1;
    renderer.fgCtx.beginPath();
    renderer.fgCtx.arc(ringX, ringY, aoeRadius * 0.5, 0, Math.PI * 2);
    renderer.fgCtx.stroke();

    renderer.fgCtx.restore();
  }
}

/** Gem wand held aloft with shake while charging — shake intensifies as the
 * spell nears completion. */
export function drawGemWandCharge(renderer, body) {
  const held = body.heldItem;
  if (!held?.data?.gemWand || !held.isCharging) return;
  const C = GRID.CELL_SIZE;
  const ctx = renderer.fgCtx;
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
    body.position.x + C / 2 + jitterX,
    body.position.y - C * 0.6 + jitterY
  );
  ctx.restore();
}

/** AoE melee weapon held aloft through its held windup (Item.holdsWindup) —
 * the gem wand's charge read: shake intensifies as the swing nears. */
export function drawHeldWindupCharge(renderer, body) {
  const held = body.heldItem;
  if (!held?.windupActive || !held.holdsWindup?.()) return;
  const C = GRID.CELL_SIZE;
  const ctx = renderer.fgCtx;
  const t = Math.min(1, 1 - held.windupTimer / (held.windupDuration || 1));
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
    body.position.x + C / 2 + jitterX,
    body.position.y - C * 0.6 + jitterY
  );
  ctx.restore();
}

/** Hammer held raised overhead during its windup — the same anchor
 * MeleeAttackDraw uses for drawAboveOwner, so the glyph doesn't jump when the
 * windup completes and createMeleeHammerRing's attack object takes over
 * drawing it for the strike itself. Static (no shake): the raised pose alone
 * reads as "about to swing" without competing with the impact-frame burst at
 * the strike. */
export function drawHammerWindupPose(renderer, body) {
  const held = body.heldItem;
  if (held?.data?.attackPattern !== 'hammerRing' || !held.windupActive) return;
  const C = GRID.CELL_SIZE;
  renderer.drawEntity(
    body.position.x + C / 2,
    body.position.y - C / 2,
    held.char,
    held.color || COLORS.ITEM
  );
}

/**
 * Blinking Bomb Bag ammo count above the player while the bag's slot is armed
 * — the same read as a held trap's charges (drawTrapChargeCount).
 */
export function drawBombBagCount(renderer, game) {
  const index = game.player.selectedConsumableIndex ?? -1;
  if (index < 0) return;
  const bag = game.inventorySystem.equippedConsumables[index];
  if (!bag?.data?.bombBag) return;
  if (Math.floor(performance.now() / 200) % 2 !== 0) return;
  const C = GRID.CELL_SIZE;
  const ctx = renderer.fgCtx;
  ctx.save();
  ctx.font = `${C * 0.7}px 'Unifont', monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = bag.color || '#ffffff';
  ctx.fillText(game.bombBagSystem.ammoCount(bag).toString(), game.player.position.x + C / 2, game.player.position.y - C * 0.4);
  ctx.restore();
}

/** Blinking trap charge count above the player, hidden during charge-up. */
export function drawTrapChargeCount(renderer, game) {
  if (game.trapCharging) return;
  const held = game.player.heldItem;
  if (held?.charges == null || held.charges <= 0) return;
  if (Math.floor(performance.now() / 200) % 2 !== 0) return;
  const C = GRID.CELL_SIZE;
  const ctx = renderer.fgCtx;
  ctx.save();
  ctx.font = `${C * 0.7}px 'Unifont', monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = held.color || '#ffffff';
  ctx.fillText(held.charges.toString(), game.player.position.x + C / 2, game.player.position.y - C * 0.4);
  ctx.restore();
}

/** Staff held perpendicular to facing direction, ~1 cell forward, while
 * blocking. */
export function drawStaffBlockStance(renderer, body) {
  if (!body.isStaffBlocking || !body.heldItem) return;
  const facingAngle = Math.atan2(body.facing.y, body.facing.x);
  const offset = GRID.CELL_SIZE * 0.9;
  const cx = body.position.x + GRID.CELL_SIZE / 2 + Math.cos(facingAngle) * offset;
  const cy = body.position.y + GRID.CELL_SIZE / 2 + Math.sin(facingAngle) * offset;
  const staffChar = body.heldItem.data?.meleeChar || body.heldItem.char || '|';
  const staffColor = body.heldItem.color || '#ffffff';
  // Rotate the (vertical-glyph) staff so it lies perpendicular to facing.
  renderer.drawEntityRotated(cx, cy, staffChar, staffColor, facingAngle);
}

/** Whirlwind Cape's dodge roll spins the player glyph rapidly instead of the
 * plain draw. Returns the spin angle while the dodge is active, or null when
 * the player should be drawn normally — callers branch on that. */
export function whirlwindSpinAngle(player) {
  if (player.dodgeRoll?.type === 'whirlwind' && player.dodgeRoll.active) {
    return player.statusBlinkTimer * Math.PI * 20; // ~10 rotations/sec
  }
  return null;
}
