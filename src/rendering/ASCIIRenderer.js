import { GRID, COLORS } from '../game/GameConfig.js';

export class ASCIIRenderer {
  constructor(backgroundCanvas, foregroundCanvas) {
    this.bgCanvas = backgroundCanvas;
    this.fgCanvas = foregroundCanvas;
    this.bgCtx = backgroundCanvas.getContext('2d');
    this.fgCtx = foregroundCanvas.getContext('2d');

    // Set canvas dimensions
    this.bgCanvas.width = GRID.WIDTH;
    this.bgCanvas.height = GRID.HEIGHT;
    this.fgCanvas.width = GRID.WIDTH;
    this.fgCanvas.height = GRID.HEIGHT;

    // Configure rendering contexts
    this.setupContext(this.bgCtx);
    this.setupContext(this.fgCtx);

    this.backgroundDirty = true;
  }

  setupContext(ctx) {
    ctx.font = `bold ${GRID.CELL_SIZE}px "Courier New", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.imageSmoothingEnabled = false;
  }

  clearBackground() {
    this.bgCtx.fillStyle = COLORS.BACKGROUND;
    this.bgCtx.fillRect(0, 0, GRID.WIDTH, GRID.HEIGHT);
  }

  clearForeground() {
    this.fgCtx.clearRect(0, 0, GRID.WIDTH, GRID.HEIGHT);
  }

  // Draw grid-aligned cell (background layer)
  drawCell(x, y, char, color = COLORS.TEXT) {
    const pixelX = x * GRID.CELL_SIZE + GRID.CELL_SIZE / 2;
    const pixelY = y * GRID.CELL_SIZE + GRID.CELL_SIZE / 2;

    this.bgCtx.fillStyle = color;
    this.bgCtx.fillText(char, pixelX, pixelY);
  }

  // Draw filled cell (background layer)
  drawFilledCell(x, y, color) {
    this.bgCtx.fillStyle = color;
    this.bgCtx.fillRect(x * GRID.CELL_SIZE, y * GRID.CELL_SIZE, GRID.CELL_SIZE, GRID.CELL_SIZE);
  }

  // Draw pixel-positioned entity (foreground layer)
  drawEntity(x, y, char, color = COLORS.TEXT) {
    this.fgCtx.fillStyle = color;
    this.fgCtx.fillText(char, x, y);
  }

  // Draw text with alpha transparency (foreground layer)
  drawTextWithAlpha(x, y, text, color, alpha) {
    this.fgCtx.save();
    this.fgCtx.globalAlpha = alpha;
    this.fgCtx.fillStyle = color;
    this.fgCtx.fillText(text, x, y);
    this.fgCtx.restore();
  }

  // Draw border (grid-based, background layer)
  drawBorder(exits = { north: false, south: false, east: false, west: false }, borderColor = COLORS.BORDER) {
    const centerX = Math.floor(GRID.COLS / 2);
    const centerY = Math.floor(GRID.ROWS / 2);

    // Top and bottom borders
    for (let x = 0; x < GRID.COLS; x++) {
      // Create gap in top border for north exit
      if (!(exits.north && x === centerX)) {
        this.drawFilledCell(x, 0, borderColor);
      }
      // Create gap in bottom border for south exit
      if (!(exits.south && x === centerX)) {
        this.drawFilledCell(x, GRID.ROWS - 1, borderColor);
      }
    }

    // Left and right borders
    for (let y = 0; y < GRID.ROWS; y++) {
      // Create gap in left border for west exit
      if (!(exits.west && y === centerY)) {
        this.drawFilledCell(0, y, borderColor);
      }
      // Create gap in right border for east exit
      if (!(exits.east && y === centerY)) {
        this.drawFilledCell(GRID.COLS - 1, y, borderColor);
      }
    }
  }

  // Draw grid lines (optional, background layer)
  drawGrid() {
    this.bgCtx.strokeStyle = COLORS.GRID;
    this.bgCtx.lineWidth = 1;

    for (let x = 0; x <= GRID.COLS; x++) {
      this.bgCtx.beginPath();
      this.bgCtx.moveTo(x * GRID.CELL_SIZE, 0);
      this.bgCtx.lineTo(x * GRID.CELL_SIZE, GRID.HEIGHT);
      this.bgCtx.stroke();
    }

    for (let y = 0; y <= GRID.ROWS; y++) {
      this.bgCtx.beginPath();
      this.bgCtx.moveTo(0, y * GRID.CELL_SIZE);
      this.bgCtx.lineTo(GRID.WIDTH, y * GRID.CELL_SIZE);
      this.bgCtx.stroke();
    }
  }

  // Highlight grid cell (background layer)
  highlightCell(x, y) {
    this.bgCtx.fillStyle = COLORS.HIGHLIGHT;
    this.bgCtx.fillRect(x * GRID.CELL_SIZE, y * GRID.CELL_SIZE, GRID.CELL_SIZE, GRID.CELL_SIZE);
  }

  // Draw rectangle (foreground layer)
  drawRect(x, y, width, height, color, filled = false) {
    this.fgCtx.strokeStyle = color;
    this.fgCtx.fillStyle = color;

    if (filled) {
      this.fgCtx.fillRect(x, y, width, height);
    } else {
      this.fgCtx.strokeRect(x, y, width, height);
    }
  }

  // Draw line (foreground layer)
  drawLine(x1, y1, x2, y2, color) {
    this.fgCtx.strokeStyle = color;
    this.fgCtx.beginPath();
    this.fgCtx.moveTo(x1, y1);
    this.fgCtx.lineTo(x2, y2);
    this.fgCtx.stroke();
  }

  // Convert grid coordinates to pixel coordinates
  gridToPixel(gridX, gridY) {
    return {
      x: gridX * GRID.CELL_SIZE + GRID.CELL_SIZE / 2,
      y: gridY * GRID.CELL_SIZE + GRID.CELL_SIZE / 2
    };
  }

  // Convert pixel coordinates to grid coordinates
  pixelToGrid(pixelX, pixelY) {
    return {
      x: Math.floor(pixelX / GRID.CELL_SIZE),
      y: Math.floor(pixelY / GRID.CELL_SIZE)
    };
  }

  markBackgroundDirty() {
    this.backgroundDirty = true;
  }
}
