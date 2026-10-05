import { GRID } from '../game/GameConfig.js';
import { CraftingSystem } from './CraftingSystem.js';

/**
 * ForgeSystem — the Dragon Forge. Scale only works in fire: Forge Recipes
 * (recipes.js `requiresForge`, any recipe with a Scale input) craft here and
 * nowhere else. The REST station shows an ember tell for them instead.
 *
 * The forge rises in the green zone boss room when the Goo Dragon falls
 * (BossSystem._onBossDefeated → placeForge) and belongs to that room alone:
 * `room.dragonForge` rides along when the room is restored after a REST
 * round-trip, and is gone once the player moves north and the room is
 * regenerated. Use the Scales there or not at all.
 *
 * The station is a three-slot bracket triad shaped like the REST station
 * ([left][centre][right]). It runs on its own CraftingSystem instance in
 * forge mode — sharing the REST station's tried-pair memory — and reuses MenuSystem's crafting picker and centre-claim
 * routing, so it fills and claims exactly like REST. Drawn by
 * rendering/effects/DragonForgeDraw.js.
 */

// Slot glyph columns relative to the forge's centre column — the REST
// station's spacing (CRAFTING: glyph cells at 13 / 15 / 17).
export const FORGE_SLOT_OFFSETS = { left: -2, center: 0, right: 2 };

const INTERACTION_DISTANCE = 1.5; // cells, matches the REST station
const AWAY_MARGIN = 2;            // cells beyond the triad before slots empty

export class ForgeSystem {
  constructor(game) {
    this.game = game;
    // Shares the REST station's identified/failed pair memory (built earlier
    // in Game.constructor), so its run-scope reset covers the forge too.
    this.crafting = new CraftingSystem(game, { forge: true, pairMemory: game.craftingSystem });
  }

  /** Raise the forge where the Goo Dragon stood — the open centre of the boss room. */
  placeForge(room) {
    room.dragonForge = {
      col: Math.floor(GRID.COLS / 2),
      row: Math.floor(GRID.ROWS / 2)
    };
  }

  /** The forge in the current room, or null. */
  activeForge() {
    return this.game.currentRoom?.dragonForge ?? null;
  }

  _playerCell() {
    const C = GRID.CELL_SIZE;
    const p = this.game.player.position;
    return { x: (p.x + C / 2) / C, y: (p.y + C / 2) / C };
  }

  /**
   * Nearest interactive slot within reach: { type: 'left'|'center'|'right',
   * col, row }, or null. The centre only counts while it holds a result —
   * the forge has no dismantle, so an empty centre offers nothing.
   */
  getNearestSlot() {
    const forge = this.activeForge();
    if (!forge || !this.game.player) return null;
    const pc = this._playerCell();
    let best = null;
    let bestDist = INTERACTION_DISTANCE;
    for (const [type, offset] of Object.entries(FORGE_SLOT_OFFSETS)) {
      if (type === 'center' && !this.crafting.hasCenterContent()) continue;
      const col = forge.col + offset;
      const dist = Math.hypot(pc.x - (col + 0.5), pc.y - (forge.row + 0.5));
      if (dist < bestDist) {
        bestDist = dist;
        best = { type, col, row: forge.row };
      }
    }
    return best;
  }

  /**
   * SPACE near the forge: an empty side slot opens the carried-item picker,
   * an occupied one hands its item back, a finished centre is claimed.
   */
  handleSpacePress() {
    const slot = this.getNearestSlot();
    if (!slot) return false;
    const game = this.game;
    const cs = this.crafting;

    if (slot.type === 'center') {
      game.menuSystem.claimCenter(cs);
      if (!cs.hasCenterContent()) game.audioSystem?.playSFX?.('craft');
      return true;
    }

    const held = slot.type === 'left' ? cs.leftSlot : cs.rightSlot;
    if (!held) {
      game.menuSystem.openCraftingMenu(slot.type, cs, { includeChest: false });
      game.menuSystem.closeOnMovement = true;
      return true;
    }

    const char = slot.type === 'left' ? cs.clearLeftSlot() : cs.clearRightSlot();
    if (char) game.menuSystem._returnSlotItemToInventory(char);
    game.updateUI();
    return true;
  }

  /**
   * EXPLORE tick: once the player walks away from the forge (or the forge is
   * no longer in the room), slotted items go back to inventory — the forge
   * is never a hiding place, and every room exit is a walk away from it.
   */
  update() {
    const cs = this.crafting;
    if (!this.game.player || (!cs.leftSlot && !cs.rightSlot)) return;
    const forge = this.activeForge();
    if (forge) {
      const pc = this._playerCell();
      const nearX = pc.x >= forge.col + FORGE_SLOT_OFFSETS.left - 1 - AWAY_MARGIN &&
                    pc.x <= forge.col + FORGE_SLOT_OFFSETS.right + 2 + AWAY_MARGIN;
      const nearY = Math.abs(pc.y - (forge.row + 0.5)) <= AWAY_MARGIN + 0.5;
      if (nearX && nearY) return;
    }
    this._returnSlots();
  }

  _returnSlots() {
    const left = this.crafting.clearLeftSlot();
    const right = this.crafting.clearRightSlot();
    if (left) this.game.menuSystem._returnSlotItemToInventory(left);
    if (right) this.game.menuSystem._returnSlotItemToInventory(right);
    this.game.updateUI();
  }

  /**
   * Room-scope reset (RESET_REGISTRY): empty the slots without returning
   * anything. Normal play never reaches here with items slotted — update()
   * hands them back long before the player can reach an exit — so this only
   * clears what a death or cheat warp abandoned mid-craft.
   */
  reset() {
    this.crafting.setState({ leftSlot: null, rightSlot: null, centerSlot: null });
  }
}
