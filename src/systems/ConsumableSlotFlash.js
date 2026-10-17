// ConsumableSlotFlash — ticks the HUD flash/blink timers for consumable slots.
// The timers themselves live on InventorySystem (the HUD reads them there);
// this is only the per-frame countdown, called from InventorySystem.update().

/**
 * Tick down HUD flash/blink timers for consumable slot.
 * Returns true while a blink is in progress (caller should updateUI this frame).
 */
export function tickConsumableFlash(inv, deltaTime) {
  // Legacy flash timer (color-only flash, used by windup completion)
  if (inv.consumableFlashTimer > 0) {
    inv.consumableFlashTimer = Math.max(0, inv.consumableFlashTimer - deltaTime);
    if (inv.consumableFlashTimer === 0) {
      inv.consumableFlashSlot = -1;
    }
  }

  // Block-blink animation: 4 half-cycles at 0.1s each = 0.4s total
  if (inv.consumableBlinkTimer > 0) {
    inv.consumableBlinkTimer = Math.max(0, inv.consumableBlinkTimer - deltaTime);
    inv.consumableBlinkPhase -= deltaTime;
    if (inv.consumableBlinkPhase <= 0) {
      // Toggle solid block vs normal char
      inv.consumableBlinkShowBlock = !inv.consumableBlinkShowBlock;
      inv.consumableBlinkPhase = 0.1; // 100ms per half-cycle
    }
    if (inv.consumableBlinkTimer === 0) {
      inv.consumableBlinkSlot = -1;
      inv.consumableBlinkShowBlock = false;
    }
    return true; // HUD needs refresh this frame
  }

  // Tick active-effect timers (drive slow blink in top bar while effect lasts)
  let anyActive = false;
  for (let i = 0; i < inv.activeEffectTimers.length; i++) {
    if (inv.activeEffectTimers[i] > 0) {
      inv.activeEffectTimers[i] = Math.max(0, inv.activeEffectTimers[i] - deltaTime);
      anyActive = true;
    }
  }
  return anyActive;
}
