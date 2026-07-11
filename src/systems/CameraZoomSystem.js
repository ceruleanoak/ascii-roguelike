import { GRID, GAME_STATES, ZOOM } from '../game/GameConfig.js';

/**
 * CameraZoomSystem — combat-proximity camera zoom.
 *
 * Zooms the view to ZOOM.SCALE, pivoted on the player, whenever an enemy is
 * within ZOOM.TRIGGER_RANGE_CELLS of the player during EXPLORE. Once zoomed,
 * stays zoomed until the nearest threat clears the wider
 * ZOOM.RELEASE_RANGE_CELLS (hysteresis, avoids flicker at the boundary).
 * Inside the Maze interior, zoom is forced on permanently regardless of
 * ghost proximity — the corridor is narrow enough that it's always relevant.
 * Runs on the surface and inside every Interior (Hut/Dungeon/Maze) alike, since
 * all of them render onto the same two canvas elements the zoom transform
 * scales (RenderController.applyCameraEffects).
 *
 * Updated unconditionally every frame (not gated inside updateExploreState) so
 * it can ease back to 1.0 if the player leaves EXPLORE or an Interior while
 * zoomed in, rather than leaving REST/NEUTRAL views stuck zoomed.
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
  }

  update(deltaTime) {
    const game = this.game;
    const player = game.player;
    const state = game.stateMachine.getCurrentState();

    let wantsZoom = false;
    let canvasX = GRID.WIDTH / 2;
    let canvasY = GRID.HEIGHT / 2;

    if (state === GAME_STATES.EXPLORE && player) {
      const { entities, gridCols, gridRows } = this._resolveActiveLayer(game, player);

      const offsetX = Math.floor((GRID.WIDTH - gridCols * GRID.CELL_SIZE) / 2);
      const offsetY = Math.floor((GRID.HEIGHT - gridRows * GRID.CELL_SIZE) / 2);
      canvasX = offsetX + player.position.x + player.width / 2;
      canvasY = offsetY + player.position.y + player.height / 2;

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
      wantsZoom = enemyDetected || this._noEnemyElapsedMs < ZOOM.ZOOM_OUT_DELAY_MS;

      // Maze interiors stay permanently zoomed in, regardless of ghost proximity.
      if (player.inMaze) wantsZoom = true;
    } else {
      this._noEnemyElapsedMs = Infinity;
    }

    this._tickZoom(wantsZoom, deltaTime);
    this.originXPercent = (canvasX / GRID.WIDTH) * 100;
    this.originYPercent = (canvasY / GRID.HEIGHT) * 100;
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

  _enemyNearby(player, entities, rangeCells) {
    if (!entities || entities.length === 0) return false;
    const range = rangeCells * GRID.CELL_SIZE;
    const px = player.position.x + player.width / 2;
    const py = player.position.y + player.height / 2;
    return entities.some((e) => {
      if (e.hp !== undefined && e.hp <= 0) return false;
      if (e.data?.pacifist) return false;
      const ex = e.position.x + (e.width ?? GRID.CELL_SIZE) / 2;
      const ey = e.position.y + (e.height ?? GRID.CELL_SIZE) / 2;
      return Math.hypot(ex - px, ey - py) <= range;
    });
  }

  _tickZoom(wantsZoom, deltaTime) {
    const newTarget = wantsZoom ? ZOOM.SCALE : 1;
    if (newTarget !== this.targetZoom) {
      this.startZoom = this.currentZoom;
      this.targetZoom = newTarget;
      this.elapsedMs = 0;
    }

    if (this.currentZoom === this.targetZoom) return;

    // Zoom in and zoom out now share the same eased transition duration
    // (ZOOM.TRANSITION_IN_MS === ZOOM.TRANSITION_OUT_MS).
    const durationMs = this.targetZoom === ZOOM.SCALE
      ? ZOOM.TRANSITION_IN_MS
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
