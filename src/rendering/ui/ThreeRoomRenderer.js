import { GRID } from '../../game/GameConfig.js';
import { hasTorchLight } from './torchLight.js';
import { shiverOffset } from '../effects/ShiverDraw.js';

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
 * the room, giant, and comes. NeutralRenderer calls render() just before its
 * combat and player Frame Passes, so the darkness covers the room but never
 * the player or their swings — that is the "leaving only the player" the
 * scene is built around, and it lets the player fight back in the dark.
 */

// Bracket color for an untouched frame — the same warm stone the slot uses.
const FRAME_COLOR = '#887755';
// A lit frame. Brighter than the resting stone so the approach reads, but
// drained toward bone rather than warmed — nothing here is being offered.
const FRAME_LIT_COLOR = '#b8b0a0';
// The fill behind a lit slot. Same translucent-swatch idiom as COLORS.HIGHLIGHT
// (`#00ff0066`), in gray: REST says green, the source says nothing good.
const HIGHLIGHT_COLOR = '#9a9a9a55';

// Torchlight shows what the stone is: carrying a light (any Torch or Lantern
// in a quick slot, or a lit Fire Berry — hasTorchLight) colors each frame
// with its slot's REST role color, so the slots read as the same three
// registers as the REST slots without a word. Indexed by `threeSlot`:
// apex weapon red, left armor cyan, right consumable yellow (RestRenderer's
// slot-name colors).
const FRAME_TORCHLIT_COLORS = ['#ff4444', '#00cccc', '#ffff00'];
// A refused frame: drained, with the cracks drawn across it.
const FRAME_CRACKED_COLOR = '#5a5a5a';
const CRACK_COLOR = '#3a3a3a';
// The silhouette that runs ahead of Death's dash: dark, but not lost in the black.
const DEATH_SHADOW_COLOR = '#2a2a2a';

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
    if (cin && cin.opacity > 0) this._drawDarkness(game, cin);
  }

  /** True while the staged darkness is up — what is drawn after it stays lit. */
  isDark(game) {
    return !!game.currentRoom?.isThreeRoom && (game.threeRoomSystem.cinematic?.opacity ?? 0) > 0;
  }

  /**
   * Death, and the shadow running ahead of its dash — drawn after the Death
   * Fight's enemies so nothing stands in front of it.
   */
  renderDeath(game) {
    if (!this.isDark(game)) return;
    const death = game.currentRoom.backgroundObjects.find(o => o.isDeath);
    if (!death) return;
    const shadow = game.deathFightSystem.shadow();
    if (shadow) this._drawDeathGlyph(game, death, shadow, DEATH_SHADOW_COLOR);
    this._drawDeathGlyph(game, death, death.position, death.color);
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
    const shake = shiverOffset();
    const torchlit = hasTorchLight(game);

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
        : torchlit ? FRAME_TORCHLIT_COLORS[obj.threeSlot]
        : isLit ? FRAME_LIT_COLOR
        : FRAME_COLOR;
      ctx.fillText('[', x - cs, y);
      ctx.fillText(']', x + cs, y);

      if (obj.threeCracked) this._drawCracks(ctx, x, y, cs);
    }

    ctx.restore();
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

  /** The staged darkness. The player is the one thing it does not take. */
  _drawDarkness(game, cin) {
    const ctx = game.renderer.fgCtx;
    ctx.save();
    ctx.globalAlpha = cin.opacity;
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, GRID.WIDTH, GRID.HEIGHT);
    ctx.restore();
  }

  /** Death's glyph at its drawScale, centered on `at`'s cell. */
  _drawDeathGlyph(game, death, at, color) {
    const ctx = game.renderer.fgCtx;
    const cs = GRID.CELL_SIZE;
    ctx.save();
    ctx.font = `${cs * (death.drawScale || 1)}px 'Unifont', monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.fillText(death.char, at.x + cs / 2, at.y + cs / 2);
    ctx.restore();
  }
}
