// Held Glyph — the newly held weapon's glyph over the player for a moment, the
// equip read the Armed Glyph gives a consumable. Armed by watching
// player.heldItem rather than by each of the many paths that change it (slot
// keys, pickup, swaps, a slot emptying), so a new path needs no wiring.
//
// Anything else drawn from the held weapon takes over: a windup, a charge, a
// trap charge-up or the cooldown of a swing ends it, and an Armed Glyph, which
// hovers at the same spot, hides it (drawHeldGlyph).

const HELD_GLYPH_SECONDS = 0.6;

export class HeldGlyphSystem {
  constructor(game) {
    this.game = game;
    this.item = null;  // the item last seen in hand
    this.timer = 0;    // seconds left to show it
  }

  /** The item to show right now, or null. */
  shown() {
    return this.timer > 0 ? this.item : null;
  }

  // Called every frame from updatePlayerMechanics (all states).
  update(deltaTime) {
    const { game } = this;
    const held = game.player.heldItem ?? null;
    if (held !== this.item) {
      this.timer = held ? HELD_GLYPH_SECONDS : 0;
      this.item = held;
    }
    if (this.timer <= 0) return;
    this.timer -= deltaTime;
    if (held.windupActive || held.isCharging || held.cooldownTimer > 0 || game.trapCharging) {
      this.timer = 0;
    }
  }
}
