import { GRID, GAME_STATES, ZOOM } from '../game/GameConfig.js';

/**
 * CameraZoomSystem — combat-proximity camera zoom.
 *
 * Zooms the view to ZOOM.SCALE, framed on the player, whenever an aggro'd
 * enemy is within ZOOM.TRIGGER_RANGE_CELLS of the player during EXPLORE —
 * aggro, not mere proximity: an enemy currently fleeing (State Flee/Lookback
 * — Rat post-steal, Trap Goblin, a still-growing Bomb) is a coward, not a
 * threat, and wandering close to one shouldn't zoom the camera in. Once zoomed,
 * stays zoomed until the nearest threat clears the wider
 * ZOOM.RELEASE_RANGE_CELLS (hysteresis, avoids flicker at the boundary).
 * Inside the Maze interior, zoom is forced on permanently regardless of
 * ghost proximity — the corridor is narrow enough that it's always relevant.
 * On the surface with no weapon equipped, the same trigger instead targets
 * ZOOM.HALF_SCALE — still some tension from the nearby threat, but not the
 * full commit of an armed engagement; Interiors are exempt from this
 * downgrade since their zoom isn't threat-driven to begin with.
 *
 * Framing keeps the player centered by default, but clamps the on-screen
 * center so the fully-zoomed-in viewport never pans past the current
 * room/interior's own rendered rect — which already includes its
 * border-wall ring, since those walls occupy the outermost cell of that same
 * grid (RoomGenerator's border-wall pass). The player only ever ends up
 * off-center when the clamp is actively holding the frame against a wall.
 * The clamp is always solved against ZOOM.SCALE (the fully-zoomed-in scale),
 * not the live easing value the zoom-in/out transition is currently at —
 * that pivot is provably still in-bounds at every lesser scale too (see
 * _computeClampedOrigin), so the pivot stays put and only the scale eases,
 * instead of the pivot itself snapping/sliding as the transition plays out.
 * Runs on the surface and inside every Interior (Hut/Dungeon/Maze) alike, since
 * all of them render onto the same two canvas elements the zoom transform
 * scales (RenderController.applyCameraEffects).
 *
 * Updated unconditionally every frame (not gated inside updateExploreState) so
 * it can ease back to 1.0 if the player leaves EXPLORE or an Interior while
 * zoomed in, rather than leaving REST/NEUTRAL views stuck zoomed. The pivot
 * origin is only recomputed while actively tracking the player (EXPLORE/
 * Interior); on leaving that state it holds its last value instead of
 * snapping to canvas-center, so a still-elevated zoom eases from the pivot
 * it was actually zoomed on rather than jump-cutting the framing on the same
 * frame the state changes. Player death (GAME_OVER) additionally uses a
 * much shorter transition (ZOOM.TRANSITION_DEATH_MS) than a normal combat
 * disengage — the death screen needs to read at 1.0 quickly, not ease out
 * at the same leisurely pace as walking away from a fight.
 */
export class CameraZoomSystem {
  constructor(game) {
    this.game = game;
    this.currentZoom = 1;
    this.startZoom = 1;
    this.targetZoom = 1;
    this.elapsedMs = 0;
    this.originXPercent = 50;
    this.originYPercent = 50;
    this._noEnemyElapsedMs = Infinity;
    this._lastState = null;
  }

