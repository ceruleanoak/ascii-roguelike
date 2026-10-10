/**
 * Frame Passes — the one resolution path for world content that more than one
 * Frame Owner draws.
 *
 * A **Frame Owner** is the space that owns the frame this tick — exactly one of:
 *   surface  ExploreRenderer (EXPLORE Room, also ARCADE_DEMO)
 *   floor    HutInteriorOverlay (Hut, Cavern, Dungeon floor, Aquifer PiP)
 *   maze     MazeInteriorOverlay (Maze PiP)
 *   rest     RestRenderer
 *   neutral  NeutralRenderer
 * `resolveFrameOwner(game)` is the only place that decides which.
 *
 * Every owner renderer calls `drawFramePasses(rc, game, '<itself>', layer)`
 * once per layer, at its own z-position for that layer. The call is a no-op
 * unless that renderer owns the frame, so a pass can neither ghost onto a
 * frozen surface nor go missing from a PiP — the two failure shapes of the
 * old hand-kept lists (#277, #376, #385).
 *
 * Every pass declares EVERY owner: `true` (draws there) or a string giving
 * the reason it doesn't. A missing key throws at module load and fails
 * `npm run check:frames` — absence is always a written decision, never a
 * forgotten call. Owner-specific scenery (walls, torches, NPC rosters,
 * enemies, exit letters) stays in its own renderer; gate surface-only
 * scenery with `ownsFrame(game, 'surface', '<reason>')`, never a hand-rolled
 * interior check (the checker rejects `playerInInterior`/`isInteriorActive`
 * in owner renderers).
 *
 * Coordinates: the PiP owners translate the canvas before calling, so a pass
 * draws in the active plane's own space. `interior` (floor/maze) selects the
 * PiP-tagged entries of the shared collections (`hutPlane`/`mazePlane`,
 * `interior` on traps).
 */

import { GRID, GAME_STATES } from '../game/GameConfig.js';
import { isInteriorActive, inSamePlane } from '../systems/PlaneSystem.js';
import { drawWires } from './effects/WireEffects.js';
import { drawStatusPips } from './effects/StatusPipEffects.js';
import { drawParryIndicator } from './ui/ParryIndicator.js';
import { drawFairyKingOrbit } from './effects/FairyKingOrbit.js';
import { drawPlayerFacingIndicator } from './ui/PlayerFacingIndicator.js';
import { drawKnownSpellHints } from './ui/ContextHints.js';
import { drawTrine } from './effects/TrineDraw.js';
import { hasTorchLight, drawPlayerTorchLight } from './ui/torchLight.js';
import { drawPlayerGlyph } from './effects/PlayerGlyphDraw.js';
import { drawDizzyOrbitals } from './effects/DizzyOrbitals.js';
import { drawWandProximityFailures, drawAoeEffects } from './effects/WandEffectsDraw.js';

export const FRAME_OWNERS = ['surface', 'floor', 'maze', 'rest', 'neutral'];
export const FRAME_LAYERS = ['ground', 'combat', 'player', 'indicators'];

/**
 * Which Frame Owner holds the frame this tick. Interiors resolve by the same
 * field InteriorOverlay dispatches on (`_activeInteriorKind`, ADR-0001), so
 * the owner that runs the passes is always the overlay actually on screen.
 */
export function resolveFrameOwner(game) {
  const state = game.stateMachine?.currentState;
  if (state === GAME_STATES.REST) return 'rest';
  if (state === GAME_STATES.NEUTRAL) return 'neutral';
  if (!isInteriorActive(game)) return 'surface';
  return game.player._activeInteriorKind === 'maze' ? 'maze' : 'floor';
}

/**
 * Gate for owner-specific scenery. `reason` is not read at runtime — it is
 * the declaration `npm run check:frames` requires (a string literal) so every
 * owner-only draw says why it belongs to that owner alone.
 */
export function ownsFrame(game, owner, reason) { // eslint-disable-line no-unused-vars
  return resolveFrameOwner(game) === owner;
}

const isInterior = (owner) => owner === 'floor' || owner === 'maze';

// PiP death hold: the death screen shows only particles/debris there,
// matching the surface GAME_OVER path (GameOverRenderer never draws the player).
const deathHeld = (game, owner) => isInterior(owner) && game.characterDeathPending;

