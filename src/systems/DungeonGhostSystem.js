// DungeonGhostSystem — internal collaborator DungeonSystem calls directly
// (third alongside DungeonFloorGenerator/DungeonPuzzleSystem — see main.js's
// system-wiring comment and ADR-0001). Owns Tomb Ghost movement and sap,
// which fits neither "floor content" nor "puzzle/gating logic", the two
// categories DungeonSystem's own header already disclaims.
//
// A Tomb Ghost is a bespoke, non-Enemy class spawned by opening a dungeon
// Tomb (BackgroundObject.openTomb / InteractionSystem's 'openTomb' effect
// branch, 30% chance). It's an extension of MazeSystem's own MazeGhost —
// immune to damage, not built on the Enemy/Mechanic composition system —
// but diverges completely in movement and sap:
//   - Movement: floats in a small lemniscate (figure-eight) local wobble
//     while homing straight at the player at a fixed speed, ignoring walls
//     and every other obstacle unconditionally. No pathfinding, unlike
//     MazeGhost's BFS cell-stepping through the maze's collision grid.
//   - Sap: contact sets player.tombSapped, deliberately never registered
//     into player.activeSappingBats — the bat sap mechanic's own array,
//     which both takeDamage() and the dodge roll walk to call
//     breakSapping() on every entry. Tomb Ghost sap is immune to both
//     interrupts for free, simply by living outside that array. It also has
//     no duration; only leaving the room (DungeonSystem._activateFloor) or
//     the dungeon (_exitDungeon) clears it — see those two hook sites plus
//     InteriorManager.reset()'s defensive third clear-point.

const GHOST_CHAR          = '⚉';  // Same glyph as MazeSystem's MazeGhost — signals the shared family
const GHOST_COLOR         = '#8877aa';
const GHOST_SPEED         = 30;   // px/s — fixed-rate homing toward the player, never varies
const WOBBLE_RADIUS       = 10;   // px — lemniscate half-width; "small" figure-eight, well under one cell
const WOBBLE_RATE         = 3.2;  // rad/s — lemniscate parameter speed
const CONTACT_RADIUS      = 10;   // px — distance at which the ghost saps the player on touch
const SAP_DAMAGE          = 1;
const SAP_DAMAGE_INTERVAL = 1.0;  // seconds between sap ticks — matches Enemy.js bat sap's own default

/**
 * TombGhost — see file header. Position tracking splits into two fields:
 * basePosition (the real homing target, marches straight at the player,
 * phases through walls) and position (basePosition plus the lemniscate
 * offset — what actually gets rendered and used for contact checks), so the
 * figure-eight wobble never fights the homing chase for a single source of
 * truth.
 */
class TombGhost {
  constructor(x, y) {
    this.char = GHOST_CHAR;
    this.color = GHOST_COLOR;
    this.basePosition = { x, y };
    this.position = { x, y };
    this.wobbleTimer = Math.random() * Math.PI * 2; // Phase-desync if multiple ghosts ever coexist
    // Immune — mirrors MazeGhost exactly. Cannot be damaged, destroyed, or
    // rolled away; only escape from its sap is leaving the room/dungeon.
    this.hp = Infinity;
    this.takeDamage = () => 0;
  }
}

export class DungeonGhostSystem {
  constructor(game) {
    this.game = game;
  }

  /** Spawn a Tomb Ghost at a background object's position — called by
   *  InteractionSystem's 'openTomb' effect branch on its 30% roll. */
  spawnAt(floor, x, y) {
    floor.tombGhosts.push(new TombGhost(x, y));
  }

  /** Per-tick ghost movement + contact-sap. Called from DungeonSystem.update(). */
  update(floor, dt) {
    const player = this.game.player;
    for (const ghost of floor.tombGhosts) {
      // Homing: straight line to the player at a fixed speed, unconditionally
      // ignoring floor.collisionMap and every other obstacle — the one
      // deliberate divergence from every other chasing entity in the game.
      const dx = player.position.x - ghost.basePosition.x;
      const dy = player.position.y - ghost.basePosition.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 0.01) {
        const step = Math.min(dist, GHOST_SPEED * dt);
        ghost.basePosition.x += (dx / dist) * step;
        ghost.basePosition.y += (dy / dist) * step;
      }

      // Lemniscate of Bernoulli (figure-eight), overlaid on the homing base
      // position — "floats statically in a small lemniscate pattern while
      // moving at a fixed rate towards the player".
      ghost.wobbleTimer += dt * WOBBLE_RATE;
      const t = ghost.wobbleTimer;
      const denom = 1 + Math.sin(t) * Math.sin(t);
      ghost.position.x = ghost.basePosition.x + (WOBBLE_RADIUS * Math.cos(t)) / denom;
      ghost.position.y = ghost.basePosition.y + (WOBBLE_RADIUS * Math.sin(t) * Math.cos(t)) / denom;

      // Contact sap. Persists once set — see file header — so this only ever
      // needs to turn the flag on, never off.
      const cdx = player.position.x - ghost.position.x;
      const cdy = player.position.y - ghost.position.y;
      if (Math.hypot(cdx, cdy) < CONTACT_RADIUS) {
        player.tombSapped = true;
        player._tombSappingGhost = ghost;
      }
    }
  }

  /** Periodic sap damage while player.tombSapped is set. Called from
   *  DungeonSystem.update(), independent of the ghost's current distance —
   *  the sap persists past contact per the design (escape is leaving the
   *  room/dungeon, not outrunning the ghost). */
  tickSap(player, dt) {
    if (!player.tombSapped) return;

    player._tombSapTimer += dt;
    if (player._tombSapTimer < SAP_DAMAGE_INTERVAL) return;
    player._tombSapTimer -= SAP_DAMAGE_INTERVAL;

    // No knockback (mirrors bat sap's own CombatSystem comment — a locked-on
    // sap source immediately undoes any push). Reuses the shared
    // staff-block-respecting damage path so Tomb Ghost sap reads identically
    // to bat sap: dodge/block/reflect text all handled the same way, and the
    // real ghost instance as `attacker` keeps a reflect proc safe (its
    // takeDamage is a no-op, same as MazeGhost's).
    this.game.combatSystem._applyBlockableEnemyDamage(
      player, player._tombSappingGhost, SAP_DAMAGE,
      { isBullet: false, element: null, attacker: player._tombSappingGhost }
    );
  }
}
