/**
 * GrayZoneSystem — the Realm of the Dead's two defining mechanics.
 *
 * 1. Mist fog: a field of '~' glyphs covers the whole screen, each drifting
 *    independently (mild sinusoidal pixel idle). Glyphs near the player thin
 *    out — alpha drops with proximity inside the vision radius
 *    (ZONES.gray.mist.radius cells — "TEN STEPS AND THEN NOTHING.") but is
 *    never fully transparent. Living enemies with `data.mistThicken`
 *    (Mourners) pull the radius in tighter. ExploreRenderer calls
 *    renderMist() once per frame.
 *
 * 2. Depth-10 finish line: gray has no zone boss. Entering the room at
 *    ZONES.gray.maxDepth arms the mist-out — a short grace, then the circle
 *    closes to black and the mist takes the character. Their loadout is
 *    snapshotted to game.graySnapshots (the future 5-character-ending hook),
 *    the character joins game.lostCharacters, and play resumes at REST with
 *    the next living character. Losing the last living character ends the
 *    run. Fully diegetic — no text, the closing fog is the ceremony.
 */

import { GRID } from '../game/GameConfig.js';
import { ZONES } from '../data/zones.js';

const GRACE_DURATION = 1.0;   // See the tenth room before the mist moves
const SHRINK_DURATION = 5.0;  // Vision radius 10 → 0 cells
const HOLD_DURATION = 0.8;    // Full-mist hold before the cut to REST

// Death swallow (game over in gray): the vision hole lingers over the death
// site so the death effects play out, then the mist closes over it — only
// after that does the game-over text appear.
const DEATH_HOLD_DURATION = 1.2;
const DEATH_CLOSE_DURATION = 2.0;
const MIN_RADIUS_CELLS = 4;   // Mourners can never blind the player completely
const RADIUS_LERP_RATE = 6;   // Cells/sec toward target (Mourner thickening)

// Mist glyph field tuning
const MOTE_SKIP_CHANCE = 0.08;  // Sparse gaps so it reads as mist, not a grid
const MOTE_SIZE = 1.15;         // Glyph size × CELL_SIZE — overlapping, thick cover
const ALPHA_FAR = 0.92;         // Glyph alpha outside the vision radius (obscuring)
const ALPHA_NEAR = 0.15;        // Glyph alpha at the player's feet — thinned, never gone
const MOTE_COLORS = ['#8a8a8e', '#74747a', '#9a9aa0', '#67676d'];

// World-dimming veil: drawn under the glyphs, so everything already rendered
// (enemies, bg objects, items, exits) fades inversely to the mist — clear at
// the player, nearly swallowed beyond the vision radius. CELL-quantized: each
// 16px grid cell gets ONE alpha (10% steps) from its center's distance — the
// vision radius is logic only and never renders as a circle/light. t² falloff.
const VEIL_MAX = 0.9;           // World alpha far out ≈ 1 - VEIL_MAX (faint presence)

export class GrayZoneSystem {
  constructor(game) {
    this.game = game;
    this.baseRadiusCells = ZONES.gray?.mist?.radius ?? 10;
    this.currentRadiusCells = this.baseRadiusCells;

    // Mist-out sequence: null | 'grace' | 'shrink' | 'hold'
    this.mistOutPhase = null;
    this.mistOutTimer = 0;

    // Death swallow (game over in gray): null | 'hold' | 'close' | 'closed'
    this.deathSwallowPhase = null;
    this.deathSwallowTimer = 0;
    this.deathCloseStartRadius = 0;

    this.mistField = null;  // Persistent '~' motes; rebuilt per gray room
    this.mistTime = 0;      // Drift clock for per-mote idle animation
  }

  /** Dispatch from enterGameOverState — arms the death swallow in gray. */
  onGameOver() {
    if (this.game.currentRoom?.zone !== 'gray') return;
    this.deathSwallowPhase = 'hold';
    this.deathSwallowTimer = DEATH_HOLD_DURATION;
  }

  /** True while the mist is still closing over the death site. */
  isSwallowing() {
    return this.deathSwallowPhase === 'hold' || this.deathSwallowPhase === 'close';
  }