  update(deltaTime) {
    const game = this.game;
    const player = game.player;
    const state = game.stateMachine.getCurrentState();

    // Freshly entering GAME_OVER forces a rapid restart of the zoom-out even
    // if the target was already 1 (e.g. death interrupts a normal in-progress
    // disengage) — without this, the leftover elapsed time from the slower
    // transition would carry over and mis-time the rapid one.
    const justDied = state === GAME_STATES.GAME_OVER && this._lastState !== GAME_STATES.GAME_OVER;
    this._lastState = state;

    let desiredScale = 1;

    if (state === GAME_STATES.EXPLORE && player) {
      const { entities, gridCols, gridRows } = this._resolveActiveLayer(game, player);

      const offsetX = Math.floor((GRID.WIDTH - gridCols * GRID.CELL_SIZE) / 2);
      const offsetY = Math.floor((GRID.HEIGHT - gridRows * GRID.CELL_SIZE) / 2);
      const canvasX = offsetX + player.position.x + player.width / 2;
      const canvasY = offsetY + player.position.y + player.height / 2;
      const desiredXPercent = (canvasX / GRID.WIDTH) * 100;
      const desiredYPercent = (canvasY / GRID.HEIGHT) * 100;

      // Clamp bounds are the room/interior's own rendered rect (in canvas
      // percent) — this already includes the border-wall ring at its edges,
      // so the frame is free to push all the way up to the wall rather than
      // stopping short of it.
      const roomLeftPercent = (offsetX / GRID.WIDTH) * 100;
      const roomRightPercent = ((offsetX + gridCols * GRID.CELL_SIZE) / GRID.WIDTH) * 100;
      const roomTopPercent = (offsetY / GRID.HEIGHT) * 100;
      const roomBottomPercent = ((offsetY + gridRows * GRID.CELL_SIZE) / GRID.HEIGHT) * 100;

      // Clamp against the fully-zoomed-in scale (ZOOM.SCALE), not the live
      // easing value from _tickZoom — that's what "lock to the edge on full
      // zoom-in" actually means, and it's what keeps the pivot stable across
      // the whole transition instead of recomputing a shrinking/growing clamp
      // window every frame. A pivot solved against a wider (less-zoomed)
      // window would still be valid at full zoom, but a pivot solved against
      // the fully-zoomed window is provably still in-bounds at every lesser
      // scale too (the visible window only ever narrows as scale grows), so
      // fixing on ZOOM.SCALE is the one choice that's smooth at every step:
      // the pivot barely moves once computed, and only the scale eases.
      this.originXPercent = this._computeClampedOrigin(desiredXPercent, roomLeftPercent, roomRightPercent, ZOOM.SCALE);
      this.originYPercent = this._computeClampedOrigin(desiredYPercent, roomTopPercent, roomBottomPercent, ZOOM.SCALE);

      // Hysteresis: once zoomed in, require the enemy to clear the wider
      // release range before we zoom back out, so it doesn't flicker in/out
      // as an enemy hovers right at the trigger boundary.
      const rangeCells = this.targetZoom !== 1
        ? ZOOM.RELEASE_RANGE_CELLS
        : ZOOM.TRIGGER_RANGE_CELLS;
      const enemyDetected = this._enemyNearby(player, entities, rangeCells);

      // Extra hold: once no enemy is detected, keep the zoomed frame for
      // ZOOM.ZOOM_OUT_DELAY_MS before actually releasing, so a momentary
      // gap in detection doesn't snap the camera out and back in.
      if (enemyDetected) {
        this._noEnemyElapsedMs = 0;
      } else {
        this._noEnemyElapsedMs += deltaTime * 1000;
      }
      const wantsZoom = enemyDetected || this._noEnemyElapsedMs < ZOOM.ZOOM_OUT_DELAY_MS;
      desiredScale = wantsZoom ? ZOOM.SCALE : 1;

      // Maze interiors stay permanently zoomed in, regardless of ghost proximity.
      if (player.inMaze) desiredScale = ZOOM.SCALE;

      // On the surface with no weapon equipped, an aggro'd enemy nearby still
      // reads as some tension, but not a full combat commit — half zoom
      // instead of the full scale, rather than suppressing the zoom outright.
      // Interiors (Maze/Hut/Dungeon) are exempt from this downgrade — their
      // zoom isn't threat-driven to begin with.
      if (!player.heldItem && !player.inMaze && !player.inHut && !player.inDungeon) {
        desiredScale = desiredScale === ZOOM.SCALE ? ZOOM.HALF_SCALE : 1;
      }

      // Centipede miniboss: the arena is large and densely packed with fixed
      // obstacles, and the encounter can span many on-screen chain segments
      // at once — zooming in would clip parts of the chain off-screen
      // (isEntityOnScreen gates committed attacks) and shrink the player's
      // view of the obstacle field the chain is bouncing around in.
      if (game.currentRoom?.centipedeChains?.length) desiredScale = 1;
    } else {
      this._noEnemyElapsedMs = Infinity;
      // Origin deliberately left untouched here — see class doc comment.
    }

    this._tickZoom(desiredScale, deltaTime, state, justDied);
  }

