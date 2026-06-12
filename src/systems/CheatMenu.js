import { ITEMS, INGREDIENTS, ITEM_TYPES, WEAPON_TYPES } from '../data/items.js';
import { ENEMIES, ZONE_SPAWN_TABLES } from '../data/enemies.js';
import { GRID } from '../game/GameConfig.js';
import { CHARACTER_TYPES } from '../data/characters.js';
import { sessionDeaths } from './DeathLedgerSystem.js';

const GRID_COLS = 4;
const TILE_COLS = 5;   // cell-widths per tile
const TILE_ROWS = 3;   // cell-heights per tile

// Actions that do NOT mark the run as cheated (dev/cosmetic only).
// Everything else returned by handleInput sets game.cheatUsed for the death ledger.
const CHEAT_EXEMPT_ACTIONS = new Set([
  'download_death_ledger', 'toggle_demo_recording', 'toggle_record_hotkey', 'toggle_particle_fireworks'
]);

export class CheatMenu {
  constructor(game = null) {
    this.game = game;
    this.isOpen = false;
    this.warpMode = false;
    this.godMode = false;
    this.depthMode = false;
    this.depthInput = '';

    // Hierarchical navigation state
    this.tree = this.buildTree();
    this.path = [];           // child indices from root → current node
    this.selectedIndex = 0;   // selection within current node
    this.savedIndices = [];   // selection at each ancestor level
    this.scrollOffset = 0;    // for list view
    this.gridRowOffset = 0;   // for grid view (in rows)
  }

  // ── Tree construction ───────────────────────────────────────────────────

