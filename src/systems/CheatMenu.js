import { ITEMS, INGREDIENTS, ITEM_TYPES } from '../data/items.js';
import { GRID } from '../game/GameConfig.js';

export class CheatMenu {
  constructor() {
    this.isOpen = false;
    this.selectedIndex = 0;
    this.scrollOffset = 0;
    this.maxVisibleItems = 15;

    // Build categorized item list
    this.categories = this.buildItemCategories();
    this.flattenedItems = this.flattenCategories();
  }

  buildItemCategories() {
    const categories = {
      'WEAPONS': [],
      'ARMOR': [],
      'CONSUMABLES': [],
      'TRAPS': [],
      'INGREDIENTS': []
    };

    // Categorize items
    for (const [char, data] of Object.entries(ITEMS)) {
      const item = { char, ...data };

      if (data.type === ITEM_TYPES.WEAPON) {
        categories.WEAPONS.push(item);
      } else if (data.type === ITEM_TYPES.ARMOR) {
        categories.ARMOR.push(item);
      } else if (data.type === ITEM_TYPES.CONSUMABLE) {
        categories.CONSUMABLES.push(item);
      } else if (data.type === ITEM_TYPES.TRAP) {
        categories.TRAPS.push(item);
      }
    }

    // Add ingredients
    for (const [char, data] of Object.entries(INGREDIENTS)) {
      categories.INGREDIENTS.push({ char, ...data, type: ITEM_TYPES.INGREDIENT });
    }

    return categories;
  }

  flattenCategories() {
    const flattened = [];

    for (const [categoryName, items] of Object.entries(this.categories)) {
      if (items.length > 0) {
        flattened.push({ isHeader: true, name: categoryName });
        flattened.push(...items.map(item => ({ isHeader: false, ...item })));
      }
    }

    return flattened;
  }

  toggle() {
    this.isOpen = !this.isOpen;
    if (this.isOpen) {
      // Start at first actual item, not header
      this.selectedIndex = 0;
      while (this.selectedIndex < this.flattenedItems.length &&
             this.flattenedItems[this.selectedIndex].isHeader) {
        this.selectedIndex++;
      }
      this.scrollOffset = 0;
    }
  }

  handleInput(key) {
    if (!this.isOpen) return null;

    if (key === 'ArrowDown') {
      this.selectedIndex++;
      if (this.selectedIndex >= this.flattenedItems.length) {
        this.selectedIndex = this.flattenedItems.length - 1;
      }
      // Skip headers
      while (this.selectedIndex < this.flattenedItems.length &&
             this.flattenedItems[this.selectedIndex].isHeader) {
        this.selectedIndex++;
      }
      this.updateScroll();
      return 'handled';
    } else if (key === 'ArrowUp') {
      this.selectedIndex--;
      if (this.selectedIndex < 0) {
        this.selectedIndex = 0;
      }
      // Skip headers
      while (this.selectedIndex >= 0 &&
             this.flattenedItems[this.selectedIndex].isHeader) {
        this.selectedIndex--;
      }
      if (this.selectedIndex < 0) this.selectedIndex = 0;
      this.updateScroll();
      return 'handled';
    } else if (key === 'Enter') {
      const selected = this.flattenedItems[this.selectedIndex];
      console.log('[CHEAT] Enter pressed, selected:', selected);
      if (selected && !selected.isHeader) {
        console.log('[CHEAT] Spawning item');
        return { action: 'spawn', item: selected };
      } else {
        console.log('[CHEAT] Selected item is a header or invalid');
      }
    }

    return null;
  }

  updateScroll() {
    // Keep selected item visible
    if (this.selectedIndex < this.scrollOffset) {
      this.scrollOffset = this.selectedIndex;
    } else if (this.selectedIndex >= this.scrollOffset + this.maxVisibleItems) {
      this.scrollOffset = this.selectedIndex - this.maxVisibleItems + 1;
    }
  }

  render(renderer) {
    if (!this.isOpen) return;

    const width = GRID.WIDTH - GRID.CELL_SIZE * 6;
    const height = GRID.HEIGHT - GRID.CELL_SIZE * 6;
    const x = GRID.CELL_SIZE * 3;
    const y = GRID.CELL_SIZE * 3;

    // Draw semi-transparent background
    renderer.drawRect(x, y, width, height, 'rgba(0, 0, 0, 0.9)', true);

    // Draw border
    renderer.drawRect(x, y, width, height, '#ffff00', false);

    // Draw title
    renderer.fgCtx.save();
    renderer.fgCtx.fillStyle = '#ffff00';
    renderer.fgCtx.textAlign = 'center';
    renderer.fgCtx.textBaseline = 'middle';
    renderer.fgCtx.fillText('CHEAT MENU', GRID.WIDTH / 2, y + GRID.CELL_SIZE * 1.5);

    // Calculate visible area for items
    const startY = y + GRID.CELL_SIZE * 3;
    const lineHeight = GRID.CELL_SIZE * 1.5;

    // Draw items
    const visibleItems = this.flattenedItems.slice(
      this.scrollOffset,
      this.scrollOffset + this.maxVisibleItems
    );

    for (let i = 0; i < visibleItems.length; i++) {
      const item = visibleItems[i];
      const itemY = startY + i * lineHeight;
      const globalIndex = this.scrollOffset + i;

      if (item.isHeader) {
        // Category header
        renderer.fgCtx.fillStyle = '#888888';
        renderer.fgCtx.textAlign = 'left';
        renderer.fgCtx.fillText(`--- ${item.name} ---`, x + GRID.CELL_SIZE * 2, itemY);
      } else {
        // Item
        const isSelected = globalIndex === this.selectedIndex;

        // Selection highlight
        if (isSelected) {
          renderer.drawRect(
            x + GRID.CELL_SIZE,
            itemY - lineHeight / 2,
            width - GRID.CELL_SIZE * 2,
            lineHeight,
            'rgba(255, 255, 0, 0.3)',
            true
          );
        }

        // Draw item char
        renderer.drawEntity(
          x + GRID.CELL_SIZE * 2,
          itemY,
          item.char,
          item.color || '#ffffff'
        );

        // Draw item name
        renderer.fgCtx.fillStyle = isSelected ? '#ffffff' : '#cccccc';
        renderer.fgCtx.textAlign = 'left';
        const name = item.name.length > 25 ? item.name.substring(0, 22) + '...' : item.name;
        renderer.fgCtx.fillText(name, x + GRID.CELL_SIZE * 4, itemY);
      }
    }

    // Draw scroll indicators
    if (this.scrollOffset > 0) {
      renderer.fgCtx.fillStyle = '#ffff00';
      renderer.fgCtx.textAlign = 'right';
      renderer.fgCtx.fillText('↑', x + width - GRID.CELL_SIZE, startY - lineHeight / 2);
    }
    if (this.scrollOffset + this.maxVisibleItems < this.flattenedItems.length) {
      renderer.fgCtx.fillStyle = '#ffff00';
      renderer.fgCtx.textAlign = 'right';
      renderer.fgCtx.fillText('↓', x + width - GRID.CELL_SIZE, startY + this.maxVisibleItems * lineHeight);
    }

    // Draw instructions at bottom
    renderer.fgCtx.fillStyle = '#888888';
    renderer.fgCtx.textAlign = 'center';
    const instructionsY = y + height - GRID.CELL_SIZE;
    renderer.fgCtx.fillText('↑↓:Select  Enter:Spawn  \\:Close', GRID.WIDTH / 2, instructionsY);

    renderer.fgCtx.restore();
  }
}
