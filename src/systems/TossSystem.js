import { GAME_STATES } from '../game/GameConfig.js';

/**
 * TossSystem — SHIFT with a consumable armed tosses it
 * (claudedocs/dungeon-boss-green.md "SHIFT Toss"; glossary term pending: Toss).
 *
 * Keys 4-8 arm a consumable slot (existing selectedConsumableIndex). SHIFT
 * press with a slot armed and hands free begins a charge along TrapSystem's
 * drop-throw pipeline — 'drop' mode extended with a source descriptor naming
 * the armed slot; keyup release flings the item as a ground pickup with the
 * standard pickupReadyAt cooldown. Weapon-held SHIFT behavior is untouched:
 * the toss only exists when nothing is held.
 *
 * The release needs no dispatch of its own — a toss charge is a 'drop'-mode
 * trapCharging, so the existing handleShiftRelease drop-release line fires it
 * and TrapSystem routes on the source descriptor. Staging is per-delve effort:
 * tossed items persist on dungeon floors while cached within a delve (the
 * landing path tags hutPlane, which the floor swap caches) and wipe on delve
 * reset — the no-persistence law holds.
 */
export class TossSystem {
  constructor(game) {
    this.game = game;
  }

  // SHIFT press with a consumable armed and nothing held: begin the toss
  // charge. Returns false when there's nothing to toss so the dispatcher can
  // fall through.
  startToss() {
    const game = this.game;
    const player = game.player;
    const state = game.stateMachine.getCurrentState();
    if (state !== GAME_STATES.EXPLORE && state !== GAME_STATES.REST
      && state !== GAME_STATES.NEUTRAL && state !== GAME_STATES.ARCADE_DEMO) return false;
    const slotIndex = player?.selectedConsumableIndex ?? -1;
    if (slotIndex < 0) return false;
    if (!player.equippedConsumables?.[slotIndex]) return false;
    game.trapSystem.startTrapCharge('drop', { kind: 'consumable', slotIndex });
    return true;
  }
}
