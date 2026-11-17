import { inSamePlane } from '../../systems/PlaneSystem.js';
import { glyphsTouch } from './glyphContact.js';

// Merge: two free Slimes whose glyphs touch become one, the way a Giant
// Slime's split children re-merge with it (ReformMechanic). The Slime running
// its update keeps going and takes the other's HP and max HP into its own;
// the other is gone, reabsorbed rather than killed, so it drops nothing.
// Opt-in per Enemy through `data.mergeOnContact`, and only with the same
// kind of Enemy.
//
// A Giant Slime's split child (parentRef set) is excluded on both sides: it
// owes its HP to the boss, and ReformMechanic returns it there. Once the boss
// dies the child is free and merges like any other Slime. Fresh iframes (a
// child just launched out of the boss, a Slime just struck) hold a merge off,
// so the Slime the player is fighting doesn't vanish mid-blow.

function canMerge(enemy) {
  return enemy.hp > 0
    && !enemy.isDying
    && !enemy.absorbedByParent
    && !enemy.parentRef
    && !(enemy.invulnerabilityTimer > 0)
    && !enemy.isFrozen()
    && !enemy.carriedBySpear;
}

export const MergeMechanic = {
  isEnabled(enemy) {
    return enemy.data.mergeOnContact === true;
  },

  update(enemy) {
    if (!this.isEnabled(enemy) || !canMerge(enemy)) return;
    const others = enemy.game?._activeEnemies?.() ?? [];
    for (const other of others) {
      if (other === enemy || other.char !== enemy.char) continue;
      if (!this.isEnabled(other) || !canMerge(other)) continue;
      if (!inSamePlane(enemy, other) || !glyphsTouch(enemy, other)) continue;
      enemy.hp += other.hp;
      enemy.maxHp += other.maxHp;
      other.absorbedByParent = true; // reabsorbed, not killed: no loot or mana drop
      other.hp = 0;
      enemy.game.audioSystem?.playSFX('goo_reabsorb');
      return; // one merge a frame
    }
  }
};
