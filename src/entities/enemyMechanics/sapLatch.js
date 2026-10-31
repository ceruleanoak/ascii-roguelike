// A dodge roll and its i-frames slip a sap latch, the way they pass through a
// projectile. A roll that starts once latched breaks it (Enemy.breakSapping).
export function targetSlipsLatch(target) {
  return target?.dodgeRoll?.active === true
    || target?.continuousRollActive === true
    || (target?.invulnerabilityTimer ?? 0) > 0;
}