  // One '~' mote per grid cell (minus random gaps), each with its own drift
  // phase/speed/amplitude and baked sub-cell jitter so the field never reads
  // as a lattice.
  _buildMistField() {
    const motes = [];
    for (let row = 0; row < GRID.ROWS; row++) {
      for (let col = 0; col < GRID.COLS; col++) {
        if (Math.random() < MOTE_SKIP_CHANCE) continue;
        motes.push({
          x: col * GRID.CELL_SIZE + GRID.CELL_SIZE / 2 + (Math.random() * 6 - 3),
          y: row * GRID.CELL_SIZE + GRID.CELL_SIZE / 2 + (Math.random() * 6 - 3),
          phase: Math.random() * Math.PI * 2,
          speedX: 0.4 + Math.random() * 0.5,   // Slow, mist-like idle
          speedY: 0.25 + Math.random() * 0.35,
          ampX: 1.5 + Math.random() * 1.5,     // Mild pixel offsets
          ampY: 1.0 + Math.random() * 1.2,
          breath: 0.04 + Math.random() * 0.05, // Subtle alpha shimmer
          color: MOTE_COLORS[Math.floor(Math.random() * MOTE_COLORS.length)]
        });
      }
    }
    this.mistField = motes;
  }

  get mistOutActive() {
    return this.mistOutPhase !== null;
  }

  /** Dispatch from enterExploreState after the room (and zone depth) is final. */
  onRoomEnter(zone, depth) {
    this.deathSwallowPhase = null;
    this.deathSwallowTimer = 0;

    if (zone !== 'gray') {
      this.mistOutPhase = null;
      this.mistOutTimer = 0;
      return;
    }

    this.currentRadiusCells = this.baseRadiusCells;
    this._buildMistField();

    const maxDepth = ZONES.gray?.maxDepth;
    if (maxDepth && depth >= maxDepth && !this.mistOutActive) {
      this.mistOutPhase = 'grace';
      this.mistOutTimer = GRACE_DURATION;
    }
  }

  update(deltaTime) {
    const game = this.game;
    if (game.currentRoom?.zone !== 'gray') return;

    this.mistTime += deltaTime;

    if (this.mistOutActive) {
      this._updateMistOut(deltaTime);
      return;
    }

    if (this.deathSwallowPhase) {
      this._updateDeathSwallow(deltaTime);
      return;
    }

    // Mourner pressure: each living mistThicken enemy pulls the circle in.
    let target = this.baseRadiusCells;
    for (const enemy of game.currentRoom.enemies || []) {
      if (enemy.hp > 0 && !enemy.collapsed && enemy.data?.mistThicken) {
        target -= enemy.data.mistThicken;
      }
    }
    target = Math.max(MIN_RADIUS_CELLS, target);

    const step = RADIUS_LERP_RATE * deltaTime;
    if (this.currentRadiusCells < target) {
      this.currentRadiusCells = Math.min(target, this.currentRadiusCells + step);
    } else if (this.currentRadiusCells > target) {
      this.currentRadiusCells = Math.max(target, this.currentRadiusCells - step);
    }
  }

  _updateMistOut(deltaTime) {
    const game = this.game;

    // The mist takes the walker — the dead don't get to. Refresh iframes for
    // the whole sequence so there is no death race during the fade.
    if (game.player) {
      game.player.invulnerabilityTimer = Math.max(game.player.invulnerabilityTimer, 0.5);
    }

    this.mistOutTimer -= deltaTime;

    if (this.mistOutPhase === 'grace') {
      if (this.mistOutTimer <= 0) {
        this.mistOutPhase = 'shrink';
        this.mistOutTimer = SHRINK_DURATION;
        game.audioSystem?.playSFX('mist_take');
      }
      return;
    }

    if (this.mistOutPhase === 'shrink') {
      // Ease-in close: slow drift at first, accelerating as it takes hold.
      const t = 1 - Math.max(0, this.mistOutTimer) / SHRINK_DURATION;
      this.currentRadiusCells = this.baseRadiusCells * Math.pow(1 - t, 1.5);
      if (this.mistOutTimer <= 0) {
        this.currentRadiusCells = 0;
        this.mistOutPhase = 'hold';
        this.mistOutTimer = HOLD_DURATION;
      }
      return;
    }

    if (this.mistOutPhase === 'hold' && this.mistOutTimer <= 0) {
      this._finalizeMistOut();
    }
  }

