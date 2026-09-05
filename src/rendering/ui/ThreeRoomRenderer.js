import { GRID } from '../../game/GameConfig.js';

/**
 * ThreeRoomRenderer — the slot cluster's frames, and Death's arrival.
 *
 * Two jobs, both specific to the Three Room and both no-ops anywhere else.
 *
 * The frames: each slot's BackgroundObject is only the content cell. The
 * `[ ]` brackets around it are drawn here, on the foreground, so the frame
 * can highlight, shake and crack without touching collision, interaction, or
 * the background dirty flag. Packed as the neutral script lays them out, the
 * three frames read as one carved object.
 *
 * The approach: standing close enough to place lights the slot the way REST
 * lights a crafting or equipment slot — the player already knows that
 * language, so it needs no teaching. What it does NOT do is reassure. REST's
 * highlight is the interface's own green; this one is gray, and the frame
 * shivers while it is lit. The player is being told the thing is ready for
 * them, in the tone of something that has been waiting.
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
// A lit frame. Brighter than the resting stone so the approach reads, but
// drained toward bone rather than warmed — nothing here is being offered.
const FRAME_LIT_COLOR = '#b8b0a0';
// The fill behind a lit slot. Same translucent-swatch idiom as COLORS.HIGHLIGHT
// (`#00ff0066`), in gray: REST says green, the source says nothing good.
const HIGHLIGHT_COLOR = '#9a9a9a55';

// The shiver on a lit frame. Two incommensurate sines per axis rather than one
// — a single sine reads as a decorative wobble, where a beat that never quite
// repeats reads as something not holding still. Roughly a pixel and a half at
// full swing, which at a 16px cell is a tremor and not a bounce.
const SHAKE_X = [{ rate: 37.1, amp: 0.9 }, { rate: 23.7, amp: 0.6 }];
const SHAKE_Y = [{ rate: 41.3, amp: 0.7 }, { rate: 19.1, amp: 0.5 }];
// A refused frame: drained, with the cracks drawn across it.
const FRAME_CRACKED_COLOR = '#5a5a5a';
const CRACK_COLOR = '#3a3a3a';

export class ThreeRoomRenderer {
  render(game) {
    const room = game.currentRoom;
    if (!room?.isThreeRoom) return;

    // The slot SPACE would act on right now — the same scan the keypress runs,
    // so the light and the action can never disagree about what is in reach.
    // A filled slot is skipped: placement is one-shot, and a lit frame that
    // refuses the press would be a lie.
    const nearby = game.findNearbyBackgroundObject();
    const lit = (typeof nearby?.threeSlot === 'number' && !nearby.threeFilled) ? nearby : null;

    this._drawFrames(game, room, lit);

    const cin = game.threeRoomSystem.cinematic;
    if (cin && cin.opacity > 0) this._drawArrival(game, room, cin);
  }

  /**
   * The `[ ]` frames around each slot's content cell, plus the lit slot's
   * highlight and shiver.
   *
   * Geometry comes off each slot's pixel position rather than a cell, because
   * the cluster is laid out off-grid (see the threeRoom script) so its two
   * rows can share one midline. A lit frame is drawn at a jittered offset; the
   * content cell underneath belongs to the cached background layer and cannot
   * shake with it, which costs nothing — only an EMPTY slot is ever lit, and
   * an empty slot's content is a space.
   */
  _drawFrames(game, room, lit) {
    const ctx = game.renderer.fgCtx;
    const cs = GRID.CELL_SIZE;
    const shake = this._shake();

    ctx.save();
    ctx.font = `${cs}px 'Unifont', monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (const obj of room.backgroundObjects) {
      if (typeof obj.threeSlot !== 'number') continue;

      const isLit = obj === lit;
      const x = obj.position.x + cs / 2 + (isLit ? shake.x : 0);
      const y = obj.position.y + cs / 2 + (isLit ? shake.y : 0);

      if (isLit) {
        ctx.fillStyle = HIGHLIGHT_COLOR;
        ctx.fillRect(x - cs / 2, y - cs / 2, cs, cs);
      }

      ctx.fillStyle = obj.threeCracked ? FRAME_CRACKED_COLOR
        : isLit ? FRAME_LIT_COLOR
        : FRAME_COLOR;
      ctx.fillText('[', x - cs, y);
      ctx.fillText(']', x + cs, y);

      if (obj.threeCracked) this._drawCracks(ctx, x, y, cs);
    }

    ctx.restore();
  }

  /** The lit frame's offset this instant. See SHAKE_X / SHAKE_Y. */
  _shake() {
    const t = performance.now() / 1000;
    const sum = (terms) => terms.reduce((a, s) => a + Math.sin(t * s.rate) * s.amp, 0);
    return { x: sum(SHAKE_X), y: sum(SHAKE_Y) };
  }

  /**
   * Cracks across a refused frame. Drawn as strokes rather than a glyph so
   * the wrongly-offered item stays readable underneath — the run has to keep
   * looking at what it put there.
   */
  _drawCracks(ctx, x, y, cs) {
    const x0 = x - cs * 1.5;
    const y0 = y - cs / 2;
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
