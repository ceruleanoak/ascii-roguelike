/**
 * EquipmentSlots - Renders equipment slots in REST state
 *
 * Responsibilities:
 * - Display three numbered item chests (one per quick slot) — active chest drawn
 *   bright by RestRenderer on the foreground layer each frame
 * - Display armor slot (cyan) with equipped armor
 * - Display five consumable slots (slot 3 is locked/unlockable)
 *
 * Called every frame from RestRenderer (not gated by backgroundDirty) so the
 * blink animation can update. The background layer isn't cleared between
 * frames, so every slot goes through drawSlot, which erases its three cells
 * before drawing each glyph once (bug #472).
 */

import { EQUIPMENT } from '../../game/GameConfig.js';
import { oilAppliesTo } from '../../entities/Item.js';

export class EquipmentSlots {
  constructor(renderer) {
    this.renderer = renderer;
  }

  // One `[c]` slot centered on x: clear the cells, then draw each glyph once.
  drawSlot(x, y, char, bracketColor, charColor = bracketColor) {
    for (let dx = -1; dx <= 1; dx++) this.renderer.clearCell(x + dx, y);
    this.renderer.drawCell(x - 1, y, '[', bracketColor);
    this.renderer.drawCell(x,     y, char, charColor);
    this.renderer.drawCell(x + 1, y, ']', bracketColor);
  }

  render(game) {
    const DIM_AMBER = '#ff4444';
    const BRIGHT_AMBER = '#ffaa44';
    const CYAN = '#00cccc';
    const BRIGHT_CYAN = '#aaffff';
    const YELLOW = '#ffff00';
    const DARK_YELLOW = '#665500';
    const LOCKED = '#333333';

    const now = performance.now();

    // Empty slots that have at least one matching item in inventory blink to invite
    // the player to equip. True on/off cadence (50/50) reads as a blink, not a pulse.
    // Per-slot phase offset keeps each slot independent so the row reads as discrete
    // invitations rather than a group flash.
    const blinkOn = (offsetMs) => ((now + offsetMs) % 800) < 400;

    // Draw 3 item chests in red. Empty slots blink to bright amber when there
    // are weapons available in the chest to equip; otherwise stay solid red.
    const chestHasItems = game.inventorySystem.itemChest.length > 0;
    const chestYs = [EQUIPMENT.CHEST1_Y, EQUIPMENT.CHEST2_Y, EQUIPMENT.CHEST3_Y];
    const weaponBlinkOffsets = [0, 220, 440];
    for (let i = 0; i < 3; i++) {
      const y = chestYs[i];
      const isDestroyed = game.player?.destroyedSlots?.[i];

      if (isDestroyed) {
        // Destroyed slots are invisible in REST mode — skip rendering entirely
        continue;
      }

      const item = game.player ? game.player.quickSlots[i] : null;
      const char = item ? item.char : String(i + 1);

      const shouldBlink = !item && chestHasItems;
      const bracketColor = (shouldBlink && blinkOn(weaponBlinkOffsets[i]))
        ? BRIGHT_AMBER
        : DIM_AMBER;

      this.drawSlot(EQUIPMENT.CHEST_X, y, char, bracketColor, item ? (item.color || DIM_AMBER) : bracketColor);
    }

    // Draw armor slot — cyan
    const armorEquipped = game.inventorySystem.equippedArmor;
    const armorAvailable = (game.inventorySystem.armorInventory?.length ?? 0) > 0;
    const armorBlink = !armorEquipped && armorAvailable;
    const armorBracketColor = (armorBlink && blinkOn(110)) ? BRIGHT_CYAN : CYAN;

    this.drawSlot(EQUIPMENT.ARMOR_X, EQUIPMENT.ARMOR_Y,
      armorEquipped ? armorEquipped.char : ' ', armorBracketColor,
      armorEquipped ? armorEquipped.color : armorBracketColor);

    // Draw consumable slots 1-5 (slots beyond maxSlots are locked)
    const consumableXs = [
      EQUIPMENT.CONSUMABLE1_X,
      EQUIPMENT.CONSUMABLE2_X,
      EQUIPMENT.CONSUMABLE3_X,
      EQUIPMENT.CONSUMABLE4_X,
      EQUIPMENT.CONSUMABLE5_X
    ];
    const consumableYs = [
      EQUIPMENT.CONSUMABLE1_Y,
      EQUIPMENT.CONSUMABLE2_Y,
      EQUIPMENT.CONSUMABLE3_Y,
      EQUIPMENT.CONSUMABLE4_Y,
      EQUIPMENT.CONSUMABLE5_Y
    ];

    const maxSlots = game.inventorySystem?.maxConsumableSlots ?? 2;
    const consumableAvailable = (game.inventorySystem.consumableInventory?.length ?? 0) > 0;
    const consumableBlinkOffsets = [60, 200, 340, 480, 620];
    const meter = game.player?.magicMeter;

    for (let i = 0; i < 5; i++) {
      const x = consumableXs[i];
      const y = consumableYs[i];
      const isLocked = (i >= maxSlots);
      const equipped = game.inventorySystem.equippedConsumables[i];
      const isMagicMeter = meter?.active && meter.slots?.includes(i);

      if (isMagicMeter) {
        // Magic-meter slot: violet brackets framing a fill block. Fill is
        // this slot's share of the cumulative pool (front slots fill first,
        // back slots drain first) — see MagicSystem.getSlotFill.
        const fill = game.magicSystem.getSlotFill(game.player, i);
        const fillColor = _manaColor(fill.current, fill.max);
        this.drawSlot(x, y, _manaBlock(fill.current, fill.max), '#9966cc', fillColor);
        continue;
      }

      const shouldBlink = !isLocked && !equipped && consumableAvailable;
      const baseColor = isLocked ? LOCKED : YELLOW;
      // Dark blink: empty slots with available consumables drop to dark yellow
      // on the off-phase so the blink reads as "off/on" rather than a brighter
      // yellow on top of yellow (which is invisible against the base).
      const color = (shouldBlink && !blinkOn(consumableBlinkOffsets[i])) ? DARK_YELLOW : baseColor;
      const char = equipped ? equipped.char : (isLocked ? ' ' : String(i + 4));

      // The equipped glyph takes the item's own color (dimmed while inert),
      // drawn once — not over a yellow copy of itself.
      let charColor = color;
      if (!isLocked && equipped) {
        const dim = _isOilInert(equipped, game) || _isBombBagEmpty(equipped, game);
        charColor = dim ? _dimColor(equipped.color) : equipped.color;
      }
      this.drawSlot(x, y, char, color, charColor);
    }
  }
}