  /** Live threat list + local grid size for the player's current layer. */
  _resolveActiveLayer(game, player) {
    if (player.inMaze && game.mazeInterior) {
      return {
        entities: game.mazeInterior.ghosts,
        gridCols: game.mazeInterior.gridCols,
        gridRows: game.mazeInterior.gridRows
      };
    }
    if ((player.inHut || player.inDungeon) && game.activeFloor) {
      return {
        entities: game.activeFloor.enemies,
        gridCols: game.activeFloor.gridCols,
        gridRows: game.activeFloor.gridRows
      };
    }
    return {
      entities: game.currentRoom ? game.currentRoom.enemies : [],
      gridCols: GRID.COLS,
      gridRows: GRID.ROWS
    };
  }

  // Keep-centered-with-edge-lock framing. `desiredCenterPercent` is where the
  // player sits in canvas-percent (what the frame would center on with no
  // constraint); `roomStartPercent`/`roomEndPercent` bound the room/interior's
  // own rendered rect on this axis (inclusive of its border-wall ring — see
  // class doc comment); `scale` is always called with ZOOM.SCALE (the target
  // fully-zoomed-in scale), never the live easing value — see call site.
  // Returns a CSS transform-origin percent: the point that stays pinned
  // under `scale()` so the clamped center lands at screen-center (50%).
  //
  // Derivation: under `transform-origin: O; scale(s)`, a canvas point at
  // fraction f is drawn at screen fraction O + (f - O) * s. Solving for the O
  // that puts a target fraction C at screen-center (50) gives
  // O = (C*s - 50) / (s - 1). At s == 1 the transform is the identity and O
  // is irrelevant, so it's returned as-is to avoid the s==1 singularity.
  //
  // Why solving at ZOOM.SCALE stays in-bounds at every lesser scale too:
  // for a fixed O, the visible window at an arbitrary actual scale a is
  // [O*(1 - 1/a), O + (100 - O)/a]. Since O and (100 - O) are both >= 0 and
  // 1/a <= 1 for every a >= 1, the left edge is always >= 0 and the right
  // edge is always <= 100 — true for any a, not just a == ZOOM.SCALE. So a
  // pivot that's correctly clamped for the tightest (most-zoomed-in) window
  // is automatically still fully in-bounds for every wider window the
  // zoom-in/out transition passes through on the way there.
  _computeClampedOrigin(desiredCenterPercent, roomStartPercent, roomEndPercent, scale) {
    const halfWindowPercent = 50 / scale;
    const lowerBound = roomStartPercent + halfWindowPercent;
    const upperBound = roomEndPercent - halfWindowPercent;
    // Room narrower than the zoom window on this axis (small interior at
    // high zoom): centering is impossible either way, so just hold the
    // room's own center rather than let the bounds invert.
    const clampedCenter = lowerBound > upperBound
      ? (roomStartPercent + roomEndPercent) / 2
      : Math.min(upperBound, Math.max(lowerBound, desiredCenterPercent));

    if (Math.abs(scale - 1) < 1e-6) return clampedCenter;
    return (clampedCenter * scale - 50) / (scale - 1);
  }

  _enemyNearby(player, entities, rangeCells) {
    if (!entities || entities.length === 0) return false;
    const range = rangeCells * GRID.CELL_SIZE;
    const px = player.position.x + player.width / 2;
    const py = player.position.y + player.height / 2;
    return entities.some((e) => {
      if (e.hp !== undefined && e.hp <= 0) return false;
      if (e.data?.pacifist) return false;
      // Cowards: an enemy currently running away (State Flee) or glancing
      // back mid-flight (State Lookback) is disengaging, not aggro — it
      // doesn't warrant the combat-tension zoom just because the player
      // happens to be nearby. Entities without a spine (e.g. Maze ghosts)
      // fall through unaffected via the optional chain.
      const spineState = e.stateMachine?.current;
      if (spineState === 'flee' || spineState === 'lookback') return false;
      const ex = e.position.x + (e.width ?? GRID.CELL_SIZE) / 2;
      const ey = e.position.y + (e.height ?? GRID.CELL_SIZE) / 2;
      return Math.hypot(ex - px, ey - py) <= range;
    });
  }

