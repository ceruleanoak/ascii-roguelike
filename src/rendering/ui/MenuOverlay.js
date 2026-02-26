/**
 * MenuOverlay - Dynamic DOM-based menu popup
 *
 * Displays selection menus for:
 * - Crafting ingredients (left/right slots)
 * - Armor selection
 * - Consumable selection
 * - Item chest retrieval
 */

export class MenuOverlay {
  constructor(renderer) {
    this.renderer = renderer;
  }

  render(game) {
    if (!game.menuOpen) return;

    let title = 'Select Ingredient';
    if (game.currentMenuSlot === 'armor') title = 'Select Armor';
    if (game.currentMenuSlot === 'consumable1' || game.currentMenuSlot === 'consumable2') title = 'Select Consumable';
    if (game.currentMenuSlot === 'chest') title = 'Item Chest';

    let html = `<h3>${title}</h3>`;

    if (game.menuItems.length === 0) {
      html += '<div style="margin: 8px 0; color: #888;">Chest is empty</div>';
    }

    for (let i = 0; i < game.menuItems.length; i++) {
      const item = game.menuItems[i];
      const selected = i === game.selectedMenuIndex ? 'selected' : '';

      // Check if it's a chest menu option (has action and label)
      if (item.action) {
        html += `<div class="menu-item ${selected}">${item.label}</div>`;
      }
      // Check if it's an ingredient (string) or equipment item (object)
      else if (typeof item === 'string') {
        const data = game.getIngredientData(item);
        html += `<div class="menu-item ${selected}">${item} - ${data.name}</div>`;
      } else {
        // Equipment item (has char and data.name)
        html += `<div class="menu-item ${selected}">${item.char} - ${item.data.name}</div>`;
      }
    }

    game.ui.menu.innerHTML = html;
    game.ui.menu.classList.remove('hidden');
  }
}