// NEUTRAL is non-combat except for one fight: Death in the Three Room, where
// the player's swings and shots must show. Gated at draw time, because neutral
// room transitions don't clear the combat lists.
const neutralFight = (game, owner) => owner !== 'neutral' || !!game.threeRoomSystem?.isDeathOut(game);

const NON_COMBAT = 'NEUTRAL rooms are non-combat (Game State: NEUTRAL)';
const NO_ENEMIES = 'REST has no enemies (Game State: REST)';
const PLAIN_PRIZES = 'NeutralRenderer draws room prizes plainly: the shared tall-grass concealment would hide Leshy grass prizes';
const TRINE_ONLY = 'the Trine fights only in the Mist Battle, on a surface Room';
const RUSALKA_ONLY = 'the cure Rusalka surfaces only in Lake Rooms (surface)';
const NO_DARK = 'nothing here is dark enough for a torch to cut';
const STORM_EYE_ONLY = 'Wind Fields blow only in the Storm Eye arena, a surface Room';

const everywhere = { surface: true, floor: true, maze: true, rest: true, neutral: true };
const combatOnly = { ...everywhere, neutral: NON_COMBAT };
// Player attacks also draw in NEUTRAL, gated to the Death fight by neutralFight().
const playerAttacks = { ...everywhere };
const enemySide = { ...everywhere, rest: NO_ENEMIES, neutral: NON_COMBAT };
const surfaceOnly = (reason) => ({ surface: true, floor: reason, maze: reason, rest: reason, neutral: reason });

const er = (rc) => rc.exploreRenderer;