const _MANA_BLOCKS = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];

function _manaBlock(current, max) {
  if (max <= 0) return '▁';
  const ratio = Math.max(0, Math.min(1, current / max));
  return _MANA_BLOCKS[Math.round(ratio * (_MANA_BLOCKS.length - 1))];
}

function _manaColor(current, max) {
  if (current <= 0) return '#553377';
  if (current >= max) return '#ffaaff';
  return '#cc66ff';
}

// Oils only do anything for bows, daggers and spears (bow-only oils, bows
// alone — oilAppliesTo). When a weapon that can't use it is staged in the active
// slot, dim the oil slot so the player sees it's inert.
function _isOilInert(consumable, game) {
  const oilEffect = consumable?.data?.oilEffect;
  if (!oilEffect) return false;
  const weapon = game.player?.quickSlots?.[game.player.activeSlotIndex];
  return !oilAppliesTo(oilEffect, weapon?.data);
}

// An empty Bomb Bag (free Bomb spent, no Bombs in the consumable list) dims
// like an inert oil — it refills on the next room exit.
function _isBombBagEmpty(consumable, game) {
  if (!consumable?.data?.bombBag) return false;
  return game.bombBagSystem.ammoCount(consumable) <= 0;
}

function _dimColor(hex) {
  // 40% opacity over black background — multiply each channel by 0.4.
  if (!hex || hex[0] !== '#' || hex.length !== 7) return '#444444';
  const r = Math.round(parseInt(hex.slice(1, 3), 16) * 0.4);
  const g = Math.round(parseInt(hex.slice(3, 5), 16) * 0.4);
  const b = Math.round(parseInt(hex.slice(5, 7), 16) * 0.4);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}