  buildTree() {
    const godMode = this.godMode;
    const meterActive = !!this.game?.player?.magicMeter?.active;

    const demoRecording = !!this.game?.demoSystem?.recording;
    const recordHotkey = !!this.game?.demoSystem?.hotkeyEnabled;
    const fireworks = !!this.game?.particleFireworks;
    const deathCount = sessionDeaths.filter(r => r.event !== 'revive').length;
    const togglesItems = [
      { char: godMode ? '✓' : '○', name: `GOD MODE [${godMode ? 'ON' : 'OFF'}]`, type: 'toggle_god_mode', color: godMode ? '#00ff88' : '#888888' },
      { char: meterActive ? '✓' : '○', name: `MAGIC METER [${meterActive ? 'ON' : 'OFF'}]`, type: 'activate_magic_meter', color: meterActive ? '#cc66ff' : '#888888' },
      { char: demoRecording ? '●' : '○', name: `RECORD DEMO [${demoRecording ? 'ON' : 'OFF'}]`, type: 'toggle_demo_recording', color: demoRecording ? '#ff4444' : '#888888' },
      { char: recordHotkey ? 'R' : '○', name: `R RECORD KEY [${recordHotkey ? 'ON' : 'OFF'}]`, type: 'toggle_record_hotkey', color: recordHotkey ? '#ff8844' : '#888888' },
      { char: fireworks ? '✶' : '○', name: `PARTICLE FIREWORKS [${fireworks ? 'ON' : 'OFF'}]`, type: 'toggle_particle_fireworks', color: fireworks ? '#ffaa44' : '#888888' },
      { char: '↓', name: `DOWNLOAD LEDGER (${deathCount} death${deathCount !== 1 ? 's' : ''})`, type: 'download_death_ledger', color: deathCount > 0 ? '#aaaaff' : '#444466' }
    ];

    const zoneItems = (this.game && this.game.zoneDepths) ? [
      { char: 'G', name: `GREEN (L${this.game.zoneDepths.green})`, type: 'zone', zone: 'green', color: '#00ff00' },
      { char: 'R', name: `RED (L${this.game.zoneDepths.red})`, type: 'zone', zone: 'red', color: '#ff4400' },
      { char: 'C', name: `CYAN (L${this.game.zoneDepths.cyan})`, type: 'zone', zone: 'cyan', color: '#44ffff' },
      { char: 'Y', name: `YELLOW (L${this.game.zoneDepths.yellow})`, type: 'zone', zone: 'yellow', color: '#ffff44' },
      { char: 'D', name: `GRAY (L${this.game.zoneDepths.gray})`, type: 'zone', zone: 'gray', color: '#888888' }
    ] : [];

    const bossItems = (this.game && this.game.zoneDepths) ? [
      { char: 'Ω', name: 'GOO DRAGON (green)',  type: 'boss_test', zone: 'green',  color: '#22cc44' },
      { char: '@', name: 'ANCIENT SHELL (red)', type: 'boss_test', zone: 'red',    color: '#ff4400' },
      { char: '~', name: 'FROSTED MAW (cyan)',  type: 'boss_test', zone: 'cyan',   color: '#44ffff' },
      { char: 'Ω', name: 'BOSS (yellow)',       type: 'boss_test', zone: 'yellow', color: '#ffff44' }
    ] : [];

    // BOULDER TEST — debug placement for the Red deflect puzzle. Spawn the 4
    // elbow deflectors at the player and trigger a boulder to watch it route.
    const boulderTestItems = [
      { char: '◣', name: 'Deflector NE', type: 'spawn_object', objChar: '◣', color: '#b08850' },
      { char: '◢', name: 'Deflector NW', type: 'spawn_object', objChar: '◢', color: '#b08850' },
      { char: '◥', name: 'Deflector SW', type: 'spawn_object', objChar: '◥', color: '#b08850' },
      { char: '◤', name: 'Deflector SE', type: 'spawn_object', objChar: '◤', color: '#b08850' },
      { char: 'Q', name: 'Trigger Boulder (red only)', type: 'trigger_boulder', color: '#888888' }
    ];

    const characterItems = Object.entries(CHARACTER_TYPES).map(([type, data]) => {
      const isActive = this.game && this.game.activeCharacterType === type;
      const isDead = this.game && this.game.deadCharacters && this.game.deadCharacters.includes(type);
      const suffix = isActive ? ' (active)' : isDead ? ' (dead)' : '';
      return {
        char: '@',
        name: data.name + suffix,
        type: 'character',
        characterType: type,
        color: data.color,
        disabled: isActive || isDead
      };
    });

    const weaponBuckets = {
      'GUNS': [], 'BOWS': [], 'SWORDS': [], 'AXES': [], 'HAMMERS': [],
      'SPEARS': [], 'STAVES': [], 'DAGGERS': [], 'WHIPS': [], 'FLAILS': [],
      'PICKAXES': [], 'WANDS': [], 'OTHER': []
    };
    const armorItems = [];
    const consumableItems = [];
    const trapItems = [];
    const ingredientItems = [];

    const meleeSubtypeBuckets = {
      sword: 'SWORDS', axe: 'AXES', hammer: 'HAMMERS', spear: 'SPEARS',
      staff: 'STAVES', dagger: 'DAGGERS', whip: 'WHIPS', flail: 'FLAILS',
      pickaxe: 'PICKAXES'
    };

    for (const [char, data] of Object.entries(ITEMS)) {
      const item = { char, ...data };
      if (data.type === ITEM_TYPES.WEAPON) {
        if (data.weaponType === WEAPON_TYPES.GUN) weaponBuckets.GUNS.push(item);
        else if (data.weaponType === WEAPON_TYPES.BOW) weaponBuckets.BOWS.push(item);
        else if (data.weaponType === WEAPON_TYPES.WAND) weaponBuckets.WANDS.push(item);
        else if (data.weaponType === WEAPON_TYPES.MELEE) {
          const bucket = meleeSubtypeBuckets[data.weaponSubtype];
          if (bucket) weaponBuckets[bucket].push(item);
          else weaponBuckets.OTHER.push(item);
        } else {
          weaponBuckets.OTHER.push(item);
        }
      } else if (data.type === ITEM_TYPES.ARMOR) {
        armorItems.push(item);
      } else if (data.type === ITEM_TYPES.CONSUMABLE) {
        consumableItems.push(item);
      } else if (data.type === ITEM_TYPES.TRAP) {
        trapItems.push(item);
      }
    }

    for (const [char, data] of Object.entries(INGREDIENTS)) {
      ingredientItems.push({ char, ...data, type: ITEM_TYPES.INGREDIENT });
    }

    // Sort weapon buckets by damage ascending so tiers read in order
    for (const key of Object.keys(weaponBuckets)) {
      weaponBuckets[key].sort((a, b) => (a.damage ?? 0) - (b.damage ?? 0));
    }

    // Build weapon subfolders (skip empties)
    const weaponChildren = [];
    for (const [name, items] of Object.entries(weaponBuckets)) {
      if (items.length > 0) weaponChildren.push({ name, items });
    }

    const zoneLabelColors = {
      green: '#00ff00', red: '#ff4400', cyan: '#44ffff', yellow: '#ffff44', gray: '#888888'
    };
    const tierOrder = { weak: 0, normal: 1, elite: 2, boss: 3 };
    const enemyZoneFolders = [];
    const seenInAnyZone = new Set();

    for (const [zone, table] of Object.entries(ZONE_SPAWN_TABLES)) {
      const uniqueChars = [...new Set(Object.values(table).flat())];
      const zoneEnemyItems = uniqueChars
        .filter(char => ENEMIES[char])
        .sort((a, b) => {
          const ta = tierOrder[ENEMIES[a].tier] ?? 1;
          const tb = tierOrder[ENEMIES[b].tier] ?? 1;
          return ta !== tb ? ta - tb : (ENEMIES[a].name < ENEMIES[b].name ? -1 : 1);
        })
        .map(char => {
          seenInAnyZone.add(char);
          const data = ENEMIES[char];
          return { char: data.char || char, name: data.name, type: 'enemy', color: data.color };
        });
      if (zoneEnemyItems.length > 0) {
        enemyZoneFolders.push({ name: zone.toUpperCase(), items: zoneEnemyItems, color: zoneLabelColors[zone] });
      }
    }

    const otherEnemyItems = Object.entries(ENEMIES)
      .filter(([char]) => !seenInAnyZone.has(char))
      .sort(([, a], [, b]) => {
        const ta = tierOrder[a.tier] ?? 1;
        const tb = tierOrder[b.tier] ?? 1;
        return ta !== tb ? ta - tb : (a.name < b.name ? -1 : 1);
      })
      .map(([char, data]) => ({ char: data.char || char, name: data.name, type: 'enemy', color: data.color }));

    if (otherEnemyItems.length > 0) {
      enemyZoneFolders.push({ name: 'OTHER', items: otherEnemyItems, color: '#aaaaaa' });
    }

    const children = [];
    if (togglesItems.length) children.push({ name: 'TOGGLES', items: togglesItems });
    if (zoneItems.length) children.push({ name: 'ZONES', items: zoneItems });
    if (bossItems.length) children.push({ name: 'BOSSES', items: bossItems });
    if (boulderTestItems.length) children.push({ name: 'BOULDER TEST', items: boulderTestItems });
    if (characterItems.length) children.push({ name: 'CHARACTERS', items: characterItems });
    if (weaponChildren.length) children.push({ name: 'WEAPONS', children: weaponChildren });
    if (armorItems.length) children.push({ name: 'ARMOR', items: armorItems });
    if (consumableItems.length) children.push({ name: 'CONSUMABLES', items: consumableItems });
    if (trapItems.length) children.push({ name: 'TRAPS', items: trapItems });
    if (ingredientItems.length) children.push({ name: 'INGREDIENTS', items: ingredientItems });
    if (enemyZoneFolders.length) children.push({ name: 'ENEMIES', children: enemyZoneFolders });

    return { name: 'CHEAT MENU', children };
  }

