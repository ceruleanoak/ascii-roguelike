// Goo body geometry — the drawn size of a Slime / Giant Slime 'o' and the
// hitbox that covers it. ExploreRenderer draws at gooFontSize() and
// Enemy.getHitbox() measures the body from the same number, so what the
// player sees and what takes hits can't drift apart.

import { GRID } from '../game/GameConfig.js';

// Unifont 'o' ink bounds as fractions of font size, relative to the draw point
// (textAlign center, textBaseline middle) — measured with canvas measureText.
// The ink sits low: 1/8 above the draw point, 3/8 below.
const O_GLYPH_BODY = { halfWidth: 0.1875, above: 0.125, below: 0.375 };

// Goo-affinity render scale: Slime and Giant Slime render at a size that
// tracks current HP — a Giant Slime split child (registerSplitChild sets
// its hp to the damage the boss just took, uncapped by maxHp) reads as a
// chunk sized to match the hit that knocked it off. 1-2 HP is the original
// design size (never smaller); every HP above that scales the glyph up.
// sqrt keeps rendered AREA roughly proportional to HP rather than just
// glyph height; capped so an outlier one-hit chunk doesn't blow out the layout.
export function gooRenderScale(enemy) {
  if (!enemy.data?.affinities?.includes('goo')) return 1;
  const hp = Math.max(0, enemy.hp);
  return Math.min(2.5, Math.max(1, Math.sqrt(hp / 2)));
}

// The Giant Slime is a 3x 'o' that squashes during its leap windup so the
// player reads the telegraph.
function isGiantSlime(enemy) {
  return !!enemy.data?.splitOnDamage?.enabled;
}

// Font size (px) the goo body 'o' is drawn at.
export function gooFontSize(enemy) {
  const scale = gooRenderScale(enemy);
  if (!isGiantSlime(enemy)) return Math.round(GRID.CELL_SIZE * scale);
  const windup = enemy.data.leapAttack?.windupTime || 1;
  const squash = enemy.leapWindupActive ? Math.min(0.85, 1 - (enemy.leapWindupTimer / windup) * 0.15) : 1;
  return GRID.CELL_SIZE * 3 * squash * scale;
}

// Goo bodies are drawn as an HP-scaled 'o' — up to 7.5 cells tall for the
// Giant Slime — but the one-cell box only covered the glyph's top: the 'o'
// sits low in its em box, so the lower body took no hits. Returns `cellBox`
// grown to cover the drawn body (never shrunk; a 1-HP Slime's 'o' is smaller
// than a cell), lifted with the body during a leap arc. Bodies drawn as
// anything but the 'o' (GooDragon shares the goo affinity) keep the cell box.
export function gooBodyHitbox(enemy, cellBox) {
  if (!enemy.data?.affinities?.includes('goo')) return cellBox;
  if (!isGiantSlime(enemy) && enemy.displayChar !== 'o') return cellBox;
  const box = { ...cellBox, y: cellBox.y - (enemy.leapArcLift || 0) };
  const size = gooFontSize(enemy);
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const left = Math.min(box.x, cx - size * O_GLYPH_BODY.halfWidth);
  const right = Math.max(box.x + box.width, cx + size * O_GLYPH_BODY.halfWidth);
  const top = Math.min(box.y, cy - size * O_GLYPH_BODY.above);
  const bottom = Math.max(box.y + box.height, cy + size * O_GLYPH_BODY.below);
  return { x: left, y: top, width: right - left, height: bottom - top };
}
