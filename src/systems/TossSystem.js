import { GAME_STATES } from '../game/GameConfig.js';

/**
 * TossSystem — SHIFT with a consumable armed tosses it
 * (claudedocs/dungeon-boss-green.md "SHIFT Toss"; glossary term pending: Toss).
 *
 * Keys 4-8 arm a consumable slot (existing selectedConsumableIndex). SHIFT
 * press with a slot armed and hands free begins a charge along TrapSystem's
 * drop-throw pipeline — 'drop' mode extended with a source descriptor naming
 * the armed slot; keyup release flings the item as a ground pickup with the
 * standard pickupReadyAt cooldown. An armed slot outranks the held weapon —
 * arming a consumable already takes SPACE from it — so SHIFT drops the held
 * item only when no consumable is armed.
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

  // The SHIFT press in EXPLORE/REST once every menu/interior claim has passed.
  // A consumable armed (keys 4-8) is tossed: charge on hold, release flings it
  // as a ground pickup. Arming a consumable already takes SPACE from the held
  // weapon, so it takes SHIFT too — otherwise a held weapon always won and
  // bread could never be tossed to crows. With nothing armed, SHIFT throws to
  // drop the held item: it leaves the slot and lands as a pickup; weapons may
  // damage en route, traps do NOT arm (deploy is SPACE). Release needs no
  // dispatch of its own — both are 'drop'-mode trapCharging, fired by
  // Game.handleShiftRelease.
  handleShiftPress() {
    if (this.startToss()) return;
    if (this.game.player?.heldItem) this.game.trapSystem.startTrapCharge('drop');
  }

  // SHIFT press with a consumable armed: begin the toss
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
