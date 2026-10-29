// Luck — the half-power luck blessing and the per-kill coin chance, read by
// LootSystem (drops) and ExitSystem (lucky exit weighting).
//
// The blessing has two sources: `player.luckBlessed`, a run flag (a raw coin
// in a green well, a fairy fountain), and any weapon in the quick slots whose
// data carries `luckBlessing: true` (the Fortune Dagger, the well's answer to
// a Lucky Coin), which grants it only while held. The full-power tier is the
// Lucky Coin worn as a passive (`player.luckActive`); it is separate.

// Every enemy's independent chance to drop 1 Coin (bug-inbox 2026-09-18). A
// held weapon's `coinDropChance` raises it.
const BASE_COIN_DROP_CHANCE = 0.10;

function heldWeaponData(player) {
  return (player?.quickSlots || []).map(it => it?.data).filter(Boolean);
}

export function hasLuckBlessing(player) {
  return !!player?.luckBlessed || heldWeaponData(player).some(d => d.luckBlessing);
}

export function coinDropChance(player) {
  return heldWeaponData(player).reduce((c, d) => Math.max(c, d.coinDropChance ?? 0), BASE_COIN_DROP_CHANCE);
}