  rebuild() {
    // Preserve path/selection across rebuilds when possible (toggles, magic activation)
    const oldPath = this.path.slice();
    const oldSel = this.selectedIndex;
    const oldSaved = this.savedIndices.slice();
    this.tree = this.buildTree();

    // Clamp path to still-valid indices
    let node = this.tree;
    const newPath = [];
    for (const idx of oldPath) {
      const entries = this._getEntries(node);
      if (idx >= 0 && idx < entries.length && (entries[idx].children || entries[idx].items)) {
        newPath.push(idx);
        node = entries[idx];
      } else {
        break;
      }
    }
    this.path = newPath;
    this.savedIndices = oldSaved.slice(0, newPath.length);

    const currentEntries = this._getEntries(this.getCurrentNode());
    this.selectedIndex = Math.min(oldSel, Math.max(0, currentEntries.length - 1));
  }

  // ── Navigation helpers ──────────────────────────────────────────────────

  _getEntries(node) {
    return node?.children || node?.items || [];
  }

  getCurrentNode() {
    let node = this.tree;
    for (const idx of this.path) {
      node = this._getEntries(node)[idx];
    }
    return node;
  }

  // What view a node uses: grid if it holds folders, list if it holds items.
  // Root is always grid.
  _getView(node) {
    if (!node || node === this.tree) return 'grid';
    return node.children ? 'grid' : 'list';
  }

