import { GRID } from '../game/GameConfig.js';
import { BackgroundObject } from '../entities/BackgroundObject.js';

/**
 * PearlSystem — the O-room pearl-pedestal side path (secret blue-zone entry)
 * and its downstream Pearl Cache pedestal. Both are SPACE-activated: the
 * O-room pedestal consumes a Pearl and opens a hidden blue-zone east exit;
 * the Pearl Cache pedestal (reached only via that path) drops a recipe-
 * rebundle and opens the return west exit back to the player's origin zone.
 *
 * revealPearlPedestal() is called externally from ExitSystem when a room
 * clears with the guide fairy still in play. The two handlePearlXSpace()
 * methods are wired from main.js's handleSpacePress() dispatch chain.
 */
export class PearlSystem {
  constructor(game) {
    this.game = game;
  }

  // SPACE while adjacent to a revealed pearl pedestal: consume the pearl from
  // inventory, mark the pedestal activated (pearl glyph appears on top), open
  // the previously-blocked east exit as a blue-zone slot, and dismiss the
  // fairy. Returns true if the press was consumed.
  handlePearlPedestalSpace() {
    const game = this.game;
    const room = game.currentRoom;
    const pedestal = room?.pearlPedestal;
    if (!pedestal || pedestal.activated) return false;
    if (!game.hasIngredient('●')) return false;

    const CS = GRID.CELL_SIZE;
    const px = game.player.position.x + CS / 2;
    const py = game.player.position.y + CS / 2;
    const dx = px - pedestal.x;
    const dy = py - pedestal.y;
    // Adjacency: within ~1.5 cells of the pedestal center
    if (dx * dx + dy * dy > (CS * 1.5) * (CS * 1.5)) return false;

    game.removeIngredient('●');
    pedestal.activated = true;
    // Visually crown the pedestal with the pearl glyph by swapping the bg char.
    if (pedestal.obj) {
      pedestal.obj.char = '●';
      pedestal.obj.color = '#f4f4f8';
    }

    // Open the east exit (normally blocked by the ocean template). Mark it as
    // a hidden blue-zone slot so future zone routing can pick it up. The
    // letter '~' echoes the water motif; color is blue.
    room.exits.east = {
      letter: '~',
      color: '#66aaff',
      secretBlueZone: true
    };
    game.updateExitCollisions();
    game.renderer.markBackgroundDirty();

    // Visual shockwave centered on the freshly opened east exit — sweeps the
    // sand/water tiles around it, producing a rippling reveal.
    const exitCx = (GRID.COLS - 2) * GRID.CELL_SIZE + GRID.CELL_SIZE / 2;
    const exitCy = Math.floor(GRID.ROWS / 2) * GRID.CELL_SIZE + GRID.CELL_SIZE / 2;
    game.playerShockwave = {
      x: exitCx,
      y: exitCy,
      radius: 0, prevRadius: 0,
      maxRadius: GRID.CELL_SIZE * 6,
      speed: GRID.CELL_SIZE * 10,
      color: '#66aaff',
    };

    // Dismiss the guide fairy — its job is done. Send it offscreen east.
    const fairy = room.pearlFairy;
    if (fairy && !fairy.consumed) {
      fairy.state = 'exited';
      fairy.targetPosition = {
        x: GRID.COLS * CS + CS * 2,
        y: pedestal.y
      };
    }

    game.audioSystem?.playSFX?.('pickup');
    game.menuSystem?.showPickupMessage?.('THE PATH OPENS.');
    game.updateUI();
    return true;
  }

