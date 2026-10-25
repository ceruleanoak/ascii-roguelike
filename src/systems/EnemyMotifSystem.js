import { GAME_STATES } from '../game/GameConfig.js';
import { ENEMIES } from '../data/enemies.js';

// Every Motif authored in enemy data, one per name. Giving an enemy type a
// Motif is a bounce at public/assets/audio/motif-<name>.mp3 plus
// `motif: { name, bars }` on its ENEMIES entry — no code. `bars` is the
// phrase length (2 or 4); the bounce can run longer (a release tail, a
// 4-bar export of a 2-bar melody) and everything past it is never heard.
const MOTIFS = [...new Map(
  Object.values(ENEMIES).filter(data => data.motif).map(data => [data.motif.name, data.motif])
).values()];

/**
 * EnemyMotifSystem — loops an enemy type's Motif (GLOSSARY: Motif) while the
 * camera is zoomed in and that type is in the zoomed frame.
 *
 * Each frame it works out which Motifs should be sounding: the `motif` of
 * every live enemy on the player's layer that CameraZoomSystem counts as
 * on-screen, while the zoom is engaged in EXPLORE. AudioSystem then starts
 * the new ones and cuts the rest. Two types in frame layer two voices, and
 * each cuts on its own the moment its last enemy leaves the frame (or the
 * zoom releases). Timing — entering on the next bar, in phase with the music
 * — is AudioSystem's job (startMotif).
 *
 * Holds no run state: the wanted set is rebuilt from the world every frame,
 * so death, REST, title, and room exits all fall out as "nothing wanted".
 * Runs unconditionally (like CameraZoomSystem) so it sees those exits.
 */
export class EnemyMotifSystem {
  constructor(game) {
    this.game = game;
    // The AudioContext the Motifs were last loaded into. AudioSystem builds
    // a fresh context on each loadMusic (demo → title → launch), which drops
    // its decoded buffers, so a new context means load again.
    this._loadedContext = null;
  }

  update() {
    const audio = this.game.audioSystem;
    if (!audio?.audioContext) return;
    this._ensureLoaded(audio);

    const wanted = this._motifsInFrame();
    for (const name of audio.activeMotifs()) {
      if (!wanted.has(name)) audio.stopMotif(name);
    }
    for (const name of wanted) audio.startMotif(name);
    audio.tickMotifs();
  }

  _ensureLoaded(audio) {
    if (this._loadedContext === audio.audioContext || MOTIFS.length === 0) return;
    this._loadedContext = audio.audioContext;
    audio.loadMotifs(import.meta.env.BASE_URL, MOTIFS);
  }

  /** Motif names of the enemy types visible in the engaged zoom frame. */
  _motifsInFrame() {
    const wanted = new Set();
    const game = this.game;
    const zoom = game.cameraZoomSystem;
    if (game.stateMachine.getCurrentState() !== GAME_STATES.EXPLORE || !zoom.isZoomEngaged()) {
      return wanted;
    }
    for (const enemy of zoom.activeLayerEntities()) {
      const motif = enemy.data?.motif?.name;
      if (!motif || wanted.has(motif)) continue;
      if (enemy.hp !== undefined && enemy.hp <= 0) continue;
      if (zoom.isEntityOnScreen(enemy)) wanted.add(motif);
    }
    return wanted;
  }
}