  // Resolve a folder's display glyph by descending to the first item
  _getNodeIcon(node) {
    if (node.char) return { char: node.char, color: node.color || '#ffffff' };
    const entries = this._getEntries(node);
    if (entries.length === 0) return { char: '?', color: '#888888' };
    return this._getNodeIcon(entries[0]);
  }

  _descend(index) {
    this.savedIndices.push(this.selectedIndex);
    this.path.push(index);
    this.selectedIndex = 0;
    this.scrollOffset = 0;
    this.gridRowOffset = 0;
  }

  _ascend() {
    if (this.path.length === 0) return false;
    this.path.pop();
    this.selectedIndex = this.savedIndices.pop() ?? 0;
    this.scrollOffset = 0;
    this.gridRowOffset = 0;
    return true;
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────

  toggle() {
    this.isOpen = !this.isOpen;
    if (this.isOpen) {
      this.tree = this.buildTree();
      this.path = [];
      this.selectedIndex = 0;
      this.savedIndices = [];
      this.scrollOffset = 0;
      this.gridRowOffset = 0;
      this.warpMode = false;
      this.depthMode = false;
      this.depthInput = '';
    }
  }

  // ── Input ───────────────────────────────────────────────────────────────

  handleInput(key) {
    const result = this._handleInput(key);
    if (result?.action && !CHEAT_EXEMPT_ACTIONS.has(result.action) && this.game) {
      this.game.cheatUsed = true;
    }
    return result;
  }

  _handleInput(key) {
    if (!this.isOpen) return null;

    // Depth jump mode
    if (this.depthMode) {
      if (key === 'Escape') {
        this.depthMode = false;
        this.depthInput = '';
        return 'handled';
      }
      if (key === 'Backspace') {
        this.depthInput = this.depthInput.slice(0, -1);
        if (this.depthInput === '') this.depthMode = false;
        return 'handled';
      }
      if (key === 'Enter') {
        const depth = parseInt(this.depthInput, 10);
        this.depthMode = false;
        this.depthInput = '';
        if (!isNaN(depth) && depth >= 1) return { action: 'set_depth', depth };
        return 'handled';
      }
      if (/^\d$/.test(key)) {
        this.depthInput += key;
        return 'handled';
      }
      return 'handled';
    }

    // Warp mode
    if (this.warpMode) {
      if (key === 'Escape' || key === '\\') {
        this.warpMode = false;
        return 'handled';
      }
      const roomLetter = key.toUpperCase();
      this.warpMode = false;
      return { action: 'warp', roomLetter };
    }

    // Digit triggers depth mode
    if (/^\d$/.test(key)) {
      this.depthMode = true;
      this.depthInput = key;
      return 'handled';
    }

    // R toggles warp mode
    if (key === 'r' || key === 'R') {
      this.warpMode = true;
      return 'handled';
    }

    // Escape / Backspace / Shift ascend the menu hierarchy
    if (key === 'Escape' || key === 'Backspace' || key === 'Shift') {
      this._ascend();
      return 'handled';
    }

    const node = this.getCurrentNode();
    const entries = this._getEntries(node);
    if (entries.length === 0) return null;

    const view = this._getView(node);

    if (view === 'grid') {
      const cols = Math.min(GRID_COLS, entries.length);
      if (key === 'ArrowLeft') {
        if (this.selectedIndex > 0) this.selectedIndex--;
        this._updateGridScroll(entries.length);
        return 'handled';
      }
      if (key === 'ArrowRight') {
        if (this.selectedIndex < entries.length - 1) this.selectedIndex++;
        this._updateGridScroll(entries.length);
        return 'handled';
      }
      if (key === 'ArrowUp') {
        if (this.selectedIndex - cols >= 0) this.selectedIndex -= cols;
        this._updateGridScroll(entries.length);
        return 'handled';
      }
      if (key === 'ArrowDown') {
        if (this.selectedIndex + cols < entries.length) this.selectedIndex += cols;
        this._updateGridScroll(entries.length);
        return 'handled';
      }
    } else {
      if (key === 'ArrowUp') {
        if (this.selectedIndex > 0) this.selectedIndex--;
        this._updateListScroll();
        return 'handled';
      }
      if (key === 'ArrowDown') {
        if (this.selectedIndex < entries.length - 1) this.selectedIndex++;
        this._updateListScroll();
        return 'handled';
      }
    }

    if (key === 'Enter') {
      const selected = entries[this.selectedIndex];
      if (!selected) return null;
      // Folder → descend
      if (selected.children || selected.items) {
        this._descend(this.selectedIndex);
        return 'handled';
      }
      // Leaf → activate
      return this._activateItem(selected);
    }

    return null;
  }

  _activateItem(selected) {
    if (selected.type === 'toggle_god_mode') return { action: 'toggle_god_mode' };
    if (selected.type === 'activate_magic_meter') return { action: 'activate_magic_meter' };
    if (selected.type === 'toggle_demo_recording') return { action: 'toggle_demo_recording' };
    if (selected.type === 'toggle_record_hotkey') {
      // Self-contained dev toggle — arms/disarms the global 'r' record hotkey
      // without a main.js dispatch branch.
      const demo = this.game?.demoSystem;
      if (demo) demo.hotkeyEnabled = !demo.hotkeyEnabled;
      this.rebuild();
      return 'handled';
    }
    if (selected.type === 'toggle_particle_fireworks') return { action: 'toggle_particle_fireworks' };
    if (selected.type === 'download_death_ledger') return { action: 'download_death_ledger' };
    if (selected.type === 'zone') return { action: 'teleport_zone', zone: selected.zone };
    if (selected.type === 'boss_test') return { action: 'boss_test', zone: selected.zone };
    if (selected.type === 'character') {
      if (selected.disabled) return 'handled';
      return { action: 'change_character', characterType: selected.characterType };
    }
    if (selected.type === 'enemy') return { action: 'spawn_enemy', enemy: selected };
    if (selected.type === 'spawn_object') return { action: 'spawn_object', objChar: selected.objChar };
    if (selected.type === 'trigger_boulder') return { action: 'trigger_boulder' };
    return { action: 'spawn', item: selected };
  }

  _updateListScroll() {
    const maxVisible = this._listMaxVisible();
    if (this.selectedIndex < this.scrollOffset) this.scrollOffset = this.selectedIndex;
    else if (this.selectedIndex >= this.scrollOffset + maxVisible) {
      this.scrollOffset = this.selectedIndex - maxVisible + 1;
    }
  }

  _updateGridScroll(total) {
    const cols = Math.min(GRID_COLS, total);
    const row = Math.floor(this.selectedIndex / cols);
    const maxRows = this._gridMaxRows();
    if (row < this.gridRowOffset) this.gridRowOffset = row;
    else if (row >= this.gridRowOffset + maxRows) {
      this.gridRowOffset = row - maxRows + 1;
    }
  }

  _listMaxVisible() {
    // Computed from window geometry (see render())
    return 13;
  }

  _gridMaxRows() {
    return 5;
  }

  // ── Render ──────────────────────────────────────────────────────────────

  render(renderer) {
    if (!this.isOpen) return;

    const CELL = GRID.CELL_SIZE;
    const width = GRID.WIDTH - CELL * 6;
    const height = GRID.HEIGHT - CELL * 6;
    const x = CELL * 3;
    const y = CELL * 3;

    renderer.drawRect(x, y, width, height, 'rgba(0, 0, 0, 0.9)', true);
    renderer.drawRect(x, y, width, height, '#ffff00', false);

    const ctx = renderer.fgCtx;
    ctx.save();
    ctx.fillStyle = '#ffff00';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Warp mode overlay
    if (this.warpMode) {
      ctx.fillText('ROOM WARP', GRID.WIDTH / 2, y + CELL * 1.5);
      ctx.fillStyle = '#ffffff';
      ctx.fillText('Press desired key to warp', GRID.WIDTH / 2, GRID.HEIGHT / 2);
      ctx.fillStyle = '#888888';
      ctx.fillText('ESC:Cancel  \\:Close', GRID.WIDTH / 2, y + height - CELL);
      ctx.restore();
      return;
    }

    // Breadcrumb / title
    const crumbs = ['CHEAT MENU'];
    let walker = this.tree;
    for (const idx of this.path) {
      walker = this._getEntries(walker)[idx];
      crumbs.push(walker.name);
    }
    ctx.fillText(crumbs.join(' › '), GRID.WIDTH / 2, y + CELL * 1.5);

    // Depth-jump input bar
    if (this.depthMode) {
      const barY = y + CELL * 2.6;
      renderer.drawRect(x + CELL, barY - CELL * 0.6, width - CELL * 2, CELL * 1.1, 'rgba(255,255,0,0.15)', true);
      renderer.drawRect(x + CELL, barY - CELL * 0.6, width - CELL * 2, CELL * 1.1, '#ffff00', false);
      ctx.fillStyle = '#888888';
      ctx.textAlign = 'left';
      ctx.fillText('JUMP TO LEVEL:', x + CELL * 2, barY);
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'right';
      const cursor = Math.floor(performance.now() / 500) % 2 === 0 ? '_' : '';
      ctx.fillText(this.depthInput + cursor, x + width - CELL * 2, barY);
      ctx.textAlign = 'center';
    }

    const node = this.getCurrentNode();
    const entries = this._getEntries(node);
    const view = this._getView(node);

    const contentTop = y + CELL * 3;
    const contentBottom = y + height - CELL * 1.5;

    if (view === 'grid') {
      this._renderGrid(renderer, entries, x, contentTop, width, contentBottom - contentTop);
    } else {
      this._renderList(renderer, entries, x, contentTop, width, contentBottom - contentTop);
    }

    // Bottom hints
    ctx.fillStyle = '#888888';
    ctx.textAlign = 'center';
    const back = this.path.length > 0 ? 'Shift:Back  ' : '';
    ctx.fillText(`${back}↑↓←→:Move  Enter:Select  R:Warp  0-9:Level  \\:Close`, GRID.WIDTH / 2, y + height - CELL * 0.6);

    ctx.restore();
  }

  _renderGrid(renderer, entries, x, top, width, availH) {
    const CELL = GRID.CELL_SIZE;
    const ctx = renderer.fgCtx;

    const tileW = CELL * TILE_COLS;
    const tileH = CELL * TILE_ROWS;
    const cols = Math.min(GRID_COLS, entries.length);
    const totalGridW = cols * tileW;
    const startX = x + (width - totalGridW) / 2;
    const maxRows = Math.max(1, Math.floor(availH / tileH));

    // Clamp / update scroll
    const totalRows = Math.ceil(entries.length / cols);
    if (this.gridRowOffset > Math.max(0, totalRows - maxRows)) {
      this.gridRowOffset = Math.max(0, totalRows - maxRows);
    }

    const firstIdx = this.gridRowOffset * cols;
    const lastIdx = Math.min(entries.length, firstIdx + maxRows * cols);

    for (let i = firstIdx; i < lastIdx; i++) {
      const entry = entries[i];
      const localIdx = i - firstIdx;
      const r = Math.floor(localIdx / cols);
      const c = localIdx % cols;
      const tx = startX + c * tileW;
      const ty = top + r * tileH;

      const isSelected = i === this.selectedIndex;
      const icon = this._getNodeIcon(entry);
      const isFolder = !!(entry.children || entry.items);

      // Tile background + border
      const fillStyle = isSelected ? 'rgba(255, 255, 0, 0.18)' : 'rgba(255, 255, 255, 0.04)';
      const borderStyle = isSelected ? '#ffff00' : '#444444';
      renderer.drawRect(tx + 2, ty + 2, tileW - 4, tileH - 4, fillStyle, true);
      renderer.drawRect(tx + 2, ty + 2, tileW - 4, tileH - 4, borderStyle, false);

      // Glyph (scaled up)
      const glyphX = tx + tileW / 2;
      const glyphY = ty + CELL * 1.1;
      renderer.drawEntityScaled(glyphX, glyphY, icon.char, icon.color, 1.6);

      // Folder indicator (small marker bottom-right)
      if (isFolder) {
        ctx.fillStyle = isSelected ? '#ffff00' : '#666666';
        ctx.textAlign = 'right';
        ctx.fillText('›', tx + tileW - 6, ty + 10);
      }

      // Label
      ctx.fillStyle = isSelected ? '#ffffff' : '#aaaaaa';
      ctx.textAlign = 'center';
      const label = entry.name || '';
      const trimmed = label.length > 10 ? label.substring(0, 9) + '…' : label;
      ctx.fillText(trimmed, tx + tileW / 2, ty + tileH - 8);
    }

    // Scroll indicators
    if (this.gridRowOffset > 0) {
      ctx.fillStyle = '#ffff00';
      ctx.textAlign = 'center';
      ctx.fillText('↑', x + width / 2, top - 4);
    }
    if (this.gridRowOffset + maxRows < totalRows) {
      ctx.fillStyle = '#ffff00';
      ctx.textAlign = 'center';
      ctx.fillText('↓', x + width / 2, top + maxRows * tileH + 8);
    }
  }

  _renderList(renderer, entries, x, top, width, availH) {
    const CELL = GRID.CELL_SIZE;
    const ctx = renderer.fgCtx;
    const lineHeight = CELL * 1.5;
    const maxVisible = Math.max(1, Math.floor(availH / lineHeight));

    // Clamp scroll
    if (this.scrollOffset > Math.max(0, entries.length - maxVisible)) {
      this.scrollOffset = Math.max(0, entries.length - maxVisible);
    }
    if (this.selectedIndex < this.scrollOffset) this.scrollOffset = this.selectedIndex;
    else if (this.selectedIndex >= this.scrollOffset + maxVisible) {
      this.scrollOffset = this.selectedIndex - maxVisible + 1;
    }

    const startY = top + lineHeight / 2;
    const visible = entries.slice(this.scrollOffset, this.scrollOffset + maxVisible);

    for (let i = 0; i < visible.length; i++) {
      const entry = visible[i];
      const globalIdx = this.scrollOffset + i;
      const itemY = startY + i * lineHeight;
      const isSelected = globalIdx === this.selectedIndex;
      const isFolder = !!(entry.children || entry.items);

      if (isSelected) {
        renderer.drawRect(
          x + CELL,
          itemY - lineHeight / 2,
          width - CELL * 2,
          lineHeight,
          'rgba(255, 255, 0, 0.3)',
          true
        );
      }

      const icon = this._getNodeIcon(entry);
      renderer.drawEntity(x + CELL * 2, itemY, icon.char, icon.color);

      ctx.fillStyle = isSelected ? '#ffffff' : '#cccccc';
      ctx.textAlign = 'left';
      let name = entry.name || '';
      if (isFolder) name += ' ›';
      const trimmed = name.length > 28 ? name.substring(0, 25) + '...' : name;
      ctx.fillText(trimmed, x + CELL * 4, itemY);
    }

    if (this.scrollOffset > 0) {
      ctx.fillStyle = '#ffff00';
      ctx.textAlign = 'right';
      ctx.fillText('↑', x + width - CELL, top + lineHeight / 2 - 4);
    }
    if (this.scrollOffset + maxVisible < entries.length) {
      ctx.fillStyle = '#ffff00';
      ctx.textAlign = 'right';
      ctx.fillText('↓', x + width - CELL, top + maxVisible * lineHeight - 4);
    }
  }
}