  // Pearl Cache pedestal (blue-zone Pearl Cache, '◌' room). SPACE while
  // adjacent drops the recipe-rebundle: 2× Pearl Shard + 1× Sharkbone + 1×
  // Coral Cluster + 1× Stingray Barb. Player can craft any of the three
  // water armors back in Rest. Returns true if the press was consumed.
  handlePearlCachePedestalSpace() {
    const game = this.game;
    const room = game.currentRoom;
    const pedestal = room?.pearlCachePedestal;
    if (!pedestal || pedestal.activated) return false;

    const CS = GRID.CELL_SIZE;
    const px = game.player.position.x + CS / 2;
    const py = game.player.position.y + CS / 2;
    const dx = px - pedestal.x;
    const dy = py - pedestal.y;
    if (dx * dx + dy * dy > (CS * 1.5) * (CS * 1.5)) return false;

    pedestal.activated = true;
    if (pedestal.obj) {
      pedestal.obj.char = '●';
      pedestal.obj.color = '#f4f4f8';
    }

    // Drop the bundle straight into the ingredient pile.
    const bundle = ['p', 'p', 'n', 'C', 'Y'];
    for (const ch of bundle) {
      game.addIngredient(ch);
    }

    // Open the west exit so the player can return to an O room in whatever
    // zone they came from. Without this the Pearl Cache is a dead end (north
    // is killed by the blue-zone template, south retreats to Rest only).
    const originZone = game.blueZoneOriginZone || 'green';
    room.exits.west = {
      letter: 'O',
      color: '#66aaff',
      returnFromBlueZone: true,
      forceZone: originZone
    };
    game.updateExitCollisions();

    game.audioSystem?.playSFX?.('pickup');
    game.menuSystem?.showPickupMessage?.('THE DEEP GIVES.');
    game.updateUI();
    game.renderer.markBackgroundDirty();
    return true;
  }

  // O-room pearl path: room cleared with the guide fairy still in play. Place
  // a pedestal in an open dry-side cell and tether the fairy to it so the
  // player has a tangible "press SPACE here" beacon. No pedestal if the fairy
  // was already consumed (heal or bottle) or the player no longer has a pearl.
  revealPearlPedestal() {
    const game = this.game;
    const room = game.currentRoom;
    if (!room) return;
    if (game.fairiesAngered) return; // no fairy to reveal the pedestal
    const fairy = room.pearlFairy;
    if (!fairy || fairy.consumed) return;
    if (room.pearlPedestal) return; // already revealed
    if (!game.hasIngredient('●')) return;

    const CS = GRID.CELL_SIZE;
    // Search dry-side cells (cols 12-16) for an open, non-water spot near
    // mid-vertical. Walk outward from a preferred center until we find one.
    const preferredCols = [14, 13, 15, 12, 16];
    const preferredRows = [10, 9, 11, 8, 12, 7, 13];
    let placed = null;
    for (const c of preferredCols) {
      for (const r of preferredRows) {
        if (room.collisionMap?.[r]?.[c]) continue;
        const x = c * CS;
        const y = r * CS;
        const occupied = room.backgroundObjects.some(o =>
          !o.destroyed && Math.abs(o.position.x - x) < CS / 2 && Math.abs(o.position.y - y) < CS / 2
        );
        if (occupied) continue;
        placed = { col: c, row: r, x, y };
        break;
      }
      if (placed) break;
    }
    if (!placed) return;

    const pedestal = new BackgroundObject('∏', placed.x, placed.y);
    pedestal.color = '#cccccc';
    pedestal.pearlPedestal = true;
    pedestal.hasCollision = true;
    room.collisionMap[placed.row][placed.col] = true;
    room.backgroundObjects.push(pedestal);
    game.renderer.markBackgroundDirty();

    room.pearlPedestal = {
      col: placed.col,
      row: placed.row,
      x: placed.x + CS / 2,
      y: placed.y + CS / 2,
      activated: false,
      obj: pedestal
    };

    // Anchor the fairy over the pedestal. flutterDuration was set huge at
    // spawn, so it will keep oscillating here until SPACE'd or consumed.
    fairy.anchor.x = placed.x + CS / 2;
    fairy.anchor.y = placed.y - CS * 0.5; // hover slightly above
    fairy.position.x = fairy.anchor.x;
    fairy.position.y = fairy.anchor.y;
    fairy.flutterRadius = 10;
    fairy.flutterElapsed = 0;
  }
}
