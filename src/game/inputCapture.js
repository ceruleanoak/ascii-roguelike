// Single source of truth for "a modal/menu is currently capturing keyboard
// input". Every independent window-level key listener must gate on this
// instead of re-enumerating suppression conditions — the enumeration always
// drifts (bug #142: DiagonalInputSystem missed the cheat-menu gate that
// main.js's own handler had, so dodge rolls fired during warp-letter capture).
export function isInputCaptured(game) {
  return Boolean(
    game?.player?.polymorphed ||
    game?.cheatMenu?.isOpen ||
    game?.menuOpen ||
    game?.pauseSystem?.isPaused()
  );
}
