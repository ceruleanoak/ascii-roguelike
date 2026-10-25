/**
 * True while the surface render is concealing `enemy` as something other than
 * an enemy: fully faded into tall grass (renderEnemy sets _concealmentAlpha),
 * a shell-camouflaged turtle passing for a rock, a mimic still passing for an
 * item, or a hidden sniper. Anything that tells the player about enemies
 * (offscreen arrows, LOOKHERE) skips these, so it never spoils a disguise.
 */
export function isConcealedEnemy(enemy) {
  if (enemy._concealmentAlpha !== undefined && enemy._concealmentAlpha < 0.005) return true;
  if (enemy.data?.shellCamouflage && enemy.inShellForm) return true;
  if (enemy.data?.mimicMechanic?.enabled && !enemy.mimicRevealed) return true;
  return !!enemy.sniperHidden;
}
