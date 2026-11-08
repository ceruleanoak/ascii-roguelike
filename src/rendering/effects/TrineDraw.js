// TrineDraw — the Mist Battle's Flank bodies (MistBattleSystem). The Primary
// is game.player and draws through the normal player path; this draws the two
// Flanks as full characters ('@' in their own character color), never as
// companions, a step dimmer than the Primary so the one you steer reads at a
// glance. In Act 2 nobody is steered, so every body draws at full strength.
// After a 1/2/3 swap (or an Act 2 body drawing another weapon) every body,
// Primary included, briefly shows its newly held weapon glyph above it.
// A Dormant body draws faint and brightens toward Flank strength as it
// recovers, so its wake reads without a timer.
// The player-layer Frame Passes draw game.player's own visible state (status
// pips, dizzy orbit, parry tell, a weapon's windup pose); the other bodies get
// the same here (drawBodyState), so in Act 2, where no body is the one being
// steered, all three show what is happening to them alike.
//
// Surface-plane only: the Mist Battle arena is a plain gray combat room with no
// Interior, so there is no PiP pass to share this with.
import { GRID } from '../../game/GameConfig.js';
import { drawStatusPips } from './StatusPipEffects.js';
import { drawDizzyOrbitals } from './DizzyOrbitals.js';
import { drawParryIndicator } from '../ui/ParryIndicator.js';
import { drawGemWandCharge, drawHeldWindupCharge, drawRaisedWindupPose, drawStaffBlockStance } from './WeaponPreviewDraw.js';

const FLANK_ALPHA_MULT = 0.7;
const DORMANT_ALPHA_MIN = 0.2;

export function drawTrine(renderer, game) {
  const mist = game.mistBattleSystem;
  if (!mist?.active) return;
  const half = GRID.CELL_SIZE / 2;
  for (const { body, swapFlash } of mist.members) {
    const weapon = body.heldItem;
    if (swapFlash <= 0 || !weapon || body.hp <= 0) continue;
    renderer.drawTextWithAlpha(
      body.position.x + half,
      body.position.y + half - GRID.CELL_SIZE,
      weapon.char,
      weapon.color,
      1
    );
  }
  const alphaMult = mist.act === 2 ? 1 : FLANK_ALPHA_MULT;
  // Flanks, and any body a Great Hand holds out of the Trine.
  for (const member of mist.members) {
    const body = member.body;
    if (member === mist.primary || body.hp <= 0) continue;
    renderer.drawTextWithAlpha(
      body.position.x + half,
      body.position.y + half,
      body.char,
      body.getDisplayColor(),
      body.getVisibilityAlpha() * alphaMult
    );
    drawBodyState(renderer, body);
  }
  for (const member of mist.members) {
    if (member.dormant <= 0) continue;
    const body = member.body;
    const recovered = mist.dormantRecovery(member);
    renderer.drawTextWithAlpha(
      body.position.x + half,
      body.position.y + half,
      body.char,
      body.getDisplayColor(),
      DORMANT_ALPHA_MIN + (FLANK_ALPHA_MULT - DORMANT_ALPHA_MIN) * recovered
    );
  }
}

// What the player-layer Frame Passes draw for game.player, drawn for another
// Trine body: its status, its parry window and its held weapon's pose.
function drawBodyState(renderer, body) {
  const half = GRID.CELL_SIZE / 2;
  if (body.isDizzy?.()) {
    drawDizzyOrbitals(renderer.fgCtx, body.position.x + half, body.position.y + half, body.statusBlinkTimer);
  }
  drawStatusPips(renderer, body);
  drawParryIndicator(renderer, body, body.parryMechanic);
  drawStaffBlockStance(renderer, body);
  drawGemWandCharge(renderer, body);
  drawHeldWindupCharge(renderer, body);
  drawRaisedWindupPose(renderer, body);
}
