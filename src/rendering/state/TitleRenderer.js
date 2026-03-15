/**
 * TitleRenderer - Renders the animated title screen
 *
 * Responsibilities:
 * - Display ASCII art title with shimmer animation
 * - Fade-in effect with pulsing background
 * - Vertical "PURE ROGUE" title reveal
 * - Blinking "PRESS SPACE" prompt
 * - Version number display
 */

import { GRID, COLORS } from '../../game/GameConfig.js';

export class TitleRenderer {
  constructor(renderer) {
    this.renderer = renderer;
  }

  render(game) {
    // Render background (only if dirty)
    if (this.renderer.backgroundDirty) {
      this.renderer.clearBackground();
      this.renderer.backgroundDirty = false;
    }

    // Clear foreground
    this.renderer.clearForeground();

    // Pre-animation screen: Show button and credit before animation starts
    if (!game.introAnimationStarted) {
      this.renderPreIntroScreen(game);
      return;
    }

    // Title screen uses 60x30 grid (narrower cells for wider display)
    const TITLE_COLS = 60;
    const TITLE_CELL_WIDTH = GRID.WIDTH / TITLE_COLS; // 480 / 60 = 8px wide cells

    // Define the ASCII art title screen (60 chars wide, 30 rows)
    const titleScreen = [
      ";++xx+:....:::......:$$$&$&$$Xx+:;;;+XXXX$&&&$XXXx+$$XX...",
      "+XXXXXxxXXXx:::....+$$$&+............................&&...",
      ":X+.............++&&...........&&&&&$....................+",
      "..++++++++++++++&&.:.......................................",
      ".;......+++++..+&&.........................................",
      ":XX+.........xx&..........................................",
      "....;XX;;;::.;$&:x...................::::::::&&...........",
      ";XXxXXXX;+xx+++&...::::::........:$$$&&&&&&&&&&&&&:..;:..",
      ".+xx.::::..+++&..;&&&&&&&$xx::::&&&&&&&&&&&&&&&&&&x.x.....",
      ".+::::::;xxxx::&&&&&&$$&&$......&&&&&&$$&&&&&&&&&X........",
      ".:x:XX;XXX+Xxx::&&&&&&&&&.&&&&......$X&&&&&&x:............",
      ":::::::xxxx;xx::$:;;&$...:&&:&&&.....:...........$$$......",
      ":xxXXxx::::+++::&....::...&&::&&:.:.:::.:x;::X+.;;&&.....",
      ";X:.:::++++xxxXX&.::::;:..$&.&&.....;...+&&&&&&&;+......",
      ":xx:::+xxXxx++++xxx&$............:.x.x&&$$&&+&&+........",
      "xxxxxx++xx:+Xxxxx+X&&$XX.;..&..&.$..;:.+:$.&.X:;.......",
      ":::+++;:+::::;+++X&+:&$.$$$.$&$.&&&$.&&+;..&&+.X:........",
      ";;;X::x:++:::x:.:::++++.&&..+&&.+&&..:.....:;&.+x.......",
      ":;:::::::::::...;;;;xxxxx;;;;;;;;;::::::&&&.:X::........",
      ":XXXxxx+++;;+++++x+xx.:xxx&&$:&&$::&&..&&&:.:.:+&.........",
      ".;;xxxXXX+++++XXXXXXx$$..+X$&&$&&&$&&:::...::xx&$........",
      "xxxXXXx:+++xxxxXXXX+$&&::...............::x&X&XX..........",
      "::::::::::::..:XXXX;xx$$&&.....$$...:;&&&x&&X&::..........",
      ":XXXx;::xxxxx+X.::.::::::;$$&&&&&&&&&$$;;;...............",
      "XXx+XXXX+:::::;::::;;;:xxXXXx:+++xxxxXXXx:+++xxx.........",
      ";+;;;;+;:.::.:Xxxx::xxXXXx:+++xxxxxXXXx:+++xxx;;..........",
      "                                                            ",
      "                                                            ",
      "                                                            ",
      "                                                            "
    ];

    // Animation phases
    const SHIMMER_DURATION = 2.0;
    const FADE_START = 2.0;
    const FADE_DURATION = 3.0;
    const TITLE_START = 5.0;
    const TITLE_DURATION = 4.0;
    const PRESS_SPACE_START = 10.0;

    const time = game.titleAnimationTime;

    // Draw each line of the title screen with 60-column layout
    this.renderer.fgCtx.save();
    this.renderer.fgCtx.font = `${GRID.CELL_SIZE}px 'Unifont', monospace`;
    this.renderer.fgCtx.textAlign = 'center';
    this.renderer.fgCtx.textBaseline = 'middle';

    for (let row = 0; row < titleScreen.length && row < GRID.ROWS; row++) {
      const line = titleScreen[row];
      for (let col = 0; col < line.length && col < TITLE_COLS; col++) {
        const char = line[col];
        if (char !== ' ') {
          // Calculate position using narrower cells
          const x = col * TITLE_CELL_WIDTH + TITLE_CELL_WIDTH / 2;
          const y = row * GRID.CELL_SIZE + GRID.CELL_SIZE / 2;

          // Base color based on character density
          let baseColor = COLORS.TEXT;

          if (char === '.' || char === ':') {
            baseColor = '#444444'; // Dark
          } else if (char === ';' || char === '+') {
            baseColor = '#666666'; // Medium dark
          } else if (char === 'x' || char === 'X') {
            baseColor = '#999999'; // Medium
          } else if (char === '$' || char === '&') {
            baseColor = '#cccccc'; // Light
          }

          let color = baseColor;
          let alpha = 1.0;
          let renderChar = char;

          // Detect foreground (skull shape) vs background
          // Foreground: dense clusters (part of skull), Background: sparse/isolated chars
          // Check character density: count non-space neighbors
          let neighborCount = 0;
          for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
              if (dr === 0 && dc === 0) continue;
              const nr = row + dr;
              const nc = col + dc;
              if (nr >= 0 && nr < titleScreen.length && nc >= 0 && nc < titleScreen[nr].length) {
                if (titleScreen[nr][nc] !== ' ' && titleScreen[nr][nc] !== '.') {
                  neighborCount++;
                }
              }
            }
          }

          // Foreground = sparse areas (skull outline), Background = dense/scattered areas
          const isForeground = neighborCount < 4;

          // Phase 1: Diagonal shimmer effect with pulsing background (0.0 - 2.0s)
          if (time < SHIMMER_DURATION) {
            // Per-character random offset for non-linearity
            const randomSeed = (row * TITLE_COLS + col) * 0.1;
            const randomOffset = Math.sin(randomSeed) * 0.1;

            // Diagonal progress: top-left (0,0) to bottom-right (59,29)
            const diagonalPos = (col / TITLE_COLS + row / titleScreen.length) / 2 + randomOffset;

            // Shimmer wave position (0 to 1, sweeping across diagonal)
            const shimmerProgress = time / SHIMMER_DURATION;

            // Wave width (wider for foreground = slower rate of change)
            const waveWidth = isForeground ? 0.5 : 0.3;

            // Calculate distance from current shimmer position
            const distanceFromWave = Math.abs(diagonalPos - shimmerProgress);

            if (distanceFromWave < waveWidth) {
              // Within wave: black → dark gray → gray → dark gray → black
              const wavePos = distanceFromWave / waveWidth; // 0 at center, 1 at edge
              const shimmerIntensity = Math.cos(wavePos * Math.PI) * 0.5 + 0.5;

              // Discrete color steps
              if (shimmerIntensity > 0.66) {
                color = '#808080'; // Gray
              } else if (shimmerIntensity > 0.33) {
                color = '#404040'; // Dark gray
              } else {
                color = '#000000'; // Black
              }
            } else if (diagonalPos > shimmerProgress + waveWidth) {
              // Not reached yet: black
              color = '#000000';
            } else {
              // Passed: black
              color = '#000000';
            }

            // Background characters: constant pulsing (size changes)
            if (!isForeground) {
              const pulseSpeed = 3.0; // Fast pulsing
              const pulsePhase = (time * pulseSpeed + randomSeed) % 1.0;

              // Map characters to size variants
              if (char === '.') {
                renderChar = pulsePhase > 0.5 ? ':' : '.';
              } else if (char === ':') {
                renderChar = pulsePhase > 0.5 ? ';' : ':';
              } else if (char === ';') {
                renderChar = pulsePhase > 0.5 ? '+' : ';';
              } else if (char === '+') {
                renderChar = pulsePhase > 0.5 ? 'x' : '+';
              } else if (char === 'x') {
                renderChar = pulsePhase > 0.5 ? 'X' : 'x';
              } else if (char === 'X') {
                renderChar = pulsePhase > 0.5 ? 'x' : 'X';
              }
            }
          }
          // Phase 2: Full fade-in (2.0 - 5.0s)
          else if (time < FADE_START + FADE_DURATION) {
            const fadeProgress = (time - FADE_START) / FADE_DURATION;
            alpha = Math.min(fadeProgress, 1.0);
          }
          // Phase 3 & 4: Full opacity
          else {
            alpha = 1.0;
          }

          // Background pulsing effect (continuous through all phases)
          if (!isForeground && time >= SHIMMER_DURATION) {
            const pulseSpeed = 3.0;
            const randomSeed = (row * TITLE_COLS + col) * 0.1;
            const pulsePhase = (time * pulseSpeed + randomSeed) % 1.0;

            // Map characters to size variants
            if (char === '.') {
              renderChar = pulsePhase > 0.5 ? ':' : '.';
            } else if (char === ':') {
              renderChar = pulsePhase > 0.5 ? ';' : ':';
            } else if (char === ';') {
              renderChar = pulsePhase > 0.5 ? '+' : ';';
            } else if (char === '+') {
              renderChar = pulsePhase > 0.5 ? 'x' : '+';
            } else if (char === 'x') {
              renderChar = pulsePhase > 0.5 ? 'X' : 'x';
            } else if (char === 'X') {
              renderChar = pulsePhase > 0.5 ? 'x' : 'X';
            }
          }

          // Apply alpha to color
          if (alpha < 1.0 && time >= SHIMMER_DURATION) {
            const rgb = this.hexToRgb(baseColor);
            color = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
          }

          this.renderer.fgCtx.fillStyle = color;
          this.renderer.fgCtx.fillText(renderChar, x, y);
        }
      }
    }

    // Switch to VentureArcade for all label/title text from here on
    this.renderer.fgCtx.font = `${GRID.CELL_SIZE}px 'VentureArcade', 'Unifont', monospace`;

    // Phase 3: "PURE ROGUE" title vertical on far right (5.0 - 9.0s)
    if (time >= TITLE_START) {
      const titleProgress = Math.min((time - TITLE_START) / TITLE_DURATION, 1.0);
      const titleText = "PURE ROGUE";
      const titleLength = titleText.length;

      // Number of letters to show
      const lettersToShow = Math.floor(titleProgress * titleLength);

      // Draw letters vertically on far right
      const titleX = GRID.WIDTH - GRID.CELL_SIZE * 2;
      const titleStartY = GRID.HEIGHT / 2 - (titleLength * GRID.CELL_SIZE) / 2;

      for (let i = 0; i < lettersToShow; i++) {
        const letter = titleText[i];
        const letterY = titleStartY + i * GRID.CELL_SIZE;

        // Each letter fades in completely before next starts
        const letterFadeProgress = Math.min((titleProgress * titleLength - i), 1.0);

        this.renderer.fgCtx.fillStyle = `rgba(255, 255, 255, ${letterFadeProgress})`;
        this.renderer.fgCtx.fillText(letter, titleX, letterY);
      }
    }

    // Phase 4: "PRESS SPACE" snaps in (10.0s+) with slow on/off blink
    if (time >= PRESS_SPACE_START) {
      const buttonText = "PRESS SPACE";
      const buttonY = GRID.CELL_SIZE * 27.5; // Row 27
      const buttonX = GRID.WIDTH / 2;

      // Slow on/off blink (1.5 second period)
      const blinkPeriod = 1.5;
      const blinkOn = Math.floor((time - PRESS_SPACE_START) / blinkPeriod) % 2 === 0;

      if (blinkOn) {
        this.renderer.fgCtx.fillStyle = COLORS.ITEM;
        this.renderer.fgCtx.textAlign = 'center';
        this.renderer.fgCtx.fillText(buttonText, buttonX, buttonY);
      }

      // Store button bounds for click detection (on game instance)
      if (game && !game.launchButtonBounds) {
        const textWidth = this.renderer.fgCtx.measureText(buttonText).width;
        game.launchButtonBounds = {
          x: buttonX - textWidth / 2,
          y: buttonY - GRID.CELL_SIZE / 2,
          width: textWidth,
          height: GRID.CELL_SIZE
        };
      }
    }

    // "Created by CeruleanOak" in bottom left corner (always visible after shimmer)
    if (time >= SHIMMER_DURATION) {
      const creditAlpha = Math.min((time - SHIMMER_DURATION) / 1.0, 1.0);
      this.renderer.fgCtx.fillStyle = `rgba(128, 128, 128, ${creditAlpha * 0.6})`;
      this.renderer.fgCtx.textAlign = 'left';
      this.renderer.fgCtx.fillText('Created by CeruleanOak', GRID.CELL_SIZE, GRID.HEIGHT - GRID.CELL_SIZE);
    }

    // Version number in bottom right corner (always visible after shimmer)
    if (time >= SHIMMER_DURATION) {
      const versionAlpha = Math.min((time - SHIMMER_DURATION) / 1.0, 1.0);
      this.renderer.fgCtx.fillStyle = `rgba(128, 128, 128, ${versionAlpha * 0.6})`;
      this.renderer.fgCtx.textAlign = 'right';
      this.renderer.fgCtx.fillText('v0.3', GRID.WIDTH - GRID.CELL_SIZE, GRID.HEIGHT - GRID.CELL_SIZE);
    }

    this.renderer.fgCtx.restore();
  }

  renderPreIntroScreen(game) {
    // Pre-animation screen: centered button and credit
    this.renderer.fgCtx.save();
    this.renderer.fgCtx.font = `${GRID.CELL_SIZE}px 'VentureArcade', 'Unifont', monospace`;
    this.renderer.fgCtx.textAlign = 'center';
    this.renderer.fgCtx.textBaseline = 'middle';

    const centerX = GRID.WIDTH / 2;
    const centerY = GRID.HEIGHT / 2;

    // Blinking "PRESS SPACE" button
    const blinkPeriod = 1.0;
    const blinkOn = Math.floor(Date.now() / 1000 / blinkPeriod) % 2 === 0;

    if (blinkOn) {
      const buttonText = "CLICK TO PLAY GAME";
      this.renderer.fgCtx.fillStyle = COLORS.ITEM;
      this.renderer.fgCtx.fillText(buttonText, centerX, centerY);

      // Store button bounds for click detection
      if (!game.launchButtonBounds) {
        const textWidth = this.renderer.fgCtx.measureText(buttonText).width;
        game.launchButtonBounds = {
          x: centerX - textWidth / 2,
          y: centerY - GRID.CELL_SIZE / 2,
          width: textWidth,
          height: GRID.CELL_SIZE
        };
      }
    }

    // "Created by CeruleanOak" below the button
    this.renderer.fgCtx.fillStyle = 'rgba(128, 128, 128, 0.8)';
    this.renderer.fgCtx.fillText('Created by CeruleanOak', centerX, centerY + GRID.CELL_SIZE * 3);

    this.renderer.fgCtx.restore();
  }

  hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : { r: 255, g: 255, b: 255 };
  }
}
