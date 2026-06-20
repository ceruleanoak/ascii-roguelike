import { GRID } from '../game/GameConfig.js';
import { BackgroundObject } from '../entities/BackgroundObject.js';
import { Item } from '../entities/Item.js';
import { Particle } from '../entities/Particle.js';
import { KEY_ITEM_SITES, DEEP_WATER_COLOR, PLANK_COLOR } from '../data/puzzles.js';

const CS = GRID.CELL_SIZE;
const PLANK_SPAN = 3;          // max deep-water cells one Platform converts
const REACH = CS * 1.6;        // plank placement + sword draw reach
const DRAW_DURATION = 1.2;     // sword draw animation length (seconds)

/**
 * KeyItemSystem — deterministic zone key-item sites + the Platform plank.
 *
 * Deep water ("black water") is impassable terrain that only a Platform '='
 * (dungeon floor 2, every run) can cross: SPACE beside it with a Platform in
 * a quick slot lays up to a 3-cell plank. Sites are placed by placeSites()
 * (RoomGenerator hook) per data/puzzles.js KEY_ITEM_SITES:
 *   green  — § sword stone on a moated islet in every L room (until drawn)
 *   yellow — ⊙ on the O room's far shore behind a deep-water band (until taken)
 * Per-run flags (game.swordDrawnThisRun / game.spectaclesTakenThisRun) stop
 * re-placement; they reset with every run — no persistence.
 */
export class KeyItemSystem {
  constructor(game) {
    this.game = game;
    this.drawAnim = null; // { site, t } — sword draw in progress
  }

  // ── Site placement (called once per room at the end of generateRoom) ──────

  placeSites(room) {
    const site = KEY_ITEM_SITES[room.zone];
    if (!site || room.exitLetter !== site.exitLetter) return;
    if (this.game[site.takenFlag]) return;
    if (room.zone === 'green') this._placeSwordIslet(room, site);
    else if (room.zone === 'yellow') this._placeSpectaclesShore(room, site);
  }

