import { GRID, INTERACTION_RANGE } from '../game/GameConfig.js';
import { CHARACTER_TYPES } from '../data/characters.js';
import { Captive, CAGE_COLOR } from '../entities/Captive.js';
import { createDebris } from '../entities/Debris.js';
import { isCellProtected } from './roomFeatures.js';
import { tagInteriorPlane } from './PlaneSystem.js';
import { createDustCloud } from './WorldEffectsSystem.js';

const C = GRID.CELL_SIZE;

// Landing footprints, as cell radii around the cage's center: the whole 5x5
// cage, then its 3x3 hitbox, then a single cell.
const FOOTPRINT_RADII = [2, 1, 0];

/**
 * The miniboss reward: places the Captive, runs its Cage Drop and the
 * character's pacing inside the cage, and resolves the two SPACE interactions
 * (break the cage, recruit the character). Exit locking stays in ExitSystem,
 * which holds a room shut between breaking a cage and recruiting its character.
 */
export class CaptiveSystem {
  constructor(game) {
    this.game = game;
  }

  update(deltaTime) {
    const game = this.game;
    for (const captive of game.captives) {
      captive.update(deltaTime);
      if (captive.falling) {
        if (captive.updateFall(deltaTime)) this._onCageLanded(captive);
      } else if (!captive.cageDestroyed) {
        captive.updatePacing(deltaTime, game.player);
      }
    }
  }

  spawnCaptive(characterType) {
    const room = this.game.currentRoom;
    if (!room) return null;

    const cell = this._findLandingCell(room);
    if (!cell) {
      console.log('[Captive] no open cell found anywhere in room — could not spawn captive');
      return null;
    }
    return new Captive(characterType, cell.col * C, cell.row * C);
  }

  // The cell nearest the room's center whose footprint is clear, preferring
  // room for the whole cage. The miniboss reward must appear this room, since
  // zone-cleared tracking is keyed off a captive actually spawning — so the
  // last resort is any open, unprotected cell, whatever stands on it.
  _findLandingCell(room) {
    const centerCol = GRID.COLS / 2;
    const centerRow = GRID.ROWS / 2;
    const open = (col, row) => !room.collisionMap[row][col] && !isCellProtected(room, col, row);

    const cells = [];
    for (let row = 1; row < GRID.ROWS - 1; row++) {
      for (let col = 1; col < GRID.COLS - 1; col++) {
        if (open(col, row)) cells.push({ col, row });
      }
    }
    const fromCenter = (cell) => Math.hypot(cell.col - centerCol, cell.row - centerRow);
    cells.sort((a, b) => fromCenter(a) - fromCenter(b));

    const occupied = this._occupiedCells(room);
    const player = this.game.player.position;
    const playerCol = Math.floor((player.x + C / 2) / C);
    const playerRow = Math.floor((player.y + C / 2) / C);

    for (const radius of FOOTPRINT_RADII) {
      const landing = cells.find(({ col, row }) => {
        if (col - radius < 1 || col + radius > GRID.COLS - 2) return false;
        if (row - radius < 1 || row + radius > GRID.ROWS - 2) return false;
        // One cell of clearance: the cage never lands on top of the player.
        if (Math.abs(col - playerCol) <= radius + 1 && Math.abs(row - playerRow) <= radius + 1) return false;
        for (let r = row - radius; r <= row + radius; r++) {
          for (let c = col - radius; c <= col + radius; c++) {
            if (!open(c, r) || occupied.has(`${c},${r}`)) return false;
          }
        }
        return true;
      });
      if (landing) return landing;
    }
    return cells[0] ?? null;
  }

  // Every cell a standing background object's glyph touches, solid or not —
  // the cage shouldn't land on grass or water either.
  _occupiedCells(room) {
    const occupied = new Set();
    for (const obj of room.backgroundObjects) {
      if (obj.destroyed) continue;
      const c0 = Math.floor(obj.position.x / C);
      const c1 = Math.floor((obj.position.x + C - 1) / C);
      const r0 = Math.floor(obj.position.y / C);
      const r1 = Math.floor((obj.position.y + C - 1) / C);
      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) occupied.add(`${c},${r}`);
      }
    }
    return occupied;
  }

  _onCageLanded(captive) {
    const game = this.game;
    game.renderController?.screenShake.trigger(6, 0.25);
    createDustCloud(game, captive.position.x + C / 2, captive.position.y + C, {
      count: 28,
      spread: C * 2.5
    });
    game.audioSystem.playSFX('cage_slam');
  }

  _breakCage(captive) {
    const game = this.game;
    const centerX = captive.position.x + C / 2;
    const centerY = captive.position.y + C / 2;

    // Every bar flies off from where it stood, popping up before it drops.
    for (const bar of captive.getCageBars()) {
      const angle = Math.atan2(bar.y - centerY, bar.x - centerX);
      const speed = 60 + Math.random() * 80;
      const life = 0.6 + Math.random() * 0.3;
      game.particles.push(tagInteriorPlane(game, {
        x: bar.x,
        y: bar.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - (40 + Math.random() * 40),
        gravity: 260,
        life,
        maxLife: life,
        char: bar.char,
        color: CAGE_COLOR
      }));
    }

    const cageDebris = createDebris(captive.position.x, captive.position.y, 12, CAGE_COLOR);
    for (const piece of cageDebris) game.debris.push(tagInteriorPlane(game, piece));

    createDustCloud(game, centerX, centerY + C, { count: 12, spread: C * 2 });
    game.renderController?.screenShake.trigger(3, 0.15);
    game.audioSystem.playSFX('cage_break');

    captive.breakOpen();
  }

  checkCaptiveInteraction() {
    const game = this.game;
    if (!game.captives || game.captives.length === 0) return false;

    for (const captive of game.captives) {
      if (captive.freed || captive.falling) continue;

      const dist = Math.hypot(
        game.player.position.x - captive.position.x,
        game.player.position.y - captive.position.y
      );

      if (dist < INTERACTION_RANGE * 2) {
        if (!captive.cageDestroyed) {
          // First interaction: destroy the cage
          this._breakCage(captive);

          game.captiveInteractionThisFrame = true;
          return true;
        } else {
          // Second interaction: recruit the character
          captive.freed = true;
          game.unlockedCharacters.push(captive.characterType);
          const charData = CHARACTER_TYPES[captive.characterType];
          game.showPickupMessage(`${charData.name} obtained`);
          game.saveGameState();

          game.captiveInteractionThisFrame = true;
          return true;
        }
      }
    }
    return false;
  }
}