export const FRAME_PASSES = {
  // Lying on the floor: under enemies, attacks and the player.
  ground: [
    { id: 'puddles', on: combatOnly, draw: (rc, game, owner) => er(rc).drawPuddles(game, isInterior(owner)) },
    { id: 'gooBlobs', on: combatOnly, draw: (rc, game, owner) => er(rc).drawGooBlobs(game, isInterior(owner)) },
    { id: 'debris', on: combatOnly, draw: (rc, game, owner) => er(rc).drawDebris(game, isInterior(owner)) },
    { id: 'ingredients', on: { ...everywhere, neutral: PLAIN_PRIZES }, draw: (rc, game, owner) => er(rc).drawIngredients(game, isInterior(owner)) },
    { id: 'items', on: { ...everywhere, neutral: PLAIN_PRIZES }, draw: (rc, game, owner) => er(rc).drawItems(game, isInterior(owner)) },
    { id: 'placedTraps', on: combatOnly, draw: (rc, game, owner) => er(rc).drawPlacedTraps(game, isInterior(owner)) },
  ],

  // Attacks and their flourish: over enemies, under the player.
  combat: [
    { id: 'consumableWindups', on: combatOnly, draw: (rc, game) => er(rc).drawConsumableWindups(game) },
    { id: 'projectiles', on: playerAttacks, draw: (rc, game, owner) => { if (neutralFight(game, owner)) er(rc).drawProjectiles(game, isInterior(owner)); } },
    { id: 'enemyProjectiles', on: enemySide, draw: (rc, game, owner) => er(rc).drawEnemyProjectiles(game, isInterior(owner)) },
    { id: 'meleeAttacks', on: playerAttacks, draw: (rc, game, owner) => { if (neutralFight(game, owner)) er(rc).drawMeleeAttacks(game, isInterior(owner)); } },
    { id: 'enemyMeleeAttacks', on: enemySide, draw: (rc, game, owner) => er(rc).drawEnemyMeleeAttacks(game, isInterior(owner)) },
    // Enemy + mimic tongues read game._activeEnemies(), which already resolves to the active layer.
    { id: 'enemyTongues', on: enemySide, draw: (rc, game) => er(rc).drawEnemyTongues(game) },
    { id: 'mimicTongues', on: enemySide, draw: (rc, game) => er(rc).drawMimicTongues(game) },
    { id: 'playerTongueAttacks', on: combatOnly, draw: (rc, game, owner) => er(rc).drawPlayerTongueAttacks(game, isInterior(owner)) },
    // Triplines: committed segments + the live half-strung preview.
    { id: 'wires', on: combatOnly, draw: (rc, game, owner) => drawWires(rc.renderer, game, isInterior(owner)) },
    {
      id: 'cureRusalka', on: surfaceOnly(RUSALKA_ONLY),
      draw: (rc, game) => {
        const r = game.cureRusalka;
        if (!r || !inSamePlane(r, game.player)) return;
        rc.renderer.drawTextWithAlpha(
          r.position.x + GRID.CELL_SIZE / 2, r.position.y + GRID.CELL_SIZE / 2,
          r.char, r.color, r.getPulseAlpha ? r.getPulseAlpha() : 1.0
        );
      }
    },
    { id: 'stuckArrows', on: combatOnly, draw: (rc, game, owner) => er(rc).drawStuckArrows(game, isInterior(owner)) },
    { id: 'wandProximityFailures', on: combatOnly, draw: (rc, game) => drawWandProximityFailures(rc.renderer, game) },
    { id: 'aoeEffects', on: combatOnly, draw: (rc, game) => drawAoeEffects(rc.renderer, game) },
    { id: 'lightningStrikes', on: combatOnly, draw: (rc, game, owner) => er(rc).drawLightningStrikes(game, isInterior(owner)) },
    { id: 'chainArcs', on: combatOnly, draw: (rc, game, owner) => er(rc).drawChainArcs(game, isInterior(owner)) },
    { id: 'damageNumbers', on: combatOnly, draw: (rc, game, owner) => er(rc).drawDamageNumbers(game, isInterior(owner)) },
    // Dodge trails and weapon-preview bursts happen in REST as well as combat.
    { id: 'particles', on: { ...everywhere, neutral: 'particles never tick in NEUTRAL (WorldEffectsSystem runs in REST/EXPLORE only), so leftovers would hang frozen' }, draw: (rc, game, owner) => er(rc).drawParticles(game, isInterior(owner)) },
    { id: 'steamClouds', on: combatOnly, draw: (rc, game, owner) => er(rc).drawSteamClouds(game, isInterior(owner)) },
    // Wind Field motes (Storm Eye): swirl, gust streaks, suction spirals.
    { id: 'windField', on: surfaceOnly(STORM_EYE_ONLY), draw: (rc, game) => game.bossSystem?.windFieldSystem.render(rc.renderer.fgCtx) },
  ],

  // The player and everything attached to them.
  player: [
    { id: 'trine', on: surfaceOnly(TRINE_ONLY), draw: (rc, game) => drawTrine(rc.renderer, game) },
    {
      id: 'torchLight',
      on: { surface: 'surface torch light is the cave-fog torch boost (drawVisionFogOverlay)', floor: true, maze: true, rest: NO_DARK, neutral: NO_DARK },
      draw: (rc, game) => {
        if (!hasTorchLight(game)) return;
        drawPlayerTorchLight(rc.renderer,
          game.player.position.x + GRID.CELL_SIZE / 2, game.player.position.y + GRID.CELL_SIZE / 2);
      }
    },
    {
      id: 'playerGlyph', on: everywhere,
      draw: (rc, game, owner) => {
        if (deathHeld(game, owner)) return;
        const conceal = owner === 'surface' ? er(rc).playerConcealAlpha(game) : 1;
        drawPlayerGlyph(rc.renderer, game, owner, conceal);
      }
    },
    {
      id: 'dizzy', on: everywhere,
      draw: (rc, game) => {
        if (!game.player.isDizzy?.()) return;
        drawDizzyOrbitals(rc.renderer.fgCtx,
          game.player.position.x + GRID.CELL_SIZE / 2, game.player.position.y + GRID.CELL_SIZE / 2,
          game.player.statusBlinkTimer);
      }
    },
    // Stack-count pips for the player's active status effects — StatusPipEffects.
    { id: 'statusPips', on: everywhere, draw: (rc, game, owner) => { if (!deathHeld(game, owner)) drawStatusPips(rc.renderer, game.player); } },
    // Buckler parry window: same ']' tell enemies show.
    { id: 'parryIndicator', on: combatOnly, draw: (rc, game, owner) => { if (!deathHeld(game, owner)) drawParryIndicator(rc.renderer, game.player, game.player.parryMechanic); } },
    // Fairy King in a Bottle ready: a fairy circles the player.
    { id: 'fairyKingOrbit', on: combatOnly, draw: (rc, game, owner) => { if (!deathHeld(game, owner)) drawFairyKingOrbit(rc.renderer, game); } },
    // Attack-direction '^' orbiting tight around the player.
    { id: 'facingIndicator', on: { ...combatOnly, rest: 'REST is the safe hub; the attack-direction cue is hidden there by design' }, draw: (rc, game) => drawPlayerFacingIndicator(rc.renderer, game) },
    { id: 'staffBlockStance', on: combatOnly, draw: (rc, game) => er(rc).drawStaffBlockStance(game) },
    { id: 'knownSpellHints', on: combatOnly, draw: (rc, game) => { if (game.knownSpells?.size > 0) drawKnownSpellHints(rc.renderer, game); } },
    { id: 'gemWandCharge', on: combatOnly, draw: (rc, game) => er(rc).drawGemWandCharge(game) },
    { id: 'hammerWindupPose', on: combatOnly, draw: (rc, game) => er(rc).drawHammerWindupPose(game) },
    { id: 'chargeCounts', on: combatOnly, draw: (rc, game) => er(rc).drawChargeCounts(game) },
    { id: 'trapReticule', on: combatOnly, draw: (rc, game) => er(rc).drawTrapReticule(game) },
    { id: 'throwPreview', on: combatOnly, draw: (rc, game) => er(rc).drawThrowPreview(game) },
    { id: 'inFlightTraps', on: combatOnly, draw: (rc, game, owner) => er(rc).drawInFlightTraps(game, isInterior(owner)) },
  ],

  // Character-ability readouts: above everything an owner layers over the
  // player (surface grass, sapping enemies, a Maze companion).
  indicators: [
    { id: 'bowChargeIndicator', on: combatOnly, draw: (rc, game) => rc.bowChargeIndicator.render(game) },
    { id: 'greenRangerIndicator', on: combatOnly, draw: (rc, game) => rc.greenRangerIndicator.render(game) },
    { id: 'cyanRogueIndicator', on: combatOnly, draw: (rc, game) => rc.cyanRogueIndicator.render(game) },
  ],
};