  _finalizeMistOut() {
    const game = this.game;
    const player = game.player;

    // Snapshot the loadout the character carried into the mist. Plain
    // descriptors, not live objects — this is the data hook the future
    // 5-character ending consumes ("FIVE MUST BECOME ONE.").
    game.graySnapshots.push({
      characterType: game.activeCharacterType,
      depth: game.zoneDepths.gray,
      quickSlots: (player?.quickSlots || []).map(slot =>
        slot ? { char: slot.char, name: slot.data?.name ?? slot.name ?? null } : null
      ),
      armor: game.inventorySystem.equippedArmor
        ? {
            char: game.inventorySystem.equippedArmor.char,
            name: game.inventorySystem.equippedArmor.data?.name
              ?? game.inventorySystem.equippedArmor.name ?? null
          }
        : null,
      consumables: (game.inventorySystem.equippedConsumables || []).map(c =>
        c ? { char: c.char, name: c.data?.name ?? c.name ?? null } : null
      )
    });

    // Lost, not dead — kept separate so the future ending can tell them apart.
    if (!game.lostCharacters.includes(game.activeCharacterType)) {
      game.lostCharacters.push(game.activeCharacterType);
    }

    this.mistOutPhase = null;
    this.mistOutTimer = 0;
    this.currentRadiusCells = this.baseRadiusCells;

    const living = game.unlockedCharacters.filter(
      type => !game.deadCharacters.includes(type) && !game.lostCharacters.includes(type)
    );

    if (living.length > 0) {
      game._switchToCharacterAtRest(living[0]);
    } else {
      // The mist took the last walker — the run is over, snapshots and all.
      game._resetRunToRest();
    }
  }

  _updateDeathSwallow(deltaTime) {
    this.deathSwallowTimer -= deltaTime;

    if (this.deathSwallowPhase === 'hold') {
      // Vision hole lingers over the death site — let the death effects play.
      if (this.deathSwallowTimer <= 0) {
        this.deathSwallowPhase = 'close';
        this.deathSwallowTimer = DEATH_CLOSE_DURATION;
        this.deathCloseStartRadius = this.currentRadiusCells;
      }
      return;
    }

    if (this.deathSwallowPhase === 'close') {
      // Same ease-in close as the depth-10 mist-out — the mist swallows the site.
      const t = 1 - Math.max(0, this.deathSwallowTimer) / DEATH_CLOSE_DURATION;
      this.currentRadiusCells = this.deathCloseStartRadius * Math.pow(1 - t, 1.5);
      if (this.deathSwallowTimer <= 0) {
        this.currentRadiusCells = 0;
        this.deathSwallowPhase = 'closed';
      }
    }
  }

  /**
   * Death-screen mist. While the swallow runs, the normal field renders with
   * its (shrinking) vision hole around the body so the death effects stay
   * visible; once closed, the screen is only mist. Interior deaths skip the
   * hole phase — player coords are interior-space — and cut to full mist.
   */
  renderMistDeath(ctx, game) {
    if (game.currentRoom?.zone !== 'gray') return;

    if (this.deathSwallowPhase === 'closed' || !this.deathSwallowPhase) {
      this.renderMistGameOver(ctx);
      return;
    }

    const p = game.player;
    if (p && (p.inHut || p.inDungeon || p.inMaze)) return; // PiP owns the view until closed
    this.renderMist(ctx, game);
  }

