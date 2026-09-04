import { GRID } from '../../game/GameConfig.js';

/**
 * ThreeRoomRenderer — the slot cluster's frames, and Death's arrival.
 *
 * Two jobs, both specific to the Three Room and both no-ops anywhere else.
 *
 * The frames: each slot's BackgroundObject is only the content cell. The
 * `[ ]` brackets around it are drawn here, on the foreground, so the frame
 * can go gray and crack without touching collision, interaction, or the
 * background dirty flag. Packed as the neutral script lays them out, the
 * three frames read as one carved object.
 *
 * The arrival: when the door opens, the room goes out in stepped darkness —
 * the game's fade idiom is quantized, never a smooth ramp — until only the
 * player is left lit. Death then stands up out of the dark at the far end of
 * the room and starts walking. Because the darkness is painted over the
 * foreground, the player and Death have to be redrawn above it; that redraw
 * IS the "leaving only the player" the scene is built around.
 */

// Bracket color for an untouched frame — the same warm stone the slot uses.
const FRAME_COLOR = '#887755';
// A refused frame: drained, with the cracks drawn across it.
const FRAME_CRACKED_COLOR = '#5a5a5a';
const CRACK_COLOR = '#3a3a3a';

export class ThreeRoomRenderer {
  render(game) {
    const room = game.currentRoom;
    if (!room?.isThreeRoom) return;

    this._drawFrames(game, room);

    const cin = game.threeRoomSystem.cinematic;
    if (cin && cin.opacity > 0) this._drawArrival(game, room, cin);
  }

  /** The `[ ]` frames around each slot's content cell. */
  _drawFrames(game, room) {
    const ctx = game.renderer.fgCtx;
    const cs = GRID.CELL_SIZE;

    ctx.save();
    ctx.font = `${cs}px 'Unifont', monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (const obj of room.backgroundObjects) {
      if (typeof obj.threeSlot !== 'number' || !obj.threeSlotCell) continue;

      const { col, row } = obj.threeSlotCell;
      const y = row * cs + cs / 2;
      const lx = (col - 1) * cs + cs / 2;
      const rx = (col + 1) * cs + cs / 2;

      ctx.fillStyle = obj.threeCracked ? FRAME_CRACKED_COLOR : FRAME_COLOR;
      ctx.fillText('[', lx, y);
      ctx.fillText(']', rx, y);

      if (obj.threeCracked) this._drawCracks(ctx, col, row, cs);
    }

    ctx.restore();
  }

  /**
   * Cracks across a refused frame. Drawn as strokes rather than a glyph so
   * the wrongly-offered item stays readable underneath — the run has to keep
   * looking at what it put there.
   */
  _drawCracks(ctx, col, row, cs) {
    const x0 = (col - 1) * cs;
    const y0 = row * cs;
    const w = cs * 3;

    ctx.save();
    ctx.strokeStyle = CRACK_COLOR;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x0 + w * 0.18, y0);
    ctx.lineTo(x0 + w * 0.36, y0 + cs * 0.55);
    ctx.lineTo(x0 + w * 0.28, y0 + cs);
    ctx.moveTo(x0 + w * 0.72, y0);
    ctx.lineTo(x0 + w * 0.60, y0 + cs * 0.48);
    ctx.lineTo(x0 + w * 0.80, y0 + cs);
    ctx.stroke();
    ctx.restore();
  }

  /**
   * The staged darkness, with the player and Death painted back on top of it.
   */
  _drawArrival(game, room, cin) {
    const ctx = game.renderer.fgCtx;
    const cs = GRID.CELL_SIZE;

    ctx.save();
    ctx.globalAlpha = cin.opacity;
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, GRID.WIDTH, GRID.HEIGHT);
    ctx.globalAlpha = 1;

    ctx.font = `${cs}px 'Unifont', monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // The player is the one thing the dark does not take.
    const p = game.player;
    if (p) {
      ctx.fillStyle = p.color;
      ctx.fillText(p.char, p.position.x + cs / 2, p.position.y + cs / 2);
    }

    // And then it is not the only thing.
    const death = room.backgroundObjects.find(o => o.isDeath);
    if (death) {
      ctx.fillStyle = death.color;
      ctx.fillText(death.char, death.position.x + cs / 2, death.position.y + cs / 2);
    }

    ctx.restore();
  }
}
