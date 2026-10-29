import { inSamePlane } from './PlaneSystem.js';

/** What an NPC without its own refusal line says to PERSUADE. */
const DEFAULT_REFUSAL = 'I HAVE NOTHING.';

/**
 * InfluenceSystem — the Influence Wish Spells, which act on the nearest
 * speaker (claudedocs/three-voice-plan.md §8).
 *
 * PERSUADE: the NPC answers before any wish is asked for. What it does is data
 * on the NPC (NeutralCharacter `persuadeOwner` / `persuadeRefusal`), carried
 * out by the NPC's owning system:
 *   - `persuadeOwner` names a game system implementing
 *     `persuadeRefusal(npc)` → string|null (null = accepts) and
 *     `persuade(npc)`, which runs that NPC's transaction without its cost.
 *   - Without an owner the NPC refuses with `persuadeRefusal`.
 * A refusal spends nothing. Accepted, the wish question follows; YES spends
 * the wish and runs persuade().
 *
 * Stateless: the speaker is found again on every call.
 */
export class InfluenceSystem {
  constructor(game) {
    this.game = game;
  }

  /**
   * The nearest NPC in talking range on the player's plane — the room's or
   * floor's NPCs, and Charon at REST's north exit.
   */
  nearestNpc() {
    const game = this.game;
    const player = game.player;
    if (!player) return null;
    const npcs = [...game.interiorManager.activeNpcs()];
    if (game.charon?.npc) npcs.push(game.charon.npc);

    let nearest = null;
    let nearestDist = Infinity;
    for (const npc of npcs) {
      if (!npc.isInRange?.(player) || !inSamePlane(npc, player)) continue;
      const dist = Math.hypot(player.position.x - npc.position.x, player.position.y - npc.position.y);
      if (dist < nearestDist) {
        nearest = npc;
        nearestDist = dist;
      }
    }
    return nearest;
  }

  _persuadeOwner(npc) {
    return npc?.persuadeOwner ? this.game[npc.persuadeOwner] : null;
  }

  /** PERSUADE's refusal, or null when the nearest NPC accepts. */
  persuadeRefusal() {
    const npc = this.nearestNpc();
    if (!npc) return 'NO ONE.';
    const owner = this._persuadeOwner(npc);
    if (!owner) return npc.persuadeRefusal ?? DEFAULT_REFUSAL;
    return owner.persuadeRefusal(npc);
  }

  /** The wish was spent: the nearest NPC's transaction happens without its cost. */
  persuade() {
    const npc = this.nearestNpc();
    const owner = this._persuadeOwner(npc);
    if (owner && !owner.persuadeRefusal(npc)) owner.persuade(npc);
  }
}