  /**
   * Game-over backdrop: the mist outlives the walker. No proximity thinning —
   * the player is gone, so the field renders at full density over an opaque
   * veil ("only mist"). GameOverRenderer calls this before the death text.
   * Drift keeps animating via the update(dt) dispatch in updateGameOverState.
   */
  renderMistGameOver(ctx) {
    if (this.game.currentRoom?.zone !== 'gray') return;
    if (!this.mistField) this._buildMistField();
    const t = this.mistTime;

    ctx.save();
    ctx.globalAlpha = 1;
    ctx.fillStyle = ZONES.gray.environmentColors.background || '#050505';
    ctx.fillRect(0, 0, GRID.WIDTH, GRID.HEIGHT);

    ctx.font = `${Math.round(GRID.CELL_SIZE * MOTE_SIZE)}px 'Unifont', monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const m of this.mistField) {
      const mx = m.x + Math.sin(t * m.speedX + m.phase) * m.ampX;
      const my = m.y + Math.cos(t * m.speedY + m.phase * 1.7) * m.ampY;
      ctx.globalAlpha = Math.min(0.95, ALPHA_FAR + Math.sin(t * 0.8 + m.phase * 3) * m.breath);
      ctx.fillStyle = m.color;
      ctx.fillText('~', mx, my);
    }
    ctx.restore();
  }

  /**
   * Mist glyph field. Called by ExploreRenderer after entities (so the mist
   * hangs in front of distant enemies and exit letters), before PiP overlays.
   * Gates internally: gray-zone room, surface plane only (the cave fog owns
   * plane 1 — the two can never double-apply).
   *
   * Every mote drifts on its own sinusoid; alpha falls toward ALPHA_NEAR
   * inside the vision radius (never fully transparent) and sits at ALPHA_FAR
   * beyond it. During the mist-out, a background veil ramps in underneath as
   * the radius closes, ending fully opaque for the cut to REST.
   */
  renderMist(ctx, game) {
    if (game.currentRoom?.zone !== 'gray' || !game.player) return;
    if ((game.player.plane ?? 0) !== 0) return;
    if (!this.mistField) this._buildMistField();

    const radius = this.currentRadiusCells * GRID.CELL_SIZE;
    const px = game.player.position.x + GRID.CELL_SIZE / 2;
    const py = game.player.position.y + GRID.CELL_SIZE / 2;
    const t = this.mistTime;
    const background = ZONES.gray.environmentColors.background || '#050505';

    ctx.save();

    // World-dimming veil (inverse of the glyph thinning), cell-quantized:
    // every grid cell takes a single 10%-step alpha from its center's
    // distance to the player — whole 16px blocks dim as units, so a wall
    // block at the vision edge is uniformly half-faded rather than sliced by
    // a per-pixel circle. No rendered radius, no light — just blocky falloff.
    // Cells are bucketed by alpha so each step is one batched fill.
    if (radius > 0) {
      const CS = GRID.CELL_SIZE;
      const buckets = new Map(); // quantized alpha → flat [col,row,...] list
      for (let row = 0; row < GRID.ROWS; row++) {
        for (let col = 0; col < GRID.COLS; col++) {
          const dist = Math.hypot(col * CS + CS / 2 - px, row * CS + CS / 2 - py);
          const tt = Math.min(1, dist / radius);
          const a = Math.round(VEIL_MAX * tt * tt * 10) / 10;
          if (a < 0.1) continue;
          let cells = buckets.get(a);
          if (!cells) buckets.set(a, cells = []);
          cells.push(col, row);
        }
      }
      ctx.fillStyle = background;
      for (const [a, cells] of buckets) {
        ctx.globalAlpha = a;
        for (let i = 0; i < cells.length; i += 2) {
          ctx.fillRect(cells[i] * CS, cells[i + 1] * CS, CS, CS);
        }
      }
      ctx.globalAlpha = 1;
    }

    // Mist-out veil: the whole world fades out as the radius closes.
    if (this.mistOutActive) {
      const closed = 1 - this.currentRadiusCells / this.baseRadiusCells;
      ctx.globalAlpha = this.mistOutPhase === 'hold' ? 1 : Math.pow(Math.max(0, closed), 1.5);
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, GRID.WIDTH, GRID.HEIGHT);
      ctx.globalAlpha = 1;
    }

    ctx.font = `${Math.round(GRID.CELL_SIZE * MOTE_SIZE)}px 'Unifont', monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (const m of this.mistField) {
      const mx = m.x + Math.sin(t * m.speedX + m.phase) * m.ampX;
      const my = m.y + Math.cos(t * m.speedY + m.phase * 1.7) * m.ampY;

      // Proximity thinning: 0 at the player, 1 at/beyond the vision radius.
      const dist = Math.hypot(mx - px, my - py);
      const near = radius > 0 ? Math.min(1, dist / radius) : 1;
      let alpha = ALPHA_NEAR + (ALPHA_FAR - ALPHA_NEAR) * near * near
        + Math.sin(t * 0.8 + m.phase * 3) * m.breath;

      ctx.globalAlpha = Math.min(0.95, Math.max(0.08, alpha));
      ctx.fillStyle = m.color;
      ctx.fillText('~', mx, my);
    }

    ctx.restore();
  }
}
