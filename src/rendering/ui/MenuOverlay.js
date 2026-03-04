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

    // 3-column layout for center slot menu
    if (game.menuColumns) {
      this.render3Column(game);
      return;
    }

    // Original single-column menu
    let title = 'Select Item';
    if (game.currentMenuSlot === 'chest') title = 'Item Chest';

    let html = `<h3 style="text-align: center;">${title}</h3>`;
    html += '<div style="max-height: 300px; overflow-y: auto; overflow-x: hidden;">';

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

    html += '</div>'; // Close scrollable area
    game.ui.menu.innerHTML = html;
    game.ui.menu.classList.remove('hidden');

    const selected = game.ui.menu.querySelector('.menu-item.selected');
    if (selected) selected.scrollIntoView({ block: 'nearest' });
  }

  render3Column(game) {
    // Column titles and colors
    const hasIngredients = game.menuColumns.length === 4;
    const columnTitles = hasIngredients
      ? ['WEAPONS', 'ARMOR', 'INGREDIENTS', 'CONSUMABLES']
      : ['WEAPONS', 'ARMOR', 'CONSUMABLES'];

    // Unique color for each column type
    const columnColors = {
      'WEAPONS': '#ff6666',      // Red
      'ARMOR': '#66ccff',        // Blue
      'INGREDIENTS': '#66ff66',  // Green
      'CONSUMABLES': '#ffaa66'   // Orange
    };

    const totalColumns = game.menuColumns.length;

    // Always show 3 columns with active column in center (circular wrapping)
    const prevCol = (game.selectedColumn - 1 + totalColumns) % totalColumns;
    const centerCol = game.selectedColumn;
    const nextCol = (game.selectedColumn + 1) % totalColumns;

    const visibleColumns = [
      { index: prevCol, position: 'left' },
      { index: centerCol, position: 'center' },
      { index: nextCol, position: 'right' }
    ];

    let html = '<h3 style="text-align: center;">Select Item</h3>';
    html += '<div style="display: flex; gap: 10px; margin-top: 10px; align-items: stretch; min-width: 420px;">';

    // Render 3 columns with active in center
    for (const { index: col, position } of visibleColumns) {
      const isCenter = position === 'center';
      const list = game.menuColumns[col];
      const title = columnTitles[col];
      const color = columnColors[title];

      if (isCenter) {
        // Center column: full width, horizontal title
        html += '<div style="flex: 3; display: flex; flex-direction: column;">';
        html += `<div style="text-align: center; margin-bottom: 8px; color: ${color}; flex-shrink: 0; font-weight: bold;">< ${title} ></div>`;
        html += '<div style="max-height: 300px; overflow-y: auto; overflow-x: hidden;">';

        if (list.length === 0) {
          html += '<div style="color: #444; font-size: 12px; text-align: center;">Empty</div>';
        } else {
          for (let i = 0; i < list.length; i++) {
            const item = list[i];
            const selected = i === game.selectedMenuIndex ? 'selected' : '';

            if (typeof item === 'string') {
              const data = game.getIngredientData(item);
              html += `<div class="menu-item ${selected}">${item} - ${data.name}</div>`;
            } else {
              html += `<div class="menu-item ${selected}">${item.char} - ${item.data.name}</div>`;
            }
          }
        }

        html += '</div></div>';
      } else {
        // Side columns: narrow width, vertical title with bright colors
        const arrow = position === 'left' ? '<' : '>';
        html += '<div style="flex: 0.5; display: flex; flex-direction: column; align-items: center;">';

        // Vertical title with arrows (pointing inward)
        html += `<div style="display: flex; flex-direction: column; align-items: center; color: ${color}; font-size: 11px; line-height: 1.2; margin-bottom: 4px;">`;
        html += `<div>${arrow}</div>`;
        for (const char of title) {
          html += `<div>${char}</div>`;
        }
        html += `<div>${arrow}</div>`;
        html += '</div>';

        html += '</div>';
      }
    }

    html += '</div>';
    game.ui.menu.innerHTML = html;
    game.ui.menu.classList.remove('hidden');

    const selected = game.ui.menu.querySelector('.menu-item.selected');
    if (selected) selected.scrollIntoView({ block: 'nearest' });
  }
}