  _tickZoom(desiredScale, deltaTime, state, forceRestart) {
    if (desiredScale !== this.targetZoom || forceRestart) {
      this.startZoom = this.currentZoom;
      this.targetZoom = desiredScale;
      this.elapsedMs = 0;
    }

    if (this.currentZoom === this.targetZoom) return;

    // Zoom-in and a normal zoom-out share the same eased duration. Player
    // death is a rapid correction instead — see class doc comment. Compared
    // against startZoom (not a fixed ZOOM.SCALE check) so this still picks
    // the right direction now that the target can also land at ZOOM.HALF_SCALE
    // (unequipped surface exploration) rather than only 1 or ZOOM.SCALE.
    const zoomingIn = this.targetZoom > this.startZoom;
    const durationMs = zoomingIn
      ? ZOOM.TRANSITION_IN_MS
      : state === GAME_STATES.GAME_OVER
        ? ZOOM.TRANSITION_DEATH_MS
        : ZOOM.TRANSITION_OUT_MS;

    this.elapsedMs = Math.min(durationMs, this.elapsedMs + deltaTime * 1000);
    const t = this.elapsedMs / durationMs;
    const eased = cubicBezierEase(t);
    this.currentZoom = this.startZoom + (this.targetZoom - this.startZoom) * eased;
  }

  getScale() {
    return this.currentZoom;
  }

  getOriginPercent() {
    return { x: this.originXPercent, y: this.originYPercent };
  }

  // Whether `entity` falls inside the visible canvas under the current zoom
  // transform. At scale 1 (no zoom) everything is on-screen by definition.
  // Same projection OffscreenEnemyIndicators uses to place its edge arrows —
  // kept here as the single source of truth so combat code (committed
  // windups/telegraphs that must not fire on an enemy the player can't see)
  // and that renderer agree on what "visible" means.
  isEntityOnScreen(entity) {
    const scale = this.currentZoom;
    if (scale <= 1) return true;
    const ox = (this.originXPercent / 100) * GRID.WIDTH;
    const oy = (this.originYPercent / 100) * GRID.HEIGHT;
    const ex = entity.position.x + (entity.width ?? GRID.CELL_SIZE) / 2;
    const ey = entity.position.y + (entity.height ?? GRID.CELL_SIZE) / 2;
    const screenX = ox + (ex - ox) * scale;
    const screenY = oy + (ey - oy) * scale;
    return screenX >= 0 && screenX <= GRID.WIDTH && screenY >= 0 && screenY <= GRID.HEIGHT;
  }
}

// Standard CSS "ease-in-out" cubic bezier — control points (0.42, 0), (0.58, 1).
// Solved via Newton-Raphson on the bezier's x(t) so the eased value is driven by
// true bezier progress rather than a polynomial ease approximation.
const BEZIER_X1 = 0.42, BEZIER_Y1 = 0;
const BEZIER_X2 = 0.58, BEZIER_Y2 = 1;

function bezierComponent(t, p1, p2) {
  const mt = 1 - t;
  return 3 * mt * mt * t * p1 + 3 * mt * t * t * p2 + t * t * t;
}

function bezierComponentDerivative(t, p1, p2) {
  const mt = 1 - t;
  return 3 * mt * mt * p1 + 6 * mt * t * (p2 - p1) + 3 * t * t * (1 - p2);
}

function solveBezierT(x) {
  let t = x;
  for (let i = 0; i < 8; i++) {
    const currentX = bezierComponent(t, BEZIER_X1, BEZIER_X2) - x;
    const derivative = bezierComponentDerivative(t, BEZIER_X1, BEZIER_X2);
    if (Math.abs(derivative) < 1e-6) break;
    t -= currentX / derivative;
    t = Math.min(1, Math.max(0, t));
  }
  return t;
}

function cubicBezierEase(x) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const t = solveBezierT(x);
  return bezierComponent(t, BEZIER_Y1, BEZIER_Y2);
}