/**
 * Schema check: every layer exists, ids are unique, and every pass declares
 * every owner as `true` or a written reason. Returns the list of problems.
 */
export function validateFramePasses(passes = FRAME_PASSES) {
  const problems = [];
  const seen = new Set();
  for (const layer of FRAME_LAYERS) {
    if (!Array.isArray(passes[layer])) problems.push(`layer '${layer}' is missing`);
  }
  for (const [layer, list] of Object.entries(passes)) {
    if (!FRAME_LAYERS.includes(layer)) problems.push(`unknown layer '${layer}'`);
    for (const pass of list ?? []) {
      const where = `${layer}/${pass.id ?? '?'}`;
      if (!pass.id) problems.push(`${where}: pass has no id`);
      else if (seen.has(pass.id)) problems.push(`${where}: duplicate id`);
      seen.add(pass.id);
      if (typeof pass.draw !== 'function') problems.push(`${where}: draw is not a function`);
      for (const owner of FRAME_OWNERS) {
        const v = pass.on?.[owner];
        if (v === true) continue;
        if (typeof v === 'string' && v.trim().length >= 12) continue;
        problems.push(`${where}: owner '${owner}' must be true or a written reason (got ${JSON.stringify(v)})`);
      }
      for (const key of Object.keys(pass.on ?? {})) {
        if (!FRAME_OWNERS.includes(key)) problems.push(`${where}: unknown owner '${key}'`);
      }
    }
  }
  return problems;
}

{
  const problems = validateFramePasses();
  if (problems.length) throw new Error(`Frame Pass declarations are incomplete:\n  ${problems.join('\n  ')}`);
}

/**
 * Draw one layer of Frame Passes for `owner` — a no-op unless `owner` holds
 * the frame this tick (resolveFrameOwner).
 */
export function drawFramePasses(rc, game, owner, layer) {
  if (resolveFrameOwner(game) !== owner) return;
  for (const pass of FRAME_PASSES[layer]) {
    if (pass.on[owner] === true) pass.draw(rc, game, owner);
  }
}