  _placeSwordIslet(room, site) {
    const { isletCol, isletRow } = site;

    // Islet: clear the center cell and plant the (deliberately dull) sword stone.
    this._clearCell(room, isletCol, isletRow);
    const stone = new BackgroundObject('0', isletCol * CS, isletRow * CS);
    stone.color = site.stoneColor;
    stone.animationColor = site.stoneColor;
    stone.structural = true;
    stone.indestructible = true;
    stone.swordStone = true;
    room.backgroundObjects.push(stone);
    room.collisionMap[isletRow][isletCol] = false;

    // 1-cell deep-water moat around the islet.
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        this._makeDeepWater(room, isletCol + dc, isletRow + dr);
      }
    }

    room.keyItemSite = { kind: 'sword', site, stone, drawn: false };
  }

  _placeSpectaclesShore(room, site) {
    // Deep-water band across the ocean — severs the swimmable route east.
    for (let col = site.deepStartCol; col <= site.deepEndCol; col++) {
      for (let row = 1; row < GRID.ROWS - 1; row++) {
        this._makeDeepWater(room, col, row);
      }
    }

    // Far-shore pocket: a small clearing in the water holds the Spectacles.
    const shoreRow = 15;
    for (let dc = -1; dc <= 1; dc++) {
      for (let dr = -1; dr <= 1; dr++) {
        this._clearCell(room, site.shoreCol + dc, shoreRow + dr);
      }
    }
    const item = new Item(site.item, site.shoreCol * CS, shoreRow * CS);
    room.items.push(item);

    room.keyItemSite = { kind: 'spectacles', site, item };
  }

  _clearCell(room, col, row) {
    const x = col * CS, y = row * CS;
    room.backgroundObjects = room.backgroundObjects.filter(obj =>
      !(Math.abs(obj.position.x - x) < CS / 2 && Math.abs(obj.position.y - y) < CS / 2)
    );
  }

  _makeDeepWater(room, col, row) {
    if (col < 1 || col >= GRID.COLS - 1 || row < 1 || row >= GRID.ROWS - 1) return;
    this._clearCell(room, col, row);
    const dw = new BackgroundObject('~', col * CS, row * CS);
    // typeId 'deep_water' makes isWater() false: no water-state animation, no
    // electric conduction, no swim/wet physics. Collision makes it impassable.
    dw.typeId = 'deep_water';
    dw.deepWater = true;
    dw.color = DEEP_WATER_COLOR;
    dw.animationColor = DEEP_WATER_COLOR;
    dw.structural = true;
    dw.indestructible = true;
    room.backgroundObjects.push(dw);
    room.collisionMap[row][col] = true;
  }

  // ── SPACE handling ────────────────────────────────────────────────────────

  handleSpacePress() {
    const game = this.game;
    const room = game.currentRoom;
    const player = game.player;
    if (!room || !player || this.drawAnim) return false;

    // Sword draw — SPACE beside the islet stone.
    const swordSite = room.keyItemSite;
    if (swordSite?.kind === 'sword' && !swordSite.drawn && !game[swordSite.site.takenFlag]) {
      const stone = swordSite.stone;
      if (this._dist(player.position, stone.position) < REACH) {
        this.drawAnim = { site: swordSite, t: 0 };
        game.audioSystem?.playSFX?.('sword_draw');
        return true;
      }
    }

    // Plank placement — SPACE beside deep water with a Platform in a quick slot.
    const slotIndex = this._findPlatformSlot();
    if (slotIndex < 0) return false;
    const start = this._nearestDeepWater(room, player);
    if (!start) return false;

    this._layPlank(room, player, start);
    this._consumePlatform(slotIndex);
    game.audioSystem?.playSFX?.('plank_place');
    game.menuSystem?.updateUI?.();
    return true;
  }

  _findPlatformSlot() {
    const slots = this.game.inventorySystem?.equippedConsumables || [];
    for (let i = 0; i < slots.length; i++) {
      if (slots[i]?.data?.char === '=') return i;
    }
    return -1;
  }

  _consumePlatform(slotIndex) {
    const inv = this.game.inventorySystem;
    const player = this.game.player;
    if (inv.equippedConsumables[slotIndex]?.data?.char === '=') {
      inv.equippedConsumables[slotIndex] = null;
    }
    if (player.equippedConsumables && player.equippedConsumables[slotIndex]?.data?.char === '=') {
      player.equippedConsumables[slotIndex] = null;
    }
  }

  _nearestDeepWater(room, player) {
    const px = player.position.x + CS / 2;
    const py = player.position.y + CS / 2;
    let best = null;
    let bestD = REACH * REACH;
    for (const obj of room.backgroundObjects) {
      if (!obj.deepWater || obj.destroyed) continue;
      const dx = obj.position.x + CS / 2 - px;
      const dy = obj.position.y + CS / 2 - py;
      const d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = obj; }
    }
    return best;
  }

  // Convert up to PLANK_SPAN deep-water cells into walkable planks, walking
  // away from the player in the dominant cardinal direction.
  _layPlank(room, player, startObj) {
    const startCol = Math.round(startObj.position.x / CS);
    const startRow = Math.round(startObj.position.y / CS);
    const dx = startObj.position.x - player.position.x;
    const dy = startObj.position.y - player.position.y;
    const dir = Math.abs(dx) >= Math.abs(dy)
      ? { dc: Math.sign(dx) || 1, dr: 0 }
      : { dc: 0, dr: Math.sign(dy) || 1 };

    const deepAt = new Map();
    for (const obj of room.backgroundObjects) {
      if (obj.deepWater && !obj.destroyed) {
        deepAt.set(`${Math.round(obj.position.x / CS)},${Math.round(obj.position.y / CS)}`, obj);
      }
    }

    for (let i = 0; i < PLANK_SPAN; i++) {
      const col = startCol + dir.dc * i;
      const row = startRow + dir.dr * i;
      const obj = deepAt.get(`${col},${row}`);
      if (!obj) break;
      this._toPlank(obj);
      room.collisionMap[row][col] = false;
      this._burst(obj.position.x, obj.position.y, PLANK_COLOR, 4);
    }
  }

  _toPlank(obj) {
    obj.typeId = null;
    obj.deepWater = false;
    obj.platformPlank = true;
    obj.char = '=';
    obj.originalChar = '=';
    obj.animationChar = '=';
    obj.color = PLANK_COLOR;
    obj.animationColor = PLANK_COLOR;
  }

  // ── Per-frame ─────────────────────────────────────────────────────────────

  update(deltaTime) {
    const game = this.game;
    const room = game.currentRoom;

    // Sword draw animation → spawn § beside the stone.
    if (this.drawAnim) {
      const anim = this.drawAnim;
      anim.t += deltaTime;
      const stone = anim.site.stone;
      if (Math.random() < deltaTime * 14) {
        game.particles?.push(new Particle(
          stone.position.x + CS / 2 + (Math.random() - 0.5) * 8,
          stone.position.y + CS / 2,
          '·', '#bbaaff',
          { vx: (Math.random() - 0.5) * 10, vy: -25 - Math.random() * 20 },
          0.5
        ));
      }
      if (anim.t >= DRAW_DURATION) {
        this.drawAnim = null;
        anim.site.drawn = true;
        game[anim.site.site.takenFlag] = true;
        const sword = new Item(anim.site.site.item, stone.position.x, stone.position.y - CS);
        game.items.push(sword);
        game.physicsSystem.addEntity(sword);
        stone.color = '#555560';
        stone.animationColor = '#555560';
        this._burst(stone.position.x, stone.position.y, '#bbaaff', 12);
      }
      return;
    }

    // Spectacles pickup poll — pickup splices game.items, so seen-then-gone
    // (while the site's room is active) means the player took them.
    const site = room?.keyItemSite;
    if (site?.kind === 'spectacles' && !game[site.site.takenFlag]) {
      if (game.items.includes(site.item)) site.seen = true;
      else if (site.seen) game[site.site.takenFlag] = true;
    }
  }

  _dist(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  _burst(x, y, color, count) {
    const particles = this.game.particles;
    if (!particles) return;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 15 + Math.random() * 25;
      particles.push(new Particle(
        x + CS / 2, y + CS / 2, '·', color,
        { vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 10 },
        0.4 + Math.random() * 0.3
      ));
    }
  }
}
