/**
 * MenuInput — single source of truth for menu-style key normalization.
 *
 * Every menu-like UI (crafting/equipment/chest menus via MenuSystem, pause
 * modals like SlotReplacementSystem) supports the same control scheme: WASD
 * and arrow keys both navigate, SPACE/ENTER confirms, SHIFT is the fast
 * exit/alternate action. Consumers translate a keyboard event into one of
 * these intents and map intents to actions — they never re-read raw keys, so
 * the scheme can't drift between menus.
 *
 * @param {KeyboardEvent} e
 * @returns {'up'|'down'|'left'|'right'|'confirm'|'shift'|null}
 */
export function menuIntent(e) {
  const key = e.key.toLowerCase();
  if (key === 'w' || e.key === 'ArrowUp') return 'up';
  if (key === 's' || e.key === 'ArrowDown') return 'down';
  if (key === 'a' || e.key === 'ArrowLeft') return 'left';
  if (key === 'd' || e.key === 'ArrowRight') return 'right';
  if (key === ' ' || key === 'enter') return 'confirm';
  if (key === 'shift') return 'shift';
  return null;
}
